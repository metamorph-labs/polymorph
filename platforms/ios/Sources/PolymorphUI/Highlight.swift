// Highlight (`design/components/highlight.md`): the parts of a text that match
// a search, marked. One `Text`, its runs from `PMHighlightRuns`, the engine's
// `highlightRuns` on the web, so the same text and the same query mark the
// same characters. It is phrasing content: the root sets no font, step or
// colour, so it takes the type and the tone of the text around it from the
// environment (`pmTextStyle`, `foregroundStyle`), as the web's span inherits
// them.
//
// A mark is a run on `warning.subtle` in `warning.text`, at `text.xl`'s weight,
// Text's emphasis weight, so colour is not the only mark. A run's background in
// a `Text` has no corner radius, so the mark's `radius.sm` is not drawn, as
// Markdown's code spans draw their wash square. A view cannot flow inside a
// wrapped paragraph, so a Highlight sits beside other text in a row, a cell or
// a body, as Code and RelativeTime do.
//
// VoiceOver reads the text once, whole, as it is: the root is one element
// labelled with the text, and the marks are attributes of its runs, which are
// not announced. An empty text draws nothing.

import PolymorphTokens
import SwiftUI

public struct PMHighlight: PMHighlightRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMHighlightProps

  public init(props: PMHighlightProps) {
    self.props = props
  }

  public var body: some View {
    let runs = PMHighlightRuns.runs(
      props.text, query: props.query, ranges: props.ranges, locale: props.locale)
    if runs.isEmpty {
      EmptyView()
    } else {
      text(runs)
        .accessibilityLabel(Text(verbatim: props.text))
        .accessibilityAddTraits(.isStaticText)
        .pmMember("Highlight")
    }
  }

  /// The runs as one Text: a plain run as it is, a mark on the warning wash in
  /// its text colour and at the emphasis weight.
  private func text(_ runs: [PMHighlightRun]) -> Text {
    let colors = theme.colors
    let weight = theme.text.xl.weight
    return runs.reduce(Text(verbatim: "")) { joined, run in
      guard run.marked else { return joined + Text(verbatim: run.text) }
      var mark = AttributedString(run.text)
      mark.swiftUI.foregroundColor = colors.warningText.color
      mark.swiftUI.backgroundColor = colors.warningSubtle.color
      return joined + Text(mark).fontWeight(weight)
    }
  }
}

/// Highlight's states, from the spec's States table. A Highlight is phrasing
/// content, so the entries that set it in a sentence, in a table's cells and
/// on a warning Alert's wash draw that surrounding text's step, tone and fill
/// around it; the surrounding words are scenery, hidden from accessibility, so
/// each entry's first element is the Highlight.
public struct HighlightStates: PMStates {
  public let member = "Highlight"

  public init() {}

  private static let invoice = "Invoice 2026-118 replaces the draft invoice"
  private static let renewal = "Northwind renewed its 2026 support plan"
  private static let refunds = "Refunds are running for the March invoices"
  private static let billing = "Billing address updated"
  private static let istanbul = "İSTANBUL OFİSİ"
  private static let address = "Invoice address shows the old office"
  private static let twice = "Refund for invoice 2026-118 was sent twice"
  private static let results = [
    ("T-1041", "Refund for invoice 2026-118 was sent twice"),
    ("T-1039", "Invoice address shows the old office"),
    ("T-1032", "Export of last year’s invoices times out"),
  ]

  private static func highlight(
    _ text: String, query: PMChoiceValue? = nil, ranges: [(Double, Double)]? = nil,
    locale: String? = nil
  ) -> PMHighlight {
    PMHighlight(props: PMHighlightProps(locale: locale, query: query, ranges: ranges, text: text))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a query — every occurrence marked, whatever its case", expect: ["label": Self.invoice]
      ) {
        HighlightBody { Self.highlight(Self.invoice, query: .single("invoice")) }
      },
      PMStateEntry("several terms", expect: ["label": Self.renewal]) {
        HighlightBody { Self.highlight(Self.renewal, query: .multiple(["north", "2026"])) }
      },
      PMStateEntry("ranges from a search engine", expect: ["label": Self.refunds]) {
        HighlightBody { Self.highlight(Self.refunds, ranges: [(0, 7), (12, 19)]) }
      },
      PMStateEntry("no match — the text as it is", expect: ["label": Self.billing]) {
        HighlightBody { Self.highlight(Self.billing, query: .single("invoice")) }
      },
      PMStateEntry("case folded in the page’s locale", expect: ["label": Self.istanbul]) {
        HighlightBody {
          Self.highlight(Self.istanbul, query: .single("istanbul"), locale: "tr")
        }
      },
      PMStateEntry(
        "in a sentence — the font and size of the text around it", expect: ["label": Self.address]
      ) {
        HighlightSentence(lead: "Matched in the subject:") {
          Self.highlight(Self.address, query: .single("office"))
        }
      },
      PMStateEntry("in a Table cell", expect: ["label": Self.results[0].1]) {
        HighlightCells(rows: Self.results) { Self.highlight($0, query: .single("invoice")) }
      },
      PMStateEntry(
        "in an Alert — the weight marks it on the same wash", expect: ["label": Self.twice]
      ) {
        HighlightOnWarning { Self.highlight(Self.twice, query: .single("refund")) }
      },
    ]
  }
}

/// Body text, Text's `text.md` in `text.primary`, for a Highlight alone.
private struct HighlightBody<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .pmTextStyle(theme.text.md)
      .foregroundStyle(theme.colors.textPrimary.color)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A secondary `text.sm` sentence, its lead and then the Highlight.
private struct HighlightSentence<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let lead: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s1) {
      Text(lead).accessibilityHidden(true)
      content()
    }
    .pmTextStyle(theme.text.sm)
    .foregroundStyle(theme.colors.textSecondary.color)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Table's body cells as its list draws them on a phone: each row's id and
/// then its subject, in `text.sm` over the subtle rule.
private struct HighlightCells<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let rows: [(String, String)]
  @ViewBuilder let content: (String) -> Content

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        VStack(alignment: .leading, spacing: space.s1) {
          Text(row.0)
            .foregroundStyle(theme.colors.textSecondary.color)
            .accessibilityHidden(true)
          content(row.1)
            .foregroundStyle(theme.colors.textPrimary.color)
        }
        .padding(.vertical, space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
      }
    }
    .pmTextStyle(theme.text.sm)
  }
}

/// A warning Alert's panel: the wash, its border and the body's `text.sm` in
/// `text.secondary`, where the mark's wash is the panel's own.
private struct HighlightOnWarning<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    content()
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(theme.colors.textSecondary.color)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(theme.defaultDensity.space.s4)
      .background(theme.colors.warningSubtle.color, in: shape)
      .overlay { shape.strokeBorder(theme.colors.warningBorder.color, lineWidth: 1) }
  }
}
