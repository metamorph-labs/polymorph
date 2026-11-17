// ListPage (`design/archetypes/list-page.md`): the records screen. The page
// header, the summary band, the filter row and the body panel, in that order,
// in a scroll view. The order is the archetype's, so a screen cannot assemble
// it another way.
//
// The body is a panel in Card's surface recipe, and the load status decides
// what is in it (`design/native/screen-contract.md`, "The four load states"):
// `ready` draws `children`, `loading` rows of Skeletons, `empty` the
// `emptyState` the page cannot be built without, and `failed` a danger Alert
// with the message, offering `onRetry` when it is set. The header, the summary
// and the filters render in every state, so the page's own numbers outlive a
// filter that matches nothing. The body swaps with a fade at the surface's
// duration; nothing moves focus.
//
// The page column, the panel, the failed Alert and the skeleton rows are what
// the page archetypes share (`PolymorphUI+Pages.swift`).

import PolymorphTokens
import SwiftUI

public struct PMListPage: PMListPageRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMListPageProps

  public init(props: PMListPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let status = props.loadStatus

    PMPage(measure: PMRecipe.listPageMeasure, member: "ListPage", status: status) {
      PMPageHeader(
        props: PMPageHeaderProps(
          actions: props.actions, description: props.description, title: props.title))
      if let summary = props.summary {
        summary
      }
      if let filters = props.filters {
        PMInline(props: PMInlineProps(children: filters, gap: .s3, wrap: true))
      }
      PMPagePanel {
        switch status {
        case .ready:
          props.children
        case .loading:
          PMPageSkeletonRows()
            .padding(space.s4)
        case .empty:
          PMEmptyState(props: props.emptyState)
        case .failed(let message):
          PMPageFailure(message: message, onRetry: props.onRetry)
            .padding(space.s4)
        }
      }
    }
  }
}

/// ListPage's states: the four load states the screen contract names, the
/// summary band, and the filtered-dry empty state with its secondary action.
/// Each names what its panel holds (`contains`): the table, the Skeletons,
/// the empty state or the Alert.
public struct ListPageStates: PMStates {
  public let member = "ListPage"

  public init() {}

  private static let title = "Tickets"
  private static let description = "Everything customers have asked, newest first."
  private static let create = "New ticket"
  private static let clear = "Clear filters"

  private func page(
    _ status: PMLoadStatus, summary: PMContent? = nil, filtered: Bool = false
  ) -> some View {
    let empty =
      filtered
      ? PMEmptyStateProps(
        icon: .search,
        secondaryAction: AnyView(
          PMButton(props: PMButtonProps(label: Self.clear, appearance: .ghostNeutral))),
        title: "No tickets match these filters")
      : PMEmptyStateProps(title: "No tickets yet")
    return PMListPage(
      props: PMListPageProps(
        loadStatus: status, onRetry: {},
        actions: AnyView(PMButton(props: PMButtonProps(icon: .add, label: Self.create))),
        children: PMPageSamples.table(), description: Self.description, emptyState: empty,
        filters: AnyView(
          Group {
            PMBadge(props: PMBadgeProps(children: "Open", variant: .outline))
            PMBadge(props: PMBadgeProps(children: "High", variant: .outline))
          }),
        summary: summary, title: Self.title)
    )
  }

  private func summary() -> PMContent {
    AnyView(
      PMGrid(
        props: PMGridProps(
          children: AnyView(
            Group {
              PMCard(
                props: PMCardProps(
                  children: AnyView(PMStat(props: PMStatProps(label: "Open", value: "128")))))
              PMCard(
                props: PMCardProps(
                  children: AnyView(PMStat(props: PMStatProps(label: "Waiting", value: "36")))))
            }),
          columns: .columns4, gap: .s6)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("ready", expect: ["status": "ready", "contains": "DataTable"]) {
        page(.ready)
      },
      PMStateEntry("loading", expect: ["status": "loading", "contains": "Skeleton"]) {
        page(.loading)
      },
      PMStateEntry("empty", expect: ["status": "empty", "contains": "EmptyState"]) {
        page(.empty)
      },
      PMStateEntry("failed", expect: ["status": "failed", "contains": "Alert"]) {
        page(.failed(message: PMPageSamples.failure))
      },
      PMStateEntry("with a summary", expect: ["status": "ready", "contains": "Stat,DataTable"]) {
        page(.ready, summary: summary())
      },
      PMStateEntry(
        "empty with a summary", expect: ["status": "empty", "contains": "Stat,EmptyState"]
      ) {
        page(.empty, summary: summary())
      },
      PMStateEntry(
        "filtered dry",
        expect: ["status": "empty", "contains": "EmptyState,Button[variant=ghost tone=neutral]"]
      ) {
        page(.empty, filtered: true)
      },
    ]
  }
}
