#if os(iOS)
  import PolymorphUI
  import SwiftUI
  import UIKit
  import XCTest

  /// The accessibility audit, run on an iOS simulator by `scripts/ios-audit.mjs`.
  ///
  /// A Swift package cannot host a UI test, so Apple's `performAccessibilityAudit`
  /// (an `XCUIApplication` method) is out of reach; this is the same pass over
  /// the tree UIKit publishes, made from inside the test. Every states fixture
  /// entry is hosted in a window at the default text size and at the largest
  /// accessibility size. The entry is laid out on the canvas, 360 points wide
  /// and as tall as a hosting controller lays it out at that text size, with
  /// its scroll views at rest, centred in a window as wide as the
  /// simulator's screen, as a page's margins place a member, and at least a
  /// phone's height (`Harness.tallest`), so an open panel has the room a screen
  /// gives it. The hosting controller keeps no safe area, and animations are
  /// off, so what moves on its own holds still.
  ///
  /// The entry must expose at least one element; the first node that carries a
  /// member's identifier (the entry's root, an element or the group SwiftUI makes
  /// of a container) must be the fixture's member; every element must have a
  /// label (sufficient description); every element a person can act on must
  /// offer a 44-point hit region, measured in the screen's pixels; and no element
  /// may lie outside the window unless a scroll view holds it (clipped content).
  /// An entry whose `expect` sets `hidden` to `true` is a decorative state and
  /// must expose nothing.
  ///
  /// A scroll view's elements are published by UIKit's accessibility runtime,
  /// which runs in an app and not in a package's test process, so the audit
  /// reads each entry with its scroll views drawn at rest (`Harness.scene`'s
  /// `scrolls` off), where every element is published. It hosts the entry a
  /// second time with its scroll views drawn, as a device lays it out: an
  /// element published at rest and not there is one a scroll view holds, which
  /// a person reaches by scrolling, and the window rule leaves it out; an
  /// element published both ways is held to the window where the second
  /// hosting puts it.
  ///
  /// A text field or a text view is a UIKit view SwiftUI hosts, and UIKit
  /// publishes its label, traits and frame through the same runtime. The audit
  /// reads such a view's frame from the view and holds it to the hit region and
  /// the window. Its label is not published here, so `IdentityTests` holds
  /// every hosted control (a text field, a date picker, a menu picker, a
  /// colour well) to a name on macOS, where AppKit publishes it in the test's
  /// process, and the members name their text fields the same way on both
  /// platforms (`pmEntryName`).
  @MainActor
  final class AccessibilityAuditTests: XCTestCase {
    /// The text sizes every entry is audited at.
    private let sizes: [UIContentSizeCategory] = [.large, .accessibilityExtraExtraExtraLarge]

    /// The hit region Apple's guidelines ask of anything a person can act on.
    private let hitRegion: CGFloat = 44

    override func setUp() async throws {
      // SwiftUI publishes its elements once accessibility automation is on, as
      // XCUITest turns it on. The switch lives in the simulator's accessibility
      // library; without it the audit finds no elements and says so.
      guard let library = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW),
        let setter = dlsym(library, "_AXSSetAutomationEnabled")
      else { return }
      typealias Setter = @convention(c) (Int32) -> Void
      unsafeBitCast(setter, to: Setter.self)(1)
    }

    func testEveryEntryPassesTheAuditAtEveryTextSize() {
      for fixture in fixtures() {
        for entry in fixture.entries {
          for size in sizes {
            // Each entry is audited in its own autorelease pool, and its windows
            // give up their controllers (`retire`), so an entry's views are freed
            // before the next is hosted. Held until the test returns, the view
            // graphs of every entry exhaust the room SwiftUI's attribute graph
            // has in one process.
            autoreleasepool { audit(entry, of: fixture.member, at: size) }
          }
        }
      }
    }

    /// Every fixture, or only the members `PM_MEMBERS` names, comma-separated,
    /// for work on one member (`scripts/ios-audit.mjs` passes it through). A
    /// name no fixture carries stops the run, so a misspelt member never passes
    /// with nothing audited.
    private func fixtures() -> [any PMStates] {
      let only = (ProcessInfo.processInfo.environment["PM_MEMBERS"] ?? "")
        .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      if only.isEmpty { return PMFixtures.all }
      let unknown = Set(only).subtracting(PMFixtures.all.map(\.member))
      guard unknown.isEmpty else {
        XCTFail("PM_MEMBERS names no fixture: \(unknown.sorted().joined(separator: ", "))")
        return []
      }
      return PMFixtures.all.filter { only.contains($0.member) }
    }

    private func audit(_ entry: PMStateEntry, of member: String, at size: UIContentSizeCategory) {
      let label = "\(member) — \(entry.name) (\(size.rawValue))"
      let (window, nodes) = host(entry, size, scrolls: false)
      defer { retire(window) }
      let elements = nodes.filter(\.isElement)
      if entry.expect["hidden"] == "true" {
        XCTAssertTrue(elements.isEmpty, "\(label): a hidden entry exposes an element")
        return
      }
      XCTAssertFalse(elements.isEmpty, "\(label): nothing is exposed to accessibility")

      let identifier = nodes.lazy.compactMap(\.identifier).first { PMMember.parse($0) != nil }
      XCTAssertEqual(
        identifier.flatMap(PMMember.parse)?.name, member,
        "\(label): the root's identifier is \"\(identifier ?? "")\"")

      // What the entry publishes with its scroll views drawn: every element no
      // scroll view holds, by what it is, where that hosting puts it.
      let (scrolling, drawn) = host(entry, size, scrolls: true)
      retire(scrolling)
      var unscrolled = Dictionary(grouping: drawn.filter(\.isElement), by: \.key).mapValues {
        $0.map(\.frame)
      }

      let scale = window.screen.scale
      for element in elements {
        let name = element.label ?? ""
        // A hosted control's label is held by `IdentityTests` (above).
        if !element.isHostedView {
          XCTAssertFalse(name.isEmpty, "\(label): an element has no label")
        }
        let shown = name.isEmpty ? element.kind : name
        let frame = element.frame
        if element.actionable {
          XCTAssertGreaterThanOrEqual(
            (frame.width * scale).rounded(), hitRegion * scale, "\(label): \(shown) is too narrow to hit")
          XCTAssertGreaterThanOrEqual(
            (frame.height * scale).rounded(), hitRegion * scale, "\(label): \(shown) is too short to hit")
        }
        // An element no scroll view holds is published both ways: each takes
        // the next frame of its kind from the second hosting, and an element
        // left without one is one a scroll view holds. The windows sit at the
        // screen's origin, so screen and window coordinates agree; a point of
        // slack absorbs rounding.
        guard var frames = unscrolled[element.key], !frames.isEmpty else { continue }
        let placed = frames.removeFirst()
        unscrolled[element.key] = frames
        XCTAssertTrue(
          scrolling.bounds.insetBy(dx: -1, dy: -1).contains(placed),
          "\(label): \(shown) lies outside the window, at \(described(placed)) in \(described(scrolling.bounds))")
      }
    }

    /// Takes a window off the screen and releases the entry it hosted. Its
    /// frame and its screen stay readable.
    private func retire(_ window: UIWindow) {
      window.isHidden = true
      window.rootViewController = nil
    }

    /// One node of the tree: an element or a container SwiftUI publishes, or a
    /// UIKit view it hosts.
    private struct Node {
      let isElement: Bool
      let isHostedView: Bool
      let identifier: String?
      let label: String?
      let frame: CGRect
      let actionable: Bool
      let kind: String

      /// What the element is, wherever it is drawn: the same element in both
      /// hostings has the same key.
      var key: String { "\(kind)|\(identifier ?? "")|\(label ?? "")|\(actionable)" }
    }

    /// The entry in a key window at a text size, with its scroll views drawn
    /// or at rest, and the tree it exposes, depth first.
    private func host(
      _ entry: PMStateEntry, _ size: UIContentSizeCategory, scrolls: Bool
    ) -> (UIWindow, [Node]) {
      let pass = Harness.passes[0]
      let text = DynamicTypeSize(size) ?? .large
      let window = UIWindow(frame: .zero)
      window.frame = CGRect(
        x: 0, y: 0, width: max(Harness.canvas.width, window.screen.bounds.width),
        height: Harness.tallest)
      window.makeKeyAndVisible()
      let canvas = self.canvas(for: entry, pass, text, in: window)
      // Animations are off, so a repeating one (a skeleton's shimmer) holds
      // still and every run reads the same frames.
      let controller = UIHostingController(
        rootView: Harness.scene(entry, pass, size: canvas, scrolls: scrolls)
          .dynamicTypeSize(text)
          .transaction { $0.disablesAnimations = true })
      controller.safeAreaRegions = []
      window.frame.size.height = max(canvas.height, Harness.tallest)
      window.rootViewController = controller
      controller.view.setNeedsLayout()
      controller.view.layoutIfNeeded()
      RunLoop.main.run(until: Date().addingTimeInterval(0.05))
      var nodes: [Node] = []
      for child in children(of: controller.view) { collect(child, into: &nodes) }
      return (window, nodes)
    }

    /// The canvas an entry is laid out on: the harness's width, and the height
    /// a hosting controller gives the entry at that width and text size with
    /// its scroll views at rest, from the harness's least height up. The
    /// controller measures as the root of `window`, the window the entry is
    /// then hosted in: at the screen's scale, as the window lays it out, and
    /// under the window's size classes, so a member whose form follows the
    /// width class is measured in the form it is hosted in. Outside a window a
    /// controller has no size class.
    private func canvas(
      for entry: PMStateEntry, _ pass: Harness.Pass, _ text: DynamicTypeSize,
      in window: UIWindow
    ) -> CGSize {
      let width = Harness.canvas.width
      let measure = UIHostingController(
        rootView: Harness.dressed(
          entry.render().frame(width: width).fixedSize(horizontal: false, vertical: true), pass
        )
        .dynamicTypeSize(text))
      window.rootViewController = measure
      measure.view.layoutIfNeeded()
      let height = measure.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
      return CGSize(width: width, height: max(Harness.canvas.height, height.rounded(.up)))
    }

    /// The nodes under `object`, depth first. A UIKit control or text view
    /// SwiftUI hosts is one node, read from the view; its subviews are its own
    /// drawing. A scroll view's content is UIKit's to publish, so none of it is
    /// read, the hosted views in it included. Any other view holds nodes of its
    /// own, if UIKit publishes any.
    private func collect(_ object: NSObject, into nodes: inout [Node]) {
      if let view = object as? UIView {
        if view.isHidden || view.alpha == 0 || view.window == nil { return }
        guard view is UIControl || view is UITextView else {
          if view is UIScrollView { return }
          for child in children(of: view) { collect(child, into: &nodes) }
          return
        }
        nodes.append(
          Node(
            isElement: true, isHostedView: true, identifier: view.accessibilityIdentifier,
            label: view.accessibilityLabel, frame: view.convert(view.bounds, to: nil),
            actionable: view is UIControl || (view as? UITextView)?.isEditable == true,
            kind: String(describing: type(of: view))))
        return
      }
      let traits = object.accessibilityTraits
      let actionable: UIAccessibilityTraits = [.button, .link, .adjustable]
      nodes.append(
        Node(
          isElement: object.isAccessibilityElement, isHostedView: false,
          identifier: text(object, "accessibilityIdentifier"), label: text(object, "accessibilityLabel"),
          frame: object.accessibilityFrame, actionable: !traits.intersection(actionable).isEmpty,
          kind: String(describing: type(of: object))))
      if object.isAccessibilityElement { return }
      for child in children(of: object) { collect(child, into: &nodes) }
    }

    /// The nodes a container declares or counts, else a view's subviews.
    private func children(of container: NSObject) -> [NSObject] {
      if let declared = container.accessibilityElements { return declared.compactMap { $0 as? NSObject } }
      let count = container.accessibilityElementCount()
      if count != NSNotFound, count > 0 {
        return (0..<count).compactMap { container.accessibilityElement(at: $0) as? NSObject }
      }
      return (container as? UIView)?.subviews ?? []
    }

    /// A frame in whole points: `(x, y) w×h`.
    private func described(_ frame: CGRect) -> String {
      let whole = { (value: CGFloat) in Int(value.rounded()) }
      return "(\(whole(frame.minX)), \(whole(frame.minY))) \(whole(frame.width))×\(whole(frame.height))"
    }

    /// A string attribute by its accessor's name; SwiftUI's elements implement
    /// the accessors without declaring every protocol.
    private func text(_ element: NSObject, _ name: String) -> String? {
      guard element.responds(to: NSSelectorFromString(name)) else { return nil }
      return element.value(forKey: name) as? String
    }
  }
#endif
