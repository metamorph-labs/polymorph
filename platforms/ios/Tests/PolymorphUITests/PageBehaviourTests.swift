#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What the page archetypes do when a person moves through them, read
  /// through the accessibility tree AppKit publishes: MasterDetailPage's two
  /// arrangements and its way back (`master-detail-page.md`). The scene is
  /// `BehaviourTests.Scene`.
  @MainActor
  final class PageBehaviourTests: XCTestCase {
    typealias Scene = BehaviourTests.Scene

    override func setUp() async throws {
      // SwiftUI builds its accessibility nodes once an assistive client asks;
      // setting `AXEnhancedUserInterface`, as such a client does, turns them on.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    private func inbox(selected: Bool, onBack: @escaping @MainActor () -> Void) -> some View {
      PMMasterDetailPage(
        props: PMMasterDetailPageProps(
          loadStatus: .ready, backLabel: "All tickets",
          detail: selected ? AnyView(Text(verbatim: "Refund for a duplicate charge")) : nil,
          emptyState: PMEmptyStateProps(title: "No ticket selected"),
          list: AnyView(
            PMList(
              props: PMListProps(
                children: AnyView(
                  PMList.Item(props: PMListItemProps(onSelect: {}, title: "Login loop"))),
                label: "Tickets"))),
          listLabel: "Tickets", onBack: onBack, title: "Support"))
    }

    /// The page's arrangement, from its identifier.
    private func layout(_ scene: Scene) -> [String: String] {
      Scene.elements(in: scene.host).lazy.compactMap {
        PMMember.parse(self.attribute($0, "accessibilityIdentifier") ?? "")
      }.first { $0.name == "MasterDetailPage" }?.attributes ?? [:]
    }

    /// Below 48rem the detail is drawn alone under the way back, which calls
    /// `onBack` once, and the list is out of the tree meanwhile; from 48rem
    /// the list and the detail are SplitPane's two panes, with no way back.
    func testANarrowPageDrawsTheDetailAloneAndTheWayBackCallsOnBack() throws {
      var backs = 0
      let narrow = Scene(inbox(selected: true) { backs += 1 }, size: CGSize(width: 360, height: 600))
      defer { narrow.close() }
      XCTAssertEqual(layout(narrow)["layout"], "single")
      XCTAssertEqual(layout(narrow)["pane"], "detail")
      XCTAssertNil(narrow.element(named: "Login loop"), "the list is drawn beside the detail")
      press(try XCTUnwrap(narrow.element(role: .button, named: "All tickets")))
      XCTAssertEqual(backs, 1)

      let wide = Scene(inbox(selected: true) { backs += 1 }, size: CGSize(width: 1000, height: 600))
      defer { wide.close() }
      XCTAssertEqual(layout(wide)["layout"], "split")
      XCTAssertNotNil(wide.element(named: "Login loop"), "the split draws no list")
      XCTAssertNotNil(wide.element(named: "Refund for a duplicate charge"), "the split draws no detail")
      XCTAssertNil(wide.element(role: .button, named: "All tickets"), "the split draws a way back")
    }

    // MARK: Helpers

    private func press(_ element: NSObject) {
      _ = element.perform(NSSelectorFromString("accessibilityPerformPress"))
      RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    /// An attribute by its accessor's name. SwiftUI's nodes implement the
    /// accessors without declaring the protocols, so they are read by name.
    private func attribute(_ element: NSObject, _ name: String) -> String? {
      guard element.responds(to: NSSelectorFromString(name)) else { return nil }
      return element.value(forKey: name).map { "\($0)" }
    }
  }
#endif
