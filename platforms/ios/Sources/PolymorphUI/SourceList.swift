// SourceList (`design/components/source-list.md`): the numbered list of sources
// under a reply, which the reply's `[n]` marks point to. Timeline's shape for
// pages: one row per source in the order the app hands them, never sorted, and
// no surface or rule between rows, because the list is part of the reply. An
// empty list draws nothing: a heading over no sources would announce sources
// that do not exist.
//
// The heading is the overline style, `cite` and the label in uppercase `text.xs`
// `text.muted`. Each row is the index and the body, `space-3` apart, aligned
// to the title's first line. The index is Citation's mark exactly, so the `2`
// here and a `[2]` in the prose look like one number: `text.xs` in
// `accent.text` on `accent.subtle`, `radius.detail`, at least as wide as it is
// tall. It is not a link of its own, because the title is the row's one link.
// The body is the title in Link's standalone recipe, `text.sm` `accent.text`,
// underlined under the pointer and while pressed, wrapping, with
// `open-external` after it; then the domain in `text.xs` `text.muted` and the
// passage in `text.sm` `text.secondary`, `space-1` apart. The title wraps
// rather than truncating, which is why it restates Link's recipe instead of
// using Link.
//
// The row is the title's SwiftUI `Link`, so it opens `href` through the
// environment's `openURL` (the system's browser, or the app's own routing; a
// phone has no new tab to open), and its press area is the whole row, at least
// the hit target tall, rather than a title-high strip that a finger cannot
// reliably hit. An `href` that is not a URL draws the title as text, with no
// glyph. The glyph marks the end of the title, on its last line; it cannot
// follow the last word, because a view cannot sit inside wrapped text.
//
// The list is a container named by `label`, the web's labelled `<section>`;
// the drawn heading is hidden, because the label already names it. Each row is
// one element: the number, the title's link, then the domain and the passage
// in reading order. The web hides the drawn number because its `<ol>`
// announces each item's position; a stack has no list semantics to announce,
// so the number is read here, and a reader can match it to the reply's marks.

import PolymorphTokens
import SwiftUI

public struct PMSourceList: PMSourceListRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMSourceListProps

  public init(props: PMSourceListProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space

    if !props.sources.isEmpty {
      VStack(alignment: .leading, spacing: space.s3) {
        HStack(spacing: space.s1) {
          PMIconView(.cite, size: .sm)
          Text(props.label).textCase(.uppercase)
        }
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(theme.colors.textMuted.color)
        .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: space.s3) {
          ForEach(Array(props.sources.enumerated()), id: \.offset) { position, source in
            PMSourceRow(index: position + 1, source: source)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.label))
      .pmMember("SourceList")
    }
  }
}

/// One source: the inert index, then the title, the domain and the passage.
/// The row is the title's link, so its press area is the whole row and reaches
/// the hit target: a title alone is shorter than a finger. It is still the
/// row's one link, to the one destination.
private struct PMSourceRow: View {
  @Environment(\.pmTheme) private var theme
  let index: Int
  let source: PMCitationSource

  var body: some View {
    if let url = URL(string: source.href) {
      Link(destination: url) { PMSourceRowContent(index: index, source: source) }
        .buttonStyle(PMSourceRowStyle())
    } else {
      PMSourceRowContent(index: index, source: source)
        .accessibilityElement(children: .combine)
    }
  }
}

private struct PMSourceRowContent: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmSourceRowActive) private var active
  let index: Int
  let source: PMCitationSource

  var body: some View {
    let colors = theme.colors
    let space = theme.defaultDensity.space
    let linked = URL(string: source.href) != nil

    HStack(alignment: .firstTextBaseline, spacing: space.s3) {
      // Citation's mark, without its link and its states.
      PMAtLeastSquare {
        Text(String(index))
          .pmTextStyle(theme.text.xs)
          .lineLimit(1)
          .fixedSize()
          .padding(.horizontal, space.s1)
      }
      .foregroundStyle(colors.accentText.color)
      .background(
        colors.accentSubtle.color, in: RoundedRectangle(cornerRadius: theme.radius.detail))

      VStack(alignment: .leading, spacing: space.s1) {
        // The glyph marks the end of the title, on its last line: a view
        // cannot follow the last word inside wrapped text.
        HStack(alignment: .lastTextBaseline, spacing: space.s1) {
          Text(source.title)
            .underline(linked && active, color: colors.accentText.color)
          if linked {
            PMIconView(.openExternal, size: .sm)
          }
        }
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((linked ? colors.accentText : colors.textPrimary).color)
        if let domain = source.domain {
          Text(domain)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textMuted.color)
        }
        if let snippet = source.snippet {
          Text(snippet)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(colors.textSecondary.color)
        }
      }
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct PMSourceRowActiveKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether the row's link is under the pointer or pressed, which underlines its title.
  fileprivate var pmSourceRowActive: Bool {
    get { self[PMSourceRowActiveKey.self] }
    set { self[PMSourceRowActiveKey.self] = newValue }
  }
}

/// The row as a link: Link's standalone recipe on the title, underlined in
/// full `accent.text` under the pointer and while pressed, and the hit target.
private struct PMSourceRowStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    PMSourceRowChrome(pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMSourceRowChrome<Label: View>: View {
  @State private var hovering = false
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    label()
      .environment(\.pmSourceRowActive, hovering || pressed)
      .onHover { hovering = $0 }
      .pmHitTarget()
  }
}

/// SourceList's states, from the spec's States table. The empty list draws
/// nothing, so its entry shows the reply above it, which is scenery hidden
/// from accessibility: the entry exposes nothing.
public struct SourceListStates: PMStates {
  public let member = "SourceList"

  public init() {}

  private static let reply = "The retry schedule is exponential with a cap at five attempts."

  static let sources = [
    CitationStates.retry,
    PMCitationSource(
      title: "Idempotency keys", href: "https://docs.example.org/idempotency",
      domain: "docs.example.org",
      snippet: "A key is honoured for 24 hours after the first request that carried it."),
    PMCitationSource(
      title: "Incident 2026-08-14: duplicate promo codes on retry",
      href: "https://status.example.org/incidents/2026-08-14", domain: "status.example.org"),
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "three sources — title, host and the passage that answered",
        expect: ["label": "Sources"]
      ) {
        PMSourceList(props: PMSourceListProps(label: "Sources", sources: Self.sources))
      },
      PMStateEntry("titles only — the app knew nothing more", expect: ["label": "Sources"]) {
        PMSourceList(
          props: PMSourceListProps(
            label: "Sources",
            sources: Self.sources.map { PMCitationSource(title: $0.title, href: $0.href) }))
      },
      PMStateEntry("one source", expect: ["label": "Sources"]) {
        PMSourceList(
          props: PMSourceListProps(label: "Sources", sources: Array(Self.sources.prefix(1))))
      },
      PMStateEntry(
        "empty — a reply with no sources says nothing about sources", expect: ["hidden": "true"]
      ) {
        SourceListAfterReply(reply: Self.reply)
      },
    ]
  }
}

/// A reply with no sources, and the empty list under it.
private struct SourceListAfterReply: View {
  @Environment(\.pmTheme) private var theme
  let reply: String

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s4) {
      PMText(props: PMTextProps(children: AnyView(Text(reply))))
        .accessibilityHidden(true)
      PMSourceList(props: PMSourceListProps(label: "Sources", sources: []))
    }
  }
}
