// The parts the date members share: a `PMCalendarDate` as a Foundation date
// and back, a month as MonthInput's `YYYY-MM` text and back, the wheel style
// of a picker (MonthInput, DurationInput), the hour picker of the `hour`
// granularity (DatePicker, TimeInput), the month grid Calendar draws and
// DateRangePicker's popup holds (`calendar.md`), and Countdown's time
// (`PMCountdownTime`).

import PolymorphTokens
import SwiftUI

/// Dates as the contract carries them, a `PMCalendarDate` of the Gregorian
/// calendar with no time zone, and as Foundation's `Date`, a moment, which
/// the platform pickers edit. A calendar date is midnight, or its `hour` and
/// `minute`, in the person's time zone.
enum PMDates {
  static func calendar(_ locale: Locale, firstWeekday: Int? = nil) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = locale
    calendar.timeZone = .current
    if let firstWeekday { calendar.firstWeekday = firstWeekday }
    return calendar
  }

  static func date(_ value: PMCalendarDate, in calendar: Calendar) -> Date? {
    calendar.date(
      from: DateComponents(
        year: Int(value.year), month: Int(value.month), day: Int(value.day),
        hour: value.hour.map(Int.init) ?? 0, minute: value.minute.map(Int.init) ?? 0))
  }

  /// The calendar date of `date`, with its time when `time` is set.
  static func value(_ date: Date, in calendar: Calendar, time: Bool = false) -> PMCalendarDate {
    let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
    return PMCalendarDate(
      year: Double(parts.year ?? 0), month: Double(parts.month ?? 1), day: Double(parts.day ?? 1),
      hour: time ? Double(parts.hour ?? 0) : nil, minute: time ? Double(parts.minute ?? 0) : nil)
  }

  /// The day a calendar date names, as a sortable key: `20261015`.
  static func key(_ value: PMCalendarDate) -> Int {
    Int(value.year) * 10_000 + Int(value.month) * 100 + Int(value.day)
  }

  static func sameDay(_ a: PMCalendarDate?, _ b: PMCalendarDate?) -> Bool {
    guard let a, let b else { return false }
    return key(a) == key(b)
  }

  /// The locale's pattern for an empty date field (`dd/MM/yyyy`, `MM/dd/yyyy`),
  /// the web's unfilled segments.
  static func pattern(_ locale: Locale, time: Bool = false, minute: Bool = true) -> String {
    let template = time ? (minute ? "ddMMyyyyjjmm" : "ddMMyyyyjj") : "ddMMyyyy"
    return DateFormatter.dateFormat(fromTemplate: template, options: 0, locale: locale) ?? ""
  }

  /// The locale's pattern for an empty time field (`HH:mm`, `h:mm a`).
  static func timePattern(_ locale: Locale, minute: Bool = true) -> String {
    DateFormatter.dateFormat(fromTemplate: minute ? "jjmm" : "jj", options: 0, locale: locale) ?? ""
  }

  /// The locale's pattern for an empty month field (`MM/yyyy`, `yyyy/MM`).
  static func monthPattern(_ locale: Locale) -> String {
    DateFormatter.dateFormat(fromTemplate: "MMyyyy", options: 0, locale: locale) ?? ""
  }

  /// Whether the locale writes the year before the month (`2029/8` in
  /// `ja-JP`), which orders a month field's wheels.
  static func yearFirst(_ locale: Locale) -> Bool {
    let pattern = DateFormatter.dateFormat(fromTemplate: "MMMMyyyy", options: 0, locale: locale) ?? ""
    guard let year = pattern.firstIndex(of: "y"), let month = pattern.firstIndex(of: "M") else {
      return false
    }
    return year < month
  }

  /// The years a month field offers: the engine's year segment, 1 to 9999
  /// (`segmentRange` in `packages/engine/src/dates/segments.ts`).
  static let years = 1...9999

  /// `YYYY-MM` as its year and month, or `nil` when the text is not a month:
  /// four digits, a dash and two digits, a year from 1 and a month from 1 to
  /// 12 (the engine's `monthDraft`).
  static func month(_ text: String?) -> PMMonth? {
    guard let text else { return nil }
    let parts = text.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 2, parts[0].count == 4, parts[1].count == 2,
      parts.allSatisfy({ $0.allSatisfy { $0.isASCII && $0.isNumber } }),
      let year = Int(parts[0]), let month = Int(parts[1]), year >= 1, (1...12).contains(month)
    else { return nil }
    return PMMonth(year: year, month: month)
  }

  /// A month as `YYYY-MM`, the year in four digits, so two months compare as
  /// text (the engine's `monthFieldValue`).
  static func text(_ month: PMMonth) -> String {
    let year = String(month.year)
    let digits = String(repeating: "0", count: max(0, 4 - year.count)) + year
    return "\(digits)-\(month.month < 10 ? "0" : "")\(month.month)"
  }

  /// Whether a month is before `min` or after `max`, each `YYYY-MM` text. A
  /// bound that is not a month bounds nothing, and no month is never out of
  /// its bounds (the engine's `monthOutOfBounds`).
  static func monthOutOfBounds(_ value: PMMonth?, min: String?, max: String?) -> Bool {
    guard let value else { return false }
    if let low = month(min), value < low { return true }
    if let high = month(max), value > high { return true }
    return false
  }
}

/// A month of the Gregorian calendar: what MonthInput holds, and writes as
/// `YYYY-MM` (`month-input.md`).
struct PMMonth: Comparable, Hashable {
  let year: Int
  let month: Int

  static func < (a: PMMonth, b: PMMonth) -> Bool {
    (a.year, a.month) < (b.year, b.month)
  }

  /// The first day of the month, as the contract's dates are carried.
  var day: PMCalendarDate {
    PMCalendarDate(year: Double(year), month: Double(month), day: 1)
  }
}

/// A picker as a wheel on iOS, the platform's own picker for a value from a
/// run of them (a time's hours, a month's year); a Mac has no wheel, so it is
/// the menu there.
struct PMWheelStyle: ViewModifier {
  func body(content: Content) -> some View {
    #if os(iOS)
      content.pickerStyle(.wheel)
    #else
      content.pickerStyle(.menu)
    #endif
  }
}

/// The hour of a moment, chosen from the day's twenty-four hours in the
/// platform's menu picker, each written as the locale writes an hour ("9 AM",
/// "09"), with its hour cycle: the time at `hour` granularity, where the
/// system's time picker would draw the minute too. Choosing an hour keeps the
/// day and sets the minute, the second and the fraction to 0.
struct PMHourPicker: View {
  let label: String
  @Binding var selection: Date
  let calendar: Calendar
  let locale: Locale
  /// The wheel of a time picker's popup on iOS, rather than the field's menu.
  var wheel = false

  var body: some View {
    Picker(label, selection: hour) {
      ForEach(0..<24, id: \.self) { hour in
        Text(name(of: hour)).tag(hour)
      }
    }
    .modifier(PMHourPickerStyle(wheel: wheel))
    .labelsHidden()
  }

  private var hour: Binding<Int> {
    Binding {
      calendar.component(.hour, from: selection)
    } set: { hour in
      let day = calendar.startOfDay(for: selection)
      selection = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? selection
    }
  }

  private func name(of hour: Int) -> String {
    let day = calendar.startOfDay(for: selection)
    let moment = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
    var style = Date.FormatStyle(date: .omitted, time: .omitted, locale: locale, calendar: calendar)
    style.timeZone = calendar.timeZone
    return moment.formatted(style.hour())
  }
}

/// The menu, or on iOS the wheel when it is asked for; a Mac has no wheel.
private struct PMHourPickerStyle: ViewModifier {
  let wheel: Bool

  func body(content: Content) -> some View {
    #if os(iOS)
      if wheel {
        content.pickerStyle(.wheel)
      } else {
        content.pickerStyle(.menu)
      }
    #else
      content.pickerStyle(.menu)
    #endif
  }
}

/// What a month grid marks as chosen: one day, or a range with its ends.
enum PMGridSelection {
  case day(PMCalendarDate?)
  case range(start: PMCalendarDate?, end: PMCalendarDate?)
}

/// The month grid (`calendar.md`): the header (the previous and next buttons,
/// Button's ghost/neutral/sm icon-only, around the month and year in
/// `text.sm` with tabular figures), the weekday row in `text.xs` `text.muted`,
/// and the weeks, with no days from other months. A day is the small control
/// height square in `text.sm`, its cell the hit target wide; under the
/// pointer the accent wash, pressed its third step; chosen, the selection
/// recipe (`selection.bg`, `selection.text`, a `selection.border` hairline);
/// today, an `accent.bg` hairline and `accent.text` unless chosen; an
/// unavailable day (outside `min` and `max`, or refused by `unavailable`) is
/// struck through in `text.disabled` and cannot be chosen. In a range the ends
/// take the selection recipe and the days between take the accent wash in an
/// unbroken band, and hover is the `bg.subtle` wash, so the accent wash only
/// ever means the range. While a range is anchored (one end chosen, the other
/// not) it reaches only the run of days around the anchor: a day past the
/// nearest refused day on either side is unavailable too, looked for as far as
/// the month shown, as the web's range calendar does. Changing the month
/// slides the new one in from the side it comes from, and fades it under
/// Reduce Motion; the month is announced.
///
/// To assistive technology each day is a button named by its full date, with
/// the selected trait while chosen or inside a chosen range, and today's day
/// says so as its value, in the locale's word for it.
struct PMMonthGrid: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var month: Date?
  @State private var forward = true
  let selection: PMGridSelection
  var focus: PMCalendarDate? = nil
  var minValue: PMCalendarDate? = nil
  var maxValue: PMCalendarDate? = nil
  var unavailable: (@MainActor (PMCalendarDate) -> Bool)? = nil
  var disabled = false
  var locale: String? = nil
  /// The first day of the week, 0 being Sunday; the locale's when `nil`.
  var firstDayOfWeek: PMFirstDayOfWeek? = nil
  let previousLabel: String
  let nextLabel: String
  var onMonth: (@MainActor (PMCalendarDate) -> Void)? = nil
  let onPick: @MainActor (PMCalendarDate) -> Void

  private var resolvedLocale: Locale {
    locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  private var calendar: Calendar {
    PMDates.calendar(resolvedLocale, firstWeekday: firstDayOfWeek.map { $0.rawValue + 1 })
  }

  var body: some View {
    let density = theme.defaultDensity
    let space = density.space
    let shown = month ?? start(of: anchorDate)
    let pitch = max(density.controlHeight.sm, density.hitTarget)
    let calendar = calendar
    let reach = reach(shown: shown, calendar)

    VStack(spacing: space.s2) {
      HStack(spacing: space.s2) {
        PMButton(
          props: PMButtonProps(
            disabled: disabled, icon: .previous, iconOnly: true, label: previousLabel,
            onClick: { step(-1, from: shown) }, size: .sm, appearance: .ghostNeutral))
        Text(shown.formatted(.dateTime.month(.wide).year().locale(resolvedLocale)))
          .pmTextStyle(theme.text.sm)
          .pmTabularFigures(true)
          .foregroundStyle(theme.colors.textPrimary.color)
          .frame(maxWidth: .infinity)
          .accessibilityAddTraits(.isHeader)
        PMButton(
          props: PMButtonProps(
            disabled: disabled, icon: .next, iconOnly: true, label: nextLabel,
            onClick: { step(1, from: shown) }, size: .sm, appearance: .ghostNeutral))
      }
      .frame(minHeight: density.controlHeight.sm)
      HStack(spacing: 0) {
        ForEach(weekdays(calendar), id: \.self) { name in
          Text(name)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(theme.colors.textMuted.color)
            .frame(width: pitch)
            .accessibilityHidden(true)
        }
      }
      VStack(spacing: 0) {
        ForEach(Array(weeks(of: shown, calendar).enumerated()), id: \.offset) { _, week in
          HStack(spacing: 0) {
            ForEach(Array(week.enumerated()), id: \.offset) { _, day in
              if let day {
                PMGridDay(
                  day: day, date: PMDates.date(day, in: calendar) ?? shown, role: role(day),
                  today: PMDates.sameDay(day, today(calendar)),
                  unavailable: isUnavailable(day, reach: reach),
                  range: isRange, locale: resolvedLocale, pitch: pitch
                ) { onPick(day) }
                .disabled(disabled)
              } else {
                Color.clear.frame(width: pitch, height: pitch)
              }
            }
          }
        }
      }
      .id(shown)
      .transition(
        reduceMotion
          ? .opacity
          : .asymmetric(
            insertion: .push(from: forward ? .trailing : .leading), removal: .opacity))
    }
    .padding(space.s3)
    .fixedSize()
    .accessibilityElement(children: .contain)
  }

  private var isRange: Bool {
    if case .range = selection { return true }
    return false
  }

  private var anchorDate: Date {
    let calendar = calendar
    let chosen: PMCalendarDate? =
      switch selection {
      case .day(let day): day
      case .range(let start, _): start
      }
    return (focus ?? chosen).flatMap { PMDates.date($0, in: calendar) } ?? Date()
  }

  private func today(_ calendar: Calendar) -> PMCalendarDate {
    PMDates.value(Date(), in: calendar)
  }

  private func start(of date: Date) -> Date {
    calendar.dateInterval(of: .month, for: date)?.start ?? date
  }

  private func step(_ months: Int, from shown: Date) {
    guard let next = calendar.date(byAdding: .month, value: months, to: shown) else { return }
    let motion = theme.defaultMotion
    forward = months > 0
    withAnimation(motion.easing.enter.animation(duration: motion.duration.surface)) {
      month = next
    }
    let label = next.formatted(.dateTime.month(.wide).year().locale(resolvedLocale))
    AccessibilityNotification.Announcement(label).post()
    onMonth?(PMDates.value(next, in: calendar))
  }

  /// The locale's short weekday names, from its first day of the week.
  private func weekdays(_ calendar: Calendar) -> [String] {
    let names = calendar.shortStandaloneWeekdaySymbols
    let first = calendar.firstWeekday - 1
    return Array(names[first...] + names[..<first])
  }

  /// The month's weeks, a row of seven each, `nil` for a day of another month.
  private func weeks(of month: Date, _ calendar: Calendar) -> [[PMCalendarDate?]] {
    guard let range = calendar.range(of: .day, in: .month, for: month) else { return [] }
    let weekday = calendar.component(.weekday, from: month)
    let lead = (weekday - calendar.firstWeekday + 7) % 7
    var cells: [PMCalendarDate?] = Array(repeating: nil, count: lead)
    for day in range {
      if let date = calendar.date(byAdding: .day, value: day - 1, to: month) {
        cells.append(PMDates.value(date, in: calendar))
      }
    }
    while cells.count % 7 != 0 { cells.append(nil) }
    return stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<$0 + 7]) }
  }

  private func isUnavailable(_ day: PMCalendarDate, reach: PMGridReach) -> Bool {
    let key = PMDates.key(day)
    if let minValue, key < PMDates.key(minValue) { return true }
    if let maxValue, key > PMDates.key(maxValue) { return true }
    if let after = reach.after, key <= after { return true }
    if let before = reach.before, key >= before { return true }
    return unavailable?(day) ?? false
  }

  /// While a range is anchored, the refused days nearest the anchor on each
  /// side, looked for from the anchor as far as the shown month reaches: the
  /// range cannot span them. Nothing while no range is anchored, or no day is
  /// refused.
  private func reach(shown: Date, _ calendar: Calendar) -> PMGridReach {
    guard case .range(let start?, nil) = selection, let unavailable,
      let anchor = PMDates.date(start, in: calendar),
      let month = calendar.dateInterval(of: .month, for: shown)
    else { return PMGridReach() }
    let nearest = { (step: Int, inside: (Date) -> Bool) -> Int? in
      var day = anchor
      while let next = calendar.date(byAdding: .day, value: step, to: day), inside(next) {
        let value = PMDates.value(next, in: calendar)
        if let minValue, PMDates.key(value) < PMDates.key(minValue) { return nil }
        if let maxValue, PMDates.key(value) > PMDates.key(maxValue) { return nil }
        if unavailable(value) { return PMDates.key(value) }
        day = next
      }
      return nil
    }
    return PMGridReach(
      after: nearest(-1) { $0 >= min(month.start, anchor) },
      before: nearest(1) { $0 < max(month.end, anchor) })
  }

  private func role(_ day: PMCalendarDate) -> PMGridDayRole {
    let key = PMDates.key(day)
    switch selection {
    case .day(let chosen):
      return PMDates.sameDay(day, chosen) ? .selected : .none
    case .range(let start, let end):
      guard let start else { return .none }
      let low = PMDates.key(start)
      let high = end.map(PMDates.key) ?? low
      if key == low || key == high { return .selected }
      return key > low && key < high ? .middle : .none
    }
  }
}

/// The run of days an anchored range can reach, by day key: past `after` and
/// before `before`, either open when it is `nil`.
struct PMGridReach {
  var after: Int? = nil
  var before: Int? = nil
}

/// A day's place in what is chosen.
enum PMGridDayRole {
  case none
  case selected
  case middle
}

/// One day of the grid.
private struct PMGridDay: View {
  @Environment(\.isEnabled) private var enabled
  let day: PMCalendarDate
  let date: Date
  let role: PMGridDayRole
  let today: Bool
  let unavailable: Bool
  let range: Bool
  let locale: Locale
  let pitch: CGFloat
  let pick: @MainActor () -> Void

  var body: some View {
    Button(action: pick) {
      Text(Int(day.day).formatted(.number.locale(locale)))
    }
    .buttonStyle(
      PMGridDayStyle(
        role: role, today: today, unavailable: unavailable, inert: !enabled, range: range,
        pitch: pitch))
    .disabled(unavailable)
    .accessibilityLabel(Text(date.formatted(.dateTime.weekday(.wide).day().month(.wide).year().locale(locale))))
    // A day inside a chosen range is chosen too, as the web's `aria-selected` says.
    .accessibilityAddTraits(role == .none ? [] : .isSelected)
    .modifier(PMTodayValue(today: today, locale: locale))
  }
}

/// Today's day says so as its value, the web's `aria-current="date"`: the
/// locale's word for the day that is now ("today", "aujourd’hui").
private struct PMTodayValue: ViewModifier {
  let today: Bool
  let locale: Locale

  func body(content: Content) -> some View {
    if today {
      content.accessibilityValue(Text(Self.word(locale)))
    } else {
      content
    }
  }

  private static func word(_ locale: Locale) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.dateTimeStyle = .named
    formatter.locale = locale
    return formatter.localizedString(from: DateComponents(day: 0))
  }
}

private struct PMGridDayStyle: ButtonStyle {
  let role: PMGridDayRole
  let today: Bool
  /// Struck through and dimmed: outside the bounds, or refused.
  let unavailable: Bool
  /// Dimmed with the grid: a disabled calendar.
  let inert: Bool
  let range: Bool
  let pitch: CGFloat

  func makeBody(configuration: Configuration) -> some View {
    PMGridDayCell(style: self, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMGridDayCell<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let style: PMGridDayStyle
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    let side = theme.defaultDensity.controlHeight.sm
    let motion = theme.defaultMotion
    let shape = RoundedRectangle(cornerRadius: theme.radius.sm)
    let off = style.unavailable || style.inert
    let active = !off && (hovering || pressed)
    let chosen = style.role == .selected
    let wash: PMDynamicColor? =
      chosen
      ? (active ? colors.selectionBgHover : colors.selectionBg)
      : style.role == .middle
        ? colors.accentSubtle
        : active
          ? (style.range ? colors.bgSubtle : pressed ? colors.accentSubtleActive : colors.accentSubtle)
          : nil
    let text =
      off
      ? colors.textDisabled
      : chosen
        ? colors.selectionText
        : style.role == .middle
          ? colors.textPrimary
          : style.today || (active && !style.range) ? colors.accentText : colors.textPrimary
    let border: PMDynamicColor? =
      chosen ? colors.selectionBorder : style.today && !off ? colors.accentBg : nil

    label()
      .pmTextStyle(theme.text.sm)
      .pmTabularFigures(true)
      .strikethrough(style.unavailable)
      .foregroundStyle(text.color)
      .frame(width: side, height: side)
      .background {
        if style.role == .middle {
          // The band runs through the whole cell, so the range reads as one.
          Rectangle().fill(colors.accentSubtle.color).frame(width: style.pitch)
        } else if let wash {
          shape.fill(wash.color)
        }
      }
      .overlay { if let border { shape.strokeBorder(border.color, lineWidth: 1) } }
      .frame(width: style.pitch, height: style.pitch)
      .contentShape(.rect)
      .pmPressFeedback(pressed && !off)
      .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
      .onHover { hovering = $0 }
  }
}

// MARK: - Countdown's time

/// Countdown's time (`countdown.md`), the engine's `countdownMoment`,
/// `countdownLeft`, `countdownClock` and `countdownSpoken`: the moment `until`
/// names, the whole seconds left, and the digits and the words it writes. The
/// time left is always read from the clock and never counted down by
/// subtraction, so a late wake or a changed system clock cannot make it drift.
enum PMCountdownTime {
  /// A second, in the clock's seconds.
  static let second: TimeInterval = 1
  /// The marks, in seconds left, at which a Countdown that announces says
  /// the time left: one minute, which leaves more than the 20 seconds WCAG
  /// 2.2.1 asks a warning to leave, and ten seconds, the last notice.
  static let marks = [60, 10]
  /// Seconds in a minute and in an hour, the clock's fields.
  private static let minute = 60
  private static let hour = 3_600

  /// The moment `until` names, or nil when it names none. An instant with an
  /// offset keeps it; one without is read in `timeZone`, the reader's. A
  /// calendar date has no time of day, so it is no moment to count to.
  static func moment(_ until: String, timeZone: TimeZone) -> Date? {
    if until.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil { return nil }
    let offset = ISO8601DateFormatter()
    for options: ISO8601DateFormatter.Options in [
      [.withInternetDateTime, .withFractionalSeconds], [.withInternetDateTime],
    ] {
      offset.formatOptions = options
      if let date = offset.date(from: until) { return date }
    }
    let local = DateFormatter()
    local.locale = Locale(identifier: "en_US_POSIX")
    local.calendar = Calendar(identifier: .gregorian)
    local.timeZone = timeZone
    for format in ["yyyy-MM-dd'T'HH:mm:ss.SSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm"] {
      local.dateFormat = format
      if let date = local.date(from: until) { return date }
    }
    return nil
  }

  /// Whole seconds from `now` to `moment`, rounded up and never below zero:
  /// `0:01` through the last second, `0:00` exactly at the moment.
  static func left(_ moment: Date, now: Date) -> Int {
    Swift.max(0, Int((moment.timeIntervalSince(now) / second).rounded(.up)))
  }

  /// Whether a change from `previous` seconds left to `left` reached a mark.
  /// The end is not a mark, and a count that starts below a mark has not
  /// reached it.
  static func marked(from previous: Int, to left: Int) -> Bool {
    left > 0 && marks.contains { previous > $0 && left <= $0 }
  }

  /// `299` is `4:59`, `3725` is `1:02:05`: minutes and two-digit seconds, with
  /// the hours in front from an hour on and the minutes then in two digits,
  /// in the locale's numerals, the hours not grouped and a colon in every
  /// locale. Negative seconds are none.
  static func clock(_ seconds: Int, locale: Locale) -> String {
    let whole = Swift.max(0, seconds)
    let hours = whole / hour
    let minutes = (whole % hour) / minute
    let rest = whole % minute
    let plain = IntegerFormatStyle<Int>.number.grouping(.never).locale(locale)
    let padded = plain.precision(.integerLength(2...))
    return hours > 0
      ? [plain.format(hours), padded.format(minutes), padded.format(rest)].joined(separator: ":")
      : [plain.format(minutes), padded.format(rest)].joined(separator: ":")
  }

  /// `299` is "4 minutes, 59 seconds": each unit that is not zero in the
  /// locale's words, from the platform's duration formatter, so a screen
  /// reader says words and not "4 colon 59". No time at all is "0 seconds".
  static func spoken(_ seconds: Int, locale: Locale) -> String {
    let style = Duration.UnitsFormatStyle(
      allowedUnits: [.hours, .minutes, .seconds], width: .wide, zeroValueUnits: .hide
    ).locale(locale)
    return Duration.seconds(Swift.max(0, seconds)).formatted(style)
  }
}
