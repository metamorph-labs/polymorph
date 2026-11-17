// Meter (`design/components/meter.md`): a measured value in a known range,
// storage used of a quota or money spent of a budget, whose fill's colour says
// the band the value is in. The bar is Progress's: `space-2` tall on
// `bg.subtle`, a pill in every geometry, its fill the track's full width
// scaled from the leading edge, so it grows from the right in a right-to-left
// layout. The fill is the accent gradient below every threshold,
// `warning.solid` from `warning` up and `danger.solid` from `danger` up;
// `danger` wins where the bands overlap. The band reads the value as given,
// the bar the value clamped to `min`–`max`, and a range with no width draws an
// empty fill. A change eases over the surface duration on the standard easing
// and is instant under Reduce Motion.
//
// It renders no label: `label` names the meter for VoiceOver, as Progress's
// does. The readout under the bar is a status glyph past a threshold, the
// `warning` or `error` role at `sm` in the band's text colour and named by
// `messages`, and the app's `valueText` in `text.sm`, secondary, with tabular
// figures. The readout is not drawn for an accent meter without `valueText`.
//
// To VoiceOver the bar is the platform's gauge, named by `label`, its value
// `valueText` or else the clamped value. The value text under it is hidden,
// because the gauge's value already says it, and the glyph is read after the
// gauge as an image named "High" or "Critical". A change of value is not
// announced, as on the web.

import PolymorphTokens
import SwiftUI

public struct PMMeter: PMMeterRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private let props: PMMeterProps

  public init(props: PMMeterProps) {
    self.props = props
  }

  /// The band the value is in, as the identifier's `tone` names it.
  enum Tone: String {
    case accent, warning, danger
  }

  /// The tone of a value against its thresholds, read before the value is
  /// clamped, so a value past `max` is still past a threshold above `max`.
  static func tone(_ value: Double, warning: Double?, danger: Double?) -> Tone {
    if let danger, value >= danger { return .danger }
    if let warning, value >= warning { return .warning }
    return .accent
  }

  public var body: some View {
    let low = props.min ?? 0
    let high = props.max ?? 100
    let shown = Swift.min(high, Swift.max(low, props.value))
    let ratio = high > low ? (shown - low) / (high - low) : 0
    let tone = Self.tone(props.value, warning: props.warning, danger: props.danger)

    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s2) {
      bar(ratio: ratio, tone: tone)
        .accessibilityRepresentation {
          Gauge(value: shown, in: low...Swift.max(low, high)) {
            Text(props.label)
          }
          .accessibilityValue(Text(props.valueText ?? shown.formatted()))
        }
      if tone != .accent || props.valueText != nil {
        readout(tone)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember("Meter", ["tone": tone.rawValue])
  }

  private func bar(ratio: Double, tone: Tone) -> some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.pill)
    let motion = theme.defaultMotion

    return shape
      .fill(theme.colors.bgSubtle.color)
      .overlay(alignment: .leading) {
        Group {
          switch tone {
          case .accent: shape.fill(theme.gradients.accentGradient.linear)
          case .warning: shape.fill(theme.colors.warningSolid.color)
          case .danger: shape.fill(theme.colors.dangerSolid.color)
          }
        }
        .scaleEffect(x: ratio, y: 1, anchor: .leading)
        .animation(
          reduceMotion ? nil : motion.easing.standard.animation(duration: motion.duration.surface),
          value: ratio)
      }
      .clipShape(shape)
      .frame(height: theme.defaultDensity.space.s2)
      .frame(maxWidth: .infinity)
  }

  private func readout(_ tone: Tone) -> some View {
    let messages = props.messages ?? PMStrings.meterMessages

    return HStack(spacing: theme.defaultDensity.space.s2) {
      switch tone {
      case .accent: EmptyView()
      case .warning:
        PMIcon(props: PMIconProps(label: messages.warning, name: .warning, size: .sm))
          .foregroundStyle(theme.colors.warningText.color)
      case .danger:
        PMIcon(props: PMIconProps(label: messages.danger, name: .error, size: .sm))
          .foregroundStyle(theme.colors.dangerText.color)
      }
      if let valueText = props.valueText {
        Text(valueText)
          .pmTextStyle(theme.text.sm)
          .pmTabularFigures(theme.numeric.tabular)
          .foregroundStyle(theme.colors.textSecondary.color)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityHidden(true)
      }
    }
  }
}

/// Meter's states, from the spec's States table. Each entry's root carries the
/// band as `tone`; a glyph past a threshold is an Icon inside it.
public struct MeterStates: PMStates {
  public let member = "Meter"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("below its thresholds", expect: ["tone": "accent"]) {
        PMMeter(
          props: PMMeterProps(
            danger: 45, label: "Storage used", max: 50, value: 30, valueText: "30 GB of 50 GB",
            warning: 40))
      },
      PMStateEntry(
        "between its thresholds — warning", expect: ["tone": "warning", "contains": "Icon[name=warning]"]
      ) {
        PMMeter(
          props: PMMeterProps(
            danger: 45, label: "Storage used", max: 50, value: 42, valueText: "42 GB of 50 GB",
            warning: 40))
      },
      PMStateEntry(
        "above its thresholds — danger", expect: ["tone": "danger", "contains": "Icon[name=error]"]
      ) {
        PMMeter(
          props: PMMeterProps(
            danger: 45, label: "Storage used", max: 50, value: 48, valueText: "48 GB of 50 GB",
            warning: 40))
      },
      PMStateEntry("at min", expect: ["tone": "accent"]) {
        PMMeter(props: PMMeterProps(label: "Seats taken", max: 20, value: 0, valueText: "0 of 20 seats"))
      },
      PMStateEntry("at max — the budget is spent", expect: ["tone": "danger"]) {
        PMMeter(
          props: PMMeterProps(
            danger: 2000, label: "Budget spent", max: 2000, value: 2000, valueText: "€2,000 of €2,000"))
      },
      PMStateEntry("outside the range is clamped, and its band still holds", expect: ["tone": "danger"]) {
        PMMeter(
          props: PMMeterProps(danger: 100, label: "Allowance used", value: 130, valueText: "Over by 30 GB"))
      },
      PMStateEntry("without the value text", expect: ["tone": "accent"]) {
        PMMeter(props: PMMeterProps(label: "Cold share", value: 62))
      },
      PMStateEntry(
        "danger without the value text — the glyph alone",
        expect: ["tone": "danger", "contains": "Icon[name=error]"]
      ) {
        PMMeter(props: PMMeterProps(danger: 85, label: "Queue depth", value: 92))
      },
      PMStateEntry("messages — the glyph named in another language", expect: ["tone": "warning"]) {
        PMMeter(
          props: PMMeterProps(
            danger: 45, label: "Speicher belegt", max: 50,
            messages: PMMeterMessages(warning: "Hoch", danger: "Kritisch"), value: 42,
            valueText: "42 GB von 50 GB", warning: 40))
      },
    ]
  }
}
