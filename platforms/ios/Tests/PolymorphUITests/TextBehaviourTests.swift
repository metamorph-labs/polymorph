#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What Diff's and LogView's lines do when a reader acts on them, read
  /// through the accessibility tree AppKit publishes, as an assistive client
  /// reads it. The scene is `BehaviourTests.Scene`.
  @MainActor
  final class TextBehaviourTests: XCTestCase {
    typealias Scene = BehaviourTests.Scene

    override func setUp() async throws {
      // SwiftUI builds its accessibility nodes once an assistive client asks;
      // setting `AXEnhancedUserInterface`, as such a client does, turns them on.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    // MARK: Diff

    private static let before = (1...12).map { "line \($0)" }.joined(separator: "\n")
    private static let after = before.replacingOccurrences(of: "line 10", with: "line ten")

    /// Diff's lines form (`diff.md`): a collapsed run is a Button named by how
    /// many lines it holds, reporting "collapsed"; a press shows its lines
    /// under it and reports "expanded", the Button staying where it was; a
    /// second press hides them. Each row is read as its kind's word and its line.
    func testACollapsedRunShowsItsLinesWhenPressedAndHidesThemAgain() throws {
      let scene = Scene(
        PMDiff(
          props: PMDiffProps(
            after: .some(Self.after), before: .some(Self.before), display: .lines,
            label: "Numbers")
        )
        // At the top, so the Button stays put if the member keeps it in place.
        .frame(maxHeight: .infinity, alignment: .top),
        size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      let words = PMStrings.diffMessages
      let name = words.unchanged(6)
      let run = try XCTUnwrap(scene.element(role: .button, named: name), "no collapsed run of six")
      XCTAssertEqual(attribute(run, "accessibilityValue"), PMStrings.disclosure(open: false))
      XCTAssertNil(scene.element(named: "line 3"), "a closed run draws its lines")
      XCTAssertNotNil(scene.element(named: "line 7"), "a line of context is not drawn")
      XCTAssertNotNil(scene.element(named: "\(words.removed) line 10"), "a removed row's words")
      XCTAssertNotNil(scene.element(named: "\(words.added) line ten"), "an added row's words")
      let at = frame(run)

      press(run)
      scene.settle()
      let opened = try XCTUnwrap(scene.element(role: .button, named: name), "the Button left")
      XCTAssertEqual(attribute(opened, "accessibilityValue"), PMStrings.disclosure(open: true))
      XCTAssertEqual(frame(opened), at, "the Button moved when its lines appeared")
      XCTAssertNotNil(scene.element(named: "line 3"), "the open run draws no lines")

      press(opened)
      scene.settle()
      XCTAssertNil(scene.element(named: "line 3"), "a second press leaves the lines drawn")
      XCTAssertEqual(
        scene.element(role: .button, named: name).flatMap { attribute($0, "accessibilityValue") },
        PMStrings.disclosure(open: false))
    }

    /// The inline form is one element read as the change in words.
    func testTheInlineFormIsReadAsTheChangeInWords() {
      let words = PMStrings.diffMessages
      let cases: [(String?, String?, String)] = [
        ("Draft", "Active", "\(words.from) Draft \(words.to) Active"),
        (nil, "Active", "\(words.added) Active"),
        ("Draft", "", "\(words.removed) Draft"),
        ("Active", "Active", "Active"),
      ]
      for (before, after, spoken) in cases {
        let scene = Scene(PMDiff(props: PMDiffProps(after: .some(after), before: .some(before))))
        defer { scene.close() }
        XCTAssertNotNil(scene.element(named: spoken), "\(before ?? "nil") → \(after ?? "nil")")
      }
    }

    // MARK: LogView

    /// LogView (`log-view.md`): a log in a box opens at its newest line, which
    /// is inside the box, and each line is read as its level's word, its time,
    /// its source and its text. The reader is at the end, so there is no jump
    /// control.
    func testALogInABoxOpensAtItsNewestLine() throws {
      let lines = (0..<40).map { PMLogLine(id: "l\($0)", text: "line \($0)") }
        + [PMLogLine(id: "e", text: "boom", level: .error, time: "12:00", source: "svc-api")]
      let scene = Scene(
        PMLogView(props: PMLogViewProps(label: "Deploy log", lines: lines))
          .frame(height: 200)
          .frame(maxHeight: .infinity, alignment: .top))
      defer { scene.close() }
      let words = PMStrings.logViewMessages
      let log = try XCTUnwrap(scene.element(named: "Deploy log"), "the log is not named")
      let newest = try XCTUnwrap(
        scene.element(named: "\(words.error) 12:00 svc-api boom"), "the newest line's words")
      XCTAssertTrue(
        frame(log).insetBy(dx: -1, dy: -1).contains(frame(newest)),
        "the newest line is outside the log: \(frame(newest)) in \(frame(log))")
      XCTAssertNil(
        scene.element(role: .button, named: words.jumpToLatest), "a jump control at the end")
    }

    // MARK: Helpers

    private func press(_ element: NSObject) {
      _ = element.perform(NSSelectorFromString("accessibilityPerformPress"))
      RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    private func frame(_ element: NSObject) -> CGRect {
      (element.value(forKey: "accessibilityFrame") as? NSValue)?.rectValue ?? .zero
    }

    /// An attribute by its accessor's name. SwiftUI's nodes implement the
    /// accessors without declaring the protocols, so they are read by name.
    private func attribute(_ element: NSObject, _ name: String) -> String? {
      guard element.responds(to: NSSelectorFromString(name)) else { return nil }
      return element.value(forKey: name).map { "\($0)" }
    }
  }
#endif
