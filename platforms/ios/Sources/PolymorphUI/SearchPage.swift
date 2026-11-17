// SearchPage (`design/archetypes/search-page.md`): the page whose subject is a
// query. The page header, the search block (the field, then the filters under
// it in a wrapping row at `space.3`, `space.3` below the field), and the
// results, in the page column at nine of the largest space step, in a scroll
// view. The results are not panelled: each group the app passes is a Heading
// over a List, and the groups stack a gutter apart.
//
// The search block is a container named by `searchLabel`, the web's search
// landmark. With `onSubmit`, Return in the field
// submits through it, as Enter does in the web's `<form>`, the keyboard's
// return key reads Search, and a `submit` Button in the block submits too
// (`pmSubmitAction`, as FormPage hands its actions row). Without it the app
// searches as the reader types, and Return does nothing of the page's.
//
// The load status (`design/native/screen-contract.md`) owns the web's `empty`
// and `pending`: the header and the search block render in every state, so
// the field keeps the query, and the results region is what the state
// replaces. `ready` draws `children`, and nothing before a query; `empty` the
// `emptyState` the page cannot be built without; `loading` keeps what the
// region holds, the web's `pending`, and draws no spinner of its own, because
// the submit Button's `loading` shows one; `failed` a danger Alert in place of
// the results, with `onRetry` when it is set. The swap is instant and moves no
// focus, because the reader's place is the field. The results are no
// container of their own, as on the web they are no named region, so each
// group is found by its Heading and its List.
//
// iOS has no busy state for a view, so the results are not marked busy while
// a search runs; the page's identifier carries `status=loading`
// (`PLATFORM_GAPS` in `packages/native/src/pending.ts`).

import PolymorphTokens
import SwiftUI

public struct PMSearchPage: PMSearchPageRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMSearchPageProps

  public init(props: PMSearchPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let status = props.loadStatus

    PMPage(measure: PMRecipe.searchPageMeasure, member: "SearchPage", status: status) {
      PMPageHeader(
        props: PMPageHeaderProps(
          actions: props.actions, description: props.description, title: props.title))
      search
      VStack(alignment: .leading, spacing: space.s6) {
        switch status {
        case .ready, .loading:
          props.children
        case .empty:
          PMEmptyState(props: props.emptyState)
        case .failed(let message):
          PMPageFailure(message: message, onRetry: props.onRetry)
        }
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
      // Instant: a page that searches as the reader types changes its results
      // on every keystroke, and the page column fades a change of status.
      .animation(nil, value: status.kind)
    }
  }

  /// The field over the filter row, one block named by `searchLabel`. Return
  /// and a `submit` Button inside it submit when the page has `onSubmit`.
  private var search: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
      props.search
      if let filters = props.filters {
        PMInline(props: PMInlineProps(children: filters, gap: .s3, wrap: true))
      }
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .submitLabel(props.onSubmit == nil ? .return : .search)
    .onSubmit { props.onSubmit?() }
    .environment(\.pmSubmitAction, props.onSubmit)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.searchLabel))
  }
}

/// SearchPage's states: the spec's six entries, with the load states the
/// screen contract names (`ready`, `empty`, `loading`, `failed`), in a
/// workspace search of a support desk whose query finds tickets and help
/// articles. Each names what its search block and its results hold
/// (`contains`).
public struct SearchPageStates: PMStates {
  public let member = "SearchPage"

  public init() {}

  private static let title = "Search"
  private static let description = "Find tickets and help articles across the workspace."
  private static let landmark = "Workspace"
  private static let field = "Search the workspace"
  private static let placeholder = "Search tickets and articles…"
  private static let query = "webhook"
  private static let failure = "The search could not be run. Check your connection."

  private static let tickets = [
    ("Webhook retries stop after the first 5xx", "T-1019 · Northwind · open", "2h"),
    ("Webhook signature fails after rotating the secret", "T-0987 · Contoso · waiting", "3d"),
    ("Duplicate webhook deliveries during the outage", "T-0952 · Fabrikam · solved", "2w"),
  ]

  private static let articles = [
    ("Retrying failed webhook deliveries", "Help centre · updated last month"),
    ("Verifying webhook signatures", "Help centre · updated in March"),
  ]

  private static func options(_ labels: String...) -> [PMSelectOptionEntry] {
    labels.map { .option(PMSelectOption(value: $0.lowercased(), label: $0)) }
  }

  /// Four `sm` Selects, the filter row the page's measure is set against.
  private static func selects() -> PMContent {
    AnyView(
      Group {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Kind", emptyOption: "Any kind", options: options("Tickets", "Articles"),
            size: .sm))
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Status", emptyOption: "Any status",
            options: options("Open", "Waiting", "Solved"), size: .sm))
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Assignee", emptyOption: "Anyone",
            options: options("Me", "My team", "Unassigned"), size: .sm))
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Updated", emptyOption: "Any time",
            options: options("Today", "This week", "This month"), size: .sm))
      })
  }

  private static func searchField(_ value: String? = query) -> PMContent {
    AnyView(
      PMSearchInput(
        props: PMSearchInputProps(ariaLabel: field, defaultValue: value, placeholder: placeholder)))
  }

  /// A FormField whose Input submits from its trailing Button, `loading`
  /// while a search runs.
  private static func submitted(loading: Bool = false) -> PMContent {
    AnyView(
      PMFormField(
        props: PMFormFieldProps(
          children: AnyView(
            PMInput(
              props: PMInputProps(
                defaultValue: query,
                trailing: AnyView(
                  PMButton(
                    props: PMButtonProps(
                      icon: .search, label: "Search", loading: loading, size: .sm,
                      appearance: .ghostNeutral, type: .submit))),
                type: .search))),
          label: field)))
  }

  private static func ticketList() -> some View {
    PMList(
      props: PMListProps(
        children: AnyView(
          ForEach(tickets, id: \.0) { ticket in
            PMList.Item(
              props: PMListItemProps(
                description: ticket.1, meta: ticket.2, onSelect: {}, title: ticket.0))
          }),
        label: "Tickets"))
  }

  /// Two groups of results, each a Heading over a List; the tickets load
  /// further windows.
  private static func groups() -> PMContent {
    AnyView(
      Group {
        PMStack(
          props: PMStackProps(
            children: AnyView(
              Group {
                PMHeading(props: PMHeadingProps(children: "Tickets"))
                ticketList()
                PMCursorPagination(
                  props: PMCursorPaginationProps(
                    hasNext: true, hasPrevious: false, label: "Tickets", mode: .append,
                    onNext: {}))
              }),
            gap: .s3))
        PMStack(
          props: PMStackProps(
            children: AnyView(
              Group {
                PMHeading(props: PMHeadingProps(children: "Articles"))
                PMList(
                  props: PMListProps(
                    children: AnyView(
                      ForEach(articles, id: \.0) { article in
                        PMList.Item(
                          props: PMListItemProps(
                            description: article.1, onSelect: {}, title: article.0))
                      }),
                    label: "Articles"))
              }),
            gap: .s3))
      })
  }

  private static let nothing = PMEmptyStateProps(
    description: "Check the spelling, or search with fewer filters.", icon: .search,
    secondaryAction: AnyView(
      PMButton(props: PMButtonProps(label: "Clear filters", appearance: .ghostNeutral))),
    title: "Nothing matches that search")

  private static func page(
    _ status: PMLoadStatus = .ready, search: PMContent = searchField(),
    filters: PMContent? = nil, onSubmit: (@MainActor () -> Void)? = nil,
    description: String? = nil, results: PMContent? = groups()
  ) -> some View {
    PMSearchPage(
      props: PMSearchPageProps(
        loadStatus: status, onRetry: {}, children: results, description: description,
        emptyState: nothing, filters: filters, onSubmit: onSubmit, search: search,
        searchLabel: landmark, title: title)
    )
    .pmFixtureScreenTop()
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "before a query — the field and the filters, nothing below them",
        expect: ["status": "ready", "contains": "SearchInput,Select"]
      ) {
        Self.page(
          search: Self.searchField(nil), filters: Self.selects(), description: Self.description,
          results: nil)
      },
      PMStateEntry(
        "results in groups — a heading over each kind",
        expect: ["status": "ready", "contains": "SearchInput,Heading,List,CursorPagination"]
      ) {
        Self.page()
      },
      PMStateEntry(
        "one list of results — the filter row counts them",
        expect: ["status": "ready", "contains": "SearchInput,Select,Button,List"]
      ) {
        Self.page(
          filters: AnyView(
            PMFilterBar(
              props: PMFilterBarProps(
                children: AnyView(
                  PMSelect(
                    props: PMSelectProps(
                      ariaLabel: "Kind", defaultValue: "tickets", emptyOption: "Any kind",
                      options: Self.options("Tickets", "Articles"), size: .sm))),
                isFiltered: true, onClear: {}, resultCount: PMFilterResultCount(shown: 3)))),
          results: AnyView(Self.ticketList()))
      },
      PMStateEntry(
        "nothing found — the way out is a secondary action",
        expect: [
          "status": "empty", "contains": "SearchInput,EmptyState,Button[variant=ghost tone=neutral]",
        ]
      ) {
        Self.page(.empty)
      },
      PMStateEntry(
        "searching — the last results stay, marked busy",
        expect: [
          "status": "loading",
          "contains": "Button[state=loading],List",
        ]
      ) {
        Self.page(.loading, search: Self.submitted(loading: true), onSubmit: {})
      },
      PMStateEntry(
        "submitted with a button — Return and the Button submit the search",
        expect: ["status": "ready", "contains": "FormField,Input,Button,List"]
      ) {
        Self.page(search: Self.submitted(), onSubmit: {})
      },
      PMStateEntry(
        "failed — the Alert in place of the results, the field keeps the query",
        expect: ["status": "failed", "contains": "SearchInput,Alert"]
      ) {
        Self.page(.failed(message: Self.failure))
      },
    ]
  }
}
