// Inline (`design/components/inline.md`): Stack's horizontal counterpart, for
// control rows, meta lines and action groups. `align` defaults to `center`, so
// controls of mixed heights line up; `baseline` aligns runs of text at
// different sizes on their first baselines. With `wrap`, children flow onto
// further lines, and the gap between lines equals the gap between children.
//
// A custom `Layout` places the children. Without `wrap` it shares the width as
// an `HStack` does (the least flexible child is offered its share first), and
// `justify` spreads what is left; with `wrap` each child keeps its own width
// and a line ends where the next child would not fit. A row whose children
// cannot shrink to its width, as at the largest text sizes, wraps as a `wrap`
// row does, rather than running past the window's edge.
//
// `patch` is the instance patch, as on Stack.

import PolymorphTokens
import SwiftUI

public struct PMInline: PMInlineRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMInlineProps

  public init(props: PMInlineProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let align = props.align ?? .center
    let justify = props.justify ?? .start
    let wrap = props.wrap ?? false
    let spacing = PMSpacing(gap: props.gap, p: props.p, px: props.px, py: props.py, patch: props.patch)
    var attributes = spacing.attributes
    attributes["align"] = align.rawValue
    attributes["as"] = (props.as ?? .div).rawValue
    attributes["justify"] = justify.rawValue
    if wrap { attributes["wrap"] = "true" }

    return PMInlineLayout(
      gap: space[spacing.gap ?? .s0], align: align, justify: justify, wrap: wrap
    ) {
      props.children
    }
    .padding(.horizontal, space[spacing.horizontal])
    .padding(.vertical, space[spacing.vertical])
    .accessibilityElement(children: .contain)
    .pmMember("Inline", attributes)
  }
}

/// A flex row. It is as wide as its widest line, or as wide as it is offered
/// when `justify` has free space to spread; as tall as its lines. A wrapping row
/// breaks its lines at the width it is offered.
struct PMInlineLayout: Layout {
  let gap: CGFloat
  let align: PMInlineAlign
  let justify: PMInlineJustify
  let wrap: Bool

  /// One child on a line: its index and the extent it was given.
  private struct Slot {
    let index: Int
    let extent: CGSize
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let lines = self.lines(subviews, width: offered)
    let widest = lines.map { width(of: $0) }.max() ?? 0
    let height =
      lines.map { lineHeight($0, subviews) }.reduce(0, +)
      + gap * CGFloat(max(0, lines.count - 1))
    let fills = justify != .start
    return CGSize(width: fills ? (offered ?? widest) : min(widest, offered ?? widest), height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for line in lines(subviews, width: bounds.width) {
      let height = lineHeight(line, subviews)
      let free = max(0, bounds.width - width(of: line))
      var x = bounds.minX
      var between = gap
      switch justify {
      case .start: break
      case .center: x += free / 2
      case .end: x += free
      case .between:
        if line.count > 1 { between += free / CGFloat(line.count - 1) }
      }
      let baseline =
        sized(line, subviews).map { firstBaseline(subviews[$0.index], $0.extent) }.max() ?? 0

      for slot in line {
        let subview = subviews[slot.index]
        var size = slot.extent
        let top: CGFloat
        switch align {
        case _ where subview[PMStretchesInRow.self], .stretch:
          top = y
          size.height = height
        case .start: top = y
        case .center: top = y + (height - size.height) / 2
        case .end: top = y + height - size.height
        case .baseline: top = y + baseline - firstBaseline(subview, size)
        }
        subview.place(
          at: CGPoint(x: x, y: top), anchor: .topLeading,
          proposal: ProposedViewSize(width: size.width, height: size.height))
        x += size.width + between
      }
      y += height + gap
    }
  }

  /// The children in lines, each with the width it is given. Without `wrap`
  /// there is one line, unless its children cannot shrink to the width, as at
  /// the largest text sizes: then they wrap rather than run past the edge.
  private func lines(_ subviews: Subviews, width: CGFloat?) -> [[Slot]] {
    if !wrap {
      let line = shared(subviews, width: width)
      guard let width, self.width(of: line) > width + PMGeometry.layoutTolerance else {
        return [line]
      }
    }
    var lines: [[Slot]] = []
    var line: [Slot] = []
    var used: CGFloat = 0
    for index in subviews.indices {
      var size = subviews[index].sizeThatFits(.unspecified)
      if let width, size.width > width {
        size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
      }
      let needed = line.isEmpty ? size.width : used + gap + size.width
      if let width, !line.isEmpty, needed > width {
        lines.append(line)
        line = [Slot(index: index, extent: size)]
        used = size.width
      } else {
        line.append(Slot(index: index, extent: size))
        used = needed
      }
    }
    if !line.isEmpty { lines.append(line) }
    return lines
  }

  /// One line of children sharing `width` as an `HStack` shares it: each child,
  /// least flexible first, is offered an equal share of what is left.
  private func shared(_ subviews: Subviews, width: CGFloat?) -> [Slot] {
    guard let width else {
      return subviews.indices.map {
        Slot(index: $0, extent: subviews[$0].sizeThatFits(.unspecified))
      }
    }
    let flexibility = subviews.indices.map { index -> CGFloat in
      let least = subviews[index].sizeThatFits(ProposedViewSize(width: 0, height: nil)).width
      let most = subviews[index].sizeThatFits(ProposedViewSize(width: .infinity, height: nil)).width
      return most - least
    }
    var remaining = width - gap * CGFloat(max(0, subviews.count - 1))
    var sizes = [CGSize](repeating: .zero, count: subviews.count)
    let order = subviews.indices.sorted { flexibility[$0] < flexibility[$1] }
    for (position, index) in order.enumerated() {
      let share = max(0, remaining / CGFloat(order.count - position))
      let size = subviews[index].sizeThatFits(ProposedViewSize(width: share, height: nil))
      sizes[index] = size
      remaining -= size.width
    }
    return subviews.indices.map { Slot(index: $0, extent: sizes[$0]) }
  }

  private func width(of line: [Slot]) -> CGFloat {
    line.map(\.extent.width).reduce(0, +) + gap * CGFloat(max(0, line.count - 1))
  }

  /// The children that size the line: all but those that take the line's
  /// height (`PMStretchesInRow`), unless nothing else is on it.
  private func sized(_ line: [Slot], _ subviews: Subviews) -> [Slot] {
    let sizing = line.filter { !subviews[$0.index][PMStretchesInRow.self] }
    return sizing.isEmpty ? line : sizing
  }

  private func lineHeight(_ line: [Slot], _ subviews: Subviews) -> CGFloat {
    let line = sized(line, subviews)
    guard align == .baseline else { return line.map(\.extent.height).max() ?? 0 }
    let above = line.map { firstBaseline(subviews[$0.index], $0.extent) }.max() ?? 0
    let below =
      line.map { $0.extent.height - firstBaseline(subviews[$0.index], $0.extent) }.max() ?? 0
    return above + below
  }

  private func firstBaseline(_ subview: LayoutSubview, _ extent: CGSize) -> CGFloat {
    subview.dimensions(in: ProposedViewSize(extent))[VerticalAlignment.firstTextBaseline]
  }
}

/// Inline's states, from the spec's States table. The control row is drawn
/// with Badges and Text, the members this file can rely on.
public struct InlineStates: PMStates {
  public let member = "Inline"

  public init() {}

  private static let samples = [
    "Open", "Urgent", "Billing", "Waiting", "Refund", "Escalated", "Mobile", "Invoice", "Account",
  ]
  private static let meta = "Updated"
  private static let title = "Ticket"

  private func chips(_ count: Int) -> PMContent {
    AnyView(
      ForEach(Self.samples.prefix(count), id: \.self) { chip in
        PMBadge(props: PMBadgeProps(children: chip))
      })
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("control row", expect: ["align": "center", "gap": "3"]) {
        PMInline(
          props: PMInlineProps(
            children: AnyView(
              Group {
                PMBadge(props: PMBadgeProps(children: Self.samples[0], tone: .accent))
                PMText(props: PMTextProps(children: AnyView(Text(Self.meta))))
                PMBadge(props: PMBadgeProps(children: Self.samples[1], variant: .outline))
              }),
            gap: .s3))
      },
      PMStateEntry("baseline text", expect: ["align": "baseline"]) {
        PMInline(
          props: PMInlineProps(
            align: .baseline,
            children: AnyView(
              Group {
                PMHeading(props: PMHeadingProps(children: Self.title))
                PMText(props: PMTextProps(children: AnyView(Text(Self.meta)), size: .sm))
              }),
            gap: .s2))
      },
      PMStateEntry("wrapping", expect: ["wrap": "true", "gap": "2"]) {
        PMInline(props: PMInlineProps(children: chips(9), gap: .s2, wrap: true))
      },
      PMStateEntry("justify between", expect: ["justify": "between"]) {
        PMInline(props: PMInlineProps(children: chips(3), gap: .s2, justify: .between))
      },
    ]
  }
}
