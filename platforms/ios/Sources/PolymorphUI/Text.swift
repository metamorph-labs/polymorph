// Text (`design/components/text.md`): a paragraph of body text, at `text.md` or
// `text.sm`, in the primary or the secondary tone. Never below secondary: muted
// text is a caption, which the member that owns it draws.
//
// `children` is `PMContent`, so the paragraph is whatever view the app passes,
// usually a SwiftUI `Text`; the member sets the step and the tone on it through
// the environment. Inline emphasis is the app's `**strong**` (Markdown in a
// `Text`) or `.bold()` on a run, drawn at the family's bold weight in the
// paragraph's tone. The web's `strong` cell (the `text.xl` weight and the
// primary colour in any tone) cannot reach a run inside an opaque view, so it
// is not drawn.
//
// `lines` is the line limit of the text the app passes, with the tail
// truncated. A screen reader still reads the whole text.

import PolymorphTokens
import SwiftUI

public struct PMText: PMTextRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMTextProps

  public init(props: PMTextProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let tone = props.tone ?? .primary
    let style = size == .sm ? theme.text.sm : theme.text.md
    let color = tone == .secondary ? theme.colors.textSecondary : theme.colors.textPrimary
    // A count that is not whole reads as the whole number below it; below 1 nothing is cut.
    let kept = props.lines.map { $0.rounded(.down) }.flatMap { $0 >= 1 && $0.isFinite ? Int($0) : nil }
    var attributes = ["size": size.rawValue, "tone": tone.rawValue]
    if let kept { attributes["lines"] = String(kept) }

    return props.children
      .pmTextStyle(style)
      .foregroundStyle(color.color)
      .multilineTextAlignment(.leading)
      // A paragraph wraps and never grows sideways; with `lines` it stops at
      // that many and ends the last with an ellipsis.
      .lineLimit(kept)
      .truncationMode(.tail)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isStaticText)
      .pmMember("Text", attributes)
  }
}

/// Text's states, from the spec's States table.
public struct TextStates: PMStates {
  public let member = "Text"

  public init() {}

  private static let body = "Replies reach the customer by email and stay in the ticket."
  private static let note = "Only admins can change billing."
  private static let emphasis = "Drafts are **kept** until you send them."
  private static let long =
    "Replies reach the customer by email, stay in the ticket’s history, and are searchable by "
    + "everyone who can open the ticket in this workspace."
  private static let paragraph =
    "A pairing is two JSON files: a system’s eight axes and fonts, and a palette’s handful of "
    + "colour seeds. The engine derives every role from them, checks each text role against "
    + "each surface it can sit on, and refuses a pairing that fails. A redesign is an edit to "
    + "one of the two files, and every screen follows it."

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("body", expect: ["size": "md", "tone": "primary", "label": Self.body]) {
        PMText(props: PMTextProps(children: AnyView(Text(Self.body))))
      },
      PMStateEntry("secondary sm", expect: ["size": "sm", "tone": "secondary", "label": Self.note]) {
        PMText(
          props: PMTextProps(children: AnyView(Text(Self.note)), size: .sm, tone: .secondary))
      },
      PMStateEntry("with emphasis", expect: ["size": "md", "tone": "primary"]) {
        PMText(props: PMTextProps(children: AnyView(Text(LocalizedStringKey(Self.emphasis)))))
      },
      PMStateEntry("one line", expect: ["lines": "1", "label": Self.long]) {
        PMText(props: PMTextProps(children: AnyView(Text(Self.long)), lines: 1))
      },
      PMStateEntry("three lines", expect: ["lines": "3", "label": Self.paragraph]) {
        PMText(
          props: PMTextProps(
            children: AnyView(Text(Self.paragraph)), lines: 3, size: .sm, tone: .secondary))
      },
    ]
  }
}
