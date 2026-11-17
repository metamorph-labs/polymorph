import PolymorphUI
import XCTest

@testable import RelayExample

/// The store's load status, which is the load's: a filter changed while the
/// queue loads or after it failed keeps that state, the status is `.empty`
/// only while a filter hides every ticket, and `onRetry` loads again after a
/// failure. Android's `InboxStoreTest` holds its store to the same four cases.
@MainActor
final class InboxStoreTests: XCTestCase {
  private static let nothing = "no ticket says this"

  private struct Offline: TicketService, LocalizedError {
    static let message = "The tickets could not be loaded."
    var errorDescription: String? { Self.message }
    func tickets() async throws -> [Ticket] { throw self }
  }

  private struct Queue: TicketService {
    let tickets: [Ticket]
    func tickets() async throws -> [Ticket] { tickets }
  }

  /// A service whose load waits until the test releases it.
  private actor Held: TicketService {
    private var waiting: CheckedContinuation<[Ticket], Never>?
    private var released: [Ticket]?

    func tickets() async throws -> [Ticket] {
      if let released { return released }
      return await withCheckedContinuation { waiting = $0 }
    }

    var asked: Bool { waiting != nil }

    func release(_ tickets: [Ticket]) {
      released = tickets
      waiting?.resume(returning: tickets)
      waiting = nil
    }
  }

  /// A service that fails once and then loads, counting its loads.
  private actor Flaky: TicketService {
    private(set) var attempts = 0

    func tickets() async throws -> [Ticket] {
      attempts += 1
      if attempts == 1 { throw Offline() }
      return Ticket.samples
    }
  }

  func testAFilterChangedWhileLoadingKeepsTheSkeleton() async throws {
    let service = Held()
    let store = InboxStore(service: service)
    let loading = Task { await store.load() }
    try await until { await service.asked }
    store.actions(router: Router()).onQueryChange(Self.nothing)
    XCTAssertEqual(store.model.loadStatus, .loading)
    await service.release(Ticket.samples)
    await loading.value
    XCTAssertEqual(store.model.loadStatus, .empty, "the query hides every ticket once loaded")
  }

  func testAFilterChangedAfterAFailureKeepsTheFailure() async {
    let store = InboxStore(service: Offline())
    await store.load()
    let actions = store.actions(router: Router())
    actions.onQueryChange("sync")
    actions.onStatusChange(Ticket.Status.allCases.first?.rawValue)
    XCTAssertEqual(store.model.loadStatus, .failed(message: Offline.message))
  }

  func testAnEmptyQueueIsReadyAndOnlyAFilterMakesItEmpty() async {
    let empty = InboxStore(service: Queue(tickets: []))
    await empty.load()
    XCTAssertEqual(empty.model.loadStatus, .ready, "an empty queue draws its table's empty state")
    let loaded = InboxStore(service: Queue(tickets: Ticket.samples))
    await loaded.load()
    let actions = loaded.actions(router: Router())
    actions.onQueryChange(Self.nothing)
    XCTAssertEqual(loaded.model.loadStatus, .empty)
    actions.onClearFilters()
    XCTAssertEqual(loaded.model.loadStatus, .ready)
  }

  func testRetryLoadsAgainAfterAFailure() async throws {
    let service = Flaky()
    let store = InboxStore(service: service)
    await store.load()
    guard case .failed = store.model.loadStatus else {
      return XCTFail("the first load fails, not \(store.model.loadStatus)")
    }
    store.actions(router: Router()).onRetry()
    try await until { store.model.loadStatus == .ready }
    let attempts = await service.attempts
    XCTAssertEqual(attempts, 2)
  }

  /// Waits, a turn at a time, until `condition` holds, for up to five
  /// seconds: `onRetry` starts its load as a task of its own.
  private func until(_ condition: () async -> Bool) async throws {
    let deadline = Date().addingTimeInterval(5)
    while !(await condition()) {
      guard Date() < deadline else { return XCTFail("the store did not get there in time") }
      try await Task.sleep(for: .milliseconds(10))
    }
  }
}
