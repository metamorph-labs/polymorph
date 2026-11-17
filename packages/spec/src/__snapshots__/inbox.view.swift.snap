// Emitted from a screen spec (`polymorph-screen/1`): `InboxView`, for iOS. The view is the spec's
// tree and nothing more: it holds no state, calls nothing asynchronous and navigates nowhere. The
// app renders it from a store that owns the model, its tasks and its router, and supplies the
// actions (`design/native/screen-contract.md`).

import PolymorphUI
import SwiftUI

/// What `InboxView` shows. `loadStatus` says which of the four load states it is in.
struct InboxModel {
  var loadStatus: PMLoadStatus
  /// Already filtered and sorted.
  var tickets: [Ticket]
  /// The queue's four numbers, derived by the container from the whole collection rather than from
  /// the filtered view — which is why the band outlives the empty story.
  var summary: QueueStats
  /// Cell renderers are code, so they arrive as an input.
  var columns: [PMDataTableColumn<Ticket>]
  var sort: PMDataTableSort
  var isFiltered: Bool
  var resultCount: PMFilterResultCount
  var query: String
  var status: String?
  var statusOptions: [PMSelectOptionEntry]
  var priority: String?
  var priorityOptions: [PMSelectOptionEntry]
  var emptyState: PMEmptyStateProps
}

/// The code the app supplies to `InboxView`, one closure per action.
struct InboxActions {
  let onSortChange: @MainActor (PMDataTableSort) -> Void
  let getRowId: @MainActor (Ticket) -> String
  let onRowClick: @MainActor (Ticket) -> Void
  let onNewTicket: @MainActor () -> Void
  /// Loads the queue again after a load failed.
  let onRetry: @MainActor () -> Void
  let onClearFilters: @MainActor () -> Void
  let onQueryChange: @MainActor (String) -> Void
  let onStatusChange: @MainActor (String?) -> Void
  let onPriorityChange: @MainActor (String?) -> Void
}

/// Relay's ticket queue — a filtered, sortable table under a page header.
@MainActor
struct InboxView: View {
  let model: InboxModel
  let actions: InboxActions

  var body: some View {
    PMListPage(
      props: .init(
        loadStatus: model.loadStatus,
        onRetry: actions.onRetry,
        actions: AnyView(
          PMButton(props: .init(icon: .add, label: "New ticket", onClick: actions.onNewTicket))
        ),
        children: AnyView(
          // Rung 2, declared: A queue is scanned rather than read, so more rows in the same
          // viewport is worth more here than the breathing room the rest of the product gets.
          // Nothing new is invented: this is the same theme in its compact variant, applied to a
          // region.
          PMDensityScope(
            props: .init(
              as: .section,
              children: AnyView(
                PMDataTable(
                  props: .init(
                    columns: model.columns,
                    data: model.tickets,
                    emptyState: model.emptyState,
                    getRowId: actions.getRowId,
                    label: "Tickets",
                    onRowClick: actions.onRowClick,
                    onSortChange: actions.onSortChange,
                    sort: model.sort,
                    stickyHeader: true
                  )
                )
              ),
              value: .compact
            )
          )
        ),
        emptyState: PMEmptyStateProps(
          description: "Every conversation is still here — the filters are hiding them.",
          icon: .search,
          secondaryAction: AnyView(
            PMButton(
              props: .init(
                label: "Clear filters",
                onClick: actions.onClearFilters,
                appearance: .ghostNeutral
              )
            )
          ),
          title: "No tickets match these filters"
        ),
        filters: AnyView(
          PMFilterBar(
            props: .init(
              children: AnyView(
                Group {
                  PMSelect(
                    props: .init(
                      ariaLabel: "Filter by status",
                      emptyOption: "Any status",
                      onChange: actions.onStatusChange,
                      options: model.statusOptions,
                      size: .sm,
                      value: .some(model.status)
                    )
                  )
                  PMSelect(
                    props: .init(
                      ariaLabel: "Filter by priority",
                      emptyOption: "Any priority",
                      onChange: actions.onPriorityChange,
                      options: model.priorityOptions,
                      size: .sm,
                      value: .some(model.priority)
                    )
                  )
                }
              ),
              isFiltered: model.isFiltered,
              onClear: actions.onClearFilters,
              resultCount: model.resultCount,
              search: AnyView(
                PMSearchInput(
                  props: .init(
                    ariaLabel: "Search tickets",
                    onChange: actions.onQueryChange,
                    placeholder: "Search tickets…",
                    size: .sm,
                    value: model.query
                  )
                )
              )
            )
          )
        ),
        summary: AnyView(
          PMGrid(
            props: .init(
              children: AnyView(
                Group {
                  PMCard(
                    props: .init(
                      children: AnyView(
                        PMStat(
                          props: .init(
                            footer: model.summary.open.footer,
                            label: model.summary.open.label,
                            trend: model.summary.open.trend,
                            value: model.summary.open.value
                          )
                        )
                      )
                    )
                  )
                  PMCard(
                    props: .init(
                      children: AnyView(
                        PMStat(
                          props: .init(
                            footer: model.summary.urgent.footer,
                            label: model.summary.urgent.label,
                            trend: model.summary.urgent.trend,
                            value: model.summary.urgent.value
                          )
                        )
                      )
                    )
                  )
                  PMCard(
                    props: .init(
                      children: AnyView(
                        PMStat(
                          props: .init(
                            footer: model.summary.response.footer,
                            label: model.summary.response.label,
                            trend: model.summary.response.trend,
                            value: model.summary.response.value
                          )
                        )
                      )
                    )
                  )
                  PMCard(
                    props: .init(
                      children: AnyView(
                        PMStat(
                          props: .init(
                            footer: model.summary.solved.footer,
                            label: model.summary.solved.label,
                            trend: model.summary.solved.trend,
                            value: model.summary.solved.value
                          )
                        )
                      )
                    )
                  )
                }
              ),
              columns: .columns4,
              gap: .s6
            )
          )
        ),
        title: "Inbox"
      )
    )
  }
}

extension InboxActions {
  /// Every action doing nothing, so an app compiles against the view before it wires its store. An
  /// action that answers returns the empty value of its result.
  @MainActor static let inert: Self = Self(
    onSortChange: { _ in },
    getRowId: { _ in "" },
    onRowClick: { _ in },
    onNewTicket: {},
    onRetry: {},
    onClearFilters: {},
    onQueryChange: { _ in },
    onStatusChange: { _ in },
    onPriorityChange: { _ in }
  )
}
