// SegmentedControl (`design/components/segmented-control.md`): a joined row
// of segments that always holds one value, the control a toolbar or a filter
// row sets data with. The track is the control height on `bg.subtle` at the
// control radius, and the segments divide it equally, the widest label
// setting their width. In a row, the control takes its width before its
// siblings do (`layoutPriority`), so a search field or a line of text beside
// it gives way first. Offered less than its width all the same, as at the
// largest text sizes, the track takes the width it is offered and the labels
// truncate, with the Large Content Viewer for a segment's whole label, as
// UIKit's own does. A segment is its icon and its label at the size's
// type step and padding, `text.secondary`, `text.primary` under the pointer;
// the chosen one is a raised chip, `bg.surface` with the control shadow and
// `radius.sm`, inset half `space-2` on every side, its text `text.primary`.
// The chip is the selection's second channel, so no accent is needed. A
// disabled segment is `text.disabled`; a chosen disabled one keeps its chip,
// without the shadow, so its place stays legible. Selection snaps: the chip
// does not slide and nothing fades.
//
// It always holds a value: without `value` or `defaultValue` the first option
// is chosen. `value` with `onChange` is the controlled pair. Each segment is a
// button with the selected trait while chosen, its hit area its cell grown to
// the hit target past the track's edges, inside the room the control keeps
// for it; the group is named by `label`. There is no `lg`: a form-scale
// choice is a RadioGroup.

import PolymorphTokens
import SwiftUI

public struct PMSegmentedControl: PMSegmentedControlRendering {
  @Environment(\.pmTheme) private var theme
  @State private var draft: String?
  private let props: PMSegmentedControlProps

  public init(props: PMSegmentedControlProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? props.options.first?.value)
  }

  public var body: some View {
    let size: PMControlSize = props.size == .sm ? .sm : .md
    let metrics = PMControlMetrics(size, theme)
    let disabled = props.disabled ?? false
    let current = props.value ?? draft

    PMEqualSegments {
      ForEach(props.options, id: \.value) { option in
        let checked = option.value == current
        Button {
          select(option.value)
        } label: {
          HStack(spacing: metrics.gap) {
            if let icon = option.icon { PMIconView(icon, size: size) }
            Text(option.label).lineLimit(1)
          }
        }
        .buttonStyle(PMSegmentStyle(checked: checked, controlSize: size))
        .disabled(disabled || option.disabled == true)
        .accessibilityLabel(Text(option.label))
        .accessibilityAddTraits(checked ? .isSelected : [])
        .accessibilityShowsLargeContentViewer()
      }
    }
    .background(
      theme.colors.bgSubtle.color, in: RoundedRectangle(cornerRadius: theme.radius.control)
    )
    .pmHitTarget()
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("SegmentedControl", attributes(current, size: size, disabled: disabled))
    .layoutPriority(1)
  }

  private func select(_ value: String) {
    guard value != (props.value ?? draft) else { return }
    draft = value
    props.onChange?(value)
  }

  private func attributes(_ current: String?, size: PMControlSize, disabled: Bool)
    -> [String: String]
  {
    var attributes = ["size": size.rawValue]
    if let current { attributes["checked"] = current }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// The segments side by side, each as wide as the widest one's label and
/// padding, so they divide the track equally: the track is that width times
/// the count, and as tall as the tallest segment. Offered less, the track
/// takes what it is offered and the segments share it equally, their labels
/// truncated, as UIKit's segmented control does; the Large Content Viewer
/// shows a segment's whole label.
struct PMEqualSegments: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    let natural = (sizes.map(\.width).max() ?? 0) * CGFloat(subviews.count)
    let width = proposal.width.map { $0.isFinite ? Swift.min(natural, $0) : natural } ?? natural
    return CGSize(width: width, height: sizes.map(\.height).max() ?? 0)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    guard !subviews.isEmpty else { return }
    let width = bounds.width / CGFloat(subviews.count)
    for (index, subview) in subviews.enumerated() {
      subview.place(
        at: CGPoint(x: bounds.minX + width * CGFloat(index), y: bounds.minY),
        proposal: ProposedViewSize(width: width, height: bounds.height))
    }
  }
}

/// A segment: an equal share of the track, its text by state, and the chip
/// under the chosen one.
private struct PMSegmentStyle: ButtonStyle {
  let checked: Bool
  let controlSize: PMControlSize

  func makeBody(configuration: Configuration) -> some View {
    PMSegment(checked: checked, controlSize: controlSize, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMSegment<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let checked: Bool
  let controlSize: PMControlSize
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let metrics = PMControlMetrics(controlSize, theme)
    let colors = theme.colors
    let motion = theme.defaultMotion
    // The chip sits half a `space-2` inside the segment on every side.
    let inset = theme.defaultDensity.space.s2 / 2
    let text =
      !enabled ? colors.textDisabled : checked || hovering || pressed ? colors.textPrimary : colors.textSecondary
    let chip = RoundedRectangle(cornerRadius: theme.radius.sm)

    label()
      .pmTextStyle(metrics.text)
      .foregroundStyle(text.color)
      .padding(.horizontal, metrics.padding)
      // The segment is the track's full height, so the chip inset in it is too.
      .frame(maxWidth: .infinity, minHeight: metrics.height)
      .background {
        if checked {
          chip.fill(colors.bgSurface.color)
            .pmShadow(enabled ? theme.shadows.control : PMShadow(layers: []))
            .padding(inset)
        }
      }
      // The hit area is the button's own, so it reaches the hit target past the track.
      .pmHitTargetOutset()
      // Hover's text change eases; the chip and the chosen text snap.
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control), value: hovering)
      .onHover { hovering = $0 }
  }
}

/// SegmentedControl's states, from the spec's States table.
public struct SegmentedControlStates: PMStates {
  public let member = "SegmentedControl"

  public init() {}

  private static let scope = [
    PMSegmentedControlOption(value: "open", label: "Open"),
    PMSegmentedControlOption(value: "pending", label: "Pending"),
    PMSegmentedControlOption(value: "closed", label: "Closed"),
  ]

  private static let appearance = [
    PMSegmentedControlOption(value: "light", label: "Light", icon: .modeLight),
    PMSegmentedControlOption(value: "dark", label: "Dark", icon: .modeDark),
    PMSegmentedControlOption(value: "system", label: "System", icon: .modeSystem),
  ]

  public var entries: [PMStateEntry] {
    let closedOff = [
      Self.scope[0], Self.scope[1],
      PMSegmentedControlOption(value: "closed", label: "Closed", disabled: true),
    ]
    return [
      PMStateEntry(
        "three options — the first chosen", expect: ["checked": "open", "size": "md", "label": "Queue"]
      ) {
        PMSegmentedControl(props: PMSegmentedControlProps(label: "Queue", options: Self.scope))
      },
      PMStateEntry("with icons", expect: ["checked": "dark"]) {
        PMSegmentedControl(
          props: PMSegmentedControlProps(
            defaultValue: "dark", label: "Appearance", options: Self.appearance))
      },
      PMStateEntry("disabled option", expect: ["checked": "open"]) {
        PMSegmentedControl(props: PMSegmentedControlProps(label: "Queue", options: closedOff))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMSegmentedControl(
          props: PMSegmentedControlProps(label: "Queue", options: Self.scope, size: .sm))
      },
      PMStateEntry("controlled", expect: ["checked": "pending"]) {
        PMSegmentedControl(
          props: PMSegmentedControlProps(
            label: "Queue", onChange: { _ in }, options: Self.scope, value: "pending"))
      },
      PMStateEntry("group disabled", expect: ["disabled": "true"]) {
        PMSegmentedControl(
          props: PMSegmentedControlProps(
            defaultValue: "pending", disabled: true, label: "Queue", options: Self.scope))
      },
    ]
  }
}
