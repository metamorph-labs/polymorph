// Code (`design/components/code.md`): inline code, such as a token name, a flag
// or a path, in the mono face on the subtle wash. The size is `text.sm`
// whatever the text around it, so a screen has one mono size rather than two a
// step apart. Padding is on the horizontal axis only, as on the web, where
// vertical padding would push apart the lines of the paragraph it sits in.
//
// A view cannot flow inside a wrapped paragraph, so Code sits beside text in a
// row, in a table cell or a settings row; prose with code in it is Markdown's,
// which sets its code spans in the same face, size and wash.

import PolymorphTokens
import SwiftUI

public struct PMCode: PMCodeRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMCodeProps

  public init(props: PMCodeProps) {
    self.props = props
  }

  public var body: some View {
    Text(props.children)
      .pmTextStyle(theme.text.sm.set(in: theme.fonts.mono))
      .foregroundStyle(theme.colors.textPrimary.color)
      .padding(.horizontal, theme.defaultDensity.space.s1)
      .background(
        theme.colors.bgSubtle.color, in: RoundedRectangle(cornerRadius: theme.radius.sm))
      // The code as written: a real `<code>` on the web is read as its text.
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(props.children))
      .accessibilityAddTraits(.isStaticText)
      .pmMember("Code")
  }
}

/// Code's states, from the spec's States table: the chip after text, the same
/// size beside smaller text, and several chips in a row.
public struct CodeStates: PMStates {
  public let member = "Code"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("inline", expect: ["label": "pm-system"]) {
        CodeBeside(lead: "Set", code: ["pm-system"], size: .md)
      },
      PMStateEntry(
        "one mono size, whatever the text around it", expect: ["label": "pnpm registry"]
      ) {
        CodeBeside(lead: "Run", code: ["pnpm registry"], size: .sm)
      },
      PMStateEntry("several in a row", expect: ["label": "data-system"]) {
        CodeBeside(lead: "Wear", code: ["data-system", "data-palette"], size: .md)
      },
    ]
  }
}

/// Text and then code, on one line: the fixture's stand-in for a sentence. The
/// text is scenery, hidden from accessibility, so the entry's first element is
/// the chip.
private struct CodeBeside: View {
  @Environment(\.pmTheme) private var theme
  let lead: String
  let code: [String]
  let size: PMTextSize

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s2) {
      PMText(props: PMTextProps(children: AnyView(Text(lead)), size: size))
        .accessibilityHidden(true)
      ForEach(code, id: \.self) { PMCode(props: PMCodeProps(children: $0)) }
    }
  }
}
