#if os(macOS)
  import AppKit
  import PolymorphUI
  import SwiftUI
  import XCTest

  /// Every entry's root carries its member's identifier, `member:<Name>`, and
  /// exposes what the entry's `expect` promises — read from the accessibility
  /// tree AppKit publishes for the rendered view, as an assistive client reads it.
  /// An entry whose `expect` sets `hidden` to `true` is a decorative state (a
  /// plain Separator, an unlabelled Skeleton): it must expose nothing at all.
  /// An entry whose `expect` sets `contains` names members that must each be
  /// the member of some element inside the root: the affordance a page
  /// archetype's state draws, and a field still present after a failure. A
  /// name may carry attributes the element must expose too, as
  /// `Menu[part=panel]` (several are space-separated inside the brackets), so
  /// an open state proves its panel and not only the trigger it shares with
  /// the closed one. An empty value promises absence, as the web's `null`
  /// does: `"checked": ""` is a root with no `checked`, and
  /// `NumberInput[part=increment disabled=]` an element without `disabled`.
  /// Every text field, date picker, menu picker and colour well inside the
  /// root must have a name.
  @MainActor
  final class IdentityTests: XCTestCase {
    override func setUp() async throws {
      // SwiftUI builds a view's accessibility nodes only once an assistive
      // client asks for them. Setting `AXEnhancedUserInterface` on the
      // application, as such a client does, turns them on in this process with
      // no client and no permission. The setter is the informal protocol's,
      // reached by selector because its Swift name is deprecated.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    func testEveryEntryRootCarriesItsMemberAndItsPromises() throws {
      for fixture in PMFixtures.all {
        for entry in fixture.entries {
          let label = "\(fixture.member) — \(entry.name)"
          if entry.expect["hidden"] == "true" {
            XCTAssertNil(rootElement(of: entry), "\(label): a hidden entry exposes an element")
            continue
          }
          let root = try XCTUnwrap(rootElement(of: entry), "\(label): nothing is exposed to accessibility")
          let identifier = attribute(root, "accessibilityIdentifier") ?? ""
          let member = PMMember.parse(identifier)
          XCTAssertEqual(
            member?.name, fixture.member, "\(label): the root's identifier is \"\(identifier)\"")
          for control in unnamedPlatformControls(in: root) {
            XCTFail("\(label): an \(control) has no name")
          }

          for (key, value) in entry.expect {
            if key == "contains" {
              let found = members(inside: root)
              let missing = value.split(separator: ",").map(String.init).filter { wanted in
                !found.contains { Self.matches($0, wanted) }
              }
              let names = Set(found.map(\.name)).sorted()
              XCTAssertEqual(missing, [], "\(label): contains none of \(missing); found \(names)")
              continue
            }
            let actual: String? =
              switch key {
              case "label": spokenName(root)
              case "value": attribute(root, "accessibilityValue")
              default: member?.attributes[key]
              }
            if value.isEmpty {
              XCTAssertEqual(actual ?? "", "", "\(label): \(key) is promised absent")
            } else {
              XCTAssertEqual(actual, value, "\(label): \(key)")
            }
          }
        }
      }
    }

    /// The first element the hosting view exposes: the entry's root.
    private func rootElement(of entry: PMStateEntry) -> NSObject? {
      let size = Harness.size(of: entry, Harness.passes[0])
      let host = NSHostingView(rootView: Harness.scene(entry, Harness.passes[0], size: size))
      host.frame = CGRect(origin: .zero, size: size)
      let window = NSWindow(
        contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
      window.contentView = host
      host.layoutSubtreeIfNeeded()
      // A turn of the run loop, in which SwiftUI publishes the nodes.
      RunLoop.main.run(until: Date().addingTimeInterval(0.05))
      return host.accessibilityChildren()?.first as? NSObject
    }

    /// The platform controls in `root`, itself included, that have no name:
    /// no label and no title. Each is named by its role and its class. A
    /// text field, a date picker, a menu picker or a colour well SwiftUI
    /// hosts is a platform view, whose label UIKit's accessibility runtime
    /// publishes on iOS; that runtime runs in an app and not in a package's
    /// test process, so the simulator audit cannot read the label. AppKit
    /// publishes the same control's name in this process, so the rule that
    /// every element is named is held here for them. The element is the
    /// control's cell, and SwiftUI puts the name on the control it draws the
    /// cell in.
    private func unnamedPlatformControls(in root: NSObject) -> [String] {
      let roles: Set<String> = [
        NSAccessibility.Role.textField.rawValue, NSAccessibility.Role.textArea.rawValue,
        "AXDateTimeArea", NSAccessibility.Role.popUpButton.rawValue,
        NSAccessibility.Role.comboBox.rawValue, NSAccessibility.Role.colorWell.rawValue,
      ]
      return ([root] + descendants(of: root)).filter { element in
        guard roles.contains(attribute(element, "accessibilityRole") ?? "") else { return false }
        return ![element, (element as? NSCell)?.controlView].compactMap { $0 }.contains {
          !(attribute($0, "accessibilityLabel") ?? "").isEmpty
            || !(attribute($0, "accessibilityTitle") ?? "").isEmpty
        }
      }.map { "\(attribute($0, "accessibilityRole") ?? "") (\(type(of: $0)))" }
    }

    /// Every element inside `element`, at any depth, in order.
    private func descendants(of element: NSObject) -> [NSObject] {
      guard element.responds(to: NSSelectorFromString("accessibilityChildren")),
        let children = element.value(forKey: "accessibilityChildren") as? [Any]
      else { return [] }
      return children.compactMap { $0 as? NSObject }.flatMap { [$0] + descendants(of: $0) }
    }

    /// The member and attributes of every element inside `element`, at any
    /// depth, by the identifiers their roots carry.
    private func members(
      inside element: NSObject
    ) -> [(name: String, attributes: [String: String])] {
      guard element.responds(to: NSSelectorFromString("accessibilityChildren")),
        let children = element.value(forKey: "accessibilityChildren") as? [Any]
      else { return [] }
      var found: [(name: String, attributes: [String: String])] = []
      for case let child as NSObject in children {
        if let member = PMMember.parse(attribute(child, "accessibilityIdentifier") ?? "") {
          found.append(member)
        }
        found += members(inside: child)
      }
      return found
    }

    /// Whether a member found inside the root is the one `wanted` names:
    /// `Menu`, or `Menu[part=panel]` with each attribute it lists, where an
    /// attribute with no value (`disabled=`) must be absent.
    static func matches(
      _ member: (name: String, attributes: [String: String]), _ wanted: String
    ) -> Bool {
      guard let open = wanted.firstIndex(of: "["), wanted.hasSuffix("]") else {
        return member.name == wanted
      }
      guard member.name == wanted[..<open] else { return false }
      let pairs = wanted[wanted.index(after: open)..<wanted.index(before: wanted.endIndex)]
        .split(separator: " ")
      return pairs.allSatisfy { pair in
        let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
          .map(String.init)
        guard parts.count == 2 else { return false }
        return (member.attributes[parts[0]] ?? "") == parts[1]
      }
    }

    /// An attribute by its accessor's name. SwiftUI's nodes implement the
    /// accessors without declaring the protocols, so they are read by name.
    private func attribute(_ element: NSObject, _ name: String) -> String? {
      guard element.responds(to: NSSelectorFromString(name)) else { return nil }
      return element.value(forKey: name).map { "\($0)" }
    }

    /// The name an assistive client speaks: the label, which AppKit publishes
    /// as the value of a static text.
    private func spokenName(_ element: NSObject) -> String? {
      if let label = attribute(element, "accessibilityLabel"), !label.isEmpty { return label }
      guard attribute(element, "accessibilityRole") == NSAccessibility.Role.staticText.rawValue
      else { return nil }
      return attribute(element, "accessibilityValue")
    }
  }
#endif
