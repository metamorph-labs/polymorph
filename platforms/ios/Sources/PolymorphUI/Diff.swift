// Diff (`design/components/diff.md`): a value that changed, as what it was and
// what it is. Two forms, as on the web.
//
// - **inline** (the default): a short value beside other text, one `Text` that
//   sets no font, step or colour, so it takes the text's around it. A changed
//   value is the old one struck through, the arrow `space.2` clear of both
//   sides, and the new one; an addition is the sign `+`, `space.1` before the
//   new value, which is neither struck nor coloured; a removal is the old value
//   struck through; equal sides are the value as plain text. Each value is a
//   bidi isolate and the line takes the layout's direction, so in a
//   right-to-left layout the old value is at the right and the arrow, which has
//   no mirrored form of its own, is drawn pointing left. A view cannot flow
//   inside a wrapped paragraph, so the inline form sits beside other text in a
//   row, a cell or a body, as Code does.
// - **lines**: two texts compared line by line through `PMLineDiff`, the
//   engine's `diffLines` and `diffRuns` on the web, on CodeBlock's code surface:
//   the mono face at `text.sm` in `text.primary` on `bg.subtle`, a
//   `border.subtle` hairline at `radius.md`. A row is a marker cell `space.6`
//   wide and its text `space.3` in from each side. An added line's cell is `+`
//   in `success.text` on `success.subtle`, a removed line's `−` in
//   `danger.text` on `danger.subtle`, and the wash stops at the cell; an
//   unchanged line's text is `text.secondary`. A long line wraps inside its row
//   and never widens the member. Unchanged lines past `context` beside each
//   change are one run: a bar `space.1` by `space.2` inside, ruled above and
//   below except at the list's edges, holding Button `ghost/neutral/sm` with
//   `expand` or `collapse`, named by `messages.unchanged`, whose lines show
//   under the bar once it is pressed. Which runs are open is the reader's
//   state. They show at once, with no transition.
//
// VoiceOver hears the words the web writes visually hidden: the inline form is
// one element read "from Draft to Active", "added Active" or "removed Draft";
// the lines form is a container named by `label`, the web's region, each row
// one element read "added", "removed" or nothing, then the line. The markers,
// the sign and the arrow are not read. A run's Button reports "expanded" or
// "collapsed" as its value, the web's `aria-expanded`.

import PolymorphTokens
import SwiftUI

public struct PMDiff: PMDiffRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.layoutDirection) private var direction
  private let props: PMDiffProps

  public init(props: PMDiffProps) {
    self.props = props
  }

  public var body: some View {
    // An empty value draws nothing a reader can see, so it reads as a missing one.
    let old = (props.before ?? nil) ?? ""
    let next = (props.after ?? nil) ?? ""
    let messages = props.messages ?? PMStrings.diffMessages

    if old.isEmpty && next.isEmpty {
      EmptyView()
    } else if props.display == .lines {
      PMDiffLines(
        before: old, after: next, label: props.label,
        context: props.context ?? PMSpecDefault.diffContext, messages: messages)
    } else {
      let (drawn, spoken) = inline(old, next, messages)
      // The element is the view's, not the Text's: a label on a Text with
      // runs between its gaps is set on each run.
      drawn
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
        .accessibilityAddTraits(.isStaticText)
        .pmMember("Diff")
    }
  }

  /// The inline form as one Text, and the words VoiceOver reads for it.
  private func inline(_ old: String, _ next: String, _ m: PMDiffMessages) -> (Text, String) {
    let space = theme.defaultDensity.space
    let mark = Text(verbatim: PMDiffGlyphs.direction(direction))
    if old == next { return (Text(verbatim: next), next) }
    if old.isEmpty {
      let drawn = Text(verbatim: PMDiffGlyphs.added) + PMDiffGlyphs.gap(space.s1)
        + Text(verbatim: PMDiffGlyphs.isolated(next))
      return (mark + drawn, "\(m.added) \(next)")
    }
    let struck = Text(verbatim: PMDiffGlyphs.isolated(old)).strikethrough()
    if next.isEmpty { return (mark + struck, "\(m.removed) \(old)") }
    let drawn = struck + PMDiffGlyphs.gap(space.s2) + Text(verbatim: PMDiffGlyphs.arrow(direction))
      + PMDiffGlyphs.gap(space.s2) + Text(verbatim: PMDiffGlyphs.isolated(next))
    return (mark + drawn, "\(m.from) \(old) \(m.to) \(next)")
  }
}

/// The lines form: the rows of the two texts in their runs, on the code surface.
private struct PMDiffLines: View {
  @Environment(\.pmTheme) private var theme
  /// The keys of the collapsed runs the reader has opened.
  @State private var open: Set<Int> = []
  let runs: [PMDiffRun]
  let label: String?
  let messages: PMDiffMessages

  /// The comparison runs here, once for each pair of texts the member is
  /// handed, and not again when the reader opens a run.
  init(before: String, after: String, label: String?, context: Double, messages: PMDiffMessages) {
    self.runs = PMLineDiff.runs(PMLineDiff.rows(before, after), context: context)
    self.label = label
    self.messages = messages
  }

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.md)
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(runs.enumerated()), id: \.element.key) { index, run in
        if run.collapsed {
          fold(run, first: index == 0, last: index == runs.count - 1)
        } else {
          rows(run.rows)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.colors.bgSubtle.color, in: shape)
    .clipShape(shape)
    .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
    .accessibilityElement(children: .contain)
    .modifier(PMOptionalLabel(label: label))
    .pmMember("Diff", ["display": PMDiffDisplay.lines.rawValue])
  }

  private func rows(_ rows: [PMDiffRow]) -> some View {
    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
      PMDiffLine(row: row, messages: messages)
    }
  }

  /// A collapsed run: its bar and Button, and its lines under the bar once open.
  private func fold(_ run: PMDiffRun, first: Bool, last: Bool) -> some View {
    let space = theme.defaultDensity.space
    let shown = open.contains(run.key)
    return VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 0) {
        PMButton(
          props: PMButtonProps(
            expanded: shown, icon: shown ? .collapse : .expand,
            label: messages.unchanged(Double(run.rows.count)),
            onClick: { toggle(run.key) }, size: .sm, appearance: .ghostNeutral))
        Spacer(minLength: 0)
      }
      .padding(.vertical, space.s1)
      .padding(.horizontal, space.s2)
      .overlay(alignment: .top) { if !first { PMRule(theme.colors.borderSubtle) } }
      .overlay(alignment: .bottom) { if !last || shown { PMRule(theme.colors.borderSubtle) } }
      if shown { rows(run.rows) }
    }
  }

  private func toggle(_ key: Int) {
    if open.contains(key) { open.remove(key) } else { open.insert(key) }
  }
}

/// One row of the lines form: its marker cell, washed to its row's height, and
/// its text, which wraps. It is one element, read as its kind's word and the
/// line; an unchanged empty line has nothing to read and is hidden.
private struct PMDiffLine: View {
  @Environment(\.pmTheme) private var theme
  let row: PMDiffRow
  let messages: PMDiffMessages

  var body: some View {
    let colors = theme.colors
    let step = theme.text.sm.set(in: theme.fonts.mono)
    let (glyph, ink, wash, word): (String, PMDynamicColor, PMDynamicColor?, String?) =
      switch row.kind {
      case .added: (PMDiffGlyphs.added, colors.successText, colors.successSubtle, messages.added)
      case .removed: (PMDiffGlyphs.removed, colors.dangerText, colors.dangerSubtle, messages.removed)
      case .same: (PMDiffGlyphs.blank, colors.textSecondary, nil, nil)
      }
    let spoken = word.map { "\($0) \(row.text)" } ?? row.text

    HStack(alignment: .top, spacing: 0) {
      // One line tall at least, and as tall as its row, so the wash marks all of a wrapped line.
      Text(verbatim: glyph)
        .pmTextStyle(step)
        .foregroundStyle(ink.color)
        .frame(width: theme.defaultDensity.space.s6)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(wash?.color ?? .clear)
      Text(verbatim: row.text)
        .pmTextStyle(step)
        .foregroundStyle(row.kind == .same ? colors.textSecondary.color : colors.textPrimary.color)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, theme.defaultDensity.space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .fixedSize(horizontal: false, vertical: true)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: spoken))
    .accessibilityAddTraits(.isStaticText)
    .accessibilityHidden(spoken.isEmpty)
  }
}

/// Diff's states, from the spec's States table. The inline form is phrasing
/// content, so the entries that set it in a sentence, on a warning Alert's wash
/// and in a table's cells draw that surrounding text's step, tone and fill
/// around it; the surrounding words are scenery, hidden from accessibility, so
/// each entry's first element is the Diff. The rendering harness draws every
/// collapsed run closed, as the reader first sees it.
public struct DiffStates: PMStates {
  public let member = "Diff"

  public init() {}

  /// A governed payload as an app passes it: formatted text, one key per line.
  private static let configuration = """
    {
      "workspace": "relay-eu",
      "region": "eu-west-1",
      "retention": {
        "days": 30,
        "archive": true,
        "tiers": [
          "hot",
          "warm"
        ]
      },
      "sync": {
        "interval": 300,
        "batch": 500,
        "retries": 5,
        "backoff": "exponential"
      },
      "notifications": {
        "email": true,
        "digest": "daily",
        "channels": [
          "#support",
          "#on-call"
        ]
      },
      "limits": {
        "seats": 25,
        "projects": 100,
        "storageGb": 500
      },
      "features": {
        "audit": true,
        "sso": false,
        "exports": true
      }
    }
    """
  private static let configurationAfter = configuration.replacingOccurrences(
    of: "\"retries\": 5", with: "\"retries\": 8")

  /// A list of ids is compared with one id on each line.
  private static let grantsBefore = [
    "tickets.read", "tickets.write", "billing.read", "reports.export",
  ].joined(separator: "\n")
  private static let grantsAfter = [
    "tickets.read", "tickets.write", "payments.refund", "reports.export", "members.manage",
  ].joined(separator: "\n")

  private static let bodyBefore = ["Hi Ada,", "Your export is ready.", "Thanks"].joined(
    separator: "\n")
  private static let bodyAfter = [
    "Hello Ada,", "Your export failed and will run again tonight.", "Thank you for your patience",
  ].joined(separator: "\n")

  /// Lines with no break in them: a callback URL and its signing key.
  private static let endpointBefore = [
    "callback=https://hooks.example.org/v1/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge",
    "signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  ].joined(separator: "\n")
  private static let endpointAfter = [
    "callback=https://hooks.example.org/v2/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge",
    "signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  ].joined(separator: "\n")

  private static func inline(_ before: String?, _ after: String?) -> PMDiff {
    PMDiff(props: PMDiffProps(after: .some(after), before: .some(before)))
  }

  private static func lines(
    _ label: String, _ before: String?, _ after: String, context: Double? = nil
  ) -> PMDiff {
    PMDiff(
      props: PMDiffProps(
        after: .some(after), before: .some(before), context: context, display: .lines,
        label: label))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a changed value — the old one struck through, then the new one",
        expect: ["label": "from Draft to Active"]
      ) {
        DiffBody { Self.inline("Draft", "Active") }
      },
      PMStateEntry("an addition — only a new value", expect: ["label": "added Ada Okonkwo"]) {
        DiffBody { Self.inline(nil, "Ada Okonkwo") }
      },
      PMStateEntry("a removal — only an old value", expect: ["label": "removed Ada Okonkwo"]) {
        DiffBody { Self.inline("Ada Okonkwo", nil) }
      },
      PMStateEntry("no change — the value as plain text", expect: ["label": "Active"]) {
        DiffBody { Self.inline("Active", "Active") }
      },
      PMStateEntry(
        "in a sentence — the font and size of the text around it",
        expect: ["label": "from Ada Okonkwo to Grace Hopper"]
      ) {
        DiffSentence(lead: "The owner changed:") { Self.inline("Ada Okonkwo", "Grace Hopper") }
      },
      PMStateEntry(
        "in an Alert — on the tone’s wash", expect: ["label": "from apollo to apollo-eu"]
      ) {
        DiffOnWarning(lead: "Name:") { Self.inline("apollo", "apollo-eu") }
      },
      PMStateEntry("in a Table cell", expect: ["label": "from Waiting to Closed"]) {
        DiffCells(rows: [("T-1041", "Waiting", "Closed"), ("T-1039", "Open", "Open")]) {
          Self.inline($0, $1)
        }
      },
      PMStateEntry(
        "lines — one change in a long text, the unchanged runs collapsed",
        expect: ["display": "lines", "label": "Workspace configuration"]
      ) {
        Self.lines("Workspace configuration", Self.configuration, Self.configurationAfter)
      },
      PMStateEntry(
        "lines — a list of ids, one on each line",
        expect: ["display": "lines", "label": "Granted operations"]
      ) {
        Self.lines("Granted operations", Self.grantsBefore, Self.grantsAfter)
      },
      PMStateEntry(
        "lines — every line changed", expect: ["display": "lines", "label": "Message body"]
      ) {
        Self.lines("Message body", Self.bodyBefore, Self.bodyAfter)
      },
      PMStateEntry(
        "lines — every line kept, with an infinite context",
        expect: ["display": "lines", "label": "Workspace configuration"]
      ) {
        Self.lines(
          "Workspace configuration", Self.configuration, Self.configurationAfter,
          context: .infinity)
      },
      PMStateEntry(
        "lines — a new text, every line added",
        expect: ["display": "lines", "label": "Granted operations"]
      ) {
        Self.lines("Granted operations", nil, Self.grantsAfter)
      },
      PMStateEntry(
        "lines — long lines wrap in a narrow box",
        expect: ["display": "lines", "label": "Webhook endpoint"]
      ) {
        DiffNarrow { Self.lines("Webhook endpoint", Self.endpointBefore, Self.endpointAfter) }
      },
    ]
  }
}

/// Body text, Text's `text.md` in `text.primary`, for an inline Diff alone.
private struct DiffBody<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .pmTextStyle(theme.text.md)
      .foregroundStyle(theme.colors.textPrimary.color)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A body `text.md` sentence, its lead and then the Diff.
private struct DiffSentence<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let lead: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s2) {
      Text(lead).accessibilityHidden(true)
      content()
    }
    .pmTextStyle(theme.text.md)
    .foregroundStyle(theme.colors.textPrimary.color)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A warning Alert's panel: the wash, its border and the body's `text.sm` in
/// `text.secondary`, its lead and then the Diff.
private struct DiffOnWarning<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let lead: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s2) {
      Text(lead).accessibilityHidden(true)
      content()
    }
    .pmTextStyle(theme.text.sm)
    .foregroundStyle(theme.colors.textSecondary.color)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(theme.defaultDensity.space.s4)
    .background(theme.colors.warningSubtle.color, in: shape)
    .overlay { shape.strokeBorder(theme.colors.warningBorder.color, lineWidth: 1) }
  }
}

/// Table's body cells as its list draws them on a phone: each row's id and
/// then its status, in `text.sm` over the subtle rule.
private struct DiffCells<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let rows: [(String, String, String)]
  @ViewBuilder let content: (String, String) -> Content

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        VStack(alignment: .leading, spacing: space.s1) {
          Text(row.0)
            .foregroundStyle(theme.colors.textSecondary.color)
            .accessibilityHidden(true)
          content(row.1, row.2)
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

/// The spec's narrow box: two `space.10`s wide, where a long line must wrap.
private struct DiffNarrow<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .frame(width: theme.defaultDensity.space.s10 * PMFixtureSpan.sample)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
