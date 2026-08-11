import ExpoModulesCore

public final class ComposerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Composer")

    View(ComposerView.self) {
      Events(
        "onSubmitText", "onChangeText", "onFocusChange", "onQuickKey",
        "onBarMetrics")

      Prop("placeholder") { (view: ComposerView, value: String) in
        view.placeholder = value
      }

      Prop("autoFocus") { (view: ComposerView, value: Bool) in
        view.autoFocus = value
      }

      Prop("quickKeys") { (view: ComposerView, value: [QuickKey]) in
        view.quickKeys = value
      }

      AsyncFunction("focusInput") { (view: ComposerView) in
        view.focusInput()
      }.runOnQueue(.main)

      AsyncFunction("blurInput") { (view: ComposerView) in
        view.blurInput()
      }.runOnQueue(.main)

      AsyncFunction("clearText") { (view: ComposerView) in
        view.clearText()
      }.runOnQueue(.main)
    }
  }
}
