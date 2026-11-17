#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI
  @testable import RelayExample

  /// After a refused submit, the new-ticket form's ErrorSummary lists each
  /// field's error as a link to the field, and pressing a link moves focus to
  /// that field's control, as the web's `#id` link focuses the control with
  /// that id. The form is hosted in a window, its links pressed through the
  /// accessibility tree as an assistive client presses them, and the window's
  /// first responder read after each press.
  @MainActor
  final class NewTicketFocusTests: XCTestCase {
    private struct Desk: TicketDesk {
      func create(_ draft: TicketDraft) async throws {}
    }

    override func setUp() async throws {
      // SwiftUI builds its accessibility nodes once an assistive client asks;
      // setting `AXEnhancedUserInterface`, as such a client does, turns them on.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    func testTheSummaryNamesEachRefusedField() {
      let store = NewTicketStore(desk: Desk(), today: PMCalendarDate(year: 2026, month: 10, day: 15))
      let actions = store.actions(router: Router())
      XCTAssertEqual(store.model.errors.count, 0, "nothing is refused before a submit")
      actions.onSubmit()
      XCTAssertEqual(store.model.errors.map(\.fieldId), ["subject", "requester"])
      XCTAssertEqual(
        store.model.errors.map(\.label), [store.model.subjectError, store.model.requesterError])
      actions.onSubjectChange("Webhook retries stop")
      XCTAssertEqual(store.model.errors.map(\.fieldId), ["requester"], "a fixed field leaves the list")
    }

    func testALinkToAFieldFocusesItsControl() throws {
      let store = NewTicketStore(desk: Desk(), today: PMCalendarDate(year: 2026, month: 10, day: 15))
      let router = Router()
      store.actions(router: router).onSubmit()
      let view = NewTicketView(model: store.model, actions: store.actions(router: router))
        .pmTheme(PMTheme.default)
        .environment(\.pmPageScrolls, false)

      let host = NSHostingView(rootView: view)
      host.frame = CGRect(x: 0, y: 0, width: ScreenRenders.screen.width, height: 1200)
      let window = NSWindow(
        contentRect: host.frame, styleMask: [.titled], backing: .buffered, defer: false)
      // Closed at the end and released by Swift, not by AppKit on closing.
      window.isReleasedWhenClosed = false
      window.contentView = host
      window.makeKeyAndOrderFront(nil)
      defer { window.close() }
      host.layoutSubtreeIfNeeded()
      settle()

      // The requester's link first, so neither press finds its field focused already.
      for error in store.model.errors.reversed() {
        let link = try XCTUnwrap(
          element(in: host, role: NSAccessibility.Role.link, named: error.label),
          "no link for \(error.fieldId)")
        _ = link.perform(NSSelectorFromString("accessibilityPerformPress"))
        settle()
        XCTAssertEqual(
          focusedPlaceholder(window), Self.placeholders[error.fieldId],
          "the link to \(error.fieldId) focused another control")
      }
    }

    /// Each field's placeholder, which names the text field that holds focus.
    private static let placeholders = [
      "subject": "Webhook retries stop after the first 5xx",
      "requester": "dana@northwind.example",
    ]

    /// A few turns of the run loop, in which SwiftUI lays out, publishes its
    /// accessibility nodes and moves focus.
    private func settle() {
      RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    /// The placeholder of the text field whose editor is the window's first responder.
    private func focusedPlaceholder(_ window: NSWindow) -> String? {
      let editor = window.firstResponder as? NSTextView
      let field = (editor?.delegate as? NSTextField) ?? (window.firstResponder as? NSTextField)
      return field?.placeholderString ?? field?.placeholderAttributedString?.string
    }

    /// The first element under `root`, at any depth, with `role` whose title
    /// or label is `name`.
    private func element(in root: NSObject, role: NSAccessibility.Role, named name: String)
      -> NSObject?
    {
      for case let child as NSObject in children(of: root) {
        if attribute(child, "accessibilityRole") == role.rawValue,
          [attribute(child, "accessibilityLabel"), attribute(child, "accessibilityTitle")]
            .contains(name)
        {
          return child
        }
        if let found = element(in: child, role: role, named: name) { return found }
      }
      return nil
    }

    private func children(of element: NSObject) -> [Any] {
      guard element.responds(to: NSSelectorFromString("accessibilityChildren")) else { return [] }
      return element.value(forKey: "accessibilityChildren") as? [Any] ?? []
    }

    /// An attribute by its accessor's name. SwiftUI's nodes implement the
    /// accessors without declaring the protocols, so they are read by name.
    private func attribute(_ element: NSObject, _ name: String) -> String? {
      guard element.responds(to: NSSelectorFromString(name)) else { return nil }
      return element.value(forKey: name).map { "\($0)" }
    }
  }
#endif
