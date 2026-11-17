// Heading (`design/components/heading.md`): a section heading at level 2, 3 or
// 4. Never level 1: PageHeader owns the page's title, so the type cannot ask for
// another. Level 2 is `text.xl`, level 3 `text.lg`; level 4 is `text.md` at the
// `text.xl` weight, because below `text.lg` the sizes are body sizes and weight
// marks the level. No margins: the Stack around it owns the rhythm.
//
// On iOS a heading is a header trait with its level, so VoiceOver's headings
// rotor lists it at the level the web's `<h2>`–`<h4>` give.

import PolymorphTokens
import SwiftUI

public struct PMHeading: PMHeadingRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMHeadingProps

  public init(props: PMHeadingProps) {
    self.props = props
  }

  public var body: some View {
    let level = props.level ?? .level2

    Text(props.children)
      .pmTextStyle(style(level))
      .foregroundStyle(theme.colors.textPrimary.color)
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
      .accessibilityHeading(heading(level))
      .pmMember("Heading", ["level": String(level.rawValue)])
  }

  private func style(_ level: PMHeadingLevel) -> PMTextStyle {
    switch level {
    case .level2: theme.text.xl
    case .level3: theme.text.lg
    case .level4: theme.text.md.weighted(like: theme.text.xl)
    }
  }

  private func heading(_ level: PMHeadingLevel) -> AccessibilityHeadingLevel {
    switch level {
    case .level2: .h2
    case .level3: .h3
    case .level4: .h4
    }
  }
}

extension PMTextStyle {
  /// This step with another step's weight: the type scale owns both values, so
  /// a weight that marks a level is still one the scale decided.
  func weighted(like other: PMTextStyle) -> PMTextStyle {
    PMTextStyle(
      size: size, lineHeight: lineHeight, wght: other.wght, tracking: tracking, family: family,
      fallback: fallback, italic: italic, opsz: opsz)
  }
}

/// Heading's states, from the spec's States table: one entry per level.
public struct HeadingStates: PMStates {
  public let member = "Heading"

  public init() {}

  private static let section = "Members"
  private static let subsection = "Invited"
  private static let subSubsection = "By email"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("section heading", expect: ["level": "2", "label": Self.section]) {
        PMHeading(props: PMHeadingProps(children: Self.section))
      },
      PMStateEntry("subsection", expect: ["level": "3", "label": Self.subsection]) {
        PMHeading(props: PMHeadingProps(children: Self.subsection, level: .level3))
      },
      PMStateEntry("sub-subsection", expect: ["level": "4", "label": Self.subSubsection]) {
        PMHeading(props: PMHeadingProps(children: Self.subSubsection, level: .level4))
      },
    ]
  }
}
