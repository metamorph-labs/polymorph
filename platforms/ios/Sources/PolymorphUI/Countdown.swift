// Countdown (`design/components/countdown.md`): the time left until a moment,
// ticking each second, for a code that expires or a resend that unlocks. It
// writes `4:59`, then `1:02:05` from an hour, until `0:00`, in tabular
// figures, and calls `onEnd` once when the moment is reached. It takes the
// type step and the colour of the text around it, as RelativeTime does.
//
// The time left is whole seconds, rounded up, read from the clock at each
// change and never counted down by subtraction (`PMCountdownTime`), so a late
// wake or a changed system clock cannot make it drift. A task wakes when the
// time left reaches its next whole second, so the digits change on the second
// of the time left, and stops at the end. A moment already past when the
// member appears draws `0:00` and calls `onEnd` once after it appears. `until`
// is an ISO-8601 instant: one with an offset keeps it, one without is read in
// the reader's time zone. A calendar date or a value that is not a moment
// draws nothing, and a debug build says so in the console, as the web warns
// in development.
//
// The digits are the locale's numerals (`locale`, or the environment's) with
// a colon in every locale. To VoiceOver the countdown is one element with the
// updates-frequently trait, iOS's timer: named by `label`, its value the time
// left in the locale's unit words from the platform's duration formatter
// ("4 minutes, 59 seconds"), because digits with a colon are read as a time of
// day. Nothing is announced unless `announce` is set; then, at one minute and
// at ten seconds left, the member posts `messages.mark(label, time)` as a
// polite announcement ("Time until the code expires: 1 minute"). A count that
// starts below a mark does not announce it, and the end is not a mark.

import PolymorphTokens
import SwiftUI

public struct PMCountdown: PMCountdownRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @Environment(\.timeZone) private var timeZone
  @State private var ticked: Int?
  @State private var announced: String?
  private let props: PMCountdownProps

  public init(props: PMCountdownProps) {
    self.props = props
  }

  public var body: some View {
    let locale = props.locale.map { Locale(identifier: $0) } ?? environmentLocale
    if let moment = PMCountdownTime.moment(props.until, timeZone: timeZone) {
      let left = ticked ?? PMCountdownTime.left(moment, now: Date())
      Text(PMCountdownTime.clock(left, locale: locale))
        .pmTabularFigures(theme.numeric.tabular)
        .accessibilityLabel(Text(props.label))
        .accessibilityValue(Text(PMCountdownTime.spoken(left, locale: locale)))
        .accessibilityAddTraits(.updatesFrequently)
        .pmLiveAnnouncement(announced, assertive: false)
        .task(id: moment) { await follow(moment, locale: locale) }
        .pmMember("Countdown", left == 0 ? ["ended": "true"] : [:])
    } else {
      let _ = Self.warn(props.until)
    }
  }

  /// Reads the clock at each whole second of the time left until the end:
  /// the digits, a mark's announcement, and `onEnd` once at the end.
  private func follow(_ moment: Date, locale: Locale) async {
    let mark: @MainActor (String, String) -> String =
      props.messages?.mark ?? { PMStrings.countdownMark(label: $0, time: $1) }
    var previous: Int?
    while !Task.isCancelled {
      let now = Date()
      let left = PMCountdownTime.left(moment, now: now)
      ticked = left
      if let previous, props.announce == true, PMCountdownTime.marked(from: previous, to: left) {
        announced = mark(props.label, PMCountdownTime.spoken(left, locale: locale))
      }
      if left == 0 {
        props.onEnd?()
        return
      }
      previous = left
      // The moment the time left becomes one second less.
      let wait = moment.timeIntervalSince(now) - Double(left - 1) * PMCountdownTime.second
      try? await Task.sleep(for: .seconds(wait))
    }
  }

  /// The web's development warning for a value that is not a moment, in a
  /// debug build only.
  private static func warn(_ value: String) {
    #if DEBUG
      print("polymorph: Countdown could not read \"\(value)\" as a moment — rendering nothing.")
    #endif
  }
}

/// Countdown's states, from the spec's States table. Each moment is computed
/// from the clock at render, a fixed distance from now, as the web's fixture
/// computes it; the cells then tick. The locale is English, so the words can
/// be read back, except in the locale entry.
public struct CountdownStates: PMStates {
  public let member = "Countdown"

  public init() {}

  /// The ISO value `offset` seconds from now.
  private static func moment(_ offset: TimeInterval) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date().addingTimeInterval(offset))
  }

  private static let expires = "Time until the code expires"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "minutes — m:ss",
        expect: ["ended": "", "label": Self.expires, "value": "4 minutes, 59 seconds"]
      ) {
        CountdownInText(
          props: PMCountdownProps(label: Self.expires, locale: "en-US", until: Self.moment(299)))
      },
      PMStateEntry(
        "hours — h:mm:ss from an hour", expect: ["value": "1 hour, 2 minutes, 5 seconds"]
      ) {
        CountdownInText(
          props: PMCountdownProps(
            label: "Time until the session ends", locale: "en-US", until: Self.moment(3725)))
      },
      PMStateEntry(
        "ended — 0:00 once the moment is reached", expect: ["ended": "true", "value": "0 seconds"]
      ) {
        CountdownInText(
          props: PMCountdownProps(label: Self.expires, locale: "en-US", until: Self.moment(-5)))
      },
      PMStateEntry("locale — the locale’s numerals and words", expect: ["label": Self.expires]) {
        CountdownInText(
          props: PMCountdownProps(label: Self.expires, locale: "ar-EG", until: Self.moment(299)))
      },
      PMStateEntry(
        "announced — a polite line at one minute and at ten seconds",
        expect: ["value": "1 minute, 5 seconds"]
      ) {
        CountdownInText(
          props: PMCountdownProps(
            announce: true, label: Self.expires, locale: "en-US", until: Self.moment(65)))
      },
      PMStateEntry(
        "beside a Button — the application enables it at the end",
        expect: ["label": "Time until a new code can be sent"]
      ) {
        ResendBeside(
          lead: "Send a new code in", label: "Time until a new code can be sent",
          action: "Send a new code", until: Self.moment(30))
      },
      PMStateEntry(
        "invalid — no moment, so nothing renders", expect: ["hidden": "true", "renders": "nothing"]
      ) {
        PMCountdown(props: PMCountdownProps(label: Self.expires, until: "not-a-moment"))
      },
    ]
  }
}

/// The composition the spec shows: a sentence that ends in the countdown, and
/// the Button that waits for the end, which is the app's, disabled until the
/// countdown says the moment is reached. The sentence's lead is hidden from
/// VoiceOver, because the countdown's label says what it counts to.
private struct ResendBeside: View {
  @Environment(\.pmTheme) private var theme
  @State private var locked = true
  let lead: String
  let label: String
  let action: String
  let until: String

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      HStack(spacing: theme.defaultDensity.space.s2) {
        Text(lead).accessibilityHidden(true)
        PMCountdown(
          props: PMCountdownProps(
            label: label, locale: "en-US", onEnd: { locked = false }, until: until))
      }
      .pmTextStyle(theme.text.md)
      .foregroundStyle(theme.colors.textPrimary.color)
      PMButton(
        props: PMButtonProps(
          disabled: locked, label: action, size: .sm, appearance: .outlineNeutral))
    }
  }
}

/// A countdown in a line of body text, whose step and colour it takes.
private struct CountdownInText: View {
  @Environment(\.pmTheme) private var theme
  let props: PMCountdownProps

  var body: some View {
    PMCountdown(props: props)
      .pmTextStyle(theme.text.md)
      .foregroundStyle(theme.colors.textPrimary.color)
  }
}
