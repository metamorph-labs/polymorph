// Timeline (`design/components/timeline.md`): a vertical list of dated past
// events, such as a ticket's history. Nothing in it is active, upcoming or a
// control, because a past event cannot be acted on. It shows each event's
// `time` as the app formatted it and never sorts the events.
//
// Each event is a marker column `space.6` wide beside its copy, `space.3`
// apart. The mark is an icon in `PMMarkDisc` when the event has an `icon`,
// otherwise a `space.3` dot centred on the same axis; under it a
// `border.subtle` rule, `space.2` clear of the mark, runs to the next event's
// mark whatever the copy's height, and the last event has none. The copy is
// one column at every width: the title in `text.sm`, the time under it in
// `text.xs` muted, the detail in `text.sm` secondary, and `space.5` below it
// on every event but the last. A tone colours the mark and nothing else:
// neutral is the rest recipe, accent the accent family, and the four statuses
// their own (`{tone}.subtle`, `.border` and `.text` on an icon mark,
// `{tone}.solid` on a dot).
//
// The marker column is hidden from accessibility, because a coloured dot
// cannot be read out and the title says what happened. The list is named by
// `label`, and each event is one element read as its title, its time and its
// detail. An empty Timeline draws nothing: saying so is EmptyState's. No
// motion: past events do not change.

import PolymorphTokens
import SwiftUI

public struct PMTimeline: PMTimelineRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMTimelineProps

  public init(props: PMTimelineProps) {
    self.props = props
  }

  public var body: some View {
    let events = Array(props.events.enumerated())

    if !events.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(events, id: \.offset) { index, event in
          row(event, last: index == events.count - 1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.label))
      .pmMember("Timeline", ["events": String(events.count)])
    }
  }

  /// One event: the copy, with the marker column drawn beside it at the
  /// copy's full height, so the rule reaches the next mark.
  private func row(_ event: PMTimelineEvent, last: Bool) -> some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    return VStack(alignment: .leading, spacing: 0) {
      Text(event.title)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(colors.textPrimary.color)
      Text(event.time)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(colors.textMuted.color)
        .padding(.top, PMGeometry.subline)
      if let detail = event.detail {
        Text(detail)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(colors.textSecondary.color)
          .padding(.top, space.s2)
      }
    }
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity, minHeight: space.s6, alignment: .topLeading)
    .padding(.bottom, last ? 0 : space.s5)
    .accessibilityElement(children: .combine)
    .padding(.leading, space.s6 + space.s3)
    .background(alignment: .topLeading) {
      TimelineMarker(event: event, last: last)
    }
  }
}

/// The marker column: the mark, then the rule down to the next event.
private struct TimelineMarker: View {
  @Environment(\.pmTheme) private var theme
  let event: PMTimelineEvent
  let last: Bool

  var body: some View {
    let space = theme.defaultDensity.space
    let recipe = TimelineRecipe(tone: event.tone ?? .neutral, colors: theme.colors)
    // The dot's inset from the icon mark's box, which centres both on one axis.
    let dotInset = (space.s6 - space.s3) / 2
    VStack(spacing: space.s2) {
      if let icon = event.icon {
        PMMarkDisc(fill: recipe.wash, border: recipe.border, foreground: recipe.glyph) {
          PMIconView(icon, size: .sm)
        }
      } else {
        // A dot is smaller than an icon mark, so it is moved down to the same centre.
        Circle()
          .fill(recipe.dot.color)
          .frame(width: space.s3, height: space.s3)
          .padding(.vertical, dotInset)
      }
      if !last {
        PMRule(theme.colors.borderSubtle, axis: .vertical)
      }
    }
    .frame(width: space.s6)
    .frame(maxHeight: .infinity, alignment: .top)
    .accessibilityHidden(true)
  }
}

/// A tone's mark: an icon mark's wash, border and glyph, and a dot's fill.
private struct TimelineRecipe {
  let wash: PMDynamicColor
  let border: PMDynamicColor
  let glyph: PMDynamicColor
  let dot: PMDynamicColor

  init(tone: PMTimelineTone, colors c: PMColors) {
    switch tone {
    case .neutral:
      (wash, border, glyph, dot) = (c.bgSubtle, c.borderDefault, c.textSecondary, c.borderStrong)
    case .accent:
      (wash, border, glyph, dot) = (c.accentSubtle, c.accentBg, c.accentText, c.accentBg)
    case .info:
      (wash, border, glyph, dot) = (c.infoSubtle, c.infoBorder, c.infoText, c.infoSolid)
    case .success:
      (wash, border, glyph, dot) = (c.successSubtle, c.successBorder, c.successText, c.successSolid)
    case .warning:
      (wash, border, glyph, dot) = (c.warningSubtle, c.warningBorder, c.warningText, c.warningSolid)
    case .danger:
      (wash, border, glyph, dot) = (c.dangerSubtle, c.dangerBorder, c.dangerText, c.dangerSolid)
    }
  }
}

/// Timeline's states, from the spec's States table. The empty Timeline draws
/// nothing, so it has no entry: the harness holds every entry to drawing.
public struct TimelineStates: PMStates {
  public let member = "Timeline"

  public init() {}

  private static let label = "Ticket history"

  private static let history = [
    PMTimelineEvent(title: "Ticket opened", time: "3 days ago", icon: .add, tone: .info),
    PMTimelineEvent(
      title: "Assigned to Ada Okonkwo", time: "2 days ago",
      detail: "Moved out of the Platform queue.", icon: .user),
    PMTimelineEvent(
      title: "Escalated to urgent", time: "4 hours ago",
      detail: "Second customer reported the same failure.", icon: .warning, tone: .danger),
    PMTimelineEvent(
      title: "Replied to the customer", time: "20 minutes ago", icon: .comment, tone: .accent),
  ]

  /// The same events with no icon, for the plain-dot column.
  private static var dots: [PMTimelineEvent] {
    history.map { PMTimelineEvent(title: $0.title, time: $0.time, detail: $0.detail) }
  }

  /// One icon event and one dot event per tone.
  private static var tones: [PMTimelineEvent] {
    PMTimelineTone.allCases.flatMap { tone in
      [
        PMTimelineEvent(
          title: "A \(tone.rawValue) event", time: "just now", icon: .tag, tone: tone),
        PMTimelineEvent(title: "A \(tone.rawValue) dot", time: "just now", tone: tone),
      ]
    }
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a history — mixed marks and tones", expect: ["label": Self.label, "events": "4"]
      ) {
        PMTimeline(props: PMTimelineProps(events: Self.history, label: Self.label))
      },
      PMStateEntry("dots only — no role on any event", expect: ["events": "4"]) {
        PMTimeline(props: PMTimelineProps(events: Self.dots, label: Self.label))
      },
      PMStateEntry("every tone", expect: ["label": "Every tone", "events": "12"]) {
        PMTimeline(props: PMTimelineProps(events: Self.tones, label: "Every tone"))
      },
      PMStateEntry("detail — with and without", expect: ["events": "2"]) {
        PMTimeline(
          props: PMTimelineProps(events: Array(Self.history[1...2]), label: Self.label))
      },
      PMStateEntry("one event — nothing to join it to", expect: ["events": "1"]) {
        PMTimeline(
          props: PMTimelineProps(events: Array(Self.history.prefix(1)), label: Self.label))
      },
    ]
  }
}
