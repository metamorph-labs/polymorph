// RadioGroup (`design/components/radio.md`): one value from a few options, all
// visible. Checkbox's pattern wherever it can be: each option is a row of the
// control aligned to its label's first line, the label in `text.sm`, the row
// centred in the small control height with the whole row as the hit area.
// The control is a circle, an `md` icon square and a pill in every geometry,
// because a radio is round; checked, it is a ring in `accent.bg` around a dot
// half its size, not a filled disc, so it never reads as a checked Checkbox.
// Unchecked it is Checkbox's box: `bg.surface` in a `border.field` hairline,
// `bg.subtle` and `border.strong` under the pointer; checked, its ring is
// `accent.bg.hover` under the pointer. While invalid the ring is
// `danger.border` at rest, and the pointer's colours still win, as the
// recipe's hover rules outrank its invalid one. Disabled it is `bg.subtle` in
// `border.subtle`, an unchecked one in an invalid group in `danger.border`,
// and a disabled checked ring and dot are `border.subtle`. The dot pops in on
// the `snappy` spring from half its size and fades out; Reduce Motion fades
// both ways.
//
// The options stack `space-3` apart, or sit in a row `space-5` apart when
// `orientation` is horizontal. A group has a choice or none yet, and cannot be
// cleared: choosing the chosen option does nothing. `value` with `onChange` is
// the controlled pair; without it the group keeps its own value, from
// `defaultValue`.
//
// Each option is a button with the selected trait while chosen, as iOS has no
// radio role; the group is named by `ariaLabel` or its FormField's label (the
// question), and says "Invalid" and the field's message as its hint. `name`,
// `id` and the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMRadioGroup: PMRadioGroupRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var draft: String?
  private let props: PMRadioGroupProps

  public init(props: PMRadioGroupProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue)
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let horizontal = props.orientation == .horizontal
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let required = (props.ariaRequired ?? false) || (field?.required ?? false)
    let current = props.value ?? draft
    let layout =
      horizontal
      ? AnyLayout(HStackLayout(alignment: .top, spacing: space.s5))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: space.s3))

    layout {
      ForEach(props.options, id: \.value) { option in
        let checked = option.value == current
        Button {
          select(option.value)
        } label: {
          Text(option.label)
        }
        .buttonStyle(PMRadioStyle(checked: checked, invalid: invalid))
        .disabled(disabled || option.disabled == true)
        .accessibilityLabel(Text(option.label))
        .accessibilityAddTraits(checked ? .isSelected : [])
      }
    }
    .frame(maxWidth: horizontal ? nil : .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .modifier(PMOptionalLabel(label: props.ariaLabel ?? field?.label))
    .pmFieldHint(invalid: invalid, field?.hint)
    .pmFocusWhenNamed()
    .pmMember(
      "RadioGroup",
      attributes(current, disabled: disabled, invalid: invalid, required: required))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  private func select(_ value: String) {
    guard value != (props.value ?? draft) else { return }
    draft = value
    props.onChange?(value)
  }

  /// An option circle's border, as the recipe's rules resolve by their
  /// specificity and order. At rest, an invalid group's rule outranks the
  /// checked one, so a checked option keeps the danger border. Under the
  /// pointer the hover rules outrank the invalid one: `border.strong`, or
  /// `accent.bg.hover` while checked. A disabled option is `border.subtle`,
  /// except an unchecked one in an invalid group, which the invalid rule
  /// still outranks.
  static func circleBorder(
    _ colors: PMColors, enabled: Bool, checked: Bool, invalid: Bool, active: Bool
  ) -> PMDynamicColor {
    if !enabled { return invalid && !checked ? colors.dangerBorder : colors.borderSubtle }
    if active { return checked ? colors.accentBgHover : colors.borderStrong }
    if invalid { return colors.dangerBorder }
    return checked ? colors.accentBg : colors.borderField
  }

  private func attributes(_ current: String?, disabled: Bool, invalid: Bool, required: Bool)
    -> [String: String]
  {
    var attributes = ["orientation": (props.orientation ?? .vertical).rawValue]
    if let current { attributes["checked"] = current }
    if disabled { attributes["disabled"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if required { attributes["required"] = "true" }
    return attributes
  }
}

/// A radio row: the circle on the label's first line, and the label.
private struct PMRadioStyle: ButtonStyle {
  let checked: Bool
  let invalid: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMRadioRow(checked: checked, invalid: invalid, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMRadioRow<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var hovering = false
  let checked: Bool
  let invalid: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let density = theme.defaultDensity
    let colors = theme.colors
    let motion = theme.defaultMotion
    let circle = theme.icon.size.md
    let dot = circle / 2
    let line = theme.text.sm.lineBox
    // The circle centred on the label's first line, the row in the small control height.
    let circleInset = max(0, (line - circle) / 2)
    let rowInset = max(0, (density.controlHeight.sm - line) / 2)
    let active = enabled && (hovering || pressed)

    HStack(alignment: .top, spacing: density.space.s3) {
      Circle()
        .fill(fill(active).color)
        .overlay { Circle().strokeBorder(border(active).color, lineWidth: 1) }
        .overlay {
          if checked {
            Circle()
              .fill((enabled ? (active ? colors.accentBgHover : colors.accentBg) : colors.borderSubtle).color)
              .frame(width: dot, height: dot)
              .transition(
                reduceMotion
                  ? .opacity
                  : .asymmetric(
                    insertion: .scale(scale: 0.5).combined(with: .opacity), removal: .opacity))
          }
        }
        .frame(width: circle, height: circle)
        .padding(.top, circleInset)
        .animation(motion.spring.snappy.animation, value: checked)
      label()
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((enabled ? colors.textPrimary : colors.textDisabled).color)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, rowInset)
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
    .onHover { hovering = $0 }
    .pmHitTarget()
  }

  private func fill(_ active: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if !enabled { return colors.bgSubtle }
    if checked { return colors.bgSurface }
    return active ? colors.bgSubtle : colors.bgSurface
  }

  private func border(_ active: Bool) -> PMDynamicColor {
    PMRadioGroup.circleBorder(
      theme.colors, enabled: enabled, checked: checked, invalid: invalid, active: active)
  }
}

/// RadioGroup's states, from the spec's States table.
public struct RadioGroupStates: PMStates {
  public let member = "RadioGroup"

  public init() {}

  private static let priorities = [
    PMRadioOption(value: "low", label: "Low"),
    PMRadioOption(value: "normal", label: "Normal"),
    PMRadioOption(value: "urgent", label: "Urgent"),
  ]

  public var entries: [PMStateEntry] {
    let oneDisabled = [
      Self.priorities[0], Self.priorities[1],
      PMRadioOption(value: "urgent", label: "Urgent", disabled: true),
    ]
    return [
      PMStateEntry("unchecked — nothing chosen yet", expect: ["checked": "", "label": "Priority"]) {
        PMRadioGroup(props: PMRadioGroupProps(ariaLabel: "Priority", options: Self.priorities))
      },
      PMStateEntry("checked", expect: ["checked": "normal", "label": "Priority"]) {
        PMRadioGroup(
          props: PMRadioGroupProps(
            ariaLabel: "Priority", defaultValue: "normal", options: Self.priorities))
      },
      PMStateEntry("horizontal", expect: ["orientation": "horizontal", "checked": "low"]) {
        PMRadioGroup(
          props: PMRadioGroupProps(
            ariaLabel: "Priority", defaultValue: "low", options: Self.priorities,
            orientation: .horizontal))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMRadioGroup(
          props: PMRadioGroupProps(ariaLabel: "Priority", invalid: true, options: Self.priorities))
      },
      PMStateEntry("group disabled", expect: ["disabled": "true", "checked": "normal"]) {
        PMRadioGroup(
          props: PMRadioGroupProps(
            ariaLabel: "Priority", defaultValue: "normal", disabled: true,
            options: Self.priorities))
      },
      PMStateEntry("one option disabled", expect: ["checked": "low"]) {
        PMRadioGroup(
          props: PMRadioGroupProps(ariaLabel: "Priority", defaultValue: "low", options: oneDisabled))
      },
      PMStateEntry("required — the field's marker", expect: ["required": "true"]) {
        PMRadioGroup(
          props: PMRadioGroupProps(
            ariaLabel: "Priority", ariaRequired: true, options: Self.priorities))
      },
    ]
  }
}
