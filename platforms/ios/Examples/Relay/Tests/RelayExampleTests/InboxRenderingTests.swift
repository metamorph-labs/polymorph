#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI
  @testable import RelayExample

  /// The emitted inbox, rendered at a phone's width and the page's own height
  /// under the default pairing in light mode (`ScreenRenders`), in each of its
  /// four load states. Each state is reached the way the app reaches it,
  /// through the store: before the load, after it, after a filter that matches
  /// nothing, and after a load that failed. Each render must draw something, no
  /// two states may draw the same pixels, and each is written to
  /// `platforms/ios/.snapshots/Examples/Relay/inbox.<state>.png` for a person
  /// to look at.
  @MainActor
  final class InboxRenderingTests: XCTestCase {

    private struct Sample: TicketService {
      func tickets() async throws -> [Ticket] { Ticket.samples }
    }

    private struct Offline: TicketService, LocalizedError {
      var errorDescription: String? { "The tickets could not be loaded. Check your connection." }
      func tickets() async throws -> [Ticket] { throw self }
    }

    /// The four states, each with the store that reached it.
    private func states(
      router: Router
    ) async -> [(name: String, status: PMLoadStatus, store: InboxStore)] {
      let waiting = InboxStore(service: Sample())

      let loaded = InboxStore(service: Sample())
      await loaded.load()

      let filtered = InboxStore(service: Sample())
      await filtered.load()
      filtered.actions(router: router).onQueryChange("no ticket says this")

      let failed = InboxStore(service: Offline())
      await failed.load()

      return [
        ("loading", .loading, waiting),
        ("ready", .ready, loaded),
        ("empty", .empty, filtered),
        ("failed", .failed(message: Offline().errorDescription ?? ""), failed),
      ]
    }

    func testTheInertActionsBuildTheView() throws {
      let image = try ScreenRenders.render(
        InboxView(model: .placeholder, actions: .inert), theme: PMTheme.default)
      XCTAssertEqual(image.width, Int(ScreenRenders.screen.width * ScreenRenders.scale))
    }

    func testTheInboxDrawsEachLoadState() async throws {
      let router = Router()
      var views: [(name: String, view: AnyView)] = []
      for state in await states(router: router) {
        XCTAssertEqual(state.store.model.loadStatus, state.status, "the store reached \(state.name)")
        views.append(
          (state.name, AnyView(InboxView(model: state.store.model, actions: state.store.actions(router: router)))))
      }
      try ScreenRenders.check("inbox", views)
    }
  }
#endif
