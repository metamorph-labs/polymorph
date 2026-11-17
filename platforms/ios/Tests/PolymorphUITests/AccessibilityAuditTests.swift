#if os(iOS)
  import SwiftUI
  import UIKit
  import XCTest

  // `@testable` reaches the boxes the members publish (`PMTapBoxKey`).
  @testable import PolymorphUI

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
  /// The hit region is measured by what the element is:
  ///
  /// - A hosted text entry view (a `UITextField`, or an editable `UITextView`)
  ///   is its editable line, which UIKit publishes as the element, while the
  ///   member's box takes the tap. The member's `pmOpensOnTap` publishes the
  ///   box (`PMTapBoxKey`), and the audit reads the boxes at the root of the
  ///   hosting. The view passes when the smallest box that contains its frame
  ///   is 44 points on each axis. A view in no box, or in a box under 44
  ///   points, is a defect.
  /// - A system control, a hosted `UIControl` that is not a text entry view
  ///   (the compact date picker, a menu's button, a navigation bar's button),
  ///   takes its own taps over the area UIKit hit-tests to it, which can be
  ///   larger than its bounds (a bar button's platter), and it publishes no
  ///   accessibility frame in the test process. The audit probes that area:
  ///   from the centre of the control's bounds it calls `window.hitTest` a
  ///   pixel at a time outward along the horizontal and the vertical line
  ///   through the centre, as far as the view returned is the control or a
  ///   view inside it, and takes the run on each line as the control's width
  ///   and height. A control whose area is 44 points on each axis passes. One
  ///   whose area is shorter is UIKit's control at UIKit's size, which no
  ///   member's area can widen: the audit records it with the area it
  ///   measured, and `scripts/ios-audit.mjs` counts it against its own number
  ///   rather than as a defect. A disabled control takes no taps, so UIKit
  ///   hit-tests nothing to it: it is measured by its bounds, the least area
  ///   it takes its taps in once enabled. An enabled control whose centre
  ///   hit-tests to another view takes no tap at all, which is a defect.
  ///   A text entry view is not probed, because a tap beside its line goes to
  ///   the member's gesture, which `hitTest` returns as the hosting view.
  /// - Every other element is measured by the frame SwiftUI publishes.
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
  /// reads such a view's frame from the view and holds it to the hit region,
  /// as above, and to the window. Its label is not published here, so
  /// `IdentityTests` holds every hosted control (a text field, a date picker,
  /// a menu picker, a colour well) to a name on macOS, where AppKit publishes
  /// it in the test's process, and the members name their text fields the
  /// same way on both platforms (`pmEntryName`).
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
      let (window, nodes, boxes) = host(entry, size, scrolls: false)
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
      let (scrolling, drawn, _) = host(entry, size, scrolls: true)
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
          switch element.control {
          case .entry:
            holdToBox(frame, of: shown, in: boxes, label, scale: scale)
          case .system(let control):
            record(control, of: shown, in: window, label, scale: scale)
          case .element:
            XCTAssertGreaterThanOrEqual(
              pixels(frame.width, scale), hitRegion * scale, "\(label): \(shown) is too narrow to hit")
            XCTAssertGreaterThanOrEqual(
              pixels(frame.height, scale), hitRegion * scale, "\(label): \(shown) is too short to hit")
          }
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

    /// Holds a hosted text entry view to the box it takes its tap in: the
    /// smallest box a member publishes (`PMTapBoxKey`) that contains the
    /// view's frame, compared in whole pixels. UIKit publishes the editable
    /// line as the element, and the member's box around it is the area that
    /// focuses it.
    private func holdToBox(
      _ frame: CGRect, of shown: String, in boxes: [CGRect], _ label: String, scale: CGFloat
    ) {
      let line = pixelFrame(frame, scale)
      let box = boxes.filter { pixelFrame($0, scale).contains(line) }
        .min { $0.width * $0.height < $1.width * $1.height }
      guard let box else {
        XCTFail("\(label): \(shown) lies in no box that takes its tap, at \(described(frame))")
        return
      }
      XCTAssertGreaterThanOrEqual(
        pixels(box.width, scale), hitRegion * scale,
        "\(label): \(shown)'s box, \(described(box)), is too narrow to hit")
      XCTAssertGreaterThanOrEqual(
        pixels(box.height, scale), hitRegion * scale,
        "\(label): \(shown)'s box, \(described(box)), is too short to hit")
    }

    /// Holds a system control to the area UIKit hit-tests to it
    /// (`hitArea`), and records it when that area is under the hit region on
    /// an axis. It takes its own taps at the size UIKit gives it, so no
    /// member's area can widen it, and the audit neither passes it nor counts
    /// it as a defect: the wording tells `scripts/ios-audit.mjs` to count it
    /// against `ios.system`.
    private func record(
      _ control: UIView, of shown: String, in window: UIWindow, _ label: String, scale: CGFloat
    ) {
      guard let area = hitArea(of: control, in: window, scale: scale) else {
        XCTFail("\(label): \(shown) takes no tap, because another view covers its centre")
        return
      }
      let recorded = "\(label): \(shown) is UIKit's control at UIKit's size, hit-tested over"
      if pixels(area.width, scale) < hitRegion * scale {
        XCTFail("\(recorded) \(points(area.width, scale)) points of width")
      }
      if pixels(area.height, scale) < hitRegion * scale {
        XCTFail("\(recorded) \(points(area.height, scale)) points of height")
      }
    }

    /// The width and height of the area UIKit delivers a control's touches
    /// in. From the centre of the control's bounds, `window.hitTest` is
    /// called a pixel at a time outward along the horizontal and the vertical
    /// line through the centre, as far as the view it returns is the control
    /// or a view inside it, and no further than the hit region on each side.
    /// Each line's run of such pixels is the area on that axis. A disabled
    /// control gives its bounds, and an enabled one whose centre hit-tests to
    /// another view gives none.
    private func hitArea(of control: UIView, in window: UIWindow, scale: CGFloat) -> CGSize? {
      let frame = control.convert(control.bounds, to: nil)
      if disabled(control) { return frame.size }
      let centre = CGPoint(x: frame.midX, y: frame.midY)
      let takes = { (point: CGPoint) -> Bool in
        guard let hit = window.hitTest(point, with: nil) else { return false }
        return hit === control || hit.isDescendant(of: control)
      }
      guard takes(centre) else { return nil }
      // The pixels past the centre, towards (dx, dy), that hit-test to the control.
      let reach = { (dx: CGFloat, dy: CGFloat) -> Int in
        var count = 0
        while CGFloat(count) < self.hitRegion * scale {
          let distance = CGFloat(count + 1) / scale
          guard takes(CGPoint(x: centre.x + dx * distance, y: centre.y + dy * distance)) else { break }
          count += 1
        }
        return count
      }
      let width = 1 + reach(-1, 0) + reach(1, 0)
      let height = 1 + reach(0, -1) + reach(0, 1)
      return CGSize(width: CGFloat(width) / scale, height: CGFloat(height) / scale)
    }

    /// Whether a control takes no touch because it is disabled: the control
    /// itself, or a view that holds it, which is how SwiftUI disables a
    /// control it hosts.
    private func disabled(_ control: UIView) -> Bool {
      if (control as? UIControl)?.isEnabled == false { return true }
      var view: UIView? = control
      while let held = view, !(held is UIWindow) {
        if !held.isUserInteractionEnabled { return true }
        view = held.superview
      }
      return false
    }

    /// A length in whole pixels of the screen, so a 44-point frame that
    /// floating point reports as 43.99999 points passes.
    private func pixels(_ length: CGFloat, _ scale: CGFloat) -> CGFloat {
      (length * scale).rounded()
    }

    /// A frame with each edge on the nearest whole pixel.
    private func pixelFrame(_ frame: CGRect, _ scale: CGFloat) -> CGRect {
      let edge = { (value: CGFloat) in (value * scale).rounded() }
      return CGRect(
        x: edge(frame.minX), y: edge(frame.minY),
        width: edge(frame.maxX) - edge(frame.minX), height: edge(frame.maxY) - edge(frame.minY))
    }

    /// A length in points as whole pixels give it, to a tenth: `34`, `34.3`.
    private func points(_ length: CGFloat, _ scale: CGFloat) -> String {
      let tenths = (pixels(length, scale) / scale * 10).rounded() / 10
      return tenths == tenths.rounded() ? String(Int(tenths)) : String(format: "%.1f", tenths)
    }

    /// Takes a window off the screen and releases the entry it hosted. Its
    /// frame and its screen stay readable.
    private func retire(_ window: UIWindow) {
      window.isHidden = true
      window.rootViewController = nil
    }

    /// What an actionable node is, which decides what its hit region is
    /// measured by.
    private enum Control {
      /// An element SwiftUI publishes: its own frame.
      case element
      /// A hosted text field or editable text view: the box its member takes
      /// its tap in.
      case entry
      /// A hosted UIKit control that is not a text entry view (the compact
      /// date picker, a menu's button, a navigation bar's button): the area
      /// UIKit hit-tests to the control, which is recorded when short.
      case system(UIView)
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
      let control: Control
      let kind: String

      /// What the element is, wherever it is drawn: the same element in both
      /// hostings has the same key.
      var key: String { "\(kind)|\(identifier ?? "")|\(label ?? "")|\(actionable)" }
    }

    /// The boxes an entry's fields take their taps in, in the window's
    /// coordinates, as the hosting's last layout publishes them.
    private final class Boxes {
      var frames: [CGRect] = []
    }

    /// The entry in a key window at a text size, with its scroll views drawn
    /// or at rest, the tree it exposes, depth first, and the boxes its
    /// fields take their taps in (`PMTapBoxKey`). The boxes are read at the
    /// root of the hosting, where every member's preference arrives, and
    /// resolved there in the window's coordinates.
    private func host(
      _ entry: PMStateEntry, _ size: UIContentSizeCategory, scrolls: Bool
    ) -> (UIWindow, [Node], [CGRect]) {
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
      let boxes = Boxes()
      let controller = UIHostingController(
        rootView: Harness.scene(entry, pass, size: canvas, scrolls: scrolls)
          .dynamicTypeSize(text)
          .transaction { $0.disablesAnimations = true }
          .backgroundPreferenceValue(PMTapBoxKey.self) { anchors in
            GeometryReader { proxy in
              let origin = proxy.frame(in: .global).origin
              let frames = anchors.map { proxy[$0].offsetBy(dx: origin.x, dy: origin.y) }
              Color.clear
                .allowsHitTesting(false)
                .onChange(of: frames, initial: true) { _, frames in boxes.frames = frames }
            }
          })
      controller.safeAreaRegions = []
      window.frame.size.height = max(canvas.height, Harness.tallest)
      window.rootViewController = controller
      controller.view.setNeedsLayout()
      controller.view.layoutIfNeeded()
      RunLoop.main.run(until: Date().addingTimeInterval(0.05))
      var nodes: [Node] = []
      for child in children(of: controller.view) { collect(child, into: &nodes) }
      return (window, nodes, boxes.frames)
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
        let entry = view is UITextField || (view as? UITextView)?.isEditable == true
        nodes.append(
          Node(
            isElement: true, isHostedView: true, identifier: view.accessibilityIdentifier,
            label: view.accessibilityLabel, frame: view.convert(view.bounds, to: nil),
            actionable: view is UIControl || entry, control: entry ? .entry : .system(view),
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
          control: .element, kind: String(describing: type(of: object))))
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
