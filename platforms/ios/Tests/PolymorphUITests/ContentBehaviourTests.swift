#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What Plan, TableOfContents, CommentThread, Tour, RichTextContent and a
  /// loading Stat say and do, read through the accessibility tree AppKit
  /// publishes, as an assistive client reads it, and the logic each computes
  /// from its props.
  /// The scene is `BehaviourTests.Scene`.
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

    // MARK: RichTextContent

    private static func richText(_ blocks: String) -> PMJSONValue {
      .string(#"{"format":"polymorph-rich-text/1","blocks":[\#(blocks)]}"#)
    }

    /// The levels of the Headings under `scene`'s host, in order.
    private func headingLevels(in scene: Scene) -> [String] {
      Scene.elements(in: scene.host).compactMap { element in
        PMMember.parse(attribute(element, "accessibilityIdentifier") ?? "").flatMap {
          $0.name == "Heading" ? $0.attributes["level"] : nil
        }
      }
    }

    /// The document's level 1 is drawn at `headingLevel`, each deeper level one
    /// more, never past 4 (`rich-text-content.md`, The document); a heading
    /// with no text is not drawn.
    func testARichTextHeadingIsDrawnAtThePageLevelOfItsDocumentLevel() {
      let blocks = Self.richText(
        #"""
        {"type":"heading","level":1,"content":[{"type":"text","text":"One"}]},
        {"type":"heading","level":2,"content":[{"type":"text","text":"Two"}]},
        {"type":"heading","level":3,"content":[{"type":"text","text":"Three"}]},
        {"type":"heading","level":1,"content":[{"type":"text","text":"  "}]}
        """#)
      let drawn = Scene(PMRichTextContent(props: PMRichTextContentProps(value: blocks)))
      defer { drawn.close() }
      XCTAssertEqual(headingLevels(in: drawn), ["2", "3", "4"])
      let deeper = Scene(
        PMRichTextContent(props: PMRichTextContentProps(headingLevel: .headingLevel3, value: blocks)))
      defer { deeper.close() }
      XCTAssertEqual(headingLevels(in: deeper), ["3", "4", "4"])
    }

    /// A link without a scheme goes to `onNavigate`, as Link's does
    /// (`link.md`, Routing); one with a scheme opens as the environment says.
    /// Each is a link VoiceOver lists. AppKit's element for a link inside a
    /// Text takes no press, and a synthetic click does not open it, so the
    /// paragraph's routing is called as its open-URL action calls it.
    func testARichTextLinkWithoutASchemeGoesToTheAppsRouter() throws {
      let value = Self.richText(
        #"""
        {"type":"paragraph","content":[
          {"type":"text","text":"Read "},
          {"type":"text","text":"the guide","marks":[{"type":"link","href":"/docs/guide"}]},
          {"type":"text","text":" or "},
          {"type":"text","text":"the site","marks":[{"type":"link","href":"https://example.org"}]}
        ]}
        """#)
      let scene = Scene(
        PMRichTextContent(props: PMRichTextContentProps(onNavigate: { _ in }, value: value)))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(role: .link, named: "the guide"))
      XCTAssertNotNil(scene.element(role: .link, named: "the site"))

      guard case .paragraph(let inlines)? = PMRichTextReader.read(value).first else {
        return XCTFail("no paragraph")
      }
      let routes = PMRichTextPiece.routes(PMRichTextPiece.pieces(inlines))
      var navigated: [String] = []
      var opened: [String] = []
      let around = OpenURLAction { url in
        opened.append(url.absoluteString)
        return .handled
      }
      for target in ["/docs/guide", "https://example.org"] {
        _ = PMRichTextRoutes.open(
          try XCTUnwrap(URL(string: target)), routes: routes, onNavigate: { navigated.append($0) },
          onAnnotationSelect: nil, otherwise: around)
      }
      XCTAssertEqual(navigated, ["/docs/guide"])
      XCTAssertEqual(opened, ["https://example.org"])
    }

    /// An entity the app draws is the app's view in the paragraph's line, and
    /// an entity left to the token is read as its label; the text between them
    /// is read as one stretch each (`rich-text-content.md`, A11y).
    func testARichTextEntityTheAppDrawsStandsInItsParagraph() throws {
      var opened: [String] = []
      let scene = Scene(
        PMRichTextContent(
          props: PMRichTextContentProps(
            entity: { entity in
              entity.kind == "user"
                ? PMContent(
                  PMLink(props: PMLinkProps(children: entity.label, href: "/people/\(entity.id)")))
                : PMRichTextContent.entityToken(entity)
            },
            value: Self.richText(
              #"""
              {"type":"paragraph","content":[
                {"type":"entity","kind":"user","id":"u_ada","label":"@Ada Lovelace"},
                {"type":"text","text":" can you review the fix for "},
                {"type":"entity","kind":"issue","id":"i_142","label":"#142"},
                {"type":"text","text":" before Friday?"}
              ]}
              """#)))
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return .handled
          }))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: " can you review the fix for "), "the first stretch")
      XCTAssertNotNil(scene.element(named: "#142"), "the token")
      XCTAssertNotNil(scene.element(named: " before Friday?"), "the second stretch")
      XCTAssertNil(scene.element(named: "review "), "a word read on its own")
      press(try XCTUnwrap(scene.element(role: .link, named: "@Ada Lovelace")))
      XCTAssertEqual(opened, ["/people/u_ada"])
    }

    /// The custom actions of the elements under `scene`'s host, by name: what
    /// VoiceOver offers on a text that holds annotations.
    private func customActions(in scene: Scene) -> [String: NSAccessibilityCustomAction] {
      var found: [String: NSAccessibilityCustomAction] = [:]
      for element in Scene.elements(in: scene.host)
      where element.responds(to: NSSelectorFromString("accessibilityCustomActions")) {
        for action in element.value(forKey: "accessibilityCustomActions")
          as? [NSAccessibilityCustomAction] ?? []
        {
          found[action.name] = action
        }
      }
      return found
    }

    /// A tap on a highlight goes to its innermost annotation (`rich-text-content.md`,
    /// Behaviour). Each run of a highlight is a link of the paragraph, the part
    /// of a Text a tap reaches, whose open-URL action calls `onAnnotationSelect`;
    /// VoiceOver offers each annotation as an action named by its first fragment
    /// where it is the innermost.
    func testARichTextHighlightCallsTheAppWithItsInnermostAnnotation() throws {
      var selected: [String] = []
      let scene = Scene(
        PMRichTextContent(
          props: PMRichTextContentProps(
            activeAnnotation: "thread-2", onAnnotationSelect: { selected.append($0) },
            value: RichTextContentStates.overlapping)))
      defer { scene.close() }
      for words in ["twice ", "as long", " as the last one"] {
        XCTAssertNotNil(scene.element(role: .link, named: words), "\(words) takes no tap")
      }
      let actions = customActions(in: scene)
      XCTAssertEqual(Set(actions.keys), ["twice", "as long"])
      _ = actions["as long"]?.handler?()
      _ = actions["twice"]?.handler?()
      XCTAssertEqual(selected, ["thread-2", "thread-1"])

      // A tap on a highlight's run opens its link, which the paragraph's action takes.
      _ = PMRichTextRoutes.open(
        try XCTUnwrap(PMRichTextMarking.url("thread-2")), routes: [:], onNavigate: nil,
        onAnnotationSelect: { selected.append($0) }, otherwise: OpenURLAction { _ in .discarded })
      XCTAssertEqual(selected, ["thread-2", "thread-1", "thread-2"])
    }

    /// A link inside an annotation is the link's: a tap on it follows it, and
    /// an annotation only on a link is offered nowhere, as it has no stop on
    /// the web.
    func testALinkInsideARichTextAnnotationIsTheLinks() throws {
      var selected: [String] = []
      var navigated: [String] = []
      let value = Self.richText(
        #"""
        {"type":"paragraph","content":[
          {"type":"text","text":"see ","marks":[{"type":"annotation","id":"t1"}]},
          {"type":"text","text":"the guide","marks":[{"type":"link","href":"/docs/guide"},{"type":"annotation","id":"t1"},{"type":"annotation","id":"t2"}]}
        ]}
        """#)
      let scene = Scene(
        PMRichTextContent(
          props: PMRichTextContentProps(
            onAnnotationSelect: { selected.append($0) }, onNavigate: { navigated.append($0) },
            value: value)))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(role: .link, named: "the guide"))
      XCTAssertEqual(Set(customActions(in: scene).keys), ["see"])

      guard case .paragraph(let inlines)? = PMRichTextReader.read(value).first else {
        return XCTFail("no paragraph")
      }
      _ = PMRichTextRoutes.open(
        try XCTUnwrap(URL(string: "/docs/guide")),
        routes: PMRichTextPiece.routes(PMRichTextPiece.pieces(inlines)),
        onNavigate: { navigated.append($0) }, onAnnotationSelect: { selected.append($0) },
        otherwise: OpenURLAction { _ in .discarded })
      XCTAssertEqual(navigated, ["/docs/guide"])
      XCTAssertEqual(selected, [])
    }

    /// Without `onAnnotationSelect` a highlight takes no tap and offers no
    /// action: it is drawn, and nothing else.
    func testARichTextHighlightWithoutAHandlerTakesNoPress() {
      let scene = Scene(
        PMRichTextContent(props: PMRichTextContentProps(value: RichTextContentStates.annotated)))
      defer { scene.close() }
      XCTAssertNil(scene.element(role: .link, named: "doubles the wait"))
      XCTAssertEqual(customActions(in: scene).count, 0)
    }

    /// A heading that holds a highlight is still a heading, read whole, and
    /// offers its annotation as the paragraph does.
    func testARichTextHeadingWithAHighlightIsAHeadingThatOffersIt() {
      var selected: [String] = []
      let scene = Scene(
        PMRichTextContent(
          props: PMRichTextContentProps(
            onAnnotationSelect: { selected.append($0) },
            value: RichTextContentStates.annotatedHeading)))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(role: .init(rawValue: "AXHeading"), named: "Webhook retries"))
      _ = customActions(in: scene)["retries"]?.handler?()
      XCTAssertEqual(selected, ["thread-4"])
    }

    // MARK: Helpers

    // MARK: Stat

    /// A Stat whose number has not arrived (`stat.md`, Loading) is read as its
    /// label and the loading word: the value's Skeleton is named, and no value,
    /// delta or chip label is drawn or read.
    func testALoadingStatIsReadAsItsLabelAndLoadingWithNoNumber() throws {
      let scene = Scene(
        PMStat(
          props: PMStatProps(
            delta: PMStatDelta(value: "12%", direction: .up), label: "Revenue", loading: true,
            trend: PMStatTrend(direction: .up, label: "+12.5%"), value: "$48,200")))
      defer { scene.close() }
      XCTAssertNotNil(
        scene.element(named: "Revenue, \(PMStrings.loading)"), "the stat is not read as loading")
      let read = Scene.elements(in: scene.host).flatMap { element in
        ["accessibilityLabel", "accessibilityValue", "accessibilityTitle"].compactMap {
          attribute(element, $0)
        }
      }
      for words in ["$48,200", "12%", "+12.5%", PMStrings.positive] {
        XCTAssertFalse(read.contains { $0.contains(words) }, "\(words) is read while it loads")
      }
    }

    /// `loadingLabel` names the value's placeholder in the app's words.
    func testALoadingStatReadsItsLoadingLabel() {
      let scene = Scene(
        PMStat(props: PMStatProps(label: "Umsatz", loading: true, loadingLabel: "Lädt", value: "")))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: "Umsatz, Lädt"))
    }

    /// `deltaLabel` speaks the delta in the app's words (`stat.md`, A11y), from
    /// its value, its direction and the sentiment the stat resolves: down is
    /// bad news unless the app says otherwise.
    func testAStatSpeaksItsDeltaInTheAppsWords() {
      let scene = Scene(
        PMStat(
          props: PMStatProps(
            delta: PMStatDelta(value: "8%", direction: .down),
            deltaLabel: { delta in
              "\(delta.direction == .down ? "gesunken" : "gestiegen") um \(delta.value), "
                + (delta.positive ? "gut" : "schlecht")
            },
            label: "Umsatz", value: "41.900 €")))
      defer { scene.close() }
      let read = Scene.elements(in: scene.host).flatMap { element in
        ["accessibilityLabel", "accessibilityValue", "accessibilityTitle"].compactMap {
          attribute(element, $0)
        }
      }
      XCTAssertTrue(read.contains { $0.contains("gesunken um 8%, schlecht") }, "read: \(read)")
      XCTAssertFalse(read.contains { $0.contains(PMStrings.negative) }, "read: \(read)")
    }

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
