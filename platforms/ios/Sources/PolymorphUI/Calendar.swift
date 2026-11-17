// Calendar (`design/components/calendar.md`): a month grid for choosing a
// date, drawn from the recipe (`PMMonthGrid`), `space-3` inside its own
// width: the header with the previous and next month buttons around the
// month's name, the weekday row in the locale's short names from its first
// day of the week (`firstDayOfWeek` overrides it, 0 being Sunday), and the
// weeks, with no days from other months. The chosen day takes the selection
// recipe; today has an `accent.bg` hairline unless chosen; a day outside
// `minValue` and `maxValue`, or one `isDateUnavailable` refuses, is struck
// through and cannot be chosen; `disabled` makes the whole grid inert.
//
// Dates are `PMCalendarDate`s in the Gregorian calendar, never moments, so no
// time zone moves a day. `value` with `onChange` is the controlled pair, and
// a chosen day is reported as itself; `focusedValue` sets the month shown,
// and `onFocusChange` hears the month change. `locale` names the months and
// the days, and numbers them. Each day is a button named by its full date,
// with the selected trait while chosen; the month is announced when it
// changes. The previous and next buttons are named by `messages` ("Previous
// month", "Next month" by default).

import PolymorphTokens
import SwiftUI

public struct PMCalendar: PMCalendarRendering {
  @State private var draft: PMCalendarDate?
  private let props: PMCalendarProps

  public init(props: PMCalendarProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
  }

  public var body: some View {
    let current = props.value ?? draft
    let disabled = props.disabled ?? false

    PMMonthGrid(
      selection: .day(current), focus: props.focusedValue, minValue: props.minValue,
      maxValue: props.maxValue, unavailable: props.isDateUnavailable, disabled: disabled,
      locale: props.locale, firstDayOfWeek: props.firstDayOfWeek,
      previousLabel: props.messages?.previousMonth ?? PMStrings.calendarMessages.previousMonth,
      nextLabel: props.messages?.nextMonth ?? PMStrings.calendarMessages.nextMonth,
      onMonth: { props.onFocusChange?($0) }
    ) { day in
      guard !PMDates.sameDay(day, current) else { return }
      draft = day
      props.onChange?(day)
    }
    .modifier(PMOptionalLabel(label: props.ariaLabel))
    .pmMember("Calendar", CalendarStates.attributes(current, disabled: disabled))
  }
}

/// Calendar's states, from the spec's States table, on fixed months so the
/// renders do not change with the day they are drawn on.
public struct CalendarStates: PMStates {
  public let member = "Calendar"

  public init() {}

  static func attributes(_ value: PMCalendarDate?, disabled: Bool) -> [String: String] {
    var attributes: [String: String] = [:]
    if let value {
      attributes["selected"] = String(format: "%04d-%02d-%02d", Int(value.year), Int(value.month), Int(value.day))
    }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }

  private static let chosen = PMCalendarDate(year: 2026, month: 3, day: 18)

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("month with selection", expect: ["selected": "2026-03-18"]) {
        PMCalendar(props: PMCalendarProps(ariaLabel: "Due date", defaultValue: Self.chosen))
      },
      PMStateEntry("today visible", expect: [:]) {
        PMCalendar(props: PMCalendarProps(ariaLabel: "Due date"))
      },
      PMStateEntry("min and max bounds", expect: ["selected": "2026-03-18"]) {
        PMCalendar(
          props: PMCalendarProps(
            ariaLabel: "Due date", defaultValue: Self.chosen,
            maxValue: PMCalendarDate(year: 2026, month: 3, day: 24),
            minValue: PMCalendarDate(year: 2026, month: 3, day: 10)))
      },
      PMStateEntry("unavailable dates — the weekends struck", expect: ["selected": "2026-03-18"]) {
        PMCalendar(
          props: PMCalendarProps(
            ariaLabel: "Delivery day", defaultValue: Self.chosen,
            isDateUnavailable: { CalendarStates.weekend($0) }))
      },
      PMStateEntry("week start override — Monday first", expect: ["selected": "2026-03-18"]) {
        PMCalendar(
          props: PMCalendarProps(
            ariaLabel: "Due date", defaultValue: Self.chosen, firstDayOfWeek: .firstDayOfWeek1))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMCalendar(
          props: PMCalendarProps(ariaLabel: "Due date", defaultValue: Self.chosen, disabled: true))
      },
    ]
  }

  /// Whether a day falls on a Saturday or a Sunday, in every locale: the
  /// locale's own weekend is one day in some, which would change the renders
  /// with the machine they are drawn on.
  static func weekend(_ day: PMCalendarDate) -> Bool {
    let calendar = PMDates.calendar(.current)
    guard let date = PMDates.date(day, in: calendar) else { return false }
    let weekday = calendar.component(.weekday, from: date)
    return weekday == 1 || weekday == 7
  }
}
