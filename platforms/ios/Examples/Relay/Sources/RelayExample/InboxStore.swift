// Relay's inbox, wired as the screen contract's worked example wires it
// (`design/native/screen-contract.md`): the store holds the emitted view's
// model and supplies its actions, the router opens the screens the actions
// name, and the route renders the view and starts the load. The view itself,
// `InboxView.swift`, is emitted from `../../Screens/inbox.json` and holds none
// of this.

import Observation
import PolymorphUI
import SwiftUI

/// Where the inbox can send the app.
enum Destination: Hashable {
  case ticket(String)
  case newTicket
}

/// The app's router: the path its root `NavigationStack` reads.
@MainActor @Observable
final class Router {
  var path: [Destination] = []

  func open(_ destination: Destination) {
    path.append(destination)
  }
}

/// Where the tickets come from.
protocol TicketService: Sendable {
  func tickets() async throws -> [Ticket]
}

/// The inbox's state, and the code behind its actions. Every action changes
/// the model or opens a screen; `load` is the one task, which the route starts
/// and `onRetry` starts again after a failure.
///
/// The load status is the load's: a filter changed while the queue loads, or
/// after it failed, keeps the skeleton or the failure. Once the queue is
/// loaded, the status is `.empty` only while a filter hides every ticket, the
/// state that offers to clear the filters; a queue with no tickets at all is
/// `.ready`, and its table draws the empty inbox (`emptyState`).
@MainActor @Observable
final class InboxStore {
  private(set) var model = InboxModel.placeholder
  private var all: [Ticket] = []
  private let service: any TicketService

  init(service: any TicketService) {
    self.service = service
  }

  func actions(router: Router) -> InboxActions {
    InboxActions(
      onSortChange: { self.model.sort = $0; self.refilter() },
      getRowId: { $0.id },
      onRowClick: { router.open(.ticket($0.id)) },
      onNewTicket: { router.open(.newTicket) },
      onRetry: { Task { await self.load() } },
      onClearFilters: {
        self.model.query = ""
        self.model.status = nil
        self.model.priority = nil
        self.refilter()
      },
      onQueryChange: { self.model.query = $0; self.refilter() },
      onStatusChange: { self.model.status = $0; self.refilter() },
      onPriorityChange: { self.model.priority = $0; self.refilter() }
    )
  }

  func load() async {
    model.loadStatus = .loading
    do {
      all = try await service.tickets()
      model.summary = QueueStats(all)
      refilter(settle: true)
    } catch {
      model.loadStatus = .failed(message: error.localizedDescription)
    }
  }

  /// Keeps the tickets the model's query, filters and sort allow. The status
  /// follows the tickets once the queue has loaded: after a load (`settle`),
  /// or while it is `.ready` or `.empty`.
  private func refilter(settle: Bool = false) {
    model.tickets = visibleTickets(all, filteredBy: model)
    model.isFiltered = !model.query.isEmpty || model.status != nil || model.priority != nil
    model.resultCount = PMFilterResultCount(
      shown: Double(model.tickets.count), total: Double(all.count))
    let loaded = settle || model.loadStatus == .ready || model.loadStatus == .empty
    if loaded {
      model.loadStatus = model.tickets.isEmpty && model.isFiltered ? .empty : .ready
    }
  }
}

/// The tickets the model's query, filters and sort keep, in order.
func visibleTickets(_ tickets: [Ticket], filteredBy model: InboxModel) -> [Ticket] {
  let query = model.query.trimmingCharacters(in: .whitespaces).lowercased()
  let kept = tickets.filter { ticket in
    (query.isEmpty || ticket.subject.lowercased().contains(query)
      || ticket.requester.lowercased().contains(query))
      && (model.status == nil || ticket.status.rawValue == model.status)
      && (model.priority == nil || ticket.priority.rawValue == model.priority)
  }
  // `before` is a strict order, so `before(b, a)` is its reverse; `!before(a, b)`
  // would hold for two equal keys both ways, which `sorted` does not allow.
  let before: (Ticket, Ticket) -> Bool
  switch model.sort.key {
  case "priority":
    before = {
      Ticket.Priority.allCases.firstIndex(of: $0.priority)!
        < Ticket.Priority.allCases.firstIndex(of: $1.priority)!
    }
  case "subject":
    before = { $0.subject < $1.subject }
  default:
    before = { $0.id < $1.id }
  }
  let ascending = model.sort.direction == .asc
  return kept.sorted { ascending ? before($0, $1) : before($1, $0) }
}

extension InboxModel {
  /// The model before anything has loaded: the status `.loading`, every list
  /// empty, the options and the columns in place.
  static var placeholder: InboxModel {
    InboxModel(
      loadStatus: .loading,
      tickets: [],
      summary: QueueStats([]),
      columns: columns,
      sort: PMDataTableSort(key: "updated", direction: .desc),
      isFiltered: false,
      resultCount: PMFilterResultCount(shown: 0),
      query: "",
      status: nil,
      statusOptions: Ticket.Status.allCases.map {
        .option(PMSelectOption(value: $0.rawValue, label: $0.rawValue.capitalized))
      },
      priority: nil,
      priorityOptions: Ticket.Priority.allCases.map {
        .option(PMSelectOption(value: $0.rawValue, label: $0.rawValue.capitalized))
      },
      emptyState: PMEmptyStateProps(
        description: "New conversations land here as customers write in.", icon: .inbox,
        title: "No tickets yet")
    )
  }

  /// The queue's columns. A cell is text unless the column draws a member.
  static var columns: [PMDataTableColumn<Ticket>] {
    [
      PMDataTableColumn(key: "subject", header: "Subject", value: { $0.subject }, sortable: true),
      PMDataTableColumn(key: "requester", header: "Requester", value: { $0.requester }),
      PMDataTableColumn(
        key: "status", header: "Status", value: { $0.status.rawValue.capitalized },
        cell: { ticket in
          AnyView(
            PMBadge(
              props: .init(
                children: ticket.status.rawValue.capitalized,
                tone: ticket.status == .open ? .accent : .neutral, variant: .soft)))
        }),
      PMDataTableColumn(
        key: "priority", header: "Priority", value: { $0.priority.rawValue.capitalized },
        sortable: true),
      PMDataTableColumn(key: "updated", header: "Updated", value: { $0.updated }),
    ]
  }
}

/// The inbox in the app: the route renders the emitted view from the store
/// and starts the load. The state, the task and the router live here, never in
/// the view.
struct InboxRoute: View {
  @State var store: InboxStore
  @Environment(Router.self) private var router

  var body: some View {
    InboxView(model: store.model, actions: store.actions(router: router))
      .task { await store.load() }
  }
}
