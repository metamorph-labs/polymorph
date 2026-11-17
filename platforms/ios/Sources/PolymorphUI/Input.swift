// Input (`design/components/input.md`): single-line text entry. A plain
// SwiftUI `TextField` (a `SecureField` for `password`) inside the recipe's
// container: the frame draws the surface, border and seat, the leading icon,
// the affixes, the clear button and the trailing slot sit beside the field, and
// every state is drawn on the container, as the web mirrors its states onto the
// root so the adornments take the same colours.
//
// Platform forms of the web's behaviour: a tap in the frame outside its
// buttons focuses the field; `maxLength` cuts what is typed and the field
// shows the cut text; the focus ring is drawn while the field has focus;
// `invalid` is said first in the field's hint, as `aria-invalid` is announced;
// `readOnly` is the value as selectable text, which stays readable and
// selectable but cannot be edited, because a `TextField` has no read-only
// mode; `type` and `autoComplete` choose the keyboard and the text content
// type (one-time code, new password, …) on iOS; `exact` takes the text as
// typed, neither capitalised nor corrected, as a literal type's text is
// (`PMTextEntry`). The phone's focus-zoom floor (conventions §13) is a
// browser behaviour with no native counterpart.
//
// Not honoured, because SwiftUI has no counterpart: `id`, `name` and the
// `aria-describedby`/`aria-labelledby` ids (a FormField names and describes the
// field through `\.pmField`); `ariaRequired`, which iOS has no trait for;
// `min`, `max` and `step`, which a text field does not step (NumberInput is the
// numeric member); and the opaque `controlRef`, `onSelect` and composition
// events, whose types the contract cannot express (`PMUnsupported.props`).

import PolymorphTokens
import SwiftUI

public struct PMInput: PMInputRendering {
  private let props: PMInputProps

  public init(props: PMInputProps) {
    self.props = props
  }

  public var body: some View {
    PMInputCore(props: props, member: "Input")
  }
}

/// Input's rendering, which SearchInput shares under its own name: it adds the
/// shortcut hint, shown while the field is empty and unfocused.
struct PMInputCore: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @FocusState private var focused: Bool
  @State private var draft: String
  @State private var shown: String
  private let props: PMInputProps
  private let shortcut: String?
  private let member: String

  init(props: PMInputProps, shortcut: String? = nil, member: String) {
    self.props = props
    self.shortcut = shortcut
    self.member = member
    _draft = State(initialValue: props.defaultValue ?? "")
    _shown = State(initialValue: props.value ?? props.defaultValue ?? "")
  }

  var body: some View {
    let size = props.size ?? .md
    let metrics = PMControlMetrics(size, theme)
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let current = shown
    // An uneditable value cannot be cleared (input.md, the clear button's hidden row).
    let showClear = (props.clearable ?? false) && !current.isEmpty && !disabled && !readOnly
    let showShortcut = shortcut != nil && current.isEmpty && !focused && !disabled
    let colors = theme.colors
    let motion = theme.defaultMotion

    HStack(spacing: metrics.gap) {
      if let icon = props.icon {
        PMIconView(icon, size: size)
          .foregroundStyle(
            (disabled ? colors.textDisabled : invalid ? colors.dangerText : colors.textMuted).color)
      }
      if let prefix = props.prefix { affix(prefix, disabled: disabled) }
      entry(readOnly: readOnly, disabled: disabled, invalid: invalid)
      if let suffix = props.suffix { affix(suffix, disabled: disabled) }
      if showClear {
        Button {
          shown = ""
          focused = true
        } label: {
          PMIconView(.clear, size: size)
        }
        .buttonStyle(PMEmbeddedButtonStyle(side: metrics.height))
        .accessibilityLabel(Text(props.clearLabel ?? PMStrings.clear))
        .transition(.opacity)
      }
      if let shortcut, showShortcut {
        PMShortcutHint(shortcut: shortcut)
      }
      if let trailing = props.trailing {
        trailing
      }
    }
    .pmTextStyle(metrics.text)
    .foregroundStyle(
      (disabled ? colors.textDisabled : readOnly ? colors.textSecondary : colors.textPrimary).color
    )
    .padding(.horizontal, metrics.padding)
    .frame(minHeight: metrics.height)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: readOnly, focused: focused)
    )
    // The clear button fades in over the control duration (the `input.clear` binding).
    .animation(motion.easing.enter.animation(duration: motion.duration.control), value: showClear)
    .pmHitTarget()
    // A tap in the frame focuses the field, as a click on the web's root does,
    // except on a button in it (the clear button, a trailing control), whose
    // tap is its own.
    .pmOpensOnTap(!disabled) { focused = true }
    .pmLimitedText(
      $shown, value: props.value, committed: props.value ?? draft, maxLength: props.maxLength
    ) { kept in
      draft = kept
      props.onChange?(kept)
    }
    .onChange(of: focused) { _, now in
      if now { props.onFocus?() } else { props.onBlur?() }
    }
    .onAppear { if props.autoFocus == true, !disabled { focused = true } }
    .accessibilityElement(children: .contain)
    .pmMember(member, attributes(size, invalid: invalid, disabled: disabled, readOnly: readOnly))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The value: the controlled `value` when given, otherwise the field's own
  /// draft, seeded from `defaultValue`. The field shows `shown`, which
  /// follows it, and `maxLength` cuts what is typed (`pmLimitedText`).
  private var value: String {
    props.value ?? draft
  }

  /// The name the field is spoken by: its own `ariaLabel`, else its
  /// FormField's label, else the placeholder, as iOS names an unlabelled field.
  private var name: String? {
    props.ariaLabel ?? field?.label ?? props.placeholder
  }

  @ViewBuilder
  private func entry(readOnly: Bool, disabled: Bool, invalid: Bool) -> some View {
    let colors = theme.colors
    if readOnly {
      Text(value)
        .lineLimit(1)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel(Text(name ?? value))
        .accessibilityValue(Text(value))
        .pmFieldHint(invalid: invalid, field?.hint)
    } else {
      // A prompt is always given, so the field's name is never drawn as one.
      let prompt =
        props.placeholder.map { Text($0).foregroundStyle(colors.textMuted.color) }
        ?? Text(verbatim: "")
      Group {
        if props.type == .password {
          SecureField(name ?? "", text: $shown, prompt: prompt)
        } else {
          TextField(name ?? "", text: $shown, prompt: prompt)
        }
      }
      .textFieldStyle(.plain)
      .focused($focused)
      .pmFocusWhenNamed($focused)
      .disabled(disabled)
      .tint(colors.accentText.color)
      .modifier(
        PMTextEntry(
          type: props.type ?? .text, autoComplete: props.autoComplete,
          literal: props.exact ?? false))
      .accessibilityAddTraits(props.type == .search ? .isSearchField : [])
      .pmEntryName(name)
      .pmFieldHint(invalid: invalid, field?.hint)
    }
  }

  /// A prefix or suffix: adornment strength, never part of the value, and not spoken.
  private func affix(_ text: String, disabled: Bool) -> some View {
    Text(text)
      .lineLimit(1)
      .fixedSize()
      .foregroundStyle((disabled ? theme.colors.textDisabled : theme.colors.textMuted).color)
      .accessibilityHidden(true)
  }

  private func attributes(
    _ size: PMControlSize, invalid: Bool, disabled: Bool, readOnly: Bool
  ) -> [String: String] {
    var attributes = ["size": size.rawValue]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    // The adornments, which are not spoken, so a UI test reads them here.
    if let icon = props.icon { attributes["icon"] = icon.rawValue }
    if let prefix = props.prefix { attributes["prefix"] = prefix }
    if let suffix = props.suffix { attributes["suffix"] = suffix }
    if shortcut != nil, shown.isEmpty, !focused, !disabled {
      attributes["shortcut"] = "true"
    }
    return attributes
  }
}

/// Input's states, from the spec's States table.
public struct InputStates: PMStates {
  public let member = "Input"

  public init() {}

  private static let subject = "urgent: login loop"

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMInput(props: PMInputProps(ariaLabel: "Search", placeholder: "Search…", size: size))
      }
    }
    return sizes + [
      PMStateEntry("leading icon", expect: ["icon": "search"]) {
        PMInput(props: PMInputProps(ariaLabel: "Search", icon: .search, placeholder: "Search…"))
      },
      PMStateEntry("with value") {
        PMInput(props: PMInputProps(ariaLabel: "Subject", defaultValue: Self.subject))
      },
      PMStateEntry("clearable, with value") {
        PMInput(
          props: PMInputProps(ariaLabel: "Subject", clearable: true, defaultValue: Self.subject))
      },
      PMStateEntry(
        "clearable, suppressed — an uneditable value offers no clear",
        expect: ["readonly": "true"]
      ) {
        PMInput(
          props: PMInputProps(
            ariaLabel: "Subject", clearable: true, defaultValue: Self.subject, readOnly: true))
      },
      PMStateEntry("clearable, empty — no clear button") {
        PMInput(
          props: PMInputProps(
            ariaLabel: "Subject", clearable: true, placeholder: "Nothing to clear"))
      },
      PMStateEntry("number — the decimal keyboard") {
        PMInput(
          props: PMInputProps(ariaLabel: "Retries", max: 10, min: 0, step: 2, type: .number))
      },
      PMStateEntry("password — a secure field") {
        PMInput(
          props: PMInputProps(
            ariaLabel: "Password", autoComplete: "current-password", defaultValue: "hunter2",
            type: .password))
      },
      PMStateEntry(
        "affixes — a currency mark and a unit, muted beside the value",
        expect: ["prefix": "$", "suffix": "USD"]
      ) {
        PMInput(
          props: PMInputProps(ariaLabel: "Amount", defaultValue: "120", prefix: "$", suffix: "USD"))
      },
      PMStateEntry("trailing slot") {
        PMInput(
          props: PMInputProps(
            ariaLabel: "Workspace", defaultValue: "relay",
            trailing: PMContent(PMBadge(props: PMBadgeProps(children: "Beta")))))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMInput(
          props: PMInputProps(
            ariaLabel: "Query", defaultValue: "???", icon: .search, invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMInput(props: PMInputProps(ariaLabel: "Locked", defaultValue: "locked", disabled: true))
      },
      PMStateEntry("readOnly", expect: ["readonly": "true"]) {
        PMInput(
          props: PMInputProps(ariaLabel: "Read only", defaultValue: "read only", readOnly: true))
      },
    ]
  }
}
