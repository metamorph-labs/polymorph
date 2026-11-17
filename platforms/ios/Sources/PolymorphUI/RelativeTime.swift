// RelativeTime (`design/components/relative-time.md`): a moment as a phrase
// such as "2h ago", for timestamps in lists, tables and running text. It is a
// word, not a widget: it sets no type step and no colour and takes both from
// the text around it, as the web's `<time>` inherits them.
//
// The phrase follows the spec's ladder, which the web's engine
// (`relativeTimePhrase`) implements: under a minute the formatter's own "now";
// then the largest unit with a count of at least one (minutes, hours, days,
// weeks, months, years), the count rounded to the nearest and moved up a unit
// when it reaches the next unit's threshold, so 59 minutes 40 seconds is "1h
// ago"; a date-only value is a calendar date, measured in days and larger from
// today in the reader's time zone, and "today" when it is today; the future
// reads "in 2d". `RelativeDateTimeFormatter` words it: `narrow` is its
// `abbreviated` style ("5m ago"), `long` its `full` ("5 minutes ago"), and
// `numeric: auto` its `named` style ("yesterday"). The locale is `locale` when
// given, otherwise the environment's, as the web's default is the document's.
//
// `mode: .absolute` draws the moment itself with `DateFormatter` in the
// locale: the medium date under `format: narrow` and the long date under
// `long`, and for a timestamp the short time, in the reader's time zone, the
// spec's fixed pair (Intl's `dateStyle` and `timeStyle` on the web). A
// calendar date is the date alone, the same day in every zone. `mode: .both`
// draws the moment and the phrase joined by `messages.both`, so a locale
// orders and punctuates them; without `messages` the moment comes first and
// the phrase follows in parentheses. The platform's formatter joins a date and
// a time in its own words, as `Intl` does on the web.
//
// A full timestamp keeps its offset; one written without an offset is read in
// the reader's time zone, as the web's parser reads it. A value that is not a
// moment draws nothing, because no phrase about it is true, and a debug build
// says so in the console, as the web warns in development.
//
// It never refreshes: the phrase is as current as the render that drew it, and
// an app that wants a fresher one renders again. A timestamp that ticks is
// motion nobody asked for. SwiftUI's own `Text(_:style: .relative)` ticks, so
// it is not used.
//
// VoiceOver reads the long form of what is drawn ("5 minutes ago", "August 4,
// 2026") whatever `format` draws: the narrow style's abbreviations ("5m",
// "2h") do not say their unit when spoken. The root carries the value as its
// `datetime` attribute, the web's `dateTime`, for a test to read the moment
// back.

import PolymorphTokens
import SwiftUI

public struct PMRelativeTime: PMRelativeTimeRendering {
  @Environment(\.locale) private var environmentLocale
  @Environment(\.timeZone) private var timeZone
  private let props: PMRelativeTimeProps

  public init(props: PMRelativeTimeProps) {
    self.props = props
  }

  public var body: some View {
    let locale = props.locale.map { Locale(identifier: $0) } ?? environmentLocale
    let phrase = PMRelativePhrase(
      value: props.value, now: Date(), timeZone: timeZone, locale: locale,
      numeric: props.numeric ?? .always)

    if let phrase {
      let mode = props.mode ?? .relative
      let both: @MainActor (String, String) -> String = props.messages?.both ?? Self.both
      Text(phrase.text(mode, long: props.format == .long, both: both))
        .accessibilityLabel(Text(phrase.text(mode, long: true, both: both)))
        .accessibilityAddTraits(.isStaticText)
        .pmMember("RelativeTime", ["datetime": props.value])
    } else {
      let _ = Self.warn(props.value)
    }
  }

  /// The spec's English join for `mode: .both`: the moment, then the phrase in
  /// parentheses.
  private static func both(_ moment: String, _ distance: String) -> String {
    moment + " (" + distance + ")"
  }

  /// The web's development warning for a value that is not a moment, in a
  /// debug build only.
  private static func warn(_ value: String) {
    #if DEBUG
      print("polymorph: RelativeTime could not parse \"\(value)\" — rendering nothing.")
    #endif
  }
}

/// The ladder's decision for one value: the unit and the signed count, or the
/// zero case, which the formatter names ("now", "today") whatever `numeric`.
private struct PMRelativePhrase {
  private enum Unit: CaseIterable {
    case minute, hour, day, week, month, year

    /// The unit's length in seconds; a month is the Gregorian average, so
    /// months and years stay consistent with each other.
    var seconds: TimeInterval {
      let day: TimeInterval = 86_400
      switch self {
      case .minute: return 60
      case .hour: return 3_600
      case .day: return day
      case .week: return 7 * day
      case .month: return 30.4375 * day
      case .year: return 365.25 * day
      }
    }

    func components(_ count: Int) -> DateComponents {
      switch self {
      case .minute: DateComponents(minute: count)
      case .hour: DateComponents(hour: count)
      case .day: DateComponents(day: count)
      case .week: DateComponents(weekOfMonth: count)
      case .month: DateComponents(month: count)
      case .year: DateComponents(year: count)
      }
    }
  }

  private let components: DateComponents
  private let named: Bool
  private let locale: Locale
  private let timeZone: TimeZone
  /// The moment the absolute form writes: an instant, or a calendar date's
  /// start in the reader's zone.
  private let moment: Date
  /// Whether the value is a calendar date, which the absolute form writes
  /// without a time.
  private let calendar: Bool

  init?(
    value: String, now: Date, timeZone: TimeZone, locale: Locale,
    numeric: PMRelativeTimeNumeric
  ) {
    self.locale = locale
    self.timeZone = timeZone
    if let found = Self.calendarDays(value, now: now, timeZone: timeZone) {
      let days = found.days
      (moment, calendar) = (found.day, true)
      if days == 0 {
        (components, named) = (DateComponents(day: 0), true)
        return
      }
      let rung = Self.rung(seconds: abs(TimeInterval(days)) * Unit.day.seconds, from: .day)
      (components, named) = (
        rung.unit.components(days < 0 ? -rung.count : rung.count), numeric == .auto
      )
      return
    }
    guard let instant = Self.instant(value, timeZone: timeZone) else { return nil }
    (moment, calendar) = (instant, false)
    let signed = instant.timeIntervalSince(now)
    if abs(signed) < Unit.minute.seconds {
      (components, named) = (DateComponents(second: 0), true)
      return
    }
    let rung = Self.rung(seconds: abs(signed), from: .minute)
    (components, named) = (
      rung.unit.components(signed < 0 ? -rung.count : rung.count), numeric == .auto
    )
  }

  /// What the member draws in `mode`, in the long form or the short one: the
  /// phrase, the moment, or the two joined by `both`.
  @MainActor
  func text(
    _ mode: PMRelativeTimeMode, long: Bool, both: @MainActor (String, String) -> String
  ) -> String {
    let phrase = words(long ? .full : .abbreviated)
    switch mode {
    case .relative: return phrase
    case .absolute: return absolute(long: long)
    case .both: return both(absolute(long: long), phrase)
    }
  }

  /// The moment in the locale's words: the long or medium date, and for a
  /// timestamp the short time, in the reader's zone.
  private func absolute(long: Bool) -> String {
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.timeZone = timeZone
    formatter.dateStyle = long ? .long : .medium
    formatter.timeStyle = calendar ? .none : .short
    return formatter.string(from: moment)
  }

  /// The phrase in `style`.
  private func words(_ style: RelativeDateTimeFormatter.UnitsStyle) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = locale
    formatter.unitsStyle = style
    formatter.dateTimeStyle = named ? .named : .numeric
    return formatter.localizedString(from: components)
  }

  /// The largest unit from `smallest` up that the span has at least one of,
  /// with the count rounded to the nearest; a count that reaches the next
  /// unit's threshold moves up to that unit, and on, so one carry can lead to
  /// another. The smallest unit is the least, even under one of it.
  private static func rung(seconds: TimeInterval, from smallest: Unit) -> (unit: Unit, count: Int) {
    let units = Unit.allCases.filter { $0.seconds >= smallest.seconds }
    var held = units[0]
    for unit in units where seconds >= unit.seconds { held = unit }
    var count = (seconds / held.seconds).rounded()
    for unit in units where unit.seconds > held.seconds && count * held.seconds >= unit.seconds {
      held = unit
      count = max(1, (seconds / unit.seconds).rounded())
    }
    return (held, Int(count))
  }

  /// A date-only value, `2026-08-04`, is a calendar date: no time of day and
  /// so no time zone. Its distance from today is whole days, counted on the
  /// Gregorian calendar in the reader's time zone, so a daylight-saving hour
  /// never moves it; the day's start in that zone is what the absolute form
  /// writes. A date that does not exist (`2026-02-30`) is no moment.
  private static func calendarDays(
    _ value: String, now: Date, timeZone: TimeZone
  ) -> (days: Int, day: Date)? {
    let parts = value.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
      parts.allSatisfy({ $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }),
      let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2])
    else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let date = DateComponents(calendar: calendar, year: year, month: month, day: day)
    guard date.isValidDate, let then = date.date,
      let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: then).day
    else { return nil }
    return (days, then)
  }

  /// A full timestamp. One with an offset (`Z`, `+05:30`) keeps it; one
  /// without is read in the reader's time zone.
  private static func instant(_ value: String, timeZone: TimeZone) -> Date? {
    let offset = ISO8601DateFormatter()
    for options: ISO8601DateFormatter.Options in [
      [.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime],
    ] {
      offset.formatOptions = options
      if let date = offset.date(from: value) { return date }
    }
    let local = DateFormatter()
    local.locale = Locale(identifier: "en_US_POSIX")
    local.calendar = Calendar(identifier: .gregorian)
    local.timeZone = timeZone
    for format in ["yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm"] {
      local.dateFormat = format
      if let date = local.date(from: value) { return date }
    }
    return nil
  }
}

/// RelativeTime's states, from the spec's States table. Each moment is
/// computed from the clock at render, as the web's fixture computes it, so a
/// render never drifts from its phrase. The locale is English, so the phrases
/// can be read back; the calendar date is fixed, so its phrase depends on
/// today and is not read back.
public struct RelativeTimeStates: PMStates {
  public let member = "RelativeTime"

  public init() {}

  private static let minute: TimeInterval = 60
  private static let hour: TimeInterval = 3_600
  private static let day: TimeInterval = 86_400

  /// The ISO value `offset` seconds from now.
  private static func moment(_ offset: TimeInterval) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date().addingTimeInterval(offset))
  }

  private static func time(
    _ value: String, numeric: PMRelativeTimeNumeric? = nil, format: PMRelativeTimeFormat? = nil,
    mode: PMRelativeTimeMode? = nil
  ) -> PMRelativeTime {
    PMRelativeTime(
      props: PMRelativeTimeProps(
        format: format, locale: "en-US", mode: mode, numeric: numeric, value: value))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("minutes — the queue register", expect: ["label": "5 minutes ago"]) {
        RelativeTimeIn(lead: "Updated") { Self.time(Self.moment(-5 * Self.minute)) }
      },
      PMStateEntry("hours", expect: ["label": "2 hours ago"]) {
        RelativeTimeIn(lead: "Updated") { Self.time(Self.moment(-2 * Self.hour)) }
      },
      PMStateEntry("days, long — for sentences", expect: ["label": "3 days ago"]) {
        RelativeTimeIn(lead: "Opened") {
          Self.time(Self.moment(-3 * Self.day), format: .long)
        }
      },
      PMStateEntry("auto — prose surfaces get yesterday", expect: ["label": "yesterday"]) {
        RelativeTimeIn(lead: "Replied") {
          Self.time(Self.moment(-Self.day), numeric: .auto, format: .long)
        }
      },
      PMStateEntry(
        "calendar date — days and larger, only", expect: ["datetime": "2026-08-04"]
      ) {
        RelativeTimeIn(lead: "Due") { Self.time("2026-08-04") }
      },
      PMStateEntry("due date — the future reads in 2d", expect: ["label": "in 2 days"]) {
        RelativeTimeIn(lead: "Due") { Self.time(Self.moment(2 * Self.day)) }
      },
      PMStateEntry("just now — the one true word under a minute", expect: ["label": "now"]) {
        RelativeTimeIn(lead: "Updated") { Self.time(Self.moment(-20)) }
      },
      PMStateEntry("absolute — the moment itself, in the reader’s zone") {
        RelativeTimeIn(lead: "Opened") {
          Self.time(Self.moment(-2 * Self.hour), mode: .absolute)
        }
      },
      PMStateEntry(
        "absolute calendar date — the date alone",
        expect: ["datetime": "2026-08-04", "label": "August 4, 2026"]
      ) {
        RelativeTimeIn(lead: "Due") { Self.time("2026-08-04", mode: .absolute) }
      },
      PMStateEntry("both — the moment, then how long ago") {
        RelativeTimeIn(lead: "Opened") { Self.time(Self.moment(-2 * Self.hour), mode: .both) }
      },
      PMStateEntry(
        "invalid — no true phrase, so nothing is drawn", expect: ["hidden": "true"]
      ) {
        RelativeTimeIn(lead: "Updated") { Self.time("not-a-date") }
      },
    ]
  }
}

/// A label and then the time, in a table cell's `text.sm` and `text.secondary`:
/// the member takes both from around it. The label is scenery, hidden from
/// accessibility, so the entry's first element is the time.
private struct RelativeTimeIn<Time: View>: View {
  @Environment(\.pmTheme) private var theme
  let lead: String
  @ViewBuilder let time: () -> Time

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s2) {
      Text(lead).accessibilityHidden(true)
      time()
    }
    .pmTextStyle(theme.text.sm)
    .foregroundStyle(theme.colors.textSecondary.color)
  }
}
