// Bespoke (rung 4 of the exception ladder, `docs/rules.md`): a declared zone
// for what the vocabulary does not cover. On the web it is a `display:
// contents` wrapper that carries its `reason`, draws nothing and lets every
// token cascade in. Here it is its children as they are, under the same theme,
// and draws nothing of its own: the zone is a declaration, and the work inside
// it still reads the theme and keeps every accessibility law.
//
// `reason` is for a reviewer reading the inventory, not for a person using the
// screen, so it is not spoken. The member's identifier carries no attributes,
// because an identifier's values hold no spaces and a reason is a sentence.

import PolymorphTokens
import SwiftUI

public struct PMBespoke: PMBespokeRendering {
  private let props: PMBespokeProps

  public init(props: PMBespokeProps) {
    self.props = props
  }

  public var body: some View {
    Group {
      if let children = props.children { children }
    }
    .accessibilityElement(children: .contain)
    .pmMember("Bespoke")
  }
}

/// Bespoke's states: a zone around work the vocabulary has no member for,
/// drawn from the theme's tokens.
public struct BespokeStates: PMStates {
  public let member = "Bespoke"

  public init() {}

  private static let reason =
    "Promo illustration: overlapping discs the vocabulary has no shape primitive for."

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("a zone with its reason", expect: ["contains": "Badge"]) {
        PMBespoke(props: PMBespokeProps(children: PMContent(BespokeSample()), reason: Self.reason))
      }
    ]
  }
}

/// Overlapping discs in the accent roles, beside a Badge the zone composes.
private struct BespokeSample: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    let side = theme.defaultDensity.space.s10
    // The second disc covers half the first.
    let overlap = side / 2
    HStack(spacing: theme.defaultDensity.space.s4) {
      ZStack(alignment: .leading) {
        Circle().fill(theme.colors.accentSubtle.color).frame(width: side, height: side)
        Circle().fill(theme.colors.accentBg.color).frame(width: side, height: side)
          .offset(x: overlap)
      }
      .frame(width: side + overlap, alignment: .leading)
      .accessibilityHidden(true)
      PMBadge(props: PMBadgeProps(children: "New", tone: .accent))
    }
  }
}
