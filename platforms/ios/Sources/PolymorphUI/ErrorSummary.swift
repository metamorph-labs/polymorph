// ErrorSummary (`design/components/error-summary.md`): every error of a failed
// submit in one danger panel, each a link to its field. It is navigation, not
// an Alert with links: no dismiss, no variants, and it goes when the app stops
// drawing it. An empty list draws nothing.
//
// Alert's danger recipe, row for row: the `danger.subtle` wash, a
// `danger.border` hairline, `radius.lg`, `space.4` inside, the `error` glyph
// one `text.sm` line tall beside the title, `space.3` between them. The title
// is `text.sm` in `text.primary`; the list starts `space.2` under it. Each
// link is `text.sm` in `danger.text`, always underlined, so colour is never
// the only signal (`PMTextLinkStyle`); a wrapped message keeps its underline
// on every line. SwiftUI draws one underline thickness, so the web's thicker
// hover line has no counterpart, and each link's row is at least the hit
// target tall, which spaces the rows further apart than the web's `space.2`.
//
// It is announced when it appears and again when its errors change, at high
// priority, as the web's `role="alert"` is, and focus does not move. The
// spoken text is the title, then each message.
//
// A link is a SwiftUI `Link` to `#<fieldId>`, the web's anchor: the
// environment's `openURL` receives it, so an app that installs an
// `OpenURLAction` moves focus to that field, as the web's link focuses the
// control whose id it names. A field has no id a view can be found by in
// SwiftUI (FormField's `id` names nothing), so without the app's action the
// link does nothing, as a fragment link to a missing id does nothing.

import PolymorphTokens
import SwiftUI

public struct PMErrorSummary: PMErrorSummaryRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMErrorSummaryProps

  public init(props: PMErrorSummaryProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)

    if !props.errors.isEmpty {
      HStack(alignment: .top, spacing: space.s3) {
        // One text line tall, so the glyph stays beside the title's first line.
        PMIconView(.error, size: .md)
          .foregroundStyle(colors.dangerText.color)
          .frame(minHeight: theme.text.sm.lineBox)

        VStack(alignment: .leading, spacing: space.s2) {
          Text(props.title)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(colors.textPrimary.color)
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(props.errors.enumerated()), id: \.offset) { _, error in
              link(error)
            }
          }
        }
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(space.s4)
      .background(colors.dangerSubtle.color, in: shape)
      .overlay { shape.strokeBorder(colors.dangerBorder.color, lineWidth: 1) }
      .accessibilityElement(children: .contain)
      .pmMember("ErrorSummary", ["errors": String(props.errors.count)])
      .pmLiveAnnouncement(spoken, assertive: true)
    }
  }

  /// A link to the field the error belongs to, or the message as text when the
  /// id cannot be written as a fragment.
  @ViewBuilder
  private func link(_ error: PMErrorSummaryError) -> some View {
    let danger = theme.colors.dangerText
    if let url = Self.fragment(error.fieldId) {
      Link(destination: url) {
        Text(error.label)
          .pmTextStyle(theme.text.sm)
      }
      .buttonStyle(PMTextLinkStyle(color: danger, activeColor: danger, underlined: true))
    } else {
      Text(error.label)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(danger.color)
        .underline(true, color: danger.color)
    }
  }

  /// What is announced: the title, then each message, in the order given.
  private var spoken: String {
    ([props.title] + props.errors.map(\.label)).joined(separator: ", ")
  }

  /// `#<fieldId>`, the web's `href`.
  private static func fragment(_ fieldId: String) -> URL? {
    var components = URLComponents()
    components.fragment = fieldId
    return components.url
  }
}

/// ErrorSummary's states, from the spec's States table. The empty list draws
/// nothing, so it has no entry: the harness holds every entry to drawing.
public struct ErrorSummaryStates: PMStates {
  public let member = "ErrorSummary"

  public init() {}

  private static let title = "The ticket can’t be raised yet"
  private static let subject = PMErrorSummaryError(
    label: "Subject is required", fieldId: "subject")
  private static let priority = PMErrorSummaryError(
    label: "Pick a priority", fieldId: "priority")
  private static let steps = PMErrorSummaryError(
    label:
      "The reproduction steps need at least one step the support agent can follow before the "
      + "ticket can be routed",
    fieldId: "steps")

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("two errors — every line a door", expect: ["errors": "2"]) {
        PMErrorSummary(
          props: PMErrorSummaryProps(errors: [Self.subject, Self.priority], title: Self.title))
      },
      PMStateEntry("one error — the list kept, the count is content", expect: ["errors": "1"]) {
        PMErrorSummary(props: PMErrorSummaryProps(errors: [Self.subject], title: Self.title))
      },
      PMStateEntry("long labels — the underline survives the wrap", expect: ["errors": "2"]) {
        PMErrorSummary(
          props: PMErrorSummaryProps(errors: [Self.steps, Self.priority], title: Self.title))
      },
    ]
  }
}
