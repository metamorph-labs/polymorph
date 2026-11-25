// DataTable (`design/components/data-table.md`), adapted: a list on iPhone, a
// table on iPad. The props are generic over the app's row type, as on the web;
// `getRowId` gives a row its identity, so the type need not be `Identifiable`,
// and SwiftUI keeps each row's state by it. Each column reads a row through
// `value` (its text) and draws it with `cell` when it has one.
//
// - **The list** (a compact width class): one row per record. The first column
//   is the row's title; every other column follows under it as a term and its
//   value, so no column is dropped on a narrow screen ("never hidden data").
//   Sortable columns are a bar of header buttons above the rows, each acting as
//   the table's header does.
// - **The table** (a regular width class, and macOS): a header row, then one
//   row per record, the columns sharing the width equally. Numeric columns
//   take tabular figures, at the side of the column the system chooses
//   (`theme.numeric.align`, the end unless the system file says start).
//
// Both are drawn with SwiftUI stacks rather than `List` and `Table`: those are
// scroll containers, and a DataTable sits inside the page archetype's own
// scroll view, as the web's sits in ListPage's panel. So `stickyHeader` is
// recorded (`sticky-header`) and not drawn: SwiftUI pins a header only as a
// section header of a lazy stack that is its scroll view's content, and the
// scroll view is the page's.
//
// Sorting is controlled: a sortable header toggles its direction when it is the
// sorted column and sorts ascending otherwise, and the app's `onSortChange`
// does the sorting. Selection is controlled too: passing `selection` turns it
// on, each row gets a Checkbox named by `getRowLabel` (or `selectRow`), and
// the header's Checkbox, checked when every row on this page is and mixed when
// some are, adds or removes this page's rows without touching the rest of the
// set. While anything is selected the bulk bar shows the count and
// `bulkActions`; a new count is announced. A row with `onRowClick` is a button
// that opens it; the Checkbox never opens it, and a row without one is drawn
// bare, so nothing in it is disabled. Loading draws the header and five rows
// of Skeletons, the first named "Loading" for assistive technology; no data
// draws `emptyState` in the body's place.
//
// `rowDetail` turns expansion on, in the list and in the table. Each row gets
// a disclosure after its Checkbox and before its cells, in a column one hit
// target wide: Button's icon-only ghost, `down` while the row is closed and
// `up` while it is open, named by `messages.detailsLabel` from `getRowName`,
// its value "expanded" or "collapsed". A press on it never opens the row. An
// open row draws what `rowDetail` returns in a row of its own under it, across
// every column, on the subtle fill. Any number of rows can be open. The table
// holds the open rows, starting from `defaultExpanded`, unless the app passes
// `expanded`; `onExpandedChange` is called with the next set in both cases. A
// row `isRowExpandable` refuses keeps the column, empty, and never draws a
// detail. `close`, which the detail is handed with its row, closes it and
// does nothing for a row that is not open. It moves no focus: UIKit's focus
// system and VoiceOver each move their own when the element they are on
// leaves. The column has no header, because a SwiftUI stack has no column for
// a header to name. A detail appears and leaves without animation, and no row
// is open while loading.
//
// To assistive technology a row whose cells are text is one element; opening
// it is its default action and selecting it a named one. A row with a column
// that draws its own `cell`, or with a disclosure, keeps its elements apart
// under the row's name, so a control in it is reachable; in a row that also
// opens, the cells are the open button's content. A detail is an element of
// its own after its row.
//
// Two props name a row's parts. `getRowName` is the row's own name, "Invoice
// 12": it names the row, and the disclosure through `detailsLabel`.
// `getRowLabel` is the whole name of the row's Checkbox, "Select Invoice 12":
// it names the Checkbox and the row's select action. A table whose app gives
// no `getRowName` names a row from `getRowLabel` when there is one, else from
// each column's header and value. That fallback is for an app that passes
// only `getRowLabel`: its rows keep their announcement.

import PolymorphTokens
import SwiftUI

public struct PMDataTable<Row>: PMDataTableRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmDataTableLayout) private var forced
  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
  #endif
  /// The table's own set of open rows. It follows every change, whoever holds
  /// the set, so it is current when the app stops passing `expanded`.
  @State private var ownExpanded: Set<String>
  @State private var latest = PMDataTableLatest()
  private let props: PMDataTableProps<Row>

  public init(props: PMDataTableProps<Row>) {
    self.props = props
    _ownExpanded = State(initialValue: props.defaultExpanded ?? [])
  }

  /// The list on a compact width class, the table otherwise.
  private var layout: PMDataTableLayout {
    if let forced { return forced }
    #if os(iOS)
      return sizeClass == .compact ? .list : .table
    #else
      return .table
    #endif
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let loading = props.loading ?? false
    let empty = !loading && props.data.isEmpty
    let selection = props.selection ?? []
    let messages = props.messages ?? PMStrings.dataTable
    let _ = latest.hold(open: open, report: props.onExpandedChange)

    VStack(alignment: .leading, spacing: 0) {
      if props.selection != nil, !selection.isEmpty, !empty {
        PMDataTableBulkBar(
          count: selection.count, text: messages.selected(Double(selection.count)),
          actions: props.bulkActions
        )
        .padding(.bottom, space.s3)
      }

      if empty {
        PMEmptyState(props: props.emptyState)
      } else {
        switch layout {
        case .list: list(loading: loading, messages: messages)
        case .table: table(loading: loading, messages: messages)
        }
      }

      if let pagination = props.pagination, !empty {
        HStack(spacing: 0) {
          Spacer(minLength: 0)
          pagination
        }
        .padding(.top, space.s4)
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("DataTable", attributes(loading: loading, empty: empty))
  }

  private func attributes(loading: Bool, empty: Bool) -> [String: String] {
    var found = ["layout": layout.rawValue, "rows": String(props.data.count)]
    if loading { found["loading"] = "true" }
    if empty { found["empty"] = "true" }
    if let selection = props.selection { found["selected"] = String(selection.count) }
    if let sort = props.sort { found["sort"] = "\(sort.key):\(sort.direction.rawValue)" }
    if props.stickyHeader == true { found["sticky-header"] = "true" }
    if props.rowDetail != nil, !loading {
      found["expanded"] = String(rows.filter { expands($0.row) && open.contains($0.id) }.count)
    }
    return found
  }

  /// The rows with their ids, which `ForEach` keeps their identity by.
  private var rows: [(id: String, row: Row)] {
    props.data.map { (id: props.getRowId($0), row: $0) }
  }

  // MARK: Expansion

  /// The open rows: the app's set when it passes one, the table's own otherwise.
  private var open: Set<String> { props.expanded ?? ownExpanded }

  /// Whether a row has a detail: expansion is on and `isRowExpandable` does
  /// not refuse the row.
  private func expands(_ row: Row) -> Bool {
    props.rowDetail != nil && (props.isRowExpandable?(row) ?? true)
  }

  private func toggleExpanded(_ id: String) {
    let next = open.symmetricDifference([id])
    ownExpanded = next
    props.onExpandedChange?(next)
  }

  /// A detail's `close`. A detail may call it after a later render, a Save
  /// that awaits and then closes, so it reads the open rows and the app's
  /// callback as they are then.
  private func close(_ id: String) {
    guard latest.open.contains(id) else { return }
    let next = latest.open.subtracting([id])
    ownExpanded = next
    latest.report?(next)
  }

  /// A disclosure's name: the app's `detailsLabel` of the row's name, else
  /// the spec's default for a row with a name and for one without.
  private func detailsName(_ row: Row, _ messages: PMDataTableMessages) -> String {
    let name = props.getRowName?(row)
    if let label = messages.detailsLabel { return label(name) }
    return name.map { PMStrings.detailsFor(rowName: $0) } ?? PMStrings.details
  }

  /// A row's cell in the expansion column, one hit target wide: the
  /// disclosure, or nothing for a row `isRowExpandable` refuses.
  private func disclosure(_ row: Row, id: String, messages: PMDataTableMessages) -> some View {
    let shown = open.contains(id)
    return ZStack {
      if expands(row) {
        PMButton(
          props: PMButtonProps(
            expanded: shown, icon: shown ? .up : .down, iconOnly: true,
            label: detailsName(row, messages), onClick: { toggleExpanded(id) }, size: .sm,
            appearance: .ghostNeutral))
      }
    }
    .frame(width: disclosureColumn)
  }

  /// An open row's detail, in a row of its own across every column: a body
  /// cell's padding and type on the subtle fill, over a rule.
  @ViewBuilder
  private func detail(_ row: Row, id: String) -> some View {
    if let rowDetail = props.rowDetail, expands(row), open.contains(id) {
      let space = theme.defaultDensity.space
      rowDetail(PMDataTableRowDetail(row: row, close: { close(id) }))
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textPrimary.color)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, space.s3)
        .padding(.horizontal, space.s4)
        .background(theme.colors.bgSubtle.color)
        .background(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
        .accessibilityElement(children: .contain)
        .pmMember("DataTable", ["part": "detail"])
    }
  }

  // MARK: The table

  @ViewBuilder
  private func table(loading: Bool, messages: PMDataTableMessages) -> some View {
    let colors = theme.colors
    let space = theme.defaultDensity.space
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        if props.selection != nil {
          selectAll(messages).frame(width: markColumn)
        }
        if props.rowDetail != nil {
          Spacer(minLength: 0).frame(width: disclosureColumn)
        }
        ForEach(Array(props.columns.enumerated()), id: \.offset) { _, column in
          header(column)
            .padding(.vertical, space.s3)
            .padding(.horizontal, space.s4)
            .frame(
              maxWidth: .infinity,
              alignment: column.numeric == true ? theme.numeric.align.alignment : .leading)
        }
      }
      .background(alignment: .bottom) { PMRule(colors.borderDefault) }
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isHeader)

      if loading {
        ForEach(0..<Self.skeletonRows, id: \.self) { index in
          HStack(spacing: 0) {
            if props.selection != nil {
              PMSkeleton(props: PMSkeletonProps(shape: .circle, size: .s4))
                .frame(width: markColumn)
            }
            if props.rowDetail != nil {
              PMSkeleton(props: PMSkeletonProps(shape: .circle, size: .s4))
                .frame(width: disclosureColumn)
            }
            ForEach(Array(props.columns.enumerated()), id: \.offset) { column, _ in
              PMSkeleton(props: PMSkeletonProps(label: busy(index, column), textStep: .sm))
                .padding(.vertical, space.s3)
                .padding(.horizontal, space.s4)
                .frame(maxWidth: .infinity)
            }
          }
          .background(alignment: .bottom) { PMRule(colors.borderSubtle) }
        }
      } else {
        ForEach(rows, id: \.id) { entry in
          tableRow(entry.row, id: entry.id, messages: messages)
          detail(entry.row, id: entry.id)
        }
      }
    }
  }

  private func tableRow(_ row: Row, id: String, messages: PMDataTableMessages) -> some View {
    let selected = props.selection?.contains(id) ?? false
    let space = theme.defaultDensity.space
    return HStack(spacing: 0) {
      if props.selection != nil {
        mark(row, id: id, selected: selected, messages: messages)
          .frame(width: markColumn)
      }
      if props.rowDetail != nil {
        disclosure(row, id: id, messages: messages)
      }
      opens(row, selected: selected) {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          ForEach(Array(props.columns.enumerated()), id: \.offset) { _, column in
            cell(column, row)
              .padding(.vertical, space.s3)
              .padding(.horizontal, space.s4)
              .frame(
                maxWidth: .infinity,
                alignment: column.numeric == true ? theme.numeric.align.alignment : .leading)
          }
        }
      }
    }
    .background(selected ? theme.colors.selectionSurface.color : .clear)
    .background(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
    .modifier(rowAccessibility(row, id: id, selected: selected, messages: messages))
  }

  // MARK: The list

  @ViewBuilder
  private func list(loading: Bool, messages: PMDataTableMessages) -> some View {
    let space = theme.defaultDensity.space
    let sortable = props.columns.filter { $0.sortable == true }
    VStack(spacing: 0) {
      if !sortable.isEmpty || props.selection != nil {
        // The header's Checkbox over the rows' Checkboxes, and the sort bar
        // over the rows' text.
        HStack(spacing: space.s3) {
          if props.selection != nil {
            selectAll(messages).frame(width: markColumn)
          }
          if props.rowDetail != nil {
            Spacer(minLength: 0).frame(width: disclosureColumn)
          }
          if !sortable.isEmpty {
            PMInline(props: PMInlineProps(children: sortBar(sortable), gap: .s4, wrap: true))
              .padding(.horizontal, space.s2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .bottom) { PMRule(theme.colors.borderDefault) }
      }

      if loading {
        ForEach(0..<Self.skeletonRows, id: \.self) { index in
          HStack(spacing: space.s3) {
            if props.selection != nil {
              PMSkeleton(props: PMSkeletonProps(shape: .circle, size: .s4))
                .frame(width: markColumn)
            }
            if props.rowDetail != nil {
              PMSkeleton(props: PMSkeletonProps(shape: .circle, size: .s4))
                .frame(width: disclosureColumn)
            }
            VStack(alignment: .leading, spacing: space.s2) {
              PMSkeleton(props: PMSkeletonProps(label: busy(index, 0), textStep: .sm))
              PMSkeleton(props: PMSkeletonProps(textStep: .xs, width: .width10))
            }
          }
          .padding(.vertical, space.s3)
          .background(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
        }
      } else {
        ForEach(rows, id: \.id) { entry in
          listRow(entry.row, id: entry.id, messages: messages)
          detail(entry.row, id: entry.id)
        }
      }
    }
  }

  private func listRow(_ row: Row, id: String, messages: PMDataTableMessages) -> some View {
    let selected = props.selection?.contains(id) ?? false
    let space = theme.defaultDensity.space
    let first = props.columns.first
    let rest = Array(props.columns.dropFirst())
    return HStack(spacing: space.s3) {
      if props.selection != nil {
        mark(row, id: id, selected: selected, messages: messages)
          .frame(width: markColumn)
      }
      if props.rowDetail != nil {
        disclosure(row, id: id, messages: messages)
      }
      opens(row, selected: selected) {
        HStack(spacing: space.s3) {
          VStack(alignment: .leading, spacing: space.s2) {
            if let first {
              cell(first, row)
            }
            if !rest.isEmpty {
              Grid(
                alignment: .leadingFirstTextBaseline, horizontalSpacing: space.s4,
                verticalSpacing: space.s1
              ) {
                ForEach(Array(rest.enumerated()), id: \.offset) { _, column in
                  GridRow {
                    Text(column.header)
                      .textCase(.uppercase)
                      .pmTextStyle(theme.text.xs)
                      .foregroundStyle(theme.colors.textSecondary.color)
                    cell(column, row)
                      .frame(maxWidth: .infinity, alignment: .leading)
                  }
                }
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          if props.onRowClick != nil {
            PMIconView(.next, size: .sm)
              .foregroundStyle(theme.colors.textMuted.color)
          }
        }
        .padding(.vertical, space.s3)
        .padding(.horizontal, space.s2)
      }
    }
    .background(selected ? theme.colors.selectionSurface.color : .clear)
    .background(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
    .modifier(rowAccessibility(row, id: id, selected: selected, messages: messages))
  }

  // MARK: Parts

  /// A row's cells: a button that opens the row when the table opens rows,
  /// with the press wash, and the cells as they are when it does not, so
  /// nothing a column draws is disabled.
  @ViewBuilder
  private func opens<Content: View>(
    _ row: Row, selected: Bool, @ViewBuilder content: () -> Content
  ) -> some View {
    if let onRowClick = props.onRowClick {
      Button {
        onRowClick(row)
      } label: {
        content().pmHitTarget()
      }
      .buttonStyle(PMDataTableRowPress(selected: selected))
    } else {
      content()
    }
  }

  /// A row's Checkbox: named by `getRowLabel`, else `selectRow`, and never the
  /// row's opener.
  private func mark(
    _ row: Row, id: String, selected: Bool, messages: PMDataTableMessages
  ) -> some View {
    PMCheckbox(
      props: PMCheckboxProps(
        ariaLabel: selectName(row, messages),
        checked: selected ? .checked : .unchecked,
        onCheckedChange: { _ in toggle(id) }))
  }

  /// The list's sortable headers, each with the table header's behaviour.
  private func sortBar(_ columns: [PMDataTableColumn<Row>]) -> PMContent {
    AnyView(
      ForEach(Array(columns.enumerated()), id: \.offset) { _, column in
        header(column).pmHitTarget()
      })
  }

  /// A cell: the column's view, or its text in the body cell's recipe. A
  /// selected row's text keeps its colour: the row's fill is the selected
  /// surface, which the contrast law holds every text role on.
  @ViewBuilder
  private func cell(_ column: PMDataTableColumn<Row>, _ row: Row) -> some View {
    if let draw = column.cell {
      draw(row)
    } else {
      Text(column.value(row))
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textPrimary.color)
        .multilineTextAlignment(
          column.numeric == true ? theme.numeric.align.textAlignment : .leading)
        .pmTabularFigures(column.numeric == true && theme.numeric.tabular)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  /// A column's header: the overline text, a button when the column sorts.
  @ViewBuilder
  private func header(_ column: PMDataTableColumn<Row>) -> some View {
    let colors = theme.colors
    let direction = props.sort?.key == column.key ? props.sort?.direction : nil
    let title = Text(column.header)
      .textCase(.uppercase)
      .pmTextStyle(theme.text.xs)
    if column.sortable == true, let onSortChange = props.onSortChange {
      Button {
        let next: PMSortDirection = direction == .asc ? .desc : .asc
        onSortChange(PMDataTableSort(key: column.key, direction: next))
      } label: {
        HStack(spacing: theme.defaultDensity.space.s1) {
          title.foregroundStyle((direction == nil ? colors.textSecondary : colors.textPrimary).color)
          PMIconView(PMSort.glyph(direction), size: .sm)
            .foregroundStyle((direction == nil ? colors.textMuted : colors.accentText).color)
        }
        .pmHitTarget()
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(column.header))
      .accessibilityValue(Text(direction.map(PMSort.spoken) ?? ""))
      .accessibilityAddTraits(direction == nil ? [] : .isSelected)
    } else {
      title
        .foregroundStyle(colors.textSecondary.color)
        .accessibilityLabel(Text(column.header))
    }
  }

  /// The header's Checkbox: checked when every row on this page is selected,
  /// mixed when some are.
  private func selectAll(_ messages: PMDataTableMessages) -> some View {
    let ids = props.data.map(props.getRowId)
    let selection = props.selection ?? []
    let chosen = ids.filter(selection.contains).count
    let state: PMCheckedState =
      ids.isEmpty || chosen == 0 ? .unchecked : chosen == ids.count ? .checked : .indeterminate
    return PMCheckbox(
      props: PMCheckboxProps(
        ariaLabel: messages.selectAll, checked: state,
        onCheckedChange: { next in
          // Adds or removes this page's rows, never the rest of the set: a
          // selection kept across pages survives the header.
          props.onSelectionChange?(
            next == .checked ? selection.union(ids) : selection.subtracting(ids))
        }))
  }

  private func toggle(_ id: String) {
    var next = props.selection ?? []
    if next.contains(id) { next.remove(id) } else { next.insert(id) }
    props.onSelectionChange?(next)
  }

  /// A row's accessibility: one element when its cells are text, its elements
  /// apart when a column draws its own cell or the row has a disclosure. The
  /// row is named by `getRowName`, its own name. Without `getRowName` it is
  /// named by `getRowLabel`, the whole name of its Checkbox, else by each
  /// column's header and value, which keeps the announcement of an app that
  /// passes only `getRowLabel`. The select action has the Checkbox's name.
  private func rowAccessibility(
    _ row: Row, id: String, selected: Bool, messages: PMDataTableMessages
  ) -> PMDataTableRowAccessibility {
    let label =
      props.getRowName?(row) ?? props.getRowLabel?(row)
      ?? props.columns.map { "\($0.header): \($0.value(row))" }.joined(separator: ", ")
    return PMDataTableRowAccessibility(
      label: label, selected: selected,
      combined: !props.columns.contains { $0.cell != nil } && !expands(row),
      open: opener(row), select: selector(id), selectName: selectName(row, messages))
  }

  /// The name of a row's Checkbox and of the row's select action:
  /// `getRowLabel`, else `selectRow`.
  private func selectName(_ row: Row, _ messages: PMDataTableMessages) -> String {
    props.getRowLabel?(row) ?? messages.selectRow
  }

  /// The loading region's one named skeleton, the first, as the web's
  /// `aria-busy`: the rest are hidden.
  private func busy(_ row: Int, _ column: Int) -> String? {
    row == 0 && column == 0 ? PMStrings.loading : nil
  }

  /// Opening a row, when the table opens rows.
  private func opener(_ row: Row) -> (@MainActor () -> Void)? {
    guard let onRowClick = props.onRowClick else { return nil }
    return { onRowClick(row) }
  }

  /// Selecting a row, when the table selects.
  private func selector(_ id: String) -> (@MainActor () -> Void)? {
    guard props.selection != nil else { return nil }
    return { toggle(id) }
  }

  /// The selection column's width: a small control's height, as on the web.
  private var markColumn: CGFloat { theme.defaultDensity.controlHeight.sm }

  /// The expansion column's width: the hit target, which a Button is laid out at.
  private var disclosureColumn: CGFloat { theme.defaultDensity.hitTarget }

  /// Skeleton rows while loading, as the spec counts them.
  private static var skeletonRows: Int { 5 }
}

/// The open rows and the app's callback as the last render had them. `close`
/// reads them when it is called, so it is a reference the view keeps and
/// writes while it draws, and nothing is drawn from it.
@MainActor
private final class PMDataTableLatest {
  var open: Set<String> = []
  var report: (@MainActor (Set<String>) -> Void)?

  func hold(open: Set<String>, report: (@MainActor (Set<String>) -> Void)?) {
    self.open = open
    self.report = report
  }
}

/// Which form a DataTable takes. A fixture or a preview can fix it with
/// `\.pmDataTableLayout`; otherwise the width class decides.
enum PMDataTableLayout: String {
  case list, table
}

private struct PMDataTableLayoutKey: EnvironmentKey {
  static let defaultValue: PMDataTableLayout? = nil
}

extension EnvironmentValues {
  /// The DataTable form to draw regardless of the width class, or `nil` to follow it.
  var pmDataTableLayout: PMDataTableLayout? {
    get { self[PMDataTableLayoutKey.self] }
    set { self[PMDataTableLayoutKey.self] = newValue }
  }
}

/// A row to assistive technology. Combined, it is one element named by
/// `label`, opened by its default action and selected by a named one.
/// Contained, its Checkbox and its cells are elements of their own, under the
/// row's name.
private struct PMDataTableRowAccessibility: ViewModifier {
  let label: String
  let selected: Bool
  let combined: Bool
  let open: (@MainActor () -> Void)?
  let select: (@MainActor () -> Void)?
  let selectName: String

  func body(content: Content) -> some View {
    if combined {
      content
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityAddTraits(open == nil ? [] : .isButton)
        .accessibilityAction { (open ?? select)?() }
        .modifier(PMNamedAction(name: select == nil ? nil : selectName, action: select))
    } else {
      content
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
  }
}

/// A named accessibility action, when there is one.
private struct PMNamedAction: ViewModifier {
  let name: String?
  let action: (@MainActor () -> Void)?

  func body(content: Content) -> some View {
    if let name, let action {
      content.accessibilityAction(named: Text(name)) { action() }
    } else {
      content
    }
  }
}

/// A row's press and selection feedback: the subtle wash while pressed, the
/// selection's hover step while a selected row is pressed.
private struct PMDataTableRowPress: ButtonStyle {
  @Environment(\.pmTheme) private var theme
  let selected: Bool

  func makeBody(configuration: Configuration) -> some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let wash: Color =
      !configuration.isPressed
      ? .clear : (selected ? colors.selectionSurfaceHover : colors.bgSubtle).color
    configuration.label
      .background(wash)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: configuration.isPressed)
  }
}

/// The bulk bar: the selection's count and the actions on it, in the
/// selection's own colour family. The count is announced when it changes.
private struct PMDataTableBulkBar: View {
  @Environment(\.pmTheme) private var theme
  let count: Int
  let text: String
  let actions: PMContent?

  /// The count, then the actions in a row of their own.
  private var content: PMContent {
    let count = Text(text)
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(theme.colors.accentText.color)
    guard let actions else { return AnyView(count) }
    let row = PMInline(props: PMInlineProps(children: actions, gap: .s3, wrap: true))
    return AnyView(
      Group {
        count
        row
      })
  }

  var body: some View {
    let space = theme.defaultDensity.space
    let shape = RoundedRectangle(cornerRadius: theme.radius.sm)
    PMInline(props: PMInlineProps(children: content, gap: .s3, justify: .between, wrap: true))
      .padding(.vertical, space.s2)
      .padding(.horizontal, space.s4)
      .background(theme.colors.selectionSurface.color, in: shape)
      .overlay { shape.strokeBorder(theme.colors.selectionBorder.color, lineWidth: 1) }
      .onChange(of: count) { _, _ in
        AccessibilityNotification.Announcement(text).post()
      }
  }
}

/// DataTable's states, from the spec: the plain table and the list, a sorted
/// column, selection with none, some and every row selected, expansion with
/// every row closed, a row open in each form, a row that takes no detail and
/// selection with expansion, loading, empty, and the pagination row.
public struct DataTableStates: PMStates {
  public let member = "DataTable"

  public init() {}

  /// A sample record: what an app's row type would be.
  struct Ticket {
    let id: String
    let subject: String
    let status: String
    let priority: String
    let replies: Int
  }

  private static let tickets = [
    Ticket(
      id: "t1", subject: "Refund for a duplicate charge", status: "Open", priority: "High",
      replies: 4),
    Ticket(
      id: "t2", subject: "Cannot sign in on mobile", status: "Waiting", priority: "Normal",
      replies: 2),
    Ticket(
      id: "t3", subject: "Invoice address is wrong", status: "Closed", priority: "Low", replies: 7),
  ]
  private static let label = "Tickets"
  private static let empty = PMEmptyStateProps(
    icon: .search, title: "No tickets match these filters")
  private static let archive = "Archive"
  private static let note = "The customer was charged twice for one order."
  private static let done = "Done"

  /// A row's detail: a line about the ticket, and a Done that closes it.
  private static func detail(_ detail: PMDataTableRowDetail<Ticket>) -> PMContent {
    AnyView(
      PMInline(
        props: PMInlineProps(
          align: .center,
          children: AnyView(
            Group {
              PMText(props: PMTextProps(children: AnyView(Text(Self.note)), size: .sm))
              PMButton(
                props: PMButtonProps(
                  label: Self.done, onClick: detail.close, size: .sm, appearance: .ghostNeutral))
            }),
          gap: .s3, justify: .between, wrap: true)))
  }

  private func columns(sortable: Bool = false) -> [PMDataTableColumn<Ticket>] {
    [
      PMDataTableColumn(
        key: "subject", header: "Subject", value: { $0.subject }, sortable: sortable),
      PMDataTableColumn(
        key: "status", header: "Status", value: { $0.status },
        cell: { AnyView(PMBadge(props: PMBadgeProps(children: $0.status))) }),
      PMDataTableColumn(
        key: "priority", header: "Priority", value: { $0.priority }, sortable: sortable),
      PMDataTableColumn(
        key: "replies", header: "Replies", value: { String($0.replies) }, sortable: sortable,
        numeric: true),
    ]
  }

  private func table(
    _ data: [Ticket] = Self.tickets, sortable: Bool = false, sort: PMDataTableSort? = nil,
    selection: Set<String>? = nil, loading: Bool? = nil, pagination: PMContent? = nil,
    stickyHeader: Bool? = nil, open: Set<String>? = nil, refuses: String? = nil
  ) -> PMDataTable<Ticket> {
    // `open` turns expansion on with those rows open at first, and `refuses`
    // names the row that takes no detail.
    var rowDetail: (@MainActor (PMDataTableRowDetail<Ticket>) -> PMContent)?
    if open != nil { rowDetail = { Self.detail($0) } }
    var isRowExpandable: (@MainActor (Ticket) -> Bool)?
    if let refuses { isRowExpandable = { $0.id != refuses } }
    return PMDataTable(
      props: PMDataTableProps(
        bulkActions: AnyView(
          PMButton(props: PMButtonProps(label: Self.archive, size: .sm, appearance: .ghostNeutral))),
        columns: columns(sortable: sortable), data: data, defaultExpanded: open,
        emptyState: Self.empty, getRowId: { $0.id }, getRowName: { $0.subject },
        isRowExpandable: isRowExpandable, label: Self.label, loading: loading,
        onRowClick: { _ in }, onSelectionChange: { _ in }, onSortChange: { _ in },
        pagination: pagination, rowDetail: rowDetail, selection: selection, sort: sort,
        stickyHeader: stickyHeader))
  }

  public var entries: [PMStateEntry] {
    let pager = AnyView(
      PMPagination(props: PMPaginationProps(onPageChange: { _ in }, page: 2, pageCount: 5)))
    return [
      PMStateEntry("table", expect: ["layout": "table", "rows": "3", "label": Self.label]) {
        table().environment(\.pmDataTableLayout, .table).pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("list", expect: ["layout": "list", "rows": "3"]) {
        table().environment(\.pmDataTableLayout, .list)
      },
      PMStateEntry("sorted ascending", expect: ["sort": "replies:asc"]) {
        table(sortable: true, sort: PMDataTableSort(key: "replies", direction: .asc))
          .environment(\.pmDataTableLayout, .table).pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("sorted in the list", expect: ["layout": "list", "sort": "replies:desc"]) {
        table(sortable: true, sort: PMDataTableSort(key: "replies", direction: .desc))
          .environment(\.pmDataTableLayout, .list)
      },
      PMStateEntry("selection, none", expect: ["selected": "0"]) {
        table(selection: []).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("selection, some", expect: ["selected": "1"]) {
        table(selection: ["t2"]).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("selection, all", expect: ["selected": "3"]) {
        table(selection: ["t1", "t2", "t3"]).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("selection in the list", expect: ["layout": "list", "selected": "1"]) {
        table(selection: ["t1"]).environment(\.pmDataTableLayout, .list)
      },
      PMStateEntry(
        "expandable, every row closed",
        expect: ["expanded": "0", "contains": "Button[expanded=false]"]
      ) {
        table(open: []).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry(
        "a row open",
        expect: ["expanded": "1", "contains": "Button[expanded=true],DataTable[part=detail]"]
      ) {
        table(open: ["t1"]).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry(
        "a row open in the list",
        expect: [
          "layout": "list", "expanded": "1",
          "contains": "Button[expanded=true],DataTable[part=detail]",
        ]
      ) {
        table(open: ["t1"]).environment(\.pmDataTableLayout, .list)
      },
      // The second row is in the open set and `isRowExpandable` refuses it, so
      // it draws no disclosure and no detail, and one row counts as open.
      PMStateEntry("a row that takes no detail", expect: ["expanded": "1"]) {
        table(open: ["t1", "t2"], refuses: "t2").environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry(
        "selection with expansion",
        expect: ["layout": "list", "selected": "1", "expanded": "1"]
      ) {
        table(selection: ["t1"], open: ["t1"]).environment(\.pmDataTableLayout, .list)
      },
      PMStateEntry("loading", expect: ["loading": "true"]) {
        table(loading: true).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("empty", expect: ["empty": "true"]) {
        table([]).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry("with pagination") {
        table(pagination: pager).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
      PMStateEntry(
        "sticky header — recorded, the page's scroll view pins nothing",
        expect: ["sticky-header": "true"]
      ) {
        table(stickyHeader: true).environment(\.pmDataTableLayout, .table)
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
    ]
  }
}
