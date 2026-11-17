// Dashboard (`design/archetypes/dashboard.md`): the overview screen. The page
// header, the stat row, and the body's two weighted regions, in that order, in
// the page column at ListPage's thirteen of the largest space step, so the two
// overview archetypes match. It is not a widget canvas: the regions are named
// and fixed.
//
// The stat row takes data, not views: each `StatProps` is a Stat in a Card,
// in equal tracks that follow Grid's rule with the row's count as the
// ceiling (all of them from 44rem, half rounded up from 28rem, one below),
// with the page gutter between them rather than a space step. The body is the
// primary region and the secondary one at 2 to 1 from a 44rem body, stacked
// below it with the secondary second (`PMPageRegions`); with no secondary the
// primary takes the width. Each region is a column of the app's panels at the
// page gutter.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton stats, as many as the row holds (two,
// the spec's least, while the app passes an empty row), and a panel of
// Skeleton rows in each region; `failed` a danger Alert in place of the stats
// and the regions, with `onRetry` when it is set; `empty` is `ready`, because
// each panel's members carry their own empty states.
//
// `Dashboard.Panel`, the named region, is drawn here as `PMDashboard.Panel`:
// a Card with the panel's title as the card's `title`, which Card draws in
// the section-heading recipe as a level-2 heading, so a panel and a titled
// card are one drawing. The registry lists no props for the part, so the
// contract has no `PMDashboardPanelProps` to build it from, and the part is
// internal until it does.

import PolymorphTokens
import SwiftUI

public struct PMDashboard: PMDashboardRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMDashboardProps

  public init(props: PMDashboardProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let status = props.loadStatus
    let stats = props.stats ?? []

    PMPage(measure: PMRecipe.dashboardMeasure, member: "Dashboard", status: status) {
      PMPageHeader(
        props: PMPageHeaderProps(
          actions: props.actions, description: props.description, title: props.title))
      switch status {
      case .ready, .empty:
        if !stats.isEmpty {
          statRow(count: stats.count) {
            ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
              PMCard(props: PMCardProps(children: AnyView(PMStat(props: stat))))
            }
          }
        }
        regions(primary: props.primary, secondary: props.secondary)
      case .loading:
        if let held = props.stats {
          let count = held.isEmpty ? Self.fewestStats : held.count
          statRow(count: count) {
            ForEach(0..<count, id: \.self) { index in
              PMCard(
                props: PMCardProps(children: AnyView(PMDashboardStatSkeleton(first: index == 0))))
            }
          }
        }
        regions(
          primary: AnyView(PMPagePanel { PMPageSkeletonRows().padding(space.s6) }),
          secondary: props.secondary.map { _ in
            AnyView(PMPagePanel { PMPageSkeletonRows(rows: 3).padding(space.s6) })
          })
      case .failed(let message):
        PMPageFailure(message: message, onRetry: props.onRetry)
      }
    }
  }

  /// The stat row: `count` equal tracks at most, by Grid's rule, the page
  /// gutter between them.
  private func statRow<Content: View>(count: Int, @ViewBuilder content: () -> Content)
    -> some View
  {
    PMGridLayout(ceiling: count, gap: theme.defaultDensity.space.s6, align: .stretch) {
      content()
    }
  }

  /// The body: the primary region, and the secondary one beside it at a third
  /// of the width or under it.
  private func regions(primary: PMContent, secondary: PMContent?) -> some View {
    let space = theme.defaultDensity.space
    return PMPageRegions(tracks: .weighted(main: 2, side: 1), gap: space.s6) {
      VStack(alignment: .leading, spacing: space.s6) { primary }
        .frame(maxWidth: .infinity, alignment: .topLeading)
      if let secondary {
        VStack(alignment: .leading, spacing: space.s6) { secondary }
          .frame(maxWidth: .infinity, alignment: .topLeading)
      }
    }
  }

  /// The fewest stats a row holds, which a loading row shows while the app
  /// has none yet.
  static let fewestStats = 2
}

extension PMDashboard {
  /// A named region: a Card whose `title` is the panel's, drawn above the
  /// content in the section-heading recipe and spoken as written, as a
  /// level-2 heading.
  struct Panel: View {
    let title: String?
    let content: PMContent

    var body: some View {
      PMCard(props: PMCardProps(children: content, title: title))
    }
  }
}

/// A stat while it loads: the label's line and the value's, the first tile's
/// label named "Loading" for assistive technology and the rest hidden.
private struct PMDashboardStatSkeleton: View {
  @Environment(\.pmTheme) private var theme
  let first: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s2) {
      PMSkeleton(
        props: PMSkeletonProps(
          label: first ? PMStrings.loading : nil, textStep: .xs, width: .width9))
      PMSkeleton(props: PMSkeletonProps(textStep: .textStep3xl, width: .width10))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Dashboard's states: the spec's four compositions, the four load states the
/// screen contract names, and the two weighted regions at a landscape iPad's
/// width. Each names what its body holds (`contains`). LineChart has no
/// SwiftUI view yet, so the volume panel of the web's fixture is left out;
/// the Table in a panel is drawn as the list a phone shows.
public struct DashboardStates: PMStates {
  public let member = "Dashboard"

  public init() {}

  private static let title = "Overview"
  private static let description = "The last seven days."
  private static let failure = "The overview could not be loaded. Check your connection."
  private static let onCall = "Ada Lovelace, until Friday."
  private static let backlog = "1,204 conversations."
  private static let tickets = [
    ("Webhook retries stop after the first 5xx", "4m ago"),
    ("SSO login loops back to the sign-in page", "26m ago"),
  ]
  private static let stats = [
    PMStatProps(
      delta: PMStatDelta(value: "8%", direction: .down, positive: true), label: "Open tickets",
      value: "128"),
    PMStatProps(icon: .time, label: "First response", value: "14m"),
    PMStatProps(
      delta: PMStatDelta(value: "3pts", direction: .down), label: "Satisfaction", value: "91%"),
  ]

  private static func text(_ string: String) -> PMContent {
    AnyView(Text(string))
  }

  private static func table(layout: PMDataTableLayout) -> PMContent {
    AnyView(
      PMTable(
        props: PMTableProps(
          children: AnyView(
            Group {
              PMTable.Row(
                props: PMTableRowProps(
                  children: AnyView(
                    Group {
                      PMTable.Header(props: PMTableHeaderProps(children: text("Ticket")))
                      PMTable.Header(
                        props: PMTableHeaderProps(children: text("Updated"), numeric: true))
                    })))
              ForEach(Array(tickets.enumerated()), id: \.offset) { _, ticket in
                PMTable.Row(
                  props: PMTableRowProps(
                    children: AnyView(
                      Group {
                        PMTable.Cell(props: PMTableCellProps(children: text(ticket.0)))
                        PMTable.Cell(
                          props: PMTableCellProps(children: text(ticket.1), numeric: true))
                      })))
              }
            }),
          label: "Recent tickets")
      )
      .environment(\.pmDataTableLayout, layout))
  }

  private static func panel(_ title: String?, _ content: PMContent) -> PMContent {
    AnyView(PMDashboard.Panel(title: title, content: content))
  }

  private static func paragraph(_ string: String) -> PMContent {
    AnyView(PMText(props: PMTextProps(children: text(string))))
  }

  private static func full(
    _ status: PMLoadStatus, layout: PMDataTableLayout = .list
  ) -> PMDashboard {
    PMDashboard(
      props: PMDashboardProps(
        loadStatus: status, onRetry: {}, description: description,
        primary: panel("Recent tickets", table(layout: layout)),
        secondary: AnyView(
          Group {
            panel("On call", paragraph(onCall))
            panel("Backlog", paragraph(backlog))
          }),
        stats: stats, title: title))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "three stats, a table and a narrow column",
        expect: ["status": "ready", "contains": "Stat,Card,Table"]
      ) {
        Self.full(.ready).pmFixtureScreenTop()
      },
      PMStateEntry("four stats", expect: ["status": "ready", "contains": "Stat,Table"]) {
        PMDashboard(
          props: PMDashboardProps(
            loadStatus: .ready,
            primary: Self.panel("Recent tickets", Self.table(layout: .list)),
            stats: Self.stats + [PMStatProps(label: "Escalations", value: "17")],
            title: Self.title)
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry(
        "no second column — the primary takes the width",
        expect: ["status": "ready", "contains": "Stat,Table"]
      ) {
        PMDashboard(
          props: PMDashboardProps(
            loadStatus: .ready,
            primary: Self.panel("Recent tickets", Self.table(layout: .list)),
            stats: Array(Self.stats.prefix(2)), title: Self.title)
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry(
        "a panel with no title, and no stats at all",
        expect: ["status": "ready", "contains": "Card,Table"]
      ) {
        PMDashboard(
          props: PMDashboardProps(
            loadStatus: .ready, primary: Self.panel(nil, Self.table(layout: .list)),
            title: Self.title)
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry("loading", expect: ["status": "loading", "contains": "Skeleton"]) {
        Self.full(.loading).pmFixtureScreenTop()
      },
      PMStateEntry("empty — as ready", expect: ["status": "empty", "contains": "Stat,Table"]) {
        Self.full(.empty).pmFixtureScreenTop()
      },
      PMStateEntry("failed", expect: ["status": "failed", "contains": "Alert"]) {
        Self.full(.failed(message: Self.failure))
          .pmFixtureScreenTop()
      },
      PMStateEntry(
        "on an iPad — the stat row and the regions side by side",
        expect: ["status": "ready", "contains": "Stat,Table"]
      ) {
        Self.full(.ready, layout: .table)
          .pmFixtureWidth(PMFixtureWindow.landscapeIPad)
      },
    ]
  }
}
