// Breadcrumbs (`design/components/breadcrumbs.md`): the trail from the root to
// the current page. One row in `text.sm` that never wraps, because a trail on
// two lines reads as two locations: a crumb is clipped at twice `space.10`
// with an ellipsis, and a row narrower than its crumbs shortens them further.
// Past `maxItems` the trail collapses to the first crumb, the overflow and the
// last two, so both ends of the path stay visible.
//
// A crumb is Link's grammar in `text.secondary`, `text.primary` and
// underlined under the pointer and while pressed (`PMTextLinkStyle`). A crumb
// with an `href` is a SwiftUI `Link`, opened through the environment's
// `openURL`, so an app routes its own paths with an `OpenURLAction` as it
// does for Link, or calls the trail's `onNavigate` with its `href` in place
// of opening it (`link.md` §Routing). The item's `onSelect` runs first, as
// the web runs it beside the click. A crumb with `onSelect` and no `href` is
// a button that calls it, for an app that routes its own navigation; one with
// neither, or with only an `href` that is not a URL, is text in the crumb's
// colour, because it is still part of the path. The last crumb is the current
// page: `text.primary` text, never a link to itself, with the selected trait,
// which is what Button reports for the web's `aria-current`.
//
// The overflow is Menu, behind Button `ghost`/`neutral`/`sm` icon-only
// `overflow`, named by `overflowLabel`: a sheet of the hidden crumbs on iPhone
// and a pull-down popover on iPad, as Menu is everywhere. Its commands are the
// hidden crumbs in order; choosing one calls its `onSelect`, or `onNavigate`
// with its `href`, or opens its `href`. `defaultOpen` opens it on its own, as
// Menu's does.
//
// No motion: navigation does not animate. The separators are decorative.

import PolymorphTokens
import SwiftUI

public struct PMBreadcrumbs: PMBreadcrumbsRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.openURL) private var openURL
  private let props: PMBreadcrumbsProps

  public init(props: PMBreadcrumbsProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let (row, hidden) = Self.rungs(
      props.items, maxItems: props.maxItems ?? PMSpecDefault.breadcrumbsMaxItems)
    let last = row.count - 1

    HStack(spacing: space.s2) {
      ForEach(Array(row.enumerated()), id: \.offset) { index, rung in
        switch rung {
        case .overflow:
          overflow(hidden)
        case .crumb(let item) where index == last:
          current(item.label)
        case .crumb(let item):
          crumb(item)
        }
        if index != last {
          PMIconView(.next, size: .sm)
            .foregroundStyle(theme.colors.textMuted.color)
        }
      }
    }
    .pmTextStyle(theme.text.sm)
    .lineLimit(1)
    .truncationMode(.tail)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label ?? PMStrings.breadcrumb))
    .pmMember("Breadcrumbs")
  }

  /// A crumb before the current page: a link for an `href`, which runs the
  /// item's `onSelect` before it routes or opens, a button for `onSelect`
  /// alone, or text when it has no destination.
  @ViewBuilder
  private func crumb(_ item: PMBreadcrumbItem) -> some View {
    let colors = theme.colors
    let style = PMTextLinkStyle(
      color: colors.textSecondary, activeColor: colors.textPrimary, underlined: false)
    if let href = item.href, let url = URL(string: href) {
      Link(destination: url) { clipped(item.label) }
        .buttonStyle(style)
        .modifier(PMSelectsFirst(onSelect: item.onSelect))
        .pmRoutes(href, to: props.onNavigate)
    } else if let onSelect = item.onSelect {
      Button(action: onSelect) { clipped(item.label) }
        .buttonStyle(style)
    } else {
      clipped(item.label)
        .foregroundStyle(colors.textSecondary.color)
    }
  }

  /// The current page: a location, not an action, so no hover and no link.
  /// A row too narrow for every crumb shortens the others first.
  private func current(_ label: String) -> some View {
    clipped(label)
      .foregroundStyle(theme.colors.textPrimary.color)
      .accessibilityAddTraits([.isStaticText, .isSelected])
      .layoutPriority(1)
  }

  /// A crumb's label, no wider than the recipe's measure.
  private func clipped(_ label: String) -> some View {
    CrumbWidth(cap: theme.defaultDensity.space.s10 * PMRecipe.crumbMeasure) {
      Text(label)
    }
  }

  /// Menu, behind the icon-only trigger, with the hidden crumbs as its commands.
  private func overflow(_ hidden: [PMBreadcrumbItem]) -> some View {
    PMMenu(
      props: PMMenuProps(
        defaultOpen: props.defaultOpen,
        items: hidden.map { item in
          .item(PMMenuItemEntry(label: item.label, onSelect: { select(item) }))
        },
        trigger: AnyView(
          PMButton(
            props: PMButtonProps(
              icon: .overflow, iconOnly: true,
              label: props.overflowLabel ?? PMStrings.showPath, size: .sm,
              appearance: .ghostNeutral)))))
    .fixedSize()
  }

  /// A hidden crumb chosen from the menu: the item's own navigation when it
  /// has one, otherwise the app's router with its `href`, otherwise its
  /// `href`, as a link would open it.
  private func select(_ item: PMBreadcrumbItem) {
    if let onSelect = item.onSelect {
      onSelect()
    } else if let href = item.href, let onNavigate = props.onNavigate {
      onNavigate(href)
    } else if let href = item.href, let url = URL(string: href) {
      openURL(url)
    }
  }

  /// One place in the drawn trail: a crumb, or the overflow.
  private enum Rung {
    case crumb(PMBreadcrumbItem)
    case overflow
  }

  /// The trail as drawn: every crumb, or, past `maxItems`, the first, the
  /// overflow and the last two, with the crumbs the overflow holds. A trail
  /// that would hide nothing is drawn whole, so the menu is never empty.
  private static func rungs(
    _ items: [PMBreadcrumbItem], maxItems: Double
  ) -> (row: [Rung], hidden: [PMBreadcrumbItem]) {
    let kept = 3
    guard Double(items.count) > maxItems, items.count > kept, let first = items.first else {
      return (items.map(Rung.crumb), [])
    }
    let rest = items.dropFirst()
    return (
      [.crumb(first), .overflow] + rest.suffix(2).map(Rung.crumb),
      Array(rest.dropLast(2))
    )
  }
}

/// A crumb's width: its label's own width up to `cap`, and less when the row
/// offers less, so a long label ends in an ellipsis and a short one takes only
/// its own width. A `frame(maxWidth:)` would grow every crumb to `cap`.
private struct CrumbWidth: Layout {
  let cap: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let label = subviews.first else { return .zero }
    return label.sizeThatFits(ProposedViewSize(width: width(label, proposal), height: nil))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading,
      proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
  }

  private func width(_ label: LayoutSubview, _ proposal: ProposedViewSize) -> CGFloat {
    min(label.sizeThatFits(.unspecified).width, cap, proposal.width ?? .infinity)
  }
}

/// Breadcrumbs' states, from the spec's States table. The harness draws no
/// presentation, so the open overflow's entry draws Menu's panel in place
/// under the trail, as Menu's own fixture does.
public struct BreadcrumbsStates: PMStates {
  public let member = "Breadcrumbs"

  public init() {}

  private static let two = [
    PMBreadcrumbItem(label: "Tickets", href: "https://example.com/tickets"),
    PMBreadcrumbItem(label: "Ticket #4182"),
  ]

  private static let four = [
    PMBreadcrumbItem(label: "Home", href: "https://example.com"),
    PMBreadcrumbItem(label: "Workspaces", href: "https://example.com/workspaces"),
    PMBreadcrumbItem(label: "Support", href: "https://example.com/support"),
    PMBreadcrumbItem(label: "Ticket #4182"),
  ]

  private static let six = [
    PMBreadcrumbItem(label: "Home", href: "https://example.com"),
    PMBreadcrumbItem(label: "Workspaces", href: "https://example.com/workspaces"),
    PMBreadcrumbItem(label: "Northwind", href: "https://example.com/northwind"),
    PMBreadcrumbItem(label: "Support", href: "https://example.com/support"),
    PMBreadcrumbItem(label: "Escalations", href: "https://example.com/escalations"),
    PMBreadcrumbItem(label: "Ticket #4182"),
  ]

  private static let long = [
    PMBreadcrumbItem(label: "Home", href: "https://example.com"),
    PMBreadcrumbItem(
      label: "Refund not received for order 88-2401 placed in March",
      href: "https://example.com/thread"),
    PMBreadcrumbItem(label: "Ticket #4182"),
  ]

  /// A trail whose app routes its own navigation, and a section with no page.
  private static let routed = [
    PMBreadcrumbItem(label: "Home", onSelect: {}),
    PMBreadcrumbItem(label: "Settings"),
    PMBreadcrumbItem(label: "Billing"),
  ]

  private static let name = "Breadcrumb"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("two levels", expect: ["label": Self.name]) {
        PMBreadcrumbs(props: PMBreadcrumbsProps(items: Self.two))
      },
      PMStateEntry("four levels — no overflow yet") {
        PMBreadcrumbs(props: PMBreadcrumbsProps(items: Self.four))
      },
      PMStateEntry("collapsed — the first crumb, the overflow, and the last two") {
        PMBreadcrumbs(props: PMBreadcrumbsProps(items: Self.six))
      },
      PMStateEntry(
        "overflow open — the hidden crumbs in the menu", expect: ["contains": "Menu[part=panel]"]
      ) {
        BreadcrumbsOverflowOpen(items: Self.six)
      },
      PMStateEntry("collapsing disabled — the whole path, however long") {
        PMBreadcrumbs(props: PMBreadcrumbsProps(items: Self.six, maxItems: .infinity))
      },
      PMStateEntry("long labels — clipped, so the trail stays one line") {
        PMBreadcrumbs(props: PMBreadcrumbsProps(items: Self.long))
      },
      PMStateEntry("routed by the app, and a section with no page of its own") {
        PMBreadcrumbs(props: PMBreadcrumbsProps(items: Self.routed))
      },
      PMStateEntry("localized", expect: ["label": "Fil d’Ariane"]) {
        PMBreadcrumbs(
          props: PMBreadcrumbsProps(
            items: Self.six, label: "Fil d’Ariane", overflowLabel: "Afficher le chemin"))
      },
    ]
  }
}

/// The trail with its overflow open, as the fixture draws it: the trail, and
/// Menu's panel of the hidden crumbs on its surface under the trigger, both
/// inside one Breadcrumbs root, because the panel is the trail's.
private struct BreadcrumbsOverflowOpen: View {
  @Environment(\.pmTheme) private var theme
  let items: [PMBreadcrumbItem]

  var body: some View {
    let hidden = items.dropFirst().dropLast(2)
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s1) {
      PMBreadcrumbs(props: PMBreadcrumbsProps(defaultOpen: true, items: items))
      PMMenuPanel(
        entries: hidden.map { .item(PMMenuItemEntry(label: $0.label, onSelect: {})) },
        framed: true, close: {}
      )
      .fixedSize()
    }
    .accessibilityElement(children: .contain)
    .pmMember("Breadcrumbs")
  }
}
