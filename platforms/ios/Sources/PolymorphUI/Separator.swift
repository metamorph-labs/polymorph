// Separator (`design/components/separator.md`): a drawn line between content
// that spacing alone cannot separate. No margins: the gap of the Stack or
// Inline around it owns the spacing, so adding a line never changes it. The
// line is the recipe's `1px` hairline in `border.subtle`, one point thick
// (`PMRule`); vertical, it stretches to the height of the Inline row it
// divides, as the web's `align-self: stretch` does.
//
// Decorative by default, so hidden from assistive technology. A labelled
// separator is horizontal only (a vertical one ignores the label) and is read:
// the word is content, the rules either side stay silent.

import PolymorphTokens
import SwiftUI

public struct PMSeparator: PMSeparatorRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMSeparatorProps

  public init(props: PMSeparatorProps) {
    self.props = props
  }

  public var body: some View {
    let orientation = props.orientation ?? .horizontal
    let member = ["orientation": orientation.rawValue]

    if let label = props.label, orientation == .horizontal {
      HStack(spacing: theme.defaultDensity.space.s3) {
        rule(.horizontal)
        Text(label)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(theme.colors.textMuted.color)
          .fixedSize()
        rule(.horizontal)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(label))
      .accessibilityAddTraits(.isStaticText)
      .pmMember("Separator", member)
    } else {
      rule(orientation)
        .layoutValue(key: PMStretchesInRow.self, value: orientation == .vertical)
        .accessibilityHidden(true)
        .pmMember("Separator", member)
    }
  }

  /// The hairline along `orientation`.
  private func rule(_ orientation: PMSeparatorOrientation) -> some View {
    PMRule(theme.colors.borderSubtle, axis: orientation == .vertical ? .vertical : .horizontal)
  }
}

/// Separator's states, from the spec: horizontal, vertical, and labelled. The
/// two decorative entries expose nothing to accessibility, which `hidden`
/// tells the harness.
public struct SeparatorStates: PMStates {
  public let member = "Separator"

  public init() {}

  private static let or = "OR"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("horizontal", expect: ["hidden": "true"]) {
        PMSeparator(props: PMSeparatorProps())
      },
      PMStateEntry("vertical", expect: ["hidden": "true"]) {
        PMSeparator(props: PMSeparatorProps(orientation: .vertical))
      },
      PMStateEntry("labelled", expect: ["orientation": "horizontal", "label": Self.or]) {
        PMSeparator(props: PMSeparatorProps(label: Self.or))
      },
    ]
  }
}
