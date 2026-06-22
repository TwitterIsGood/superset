import ExpoModulesCore

public final class NativeTerminalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeTerminal")
    View(NativeTerminalView.self)
  }
}
