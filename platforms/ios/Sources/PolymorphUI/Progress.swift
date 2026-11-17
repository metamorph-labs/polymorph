// Progress (`design/components/progress.md`): a bar for how much of a task is
// done; Spinner is for an unknown duration. The track is `space-2` tall on
// `bg.subtle`, a pill in every geometry, because a bar this thin with square
// ends reads as a rendering fault. The fill is the accent gradient (the solid
// accent in a system with no partner hue), or `danger.solid` for over-quota
// and exceeded budgets; it is the track's full width scaled from the leading
// edge to the value, which is clamped to 0–100. A change eases over the
// surface duration on the standard easing, never on a spring, and is instant
// under Reduce Motion.
//
// It renders no text: a label beside it is the screen's. To assistive
// technology it is the platform's progress indicator, named by `label`, with
// the value as a percentage; a change is not announced, as on the web.
//
// `shape: .ring` draws the same value as a ring in the icon box for `size`,
// Spinner's box, for the place a Spinner sits once the task knows how far it
// has got. The groove is `border.default` and the arc `accent.bg`, or
// `danger.solid`, each `space-1` wide and inset by half of that, so the stroke
// ends at the box's edge. The groove is a line, so it takes the line role the
// contrast law holds visible on every surface, not the bar's `bg.subtle`,
// which a line this thin does not show on a dark page. The arc starts at the
// top and runs clockwise, in both layout directions, because a ring is a clock
// face. A stroke takes no gradient, so the accent arc is the solid accent. The
// arc's length eases as the bar's scale does.

import PolymorphTokens
import SwiftUI

public struct PMProgress: PMProgressRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private let props: PMProgressProps

  public init(props: PMProgressProps) {
    self.props = props
  }

  @ViewBuilder public var body: some View {
    let value = min(100, max(0, props.value))
    let tone = props.tone ?? .accent
    if props.shape == .ring {
      ring(value: value, tone: tone, size: props.size ?? .md)
    } else {
      bar(value: value, tone: tone)
    }
  }

  private var easing: Animation? {
    let motion = theme.defaultMotion
    return reduceMotion ? nil : motion.easing.standard.animation(duration: motion.duration.surface)
  }

  private func ring(value: Double, tone: PMProgressTone, size: PMControlSize) -> some View {
    let stroke = theme.defaultDensity.space.s1
    let arc = tone == .danger ? theme.colors.dangerSolid.color : theme.colors.accentBg.color

    return ZStack {
      Circle()
        .inset(by: stroke / 2)
        .stroke(theme.colors.borderDefault.color, lineWidth: stroke)
      Circle()
        .inset(by: stroke / 2)
        .trim(from: 0, to: value / 100)
        .stroke(arc, style: StrokeStyle(lineWidth: stroke, lineCap: .butt))
        .rotationEffect(.degrees(-90))
        .animation(easing, value: value)
    }
    .frame(width: theme.icon.size[size], height: theme.icon.size[size])
    .accessibilityRepresentation {
      ProgressView(props.label, value: value, total: 100)
    }
    .pmMember(
      "Progress",
      [
        "tone": tone.rawValue, "valuenow": String(Int(value.rounded())), "shape": "ring",
        "size": size.rawValue,
      ])
  }

  private func bar(value: Double, tone: PMProgressTone) -> some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.pill)

    return shape
      .fill(theme.colors.bgSubtle.color)
      .overlay(alignment: .leading) {
        Group {
          if tone == .danger {
            shape.fill(theme.colors.dangerSolid.color)
          } else {
            shape.fill(theme.gradients.accentGradient.linear)
          }
        }
        .scaleEffect(x: value / 100, y: 1, anchor: .leading)
        .animation(easing, value: value)
      }
      .clipShape(shape)
      .frame(height: theme.defaultDensity.space.s2)
      .frame(maxWidth: .infinity)
      .accessibilityRepresentation {
        ProgressView(props.label, value: value, total: 100)
      }
      .pmMember("Progress", ["tone": tone.rawValue, "valuenow": String(Int(value.rounded()))])
  }
}

/// Progress's states, from the spec's States table.
public struct ProgressStates: PMStates {
  public let member = "Progress"

  public init() {}

  public var entries: [PMStateEntry] {
    [0, 33, 100].map { value in
      PMStateEntry("\(value)", expect: ["tone": "accent", "valuenow": "\(value)", "label": "Upload"]) {
        PMProgress(props: PMProgressProps(label: "Upload", value: Double(value)))
      }
    } + [
      PMStateEntry("danger at 80", expect: ["tone": "danger", "label": "Storage used"]) {
        PMProgress(props: PMProgressProps(label: "Storage used", tone: .danger, value: 80))
      }
    ] + PMControlSize.allCases.map { size in
      PMStateEntry(
        "ring \(size.rawValue)",
        expect: ["shape": "ring", "size": size.rawValue, "valuenow": "60", "label": "Uploading"]
      ) {
        PMProgress(props: PMProgressProps(label: "Uploading", shape: .ring, size: size, value: 60))
      }
    } + [
      PMStateEntry("ring danger", expect: ["shape": "ring", "tone": "danger", "label": "Upload failed"]) {
        PMProgress(props: PMProgressProps(label: "Upload failed", shape: .ring, tone: .danger, value: 80))
      }
    ]
  }
}
