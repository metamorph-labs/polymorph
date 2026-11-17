// Table (`design/components/table.md`), adapted: a list on iPhone, a table on
// iPad. A composition: `PMTable` around `PMTable.Row`s of `PMTable.Header` or
// `PMTable.Cell`s. Sorting logic, selection and pagination are DataTable's;
// Table draws the sort control and the states.
//
// - **The table** (a regular width class, and macOS): each row's cells share
//   the width equally, header cells in the overline style over a stronger rule,
//   body cells in `text.sm` over a subtle one; numeric cells end-aligned with
//   tabular figures.
// - **The list** (a compact width class): a body row's cells stack, the first
//   as the row's title, so a narrow screen drops no column; the header row
//   becomes a wrapping row of its headers, where the sortable ones stay buttons.
//
// A sortable header is a button with its sort glyph: the neutral `sort` at rest,
// `sort-asc` or `sort-desc` in the accent text when it is the sorted column; its
// value says the direction, as `aria-sort` does. An interactive row presses with
// the subtle wash and calls `onClick`; a selected row takes the selected
// surface, the fill the contrast law holds every text role on, so its cells
// keep their own colours. The caption names the table; `captionVisible` draws
// it above.
//
// `grid` and `multiselectable` set the web's keyboard grid model and
// `aria-multiselectable`; SwiftUI's own focus moves between the rows'
// controls, so they change nothing here. `stickyHeader` pins a header row only
// inside a scroll view whose content is a lazy stack, which the table does not
// own, so it is recorded and not drawn.

import PolymorphTokens
import SwiftUI

public struct PMTable: PMTableRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmDataTableLayout) private var forced
  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
  #endif
  private let props: PMTableProps

  public init(props: PMTableProps) {
    self.props = props
  }

  private var layout: PMDataTableLayout {
    if let forced { return forced }
    #if os(iOS)
      return sizeClass == .compact ? .list : .table
    #else
      return .table
    #endif
  }

  public var body: some View {
    let name = props.caption ?? props.label
    VStack(alignment: .leading, spacing: 0) {
      if let caption = props.caption, props.captionVisible == true {
        Text(caption)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textSecondary.color)
          .padding(.bottom, theme.defaultDensity.space.s3)
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: 0) {
        props.children
      }
      .environment(\.pmTableLayout, layout)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(name.map { Text($0) } ?? Text(verbatim: ""))
    .pmMember("Table", attributes)
  }

  private var attributes: [String: String] {
    var found = ["layout": layout.rawValue]
    if props.stickyHeader == true { found["sticky-header"] = "true" }
    if props.caption != nil {
      found["caption"] = props.captionVisible == true ? "visible" : "announced"
    }
    return found
  }
}

extension PMTable {
  /// One row: header cells or body cells.
  public struct Row: View {
    @Environment(\.pmTheme) private var theme
    @Environment(\.pmTableLayout) private var layout
    private let props: PMTableRowProps

    public init(props: PMTableRowProps) {
      self.props = props
    }

    public var body: some View {
      let selected = props.selected ?? false
      let interactive = (props.interactive ?? false) && props.onClick != nil
      let cells = PMTableRowLayout(list: layout == .list, gap: theme.defaultDensity.space.s1) {
        props.children
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Group {
        if interactive {
          Button {
            props.onClick?()
          } label: {
            cells.pmHitTarget()
          }
          .buttonStyle(PMTableRowPress(selected: selected))
        } else {
          cells
        }
      }
      .padding(.vertical, layout == .list ? theme.defaultDensity.space.s2 : 0)
      .background(selected ? theme.colors.selectionSurface.color : .clear)
      .background(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .accessibilityAddTraits(interactive ? .isButton : [])
      .pmMember("Table", rowAttributes(selected: selected, interactive: interactive))
    }

    private func rowAttributes(selected: Bool, interactive: Bool) -> [String: String] {
      var found = ["part": "row"]
      if selected { found["selected"] = "true" }
      if interactive { found["interactive"] = "true" }
      return found
    }
  }

  /// A column's header: the overline text, and a button with the sort glyph
  /// when the column sorts.
  public struct Header: View {
    @Environment(\.pmTheme) private var theme
    @Environment(\.pmTableLayout) private var layout
    private let props: PMTableHeaderProps

    public init(props: PMTableHeaderProps) {
      self.props = props
    }

    public var body: some View {
      let colors = theme.colors
      let space = theme.defaultDensity.space
      let direction = props.sortDirection
      let label = (props.children ?? AnyView(EmptyView()))
        .textCase(.uppercase)
        .pmTextStyle(theme.text.xs)
        .pmTabularFigures(props.numeric == true && theme.numeric.tabular)

      Group {
        if props.sortable == true {
          Button {
            props.onSort?()
          } label: {
            HStack(spacing: space.s1) {
              label.foregroundStyle(
                (direction == nil ? colors.textSecondary : colors.textPrimary).color)
              PMIconView(PMSort.glyph(direction), size: .sm)
                .foregroundStyle((direction == nil ? colors.textMuted : colors.accentText).color)
            }
            .pmHitTarget()
          }
          .buttonStyle(.plain)
          .accessibilityValue(Text(direction.map(PMSort.spoken) ?? ""))
          .accessibilityAddTraits(direction == nil ? [] : .isSelected)
        } else {
          label.foregroundStyle(colors.textSecondary.color)
        }
      }
      .padding(.vertical, layout == .list ? 0 : space.s3)
      .padding(.horizontal, space.s4)
      // In the table a header fills its row's height, so every header's rule
      // sits on the row's bottom edge however tall a sort button makes it.
      .frame(
        maxWidth: layout == .list ? nil : .infinity,
        maxHeight: layout == .list ? nil : .infinity,
        alignment: props.numeric == true ? .trailing : .leading
      )
      .frame(minHeight: layout == .list ? theme.defaultDensity.hitTarget : nil)
      .background(alignment: .bottom) {
        if layout == .table {
          PMRule(colors.borderDefault)
        }
      }
      .accessibilityAddTraits(.isHeader)
      .layoutValue(key: PMTableHeaderCell.self, value: true)
    }
  }

  /// A body cell: the app's view, in `text.sm`; end-aligned with tabular
  /// figures when numeric.
  public struct Cell: View {
    @Environment(\.pmTheme) private var theme
    @Environment(\.pmTableLayout) private var layout
    private let props: PMTableCellProps

    public init(props: PMTableCellProps) {
      self.props = props
    }

    public var body: some View {
      let space = theme.defaultDensity.space
      let numeric = props.numeric == true
      let list = layout == .list
      (props.children ?? AnyView(EmptyView()))
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textPrimary.color)
        .multilineTextAlignment(numeric && !list ? .trailing : .leading)
        .pmTabularFigures(numeric && theme.numeric.tabular)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, list ? 0 : space.s3)
        .padding(.horizontal, space.s4)
        .frame(maxWidth: .infinity, alignment: numeric && !list ? .trailing : .leading)
    }
  }
}

/// A header cell, which the row lays out as a header in the list.
private struct PMTableHeaderCell: LayoutValueKey {
  static let defaultValue = false
}

/// A row's cells. In the table, equal columns as tall as the tallest cell; in
/// the list, a header row wraps its headers and a body row stacks its cells.
private struct PMTableRowLayout: Layout {
  let list: Bool
  let gap: CGFloat

  private func headers(_ subviews: Subviews) -> Bool {
    !subviews.isEmpty && subviews.allSatisfy { $0[PMTableHeaderCell.self] }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width =
      proposal.width.flatMap { $0.isFinite ? $0 : nil }
      ?? subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(0, +)
    let frames = place(subviews, width: width)
    return CGSize(width: width, height: frames.map(\.maxY).max() ?? 0)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    for (subview, frame) in zip(subviews, place(subviews, width: bounds.width)) {
      subview.place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        anchor: .topLeading, proposal: ProposedViewSize(frame.size))
    }
  }

  /// Each cell's frame, from the row's top leading corner.
  private func place(_ subviews: Subviews, width: CGFloat) -> [CGRect] {
    guard !subviews.isEmpty else { return [] }
    if !list {
      let column = width / CGFloat(subviews.count)
      let heights = subviews.map {
        $0.sizeThatFits(ProposedViewSize(width: column, height: nil)).height
      }
      let tallest = heights.max() ?? 0
      return subviews.indices.map {
        CGRect(x: CGFloat($0) * column, y: 0, width: column, height: tallest)
      }
    }
    if headers(subviews) {
      var frames: [CGRect] = []
      var x: CGFloat = 0
      var y: CGFloat = 0
      var line: CGFloat = 0
      for subview in subviews {
        let extent = subview.sizeThatFits(.unspecified)
        if x > 0 && x + extent.width > width {
          x = 0
          y += line + gap
          line = 0
        }
        frames.append(CGRect(origin: CGPoint(x: x, y: y), size: extent))
        x += extent.width + gap
        line = max(line, extent.height)
      }
      return frames
    }
    var frames: [CGRect] = []
    var y: CGFloat = 0
    for subview in subviews {
      let height = subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
      frames.append(CGRect(x: 0, y: y, width: width, height: height))
      y += height + gap
    }
    return frames
  }
}

/// An interactive row's press: the subtle wash, or the selection's hover step.
private struct PMTableRowPress: ButtonStyle {
  @Environment(\.pmTheme) private var theme
  let selected: Bool

  func makeBody(configuration: Configuration) -> some View {
    let motion = theme.defaultMotion
    let wash = (selected ? theme.colors.selectionSurfaceHover : theme.colors.bgSubtle).color
    configuration.label
      .background(configuration.isPressed ? wash : .clear)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: configuration.isPressed)
  }
}

private struct PMTableLayoutKey: EnvironmentKey {
  static let defaultValue: PMDataTableLayout = .table
}

extension EnvironmentValues {
  /// The form the enclosing Table draws in, for its rows and cells.
  fileprivate var pmTableLayout: PMDataTableLayout {
    get { self[PMTableLayoutKey.self] }
    set { self[PMTableLayoutKey.self] = newValue }
  }
}

/// Table's states, from the spec's States table: the basic table and its list,
/// a numeric column, sortable unsorted and sorted both ways, interactive and
/// selected rows, and the visible caption.
public struct TableStates: PMStates {
  public let member = "Table"

  public init() {}

  private static let rows = [
    ("Refund for a duplicate charge", "Open", "4"), ("Cannot sign in", "Waiting", "2"),
    ("Wrong invoice address", "Closed", "7"),
  ]
  private static let headers = ["Subject", "Status", "Replies"]
  private static let caption = "Open tickets"

  private func text(_ string: String) -> PMContent { AnyView(Text(string)) }

  private func table(
    caption visible: Bool = false, sort: PMSortDirection? = nil,
    sortable: Bool = false, interactive: Bool = false, selected: Int? = nil
  ) -> PMTable {
    PMTable(
      props: PMTableProps(
        caption: Self.caption, captionVisible: visible,
        children: AnyView(
          Group {
            PMTable.Row(
              props: PMTableRowProps(
                children: AnyView(
                  ForEach(Array(Self.headers.enumerated()), id: \.offset) { index, header in
                    PMTable.Header(
                      props: PMTableHeaderProps(
                        children: text(header), numeric: index == 2, onSort: {},
                        sortable: sortable && index != 1, sortDirection: index == 2 ? sort : nil))
                  })))
            ForEach(Array(Self.rows.enumerated()), id: \.offset) { index, row in
              PMTable.Row(
                props: PMTableRowProps(
                  children: AnyView(
                    Group {
                      PMTable.Cell(props: PMTableCellProps(children: text(row.0)))
                      PMTable.Cell(
                        props: PMTableCellProps(
                          children: AnyView(PMBadge(props: PMBadgeProps(children: row.1)))))
                      PMTable.Cell(props: PMTableCellProps(children: text(row.2), numeric: true))
                    }),
                  interactive: interactive, onClick: {}, selected: selected == index))
            }
          })))
  }

  public var entries: [PMStateEntry] {
    let wide = { (view: PMTable) in
      view.environment(\.pmDataTableLayout, .table).pmFixtureWidth(PMFixtureWindow.narrowIPad)
    }
    return [
      PMStateEntry(
        "basic", expect: ["layout": "table", "caption": "announced", "label": Self.caption]
      ) {
        wide(table())
      },
      PMStateEntry("as a list", expect: ["layout": "list"]) {
        table(sort: .asc, sortable: true).environment(\.pmDataTableLayout, .list)
      },
      PMStateEntry("sortable, unsorted") { wide(table(sortable: true)) },
      PMStateEntry("sorted ascending") { wide(table(sort: .asc, sortable: true)) },
      PMStateEntry("sorted descending") { wide(table(sort: .desc, sortable: true)) },
      PMStateEntry("interactive rows") { wide(table(interactive: true)) },
      PMStateEntry("selected row") { wide(table(interactive: true, selected: 1)) },
      PMStateEntry("visible caption", expect: ["caption": "visible"]) {
        wide(table(caption: true))
      },
    ]
  }
}
