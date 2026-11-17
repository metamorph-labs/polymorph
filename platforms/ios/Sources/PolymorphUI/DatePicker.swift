// DatePicker (`design/components/date-picker.md`): a date field with a
// calendar. The field is SwiftUI's DatePicker, the platform's own, inside
// Input's container (`PMFieldBox`) at Input's sizes: a chosen date shows as
// the system's compact date, which opens the system's calendar when tapped,
// with the time beside it at `hour` and `minute` granularity. An empty field
// shows the locale's date pattern (`dd/MM/yyyy`), muted, as the web's
// unfilled segments do; a tap on it anywhere in its hit area, or on the
// trailing `calendar` button (Button's ghost/neutral icon-only, named "Show
// calendar"), opens the popup.
//
// The popup is Calendar's month grid (`PMMonthGrid`), as the web's popup
// hosts Calendar: the chosen day selected, today marked, a day outside
// `minValue` and `maxValue` or one `isDateUnavailable` refuses struck through
// and not offered, and the previous and next months named by `messages`. It
// is a sheet on iPhone and a popover at the field on iPad (`presentation:
// .popover` keeps the popover on iPhone too), named "Choose a date". Choosing
// a day, today included with nothing chosen yet, sets the date, keeps the
// time at a time granularity, and closes the popup.
//
// Dates are `PMCalendarDate`s with no time zone: at `day` granularity the
// value is the day alone, and at `hour` and `minute` it carries `hour` and
// `minute`, the web's `CalendarDateTime`. `minValue` and `maxValue` bound what
// the field's own picker offers too. A date outside them, or one
// `isDateUnavailable` refuses, given as the value or chosen in the field's
// own calendar, which cannot strike a day, marks the field invalid, as the web
// marks a typed date out of range. `clearable` adds the clear button, which
// reports `nil`. `locale` orders and names the date's parts, and
// `firstDayOfWeek` (0 being Sunday) starts the weeks. `value` with `onChange`
// is the controlled pair.
//
// At `hour` granularity the hour is a picker of its own beside the date
// (`PMHourPicker`), each hour as the locale writes one, because the system's
// time picker always draws the minute; the value's minute is 0.
//
// Not honoured: the hour cycle at time granularities is the locale's, as on
// the web. `name`, `id` and the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMDatePicker: PMDatePickerRendering {
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  @State private var draft: PMCalendarDate?
  @State private var presented: Bool
  private let props: PMDatePickerProps

  public init(props: PMDatePickerProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let current = value
    let invalid =
      (props.invalid ?? false) || (field?.invalid ?? false) || Self.refused(props, current)

    PMDatePickerField(
      props: props, current: current, size: size, invalid: invalid, disabled: disabled,
      open: presented, name: name ?? "", hint: field?.hint, locale: locale, calendar: calendar,
      date: date, onOpen: { setOpen(true) }, onClear: { commit(nil) }
    )
    .modifier(
      PMAnchoredPresentation(
        isPresented: Binding(get: { presented }, set: setOpen),
        compact: props.presentation == .popover ? .popover : .sheet,
        anchor: .point(.bottomTrailing), edge: .top
      ) {
        Self.panel(props, current: current, pick: pick)
      }
    )
    .environment(\.locale, locale)
    .environment(\.calendar, calendar)
    .pmFocusWhenNamed()
    .pmMember(
      "DatePicker",
      Self.attributes(
        props, size: size, current: current, open: presented, invalid: invalid, disabled: disabled))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The chosen date: the controlled `value` when given (`nil` inside it is
  /// none), otherwise the field's own.
  private var value: PMCalendarDate? {
    props.value ?? draft
  }

  private var timed: Bool {
    props.granularity == .hour || props.granularity == .minute
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  private var calendar: Calendar {
    PMDates.calendar(locale, firstWeekday: props.firstDayOfWeek.map { $0.rawValue + 1 })
  }

  /// The chosen date as a moment, for the system's compact picker.
  private var date: Binding<Date> {
    Binding {
      value.flatMap { PMDates.date($0, in: calendar) } ?? Date()
    } set: { next in
      commit(PMDates.value(next, in: calendar, time: timed))
    }
  }

  /// A day chosen in the popup: the date it names, with the chosen time kept
  /// at a time granularity (midnight when there is none yet). It closes the
  /// popup.
  private func pick(_ day: PMCalendarDate) {
    var next = day
    if timed {
      next.hour = value?.hour ?? 0
      next.minute = value?.minute ?? 0
    }
    commit(next)
    setOpen(false)
  }

  private func commit(_ chosen: PMCalendarDate?) {
    // At `hour` the minute is not the person's to set, so it is 0.
    var next = chosen
    if props.granularity == .hour, next != nil { next?.minute = 0 }
    let same =
      next.map { a in value.map { b in PMDates.date(a, in: calendar) == PMDates.date(b, in: calendar) } ?? false }
      ?? (value == nil)
    guard !same else { return }
    draft = next
    props.onChange?(next)
  }

  private func setOpen(_ open: Bool) {
    presented = open
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  // MARK: The parts

  /// Whether `day` is one the field refuses: outside `minValue` and
  /// `maxValue`, or refused by `isDateUnavailable`.
  static func refused(_ props: PMDatePickerProps, _ day: PMCalendarDate?) -> Bool {
    guard let day else { return false }
    let key = PMDates.key(day)
    if let low = props.minValue, key < PMDates.key(low) { return true }
    if let high = props.maxValue, key > PMDates.key(high) { return true }
    return props.isDateUnavailable?(day) ?? false
  }

  /// The popup: Calendar's month grid, named "Choose a date", on the chosen
  /// day's month, or while empty on today's held to `minValue` and
  /// `maxValue`, so it opens where a day can be chosen.
  static func panel(
    _ props: PMDatePickerProps, current: PMCalendarDate?,
    pick: @escaping @MainActor (PMCalendarDate) -> Void
  ) -> some View {
    PMMonthGrid(
      selection: .day(current), focus: current == nil ? openingDay(props) : nil,
      minValue: props.minValue, maxValue: props.maxValue,
      unavailable: props.isDateUnavailable, locale: props.locale,
      firstDayOfWeek: props.firstDayOfWeek,
      previousLabel: props.messages?.previousMonth ?? PMStrings.calendarMessages.previousMonth,
      nextLabel: props.messages?.nextMonth ?? PMStrings.calendarMessages.nextMonth, onPick: pick
    )
    .accessibilityLabel(Text(props.messages?.chooseDate ?? PMStrings.datePickerChooseDate))
  }

  /// Today, or the nearer bound when today is outside them.
  private static func openingDay(_ props: PMDatePickerProps) -> PMCalendarDate {
    let today = PMDates.value(Date(), in: PMDates.calendar(.current))
    if let low = props.minValue, PMDates.key(today) < PMDates.key(low) { return low }
    if let high = props.maxValue, PMDates.key(today) > PMDates.key(high) { return high }
    return today
  }

  static func attributes(
    _ props: PMDatePickerProps, size: PMControlSize, current: PMCalendarDate?, open: Bool,
    invalid: Bool, disabled: Bool
  ) -> [String: String] {
    var attributes = [
      "size": size.rawValue, "state": open ? "open" : "closed",
      "granularity": (props.granularity ?? .day).rawValue,
    ]
    if current == nil { attributes["placeholder"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// The field: the system's compact date (and the hour picker at `hour`), or
/// the locale's pattern while empty, the clear button and the calendar
/// button, in Input's container, held while the popup is open.
private struct PMDatePickerField: View {
  @Environment(\.pmTheme) private var theme
  let props: PMDatePickerProps
  let current: PMCalendarDate?
  let size: PMControlSize
  let invalid: Bool
  let disabled: Bool
  let open: Bool
  let name: String
  let hint: String?
  let locale: Locale
  let calendar: Calendar
  let date: Binding<Date>
  let onOpen: @MainActor () -> Void
  let onClear: @MainActor () -> Void

  var body: some View {
    let metrics = PMControlMetrics(size, theme)
    // A row while it fits; otherwise, at the largest text sizes, the date on
    // its own line and the hour and the buttons under it, so the field grows
    // taller rather than past the window.
    ViewThatFits(in: .horizontal) {
      HStack(spacing: metrics.gap) {
        entry(metrics, stacked: false)
        buttons(metrics)
      }
      VStack(alignment: .leading, spacing: metrics.gap) {
        entry(metrics, stacked: true)
        HStack(spacing: metrics.gap) {
          if props.granularity == .hour, current != nil { hourPicker }
          Spacer(minLength: 0)
          buttons(metrics)
        }
      }
    }
    .pmTextStyle(metrics.text)
    .pmTabularFigures(true)
    .padding(.leading, metrics.padding)
    .frame(maxWidth: .infinity, minHeight: metrics.height)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: false, focused: false, held: open))
    .disabled(disabled)
    .pmHitTarget()
    // An empty field opens from anywhere in its hit area; a filled one leaves
    // its taps to the system's date.
    .pmOpensOnTap(current == nil && !disabled, onOpen)
    .accessibilityElement(children: .contain)
  }

  /// The system's compact date (and the hour picker at `hour`, unless the
  /// field is `stacked`, which draws it on the line below), or the locale's
  /// pattern while empty.
  @ViewBuilder
  private func entry(_ metrics: PMControlMetrics, stacked: Bool) -> some View {
    let colors = theme.colors
    let hourly = props.granularity == .hour
    let timed = hourly || props.granularity == .minute
    if current != nil {
      HStack(spacing: metrics.gap) {
        DatePicker(name, selection: date, in: bounds, displayedComponents: components)
          .datePickerStyle(.compact)
          .labelsHidden()
        if hourly && !stacked { hourPicker }
      }
      .tint(colors.accentText.color)
      .frame(maxWidth: .infinity, alignment: .leading)
      .pmFieldHint(invalid: invalid, hint)
    } else {
      Button(action: onOpen) {
        Text(PMDates.pattern(locale, time: timed, minute: !hourly))
          .foregroundStyle((disabled ? colors.textDisabled : colors.textMuted).color)
          .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
          .pmHitRegion(height: metrics.height)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(name))
      .pmFieldHint(invalid: invalid, hint)
    }
  }

  private var hourPicker: some View {
    PMHourPicker(label: name, selection: date, calendar: calendar, locale: locale)
      .tint(theme.colors.accentText.color)
  }

  /// The clear button while there is a date to clear, and the calendar button.
  @ViewBuilder
  private func buttons(_ metrics: PMControlMetrics) -> some View {
    if (props.clearable ?? false) && current != nil && !disabled {
      Button(action: onClear) {
        PMIconView(.clear, size: size)
      }
      .buttonStyle(PMEmbeddedButtonStyle(side: metrics.height))
      .accessibilityLabel(Text(props.messages?.clear ?? PMStrings.clear))
    }
    PMButton(
      props: PMButtonProps(
        disabled: disabled, icon: .calendar, iconOnly: true,
        label: props.messages?.showCalendar ?? PMStrings.datePickerShowCalendar,
        onClick: onOpen, size: size, appearance: .ghostNeutral))
  }

  /// What the system's picker draws: the date, and at `minute` the time.
  private var components: DatePickerComponents {
    props.granularity == .minute ? [.date, .hourAndMinute] : [.date]
  }

  /// What the system's picker offers: from `minValue` to `maxValue`.
  private var bounds: ClosedRange<Date> {
    let low = props.minValue.flatMap { PMDates.date($0, in: calendar) } ?? .distantPast
    let high = props.maxValue.flatMap { day -> Date? in
      // The last moment of the last day, so the whole of it can be chosen.
      PMDates.date(day, in: calendar).flatMap { calendar.date(byAdding: .day, value: 1, to: $0) }
        .map { $0.addingTimeInterval(-1) }
    } ?? .distantFuture
    return low...max(low, high)
  }
}

/// DatePicker's states, from the spec's States table. The open rows draw the
/// field and the month grid under it, because the harness renders no
/// presentation.
public struct DatePickerStates: PMStates {
  public let member = "DatePicker"

  public init() {}

  private static let due = PMCalendarDate(year: 2026, month: 3, day: 18)

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("empty — the locale's pattern", expect: ["placeholder": "true", "size": "md"]) {
        PMDatePicker(props: PMDatePickerProps(ariaLabel: "Due date"))
      },
      PMStateEntry("filled", expect: ["state": "closed"]) {
        PMDatePicker(props: PMDatePickerProps(ariaLabel: "Due date", defaultValue: Self.due))
      },
      PMStateEntry("open — the month grid, the value chosen", expect: ["state": "open"]) {
        DatePickerOpen(props: PMDatePickerProps(ariaLabel: "Due date", defaultValue: Self.due))
      },
      PMStateEntry("open — empty, bounds and unavailable days", expect: ["state": "open"]) {
        DatePickerOpen(
          props: PMDatePickerProps(
            ariaLabel: "Delivery day", isDateUnavailable: { CalendarStates.weekend($0) },
            maxValue: PMCalendarDate(year: 2026, month: 3, day: 27),
            minValue: PMCalendarDate(year: 2026, month: 3, day: 4)))
      },
      PMStateEntry("locale order — en-US", expect: ["placeholder": "true"]) {
        PMDatePicker(props: PMDatePickerProps(ariaLabel: "Due date", locale: "en-US"))
      },
      PMStateEntry("locale order — de-DE", expect: ["placeholder": "true"]) {
        PMDatePicker(props: PMDatePickerProps(ariaLabel: "Due date", locale: "de-DE"))
      },
      PMStateEntry("clearable", expect: ["state": "closed"]) {
        PMDatePicker(
          props: PMDatePickerProps(ariaLabel: "Due date", clearable: true, defaultValue: Self.due))
      },
      PMStateEntry("out of range — past maxValue, invalid", expect: ["invalid": "true"]) {
        PMDatePicker(
          props: PMDatePickerProps(
            ariaLabel: "Due date", defaultValue: Self.due,
            maxValue: PMCalendarDate(year: 2026, month: 3, day: 13)))
      },
      PMStateEntry("a refused date — invalid", expect: ["invalid": "true"]) {
        PMDatePicker(
          props: PMDatePickerProps(
            ariaLabel: "Delivery day", defaultValue: Self.due, isDateUnavailable: { _ in true }))
      },
      PMStateEntry("hour — the hour on its own beside the date", expect: ["granularity": "hour"]) {
        PMDatePicker(
          props: PMDatePickerProps(
            ariaLabel: "Starts", defaultValue: PMCalendarDate(year: 2026, month: 3, day: 18, hour: 9, minute: 0),
            granularity: .hour))
      },
      PMStateEntry("datetime — the time beside the date", expect: ["granularity": "minute"]) {
        PMDatePicker(
          props: PMDatePickerProps(
            ariaLabel: "Starts", defaultValue: PMCalendarDate(year: 2026, month: 3, day: 18, hour: 9, minute: 30),
            granularity: .minute))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMDatePicker(props: PMDatePickerProps(ariaLabel: "Due date", size: .sm))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMDatePicker(props: PMDatePickerProps(ariaLabel: "Due date", invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMDatePicker(
          props: PMDatePickerProps(ariaLabel: "Due date", defaultValue: Self.due, disabled: true))
      },
    ]
  }
}

/// An open date picker as the fixture draws it: the field, held, and the
/// month grid on the panel's surface under its end, on the value's month, or
/// while empty on today's held to the bounds, which the fixture sets in the
/// past so the render does not change with the day it is drawn on.
private struct DatePickerOpen: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var locale
  let props: PMDatePickerProps

  var body: some View {
    let current = props.defaultValue ?? nil
    let invalid = PMDatePicker.refused(props, current)
    let calendar = PMDates.calendar(locale)
    VStack(alignment: .trailing, spacing: theme.defaultDensity.space.s1) {
      PMDatePickerField(
        props: props, current: current, size: props.size ?? .md, invalid: invalid, disabled: false,
        open: true, name: props.ariaLabel ?? "", hint: nil, locale: locale, calendar: calendar,
        date: .constant(current.flatMap { PMDates.date($0, in: calendar) } ?? Date()),
        onOpen: {}, onClear: {})
      PMDatePicker.panel(props, current: current, pick: { _ in })
        .modifier(PMPanelFrame(visible: true))
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "DatePicker",
      PMDatePicker.attributes(
        props, size: props.size ?? .md, current: current, open: true, invalid: invalid,
        disabled: false))
  }
}
