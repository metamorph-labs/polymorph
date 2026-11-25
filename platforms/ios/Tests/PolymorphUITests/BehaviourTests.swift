#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What members do when a person acts on them, which a render cannot show:
  /// each member is hosted in a window, pressed through the accessibility tree
  /// as an assistive client presses it, typed into through the window's field
  /// editor, or sent keys and clicks as the window's events, and what it
  /// reports and exposes is read back.
  @MainActor
  final class BehaviourTests: XCTestCase {
    override func setUp() async throws {
      // SwiftUI builds its accessibility nodes once an assistive client asks;
      // setting `AXEnhancedUserInterface`, as such a client does, turns them on.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    // MARK: Identity

    func testAnIdentifierValueKeepsItsSpacesAndPercentSigns() {
      let member = PMMember(
        "Tabs", attributes: ["active": "100% done now", "orientation": "horizontal"])
      XCTAssertEqual(
        member.identifier, "member:Tabs active=100%25%20done%20now orientation=horizontal")
      let parsed = PMMember.parse(member.identifier)
      XCTAssertEqual(parsed?.name, "Tabs")
      XCTAssertEqual(parsed?.attributes, ["active": "100% done now", "orientation": "horizontal"])
    }

    // MARK: Choices

    func testAControlledCheckboxReportsATapOnce() throws {
      var reported: [PMCheckedState] = []
      let scene = Scene(
        PMCheckbox(
          props: PMCheckboxProps(
            checked: .unchecked, label: "Notify me", onCheckedChange: { reported.append($0) })))
      defer { scene.close() }
      let box = try XCTUnwrap(scene.element(role: .checkBox, named: "Notify me"))
      press(box)
      XCTAssertEqual(reported, [.checked], "a tap reports the choice once")
    }

    /// The circle's border follows the recipe's rules as CSS resolves them:
    /// `radio-group.module.css`, where the invalid rule (0,3,0) outranks the
    /// checked one (0,2,0) and `.circle[data-disabled]` (0,2,0), and the hover
    /// rules, (0,3,0) later in the file and (0,4,0), outrank the invalid one.
    func testACircleBorderFollowsTheRecipesCascade() {
      let colors = PMTheme.default.colors
      let border = { (enabled: Bool, checked: Bool, invalid: Bool, active: Bool) in
        PMRadioGroup.circleBorder(
          colors, enabled: enabled, checked: checked, invalid: invalid, active: active)
      }
      XCTAssertEqual(border(true, false, false, false), colors.borderField)
      XCTAssertEqual(border(true, true, false, false), colors.accentBg)
      XCTAssertEqual(border(true, false, false, true), colors.borderStrong)
      XCTAssertEqual(border(true, true, false, true), colors.accentBgHover)
      XCTAssertEqual(
        border(true, true, true, false), colors.dangerBorder, "invalid outranks checked")
      XCTAssertEqual(border(true, false, true, false), colors.dangerBorder)
      XCTAssertEqual(
        border(true, true, true, true), colors.accentBgHover, "checked hover outranks invalid")
      XCTAssertEqual(border(true, false, true, true), colors.borderStrong, "hover outranks invalid")
      XCTAssertEqual(border(false, true, false, false), colors.borderSubtle)
      XCTAssertEqual(border(false, false, false, false), colors.borderSubtle)
      XCTAssertEqual(border(false, true, true, false), colors.borderSubtle)
      XCTAssertEqual(
        border(false, false, true, false), colors.dangerBorder, "invalid outranks disabled")
    }

    func testSegmentsDivideTheTrackEqually() throws {
      let scene = Scene(
        PMSegmentedControl(
          props: PMSegmentedControlProps(
            label: "Queue",
            options: [
              PMSegmentedControlOption(value: "all", label: "All"),
              PMSegmentedControlOption(value: "waiting", label: "Waiting on the customer"),
              PMSegmentedControlOption(value: "mine", label: "Mine"),
            ])))
      defer { scene.close() }
      let widths = try ["All", "Waiting on the customer", "Mine"].map { label in
        try XCTUnwrap(scene.element(role: .button, named: label).map(frame)).width
      }
      XCTAssertEqual(Set(widths).count, 1, "the segments are \(widths) wide")
    }

    /// Beside a sibling that takes any width, as a search field or a line of
    /// text does, the control keeps its natural width at the default text
    /// size and the sibling gives way.
    func testSegmentsKeepTheirWidthBesideAFlexibleSibling() throws {
      let options = ["All", "Waiting", "Mine"].map {
        PMSegmentedControlOption(value: $0.lowercased(), label: $0)
      }
      let control = PMSegmentedControl(
        props: PMSegmentedControlProps(label: "Queue", options: options))
      let alone = Scene(control.fixedSize())
      let natural = try XCTUnwrap(alone.element(role: .button, named: "Waiting").map(frame)).width
      alone.close()
      let scene = Scene(
        HStack {
          control
          Text(verbatim: "Showing 24 of 120 tickets in the queue")
        })
      defer { scene.close() }
      let width = try XCTUnwrap(scene.element(role: .button, named: "Waiting").map(frame)).width
      XCTAssertEqual(width, natural, accuracy: 0.5, "the segment keeps its natural width")
    }

    func testSegmentsMirrorRightToLeft() throws {
      let scene = Scene(
        PMSegmentedControl(
          props: PMSegmentedControlProps(
            label: "Queue",
            options: [
              PMSegmentedControlOption(value: "all", label: "All"),
              PMSegmentedControlOption(value: "mine", label: "Mine"),
            ])
        )
        .environment(\.layoutDirection, .rightToLeft))
      defer { scene.close() }
      let all = try XCTUnwrap(scene.element(role: .button, named: "All").map(frame))
      let mine = try XCTUnwrap(scene.element(role: .button, named: "Mine").map(frame))
      XCTAssertGreaterThan(all.minX, mine.minX, "the first segment is at the start, the right")
    }

    func testASkeletonRowIsAnOptionRowTall() {
      let option = { (value: String) in
        PMOptionItem(value: value, label: value.capitalized, disabled: false, checked: false)
      }
      let height = { (options: [PMOptionItem], loading: Bool) -> CGFloat in
        let list = PMOptionList(
          member: "Combobox", query: .constant(""), searchLabel: "Assignee", options: options,
          loading: loading, emptyMessage: "", loadingMessage: "", countMessage: { _ in "" },
          onSelect: { _ in }, framed: true
        )
        .frame(width: Harness.canvas.width)
        .pmTheme(PMTheme.default)
        return NSHostingView(rootView: list).fittingSize.height
      }
      let one = height([option("ana")], false)
      let row = height([option("ana"), option("ben")], false) - one
      XCTAssertGreaterThan(row, 0)
      XCTAssertEqual(height([option("ana")], true) - one, row * 3, accuracy: 0.5)
    }

    // MARK: Hit regions

    /// The foundation's hit region (`pmHitRegion`, `pmHitTarget(drawn:)`): the
    /// part's element, which VoiceOver's touch exploration finds, is at least
    /// the hit target, and the layout keeps the part's drawn size, so the
    /// lines above and below it sit as close as the part is tall.
    func testAHitRegionReachesTheTargetAndKeepsTheDrawnSize() throws {
      let target = PMTheme.default.defaultDensity.hitTarget
      let scene = Scene(
        VStack(spacing: 0) {
          Text(verbatim: "Above")
          Button {
          } label: {
            Text(verbatim: "Go").pmHitRegion()
          }
          .buttonStyle(.plain)
          Text(verbatim: "Below")
        })
      defer { scene.close() }
      let part = try XCTUnwrap(scene.element(role: .button, named: "Go").map(frame))
      XCTAssertGreaterThanOrEqual(part.height, target, "the element is the hit target high")
      XCTAssertGreaterThanOrEqual(part.width, target, "the element is the hit target wide")
      let above = try XCTUnwrap(scene.element(named: "Above").map(frame))
      let below = try XCTUnwrap(scene.element(named: "Below").map(frame))
      let between = abs(below.midY - above.midY) - (above.height + below.height) / 2
      XCTAssertLessThan(between, target, "the layout keeps the part's drawn height")
    }

    /// A part taller than the height its recipe gives, as wrapped text at the
    /// largest text sizes is, keeps its own height in the layout: nothing is
    /// given back, so its neighbours do not run into it.
    func testAHitRegionKeepsAPartTallerThanItsGivenHeight() throws {
      let words = "Tickets waiting on the customer for more than a week"
      let scene = Scene(
        VStack(spacing: 0) {
          Text(verbatim: "Above")
          Button {
          } label: {
            Text(verbatim: words).frame(width: 60).pmHitRegion(height: 20)
          }
          .buttonStyle(.plain)
          Text(verbatim: "Below")
        })
      defer { scene.close() }
      let part = try XCTUnwrap(scene.element(role: .button, named: words).map(frame))
      XCTAssertGreaterThan(part.height, 20, "the words wrap past the given height")
      let above = try XCTUnwrap(scene.element(named: "Above").map(frame))
      let below = try XCTUnwrap(scene.element(named: "Below").map(frame))
      let between = abs(below.midY - above.midY) - (above.height + below.height) / 2
      XCTAssertEqual(between, part.height, accuracy: 1, "the layout keeps the part's own height")
    }

    /// A labelled Skeleton is one element the size of its block, whatever
    /// moment of the shimmer it is read at: the sweeping band draws nothing
    /// past the block.
    func testALabelledSkeletonIsItsBlockAtEveryMomentOfTheSweep() throws {
      let theme = PMTheme.default
      let scene = Scene(
        PMSkeleton(props: PMSkeletonProps(label: "Loading tickets", width: .width10)))
      defer { scene.close() }
      let block = CGSize(
        width: theme.defaultDensity.space.s10, height: theme.text.md.lineBox)
      for _ in 0..<3 {
        let element = try XCTUnwrap(scene.element(named: "Loading tickets").map(frame))
        XCTAssertEqual(
          element.width, block.width, accuracy: 0.5, "the element is the block's width")
        XCTAssertEqual(
          element.height, block.height, accuracy: 0.5, "the element is the block's height")
        // Another moment of the sweep.
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
      }
    }

    // MARK: Text

    func testTypingPastMaxLengthKeepsTheFieldAtItAndReportsOnce() throws {
      var reported: [String] = []
      let scene = Scene(
        PMInput(
          props: PMInputProps(
            ariaLabel: "Code", maxLength: 3, onChange: { reported.append($0) })))
      defer { scene.close() }
      let field = try XCTUnwrap(scene.textField())
      scene.type("abc", into: field)
      scene.type("d", into: field)
      XCTAssertEqual(field.stringValue, "abc", "the field shows the text cut at the limit")
      XCTAssertEqual(reported, ["abc"], "the text at the limit is reported once")
    }

    func testATextareaPastMaxLengthKeepsTheFieldAtIt() throws {
      var reported: [String] = []
      let scene = Scene(
        PMTextarea(
          props: PMTextareaProps(
            ariaLabel: "Note", maxLength: 3, onChange: { reported.append($0) })))
      defer { scene.close() }
      let field = try XCTUnwrap(scene.textField())
      scene.type("abc", into: field)
      scene.type("d", into: field)
      XCTAssertEqual(field.stringValue, "abc")
      XCTAssertEqual(reported, ["abc"])
    }

    func testAStepperClickStepsWithoutFocusingTheField() throws {
      var focused = 0
      var reported: [Double?] = []
      let scene = Scene(
        PMNumberInput(
          props: PMNumberInputProps(
            ariaLabel: "Agents", defaultValue: 5, onChange: { reported.append($0) },
            onFocus: { focused += 1 })))
      defer { scene.close() }
      let step = try XCTUnwrap(scene.element(role: .button, named: PMStrings.numberInputIncrement))
      scene.click(at: frame(step))
      XCTAssertEqual(reported, [6], "the click steps the value")
      XCTAssertEqual(focused, 0, "the click on a stepper does not focus the field")
    }

    func testTheRevealToggleRevealsWithoutFocusingTheField() throws {
      let scene = Scene(
        PMPasswordInput(
          props: PMPasswordInputProps(
            ariaLabel: "Password", defaultValue: "hunter2", toggleLabel: "Show password")))
      defer { scene.close() }
      let toggle = try XCTUnwrap(scene.element(named: "Show password"))
      scene.click(at: frame(toggle))
      let root = Scene.elements(in: scene.host).lazy
        .compactMap { attribute($0, "accessibilityIdentifier").flatMap(PMMember.parse) }
        .first { $0.name == "PasswordInput" }
      XCTAssertEqual(root?.attributes["state"], "visible", "the click reveals the password")
      XCTAssertNil(
        scene.window.firstResponder as? NSTextView,
        "the click on the toggle does not focus the field")
    }

    func testACommaCommitsTheTypedTextRawAndKeepsWhatIsRejected() throws {
      var seen: [String] = []
      var reported: [[String]] = []
      let scene = Scene(
        PMTagInput(
          props: PMTagInputProps(
            ariaLabel: "Labels", onChange: { reported.append($0) },
            validate: { raw in
              seen.append(raw)
              return raw.contains("?") ? nil : raw
            })))
      defer { scene.close() }
      let field = try XCTUnwrap(scene.textField())
      scene.type(" vip ,what?,urg", into: field)
      XCTAssertEqual(seen, [" vip ", "what?"], "validate gets each part as typed")
      XCTAssertEqual(reported, [[" vip "]])
      XCTAssertEqual(field.stringValue, "what? urg", "the rejected part stays before the rest")
    }

    /// A paste of several parts adds them together and reports once, so a
    /// controlled field, whose `value` the app has not updated between the
    /// parts, loses none of them.
    func testAPasteOfSeveralPartsReportsThemOnce() throws {
      var reported: [[String]] = []
      let scene = Scene(
        PMTagInput(
          props: PMTagInputProps(
            ariaLabel: "Labels", onChange: { reported.append($0) }, value: ["old"])))
      defer { scene.close() }
      let field = try XCTUnwrap(scene.textField())
      scene.type("a,b,c", into: field)
      XCTAssertEqual(reported, [["old", "a", "b"]])
      XCTAssertEqual(field.stringValue, "c", "the text after the last comma stays")
    }

    /// The parts past `max` are dropped with the text after them: a full
    /// field takes no text.
    func testAPastePastMaxDropsTheRest() throws {
      var reported: [[String]] = []
      let scene = Scene(
        PMTagInput(
          props: PMTagInputProps(ariaLabel: "Labels", max: 2, onChange: { reported.append($0) })))
      defer { scene.close() }
      let field = try XCTUnwrap(scene.textField())
      scene.type("a,b,c,d", into: field)
      XCTAssertEqual(reported, [["a", "b"]])
      XCTAssertEqual(field.stringValue, "", "a full field holds no text")
    }

    func testClosingTheListClearsTheSearchText() throws {
      var typed: [String] = []
      var chosen: [String?] = []
      let scene = Scene(
        PMCombobox(
          props: PMComboboxProps(
            ariaLabel: "Assignee", defaultOpen: true, onChange: { chosen.append($0) },
            onInputChange: { typed.append($0) }, options: ComboboxStates.team)))
      defer { scene.close() }
      let panel = try XCTUnwrap(
        NSApp.windows.first { $0 !== scene.window && $0.isVisible && $0.contentView != nil },
        "the list is presented")
      let search = try XCTUnwrap(
        scene.textField(in: panel.contentView), "the list has its search field")
      scene.type("e", into: search)
      let row = try XCTUnwrap(
        Scene.element(in: panel.contentView ?? NSView(), role: .button, named: "Ben Okafor"))
      press(row)
      XCTAssertEqual(chosen, ["ben"])
      XCTAssertEqual(typed, ["e", ""], "closing the list clears its search text")
    }

    // MARK: Pages

    /// A page too short for the thread scrolls as a whole, and the composer
    /// keeps its draft and its focus across the change: the page keeps one
    /// structure, and the composer stays pinned inside the window.
    func testTheComposerKeepsItsDraftAndFocusWhenThePageScrollsAsAWhole() throws {
      let scene = Scene(
        PMConversationPage(
          props: PMConversationPageProps(
            loadStatus: .ready,
            composer: AnyView(
              PMPromptInput(props: PMPromptInputProps(label: "Message", onSubmit: { _ in }))),
            description: "Pilot can read the workspace and cite what it finds.",
            thread: AnyView(PMChatThread(props: PMChatThreadProps(label: "Conversation"))),
            title: "Webhook retries")),
        size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      let field = try XCTUnwrap(scene.textField())
      scene.type("Why do retries stop", into: field)
      // Too short for the thread: the header and the composer take the window.
      scene.window.setContentSize(CGSize(width: 360, height: 200))
      scene.host.layoutSubtreeIfNeeded()
      scene.settle()
      let now = try XCTUnwrap(scene.textField())
      XCTAssertTrue(now === field, "the composer's field is the one typed into")
      XCTAssertEqual(now.stringValue, "Why do retries stop", "the draft is kept")
      XCTAssertTrue(
        (scene.window.firstResponder as? NSTextView)?.delegate as? NSTextField === now,
        "the field keeps focus")
      let composer = now.convert(now.bounds, to: nil)
      XCTAssertTrue(
        scene.host.bounds.insetBy(dx: -1, dy: -1).contains(composer),
        "the composer stays inside the window, at \(composer) in \(scene.host.bounds)")
    }

    // MARK: Disabled

    func testADisabledSliderIsDisabledToAssistiveTechnology() throws {
      let scene = Scene(
        PMSlider(
          props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(40), disabled: true)))
      defer { scene.close() }
      let adjustable = try XCTUnwrap(scene.element(named: "Volume"))
      XCTAssertEqual(adjustable.value(forKey: "accessibilityEnabled") as? Bool, false)
    }

    // MARK: Tabs

    func testTheArrowsHomeAndEndChooseTheTabAlongTheStrip() {
      let tabs = [
        PMTabDescriptor(value: "a", label: "A"),
        PMTabDescriptor(value: "b", label: "B", disabled: true),
        PMTabDescriptor(value: "c", label: "C"),
        PMTabDescriptor(value: "d", label: "D"),
      ]
      let target = { (from: String, key: KeyEquivalent, vertical: Bool, rtl: Bool) in
        PMTabs.target(from: from, key: key, tabs: tabs, vertical: vertical, rightToLeft: rtl)
      }
      XCTAssertEqual(target("a", .rightArrow, false, false), "c", "a disabled tab is skipped")
      XCTAssertEqual(target("d", .rightArrow, false, false), "a", "the last wraps to the first")
      XCTAssertEqual(target("a", .leftArrow, false, false), "d", "the first wraps to the last")
      XCTAssertEqual(target("a", .leftArrow, false, true), "c", "right to left swaps the arrows")
      XCTAssertEqual(target("c", .rightArrow, false, true), "a")
      XCTAssertNil(target("a", .downArrow, false, false), "a row does not take Down")
      XCTAssertEqual(target("a", .downArrow, true, false), "c", "a column takes Down")
      XCTAssertEqual(target("a", .upArrow, true, false), "d")
      XCTAssertNil(target("a", .rightArrow, true, false), "a column does not take Right")
      XCTAssertEqual(target("c", .home, false, false), "a")
      XCTAssertEqual(target("a", .end, true, false), "d")
    }

    func testTheStripIsATabGroupOfItsTriggers() throws {
      let tabs = [
        PMTabDescriptor(value: "activity", label: "Activity"),
        PMTabDescriptor(value: "details", label: "Details"),
      ]
      let scene = Scene(PMTabs(props: PMTabsProps(children: PMContent(EmptyView()), tabs: tabs)))
      defer { scene.close() }
      let strip = try XCTUnwrap(
        Scene.elements(in: scene.host).first {
          attribute($0, "accessibilityRole") == NSAccessibility.Role.tabGroup.rawValue
        }, "the strip is a tab group, the web's tablist")
      XCTAssertNotNil(Scene.element(in: strip, role: .button, named: "Activity"))
      XCTAssertNotNil(Scene.element(in: strip, role: .button, named: "Details"))
    }

    /// Keys sent to the strip while a trigger has focus select along it,
    /// from that trigger. A button takes keyboard focus only while the
    /// system's keyboard navigation is on, which a test cannot turn on for its
    /// own process, so each trigger is focused as an assistive client focuses
    /// it, through its element, and the keys go to the strip's key handler
    /// from there. Moving focus to the selected trigger needs the system's
    /// setting, and no test here reaches it.
    func testAnArrowOnAFocusedTriggerSelectsAlongTheStrip() throws {
      var reported: [String] = []
      let tabs = [
        PMTabDescriptor(value: "activity", label: "Activity"),
        PMTabDescriptor(value: "details", label: "Details"),
        PMTabDescriptor(value: "audit", label: "Audit log"),
      ]
      let scene = Scene(
        PMTabs(
          props: PMTabsProps(
            children: PMContent(EmptyView()), onChange: { reported.append($0) }, tabs: tabs)))
      defer { scene.close() }
      for (label, key) in [
        ("Activity", KeyEquivalent.rightArrow), ("Details", .rightArrow),
        ("Audit log", .rightArrow), ("Activity", .end),
      ] {
        try focus(scene, label)
        scene.press(key: key)
      }
      XCTAssertEqual(reported, ["details", "audit", "activity", "audit"])
    }

    /// While the active tab is disabled, or `value` names no tab, the first
    /// enabled trigger is the strip's stop, so the keys still reach it.
    func testTheStripStaysReachableWithoutAnEnabledActiveTab() throws {
      for (value, disabled) in [("activity", true), ("gone", false)] {
        var reported: [String] = []
        let tabs = [
          PMTabDescriptor(value: "activity", label: "Activity", disabled: disabled),
          PMTabDescriptor(value: "details", label: "Details"),
          PMTabDescriptor(value: "audit", label: "Audit log"),
        ]
        let scene = Scene(
          PMTabs(
            props: PMTabsProps(
              children: PMContent(EmptyView()), onChange: { reported.append($0) }, tabs: tabs,
              value: value)))
        defer { scene.close() }
        let first = disabled ? "Details" : "Activity"
        try focus(scene, first)
        scene.press(key: .rightArrow)
        XCTAssertEqual(
          reported, [disabled ? "audit" : "details"], "the keys move on from \(first)")
      }
    }

    /// A row wider than the strip scrolls inside it. The strip keeps the width
    /// it is given, opens with the active trigger in view, and brings a newly
    /// active trigger into view. Frames are read from the accessibility tree,
    /// where a trigger scrolled out of the strip lies outside the strip's frame.
    func testAStripWiderThanItsContainerScrollsToTheActiveTab() throws {
      let tabs = ["Overview", "Activity", "Members", "Billing", "Integrations", "Audit log", "Settings"]
        .map { PMTabDescriptor(value: $0.lowercased(), label: $0) }
      let width: CGFloat = 240
      let scene = Scene(
        PMTabs(
          props: PMTabsProps(
            children: PMContent(EmptyView()), defaultValue: "settings", tabs: tabs)),
        size: CGSize(width: width, height: 200))
      defer { scene.close() }
      let strip = try XCTUnwrap(
        Scene.elements(in: scene.host).first {
          attribute($0, "accessibilityRole") == NSAccessibility.Role.tabGroup.rawValue
        })
      XCTAssertLessThanOrEqual(frame(strip).width, width, "the strip keeps its container's width")
      // Whether the trigger is wholly inside the strip, with a point of slack for rounding.
      let shown = { (label: String) -> Bool in
        guard let trigger = Scene.element(in: strip, role: .button, named: label) else { return false }
        return self.frame(strip).insetBy(dx: -1, dy: -1).contains(self.frame(trigger))
      }
      XCTAssertTrue(shown("Settings"), "the strip opens on the active tab")
      XCTAssertFalse(shown("Overview"), "the first tab is scrolled out of the strip")

      let first = try XCTUnwrap(Scene.element(in: strip, role: .button, named: "Overview"))
      press(first)
      // The move takes the surface duration.
      for _ in 0..<10 where !shown("Overview") { scene.settle() }
      XCTAssertTrue(shown("Overview"), "a newly active tab is scrolled into view")
      XCTAssertFalse(shown("Settings"))
    }

    /// A row that fits draws no scroll view, so its triggers sit where a strip
    /// that never scrolls has them.
    func testAStripThatFitsDrawsNoScrollView() throws {
      let tabs = [
        PMTabDescriptor(value: "activity", label: "Activity"),
        PMTabDescriptor(value: "details", label: "Details"),
      ]
      let scene = Scene(PMTabs(props: PMTabsProps(children: PMContent(EmptyView()), tabs: tabs)))
      defer { scene.close() }
      func scrollViews(in view: NSView) -> [NSScrollView] {
        (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrollViews)
      }
      XCTAssertTrue(scrollViews(in: scene.host).isEmpty)
    }

    /// Moves focus to the trigger named `label` as an assistive client does,
    /// and fails when it does not take it.
    private func focus(_ scene: Scene, _ label: String) throws {
      let trigger = try XCTUnwrap(scene.element(role: .button, named: label))
      _ = trigger.perform(
        NSSelectorFromString("setAccessibilityFocused:"), with: NSNumber(value: true))
      scene.settle()
      XCTAssertEqual(
        trigger.value(forKey: "accessibilityFocused") as? Bool, true, "\(label) takes focus")
    }

    // MARK: Overlays

    func testChoosingAConfirmDialogsActionClosesItOnce() throws {
      var opens: [Bool] = []
      var confirmed = 0
      let scene = Scene(
        PMConfirmDialog(
          props: PMConfirmDialogProps(
            confirmLabel: "Discard", description: "The draft will be lost.",
            onConfirm: { confirmed += 1 }, onOpenChange: { opens.append($0) }, open: true,
            title: "Discard this ticket?",
            trigger: PMContent(PMButton(props: PMButtonProps(label: "Discard"))))))
      defer { scene.close() }
      let sheet = try XCTUnwrap(scene.window.attachedSheet, "the dialog is presented")
      let action = try XCTUnwrap(
        Scene.element(in: sheet.contentView ?? NSView(), role: .button, named: "Discard"))
      press(action)
      scene.settle()
      XCTAssertEqual(confirmed, 1)
      XCTAssertEqual(opens, [false], "the dialog reports its close once")
    }

    /// An AvatarButton is an overlay's trigger as a Button is: a press runs its
    /// own action and then the opening action a Menu, a Popover or a Dialog
    /// puts in the environment, and while loading a press runs neither.
    func testAnAvatarButtonRunsItsOverlaysOpeningActionAfterItsOwn() throws {
      var events: [String] = []
      let scene = Scene(
        VStack {
          PMOverlayTrigger(
            trigger: PMContent(
              PMAvatarButton(
                props: PMAvatarButtonProps(
                  label: "Account menu", name: "Ada Lovelace",
                  onClick: { events.append("press") }))),
            open: { events.append("open") })
          PMOverlayTrigger(
            trigger: PMContent(
              PMAvatarButton(
                props: PMAvatarButtonProps(
                  label: "Signing out", loading: true, name: "Ada Lovelace",
                  onClick: { events.append("press") }))),
            open: { events.append("open") })
        })
      defer { scene.close() }
      let busy = try XCTUnwrap(scene.element(role: .button, named: "Signing out"))
      press(busy)
      XCTAssertEqual(events, [], "a loading button ignores the press")
      let account = try XCTUnwrap(scene.element(role: .button, named: "Account menu"))
      press(account)
      XCTAssertEqual(events, ["press", "open"], "its own action runs, then the overlay opens")
    }

    /// A typed confirmation: the confirm stays disabled until the field holds
    /// the phrase, letter case and the spaces around it aside; the error shows
    /// at the first character that cannot lead to the phrase and goes when the
    /// text can again; and the confirm then runs once and closes the sheet.
    func testATypedConfirmationWaitsForThePhrase() throws {
      var opens: [Bool] = []
      var confirmed = 0
      let scene = Scene(
        PMConfirmDialog(
          props: PMConfirmDialogProps(
            confirmLabel: "Delete project", confirmWith: "acme-billing",
            description: "Its tickets, members and settings are deleted with it.",
            onConfirm: { confirmed += 1 }, onOpenChange: { opens.append($0) }, open: true,
            title: "Delete the acme-billing project?",
            trigger: PMContent(PMButton(props: PMButtonProps(label: "Delete"))))))
      defer { scene.close() }
      let sheet = try XCTUnwrap(scene.window.attachedSheet, "the typed confirmation is presented")
      let content = sheet.contentView ?? NSView()
      let field = try XCTUnwrap(scene.textField(in: content), "the sheet holds the phrase's field")
      XCTAssertNotNil(
        Scene.element(in: content, role: .textField, named: "Type acme-billing to confirm"),
        "the field is named by its label, with the phrase in it")
      let enabled = { () -> Bool? in
        Scene.element(in: content, role: .button, named: "Delete project")?
          .value(forKey: "accessibilityEnabled") as? Bool
      }
      // FormField speaks its error through the field; its own identity says it is invalid.
      let invalid = { () -> Bool in
        Scene.elements(in: content).contains { element in
          let member = attribute(element, "accessibilityIdentifier").flatMap(PMMember.parse)
          return member?.name == "FormField" && member?.attributes["invalid"] == "true"
        }
      }
      XCTAssertEqual(enabled(), false, "the confirm waits for the phrase")

      scene.type("ACME-b", into: field)
      XCTAssertFalse(invalid(), "no error while the text can still become the phrase")
      scene.type("u", into: field)
      XCTAssertTrue(invalid(), "the error shows at the first character that cannot")
      XCTAssertEqual(enabled(), false)
      XCTAssertTrue(
        (sheet.firstResponder as? NSTextView)?.delegate as? NSTextField === field,
        "the field keeps focus as its error appears")

      (sheet.firstResponder as? NSTextView)?.deleteBackward(nil)
      scene.settle()
      XCTAssertFalse(invalid(), "the error goes when the text can become the phrase again")
      scene.type("illing ", into: field)
      XCTAssertEqual(field.stringValue, "ACME-billing ")
      XCTAssertEqual(enabled(), true, "the phrase enables the confirm")

      press(try XCTUnwrap(Scene.element(in: content, role: .button, named: "Delete project")))
      scene.settle()
      XCTAssertEqual(confirmed, 1)
      XCTAssertEqual(opens, [false], "the confirm closes the sheet once")
    }

    /// A typed confirmation's field takes the phrase as typed: its field
    /// editor corrects nothing, where a plain Input's corrects as the
    /// system's setting says, because a correction can change a phrase such
    /// as "acme-billing" as it is typed. Capitalisation is iOS's alone.
    func testATypedConfirmationsFieldCorrectsNothing() throws {
      let scene = Scene(
        PMConfirmDialog(
          props: PMConfirmDialogProps(
            confirmLabel: "Delete project", confirmWith: "acme-billing",
            description: "Its tickets, members and settings are deleted with it.",
            onConfirm: {}, open: true, title: "Delete the acme-billing project?",
            trigger: PMContent(PMButton(props: PMButtonProps(label: "Delete"))))))
      defer { scene.close() }
      let sheet = try XCTUnwrap(scene.window.attachedSheet, "the typed confirmation is presented")
      let field = try XCTUnwrap(scene.textField(in: sheet.contentView ?? NSView()))
      scene.type("acme", into: field)
      let editor = try XCTUnwrap(sheet.firstResponder as? NSTextView, "the field is being edited")
      XCTAssertFalse(editor.isAutomaticSpellingCorrectionEnabled, "nothing corrects the phrase")

      let plain = Scene(PMInput(props: PMInputProps(ariaLabel: "Subject")))
      defer { plain.close() }
      plain.type("acme", into: try XCTUnwrap(plain.textField()))
      XCTAssertEqual(
        (plain.window.firstResponder as? NSTextView)?.isAutomaticSpellingCorrectionEnabled,
        NSSpellChecker.isAutomaticSpellingCorrectionEnabled,
        "a plain field corrects as the system says")
    }

    /// Input's `exact` takes the text as typed: its field editor corrects
    /// nothing, as the typed confirmation's field does, where a plain Input's
    /// corrects as the system's setting says.
    func testAnExactInputCorrectsNothing() throws {
      let scene = Scene(PMInput(props: PMInputProps(ariaLabel: "Project name", exact: true)))
      defer { scene.close() }
      scene.type("acme", into: try XCTUnwrap(scene.textField()))
      let editor = try XCTUnwrap(scene.window.firstResponder as? NSTextView, "the field is edited")
      XCTAssertFalse(editor.isAutomaticSpellingCorrectionEnabled, "nothing corrects the text")
    }

    /// RelativeTime: `mode: .both` joins the moment and the phrase with the
    /// app's `messages.both`, the moment first and the phrase second, so a
    /// locale orders and punctuates them.
    func testBothIsJoinedByTheAppsMessages() throws {
      let messages = PMRelativeTimeMessages(both: { moment, distance in
        "\(distance.isEmpty ? "" : "a distance"), after \(moment)"
      })
      let scene = Scene(
        PMRelativeTime(
          props: PMRelativeTimeProps(
            format: .long, locale: "en_US", messages: messages, mode: .both, value: "2026-08-04"))
      )
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: "a distance, after August 4, 2026"))
    }

    // MARK: Image

    /// A 160 by 100 picture as a data URL, which `AsyncImage` reads without
    /// the network.
    private static let picture =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsklEQVR42u3RQQ0AAAjEsHOE"
      + "D6zg/48NQppMwZrq0eNiAWABFmABFmABFmDAAizAAizAAizAgAVYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmDA"
      + "AizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGAXAAuwAAuwAAuwAAMWYAEWYAEWYAEGLMACLMACLMACLMCABViA"
      + "BViABViAAQuwAAuwAAuwAAMWYAHWvRZDr606XF3XhAAAAABJRU5ErkJggg=="

    /// Image: a picture that arrives ends the loading state, in the box the
    /// props held for it and under the same name.
    func testAPictureLoadsIntoTheBoxItsPropsHeld() throws {
      let scene = Scene(
        PMImage(props: PMImageProps(alt: "A harbour", height: 100, src: Self.picture, width: 160)))
      defer { scene.close() }
      XCTAssertTrue(
        settles(scene) { self.identity(of: "Image", in: scene)?.attributes["state"] == nil },
        "the picture never loaded")
      let drawn = try XCTUnwrap(scene.element(named: "A harbour").map(frame))
      XCTAssertEqual(drawn.width, 160, accuracy: 0.5)
      XCTAssertEqual(drawn.height, 100, accuracy: 0.5)
    }

    /// Image: with no size given, a loaded picture is drawn at its own size.
    func testAPictureWithNoSizeGivenIsDrawnAtItsOwn() throws {
      // In a frame of the window's size: a hosting view sizes its window to its
      // content, and this content has no size until its picture arrives.
      let scene = Scene(
        PMImage(props: PMImageProps(alt: "A harbour", src: Self.picture))
          .frame(width: 360, height: 480))
      defer { scene.close() }
      XCTAssertTrue(
        settles(scene) { self.identity(of: "Image", in: scene)?.attributes["state"] == nil },
        "the picture never loaded")
      let drawn = try XCTUnwrap(scene.element(named: "A harbour").map(frame))
      XCTAssertEqual(drawn.width, 160, accuracy: 0.5)
      XCTAssertEqual(drawn.height, 100, accuracy: 0.5)
    }

    /// Image: bytes that are no picture end in the failed state, in the same
    /// box and under the same name.
    func testAPictureThatCannotBeReadDrawsTheFallbackUnderItsName() throws {
      let scene = Scene(
        PMImage(
          props: PMImageProps(
            alt: "A harbour", height: 100, src: "data:image/png;base64,AAAA", width: 160)))
      defer { scene.close() }
      XCTAssertTrue(
        settles(scene) { self.identity(of: "Image", in: scene)?.attributes["state"] == "failed" },
        "the picture never failed")
      let drawn = try XCTUnwrap(scene.element(named: "A harbour").map(frame))
      XCTAssertEqual(drawn.width, 160, accuracy: 0.5)
      XCTAssertEqual(drawn.height, 100, accuracy: 0.5)
    }

    /// Turns the run loop until `condition` holds, for a few seconds at most:
    /// a picture settles when its loader does, not after a fixed wait.
    private func settles(_ scene: Scene, _ condition: () -> Bool) -> Bool {
      for _ in 0..<20 where !condition() { scene.settle() }
      return condition()
    }

    func testAToastReportsItsDismissalOnceAndItsRemovalNever() throws {
      var dismissed = 0
      let scene = Scene(
        PMToast(
          props: PMToastProps(
            durationMs: .infinity, onDismiss: { dismissed += 1 }, title: "Ticket archived")))
      defer { scene.close() }
      let close = try XCTUnwrap(scene.element(role: .button, named: PMStrings.dismiss))
      press(close)
      scene.settle()
      XCTAssertEqual(dismissed, 1, "the close button reports the dismissal once")
      XCTAssertNil(scene.element(role: .button, named: PMStrings.dismiss), "the card left")
    }

    /// The time running out reports the dismissal once, to the `onDismiss`
    /// the owner gave last, although the timer started under an earlier one;
    /// and the owner removing the toast before its time is not a dismissal.
    func testAToastsTimeReportsItsDismissalToItsLatestCallback() throws {
      let owner = ToastOwner()
      let scene = Scene(OwnedToast(owner: owner))
      defer { scene.close() }
      owner.generation = 1
      scene.settle()
      RunLoop.main.run(until: Date().addingTimeInterval(1))
      XCTAssertEqual(owner.reported, [1], "the time reports once, to the latest callback")

      let removing = ToastOwner()
      let owned = Scene(OwnedToast(owner: removing))
      defer { owned.close() }
      removing.shown = false
      owned.settle()
      RunLoop.main.run(until: Date().addingTimeInterval(1))
      XCTAssertEqual(removing.reported, [], "the owner removing the toast is not a dismissal")
    }

    /// Toast: a call that sets neither `retained` nor `durationMs` takes its
    /// tone's lifetime, as the web's store gives it: danger and warning are
    /// pinned until they are dismissed, and success, info and neutral leave
    /// after the default duration, unless the toast has an action, which pins
    /// it whatever its tone. A call that sets either takes what it sets.
    func testAToastTakesItsLifetimeFromItsTone() throws {
      let undo = PMToastAction(label: "Undo", onClick: {})
      let cases: [(props: PMToastProps, pinned: Bool)] = [
        (PMToastProps(title: "Could not save", tone: .danger), true),
        (PMToastProps(title: "Storage nearly full", tone: .warning), true),
        (PMToastProps(title: "Saved", tone: .success), false),
        (PMToastProps(title: "Synced", tone: .info), false),
        (PMToastProps(title: "Ticket created"), false),
        (PMToastProps(retained: false, title: "Could not save", tone: .danger), false),
        (PMToastProps(durationMs: .infinity, title: "Saved", tone: .success), true),
        (PMToastProps(action: undo, title: "Ticket archived", tone: .success), true),
        (PMToastProps(action: undo, title: "Ticket moved"), true),
        (PMToastProps(action: undo, durationMs: 5000, title: "Ticket closed"), false),
      ]
      for (props, pinned) in cases {
        let scene = Scene(PMToast(props: props))
        defer { scene.close() }
        let toast = try XCTUnwrap(identity(of: "Toast", in: scene), props.title)
        XCTAssertEqual(toast.attributes["pinned"] == "true", pinned, "\(toast.attributes)")
      }

      var left: [String] = []
      let scene = Scene(
        VStack {
          PMToast(
            props: PMToastProps(
              onDismiss: { left.append("success") }, title: "Saved", tone: .success))
          PMToast(
            props: PMToastProps(
              onDismiss: { left.append("danger") }, title: "Could not save", tone: .danger))
        })
      defer { scene.close() }
      RunLoop.main.run(until: Date().addingTimeInterval(5.6))
      XCTAssertEqual(left, ["success"], "only the success toast left after 5000 ms")
    }

    /// CursorPagination's append form warns in a debug build when the app's
    /// `messages` leave out `more` or `end`, which would then be English
    /// beside the app's words; with both, or with no `messages`, it says
    /// nothing, as the web warns in development.
    func testTheAppendFormWarnsWhenItsWordsWouldMixLanguages() {
      let warning = "polymorph: CursorPagination: the append form"
      let pager = { (messages: PMCursorPaginationMessages?) in
        PMCursorPagination(
          props: PMCursorPaginationProps(
            hasNext: true, hasPrevious: true, messages: messages, mode: .append, onNext: {}))
      }
      let partial = PMCursorPaginationMessages(previous: "Précédent", next: "Suivant")
      let whole = PMCursorPaginationMessages(
        previous: "Précédent", next: "Suivant", more: "Charger plus", end: "Plus rien")
      XCTAssertTrue(printed { Scene(pager(partial)).close() }.contains(warning))
      XCTAssertFalse(printed { Scene(pager(whole)).close() }.contains(warning))
      XCTAssertFalse(printed { Scene(pager(nil)).close() }.contains(warning))
    }

    /// CursorPagination's append form remembers that it asked for a window and
    /// never reads `hasPrevious`: after a press, `hasNext` turning false takes
    /// the action away and the end line says the list ran out, and a form that
    /// never asked draws nothing without a next window.
    func testTheAppendFormEndsTheListAfterAPress() throws {
      let words = PMStrings.cursorPaginationMessages
      let more = try XCTUnwrap(words.more)
      let end = try XCTUnwrap(words.end)
      let feed = Feed()
      let scene = Scene(FeedPager(feed: feed))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .button, named: more), "the action is drawn"))
      scene.settle()
      XCTAssertNotNil(scene.element(named: end), "the end line says the list ran out")
      XCTAssertNil(scene.element(role: .button, named: more), "the action left")

      let unpaged = Scene(
        PMCursorPagination(
          props: PMCursorPaginationProps(
            hasNext: false, hasPrevious: true, mode: .append, onNext: {})))
      defer { unpaged.close() }
      XCTAssertNil(unpaged.element(named: end), "a form that never asked says nothing")
      XCTAssertNil(unpaged.element(named: PMStrings.pagination), "and draws nothing")
    }

    /// CursorPagination's `disabled` is the app's hold: both directions are
    /// disabled, and the same pager without it has them enabled. A direction
    /// the list has no cursor for stays disabled either way.
    func testAHeldPagerDisablesEveryDirection() throws {
      let words = PMStrings.cursorPaginationMessages
      let pager = { (disabled: Bool, hasNext: Bool) in
        PMCursorPagination(
          props: PMCursorPaginationProps(
            disabled: disabled, hasNext: hasNext, hasPrevious: true, onNext: {}, onPrevious: {}))
      }
      let enabled = { (scene: Scene, name: String) -> Bool? in
        scene.element(role: .button, named: name)?.value(forKey: "accessibilityEnabled") as? Bool
      }
      let held = Scene(pager(true, true))
      defer { held.close() }
      XCTAssertEqual(enabled(held, words.previous), false, "a held pager's previous is disabled")
      XCTAssertEqual(enabled(held, words.next), false, "and its next")

      let free = Scene(pager(false, false))
      defer { free.close() }
      XCTAssertEqual(enabled(free, words.previous), true, "without the hold, previous can be pressed")
      XCTAssertEqual(enabled(free, words.next), false, "a direction with no cursor stays disabled")
    }

    /// Pagination's `disabled` is the app's hold: both arrows and every page
    /// are disabled, the current page too, and the same pager without it has
    /// them enabled. An arrow at an end of the list stays disabled either way.
    func testAHeldPaginationDisablesEveryControl() throws {
      let words = PMStrings.paginationMessages
      let pager = { (disabled: Bool) in
        PMPagination(
          props: PMPaginationProps(
            disabled: disabled, onPageChange: { _ in }, page: 1, pageCount: 3))
      }
      let enabled = { (scene: Scene, name: String) -> Bool? in
        scene.element(role: .button, named: name)?.value(forKey: "accessibilityEnabled") as? Bool
      }
      let pages = [words.page(1), words.page(2), words.page(3)]

      let held = Scene(pager(true))
      defer { held.close() }
      for name in pages + [words.previous, words.next] {
        XCTAssertEqual(enabled(held, name), false, "a held pager's \(name) is disabled")
      }

      let free = Scene(pager(false))
      defer { free.close() }
      for name in pages + [words.next] {
        XCTAssertEqual(enabled(free, name), true, "without the hold, \(name) can be pressed")
      }
      XCTAssertEqual(enabled(free, words.previous), false, "the first page has no previous one")
    }

    /// What `body` prints to standard output, which is sent to a pipe while it
    /// runs.
    private func printed(_ body: () -> Void) -> String {
      let pipe = Pipe()
      fflush(stdout)
      let saved = dup(STDOUT_FILENO)
      dup2(pipe.fileHandleForWriting.fileDescriptor, STDOUT_FILENO)
      body()
      fflush(stdout)
      dup2(saved, STDOUT_FILENO)
      Darwin.close(saved)
      try? pipe.fileHandleForWriting.close()
      return String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    }

    // MARK: Navigation

    /// Link (`link.md` §Routing): with `onNavigate`, a press calls it with the
    /// `href` in place of the environment's `openURL`; an external link, and a
    /// link without it, open as the environment says.
    func testOnNavigateTakesALinkInPlaceOfOpeningIt() throws {
      var routed: [String] = []
      var opened: [String] = []
      let scene = Scene(
        VStack {
          PMLink(
            props: PMLinkProps(
              children: "Tickets", href: "/tickets", onNavigate: { routed.append($0) }))
          PMLink(
            props: PMLinkProps(
              children: "Status page", external: true, href: "https://example.com/status",
              onNavigate: { routed.append($0) }))
          PMLink(props: PMLinkProps(children: "Billing", href: "/billing"))
        }
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return .handled
          }))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .link, named: "Tickets")))
      press(try XCTUnwrap(scene.element(role: .link, named: "Status page")))
      press(try XCTUnwrap(scene.element(role: .link, named: "Billing")))
      XCTAssertEqual(routed, ["/tickets"], "only the routed link reaches the router")
      XCTAssertEqual(opened, ["https://example.com/status", "/billing"])
    }

    /// Breadcrumbs: a crumb with an `href` goes to the trail's `onNavigate` in
    /// place of the environment's `openURL`, as Link does. A crumb with an
    /// `href` and `onSelect` stays a link, and runs `onSelect` before it
    /// routes or opens, as the web runs it beside the click.
    func testOnNavigateTakesACrumb() throws {
      var routed: [String] = []
      var opened: [String] = []
      var selected: [String] = []
      let crumbs = { (onNavigate: (@MainActor (String) -> Void)?) in
        PMBreadcrumbs(
          props: PMBreadcrumbsProps(
            items: [
              PMBreadcrumbItem(label: "Tickets", href: "/tickets"),
              PMBreadcrumbItem(
                label: "Queue", href: "/queue", onSelect: { selected.append("Queue") }),
              PMBreadcrumbItem(label: "Ticket #4182"),
            ],
            onNavigate: onNavigate)
        )
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return .handled
          })
      }
      let scene = Scene(crumbs { routed.append($0) })
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .link, named: "Tickets")))
      XCTAssertEqual(routed, ["/tickets"])
      XCTAssertEqual(opened, [], "the router took the crumb, so nothing opened it")
      press(try XCTUnwrap(scene.element(role: .link, named: "Queue"), "the crumb is a link"))
      XCTAssertEqual(selected, ["Queue"], "the item's onSelect runs")
      XCTAssertEqual(routed, ["/tickets", "/queue"], "and the router takes its href")

      let unrouted = Scene(crumbs(nil))
      defer { unrouted.close() }
      press(try XCTUnwrap(unrouted.element(role: .link, named: "Queue")))
      XCTAssertEqual(selected, ["Queue", "Queue"])
      XCTAssertEqual(opened, ["/queue"], "without a router, the link opens its href")
    }

    /// Card: with `onNavigate`, a press on a linked card calls it with the
    /// `href` in place of the environment's `openURL`, as Link does; without
    /// it, the card opens as the environment says.
    func testOnNavigateTakesALinkedCard() throws {
      var routed: [String] = []
      var opened: [String] = []
      let card = { (onNavigate: (@MainActor (String) -> Void)?) in
        PMCard(
          props: PMCardProps(
            children: AnyView(Text("Invoices and the plan.")), href: "/settings/billing",
            label: "Open billing settings", onNavigate: onNavigate)
        )
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return .handled
          })
      }
      let scene = Scene(card { routed.append($0) })
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(named: "Open billing settings")))
      XCTAssertEqual(routed, ["/settings/billing"])
      XCTAssertEqual(opened, [], "the router took the card, so nothing opened it")

      let unrouted = Scene(card(nil))
      defer { unrouted.close() }
      press(try XCTUnwrap(unrouted.element(named: "Open billing settings")))
      XCTAssertEqual(opened, ["/settings/billing"], "without a router, the card opens its href")
    }

    /// List (`list.md`): an item with an `href` is a link that runs `onSelect`
    /// and then goes to `onNavigate` in place of the environment's `openURL`,
    /// or opens through it without one; an item with `onSelect` alone is a
    /// button, selected while it is current; a trailing control takes its own
    /// press, which never reaches the row.
    func testAListItemFollowsItsLinkOrIsPickedAndItsTrailingControlIsItsOwn() throws {
      var did: [String] = []
      var opened: [String] = []
      let scene = Scene(
        PMList(
          props: PMListProps(
            children: AnyView(
              Group {
                PMList.Item(
                  props: PMListItemProps(
                    href: "/members/ada", onNavigate: { did.append("routed \($0)") },
                    onSelect: { did.append("selected Ada") }, title: "Ada Okafor"))
                PMList.Item(
                  props: PMListItemProps(
                    current: true, onSelect: { did.append("picked Bao") }, title: "Bao Tran",
                    trailing: AnyView(
                      PMButton(
                        props: PMButtonProps(
                          label: "Resend", onClick: { did.append("resent") }, size: .sm)))))
                PMList.Item(props: PMListItemProps(href: "/members/carmen", title: "Carmen Ruiz"))
              }), label: "Members")
        )
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return .handled
          }))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .link, named: "Ada Okafor")))
      XCTAssertEqual(did, ["selected Ada", "routed /members/ada"])
      let bao = try XCTUnwrap(scene.element(role: .button, named: "Bao Tran"))
      XCTAssertEqual(attribute(bao, "isAccessibilitySelected"), "1", "the current item is selected")
      press(bao)
      press(try XCTUnwrap(scene.element(role: .button, named: "Resend")))
      XCTAssertEqual(did, ["selected Ada", "routed /members/ada", "picked Bao", "resent"])
      press(try XCTUnwrap(scene.element(role: .link, named: "Carmen Ruiz")))
      XCTAssertEqual(opened, ["/members/carmen"], "without a router, the link opens its href")
      let list = try XCTUnwrap(identity(of: "List", in: scene))
      XCTAssertEqual(list.attributes, [:])
    }

    /// List (`list.md`): the trailing box takes the row's press for a touch
    /// that no control in it takes. What the box runs is the row's action, once:
    /// `onSelect`, then the route or `openURL` for an `href`. A click on a
    /// trailing Button runs the Button's action and not the row's. The box adds
    /// no element and no control: the Badge stays text with no action, and the
    /// only buttons are the two rows and Resend. A synthetic click reaches no
    /// SwiftUI tap gesture in this process, so the tap on the Badge itself is
    /// not driven here: the box's action is called as the gesture calls it.
    func testAPressOnATrailingMarkPressesTheRowAndATrailingControlKeepsItsOwn() throws {
      var ran: [String] = []
      let open = OpenURLAction { url in
        ran.append("opened \(url.absoluteString)")
        return .handled
      }
      let picked = PMList.Item.rowPress(
        PMListItemProps(onSelect: { ran.append("picked") }, title: "Bao Tran"), openURL: open)
      picked?()
      XCTAssertEqual(ran, ["picked"])
      let routed = PMList.Item.rowPress(
        PMListItemProps(
          href: "/members/ada", onNavigate: { ran.append("routed \($0)") },
          onSelect: { ran.append("selected") }, title: "Ada Okafor"), openURL: open)
      routed?()
      XCTAssertEqual(ran, ["picked", "selected", "routed /members/ada"])
      PMList.Item.rowPress(
        PMListItemProps(href: "/members/carmen", title: "Carmen Ruiz"), openURL: open)?()
      XCTAssertEqual(ran.last, "opened /members/carmen")
      XCTAssertNil(
        PMList.Item.rowPress(PMListItemProps(title: "Read only"), openURL: open),
        "an item that is only read gives its trailing box no press")

      var did: [String] = []
      let scene = Scene(
        PMList(
          props: PMListProps(
            children: AnyView(
              Group {
                PMList.Item(
                  props: PMListItemProps(
                    onSelect: { did.append("picked Ada") }, title: "Ada Okafor",
                    trailing: AnyView(
                      PMButton(
                        props: PMButtonProps(
                          label: "Resend", onClick: { did.append("resent") }, size: .sm)))))
                PMList.Item(
                  props: PMListItemProps(
                    onSelect: { did.append("picked Bao") }, title: "Bao Tran",
                    trailing: AnyView(
                      PMBadge(props: PMBadgeProps(children: "Expired", tone: .warning)))))
              }), label: "Invitations")))
      defer { scene.close() }
      let badge = try XCTUnwrap(scene.element(named: "Expired"))
      XCTAssertEqual(
        attribute(badge, "accessibilityRole"), NSAccessibility.Role.staticText.rawValue,
        "the Badge stays text")
      press(badge)
      XCTAssertEqual(did, [], "the Badge has no action of its own")
      scene.click(at: frame(try XCTUnwrap(scene.element(role: .button, named: "Resend"))))
      XCTAssertEqual(did, ["resent"], "the Button takes its own press, and the row does not")
      let buttons = Scene.elements(in: scene.host).filter {
        attribute($0, "accessibilityRole") == NSAccessibility.Role.button.rawValue
      }
      XCTAssertEqual(buttons.count, 3, "the two rows and Resend, and nothing for a trailing box")
    }

    /// Tree (`tree.md`): opening and selecting are separate acts. A branch's
    /// chevron is its disclosure group's label, which the platform publishes as
    /// the disclosure, named by the item's label, with the branch's state as
    /// its value (AppKit's `0` and `1`); a click on it opens the branch and
    /// selects nothing. The rest of the row is a button of its own: a click on
    /// it selects the item, once, and the selected row has the selected trait;
    /// pressing the selected row again reports nothing. A disabled item takes
    /// no press. Each row that asks for more reports its level's parent, `nil`
    /// for the top level.
    func testATreeRowSelectsAndItsChevronOpensTheBranch() throws {
      var selected: [String] = []
      var opened: [Set<String>] = []
      var asked: [String?] = []
      let scene = Scene(
        PMTree(
          props: PMTreeProps(
            hasMore: true,
            items: [
              PMTreeItem(
                id: "engineering", label: "Engineering",
                children: [PMTreeItem(id: "platform", label: "Platform")], hasMore: true),
              PMTreeItem(id: "design", label: "Design", disabled: true),
            ], label: "Organization units", onChange: { selected.append($0) },
            onExpandedChange: { opened.append($0) }, onLoadMore: { asked.append($0) })))
      defer { scene.close() }
      let named = { (label: String) in
        Scene.elements(in: scene.host).filter {
          attribute($0, "accessibilityRole") == NSAccessibility.Role.button.rawValue
            && attribute($0, "accessibilityLabel") == label
        }
      }
      let chevron = try XCTUnwrap(scene.element(role: .disclosureTriangle, named: "Engineering"))
      XCTAssertEqual(attribute(chevron, "accessibilityValue"), "0", "the branch is closed")
      XCTAssertEqual(named("Engineering").count, 1, "the row is a button of its own")
      scene.click(at: frame(chevron))
      XCTAssertEqual(opened, [["engineering"]], "the chevron opens the branch")
      XCTAssertEqual(selected, [], "and selects nothing")
      XCTAssertEqual(
        attribute(try XCTUnwrap(scene.element(role: .disclosureTriangle, named: "Engineering")),
          "accessibilityValue"), "1", "the branch is open")

      let platform = try XCTUnwrap(scene.element(role: .button, named: "Platform"))
      scene.click(at: frame(platform))
      XCTAssertEqual(selected, ["platform"], "a click on the row selects the item")
      XCTAssertEqual(opened, [["engineering"]], "and opens nothing")
      let chosen = try XCTUnwrap(scene.element(role: .button, named: "Platform"))
      XCTAssertEqual(attribute(chosen, "isAccessibilitySelected"), "1", "the selected row is selected")
      press(chosen)
      XCTAssertEqual(selected, ["platform"], "selecting the selected item again reports nothing")

      press(try XCTUnwrap(named("Design").first))
      XCTAssertEqual(selected, ["platform"], "a disabled item takes no press")

      for more in named("Load more") { press(more) }
      XCTAssertEqual(asked, ["engineering", nil], "each row asks for its own level")
    }

    /// TreeSelect (`tree-select.md`) finds the chosen node and the branches
    /// above it, from the top level down, and opens them as its panel opens; a
    /// node no level holds, and no node, open nothing.
    func testATreeSelectOpensTheBranchesAboveTheChosenNode() {
      let items = [
        PMTreeItem(
          id: "engineering", label: "Engineering",
          children: [
            PMTreeItem(
              id: "platform", label: "Platform",
              children: [PMTreeItem(id: "storage", label: "Storage")])
          ]),
        PMTreeItem(id: "sales", label: "Sales"),
      ]
      XCTAssertEqual(PMTreeSelect.find(items, "storage")?.node.label, "Storage")
      XCTAssertEqual(PMTreeSelect.find(items, "storage")?.above, ["engineering", "platform"])
      XCTAssertEqual(PMTreeSelect.find(items, "sales")?.above, [])
      XCTAssertNil(PMTreeSelect.find(items, "billing"), "a node whose level is not loaded")
      XCTAssertEqual(
        PMTreeSelect.revealed(items, ["design"], "storage"), ["design", "engineering", "platform"])
      XCTAssertEqual(PMTreeSelect.revealed(items, ["design"], "billing"), ["design"])
      XCTAssertEqual(PMTreeSelect.revealed(items, ["design"], nil), ["design"])
      XCTAssertEqual(PMTree.toggled([], "engineering"), ["engineering"])
      XCTAssertEqual(PMTree.toggled(["engineering"], "engineering"), [])
    }

    /// TreeSelect (`tree-select.md`), its panel drawn in place, as the states
    /// fixture draws it: opening shows the chosen node, the branches above it
    /// opened and reported once. A press on the chosen node's row closes the
    /// panel and reports nothing. Opening a branch leaves the panel open; a
    /// press on a node's row chooses it, reports it and closes the panel, and
    /// the field's value is its label. The empty choice reports `nil` and the
    /// field shows its label as a value.
    func testATreeSelectChoosesANodeAndClosesOnTheChosenOneAgain() throws {
      var chosen: [String?] = []
      var opened: [Set<String>] = []
      let scene = Scene(
        PMTreeSelect(
          props: PMTreeSelectProps(
            ariaLabel: "Parent unit", defaultValue: "storage", emptyOption: "Top level",
            items: [
              PMTreeItem(
                id: "engineering", label: "Engineering",
                children: [
                  PMTreeItem(
                    id: "platform", label: "Platform",
                    children: [PMTreeItem(id: "storage", label: "Storage")])
                ]),
              PMTreeItem(
                id: "sales", label: "Sales", children: [PMTreeItem(id: "emea", label: "EMEA")]),
            ], label: "Organization units", onChange: { chosen.append($0) },
            onExpandedChange: { opened.append($0) }),
          inPlace: true),
        size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      let field = { try XCTUnwrap(scene.element(role: .button, named: "Parent unit")) }
      // A row by its item, because the field's value is the chosen node's label too.
      let row = { (id: String) in
        Scene.elements(in: scene.host).first {
          PMMember.parse(attribute($0, "accessibilityIdentifier") ?? "")?.attributes["item"] == id
        }
      }
      XCTAssertEqual(attribute(try field(), "accessibilityValue"), "Storage")
      press(try field())
      XCTAssertEqual(opened, [["engineering", "platform"]], "the branches above the chosen node")
      let storage = try XCTUnwrap(row("storage"))
      XCTAssertEqual(attribute(storage, "isAccessibilitySelected"), "1")
      press(storage)
      XCTAssertNil(row("storage"), "the panel closes")
      XCTAssertEqual(chosen, [], "and the chosen node again reports nothing")

      press(try field())
      XCTAssertEqual(opened, [["engineering", "platform"]], "the branches are open already")
      scene.click(at: frame(try XCTUnwrap(scene.element(role: .disclosureTriangle, named: "Sales"))))
      XCTAssertEqual(opened.last, ["engineering", "platform", "sales"])
      press(try XCTUnwrap(row("emea")))
      XCTAssertEqual(chosen, ["emea"])
      XCTAssertNil(row("emea"), "choosing closes the panel")
      XCTAssertEqual(attribute(try field(), "accessibilityValue"), "EMEA")

      press(try field())
      press(try XCTUnwrap(scene.element(role: .button, named: "Top level")))
      XCTAssertEqual(chosen, ["emea", nil])
      XCTAssertEqual(attribute(try field(), "accessibilityValue"), "Top level")
    }

    /// SectionNav (`section-nav.md`): `current` marks the item whose page it
    /// names, as the web's own cases state it: a trailing slash, a query and a
    /// hash are not part of the page; a `current` written with its origin
    /// matches; an item written with an origin matches only the same origin;
    /// an exact `href` comes first; a hash is compared as written; the first
    /// of two items with one `href` is marked; and nothing is marked without
    /// a match.
    func testSectionNavMarksTheItemWhosePageCurrentNames() {
      let index = { (items: [PMSectionNavItem], current: String?) in
        PMSectionNav.currentIndex(items, current: current)
      }
      let hashes = ["#users", "#groups", "#roles", "#sessions"].map {
        PMSectionNavItem(label: $0, href: $0)
      }
      let pages = [
        PMSectionNavItem(label: "Users", href: "/identity/users"),
        PMSectionNavItem(label: "Groups", href: "/identity/groups/"),
        PMSectionNavItem(label: "Roles", href: "/identity/roles"),
      ]
      XCTAssertEqual(index(hashes, "#roles"), 2)
      XCTAssertEqual(index(pages, "/identity/users/"), 0)
      XCTAssertEqual(index(pages, "/identity/users?page=2#top"), 0)
      XCTAssertEqual(index(pages, "/identity/groups"), 1, "the slash may be on the item instead")
      XCTAssertNil(index(pages, "/identity/users/42"), "a page below an item's own is not matched")
      XCTAssertEqual(index(pages, "https://app.example.com/identity/users?page=2#top"), 0)
      XCTAssertEqual(
        index([PMSectionNavItem(label: "Home", href: "/")] + pages, "HTTPS://App.Example.com"), 0)
      let sites = [
        PMSectionNavItem(label: "Docs", href: "https://docs.example.com/identity/users"),
        PMSectionNavItem(label: "Users", href: "https://app.example.com/identity/users/"),
      ]
      XCTAssertEqual(index(sites, "https://app.example.com/identity/users"), 1)
      XCTAssertNil(index(sites, "/identity/users"), "no origin to compare an item's origin with")
      let ranges = [
        PMSectionNavItem(label: "This week", href: "/reports?range=week"),
        PMSectionNavItem(label: "This month", href: "/reports?range=month"),
      ]
      XCTAssertEqual(index(ranges, "/reports?range=month"), 1)
      XCTAssertEqual(index(ranges, "/reports/"), 0)
      let twice = [
        PMSectionNavItem(label: "Overview", href: "/identity"),
        PMSectionNavItem(label: "Summary", href: "/identity"),
      ]
      XCTAssertEqual(index(twice, "/identity"), 0)
      XCTAssertNil(index(hashes, nil))
      XCTAssertNil(index(hashes, "#elsewhere"))
    }

    /// SectionNav (`link.md` §Routing): a press on an item, the current one
    /// included, calls `onNavigate` with its `href` in place of the
    /// environment's `openURL`; without it the item opens as the environment
    /// says. The current item is selected and the root names its `href`.
    func testSectionNavRoutesEveryItemAndMarksTheCurrentOne() throws {
      var routed: [String] = []
      var opened: [String] = []
      let items = [
        PMSectionNavItem(label: "Users", href: "/identity/users"),
        PMSectionNavItem(label: "Groups", href: "/identity/groups"),
      ]
      let nav = { (onNavigate: (@MainActor (String) -> Void)?) in
        PMSectionNav(
          props: PMSectionNavProps(
            current: "/identity/users/", items: items, label: "Identity sections",
            onNavigate: onNavigate)
        )
        .environment(
          \.openURL,
          OpenURLAction { url in
            opened.append(url.absoluteString)
            return .handled
          })
      }
      let scene = Scene(nav { routed.append($0) })
      defer { scene.close() }
      let users = try XCTUnwrap(scene.element(role: .link, named: "Users"))
      XCTAssertEqual(attribute(users, "isAccessibilitySelected"), "1", "the current item is selected")
      XCTAssertEqual(identity(of: "SectionNav", in: scene)?.attributes, ["current": "/identity/users"])
      press(users)
      press(try XCTUnwrap(scene.element(role: .link, named: "Groups")))
      XCTAssertEqual(routed, ["/identity/users", "/identity/groups"])
      XCTAssertEqual(opened, [])

      let unrouted = Scene(nav(nil))
      defer { unrouted.close() }
      press(try XCTUnwrap(unrouted.element(role: .link, named: "Groups")))
      XCTAssertEqual(opened, ["/identity/groups"])
    }

    // MARK: The frame

    /// Banner (`banner.md`): the dismiss button is named by `dismissLabel`, or
    /// the spec's "Dismiss", and a press calls `onDismiss` once. A Banner
    /// without `onDismiss` draws no dismiss button.
    func testABannersDismissButtonCallsOnDismissOnce() throws {
      var dismissed: [String] = []
      let scene = Scene(
        VStack(spacing: 0) {
          PMBanner(
            props: PMBannerProps(
              children: AnyView(Text(verbatim: "Maintenance on Sunday")),
              onDismiss: { dismissed.append("Sunday") }, tone: .info))
          PMBanner(
            props: PMBannerProps(
              children: AnyView(Text(verbatim: "Maintenance on Monday")), dismissLabel: "Masquer",
              onDismiss: { dismissed.append("Monday") }))
          PMBanner(
            props: PMBannerProps(
              children: AnyView(Text(verbatim: "Payments are unavailable")), tone: .danger))
        })
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .button, named: PMStrings.dismiss)))
      XCTAssertEqual(dismissed, ["Sunday"])
      press(try XCTUnwrap(scene.element(role: .button, named: "Masquer")))
      XCTAssertEqual(dismissed, ["Sunday", "Monday"])
      let buttons = Scene.elements(in: scene.host).filter {
        attribute($0, "accessibilityRole") == NSAccessibility.Role.button.rawValue
      }
      XCTAssertEqual(buttons.count, 2, "the danger Banner, with no onDismiss, has no button")
    }

    /// AppShell's `banner` (`app-shell.md`): the view the app passes is a row
    /// of its own, offered the frame's whole width, above the content in both
    /// containers and above the rail where the rail is a column.
    func testAShellDrawsItsBannerAcrossTheFrameAboveItsNavigation() throws {
      let size = CGSize(width: 900, height: 600)
      for layout in [PMShellLayout.stack, .split] {
        var offered: CGFloat = 0
        let scene = Scene(
          PMAppShell(
            props: PMAppShellProps(
              banner: AnyView(
                Text(verbatim: "Payments are delayed")
                  .frame(maxWidth: .infinity)
                  .background(GeometryReader { proxy in
                    Color.clear.onAppear { offered = proxy.size.width }
                  })),
              children: AnyView(Text(verbatim: "Every ticket")),
              sidebar: AnyView(Text(verbatim: "Inbox")))
          )
          .environment(\.pmShellLayout, layout),
          size: size)
        defer { scene.close() }
        let region = try XCTUnwrap(
          Scene.elements(in: scene.host).first {
            let member = PMMember.parse(attribute($0, "accessibilityIdentifier") ?? "")
            return member?.name == "AppShell" && member?.attributes["part"] == "banner"
          }, "\(layout): the shell draws no banner region")
        let banner = try XCTUnwrap(
          Scene.element(in: region, role: nil, named: "Payments are delayed").map(frame),
          "\(layout): the region holds the view the app passed")
        XCTAssertEqual(offered, size.width, accuracy: 0.5, "\(layout): the banner spans the frame")
        // AppKit's frames are the screen's, whose y grows upwards.
        let page = try XCTUnwrap(scene.element(named: "Every ticket").map(frame))
        XCTAssertGreaterThanOrEqual(
          banner.minY, page.maxY, "\(layout): the content starts under the banner")
        if layout == .split {
          let rail = try XCTUnwrap(scene.element(named: "Inbox").map(frame))
          XCTAssertGreaterThanOrEqual(banner.minY, rail.maxY, "the rail starts under the banner")
        }
      }
    }

    /// A shell without a banner draws no row for one.
    func testAShellWithoutABannerDrawsNoRegionForOne() {
      let scene = Scene(
        PMAppShell(
          props: PMAppShellProps(
            children: AnyView(Text(verbatim: "Every ticket")),
            sidebar: AnyView(Text(verbatim: "Inbox")))
        )
        .environment(\.pmShellLayout, .stack))
      defer { scene.close() }
      XCTAssertFalse(
        Scene.elements(in: scene.host).contains {
          PMMember.parse(attribute($0, "accessibilityIdentifier") ?? "")?.attributes["part"] == "banner"
        })
    }

    // MARK: A row's detail

    /// DataTable's `rowDetail` (`data-table.md`), in the table and in the
    /// list: each row has a disclosure named from the row's own name, its
    /// value says whether the row is open, a press draws the detail under the
    /// row and above the next one and reports the open rows, a second press
    /// takes it away, and neither press opens the row.
    func testARowsDisclosureDrawsItsDetailUnderTheRow() throws {
      for layout in [PMDataTableLayout.table, .list] {
        var reported: [Set<String>] = []
        var opened: [String] = []
        let scene = Scene(
          invoices(
            layout: layout, onExpandedChange: { reported.append($0) },
            onRowClick: { opened.append($0.id) }))
        defer { scene.close() }
        let value = { (name: String) in
          scene.element(role: .button, named: name).flatMap { attribute($0, "accessibilityValue") }
        }
        let first = try XCTUnwrap(
          scene.element(role: .button, named: "Details for Invoice 12"),
          "\(layout): the row has no disclosure")
        XCTAssertEqual(value("Details for Invoice 12"), PMStrings.disclosure(open: false))
        XCTAssertNil(scene.element(named: "Lines of Invoice 12"), "\(layout): a closed row draws no detail")

        press(first)
        scene.settle()
        XCTAssertEqual(reported, [["i12"]], "\(layout): the press reports the open rows")
        XCTAssertEqual(value("Details for Invoice 12"), PMStrings.disclosure(open: true))
        XCTAssertEqual(value("Details for Invoice 13"), PMStrings.disclosure(open: false))
        let detail = try XCTUnwrap(
          scene.element(named: "Lines of Invoice 12").map(frame), "\(layout): the open row draws no detail")
        let row = try XCTUnwrap(scene.element(role: .button, named: "Details for Invoice 12").map(frame))
        let next = try XCTUnwrap(scene.element(role: .button, named: "Details for Invoice 13").map(frame))
        // AppKit's frames are the screen's, whose y grows upwards.
        XCTAssertLessThanOrEqual(detail.maxY, row.minY, "\(layout): the detail is under its row")
        XCTAssertGreaterThanOrEqual(detail.minY, next.maxY, "\(layout): and above the next row")

        press(try XCTUnwrap(scene.element(role: .button, named: "Details for Invoice 12")))
        scene.settle()
        XCTAssertEqual(reported, [["i12"], []], "\(layout): a second press closes the row")
        XCTAssertNil(scene.element(named: "Lines of Invoice 12"), "\(layout): the detail leaves")
        XCTAssertEqual(opened, [], "\(layout): a press on the disclosure does not open the row")
      }
    }

    /// The disclosure's name is the app's `detailsLabel` of what `getRowName`
    /// returns. Without `detailsLabel` it is the spec's default, and without
    /// `getRowName` the default for a row with no name.
    func testADisclosureIsNamedByTheAppsLabelOrTheDefault() {
      let unnamed = Scene(invoices(layout: .table, named: false))
      defer { unnamed.close() }
      XCTAssertNotNil(unnamed.element(role: .button, named: PMStrings.details))
      XCTAssertNil(unnamed.element(role: .button, named: "Details for Invoice 12"))

      let words = PMStrings.dataTable
      let localized = Scene(
        invoices(
          layout: .table,
          messages: PMDataTableMessages(
            selected: words.selected, selectAll: words.selectAll, selectRow: words.selectRow,
            detailsLabel: { name in "Lines: \(name ?? "none")" })))
      defer { localized.close() }
      XCTAssertNotNil(localized.element(role: .button, named: "Lines: Invoice 12"))
      XCTAssertNil(localized.element(role: .button, named: "Details for Invoice 12"))
    }

    /// A row `isRowExpandable` refuses has no disclosure and draws no detail,
    /// though the open set holds it, and a table without `rowDetail` has no
    /// disclosure at all.
    func testARowThatTakesNoDetailHasNoDisclosure() {
      for layout in [PMDataTableLayout.table, .list] {
        let scene = Scene(
          invoices(
            layout: layout, defaultExpanded: ["i12", "i13"], isRowExpandable: { $0.id != "i13" }))
        defer { scene.close() }
        XCTAssertNotNil(scene.element(role: .button, named: "Details for Invoice 12"))
        XCTAssertNotNil(scene.element(named: "Lines of Invoice 12"), "\(layout): the row opens at first")
        XCTAssertNil(
          scene.element(role: .button, named: "Details for Invoice 13"),
          "\(layout): a refused row has a disclosure")
        XCTAssertNil(scene.element(named: "Lines of Invoice 13"), "\(layout): a refused row draws a detail")

        let plain = Scene(invoices(layout: layout, detail: false))
        defer { plain.close() }
        XCTAssertNil(plain.element(role: .button, named: "Details for Invoice 12"))
      }
    }

    /// With `expanded` the app holds the open rows: a press reports the next
    /// set and the table stays as the app has it.
    func testAControlledTableReportsAPressAndDrawsWhatTheAppHolds() throws {
      var reported: [Set<String>] = []
      let closed = Scene(
        invoices(layout: .table, expanded: [], onExpandedChange: { reported.append($0) }))
      defer { closed.close() }
      press(try XCTUnwrap(closed.element(role: .button, named: "Details for Invoice 12")))
      closed.settle()
      XCTAssertEqual(reported, [["i12"]])
      XCTAssertNil(closed.element(named: "Lines of Invoice 12"), "the row opened by itself")

      reported = []
      let open = Scene(
        invoices(layout: .table, expanded: ["i12"], onExpandedChange: { reported.append($0) }))
      defer { open.close() }
      press(try XCTUnwrap(open.element(role: .button, named: "Details for Invoice 12")))
      open.settle()
      XCTAssertEqual(reported, [[]])
      XCTAssertNotNil(open.element(named: "Lines of Invoice 12"), "the row closed by itself")
    }

    /// `close`, which a detail is handed with its row, closes the row and
    /// reports the next set, in a table that holds the open rows and in one
    /// whose app does. Called again for the row once it is closed, it does
    /// nothing.
    func testADetailsCloseCollapsesItsRow() throws {
      var reported: [Set<String>] = []
      var closes: [String: @MainActor () -> Void] = [:]
      let scene = Scene(
        invoices(
          layout: .list, defaultExpanded: ["i12", "i13"],
          onExpandedChange: { reported.append($0) }, onDetail: { closes[$0.row.id] = $0.close }))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .button, named: "Close Invoice 12")))
      scene.settle()
      XCTAssertEqual(reported, [["i13"]], "close reports the rows still open")
      XCTAssertNil(scene.element(named: "Lines of Invoice 12"), "the detail leaves")
      XCTAssertNotNil(scene.element(named: "Lines of Invoice 13"), "the other row stays open")
      closes["i12"]?()
      scene.settle()
      XCTAssertEqual(reported, [["i13"]], "close does nothing for a row that is not open")

      reported = []
      let held = Scene(
        invoices(layout: .list, expanded: ["i12"], onExpandedChange: { reported.append($0) }))
      defer { held.close() }
      press(try XCTUnwrap(held.element(role: .button, named: "Close Invoice 12")))
      held.settle()
      XCTAssertEqual(reported, [[]], "close reports to the app that holds the set")
      XCTAssertNotNil(held.element(named: "Lines of Invoice 12"), "and the app decides")
    }

    /// A DataTable of two invoices. A row's detail is a line that names the
    /// row and a button that calls `close`; `onDetail` is handed what each
    /// detail is drawn with. `labelled` gives each row's Checkbox its whole
    /// name, "Select Invoice 12", and `selection` turns selection on.
    private func invoices(
      layout: PMDataTableLayout, expanded: Set<String>? = nil,
      defaultExpanded: Set<String>? = nil,
      isRowExpandable: (@MainActor (Invoice) -> Bool)? = nil,
      messages: PMDataTableMessages? = nil,
      onExpandedChange: (@MainActor (Set<String>) -> Void)? = nil,
      onRowClick: (@MainActor (Invoice) -> Void)? = nil, detail: Bool = true, named: Bool = true,
      labelled: Bool = false, selection: Set<String>? = nil,
      onDetail: (@MainActor (PMDataTableRowDetail<Invoice>) -> Void)? = nil
    ) -> some View {
      var getRowLabel: (@MainActor (Invoice) -> String)?
      if labelled { getRowLabel = { "Select \($0.name)" } }
      var rowDetail: (@MainActor (PMDataTableRowDetail<Invoice>) -> PMContent)?
      if detail {
        rowDetail = { detail in
          onDetail?(detail)
          return AnyView(
            VStack {
              Text(verbatim: "Lines of \(detail.row.name)")
              PMButton(
                props: PMButtonProps(label: "Close \(detail.row.name)", onClick: detail.close))
            })
        }
      }
      var getRowName: (@MainActor (Invoice) -> String)?
      if named { getRowName = { $0.name } }
      return PMDataTable(
        props: PMDataTableProps(
          columns: [PMDataTableColumn(key: "name", header: "Invoice", value: { $0.name })],
          data: [Invoice(id: "i12", name: "Invoice 12"), Invoice(id: "i13", name: "Invoice 13")],
          defaultExpanded: defaultExpanded, emptyState: PMEmptyStateProps(title: "No invoices"),
          expanded: expanded, getRowId: { $0.id }, getRowLabel: getRowLabel,
          getRowName: getRowName, isRowExpandable: isRowExpandable, label: "Invoices",
          messages: messages, onExpandedChange: onExpandedChange, onRowClick: onRowClick,
          onSelectionChange: { _ in }, rowDetail: rowDetail, selection: selection)
      )
      .environment(\.pmDataTableLayout, layout)
    }

    // MARK: A row's name

    /// DataTable, in the table and in the list: a row is named by
    /// `getRowName`, its own name, and not by `getRowLabel`, which is the whole
    /// name of its Checkbox. A row that is one element is a button of that
    /// name, a press opens it, and its select action has the Checkbox's name.
    /// A row whose elements stay apart is a group of that name, around a
    /// Checkbox with its own.
    func testARowIsNamedByGetRowNameAndItsCheckboxByGetRowLabel() throws {
      for layout in [PMDataTableLayout.table, .list] {
        var opened: [String] = []
        let whole = Scene(
          invoices(
            layout: layout, onRowClick: { opened.append($0.id) }, detail: false, labelled: true,
            selection: []))
        defer { whole.close() }
        let row = try XCTUnwrap(
          whole.element(role: .button, named: "Invoice 12"),
          "\(layout): the row is not named by getRowName")
        XCTAssertNil(
          whole.element(named: "Select Invoice 12"), "\(layout): the row has its Checkbox's name")
        XCTAssertEqual(
          actions(of: row), ["Select Invoice 12"], "\(layout): the select action's name")
        press(row)
        XCTAssertEqual(opened, ["i12"], "\(layout): a press on the row opens it")

        let apart = Scene(invoices(layout: layout, labelled: true, selection: []))
        defer { apart.close() }
        XCTAssertNotNil(
          apart.element(role: .group, named: "Invoice 12"),
          "\(layout): the row's group is not named by getRowName")
        XCTAssertNil(
          apart.element(role: .group, named: "Select Invoice 12"),
          "\(layout): the row's group has its Checkbox's name")
        XCTAssertNotNil(
          apart.element(role: .checkBox, named: "Select Invoice 12"),
          "\(layout): the Checkbox is not named by getRowLabel")
      }
    }

    /// DataTable without `getRowName`: a row keeps the name it had before the
    /// prop existed. It is `getRowLabel` when the app gives one, and each
    /// column's header and value when it does not.
    func testARowWithoutGetRowNameIsNamedByGetRowLabelOrItsCells() {
      for layout in [PMDataTableLayout.table, .list] {
        let labelled = Scene(
          invoices(
            layout: layout, onRowClick: { _ in }, detail: false, named: false, labelled: true,
            selection: []))
        defer { labelled.close() }
        let row = labelled.element(role: .button, named: "Select Invoice 12")
        XCTAssertNotNil(row, "\(layout): the row lost the name getRowLabel gives it")
        XCTAssertEqual(
          row.map { actions(of: $0) }, ["Select Invoice 12"], "\(layout): the select action's name")

        let bare = Scene(
          invoices(layout: layout, onRowClick: { _ in }, detail: false, named: false, selection: []))
        defer { bare.close() }
        let cells = bare.element(role: .button, named: "Invoice: Invoice 12")
        XCTAssertNotNil(cells, "\(layout): the row lost the name its cells give it")
        XCTAssertEqual(
          cells.map { actions(of: $0) }, [PMStrings.dataTable.selectRow],
          "\(layout): the select action's name")
      }
    }

    // MARK: Meter

    func testAMeterIsAGaugeNamedByItsLabelThatSaysTheAppsWordsOrTheClampedValue() throws {
      let worded = Scene(
        PMMeter(
          props: PMMeterProps(
            danger: 45, label: "Storage used", max: 50, value: 42, valueText: "42 GB of 50 GB",
            warning: 40)))
      defer { worded.close() }
      let gauge = try XCTUnwrap(worded.element(named: "Storage used"))
      // AppKit publishes a level indicator's value as its fraction and the
      // words a reader hears as its value description.
      XCTAssertEqual(attribute(gauge, "accessibilityValue"), "0.84")
      XCTAssertEqual(attribute(gauge, "accessibilityValueDescription"), "42 GB of 50 GB")
      XCTAssertNotNil(
        worded.element(named: "High"), "the warning glyph is an image named by its message")
      XCTAssertNil(
        Scene.elements(in: worded.host).first {
          attribute($0, "accessibilityRole") == NSAccessibility.Role.staticText.rawValue
        }, "the value text under the bar is hidden, because the gauge says it")

      let bare = Scene(PMMeter(props: PMMeterProps(label: "Allowance used", value: 130)))
      defer { bare.close() }
      let clamped = try XCTUnwrap(bare.element(named: "Allowance used"))
      XCTAssertEqual(attribute(clamped, "accessibilityValue"), "1")
      XCTAssertEqual(attribute(clamped, "accessibilityValueDescription"), 100.0.formatted())
    }

    // MARK: Rating

    func testAPressChoosesAMarkAndAPressOnTheChosenMarkClearsTheRating() throws {
      var reported: [Double?] = []
      let scene = Scene(
        PMRating(props: PMRatingProps(label: "Rate this answer", onChange: { reported.append($0) })))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(named: "3 stars")))
      XCTAssertEqual(reported, [3])
      press(try XCTUnwrap(scene.element(named: "3 stars")))
      XCTAssertEqual(reported, [3, nil], "a press on the chosen mark clears the rating")
      press(try XCTUnwrap(scene.element(named: "5 stars")))
      XCTAssertEqual(reported, [3, nil, 5])
      XCTAssertEqual(identity(of: "Rating", in: scene)?.attributes["checked"], "5")
    }

    func testARequiredRatingKeepsItsMarkAndTheIncrementChoosesTheNextMark() throws {
      var reported: [Double?] = []
      let scene = Scene(
        PMRating(
          props: PMRatingProps(
            ariaRequired: true, defaultValue: 2, label: "Rate this answer", max: 3,
            onChange: { reported.append($0) })))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(named: "2 stars")))
      XCTAssertEqual(reported, [], "a required rating keeps its mark")
      let second = try XCTUnwrap(scene.element(named: "2 stars"))
      _ = second.perform(NSSelectorFromString("accessibilityPerformIncrement"))
      scene.settle()
      XCTAssertEqual(reported, [3])
      let third = try XCTUnwrap(scene.element(named: "3 stars"))
      _ = third.perform(NSSelectorFromString("accessibilityPerformIncrement"))
      scene.settle()
      XCTAssertEqual(reported, [3], "the increment stops at the last mark")
    }

    // MARK: Countdown

    func testACountdownReportsItsEndOnceAndAPastMomentOnceAfterItAppears() throws {
      let iso = ISO8601DateFormatter()
      iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      var ended = 0
      let past = Scene(
        PMCountdown(
          props: PMCountdownProps(
            label: "Time until the code expires", locale: "en-US", onEnd: { ended += 1 },
            until: iso.string(from: Date().addingTimeInterval(-5)))))
      defer { past.close() }
      XCTAssertEqual(ended, 1, "a moment already past is reported once after the countdown appears")
      past.settle()
      XCTAssertEqual(ended, 1)

      var reached = 0
      let soon = Scene(
        PMCountdown(
          props: PMCountdownProps(
            label: "Time until the code expires", locale: "en-US", onEnd: { reached += 1 },
            until: iso.string(from: Date().addingTimeInterval(1.2)))))
      defer { soon.close() }
      XCTAssertEqual(reached, 0)
      XCTAssertEqual(identity(of: "Countdown", in: soon)?.attributes["ended"], nil)
      RunLoop.main.run(until: Date().addingTimeInterval(1.8))
      soon.settle()
      XCTAssertEqual(reached, 1, "the end is reported once, when the moment is reached")
      XCTAssertEqual(identity(of: "Countdown", in: soon)?.attributes["ended"], "true")
      let timer = try XCTUnwrap(soon.element(named: "Time until the code expires"))
      XCTAssertEqual(attribute(timer, "accessibilityValue"), "0 seconds")
    }

    // MARK: InlineEdit

    func testTheEditControlOpensTheFieldAndSaveReportsTheChangedTextOnce() throws {
      var committed: [String] = []
      var editing: [Bool] = []
      let scene = Scene(
        PMInlineEdit(
          props: PMInlineEditProps(
            label: "Project name", onCommit: { committed.append($0) },
            onEditingChange: { editing.append($0) }, value: "Acme billing")))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(named: "Edit Project name")))
      XCTAssertEqual(editing, [true])
      XCTAssertEqual(identity(of: "InlineEdit", in: scene)?.attributes["editing"], "true")
      let field = try XCTUnwrap(scene.textField())
      XCTAssertEqual(field.stringValue, "Acme billing", "the field holds the value")
      scene.type(" two", into: field)
      // AppKit's field editor selects the text a field opens with, and UIKit
      // puts the caret after it, so what the field holds is read back.
      let typed = field.stringValue
      XCTAssertTrue(typed.hasSuffix(" two"), typed)
      press(try XCTUnwrap(scene.element(named: "Save")))
      XCTAssertEqual(committed, [typed], "the text is reported once, as typed")
      XCTAssertEqual(
        identity(of: "InlineEdit", in: scene)?.attributes["editing"], nil,
        "an uncontrolled field closes once it saves")
    }

    func testAnUnchangedSaveAndACancelCloseTheFieldAndReportNoText() throws {
      var committed: [String] = []
      var editing: [Bool] = []
      let scene = Scene(
        PMInlineEdit(
          props: PMInlineEditProps(
            defaultEditing: true, label: "Project name", onCommit: { committed.append($0) },
            onEditingChange: { editing.append($0) }, value: "Acme billing")))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(named: "Save")))
      XCTAssertEqual(committed, [], "an unchanged text is not reported")
      XCTAssertEqual(editing, [false])
      press(try XCTUnwrap(scene.element(named: "Edit Project name")))
      scene.type("!", into: try XCTUnwrap(scene.textField()))
      press(try XCTUnwrap(scene.element(named: "Cancel")))
      XCTAssertEqual(committed, [], "a cancel reports nothing")
      XCTAssertEqual(editing, [false, true, false])
    }

    func testARequiredBlankTextCannotBeSaved() throws {
      let scene = Scene(
        PMInlineEdit(
          props: PMInlineEditProps(
            defaultEditing: true, label: "Project name", onCommit: { _ in }, required: true,
            value: "")))
      defer { scene.close() }
      let save = try XCTUnwrap(scene.element(named: "Save"))
      XCTAssertEqual(save.value(forKey: "accessibilityEnabled") as? Bool, false)
    }

    /// The names of an element's custom accessibility actions.
    private func actions(of element: NSObject) -> [String] {
      guard element.responds(to: NSSelectorFromString("accessibilityCustomActions")) else { return [] }
      let found = element.value(forKey: "accessibilityCustomActions") as? [NSAccessibilityCustomAction]
      return (found ?? []).map(\.name)
    }

    // MARK: The scene

    /// A view hosted in a key window under the default pairing.
    @MainActor
    struct Scene {
      let window: NSWindow
      let host: NSView

      init(_ view: some View, size: CGSize = CGSize(width: 360, height: 480)) {
        let host = NSHostingView(rootView: view.pmTheme(PMTheme.default))
        host.frame = CGRect(origin: .zero, size: size)
        let window = NSWindow(
          contentRect: host.frame, styleMask: [.titled], backing: .buffered, defer: false)
        // Closed at the end and released by Swift, not by AppKit on closing.
        window.isReleasedWhenClosed = false
        window.contentView = host
        window.makeKeyAndOrderFront(nil)
        host.layoutSubtreeIfNeeded()
        self.window = window
        self.host = host
        settle()
      }

      func close() { window.close() }

      /// A few turns of the run loop, in which SwiftUI lays out, publishes its
      /// accessibility nodes, runs its tasks and moves focus.
      func settle() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
      }

      func element(role: NSAccessibility.Role? = nil, named name: String) -> NSObject? {
        Self.element(in: host, role: role, named: name)
      }

      /// Every element under `root`, at any depth, in order.
      static func elements(in root: NSObject) -> [NSObject] {
        children(of: root).compactMap { $0 as? NSObject }.flatMap { [$0] + elements(in: $0) }
      }

      /// The first element under `root`, at any depth, with `role` (any, when
      /// `nil`) whose label or title is `name`, or whose value is, as AppKit
      /// publishes a static text.
      static func element(in root: NSObject, role: NSAccessibility.Role?, named name: String)
        -> NSObject?
      {
        for case let child as NSObject in children(of: root) {
          let labels = [
            attribute(child, "accessibilityLabel"), attribute(child, "accessibilityTitle"),
            attribute(child, "accessibilityValue"),
          ]
          if role.map({ attribute(child, "accessibilityRole") == $0.rawValue }) ?? true,
            labels.contains(name)
          {
            return child
          }
          if let found = element(in: child, role: role, named: name) { return found }
        }
        return nil
      }

      /// The first text field in `root`'s views, or in the host's.
      func textField(in root: NSView? = nil) -> NSTextField? {
        func search(_ view: NSView) -> NSTextField? {
          if let field = view as? NSTextField, field.isEditable { return field }
          return view.subviews.lazy.compactMap(search).first
        }
        return search(root ?? host)
      }

      /// Focuses `field` and inserts `text` through its field editor, as typing
      /// does, in whichever window holds the field.
      func type(_ text: String, into field: NSTextField) {
        guard let window = field.window else { return }
        if (window.firstResponder as? NSTextView)?.delegate as? NSTextField !== field {
          window.makeFirstResponder(field)
          settle()
        }
        (window.firstResponder as? NSTextView)?.insertText(
          text, replacementRange: NSRange(location: NSNotFound, length: 0))
        settle()
      }

      /// A mouse click at the centre of `rect`, in screen coordinates.
      func click(at rect: CGRect) {
        let point = window.convertPoint(fromScreen: CGPoint(x: rect.midX, y: rect.midY))
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
          let event = NSEvent.mouseEvent(
            with: type, location: point, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1,
            pressure: type == .leftMouseDown ? 1 : 0)
          if let event { window.sendEvent(event) }
        }
        settle()
      }

      func press(key: KeyEquivalent) {
        let codes: [KeyEquivalent: (UInt16, Int)] = [
          .leftArrow: (123, NSLeftArrowFunctionKey), .rightArrow: (124, NSRightArrowFunctionKey),
          .downArrow: (125, NSDownArrowFunctionKey), .upArrow: (126, NSUpArrowFunctionKey),
          .home: (115, NSHomeFunctionKey), .end: (119, NSEndFunctionKey),
        ]
        guard let (code, scalar) = codes[key], let unicode = Unicode.Scalar(scalar) else { return }
        press(keyCode: code, characters: String(Character(unicode)))
      }

      private func press(keyCode: UInt16, characters: String) {
        for type in [NSEvent.EventType.keyDown, .keyUp] {
          let event = NSEvent.keyEvent(
            with: type, location: .zero, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime,
            windowNumber: window.windowNumber, context: nil, characters: characters,
            charactersIgnoringModifiers: characters, isARepeat: false, keyCode: keyCode)
          if let event { window.sendEvent(event) }
        }
        settle()
      }
    }

    /// The identity of the first element whose identifier names `member`.
    private func identity(of member: String, in scene: Scene) -> (
      name: String, attributes: [String: String]
    )? {
      for element in Scene.elements(in: scene.host) {
        if let parsed = PMMember.parse(attribute(element, "accessibilityIdentifier") ?? ""),
          parsed.name == member
        {
          return parsed
        }
      }
      return nil
    }

    private func press(_ element: NSObject) {
      _ = element.perform(NSSelectorFromString("accessibilityPerformPress"))
      RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    private func frame(_ element: NSObject) -> CGRect {
      (element.value(forKey: "accessibilityFrame") as? NSValue)?.rectValue ?? .zero
    }
  }

  /// A row of the row-detail tests' table.
  private struct Invoice {
    let id: String
    let name: String
  }

  /// A feed whose next window, once asked for, is its last.
  @MainActor
  private final class Feed: ObservableObject {
    @Published var hasNext = true
  }

  /// The feed's append form, as a forward feed's query library drives it:
  /// `hasPrevious` is false throughout.
  private struct FeedPager: View {
    @ObservedObject var feed: Feed

    var body: some View {
      PMCursorPagination(
        props: PMCursorPaginationProps(
          hasNext: feed.hasNext, hasPrevious: false, mode: .append,
          onNext: { feed.hasNext = false }))
    }
  }

  /// A toast's owner: each generation gives the toast a new `onDismiss`, and
  /// `reported` records the generation of each one called.
  @MainActor
  private final class ToastOwner: ObservableObject {
    @Published var generation = 0
    @Published var shown = true
    var reported: [Int] = []
  }

  /// The owner's toast, with a time shorter than the tests wait.
  private struct OwnedToast: View {
    @ObservedObject var owner: ToastOwner

    var body: some View {
      let generation = owner.generation
      if owner.shown {
        PMToast(
          props: PMToastProps(
            durationMs: 600, onDismiss: { owner.reported.append(generation) },
            title: "Ticket archived"))
      }
    }
  }

  /// An element's children, read by the accessor's name.
  @MainActor
  private func children(of element: NSObject) -> [Any] {
    guard element.responds(to: NSSelectorFromString("accessibilityChildren")) else { return [] }
    return element.value(forKey: "accessibilityChildren") as? [Any] ?? []
  }

  /// An attribute by its accessor's name. SwiftUI's nodes implement the
  /// accessors without declaring the protocols, so they are read by name.
  @MainActor
  private func attribute(_ element: NSObject, _ name: String) -> String? {
    guard element.responds(to: NSSelectorFromString(name)) else { return nil }
    return element.value(forKey: name).map { "\($0)" }
  }
#endif
