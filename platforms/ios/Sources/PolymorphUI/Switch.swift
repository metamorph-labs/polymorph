// Switch (`design/components/switch.md`): an on/off setting that takes effect
// at once. A SwiftUI `Toggle`, so it keeps the platform's switch semantics,
// in a style drawn from the recipe: the pill track and the thumb, sized from
// the icon and space tokens and pill-shaped in every geometry, because the
// shape identifies the control. The thumb's position is the state and the
// colour the second signal; it moves on the `snappy` spring, and jumps under
// Reduce Motion.
//
// The label leads and the track sits at the row's trailing end, the
// platform's arrangement for a switch; an unlabelled switch is the track
// alone, for a row that labels it (SettingsRow). Inside a FormField the
// field's label is the row label, with the required marker after it, and the
// field's message is the hint. `id`, `name`, `value` and the
// `aria-describedby`/`aria-labelledby` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMSwitch: PMSwitchRendering {
  @Environment(\.pmField) private var field
  @State private var draft: Bool
  private let props: PMSwitchProps

  public init(props: PMSwitchProps) {
    self.props = props
    _draft = State(initialValue: props.defaultChecked ?? false)
  }

  public var body: some View {
    let on = props.checked ?? draft
    let disabled = props.disabled ?? false
    let required = (props.ariaRequired ?? false) || (field?.required ?? false)
    let label = props.label ?? field?.label

    Toggle(isOn: isOn) {
      if let label {
        PMRowLabel(label: label, required: required)
      }
    }
    .toggleStyle(PMSwitchStyle(labelled: label != nil))
    .disabled(disabled)
    .modifier(PMOptionalLabel(label: props.ariaLabel ?? label))
    .pmAccessibilityHint(field?.hint)
    .pmFocusWhenNamed()
    .pmMember("Switch", attributes(on: on, disabled: disabled, required: required))
    .preference(
      key: PMFieldControlKey.self, value: PMFieldControl(rowLabelled: true, disabled: disabled))
  }

  /// The controlled `checked` when given, otherwise the switch's own state,
  /// seeded from `defaultChecked`.
  private var isOn: Binding<Bool> {
    Binding {
      props.checked ?? draft
    } set: { next in
      draft = next
      props.onCheckedChange?(next)
    }
  }

  private func attributes(on: Bool, disabled: Bool, required: Bool) -> [String: String] {
    var attributes = ["state": on ? "on" : "off"]
    if disabled { attributes["disabled"] = "true" }
    if required { attributes["required"] = "true" }
    return attributes
  }
}

private struct PMSwitchStyle: ToggleStyle {
  let labelled: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMSwitchRow(configuration: configuration, labelled: labelled)
  }
}

private struct PMSwitchRow: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var hovering = false
  let configuration: ToggleStyleConfiguration
  let labelled: Bool

  var body: some View {
    let density = theme.defaultDensity
    let colors = theme.colors
    let motion = theme.defaultMotion
    let on = configuration.isOn
    let thumb = theme.icon.size.md
    // The track: one thumb plus a space-2 inset around it, twice as long.
    let inset = density.space.s2 / 2
    let height = thumb + density.space.s2
    let width = thumb * 2 + density.space.s2
    let line = theme.text.sm.lineBox
    let rowInset = max(0, (density.controlHeight.sm - line) / 2)
    let trackInset = max(0, (line - height) / 2)

    HStack(alignment: .top, spacing: density.space.s3) {
      if labelled {
        configuration.label
          .pmTextStyle(theme.text.sm)
          .foregroundStyle((enabled ? colors.textPrimary : colors.textDisabled).color)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Capsule()
        .fill(trackFill(on).color)
        .overlay { Capsule().strokeBorder(trackBorder(on).color, lineWidth: 1) }
        .frame(width: width, height: height)
        .overlay(alignment: on ? .trailing : .leading) {
          Circle()
            .fill(thumbFill(on).color)
            .overlay { Circle().strokeBorder(thumbBorder(on).color, lineWidth: 1) }
            .pmShadow(enabled ? theme.shadows.raised : PMShadow(layers: []))
            .frame(width: thumb, height: thumb)
            .padding(.horizontal, inset)
        }
        // Centred on the label's first line.
        .padding(.top, labelled ? trackInset : 0)
        .animation(reduceMotion ? nil : motion.spring.snappy.animation, value: on)
    }
    .padding(.vertical, rowInset)
    .animation(
      motion.easing.standard.animation(duration: motion.duration.control), value: hovering
    )
    .onHover { hovering = $0 }
    .pmHitTarget()
    .onTapGesture { if enabled { configuration.isOn.toggle() } }
  }

  private func trackFill(_ on: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if !enabled { return on ? colors.borderSubtle : colors.bgSubtle }
    if on { return hovering ? colors.accentBgHover : colors.accentBg }
    return hovering ? colors.bgSurface : colors.bgSubtle
  }

  private func trackBorder(_ on: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if !enabled { return colors.borderSubtle }
    if on { return hovering ? colors.accentBgHover : colors.accentBg }
    return hovering ? colors.borderStrong : colors.borderField
  }

  private func thumbFill(_ on: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if !enabled { return on ? colors.bgSurface : colors.bgSubtle }
    return on ? colors.accentContrast : colors.bgSurface
  }

  private func thumbBorder(_ on: Bool) -> PMDynamicColor? {
    let colors = theme.colors
    if !enabled { return colors.borderSubtle }
    return on ? nil : colors.borderDefault
  }
}

extension Optional where Wrapped == PMDynamicColor {
  /// The colour, or clear when there is none.
  fileprivate var color: Color { self?.color ?? .clear }
}

/// Switch's states, from the spec's States table.
public struct SwitchStates: PMStates {
  public let member = "Switch"

  public init() {}

  private static let notifications = "Desktop notifications"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("off", expect: ["state": "off", "label": Self.notifications]) {
        PMSwitch(props: PMSwitchProps(label: Self.notifications))
      },
      PMStateEntry("on", expect: ["state": "on", "label": Self.notifications]) {
        PMSwitch(props: PMSwitchProps(defaultChecked: true, label: Self.notifications))
      },
      PMStateEntry(
        "required — the marker the field row cannot render for it",
        expect: ["required": "true", "label": "Accept the terms"]
      ) {
        PMSwitch(props: PMSwitchProps(ariaRequired: true, label: "Accept the terms"))
      },
      PMStateEntry("disabled off", expect: ["state": "off", "disabled": "true"]) {
        PMSwitch(props: PMSwitchProps(disabled: true, label: Self.notifications))
      },
      PMStateEntry("disabled on", expect: ["state": "on", "disabled": "true"]) {
        PMSwitch(
          props: PMSwitchProps(defaultChecked: true, disabled: true, label: Self.notifications))
      },
      PMStateEntry(
        "unlabelled — labelled by its context",
        expect: ["state": "off", "label": Self.notifications]
      ) {
        PMSwitch(props: PMSwitchProps(ariaLabel: Self.notifications))
      },
    ]
  }
}
