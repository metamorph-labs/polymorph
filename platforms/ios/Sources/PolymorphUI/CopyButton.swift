// CopyButton (`design/components/copy-button.md`): a Button preset that
// copies a value to the clipboard. Button's ghost/neutral icon-only cell in
// every state, the `copy` glyph at rest. A press writes `value` to the general
// pasteboard exactly as given, then for two seconds the glyph is `confirm` in
// `success.text`, the one status colour this member uses, and `copiedLabel` is
// announced; a press in that time copies again and restarts it. The swap
// fades over the control duration, at once under Reduce Motion.
//
// The button is named by `label` and reports the copied state as its value
// while it lasts. There is no `lg`, because a copy control is secondary, and
// no `onCopy`: writing the clipboard is the whole outcome.

import PolymorphTokens
import SwiftUI

public struct PMCopyButton: PMCopyButtonRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var copied = false
  @State private var press = 0
  private let props: PMCopyButtonProps

  public init(props: PMCopyButtonProps) {
    self.props = props
  }

  public var body: some View {
    let size: PMControlSize = props.size == .sm ? .sm : .md
    let disabled = props.disabled ?? false
    let motion = theme.defaultMotion

    Button {
      copy()
    } label: {
      ZStack {
        PMIconView(.copy, size: size).opacity(copied ? 0 : 1)
        PMIconView(.confirm, size: size)
          .foregroundStyle(theme.colors.successText.color)
          .opacity(copied ? 1 : 0)
      }
      .animation(
        reduceMotion ? nil : motion.easing.standard.animation(duration: motion.duration.control),
        value: copied)
    }
    .buttonStyle(
      PMButtonStyle(
        appearance: .ghostNeutral, controlSize: size, iconOnly: true, loading: false, on: false)
    )
    .disabled(disabled)
    .accessibilityLabel(Text(props.label))
    .modifier(PMCopiedValue(copied: copied ? props.copiedLabel : nil))
    .pmMember("CopyButton", attributes(size, disabled: disabled))
  }

  /// Writes the value, confirms, and reverts two seconds after the last press.
  private func copy() {
    PMClipboard.copy(props.value)
    copied = true
    press += 1
    let mine = press
    AccessibilityNotification.Announcement(props.copiedLabel).post()
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(Int(PMSpecDefault.copyFeedbackMs)))
      if press == mine { copied = false }
    }
  }

  private func attributes(_ size: PMControlSize, disabled: Bool) -> [String: String] {
    var attributes = [
      "variant": "ghost", "tone": "neutral", "size": size.rawValue, "icon-only": "true",
    ]
    if copied { attributes["state"] = "copied" }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// While copied, the button's value is the confirmation.
private struct PMCopiedValue: ViewModifier {
  let copied: String?

  func body(content: Content) -> some View {
    if let copied {
      content.accessibilityValue(Text(copied))
    } else {
      content
    }
  }
}

/// CopyButton's states, from the spec's States table. The copied state
/// follows a press, so it has no entry, as on the web.
public struct CopyButtonStates: PMStates {
  public let member = "CopyButton"

  public init() {}

  private static let command = "pnpm add @polymorph/react-ui"
  private static let label = "Copy install command"
  private static let copied = "Copied"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("rest", expect: ["size": "md", "icon-only": "true", "label": Self.label]) {
        PMCopyButton(
          props: PMCopyButtonProps(copiedLabel: Self.copied, label: Self.label, value: Self.command))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMCopyButton(
          props: PMCopyButtonProps(
            copiedLabel: Self.copied, label: Self.label, size: .sm, value: Self.command))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMCopyButton(
          props: PMCopyButtonProps(
            copiedLabel: Self.copied, disabled: true, label: Self.label, value: Self.command))
      },
    ]
  }
}
