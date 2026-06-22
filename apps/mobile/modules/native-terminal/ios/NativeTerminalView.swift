import SwiftUI
import ExpoModulesCore

@MainActor
private final class NativeTerminalConnection: ObservableObject {
  @Published private(set) var state: String = "idle"
  @Published private(set) var receivedBytes: Int = 0
  @Published private(set) var lastError: String?

  var onStateChange: ((String) -> Void)?
  var onData: ((_ frameType: String, _ byteCount: Int, _ totalBytes: Int) -> Void)?

  private var activeURLString: String?
  private var socketTask: URLSessionWebSocketTask?
  private var generation = 0

  func configure(webSocketUrl: String?) {
    let nextURLString = webSocketUrl?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let nextURLString, !nextURLString.isEmpty else {
      disconnect(setState: "idle")
      return
    }

    if activeURLString == nextURLString, socketTask != nil {
      return
    }

    disconnect(setState: nil)

    guard let url = URL(string: nextURLString) else {
      setState("error")
      lastError = "Invalid terminal WebSocket URL"
      return
    }

    activeURLString = nextURLString
    receivedBytes = 0
    lastError = nil
    generation += 1
    let currentGeneration = generation
    let task = URLSession.shared.webSocketTask(with: url)
    socketTask = task
    setState("connecting")
    task.resume()
    setState("live")
    receiveNext(task: task, generation: currentGeneration)
  }

  func disconnect(setState nextState: String? = "idle") {
    generation += 1
    socketTask?.cancel(with: .goingAway, reason: nil)
    socketTask = nil
    activeURLString = nil
    if let nextState {
      setState(nextState)
    }
  }

  private func receiveNext(task: URLSessionWebSocketTask, generation expectedGeneration: Int) {
    task.receive { [weak self] result in
      Task { @MainActor in
        self?.handleReceive(result, task: task, generation: expectedGeneration)
      }
    }
  }

  private func handleReceive(
    _ result: Result<URLSessionWebSocketTask.Message, Error>,
    task: URLSessionWebSocketTask,
    generation expectedGeneration: Int
  ) {
    guard expectedGeneration == generation, task === socketTask else {
      return
    }

    switch result {
    case .success(let message):
      switch message {
      case .data(let data):
        recordFrame(frameType: "binary", byteCount: data.count)
      case .string(let text):
        recordFrame(frameType: "text", byteCount: text.utf8.count)
      @unknown default:
        break
      }
      receiveNext(task: task, generation: expectedGeneration)
    case .failure(let error):
      lastError = error.localizedDescription
      socketTask = nil
      activeURLString = nil
      setState("error")
    }
  }

  private func recordFrame(frameType: String, byteCount: Int) {
    receivedBytes += byteCount
    onData?(frameType, byteCount, receivedBytes)
  }

  private func setState(_ nextState: String) {
    guard state != nextState else {
      return
    }
    state = nextState
    onStateChange?(nextState)
  }
}

struct NativeTerminalView: ExpoSwiftUI.View {
  @ObservedObject var props: NativeTerminalProps
  @StateObject private var connection = NativeTerminalConnection()

  init(props: NativeTerminalProps) {
    self.props = props
  }

  var body: some View {
    let hasNativeAttach = hasNativeAttachURL
    let displayConnectionState = hasNativeAttach ? connection.state : props.connectionState

    NativeTerminalPlaceholderView(
      title: props.title,
      subtitle: props.subtitle,
      webSocketUrl: props.webSocketUrl,
      terminalId: props.terminalId,
      workspaceId: props.workspaceId,
      connectionState: displayConnectionState,
      receivedBytes: hasNativeAttach ? connection.receivedBytes : nil,
      lastError: hasNativeAttach ? connection.lastError : nil,
      readOnly: props.readOnly
    )
    .onAppear {
      installEventHandlers()
      props.onReady([:])
      syncConnection()
      props.onConnectionStateChange(["state": displayConnectionState])
    }
    .onChange(of: props.connectionState) { newValue in
      guard !hasNativeAttachURL else {
        return
      }
      props.onConnectionStateChange(["state": newValue])
    }
    .onChange(of: props.webSocketUrl) { _ in
      syncConnection()
    }
    .onDisappear {
      connection.disconnect()
    }
  }

  private var hasNativeAttachURL: Bool {
    guard let webSocketUrl = props.webSocketUrl else {
      return false
    }
    return !webSocketUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private func installEventHandlers() {
    connection.onStateChange = { state in
      props.onConnectionStateChange(["state": state])
    }
    connection.onData = { frameType, byteCount, totalBytes in
      props.onData([
        "frameType": frameType,
        "byteCount": byteCount,
        "totalBytes": totalBytes
      ])
    }
  }

  private func syncConnection() {
    guard hasNativeAttachURL else {
      connection.disconnect()
      return
    }
    connection.configure(webSocketUrl: props.webSocketUrl)
  }
}

private struct NativeTerminalPlaceholderView: View {
  let title: String?
  let subtitle: String?
  let webSocketUrl: String?
  let terminalId: String?
  let workspaceId: String?
  let connectionState: String
  let receivedBytes: Int?
  let lastError: String?
  let readOnly: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .center, spacing: 8) {
        Circle()
          .fill(statusColor)
          .frame(width: 8, height: 8)
        Text(displayTitle)
          .font(.system(size: 13, weight: .semibold, design: .monospaced))
          .foregroundStyle(Color(red: 0.86, green: 0.86, blue: 0.89))
          .lineLimit(1)
        Spacer(minLength: 0)
        Text(readOnly ? "VIEW" : "CONTROL")
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(Color(red: 0.58, green: 0.58, blue: 0.64))
      }

      Text(statusText)
        .font(.system(size: 12, weight: .regular, design: .monospaced))
        .foregroundStyle(Color(red: 0.58, green: 0.58, blue: 0.64))
        .lineLimit(2)

      Text(displaySubtitle)
        .font(.system(size: 12, weight: .regular, design: .monospaced))
        .foregroundStyle(Color(red: 0.42, green: 0.42, blue: 0.48))
        .lineLimit(2)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color(red: 0.02, green: 0.02, blue: 0.03))
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(displayTitle), \(connectionState)")
  }

  private var displayTitle: String {
    if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return title
    }
    return terminalId.map { "Terminal \($0.prefix(8))" } ?? "Terminal"
  }

  private var displaySubtitle: String {
    if let subtitle, !subtitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return subtitle
    }
    if let workspaceId {
      return "Workspace \(workspaceId.prefix(8))"
    }
    if let webSocketUrl, !webSocketUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "Relay terminal websocket ready"
    }
    return "Awaiting Superset host terminal session"
  }

  private var statusText: String {
    if let lastError, !lastError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "Terminal stream error"
    }
    if let receivedBytes, receivedBytes > 0 {
      return "Terminal stream receiving"
    }
    if let webSocketUrl, !webSocketUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return connectionState == "live" ? "Terminal stream connected" : "Connecting terminal stream"
    }
    return "Awaiting terminal stream"
  }

  private var statusColor: Color {
    switch connectionState {
    case "live":
      return Color(red: 0.19, green: 0.80, blue: 0.46)
    case "connecting", "reconnecting":
      return Color(red: 0.96, green: 0.74, blue: 0.25)
    case "offline", "error", "exited":
      return Color(red: 0.96, green: 0.28, blue: 0.28)
    default:
      return Color(red: 0.45, green: 0.45, blue: 0.50)
    }
  }
}
