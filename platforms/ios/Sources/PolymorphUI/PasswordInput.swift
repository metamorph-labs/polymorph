// PasswordInput (`design/components/password-input.md`): an Input preset for
// passwords, with a reveal toggle. Input's container in every state
// (`PMFieldBox`), at Input's sizes, and in its trailing corner the toggle, the
// clear button's embedded-adornment recipe unchanged: the `visible` glyph
// while the password is masked, `hidden` while it is shown, crossfading over
// the control duration, muted at rest and never in danger colours, because it
// is an action, not a status. It is always there, even on an empty field, so
// the frame never jumps.
//
// Masking flips without losing anything: the secure field and the plain one
// share one value, and the reveal moves focus from one to the other, so the
// text, the keyboard and the password manager's content type are kept. The
// content type is `autoComplete`'s, the current password unless the screen
// signs someone up (`newPassword`); a revealed password is never corrected or
// capitalised. Visibility is the member's own state, by design. A disabled
// field disables the toggle; a read-only one keeps it, because revealing is
// not editing, and shows the value as selectable text.
//
// The toggle is named by `toggleLabel` and reports itself pressed while the
// password shows, as `aria-pressed` does. The field is named by `ariaLabel` or
// its FormField's label and says "Invalid" first in its hint while invalid.
// `name`, `id` and the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMPasswordInput: PMPasswordInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @FocusState private var focus: PMPasswordFocus?
  @State private var draft: String
  @State private var revealed = false
  private let props: PMPasswordInputProps

  public init(props: PMPasswordInputProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? "")
  }

  public var body: some View {
    let size = props.size ?? .md
    let metrics = PMControlMetrics(size, theme)
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let colors = theme.colors
    let motion = theme.defaultMotion
    let autoComplete = (props.autoComplete ?? .currentPassword).rawValue

    HStack(spacing: metrics.gap) {
      ZStack(alignment: .leading) {
        if readOnly {
          // A read-only value is selectable text, masked until revealed.
          Text(revealed ? text.wrappedValue : String(repeating: "•", count: text.wrappedValue.count))
            .lineLimit(1)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel(Text(name ?? ""))
        } else {
          SecureField(name ?? "", text: text, prompt: prompt)
            .focused($focus, equals: .masked)
            .opacity(revealed ? 0 : 1)
            .accessibilityHidden(revealed)
          TextField(name ?? "", text: text, prompt: prompt)
            .focused($focus, equals: .shown)
            .opacity(revealed ? 1 : 0)
            .accessibilityHidden(!revealed)
        }
      }
      .textFieldStyle(.plain)
      .disabled(disabled)
      .tint(colors.accentText.color)
      .modifier(PMTextEntry(type: .password, autoComplete: autoComplete))
      .pmEntryName(name)
      .pmFieldHint(invalid: invalid, field?.hint)
      Button {
        toggle()
      } label: {
        ZStack {
          PMIconView(.visible, size: size).opacity(revealed ? 0 : 1)
          PMIconView(.hidden, size: size).opacity(revealed ? 1 : 0)
        }
        .animation(
          reduceMotion ? nil : motion.easing.standard.animation(duration: motion.duration.control),
          value: revealed)
      }
      .buttonStyle(PMEmbeddedButtonStyle(side: metrics.height))
      .disabled(disabled)
      .accessibilityLabel(Text(props.toggleLabel))
      .accessibilityAddTraits(revealed ? [.isToggle, .isSelected] : .isToggle)
    }
    .pmTextStyle(metrics.text)
    .foregroundStyle(
      (disabled ? colors.textDisabled : readOnly ? colors.textSecondary : colors.textPrimary).color
    )
    .padding(.leading, metrics.padding)
    .frame(maxWidth: .infinity, minHeight: metrics.height)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: readOnly, focused: focus != nil))
    .pmHitTarget()
    // A tap in the field's hit area focuses the field; the toggle keeps its
    // own tap, so revealing does not raise the keyboard.
    .pmOpensOnTap(!disabled && !readOnly) { focus = revealed ? .shown : .masked }
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember(
      "PasswordInput",
      attributes(size, invalid: invalid, disabled: disabled, readOnly: readOnly))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  private var prompt: Text? {
    props.placeholder.map { Text($0).foregroundStyle(theme.colors.textMuted.color) }
  }

  /// The controlled `value` when given, otherwise the field's own.
  private var text: Binding<String> {
    Binding {
      props.value ?? draft
    } set: { next in
      draft = next
      props.onChange?(next)
    }
  }

  private var name: String? {
    props.ariaLabel ?? field?.label ?? props.placeholder
  }

  /// Flips the masking and keeps focus where the person was typing.
  private func toggle() {
    let typing = focus != nil
    revealed.toggle()
    if typing { focus = revealed ? .shown : .masked }
  }

  private func attributes(_ size: PMControlSize, invalid: Bool, disabled: Bool, readOnly: Bool)
    -> [String: String]
  {
    var attributes = ["size": size.rawValue, "state": revealed ? "visible" : "hidden"]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    return attributes
  }
}

/// Which of the two fields holds focus.
private enum PMPasswordFocus: Hashable {
  case masked
  case shown
}

/// PasswordInput's states, from the spec's States table. The revealed state
/// exists only after a press, so it has no entry, as on the web.
public struct PasswordInputStates: PMStates {
  public let member = "PasswordInput"

  public init() {}

  private static let toggle = "Show password"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("rest", expect: ["state": "hidden", "size": "md"]) {
        PMPasswordInput(props: PMPasswordInputProps(ariaLabel: "Password", toggleLabel: Self.toggle))
      },
      PMStateEntry("with value — masked", expect: ["state": "hidden"]) {
        PMPasswordInput(
          props: PMPasswordInputProps(
            ariaLabel: "Password", defaultValue: "hunter2", toggleLabel: Self.toggle))
      },
      PMStateEntry("new password — for sign-up", expect: ["state": "hidden"]) {
        PMPasswordInput(
          props: PMPasswordInputProps(
            ariaLabel: "New password", autoComplete: .newPassword,
            placeholder: "At least twelve characters", toggleLabel: Self.toggle))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMPasswordInput(
          props: PMPasswordInputProps(ariaLabel: "Password", size: .sm, toggleLabel: Self.toggle))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMPasswordInput(
          props: PMPasswordInputProps(
            ariaLabel: "Password", defaultValue: "hunter2", invalid: true,
            toggleLabel: Self.toggle))
      },
      PMStateEntry("disabled — the toggle with it", expect: ["disabled": "true"]) {
        PMPasswordInput(
          props: PMPasswordInputProps(
            ariaLabel: "Password", defaultValue: "hunter2", disabled: true,
            toggleLabel: Self.toggle))
      },
      PMStateEntry("readOnly — the toggle kept", expect: ["readonly": "true"]) {
        PMPasswordInput(
          props: PMPasswordInputProps(
            ariaLabel: "Generated password", defaultValue: "v7-Kp2q-9xTz", readOnly: true,
            toggleLabel: Self.toggle))
      },
    ]
  }
}
