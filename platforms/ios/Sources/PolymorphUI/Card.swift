// Card (`design/components/card.md`): a bounded surface that groups related
// content. No variants: depth is the pairing's axis, so the shadow comes from
// the theme (`none` on a flat system, where the hairline border does the
// work), and the border is drawn at every depth. Cards do not nest.
//
// The interactive card navigates only. With `href`, a pressable layer covers
// the surface: one element named by `label` with the link trait, opening the
// URL through the environment's `openURL`, so the app decides where it goes.
// Given `onNavigate`, a press calls it with `href` in place of opening it, as
// Link does (`link.md` §Routing), so an app's router takes the card. The
// card's own content stays readable element by element beside it, as the web
// keeps it out of the link's name. Pressing it raises the shadow one step and
// strengthens the border, the web's hover; on a flat system the border is the
// whole change.
//
// `title` is the card's one heading, before the content: the section-heading
// recipe Dashboard.Panel's title uses (`text.xs` uppercase in the secondary
// colour, `space.4` above the content), spoken as written, a header at
// `headingLevel` (2 by default) for VoiceOver's headings rotor. The level
// changes the outline, never the look.
//
// `patch` is the instance patch, rung 3 of the exception ladder: a space step
// for the padding (`px` and `py` over `p`, as on Stack) and a radius step,
// each in place of the surface's own.

import PolymorphTokens
import SwiftUI

public struct PMCard: PMCardRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.openURL) private var openURL
  @State private var pressed = false
  private let props: PMCardProps

  public init(props: PMCardProps) {
    self.props = props
  }

  public var body: some View {
    let patch = props.patch
    let shape = RoundedRectangle(
      cornerRadius: patch?.radius.map { radius($0) } ?? theme.radius.surface)
    let link = props.href.flatMap(URL.init(string:))
    let interactive = link != nil
    let raised = interactive && pressed
    let motion = theme.defaultMotion
    let space = theme.defaultDensity.space
    let inset = theme.defaultDensity.inset.surface
    let spacing = PMSpacing(p: patch?.p, px: patch?.px, py: patch?.py)
    var attributes = spacing.attributes
    attributes["as"] = (props.as ?? .div).rawValue
    if interactive { attributes["interactive"] = "true" }
    if let radius = patch?.radius { attributes["radius"] = radius.rawValue }
    if patch != nil { attributes["patched"] = "true" }
    if props.title != nil {
      attributes["headingLevel"] = String((props.headingLevel ?? .headingLevel2).rawValue)
    }
    let horizontal = (spacing.px ?? spacing.p).map { space[$0] } ?? inset
    let vertical = (spacing.py ?? spacing.p).map { space[$0] } ?? inset

    return content
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .padding(.horizontal, horizontal)
      .padding(.vertical, vertical)
      .background(theme.colors.bgSurface.color, in: shape)
      .overlay {
        shape.strokeBorder(
          (raised ? theme.colors.borderDefault : theme.colors.borderSubtle).color, lineWidth: 1)
      }
      .pmInsetShadow(theme.insetTop, in: shape)
      .pmShadow(raised ? theme.shadows.transient : theme.shadows.resting)
      .overlay {
        if let link {
          Button {
            if let onNavigate = props.onNavigate, let href = props.href {
              onNavigate(href)
            } else {
              openURL(link)
            }
          } label: {
            shape.fill(.clear).contentShape(shape)
          }
          .buttonStyle(PMCardPress(pressed: $pressed))
          .accessibilityLabel(Text(props.label ?? props.href ?? ""))
          .accessibilityRemoveTraits(.isButton)
          .accessibilityAddTraits(.isLink)
        }
      }
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control), value: raised
      )
      .accessibilityElement(children: .contain)
      .pmMember("Card", attributes)
  }
}

extension PMCard {
  /// The children, under the title when there is one.
  @ViewBuilder private var content: some View {
    if let title = props.title {
      VStack(alignment: .leading, spacing: theme.defaultDensity.space.s4) {
        // The uppercase is drawn only: the title is spoken as written.
        Text(title)
          .textCase(.uppercase)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(theme.colors.textSecondary.color)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityLabel(Text(title))
          .accessibilityAddTraits(.isHeader)
          .accessibilityHeading(heading(props.headingLevel ?? .headingLevel2))
        props.children
      }
    } else {
      props.children ?? AnyView(EmptyView())
    }
  }

  /// The heading level VoiceOver reads for the title.
  private func heading(_ level: PMCardHeadingLevel) -> AccessibilityHeadingLevel {
    switch level {
    case .headingLevel2: .h2
    case .headingLevel3: .h3
    case .headingLevel4: .h4
    }
  }

  /// A radius step's length.
  private func radius(_ step: PMRadiusStep) -> CGFloat {
    switch step {
    case .none: theme.radius.none
    case .sm: theme.radius.sm
    case .md: theme.radius.md
    case .lg: theme.radius.lg
    case .pill: theme.radius.pill
    }
  }
}

/// Reports the covering button's pressed state to the card, which draws it on
/// the whole surface rather than on the transparent layer.
private struct PMCardPress: ButtonStyle {
  @Binding var pressed: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .onChange(of: configuration.isPressed) { _, isPressed in pressed = isPressed }
  }
}

/// Card's states, from the spec's States table.
public struct CardStates: PMStates {
  public let member = "Card"

  public init() {}

  private static let title = "Billing"
  private static let body = "Invoices, payment methods and the plan this workspace is on."
  private static let href = "https://example.com/settings/billing"
  private static let label = "Open billing settings"

  /// The content without its own heading, for a titled card, which has one.
  private func prose() -> PMContent {
    AnyView(
      PMText(props: PMTextProps(children: AnyView(Text(Self.body)), size: .sm, tone: .secondary)))
  }

  private func content() -> PMContent {
    AnyView(
      PMStack(
        props: PMStackProps(
          children: AnyView(
            Group {
              PMHeading(props: PMHeadingProps(children: Self.title, level: .level3))
              PMText(
                props: PMTextProps(children: AnyView(Text(Self.body)), size: .sm, tone: .secondary))
            }),
          gap: .s2)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("default", expect: ["as": "div"]) {
        PMCard(props: PMCardProps(children: content()))
      },
      PMStateEntry("patched padding", expect: ["p": "4", "patched": "true"]) {
        PMCard(props: PMCardProps(children: content(), patch: PMCardPatch(p: .s4)))
      },
      PMStateEntry("patched radius", expect: ["radius": "sm", "patched": "true"]) {
        PMCard(props: PMCardProps(children: content(), patch: PMCardPatch(radius: .sm)))
      },
      PMStateEntry("as section", expect: ["as": "section"]) {
        PMCard(props: PMCardProps(as: .section, children: content()))
      },
      PMStateEntry("titled", expect: ["as": "div", "headingLevel": "2"]) {
        PMCard(props: PMCardProps(children: prose(), title: Self.title))
      },
      PMStateEntry("titled section, level 3", expect: ["as": "section", "headingLevel": "3"]) {
        PMCard(
          props: PMCardProps(
            as: .section, children: prose(), headingLevel: .headingLevel3, title: Self.title))
      },
      PMStateEntry("linked", expect: ["as": "div", "interactive": "true"]) {
        PMCard(props: PMCardProps(children: content(), href: Self.href, label: Self.label))
      },
    ]
  }
}
