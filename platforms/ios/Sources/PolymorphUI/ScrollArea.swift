// ScrollArea (`design/components/scroll-area.md`): a token-styled scrollbar on a
// region the scroll map already lets scroll. It creates no scroll region of its
// own design: the viewport is a SwiftUI `ScrollView` on the axes `orientation`
// names, with the system's indicators hidden, and the member draws the rail and
// the thumb from the recipe beside it.
//
// iOS shows its own indicators only while a scroll view moves, which is the
// overlay habit the spec's guardrail forbids: a region at rest would look
// complete when it is not. So the drawn rail stands in for them, and it is a
// statement about the content in both directions:
//
// - **`always`** (the default): the rail is drawn whenever the content
//   overflows on its axis, and the viewport reserves the rail's thickness
//   (`space.3`) on that edge, so the last line scrolls clear of the thumb.
// - **`hover`**: the rail overlays the content and shows while a pointer is
//   over the region (an iPad's pointer, a Mac's), fading in and out at the
//   control durations. It reserves nothing, because a gutter that appears on
//   hover would move the content.
// - **No overflow, either type: no rail.**
//
// The thumb is `border.strong` in a pill, its length the viewport's share of
// the content with a floor of `space.6`, its position the scroll offset's share
// of the distance the content can travel. It follows the offset and is never
// animated. It depicts the position and is not a handle: on iOS the region
// pans under the finger, and iOS 17 has no offset a drawn handle could set.
// The rail and the thumb are hidden from assistive technology. While the
// content overflows, the region is a container named by `label`, as the web
// names its region; a region that does not scroll has no name of its own.

import PolymorphTokens
import SwiftUI

public struct PMScrollArea: PMScrollAreaRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @State private var viewport: CGSize = .zero
  @State private var content: CGSize = .zero
  @State private var offset: CGPoint = .zero
  @State private var hovering = false
  private let props: PMScrollAreaProps

  public init(props: PMScrollAreaProps) {
    self.props = props
  }

  public var body: some View {
    let orientation = props.orientation ?? .vertical
    let type = props.type ?? .always
    let space = theme.defaultDensity.space
    let rails = PMScrollAreaRails(orientation: orientation, viewport: viewport, content: content)
    // The `always` gutter: the rail's thickness, reserved on each edge a rail is drawn on.
    let gutter = type == .always ? space.s3 : 0
    let shown = type == .always || hovering

    viewportView(orientation: orientation, rails: rails, gutter: gutter)
      .onGeometryChange(for: CGSize.self) {
        $0.size
      } action: {
        viewport = $0
      }
      .overlay(alignment: .topTrailing) {
        if rails.vertical {
          PMScrollRail(
            axis: .vertical, length: viewport.height - (rails.horizontal ? space.s3 : 0),
            visible: viewport.height, content: content.height, offset: offset.y, shown: shown)
        }
      }
      .overlay(alignment: .bottomLeading) {
        if rails.horizontal {
          PMScrollRail(
            axis: .horizontal, length: viewport.width - (rails.vertical ? space.s3 : 0),
            visible: viewport.width, content: content.width, offset: offset.x, shown: shown)
        }
      }
      .onHover { hovering = $0 }
      .accessibilityElement(children: .contain)
      .modifier(PMOptionalLabel(label: rails.any ? props.label : nil))
      .pmMember("ScrollArea", attributes(orientation, type, rails: rails, shown: shown))
  }

  /// The region: the content in a scroll view on the orientation's axes, or,
  /// with scrolling off, the content at rest at the start of its box, clipped.
  /// Either way the content's size is measured, padded by the gutter on each
  /// edge a rail is drawn on.
  @ViewBuilder
  private func viewportView(
    orientation: PMScrollAreaOrientation, rails: PMScrollAreaRails, gutter: CGFloat
  ) -> some View {
    let axes = Self.axes(orientation)
    let inner = props.children
      .frame(maxWidth: orientation == .vertical ? .infinity : nil, alignment: .topLeading)
      .padding(.trailing, rails.vertical ? gutter : 0)
      .padding(.bottom, rails.horizontal ? gutter : 0)
      .onGeometryChange(for: CGSize.self) {
        $0.size
      } action: {
        content = $0
      }

    if scrolls {
      ScrollView(axes) {
        inner
          .onGeometryChange(for: CGPoint.self) {
            $0.frame(in: .scrollView).origin
          } action: { origin in
            offset = CGPoint(x: -origin.x, y: -origin.y)
          }
      }
      .scrollIndicators(.hidden)
    } else {
      inner
        .fixedSize(horizontal: axes.contains(.horizontal), vertical: axes.contains(.vertical))
        // Zero minimums, so the box is the one offered and not the content's.
        .frame(
          minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity,
          alignment: .topLeading
        )
        .clipped()
    }
  }

  private static func axes(_ orientation: PMScrollAreaOrientation) -> Axis.Set {
    switch orientation {
    case .vertical: .vertical
    case .horizontal: .horizontal
    case .both: [.horizontal, .vertical]
    }
  }

  /// The orientation and type as set; which rails are drawn (`none` when the
  /// content fits); and, while one is, `visible` or `hidden`, the web's
  /// scrollbar `data-state`.
  private func attributes(
    _ orientation: PMScrollAreaOrientation, _ type: PMScrollAreaType, rails: PMScrollAreaRails,
    shown: Bool
  ) -> [String: String] {
    var found = [
      "orientation": orientation.rawValue, "type": type.rawValue, "rails": rails.name,
    ]
    if rails.any { found["state"] = shown ? "visible" : "hidden" }
    return found
  }
}

/// Which rails a region draws: one on each axis it may pan on and overflows on.
private struct PMScrollAreaRails {
  let vertical: Bool
  let horizontal: Bool

  init(orientation: PMScrollAreaOrientation, viewport: CGSize, content: CGSize) {
    let tall = viewport.height > 0 && content.height > viewport.height + PMGeometry.layoutTolerance
    let wide = viewport.width > 0 && content.width > viewport.width + PMGeometry.layoutTolerance
    vertical = orientation != .horizontal && tall
    horizontal = orientation != .vertical && wide
  }

  var any: Bool { vertical || horizontal }

  var name: String {
    switch (vertical, horizontal) {
    case (true, true): "both"
    case (true, false): "vertical"
    case (false, true): "horizontal"
    case (false, false): "none"
    }
  }
}

/// One rail: `space.3` thick on the region's end edge, transparent, with the
/// thumb inset `space.1` from its edges. `length` is the rail's own length
/// (the viewport's, less the corner where two rails meet); `visible`,
/// `content` and `offset` are the viewport's extent, the content's and the
/// scroll offset on the rail's axis.
///
/// A `hover` rail fades: in at the control duration on the enter easing, out
/// at the control's exit duration on the exit easing, as Input's clear button
/// does. Under Reduce Motion it appears and goes at once. An `always` rail is
/// always shown.
private struct PMScrollRail: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let axis: Axis
  let length: CGFloat
  let visible: CGFloat
  let content: CGFloat
  let offset: CGFloat
  let shown: Bool

  var body: some View {
    let space = theme.defaultDensity.space
    let inset = space.s1
    let track = max(0, length - inset - inset)
    let thickness = space.s3 - inset - inset
    let thumb = min(track, max(space.s6, track * visible / max(content, 1)))
    let travel = max(0, content - visible)
    let progress = travel > 0 ? min(1, max(0, offset / travel)) : 0
    let along = (track - thumb) * progress
    let vertical = axis == .vertical

    RoundedRectangle(cornerRadius: theme.radius.pill)
      .fill(theme.colors.borderStrong.color)
      .frame(
        width: vertical ? thickness : thumb, height: vertical ? thumb : thickness
      )
      .offset(x: vertical ? 0 : along, y: vertical ? along : 0)
      .padding(inset)
      .frame(
        width: vertical ? space.s3 : max(0, length), height: vertical ? max(0, length) : space.s3,
        alignment: .topLeading
      )
      .opacity(shown ? 1 : 0)
      .animation(fade, value: shown)
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }

  private var fade: Animation? {
    let motion = theme.defaultMotion
    if reduceMotion { return nil }
    return shown
      ? motion.easing.enter.animation(duration: motion.duration.control)
      : motion.easing.exit.animation(duration: motion.duration.controlExit)
  }
}

/// ScrollArea's states, from the spec's States table. The harness renders with
/// `ImageRenderer`, which draws no scroll view's content, so every entry turns
/// scrolling off: the content shows at rest, at the start of its box and
/// clipped, with the rail and the thumb where they stand before any scrolling.
/// The renders show the rail, the thumb's length and the gutter; they cannot
/// show the thumb following a scroll, nor the hover rail appearing under a
/// pointer.
public struct ScrollAreaStates: PMStates {
  public let member = "ScrollArea"

  public init() {}

  private static let label = "Notification settings"
  private static let keyLabel = "API key"
  private static let rows = [
    ("Daily digest", "One summary each morning instead of a notification per reply."),
    ("Mentions", "Notify when a teammate mentions you in a ticket."),
    ("Assignments", "Notify when a ticket is assigned to you."),
    ("Escalations", "Notify when a ticket you follow is escalated."),
    ("Replies", "Notify on every customer reply."),
    ("Snooze returns", "Notify when a snoozed ticket wakes."),
    ("Weekly report", "A summary of the queue every Monday."),
    ("Quiet hours", "Silence everything between 20:00 and 07:00."),
  ]
  /// A value with no break opportunities, so a narrow box must pan for it.
  private static let unbroken = "pm_live_9f2c4e8b7a614d3f8c25b1e07d9a3c6f41e8b2d5"

  private static func row(_ entry: (String, String)) -> some View {
    PMSettingsRow(
      props: PMSettingsRowProps(
        control: AnyView(PMSwitch(props: PMSwitchProps(ariaLabel: entry.0, defaultChecked: true))),
        description: entry.1, label: entry.0))
  }

  private static func rows(_ count: Int = rows.count) -> PMContent {
    AnyView(
      PMStack(
        props: PMStackProps(
          children: AnyView(
            ForEach(Array(Self.rows.prefix(count).enumerated()), id: \.offset) { _, entry in
              row(entry)
            }),
          gap: .s4)))
  }

  private static func apiKey() -> PMContent {
    AnyView(PMText(props: PMTextProps(children: AnyView(Text(Self.unbroken)), size: .sm)))
  }

  private static func area(
    _ children: PMContent, label: String = Self.label,
    orientation: PMScrollAreaOrientation? = nil, type: PMScrollAreaType? = nil
  ) -> PMScrollArea {
    PMScrollArea(
      props: PMScrollAreaProps(
        children: children, label: label, orientation: orientation, type: type))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "vertical — the rail says more is coming",
        expect: ["rails": "vertical", "state": "visible", "label": Self.label]
      ) {
        PMScrollAreaHarness(box: .tall) { Self.area(Self.rows()) }
      },
      PMStateEntry(
        "horizontal — wide content in a narrow box",
        expect: ["orientation": "horizontal", "rails": "horizontal", "label": Self.keyLabel]
      ) {
        PMScrollAreaHarness(box: .narrow) {
          Self.area(Self.apiKey(), label: Self.keyLabel, orientation: .horizontal)
        }
      },
      PMStateEntry(
        "both — two rails and the corner", expect: ["orientation": "both", "rails": "both"]
      ) {
        PMScrollAreaHarness(box: .square) {
          Self.area(
            AnyView(
              PMStack(
                props: PMStackProps(
                  children: AnyView(
                    Group {
                      Self.apiKey()
                      Self.rows()
                    }), gap: .s4))),
            orientation: .both)
        }
      },
      PMStateEntry(
        "fits — no rail on a region with nothing more to give", expect: ["rails": "none"]
      ) {
        PMScrollAreaHarness(box: .tall) { Self.area(Self.rows(1)) }
      },
      PMStateEntry(
        "hover type — the rail overlays, hidden until the pointer arrives",
        expect: ["type": "hover", "rails": "vertical", "state": "hidden"]
      ) {
        PMScrollAreaHarness(box: .tall) { Self.area(Self.rows(), type: .hover) }
      },
    ]
  }
}

/// The spec's harness boxes, which the consumer sizes: the region is sized by
/// what holds it. `tall` is the canvas's width and 16rem high (two of the
/// largest space step and one `space.9`), `narrow` two of the largest space
/// step wide and as tall as its content, `square` that width both ways.
private struct PMScrollAreaHarness<Content: View>: View {
  enum Box { case tall, narrow, square }

  @Environment(\.pmTheme) private var theme
  let box: Box
  @ViewBuilder let content: () -> Content

  var body: some View {
    let space = theme.defaultDensity.space
    let side = space.s10 * PMFixtureSpan.sample
    Group {
      switch box {
      case .tall: content().frame(height: side + space.s9)
      case .narrow: content().frame(width: side).fixedSize(horizontal: false, vertical: true)
      case .square: content().frame(width: side, height: side)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
