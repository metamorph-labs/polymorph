// Stack (`design/components/stack.md`): children in a column with a gap from the
// space scale. It draws nothing: no fill, border or radius, because surfaces are
// Card's. A custom `Layout` places the children, so `align` and `justify` apply
// to each child of the content, as flexbox applies them on the web; a `VStack`
// cannot spread children apart (`between`) or stretch them without wrapping
// each one.
//
// `patch` is the instance patch, rung 3 of the exception ladder: its keys
// override the props of the same names.

import PolymorphTokens
import SwiftUI

public struct PMStack: PMStackRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMStackProps

  public init(props: PMStackProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let align = props.align ?? .stretch
    let justify = props.justify ?? .start
    let spacing = PMSpacing(gap: props.gap, p: props.p, px: props.px, py: props.py, patch: props.patch)

    PMStackLayout(gap: space[spacing.gap ?? .s0], align: align, justify: justify) {
      props.children
    }
    .padding(.horizontal, space[spacing.horizontal])
    .padding(.vertical, space[spacing.vertical])
    // A group, never an element of its own: the children are read one by one,
    // as the web's layout primitives are invisible to assistive technology.
    .accessibilityElement(children: .contain)
    .pmMember(
      "Stack",
      spacing.attributes.merging(
        ["align": align.rawValue, "as": (props.as ?? .div).rawValue, "justify": justify.rawValue],
        uniquingKeysWith: { first, _ in first }))
  }
}

/// A flex column. The column takes the width it is offered and the height of
/// its content. With a `justify` other than `start` it takes the height it is
/// offered too, when that is more, because spreading needs free space: on the
/// web the parent gives it that height, here the parent's offer does. Each
/// child is offered the column's width: a flexible child fills it (`stretch`),
/// and a child narrower than the column sits at `align`.
struct PMStackLayout: Layout {
  let gap: CGFloat
  let align: PMStackAlign
  let justify: PMStackJustify

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: offered, height: nil)) }
    let content = sizes.map(\.height).reduce(0, +) + gap * CGFloat(max(0, subviews.count - 1))
    let widest = sizes.map(\.width).max() ?? 0
    let tall = proposal.height.flatMap { $0.isFinite ? $0 : nil } ?? content
    return CGSize(width: offered ?? widest, height: justify == .start ? content : max(content, tall))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let offer = ProposedViewSize(width: bounds.width, height: nil)
    let sizes = subviews.map { $0.sizeThatFits(offer) }
    let content = sizes.map(\.height).reduce(0, +) + gap * CGFloat(max(0, subviews.count - 1))
    let free = max(0, bounds.height - content)

    var y = bounds.minY
    var between = gap
    switch justify {
    case .start: break
    case .center: y += free / 2
    case .end: y += free
    case .between:
      if subviews.count > 1 { between += free / CGFloat(subviews.count - 1) }
    }

    for (subview, size) in zip(subviews, sizes) {
      let x: CGFloat
      switch align {
      case .stretch, .start: x = bounds.minX
      case .center: x = bounds.midX - size.width / 2
      case .end: x = bounds.maxX - size.width
      }
      let width = align == .stretch ? bounds.width : size.width
      subview.place(
        at: CGPoint(x: x, y: y), anchor: .topLeading,
        proposal: ProposedViewSize(width: width, height: size.height))
      y += size.height + between
    }
  }
}

/// Stack's states, from the spec's States table.
public struct StackStates: PMStates {
  public let member = "Stack"

  public init() {}

  private static let samples = ["Open", "Waiting", "Closed"]

  private func chips() -> PMContent {
    AnyView(
      ForEach(Self.samples, id: \.self) { chip in
        PMBadge(props: PMBadgeProps(children: chip))
      })
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("gap 3", expect: ["gap": "3", "align": "stretch"]) {
        PMStack(props: PMStackProps(children: chips(), gap: .s3))
      },
      PMStateEntry("gap 6", expect: ["gap": "6"]) {
        PMStack(props: PMStackProps(children: chips(), gap: .s6))
      },
      PMStateEntry("padded", expect: ["p": "5"]) {
        PMStack(props: PMStackProps(children: chips(), gap: .s2, p: .s5))
      },
      PMStateEntry("axis override", expect: ["p": "5", "py": "2"]) {
        PMStack(props: PMStackProps(children: chips(), gap: .s2, p: .s5, py: .s2))
      },
      PMStateEntry("align and justify", expect: ["align": "center", "justify": "between"]) {
        PMStack(props: PMStackProps(align: .center, children: chips(), justify: .between))
          .frame(maxHeight: .infinity)
      },
      PMStateEntry("as list", expect: ["as": "ul"]) {
        PMStack(props: PMStackProps(as: .ul, children: chips(), gap: .s1))
      },
      PMStateEntry("patched", expect: ["gap": "2", "patched": "true"]) {
        PMStack(props: PMStackProps(children: chips(), gap: .s6, patch: PMLayoutPatch(gap: .s2)))
      },
    ]
  }
}
