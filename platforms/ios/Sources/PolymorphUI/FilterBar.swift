// FilterBar (`design/components/filter-bar.md`): the filter row of a records
// screen, and the vocabulary's toolbar. In order: the search, the filter
// controls, the clear button while something is filtered, and the result count
// at the row's end. The row wraps, one gap on both axes; narrower than 36rem
// each cluster takes a line of its own, because a search field, a filter and a
// count side by side in a phone's width are too narrow to use.
//
// The clear button fades in and out with the filtered state. The count is
// announced when it changes, as the web's polite live region announces it; the
// page announces nothing itself. Every string is in `messages`; without it the
// spec's English defaults are looked up in the app's string catalog.

import PolymorphTokens
import SwiftUI

public struct PMFilterBar: PMFilterBarRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMFilterBarProps

  public init(props: PMFilterBarProps) {
    self.props = props
  }

  public var body: some View {
    let messages = props.messages ?? PMStrings.filterBarMessages
    let motion = theme.defaultMotion
    let count = props.resultCount.map { messages.resultCount($0) }

    PMFilterBarLayout(gap: theme.defaultDensity.space.s3) {
      if let search = props.search {
        search
      }
      if let children = props.children {
        children
      }
      if props.isFiltered {
        PMButton(
          props: PMButtonProps(
            icon: .clear, label: messages.clear, onClick: props.onClear, size: .sm,
            appearance: .ghostNeutral)
        )
        .transition(.opacity)
      }
      if let count {
        Text(count)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textMuted.color)
          .onChange(of: count) { _, next in
            AccessibilityNotification.Announcement(next).post()
          }
          .layoutValue(key: PMFilterBarCount.self, value: true)
      }
    }
    .animation(
      motion.easing.standard.animation(duration: motion.duration.control), value: props.isFiltered
    )
    .accessibilityElement(children: .contain)
    .pmMember("FilterBar", props.isFiltered ? ["filtered": "true"] : [:])
  }
}

/// The result count, which the bar puts at the end of its line.
private struct PMFilterBarCount: LayoutValueKey {
  static let defaultValue = false
}

/// The bar's row: an Inline that wraps, with the count pushed to the end of its
/// line; below 36rem every child takes a line of its own.
private struct PMFilterBarLayout: Layout {
  let gap: CGFloat

  /// The width below which each cluster takes its own line, the recipe's
  /// 36rem. Geometry, not theme.
  private static let narrow = PMRecipe.filterBarNarrowBelow

  private func stacked(_ width: CGFloat) -> Bool { width < Self.narrow }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? Self.narrow
    let rows = rows(subviews, width: width)
    let height = rows.map(\.height).reduce(0, +) + gap * CGFloat(max(0, rows.count - 1))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for row in rows(subviews, width: bounds.width) {
      var x = bounds.minX
      for (index, extent) in row.items {
        let subview = subviews[index]
        if subview[PMFilterBarCount.self], !stacked(bounds.width) {
          x = bounds.maxX - extent.width
        }
        subview.place(
          at: CGPoint(x: x, y: y + (row.height - extent.height) / 2), anchor: .topLeading,
          proposal: ProposedViewSize(extent))
        x += extent.width + gap
      }
      y += row.height + gap
    }
  }

  /// The lines: one child each when stacked, otherwise as many as fit.
  private func rows(
    _ subviews: Subviews, width: CGFloat
  ) -> [(items: [(Int, CGSize)], height: CGFloat)] {
    var rows: [(items: [(Int, CGSize)], height: CGFloat)] = []
    var line: [(Int, CGSize)] = []
    var used: CGFloat = 0
    for index in subviews.indices {
      let extent: CGSize
      if stacked(width) {
        extent = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
      } else {
        let ideal = subviews[index].sizeThatFits(.unspecified)
        extent =
          ideal.width > width
          ? subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil)) : ideal
      }
      let needed = line.isEmpty ? extent.width : used + gap + extent.width
      if !line.isEmpty && (stacked(width) || needed > width) {
        rows.append((line, line.map(\.1.height).max() ?? 0))
        line = [(index, extent)]
        used = extent.width
      } else {
        line.append((index, extent))
        used = needed
      }
    }
    if !line.isEmpty { rows.append((line, line.map(\.1.height).max() ?? 0)) }
    return rows
  }
}

/// FilterBar's states, from the spec's States table: unfiltered (no clear),
/// filtered (the clear button), and a count with and without a total.
public struct FilterBarStates: PMStates {
  public let member = "FilterBar"

  public init() {}

  private static let filters = ["Open", "High priority"]

  private func controls() -> PMContent {
    AnyView(
      ForEach(Self.filters, id: \.self) { filter in
        PMButton(props: PMButtonProps(label: filter, size: .sm, appearance: .outlineNeutral))
      })
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("unfiltered") {
        PMFilterBar(props: PMFilterBarProps(children: controls(), isFiltered: false, onClear: {}))
      },
      PMStateEntry("filtered", expect: ["filtered": "true"]) {
        PMFilterBar(props: PMFilterBarProps(children: controls(), isFiltered: true, onClear: {}))
      },
      PMStateEntry("with a count", expect: ["filtered": "true"]) {
        PMFilterBar(
          props: PMFilterBarProps(
            children: controls(), isFiltered: true, onClear: {},
            resultCount: PMFilterResultCount(shown: 12, total: 48)))
      },
      PMStateEntry("a count without a total") {
        PMFilterBar(
          props: PMFilterBarProps(
            children: controls(), isFiltered: false, onClear: {},
            resultCount: PMFilterResultCount(shown: 25)))
      },
    ]
  }
}
