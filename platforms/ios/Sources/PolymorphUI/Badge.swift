// Badge (`design/components/badge.md`): a read-only micro-label for status and
// category, never pressable. The system's overline style: uppercase `text.xs`,
// emphasis from case and tracking, never an invented weight. Every variant works
// with every tone: a badge has no interactive states, so Button's "no neutral
// fill" rule does not apply, and the contract has no grid to narrow.
//
// Two forms take the text's place. A count draws its number, capped at `max`
// and followed by `+` past it, and draws nothing at zero. A dot is a round mark
// in the tone's solid fill, read as its `children`, or hidden from assistive
// technology when it has none.

import PolymorphTokens
import SwiftUI

public struct PMBadge: PMBadgeRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMBadgeProps

  public init(props: PMBadgeProps) {
    self.props = props
  }

  public var body: some View {
    let variant = props.variant ?? .soft
    let tone = props.tone ?? .neutral
    let recipe = BadgeRecipe(variant: variant, tone: tone, colors: theme.colors)
    let attributes = ["tone": tone.rawValue, "variant": variant.rawValue]

    if let count = props.count {
      // `count > 0` is false for `nan` too: zero, less, or no number draws nothing.
      if count > 0 {
        let shown = Self.countText(count, max: props.max ?? PMSpecDefault.badgeMax)
        let shape = RoundedRectangle(cornerRadius: theme.radius.detail)
        let space = theme.defaultDensity.space
        // As tall as the step's size and `space.2`, not a whole line: figures
        // and a plus sign have no descenders. Never narrower than it is tall.
        let side = theme.text.xs.size + space.s2
        Text(shown)
          .monospacedDigit()
          .pmTextStyle(theme.text.xs)
          .lineLimit(1)
          .fixedSize()
          .foregroundStyle(recipe.text.color)
          .padding(.horizontal, space.s1)
          .frame(minWidth: side)
          .frame(height: side)
          .background(recipe.fill?.color ?? .clear, in: shape)
          .overlay { shape.strokeBorder(recipe.border?.color ?? .clear, lineWidth: 1) }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(shown))
          .accessibilityAddTraits(.isStaticText)
          .pmMember("Badge", attributes.merging(["count": shown]) { $1 })
      }
    } else if props.dot == true {
      let side = theme.defaultDensity.space.s3
      let words = props.children ?? ""
      Circle()
        .fill(Self.dotFill(tone, colors: theme.colors).color)
        .frame(width: side, height: side)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(words))
        .accessibilityAddTraits(.isStaticText)
        .accessibilityHidden(words.isEmpty)
        .pmMember("Badge", attributes.merging(["dot": "true"]) { $1 })
    } else {
      let space = theme.defaultDensity.space
      let shape = RoundedRectangle(cornerRadius: theme.radius.detail)
      let words = props.children ?? ""
      HStack(spacing: space.s1) {
        if let icon = props.icon {
          PMIconView(icon, size: .sm)
        }
        Text(words)
          .textCase(.uppercase)
      }
      .pmTextStyle(theme.text.xs)
      .lineLimit(1)
      .fixedSize()
      .foregroundStyle(recipe.text.color)
      .padding(.vertical, space.s1)
      .padding(.horizontal, space.s3)
      .background(recipe.fill?.color ?? .clear, in: shape)
      // The web draws a transparent hairline on every variant, so the three are
      // one size; `strokeBorder` draws inside the shape and changes no size.
      .overlay { shape.strokeBorder(recipe.border?.color ?? .clear, lineWidth: 1) }
      // One element, spoken as written: `textCase` would hand assistive
      // technology the uppercase it draws, which may be read letter by letter.
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(words))
      .accessibilityAddTraits(.isStaticText)
      .pmMember("Badge", attributes)
    }
  }

  /// The count as drawn: the number as the web writes it, with no grouping,
  /// or the cap and a plus sign past it.
  static func countText(_ count: Double, max: Double = PMSpecDefault.badgeMax) -> String {
    let written = { (value: Double) in Int(exactly: value).map(String.init) ?? String(value) }
    return count > max ? written(max) + "+" : written(count)
  }

  /// The dot's fill: the tone's solid colour, whatever the variant, because a
  /// soft or an outline fill is too faint to be seen as a mark of its own.
  static func dotFill(_ tone: PMBadgeTone, colors c: PMColors) -> PMDynamicColor {
    switch tone {
    case .neutral: c.bgInverse
    case .accent: c.accentBg
    case .danger: c.dangerSolid
    case .warning: c.warningSolid
    case .success: c.successSolid
    case .info: c.infoSolid
    }
  }
}

/// The eighteen cells, written out rather than derived, so each can be read
/// beside the spec's recipe tables.
private struct BadgeRecipe {
  let text: PMDynamicColor
  let fill: PMDynamicColor?
  let border: PMDynamicColor?

  init(variant: PMBadgeVariant, tone: PMBadgeTone, colors c: PMColors) {
    switch (variant, tone) {
    case (.soft, .neutral): (text, fill, border) = (c.textSecondary, c.bgSubtle, nil)
    case (.soft, .accent): (text, fill, border) = (c.accentText, c.accentSubtle, nil)
    case (.soft, .danger): (text, fill, border) = (c.dangerText, c.dangerSubtle, nil)
    case (.soft, .warning): (text, fill, border) = (c.warningText, c.warningSubtle, nil)
    case (.soft, .success): (text, fill, border) = (c.successText, c.successSubtle, nil)
    case (.soft, .info): (text, fill, border) = (c.infoText, c.infoSubtle, nil)

    case (.solid, .neutral): (text, fill, border) = (c.textInverse, c.bgInverse, nil)
    case (.solid, .accent): (text, fill, border) = (c.accentContrast, c.accentBg, nil)
    case (.solid, .danger): (text, fill, border) = (c.dangerContrast, c.dangerSolid, nil)
    case (.solid, .warning): (text, fill, border) = (c.warningContrast, c.warningSolid, nil)
    case (.solid, .success): (text, fill, border) = (c.successContrast, c.successSolid, nil)
    case (.solid, .info): (text, fill, border) = (c.infoContrast, c.infoSolid, nil)

    case (.outline, .neutral): (text, fill, border) = (c.textSecondary, nil, c.borderDefault)
    case (.outline, .accent): (text, fill, border) = (c.accentText, nil, c.accentBg)
    case (.outline, .danger): (text, fill, border) = (c.dangerText, nil, c.dangerBorder)
    case (.outline, .warning): (text, fill, border) = (c.warningText, nil, c.warningBorder)
    case (.outline, .success): (text, fill, border) = (c.successText, nil, c.successBorder)
    case (.outline, .info): (text, fill, border) = (c.infoText, nil, c.infoBorder)
    }
  }
}

/// Badge's states, from the spec's States table: every variant × tone cell (all
/// eighteen are lawful), and the leading icon.
public struct BadgeStates: PMStates {
  public let member = "Badge"

  public init() {}

  public var entries: [PMStateEntry] {
    let cells = PMBadgeVariant.allCases.flatMap { variant in
      PMBadgeTone.allCases.map { tone in
        PMStateEntry(
          "\(variant.rawValue) / \(tone.rawValue)",
          expect: ["variant": variant.rawValue, "tone": tone.rawValue, "label": "Active"]
        ) {
          PMBadge(props: PMBadgeProps(children: "Active", tone: tone, variant: variant))
        }
      }
    }
    let icon = PMStateEntry(
      "with an icon",
      expect: ["variant": "soft", "tone": "neutral", "label": "Waiting"]
    ) {
      PMBadge(props: PMBadgeProps(children: "Waiting", icon: .time))
    }
    let count = PMStateEntry(
      "a count", expect: ["variant": "solid", "tone": "accent", "count": "3", "label": "3"]
    ) {
      PMBadge(props: PMBadgeProps(count: 3, tone: .accent, variant: .solid))
    }
    let capped = PMStateEntry(
      "a count past its cap",
      expect: ["variant": "solid", "tone": "accent", "count": "99+", "label": "99+"]
    ) {
      PMBadge(props: PMBadgeProps(count: 128, tone: .accent, variant: .solid))
    }
    let dot = PMStateEntry("a dot", expect: ["tone": "accent", "dot": "true", "label": "New"]) {
      PMBadge(props: PMBadgeProps(children: "New", dot: true, tone: .accent))
    }
    let dots = PMStateEntry("a dot in every tone", expect: ["dot": "true"]) { DotsOfEveryTone() }
    return cells + [icon, count, capped, dot, dots]
  }
}

/// A dot in each of the six tones, in a row.
private struct DotsOfEveryTone: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      ForEach(PMBadgeTone.allCases, id: \.self) { tone in
        PMBadge(props: PMBadgeProps(children: tone.rawValue, dot: true, tone: tone))
      }
    }
  }
}
