import ExpoModulesCore

final class NativeTerminalProps: ExpoSwiftUI.ViewProps {
  @Field var hostUrl: String?
  @Field var webSocketUrl: String?
  @Field var token: String?
  @Field var workspaceId: String?
  @Field var terminalId: String?
  @Field var title: String?
  @Field var subtitle: String?
  @Field var connectionState: String = "idle"
  @Field var readOnly: Bool = true
  var onReady = EventDispatcher()
  var onConnectionStateChange = EventDispatcher()
  var onData = EventDispatcher()
}
