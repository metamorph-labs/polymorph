// List (`design/components/list.md`): a column of items of one kind, each
// read, followed or picked. `PMList` is the column, named by `label`, around
// its `PMList.Item`s, the web's `List.Item`. It is not Table: an item is read
// as one thing, and a table compares fields down its columns.
//
// The column has no gap. Each item inside a List draws a `border.subtle`
// hairline above it; the column lifts its items by one rule's thickness under
// its clip, so the first item's rule is hidden and the surface the List sits
// in is the outer boundary. An item on its own draws none.
//
// An item is a row, centred, `space.3` apart: the `leading` mark, then the
// text column, which takes the free width (the `title` in `text.sm`
// `text.primary`, then the `description` in `text.xs` `text.secondary`,
// `space.1` under it, both wrapping and never clipped), then `meta` in
// `text.xs` `text.secondary` on one line, then `trailing`. It is `space.3`
// and `space.4` inside and at least the large control height tall. The
// leading mark, the meta and the trailing part never shrink.
//
// One element takes an interactive item's press, and it covers the row up to
// the trailing part: with an `href`, a SwiftUI `Link`, opened through the
// environment's `openURL`, or handed to `onNavigate` in place of opening it
// (`link.md` §Routing), with `onSelect` run first, as the web runs it beside
// the click; with `onSelect` alone, a Button. VoiceOver reads the item as that
// one element, the link or the button, its title, description and meta in
// order. An interactive item is at least the hit target tall. An item with
// neither is one element of text.
//
// The trailing part is outside that element, so a control there keeps its own
// name and takes its own press. Its box is as tall as the row and takes a
// touch that no control in it takes with a tap gesture that runs what the
// row's press runs, as a table cell's accessory label is part of the cell: a
// press on a trailing mark that is not a control (a Badge) is a press on the
// row. A Button in the box takes its own press before its parent's gesture.
// The gesture adds no element and no action: a mark stays the text VoiceOver
// reads after the row. A disabled control takes no press, so a press on one
// falls to the row, as it does in the platform's own rows, where the web's
// trailing box keeps it; a busy Button stays enabled and keeps its press.
//
// A press on the link or the button, or a pointer over an interactive item,
// washes the whole row in `bg.subtle`, over the control duration. The current item, an interactive
// one with `current`, is filled with the selected surface, the fill the
// contrast law holds every text role on, so its text keeps its colours; a
// press or a pointer over it takes the selected surface's hover step. The
// current item's link or button has the selected trait, which is what Button
// reports for the web's `aria-current`. An item that is only read is never
// filled: nothing would say to VoiceOver what the fill says. The row does not
// scale on a press, and nothing slides between items.
//
// The List is one container named by `label`, whose items VoiceOver finds one
// by one. iOS has no list role or item count for a view that is not a
// scrolling `List`, so the name is what tells one list from another. Each
// item's link, button or text carries the List's identity with `part=item`,
// and `interactive` and `current` where they hold.

import PolymorphTokens
import SwiftUI

public struct PMList: PMListRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMListProps

  public init(props: PMListProps) {
    self.props = props
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      props.children
    }
    .environment(\.pmListRuled, true)
    // One rule's thickness up, under the clip, so the first item's rule is hidden.
    .padding(.top, -PMRule.thickness)
    .frame(maxWidth: .infinity, alignment: .leading)
    .clipped()
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("List")
  }
}

extension PMList {
  /// One item: read, followed or picked.
  public struct Item: View {
    @Environment(\.pmTheme) private var theme
    @Environment(\.pmListRuled) private var ruled
    @Environment(\.openURL) private var openURL
    @State private var pressed = false
    @State private var hovering = false
    private let props: PMListItemProps

    public init(props: PMListItemProps) {
      self.props = props
    }

    /// Where the item goes, when its `href` is a URL a link can open.
    private var destination: URL? {
      props.href.flatMap { URL(string: $0) }
    }

    private var interactive: Bool {
      destination != nil || props.onSelect != nil
    }

    public var body: some View {
      let colors = theme.colors
      let motion = theme.defaultMotion
      let current = (props.current ?? false) && interactive
      let active = interactive && (pressed || hovering)
      let fill =
        current
        ? (active ? colors.selectionSurfaceHover : colors.selectionSurface).color
        : (active ? colors.bgSubtle.color : .clear)

      HStack(spacing: 0) {
        target(current: current)
          .pmMember("List", attributes(current: current))
        if let trailing = props.trailing {
          trailing
            .fixedSize()
            .padding(.trailing, theme.defaultDensity.space.s4)
            .frame(maxHeight: .infinity)
            .modifier(PMListTrailingPress(press: rowPress))
        }
      }
      // As tall as its tallest part, so the target and the trailing box both
      // take the row's height.
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(fill)
      .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
      .overlay(alignment: .top) {
        if ruled {
          PMRule(colors.borderSubtle)
        }
      }
      .onHover { hovering = $0 }
    }

    /// The element that takes the row's press: a link for an `href`, a button
    /// for `onSelect` alone, or the text when the item is only read.
    @ViewBuilder
    private func target(current: Bool) -> some View {
      if let href = props.href, let url = destination {
        Link(destination: url) { content }
          .buttonStyle(PMListItemPress(pressed: $pressed))
          .modifier(PMSelectsFirst(onSelect: props.onSelect))
          .pmRoutes(href, to: props.onNavigate)
          .accessibilityAddTraits(current ? .isSelected : [])
      } else if let onSelect = props.onSelect {
        Button(action: onSelect) { content }
          .buttonStyle(PMListItemPress(pressed: $pressed))
          .accessibilityAddTraits(current ? .isSelected : [])
      } else {
        content
          .accessibilityElement(children: .combine)
      }
    }

    private var rowPress: (@MainActor () -> Void)? {
      Self.rowPress(props, openURL: openURL)
    }

    /// What the row's press runs, for a touch in the trailing part that no
    /// control there takes: `onSelect`, then the route or `openURL` for an
    /// `href` that is a URL, as the link runs them; `onSelect` alone for a
    /// button; nothing for an item that is only read.
    static func rowPress(
      _ props: PMListItemProps, openURL: OpenURLAction
    ) -> (@MainActor () -> Void)? {
      guard let href = props.href, let url = URL(string: href) else { return props.onSelect }
      let select = props.onSelect
      let route = props.onNavigate
      return {
        select?()
        if let route { route(href) } else { openURL(url) }
      }
    }

    /// The leading mark, the text column and the meta, inside the row's
    /// padding up to the trailing part, which keeps the gap after the meta.
    private var content: some View {
      let density = theme.defaultDensity
      let space = density.space
      let colors = theme.colors
      let least = interactive ? max(density.controlHeight.lg, density.hitTarget) : density.controlHeight.lg

      return HStack(spacing: space.s3) {
        if let leading = props.leading {
          leading.fixedSize()
        }
        VStack(alignment: .leading, spacing: space.s1) {
          Text(props.title)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(colors.textPrimary.color)
          if let description = props.description {
            Text(description)
              .pmTextStyle(theme.text.xs)
              .foregroundStyle(colors.textSecondary.color)
          }
        }
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        if let meta = props.meta {
          Text(meta)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textSecondary.color)
            .lineLimit(1)
            .fixedSize()
        }
      }
      .padding(.vertical, space.s3)
      .padding(.leading, space.s4)
      .padding(.trailing, props.trailing == nil ? space.s4 : space.s3)
      .frame(maxWidth: .infinity, minHeight: least, maxHeight: .infinity, alignment: .leading)
      .contentShape(.rect)
    }

    private func attributes(current: Bool) -> [String: String] {
      var found = ["part": "item"]
      if interactive { found["interactive"] = "true" }
      if current { found["current"] = "true" }
      return found
    }
  }
}

/// The trailing box's share of the row's press: a tap that no control in the
/// box takes runs `press`. Without one, the box takes no touch of its own.
private struct PMListTrailingPress: ViewModifier {
  let press: (@MainActor () -> Void)?

  func body(content: Content) -> some View {
    if let press {
      content
        .contentShape(.rect)
        .onTapGesture { press() }
    } else {
      content
    }
  }
}

/// An item's press, reported to the item, which washes the whole row,
/// the trailing part's room included.
private struct PMListItemPress: ButtonStyle {
  @Binding var pressed: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .onChange(of: configuration.isPressed) { _, now in pressed = now }
  }
}

private struct PMListRuledKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether a List item draws the rule above it: inside a List, where items
  /// are separated; an item on its own draws none.
  fileprivate var pmListRuled: Bool {
    get { self[PMListRuledKey.self] }
    set { self[PMListRuledKey.self] = newValue }
  }
}

/// List's states, from the spec's States table: items that are read, that
/// navigate, the current page's item, items that are picked, a trailing
/// control beside a trailing mark, and a long title that wraps.
public struct ListStates: PMStates {
  public let member = "List"

  public init() {}

  private static let people = [
    ("Ada Okafor", "Owner · signed in 2 minutes ago", "2m", "#ada-okafor"),
    ("Bao Tran", "Member · signed in yesterday", "1d", "#bao-tran"),
    ("Carmen Ruiz", "Member · invited, not yet signed in", "6d", "#carmen-ruiz"),
  ]
  private static let signIns = "Recent sign-ins"
  private static let members = "Members"
  private static let accounts = "Accounts"
  private static let invitations = "Invitations"
  private static let exports = "Exports"
  private static let resend = "Resend"
  private static let expired = "Expired"
  private static let longTitle =
    "ticket-export-2026-eu-west-1-production-customer-support-archive-part-0001-of-0042"
  private static let longDescription =
    "\(longTitle).zip, requested by an administrator and kept for thirty days"

  private func list(_ label: String, _ items: some View) -> PMList {
    PMList(props: PMListProps(children: AnyView(items), label: label))
  }

  private func avatar(_ name: String) -> PMContent {
    AnyView(PMAvatar(props: PMAvatarProps(name: name)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("items that are read", expect: ["label": Self.signIns]) {
        list(
          Self.signIns,
          ForEach(Self.people, id: \.0) { person in
            PMList.Item(
              props: PMListItemProps(description: person.1, meta: person.2, title: person.0))
          })
      },
      PMStateEntry(
        "items that navigate", expect: ["contains": "List[part=item interactive=true]"]
      ) {
        list(
          Self.members,
          ForEach(Self.people, id: \.0) { person in
            PMList.Item(
              props: PMListItemProps(
                description: person.1, href: person.3, leading: avatar(person.0), meta: person.2,
                title: person.0))
          })
      },
      PMStateEntry(
        "the item of the open page is current",
        expect: ["contains": "List[part=item interactive=true current=true]"]
      ) {
        list(
          Self.members,
          ForEach(Array(Self.people.enumerated()), id: \.offset) { index, person in
            PMList.Item(
              props: PMListItemProps(
                current: index == 0, description: person.1, href: person.3, title: person.0))
          })
      },
      PMStateEntry(
        "items that are picked",
        expect: ["contains": "List[part=item interactive=true current=true]"]
      ) {
        list(
          Self.accounts,
          ForEach(Array(Self.people.enumerated()), id: \.offset) { index, person in
            PMList.Item(
              props: PMListItemProps(
                current: index == 0, description: person.1, leading: avatar(person.0),
                onSelect: {}, title: person.0))
          })
      },
      PMStateEntry(
        "a trailing control — it takes its own press", expect: ["contains": "Button,Badge"]
      ) {
        list(
          Self.invitations,
          Group {
            PMList.Item(
              props: PMListItemProps(
                description: "Invited as an owner", href: "#ada-okafor", title: "Ada Okafor",
                trailing: AnyView(
                  PMButton(
                    props: PMButtonProps(label: Self.resend, size: .sm, appearance: .outlineNeutral)
                  ))))
            PMList.Item(
              props: PMListItemProps(
                description: "Invited as a member", href: "#bao-tran", title: "Bao Tran",
                trailing: AnyView(
                  PMBadge(props: PMBadgeProps(children: Self.expired, tone: .warning)))))
          })
      },
      PMStateEntry(
        "a long title and description — they wrap, so the list does not widen the page",
        expect: ["label": Self.exports]
      ) {
        list(
          Self.exports,
          PMList.Item(
            props: PMListItemProps(
              description: Self.longDescription, meta: "4.2 GB", title: Self.longTitle)))
      },
    ]
  }
}
