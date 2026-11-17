// SectionNav (`design/components/section-nav.md`): the links between the
// sibling pages of one section, with the page the reader is on marked. It is
// not Tabs: an item is a link to a page, not a panel of this one.
//
// A row of items `space.1` apart that wraps onto further lines, so every item
// is on screen at any width and none is behind a scroll. An item is a SwiftUI
// `Link`: its label in `text.sm`, `text.secondary`, on one line that ends in
// an ellipsis when it is wider than the row, `space.3` across inside a pill of
// `radius.md` at least the small control height tall. Under the pointer and
// while pressed, an item other than the current one is `text.primary` on
// `bg.subtle`, over the control duration, and a press scales it as a pressed
// control. The current item is `selection.text` on `selection.bg`, the
// selection the AppShell rail gives its current item, and keeps it under the
// pointer. Each item takes the hit target's height in the layout
// (`pmHitTarget`), so the lines of a wrapped row are the hit target tall and
// the touch areas of neighbouring lines do not overlap.
//
// An item opens its `href` through the environment's `openURL`, so an app
// routes its own paths with an `OpenURLAction`, or calls `onNavigate` with the
// `href` in place of opening it (`link.md` §Routing). The current item stays
// a link, the way back to its page. An `href` that is not a URL is drawn as
// the label alone, because a link that cannot be followed is not drawn as one.
//
// `current` names the item whose page the reader is on, compared as the page
// it names: its path, without an origin, a query, a hash or a trailing slash,
// with an exact `href` first, an `href` that is only a hash or a query as
// written, and an item written with an origin only for a `current` with the
// same one (`currentIndex`). At most one item is current, the first that
// matches. Its link has the selected trait, which is what Button reports for
// the web's `aria-current`, and the root's identifier carries its `href` as
// `current`.
//
// The row is one container named by `label`, the web's navigation landmark,
// whose links VoiceOver finds one by one. Nothing moves between items:
// navigation does not animate.

import PolymorphTokens
import SwiftUI

public struct PMSectionNav: PMSectionNavRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMSectionNavProps

  public init(props: PMSectionNavProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let at = Self.currentIndex(props.items, current: props.current)

    PMFlowLayout(spacing: space.s1, lineSpacing: space.s1) {
      // By position: two items may share an `href`, and both are drawn.
      ForEach(Array(props.items.enumerated()), id: \.offset) { index, item in
        SectionNavItem(item: item, current: index == at, onNavigate: props.onNavigate)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("SectionNav", at.map { ["current": props.items[$0].href] } ?? [:])
  }

  /// The index of the current item, or `nil`: the first item whose `href` is
  /// exactly `current`, and otherwise the first that names the same page, on
  /// the same origin when the item names one.
  static func currentIndex(_ items: [PMSectionNavItem], current: String?) -> Int? {
    guard let current else { return nil }
    if let exact = items.firstIndex(where: { $0.href == current }) { return exact }
    let wanted = Self.page(of: current)
    let host = Self.origin(of: current)?.lowercased()
    return items.firstIndex { item in
      let own = Self.origin(of: item.href)?.lowercased()
      return Self.page(of: item.href) == wanted && (own == nil || own == host)
    }
  }

  /// The origin an address is written with (`https://app.example.com`, or
  /// `//app.example.com`), where it has one: an optional scheme, then `//`
  /// and the authority up to the path, the query or the hash.
  static func origin(of href: String) -> Substring? {
    var rest = href[...]
    if let colon = rest.firstIndex(of: ":"), isScheme(rest[..<colon]) {
      rest = rest[rest.index(after: colon)...]
    }
    guard rest.hasPrefix("//") else { return nil }
    let authority = rest.dropFirst(2).prefix { !"/?#".contains($0) }
    return href[..<authority.endIndex]
  }

  /// The page an address names: its path without an origin, a query, a hash
  /// or a trailing slash. An address that is only a hash or a query is the
  /// whole address, and an origin with nothing after it names the root.
  static func page(of href: String) -> String {
    if href.hasPrefix("#") || href.hasPrefix("?") { return href }
    let written = Self.origin(of: href)
    let path = href[(written?.endIndex ?? href.startIndex)...].prefix { $0 != "?" && $0 != "#" }
    if path.isEmpty { return written == nil ? "" : "/" }
    guard path.count > 1 else { return String(path) }
    var trimmed = path
    while trimmed.hasSuffix("/") { trimmed = trimmed.dropLast() }
    return String(trimmed)
  }

  /// A URL scheme: a letter, then letters, digits, `+`, `.` or `-`.
  private static func isScheme(_ text: Substring) -> Bool {
    guard let first = text.first, first.isASCII, first.isLetter else { return false }
    return text.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "+.-".contains($0)) }
  }
}

/// One item: a link to its page, or its label when its `href` is not a URL.
private struct SectionNavItem: View {
  let item: PMSectionNavItem
  let current: Bool
  let onNavigate: (@MainActor (String) -> Void)?

  var body: some View {
    if let url = URL(string: item.href) {
      Link(destination: url) { label }
        .buttonStyle(SectionNavItemStyle(current: current))
        .pmRoutes(item.href, to: onNavigate)
        .accessibilityAddTraits(current ? .isSelected : [])
    } else {
      SectionNavItemChrome(current: current, pressed: false) { label }
    }
  }

  private var label: some View {
    Text(item.label)
      .lineLimit(1)
      .truncationMode(.tail)
  }
}

private struct SectionNavItemStyle: ButtonStyle {
  let current: Bool

  func makeBody(configuration: Configuration) -> some View {
    SectionNavItemChrome(current: current, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

/// An item's pill: the selection on the current item, and the subtle wash
/// with the primary text under the pointer and while pressed on the others.
private struct SectionNavItemChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let current: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let density = theme.defaultDensity
    let colors = theme.colors
    let motion = theme.defaultMotion
    let active = !current && (hovering || pressed)
    let text = current ? colors.selectionText : active ? colors.textPrimary : colors.textSecondary
    let fill = current ? colors.selectionBg.color : active ? colors.bgSubtle.color : .clear

    label()
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(text.color)
      .padding(.horizontal, density.space.s3)
      .frame(minHeight: density.controlHeight.sm)
      .background(fill, in: RoundedRectangle(cornerRadius: theme.radius.md))
      .pmPressFeedback(pressed)
      .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
      .onHover { hovering = $0 }
      .pmHitTarget()
  }
}

/// SectionNav's states, from the spec's States table: the first page
/// current, a later page current, no page current, nine pages that wrap, and
/// a long label that ends in an ellipsis.
public struct SectionNavStates: PMStates {
  public let member = "SectionNav"

  public init() {}

  private static let label = "Identity sections"
  private static let four = [
    PMSectionNavItem(label: "Users", href: "#users"),
    PMSectionNavItem(label: "Groups", href: "#groups"),
    PMSectionNavItem(label: "Roles", href: "#roles"),
    PMSectionNavItem(label: "Sessions", href: "#sessions"),
  ]
  private static let nine =
    four + [
      PMSectionNavItem(label: "Service accounts", href: "#service-accounts"),
      PMSectionNavItem(label: "Sign-in policies", href: "#sign-in-policies"),
      PMSectionNavItem(label: "Identity providers", href: "#identity-providers"),
      PMSectionNavItem(label: "Delegations", href: "#delegations"),
      PMSectionNavItem(label: "Recovery", href: "#recovery"),
    ]
  private static let long = [
    PMSectionNavItem(label: "Users", href: "#users"),
    PMSectionNavItem(
      label: "Delegated administration approvals awaiting a second reviewer in every region",
      href: "#approvals"),
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "the first page is current", expect: ["label": Self.label, "current": "#users"]
      ) {
        PMSectionNav(props: PMSectionNavProps(current: "#users", items: Self.four, label: Self.label))
      },
      PMStateEntry("a later page is current", expect: ["current": "#roles"]) {
        PMSectionNav(props: PMSectionNavProps(current: "#roles", items: Self.four, label: Self.label))
      },
      PMStateEntry(
        "no page is current — the reader is outside every item", expect: ["current": ""]
      ) {
        PMSectionNav(props: PMSectionNavProps(items: Self.four, label: Self.label))
      },
      PMStateEntry(
        "many pages — the row wraps onto further lines", expect: ["current": "#delegations"]
      ) {
        PMSectionNav(
          props: PMSectionNavProps(current: "#delegations", items: Self.nine, label: Self.label))
      },
      PMStateEntry(
        "a long label — clipped, so the row does not widen the page", expect: ["current": "#users"]
      ) {
        PMSectionNav(props: PMSectionNavProps(current: "#users", items: Self.long, label: Self.label))
      },
    ]
  }
}
