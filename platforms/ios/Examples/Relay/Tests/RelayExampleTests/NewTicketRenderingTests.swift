#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI
  @testable import RelayExample

  /// The emitted new-ticket form, rendered as the inbox is (`ScreenRenders`):
  /// blank, filled in with an assignee chosen in its Combobox and a due date
  /// in its DatePicker, after a submit the required fields refused, and after
  /// the desk failed to take the ticket, each reached through the store. Each
  /// is written to `platforms/ios/.snapshots/Examples/Relay/new-ticket.<state>.png`.
  @MainActor
  final class NewTicketRenderingTests: XCTestCase {
    private struct Desk: TicketDesk {
      func create(_ draft: TicketDraft) async throws {}
    }

    private struct Unavailable: LocalizedError {
      var errorDescription: String? { "The ticket could not be created. Try again in a minute." }
    }

    private struct Down: TicketDesk {
      func create(_ draft: TicketDraft) async throws { throw Unavailable() }
    }

    private static let today = PMCalendarDate(year: 2026, month: 10, day: 15)

    func testTheInertActionsBuildTheView() throws {
      let store = NewTicketStore(desk: Desk(), today: Self.today)
      let image = try ScreenRenders.render(
        NewTicketView(model: store.model, actions: .inert), theme: PMTheme.default)
      XCTAssertEqual(image.width, Int(ScreenRenders.screen.width * ScreenRenders.scale))
    }

    func testTheFormDrawsEachState() async throws {
      let router = Router()

      let blank = NewTicketStore(desk: Desk(), today: Self.today)

      let filled = NewTicketStore(desk: Desk(), today: Self.today)
      filled.fill(
        subject: "Webhook retries stop after the first 5xx", requester: "dana@northwind.example",
        assignee: "ben", due: PMCalendarDate(year: 2026, month: 10, day: 20))
      filled.actions(router: router).onPriorityChange("high")

      let refused = NewTicketStore(desk: Desk(), today: Self.today)
      refused.actions(router: router).onSubmit()
      XCTAssertNotNil(refused.model.subjectError)
      XCTAssertNotNil(refused.model.requesterError)
      XCTAssertNil(refused.submitted)

      let failed = NewTicketStore(desk: Down(), today: Self.today)
      failed.fill(
        subject: "Invoice address is wrong", requester: "sam@contoso.example", assignee: nil,
        due: nil)
      failed.actions(router: router).onSubmit()
      XCTAssertNotNil(failed.submitted)
      for _ in 0..<20 where failed.model.loadStatus == .ready {
        try await Task.sleep(for: .milliseconds(10))
      }
      XCTAssertEqual(
        failed.model.loadStatus, .failed(message: Unavailable().errorDescription ?? ""),
        "the desk failed")

      let states = [("blank", blank), ("filled", filled), ("refused", refused), ("failed", failed)]
      try ScreenRenders.check(
        "new-ticket",
        states.map { name, store in
          (name, AnyView(NewTicketView(model: store.model, actions: store.actions(router: router))))
        })
    }
  }
#endif
