// Checkbox (`design/components/checkbox.md`): a boolean, or indeterminate,
// choice. A SwiftUI `Toggle` in a style drawn from the recipe: the
// glyph-scale box with the `confirm` or `indeterminate` glyph, aligned to the
// label's first line, and the whole row as the hit area. The indeterminate
// state is the toggle's mixed state, made from two sources that disagree, so
// assistive technology reports it as the platform's own "mixed". Choosing a
// mixed box checks it; tri-state cycling is not offered.
//
// Inside a FormField the field's label is the row label, with the required
// marker drawn after it (` *` in danger text, not spoken), and the field's
// message is the hint; the row reports itself so the field draws no label row
// of its own.
//
// `checked` with `onCheckedChange` is the controlled form, as on the web: the
// box shows `checked` whatever is chosen and reports the choice; without it,
// the box keeps its own state, starting from `defaultChecked`. An invalid box
// says so in its hint, as the web's `aria-invalid` is announced. `id`, `name`
// and `value` are form passthroughs with no SwiftUI counterpart, as are the
// `aria-describedby`/`aria-labelledby` ids.

import PolymorphTokens
import SwiftUI

public struct PMCheckbox: PMCheckboxRendering {
  @Environment(\.pmField) private var field
  @State private var state: PMCheckedState
  private let props: PMCheckboxProps

  public init(props: PMCheckboxProps) {
    self.props = props
    _state = State(initialValue: props.defaultChecked ?? .unchecked)
  }

  public var body: some View {
    let shown = props.checked ?? state
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let required = (props.ariaRequired ?? false) || (field?.required ?? false)
    let label = props.label ?? field?.label
    let name = props.ariaLabel ?? label

    Toggle(sources: sources(shown), isOn: \.self) {
      if let label {
        PMRowLabel(label: label, required: required)
      }
    }
    .toggleStyle(PMCheckboxStyle(invalid: invalid))
    .disabled(disabled)
    .modifier(PMOptionalLabel(label: name))
    .pmFieldHint(invalid: invalid, field?.hint)
    .pmFocusWhenNamed()
    .pmMember(
      "Checkbox",
      attributes(shown, disabled: disabled, invalid: invalid, required: required)
    )
    .preference(
      key: PMFieldControlKey.self, value: PMFieldControl(rowLabelled: true, disabled: disabled))
  }

  /// Two sources: they agree when the box is checked or unchecked, and
  /// disagree when it is indeterminate, which is the toggle's mixed state.
  /// A toggle sets every source on a tap, so only the first chooses: a
  /// controlled box's `checked` does not change between the two sets, and a
  /// second report would undo a handler that toggles.
  private func sources(_ shown: PMCheckedState) -> [Binding<Bool>] {
    let choose: (Bool) -> Void = { on in
      let next: PMCheckedState = on ? .checked : .unchecked
      guard next != (props.checked ?? state) else { return }
      state = next
      props.onCheckedChange?(next)
    }
    return [
      Binding(get: { shown != .unchecked }, set: choose),
      Binding(get: { shown == .checked }, set: { _ in }),
    ]
  }

  private func attributes(
    _ value: PMCheckedState, disabled: Bool, invalid: Bool, required: Bool
  ) -> [String: String] {
    var attributes = ["state": Self.name(value)]
    if disabled { attributes["disabled"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if required { attributes["required"] = "true" }
    return attributes
  }

  /// The state as the web's `data-state` names it.
  static func name(_ value: PMCheckedState) -> String {
    switch value {
    case .unchecked: "unchecked"
    case .checked: "checked"
    case .indeterminate: "indeterminate"
    }
  }
}

/// The recipe: the box and the row.
private struct PMCheckboxStyle: ToggleStyle {
  let invalid: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMCheckboxRow(configuration: configuration, invalid: invalid)
  }
}

private struct PMCheckboxRow: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var hovering = false
  let configuration: ToggleStyleConfiguration
  let invalid: Bool

  var body: some View {
    let density = theme.defaultDensity
    let colors = theme.colors
    let motion = theme.defaultMotion
    let value: PMCheckedState =
      configuration.isMixed ? .indeterminate : configuration.isOn ? .checked : .unchecked
    let marked = value != .unchecked
    let box = theme.icon.size.md
    let line = theme.text.sm.lineBox
    let shape = RoundedRectangle(cornerRadius: theme.radius.detail)
    // The box centred on the label's first line, and the row centred in the
    // small control height.
    let boxInset = max(0, (line - box) / 2)
    let rowInset = max(0, (density.controlHeight.sm - line) / 2)

    HStack(alignment: .top, spacing: density.space.s3) {
      shape
        .fill(fill(marked).color)
        .overlay { shape.strokeBorder(border(marked).color, lineWidth: 1) }
        .overlay {
          if marked {
            PMIconView(value == .indeterminate ? .indeterminate : .confirm, size: .sm)
              .foregroundStyle((enabled ? colors.accentContrast : colors.textDisabled).color)
              // The `checkbox.indicator` binding: in, a spring pop from half
              // size with a fade; out, a fade. Reduce Motion fades both ways.
              .transition(
                reduceMotion
                  ? .opacity
                  : .asymmetric(
                    insertion: .scale(scale: 0.5).combined(with: .opacity), removal: .opacity))
          }
        }
        .frame(width: box, height: box)
        .padding(.top, boxInset)
        .animation(motion.spring.snappy.animation, value: value)
      configuration.label
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((enabled ? colors.textPrimary : colors.textDisabled).color)
    }
    .padding(.vertical, rowInset)
    .animation(
      motion.easing.standard.animation(duration: motion.duration.control), value: hovering
    )
    .onHover { hovering = $0 }
    .pmHitTarget()
    .onTapGesture { if enabled { configuration.isOn.toggle() } }
  }

  private func fill(_ marked: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if !enabled { return marked ? colors.borderSubtle : colors.bgSubtle }
    if marked { return hovering && !invalid ? colors.accentBgHover : colors.accentBg }
    return hovering ? colors.bgSubtle : colors.bgSurface
  }

  private func border(_ marked: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if !enabled { return colors.borderSubtle }
    if invalid { return colors.dangerBorder }
    if marked { return hovering ? colors.accentBgHover : colors.accentBg }
    return hovering ? colors.borderStrong : colors.borderField
  }
}

/// Checkbox's states, from the spec's States table.
public struct CheckboxStates: PMStates {
  public let member = "Checkbox"

  public init() {}

  private static let replies = "Email me about replies"
  private static let terms = "Accept the terms"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("unchecked", expect: ["state": "unchecked", "label": Self.replies]) {
        PMCheckbox(props: PMCheckboxProps(label: Self.replies))
      },
      PMStateEntry("checked", expect: ["state": "checked", "label": Self.replies]) {
        PMCheckbox(props: PMCheckboxProps(checked: .checked, label: Self.replies))
      },
      PMStateEntry("indeterminate", expect: ["state": "indeterminate", "label": "Select all"]) {
        PMCheckbox(props: PMCheckboxProps(checked: .indeterminate, label: "Select all"))
      },
      PMStateEntry("uncontrolled, checked by default", expect: ["state": "checked"]) {
        PMCheckbox(props: PMCheckboxProps(defaultChecked: .checked, label: Self.replies))
      },
      PMStateEntry("invalid", expect: ["invalid": "true", "label": Self.terms]) {
        PMCheckbox(props: PMCheckboxProps(invalid: true, label: Self.terms))
      },
      PMStateEntry(
        "required — the marker the field row cannot render for it",
        expect: ["required": "true", "label": Self.terms]
      ) {
        PMCheckbox(props: PMCheckboxProps(ariaRequired: true, label: Self.terms))
      },
      PMStateEntry("disabled", expect: ["disabled": "true", "state": "unchecked"]) {
        PMCheckbox(props: PMCheckboxProps(disabled: true, label: Self.replies))
      },
      PMStateEntry("disabled checked", expect: ["disabled": "true", "state": "checked"]) {
        PMCheckbox(props: PMCheckboxProps(checked: .checked, disabled: true, label: Self.replies))
      },
      PMStateEntry(
        "disabled indeterminate", expect: ["disabled": "true", "state": "indeterminate"]
      ) {
        PMCheckbox(
          props: PMCheckboxProps(checked: .indeterminate, disabled: true, label: "Select all"))
      },
      PMStateEntry(
        "no label — a Table selection cell", expect: ["state": "unchecked", "label": "Select row"]
      ) {
        PMCheckbox(props: PMCheckboxProps(ariaLabel: "Select row"))
      },
      PMStateEntry("a label long enough to wrap, the box on its first line") {
        PMCheckbox(
          props: PMCheckboxProps(
            label: "A label long enough to wrap onto a second line, so the box stays on the first"))
      },
    ]
  }
}
