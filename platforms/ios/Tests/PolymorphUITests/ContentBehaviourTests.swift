#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What Plan, TableOfContents, CommentThread and Tour say and do, read
  /// through the accessibility tree AppKit publishes, as an assistive client
  /// reads it, and the logic each computes from its props. The scene is
  /// `BehaviourTests.Scene`.
  @MainActor
  final class ContentBehaviourTests: XCTestCase {
    typealias Scene = BehaviourTests.Scene

    override func setUp() async throws {
      // SwiftUI builds its accessibility nodes once an assistive client asks;
      // setting `AXEnhancedUserInterface`, as such a client does, turns them on.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    // MARK: Plan

    private static func step(
      _ id: String, _ status: PMPlanStatus, _ description: String? = nil
    ) -> PMPlanStep {
      PMPlanStep(id: id, title: "Step \(id)", description: description, status: status)
    }

    /// A run with its third step running, as the web's law passes it.
    private static let run = [
      step("a", .done, "Read three files"), step("b", .done), step("c", .running, "Editing deliver.ts"),
      step("d", .pending), step("e", .pending),
    ]

    /// The status line names the step at the front of the run (`plan.md`,
    /// A11y): the first running step; with none running, the first failed
    /// one; with neither, the last one done or skipped; none while every step
    /// is pending. The cases are the web law's (`@polymorph/conformance/plan`).
    func testThePlanNamesTheStepAtTheFrontOfTheRun() {
      let cases: [([PMPlanStep], String?)] = [
        (Self.run.map { Self.step($0.id, .pending) }, nil),
        (Self.run, "c"),
        ([Self.step("a", .error), Self.step("b", .running), Self.step("c", .running)], "b"),
        (
          [Self.step("a", .done), Self.step("b", .error), Self.step("c", .skipped), Self.step("d", .error)],
          "b"
        ),
        ([Self.step("a", .done), Self.step("b", .skipped), Self.step("c", .pending)], "b"),
        (Self.run.map { Self.step($0.id, .done) }, "e"),
        ([], nil),
      ]
      for (steps, front) in cases {
        XCTAssertEqual(
          PMPlan.front(of: steps)?.id, front, steps.map(\.status.rawValue).joined(separator: " "))
      }
    }

    /// Each step is one element read as its title, its status words and its
    /// description; the list is named by `label`; the first running step is
    /// the selected one, the web's `aria-current="step"`.
    func testAPlanStepIsReadAsItsTitleItsStatusAndItsDescription() throws {
      let scene = Scene(
        PMPlan(
          props: PMPlanProps(
            label: "Plan for this run",
            steps: [
              Self.step("a", .done, "Read three files"), Self.step("b", .running),
              Self.step("c", .running), Self.step("d", .pending),
            ])))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: "Plan for this run"), "the list is not named")
      XCTAssertNotNil(scene.element(named: "Step a, \(PMStrings.planDone), Read three files"))
      let current = try XCTUnwrap(scene.element(named: "Step b, \(PMStrings.planRunning)"))
      let later = try XCTUnwrap(scene.element(named: "Step c, \(PMStrings.planRunning)"))
      XCTAssertNotNil(scene.element(named: "Step d, \(PMStrings.planPending)"))
      XCTAssertEqual(attribute(current, "isAccessibilitySelected"), "1", "the first running step")
      XCTAssertNotEqual(attribute(later, "isAccessibilitySelected"), "1", "a second current step")
    }

    /// The words come from `messages`, and a status it lacks takes its default.
    func testAPlanReadsItsWordsFromMessages() {
      let scene = Scene(
        PMPlan(
          props: PMPlanProps(
            label: "Plan", messages: PMPlanMessages(status: [.running: "Läuft"]),
            steps: [Self.step("a", .running), Self.step("b", .skipped)])))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: "Step a, Läuft"))
      XCTAssertNotNil(scene.element(named: "Step b, \(PMStrings.planSkipped)"))
    }

    // MARK: TableOfContents

    /// A level-2 item is a subsection of the item before it; one with nothing
    /// before it is drawn at the first level (`table-of-contents.md`, API).
    func testTableOfContentsGroupsSubsectionsUnderTheItemBeforeThem() {
      let item = { (id: String, level: PMTableOfContentsItemLevel?) in
        PMTableOfContentsItem(id: id, label: id, level: level)
      }
      let groups = PMTableOfContents.groups([
        item("a", .level2), item("b", nil), item("c", .level2), item("d", .level2),
        item("e", .level1), item("f", .level2),
      ])
      XCTAssertEqual(groups.map(\.at), [0, 1, 4])
      XCTAssertEqual(groups.map(\.children), [[], [2, 3], [5]])
    }

    /// A link opens `#id` through the app's open-URL action. The link the app
    /// accepts is marked, as the web marks a click, and `onCurrentChange`
    /// hears its id once; a link the app discards, for a section the page
    /// does not hold, marks nothing. Of two items with one id, the first is
    /// marked.
    func testATableOfContentsMarksTheSectionTheAppWentTo() throws {
      var opened: [String] = []
      var reported: [String?] = []
      let items = [
        PMTableOfContentsItem(id: "overview", label: "Overview"),
        PMTableOfContentsItem(id: "install", label: "Install"),
        PMTableOfContentsItem(id: "missing", label: "Release notes"),
        PMTableOfContentsItem(id: "install", label: "Install again"),
      ]
      let scene = Scene(
        PMTableOfContents(
          props: PMTableOfContentsProps(
            items: items, label: "On this page", onCurrentChange: { reported.append($0) })
        )
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return url.fragment == "missing" ? .discarded : .handled
          }))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: "On this page"), "the list is not named")
      let install = try XCTUnwrap(scene.element(role: .link, named: "Install"))
      XCTAssertNotEqual(attribute(install, "isAccessibilitySelected"), "1", "marked before a press")

      press(install)
      XCTAssertEqual(opened, ["#install"])
      XCTAssertEqual(reported, ["install"])
      XCTAssertEqual(
        scene.element(role: .link, named: "Install").flatMap {
          attribute($0, "isAccessibilitySelected")
        }, "1", "the link the app went to is not marked")

      press(try XCTUnwrap(scene.element(role: .link, named: "Release notes")))
      XCTAssertEqual(opened, ["#install", "#missing"])
      XCTAssertEqual(reported, ["install"], "a refused link changed the mark")

      press(try XCTUnwrap(scene.element(role: .link, named: "Install again")))
      XCTAssertEqual(reported, ["install"], "the same section reported twice")
      XCTAssertEqual(
        scene.element(role: .link, named: "Install").flatMap {
          attribute($0, "isAccessibilitySelected")
        }, "1", "the first of two items with one id is not the marked one")
      XCTAssertNotEqual(
        scene.element(role: .link, named: "Install again").flatMap {
          attribute($0, "isAccessibilitySelected")
        }, "1")
    }

    // MARK: CommentThread

    private static func comment(_ author: String, edited: Bool? = nil, replies: PMContent? = nil)
      -> PMContent
    {
      PMContent(
        PMCommentThread.Comment(
          props: PMCommentThreadCommentProps(
            author: author, avatar: PMContent(PMAvatar(props: PMAvatarProps(name: author))),
            children: PMContent(Text("A comment by \(author).")), edited: edited,
            replies: replies, time: PMContent(Text("09:40")))))
    }

    /// The thread is a container named by its label, each comment one named
    /// by its author, and a comment's replies one named by `messages.replies`
    /// (`comment-thread.md`, A11y). A reply starts where its parent's body
    /// starts, and a reply to a reply at the same edge, the second level. An
    /// edited comment says so in its head.
    func testACommentThreadNamesItsListsAndDrawsTwoLevels() throws {
      let words = PMStrings.commentThreadMessages
      let thread = PMCommentThread(
        props: PMCommentThreadProps(
          children: Self.comment(
            "Ada Okafor",
            replies: Self.comment(
              "Bao Tran", edited: true, replies: Self.comment("Carmen Ruiz"))),
          label: "Comments"))
      let scene = Scene(
        thread.frame(maxHeight: .infinity, alignment: .top), size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: "Comments"), "the thread is not named")
      XCTAssertNotNil(scene.element(named: words.replies), "the replies are not named")
      XCTAssertNotNil(scene.element(named: words.edited), "the edited comment does not say so")
      // Each author's name, the first part of the body a reply lines up with.
      let author = { (name: String) in scene.element(role: .staticText, named: name) }
      let ada = try XCTUnwrap(author("Ada Okafor"))
      let bao = try XCTUnwrap(author("Bao Tran"))
      let carmen = try XCTUnwrap(author("Carmen Ruiz"))
      XCTAssertGreaterThan(frame(bao).minX, frame(ada).minX + 1, "a reply is not indented")
      XCTAssertEqual(
        frame(carmen).minX, frame(bao).minX, accuracy: 0.5,
        "a reply to a reply is not at the second level")
    }

    // MARK: Tour

    /// The step's index is clamped to the steps (`tour.md`, API).
    func testATourClampsItsStep() {
      XCTAssertEqual(PMTour.clamped(-2, count: 3), 0)
      XCTAssertEqual(PMTour.clamped(1, count: 3), 1)
      XCTAssertEqual(PMTour.clamped(1.7, count: 3), 1)
      XCTAssertEqual(PMTour.clamped(9, count: 3), 2)
      XCTAssertEqual(PMTour.clamped(2, count: 0), 0)
      XCTAssertEqual(PMTour.clamped(.nan, count: 3), 0)
    }

    /// A step's panel reads its position from `messages`, draws no Previous
    /// on the first step and Done in Next's place on the last, and each
    /// control calls its action when pressed.
    func testATourPanelOffersTheControlsOfItsStep() throws {
      var pressed: [String] = []
      let words = PMStrings.tourMessages
      let step = PMTourStep(id: "filter", title: "Narrow the list", body: "Filter by status.")
      let panel = { (index: Int) in
        PMTourPanel(
          step: step, index: index, count: 3, messages: words, focuses: false,
          previous: { pressed.append("previous") }, next: { pressed.append("next") },
          close: { pressed.append("close") })
      }

      let first = Scene(panel(0))
      defer { first.close() }
      XCTAssertNotNil(first.element(named: "Narrow the list"))
      XCTAssertNotNil(first.element(named: words.position(1, 3)), "the position line")
      XCTAssertNil(first.element(role: .button, named: words.previous), "Previous on the first step")
      press(try XCTUnwrap(first.element(role: .button, named: words.next)))
      press(try XCTUnwrap(first.element(role: .button, named: words.close)))
      XCTAssertEqual(pressed, ["next", "close"])

      let last = Scene(panel(2))
      defer { last.close() }
      XCTAssertNil(last.element(role: .button, named: words.next), "Next on the last step")
      press(try XCTUnwrap(last.element(role: .button, named: words.previous)))
      press(try XCTUnwrap(last.element(role: .button, named: words.done)))
      XCTAssertEqual(pressed, ["next", "close", "previous", "next"])
    }

    // MARK: Helpers

    private func frame(_ element: NSObject) -> CGRect {
      (element.value(forKey: "accessibilityFrame") as? NSValue)?.rectValue ?? .zero
    }

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
