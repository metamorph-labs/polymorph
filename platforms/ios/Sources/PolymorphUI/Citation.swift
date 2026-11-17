// Citation (`design/components/citation.md`): the numbered mark after a
// sentence, a link to the source the sentence rests on. Adapted on iOS: a
// plain link, with no hover preview, because touch has no hover; the preview
// held nothing the destination does not, so nothing is lost but a quick look.
//
// The mark is Badge's soft/accent cell as a link: `text.xs` in `accent.text`
// on `accent.subtle`, `radius.detail`, at least as wide as it is tall so `1`
// and `12` are the same kind of mark, `space-1` off the sentence. Under the
// pointer and while pressed the wash moves one step, to `accent.subtle.hover`,
// on `stateFeedback`, with press feedback. The hit area reaches the hit target
// past the mark's edges without taking room in the row, so two marks sit
// `space-1` apart, as on the web; where their areas overlap, the later mark
// takes the touch.
// A SwiftUI `Link`, so it opens `href` through the environment's `openURL`,
// as Link does. The spoken name is "{index}. {title}", so a list of marks is
// not a list of bare numbers. An `href` that is not a URL draws the mark
// alone, because a link that cannot be followed is not drawn as one.
//
// A view cannot flow inside a wrapped paragraph, so a mark sits after a
// sentence in a row; a reply's prose with its marks is Markdown's, which
// draws each `[n]` as this link.

import PolymorphTokens
import SwiftUI

public struct PMCitation: PMCitationRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMCitationProps

  public init(props: PMCitationProps) {
    self.props = props
  }

  public var body: some View {
    let number = String(Int(props.index))
    let name = "\(number). \(props.source.title)"

    Group {
      if let url = URL(string: props.source.href) {
        Link(destination: url) { Text(number) }
          .buttonStyle(PMCitationMarkStyle())
          .accessibilityLabel(Text(name))
      } else {
        PMCitationMark(pressed: false) { Text(number) }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(name))
      }
    }
    .padding(.leading, theme.defaultDensity.space.s1)
    .pmMember("Citation")
  }
}

private struct PMCitationMarkStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    PMCitationMark(pressed: configuration.isPressed) { configuration.label }
  }
}

/// The mark: the number on the accent wash, one step up under the pointer and
/// while pressed.
private struct PMCitationMark<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let active = hovering || pressed

    PMAtLeastSquare {
      label()
        .pmTextStyle(theme.text.xs)
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, theme.defaultDensity.space.s1)
    }
    .foregroundStyle(colors.accentText.color)
    .background(
      (active ? colors.accentSubtleHover : colors.accentSubtle).color,
      in: RoundedRectangle(cornerRadius: theme.radius.detail)
    )
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
    .pmPressFeedback(pressed)
    .onHover { hovering = $0 }
    .pmHitTargetOutset()
  }
}

/// Citation's states, from the spec's States table. Each mark follows a
/// sentence; the sentence is scenery, hidden from accessibility, so the
/// entry's first element is the mark.
public struct CitationStates: PMStates {
  public let member = "Citation"

  public init() {}

  static let retry = PMCitationSource(
    title: "Webhook delivery and retries", href: "https://docs.example.org/webhooks/retries",
    domain: "docs.example.org",
    snippet:
      "Deliveries are retried with exponential backoff, up to five attempts, with the original "
      + "idempotency key on every attempt.")

  static let bare = PMCitationSource(
    title: "Idempotency keys", href: "https://docs.example.org/idempotency")

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "in a sentence — the mark after the claim it supports",
        expect: ["label": "1. Webhook delivery and retries"]
      ) {
        CitationAfter(
          sentence: "Retries carry the original idempotency key.",
          marks: [(1, Self.retry)])
      },
      PMStateEntry(
        "two marks — the numbers are the SourceList’s",
        expect: ["label": "1. Webhook delivery and retries"]
      ) {
        CitationAfter(
          sentence: "The schedule is exponential and the key is the same.",
          marks: [(1, Self.retry), (2, Self.bare)])
      },
      PMStateEntry(
        "a two-digit mark — the same square, wider", expect: ["label": "11. Idempotency keys"]
      ) {
        CitationAfter(
          sentence: "Eleven sources in, the mark still reads as one.", marks: [(11, Self.bare)])
      },
      PMStateEntry("an href that is not a URL — the mark alone", expect: ["label": "3. Notes"]) {
        CitationAfter(
          sentence: "The source has no address.",
          marks: [(3, PMCitationSource(title: "Notes", href: ""))])
      },
    ]
  }
}

/// A sentence and the marks after it, on the sentence's first baseline. The
/// web sets a mark at the top of the line it sits in; a row of views aligns
/// it by its text instead.
private struct CitationAfter: View {
  let sentence: String
  let marks: [(Double, PMCitationSource)]

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      PMText(props: PMTextProps(children: AnyView(Text(sentence))))
        .accessibilityHidden(true)
      ForEach(marks.indices, id: \.self) { index in
        PMCitation(props: PMCitationProps(index: marks[index].0, source: marks[index].1))
      }
    }
  }
}
