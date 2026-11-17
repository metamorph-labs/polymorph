// Grid (`design/components/grid.md`): equal tracks for card fields, stat rows
// and form pairs. `columns` is a ceiling, not a guarantee: the width the Grid is
// offered decides how many it draws (all of them from 44rem, half rounded up
// from 28rem, one below), never the device, because a Grid in a sheet and a
// Grid on a page differ in width at the same moment. A custom `Layout` reads
// the offered width directly, which the web's container query approximates
// with twelve tracks and spans. Children fill tracks in order; every cell in a
// row is offered the track's width, so content never overflows its track.
//
// `patch` is the instance patch, as on Stack.

import PolymorphTokens
import SwiftUI

public struct PMGrid: PMGridRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMGridProps

  public init(props: PMGridProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let columns = props.columns ?? .columns2
    let align = props.align ?? .stretch
    let spacing = PMSpacing(gap: props.gap, p: props.p, px: props.px, py: props.py, patch: props.patch)
    var attributes = spacing.attributes
    attributes["align"] = align.rawValue
    attributes["as"] = (props.as ?? .div).rawValue
    attributes["columns"] = String(columns.rawValue)

    return PMGridLayout(
      ceiling: columns.rawValue, gap: space[spacing.gap ?? .s0], align: align
    ) {
      props.children
    }
    .padding(.horizontal, space[spacing.horizontal])
    .padding(.vertical, space[spacing.vertical])
    .accessibilityElement(children: .contain)
    .pmMember("Grid", attributes)
  }
}

/// Equal tracks in rows. The row gap equals the column gap.
struct PMGridLayout: Layout {
  let ceiling: Int
  let gap: CGFloat
  let align: PMGridAlign

  /// The breakpoints the recipe writes, in points: geometry, not theme.
  private static let wide = PMRecipe.gridWideFrom
  private static let middle = PMRecipe.gridMiddleFrom

  /// How many columns a width draws: the ceiling, half of it rounded up, or one.
  static func columns(ceiling: Int, width: CGFloat) -> Int {
    if width >= wide { return ceiling }
    if width >= middle { return (ceiling + 1) / 2 }
    return 1
  }

  private func tracks(_ width: CGFloat?, _ subviews: Subviews) -> (count: Int, width: CGFloat) {
    guard let width else {
      let widest = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
      return (ceiling, widest)
    }
    let count = Self.columns(ceiling: ceiling, width: width)
    return (count, max(0, (width - gap * CGFloat(count - 1)) / CGFloat(count)))
  }

  private func rows(_ subviews: Subviews, count: Int, track: CGFloat) -> [[CGSize]] {
    let offer = ProposedViewSize(width: track, height: nil)
    let sizes = subviews.map { $0.sizeThatFits(offer) }
    return stride(from: 0, to: sizes.count, by: count).map {
      Array(sizes[$0..<min($0 + count, sizes.count)])
    }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let (count, track) = tracks(offered, subviews)
    let rows = rows(subviews, count: count, track: track)
    let height =
      rows.map { $0.map(\.height).max() ?? 0 }.reduce(0, +)
      + gap * CGFloat(max(0, rows.count - 1))
    return CGSize(
      width: offered ?? (track * CGFloat(count) + gap * CGFloat(count - 1)), height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let (count, track) = tracks(bounds.width, subviews)
    var y = bounds.minY
    for (row, sizes) in rows(subviews, count: count, track: track).enumerated() {
      let height = sizes.map(\.height).max() ?? 0
      for (column, size) in sizes.enumerated() {
        let x = bounds.minX + CGFloat(column) * (track + gap)
        let top: CGFloat
        switch align {
        case .stretch, .start: top = y
        case .center: top = y + (height - size.height) / 2
        case .end: top = y + height - size.height
        }
        subviews[row * count + column].place(
          at: CGPoint(x: x, y: top), anchor: .topLeading,
          proposal: ProposedViewSize(width: track, height: align == .stretch ? height : size.height))
      }
      y += height + gap
    }
  }
}

/// Grid's states, from the spec's States table. The harness's canvas is
/// narrower than 28rem, so its renders draw one column; each entry draws its
/// ceiling at a width that admits it, scaled to fit, so the ladder shows.
public struct GridStates: PMStates {
  public let member = "Grid"

  public init() {}

  private static let samples = ["Open", "Waiting", "Closed", "Merged", "Spam", "Archived"]

  private func cards(_ count: Int) -> PMContent {
    AnyView(
      ForEach(Self.samples.prefix(count), id: \.self) { sample in
        PMCard(
          props: PMCardProps(children: AnyView(PMBadge(props: PMBadgeProps(children: sample)))))
      })
  }

  /// Twelve narrow cells, so each fits a twelfth of the width.
  private func numbers() -> PMContent {
    AnyView(
      ForEach(1...12, id: \.self) { number in
        PMBadge(props: PMBadgeProps(children: String(number), variant: .outline))
      })
  }

  public var entries: [PMStateEntry] {
    let columns: [PMGridColumns] = [.columns2, .columns3, .columns4]
    let ladder = columns.map { count in
      PMStateEntry("\(count.rawValue) columns", expect: ["columns": String(count.rawValue)]) {
        GridAtWidth { PMGrid(props: PMGridProps(children: cards(6), columns: count, gap: .s3)) }
      }
    }
    return ladder + [
      PMStateEntry("gapped", expect: ["gap": "5", "columns": "3"]) {
        GridAtWidth {
          PMGrid(props: PMGridProps(children: cards(6), columns: .columns3, gap: .s5))
        }
      },
      PMStateEntry("patched", expect: ["gap": "2", "patched": "true"]) {
        GridAtWidth {
          PMGrid(
            props: PMGridProps(
              children: cards(6), columns: .columns3, gap: .s5, patch: PMLayoutPatch(gap: .s2)))
        }
      },
      PMStateEntry("twelve columns", expect: ["columns": "12"]) {
        GridAtWidth {
          PMGrid(props: PMGridProps(children: numbers(), columns: .columns12, gap: .s1))
        }
      },
    ]
  }
}

/// A fixture frame: the Grid laid out at the wide breakpoint and scaled down
/// to the space it is given, so every column of the ceiling draws.
private struct GridAtWidth<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    GeometryReader { proxy in
      let width = PMGridLayout.wideWidth
      content()
        .frame(width: width)
        .scaleEffect(proxy.size.width / width, anchor: .topLeading)
    }
  }
}

extension PMGridLayout {
  /// The narrowest width that draws every column: the fixture lays a Grid out
  /// at it.
  static var wideWidth: CGFloat { wide }
}
