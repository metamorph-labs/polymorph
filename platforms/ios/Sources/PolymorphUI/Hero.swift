// Hero (`design/components/hero.md`): the block that opens an introducing
// page, where a working screen has PageHeader. A page has one of the two,
// never both: the title is the page's one top-level heading. No size, tone or
// background: a quieter Hero is a PageHeader.
//
// A column `space.5` apart, with `space.8` above it and `space.7` below,
// because a display block brings its own room: the title in the display
// family's `display.lg`, in `text.primary`; the lede in `text.lg`, secondary;
// the actions, the app's Buttons, in a wrapping Inline `space.3` apart.
// `center` centres the text and the actions. In a Hero narrower than 26rem, as
// on a phone, the title takes the whole `display.md` step instead: the Hero's
// own width decides, not the screen's, because a Hero in a narrow column needs
// the smaller step on any device. A word wider than the line breaks rather
// than being cut off, as SwiftUI's text does.
//
// The title has the header trait at level 1. No motion: a hero stands still.

import PolymorphTokens
import SwiftUI

public struct PMHero: PMHeroRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMHeroProps

  public init(props: PMHeroProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let align = props.align ?? .start
    let centred = align == .center
    let edge: Alignment = centred ? .center : .leading
    let narrow = PMRecipe.heroNarrowBelow

    VStack(alignment: centred ? .center : .leading, spacing: space.s5) {
      // The display step for the Hero's width: `display.lg` from 26rem up,
      // `display.md` below. The wide candidate asks for exactly 26rem, so it
      // fits only when the Hero is at least that wide, then takes the width.
      ViewThatFits(in: .horizontal) {
        title(theme.display.lg)
          .frame(minWidth: narrow, idealWidth: narrow, maxWidth: .infinity, alignment: edge)
        title(theme.display.md)
          .frame(maxWidth: .infinity, alignment: edge)
      }
      if let lede = props.lede {
        Text(lede)
          .pmTextStyle(theme.text.lg)
          .foregroundStyle(theme.colors.textSecondary.color)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: edge)
      }
      if let actions = props.actions {
        PMInline(
          props: PMInlineProps(
            children: actions, gap: .s3, justify: centred ? .center : .start, wrap: true))
      }
    }
    .multilineTextAlignment(centred ? .center : .leading)
    .frame(maxWidth: .infinity, alignment: edge)
    .padding(.top, space.s8)
    .padding(.bottom, space.s7)
    .accessibilityElement(children: .contain)
    .pmMember("Hero", ["align": align.rawValue])
  }

  private func title(_ step: PMTextStyle) -> some View {
    Text(props.title)
      .pmTextStyle(step)
      .foregroundStyle(theme.colors.textPrimary.color)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
      .accessibilityHeading(.h1)
  }
}

/// Hero's states, from the spec's States table, and the wide title: a Hero at
/// least 26rem wide, laid out at an iPad's width and scaled to the canvas.
public struct HeroStates: PMStates {
  public let member = "Hero"

  public init() {}

  private static let title = "One vocabulary. Any number of faces."
  private static let lede =
    "Every design decision is made exactly once, referenced everywhere, verified by law, and "
    + "safely changeable — by people and by agents."
  private static let browse = "Browse components"
  private static let brief = "Read the brief"


  private static var primary: PMContent {
    AnyView(PMButton(props: PMButtonProps(label: browse)))
  }

  private static var both: PMContent {
    AnyView(
      Group {
        PMButton(props: PMButtonProps(label: browse))
        PMButton(props: PMButtonProps(label: brief, appearance: .ghostNeutral))
      })
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("opening moment", expect: ["align": "start"]) {
        PMHero(props: PMHeroProps(actions: Self.primary, lede: Self.lede, title: Self.title))
      },
      PMStateEntry("centered", expect: ["align": "center"]) {
        PMHero(
          props: PMHeroProps(
            actions: Self.both, align: .center, lede: Self.lede, title: Self.title))
      },
      PMStateEntry("title alone", expect: ["align": "start"]) {
        PMHero(props: PMHeroProps(title: Self.title))
      },
      PMStateEntry("a wide Hero — display.lg", expect: ["align": "start"]) {
        PMHero(props: PMHeroProps(actions: Self.primary, lede: Self.lede, title: Self.title))
          .pmFixtureWidth(PMFixtureWindow.narrowIPad)
      },
    ]
  }
}
