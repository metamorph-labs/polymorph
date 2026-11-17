// MonthInput (`design/components/month-input.md`): a month and a year, with
// no day. SwiftUI's DatePicker has no month-and-year form, so the field is
// Input's container (`PMFieldBox`) at Input's sizes holding the month as the
// locale writes it in figures (`8/2029` in `en-US`, `2029/8` in `ja-JP`), or,
// while empty, the locale's month pattern (`MM/yyyy`), muted, as the web's
// unfilled segments show. A tap anywhere in its hit area opens the platform's
// wheel pickers, the months by the locale's names and the years in its
// digits, side by side in the locale's order, as a sheet on iPhone and a
// popover at the field on iPad, as TimeInput opens its time wheel. A turn of
// either wheel sets the month. The web types the segments with no popup; iOS
// enters a month on wheels, as its own date pickers enter a date.
//
// The value is `YYYY-MM` text, as on the web; text that is not a month shows
// as empty. The wheels offer the months from `min` to `max`, and a value
// outside them, given by the app, marks the field invalid and stays in it.
// Without a value the wheels open on this month, held to the bounds, and set
// nothing until one turns. `locale` orders the wheels, writes the field's
// figures and names the months. `readOnly` shows the month as selectable
// text, one element whose value is the month. `value` with `onChange` is the
// controlled pair.
//
// The field is a button named by `ariaLabel` or its FormField's label, whose
// value is the month in words ("August 2029"), or `messages.empty` while it is
// empty, and whose hint says "Invalid" first while invalid. `name`, `id` and
// the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMMonthInput: PMMonthInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  @State private var draft: PMMonth?
  @State private var presented = false
  private let props: PMMonthInputProps

  public init(props: PMMonthInputProps) {
    self.props = props
    _draft = State(initialValue: PMDates.month(props.defaultValue ?? nil))
  }

  public var body: some View {
    let size = props.size ?? .md
    let metrics = PMControlMetrics(size, theme)
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let current = value
    let invalid =
      (props.invalid ?? false) || (field?.invalid ?? false)
      || PMDates.monthOutOfBounds(current, min: props.min, max: props.max)
    let colors = theme.colors

    HStack(spacing: metrics.gap) {
      if readOnly {
        Text(current.map(figures) ?? "")
          .textSelection(.enabled)
          .foregroundStyle(colors.textSecondary.color)
          .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(name ?? ""))
          .accessibilityValue(Text(current.map(words) ?? empty))
      } else {
        Button {
          presented = true
        } label: {
          Text(current.map(figures) ?? PMDates.monthPattern(locale))
            .foregroundStyle(
              (disabled ? colors.textDisabled : current == nil ? colors.textMuted : colors.textPrimary)
                .color
            )
            .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(name ?? ""))
        .accessibilityValue(Text(current.map(words) ?? empty))
        .pmFieldHint(invalid: invalid, field?.hint)
      }
    }
    .pmTextStyle(metrics.text)
    .pmTabularFigures(true)
    .padding(.horizontal, metrics.padding)
    .frame(maxWidth: .infinity, minHeight: metrics.height)
    .modifier(
      PMFieldBox(
        invalid: invalid, disabled: disabled, readOnly: readOnly, focused: false, held: presented))
    .disabled(disabled)
    .pmHitTarget()
    .pmOpensOnTap(!disabled && !readOnly) { presented = true }
    .modifier(
      PMAnchoredPresentation(
        isPresented: $presented, compact: .sheet, anchor: .point(.bottomLeading), edge: .top
      ) {
        PMMonthWheels(
          label: name ?? "", selection: month, low: PMDates.month(props.min),
          high: PMDates.month(props.max), locale: locale, calendar: calendar
        )
        .padding(theme.defaultDensity.space.s3)
      }
    )
    .environment(\.locale, locale)
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember(
      "MonthInput",
      attributes(size, current: current, invalid: invalid, disabled: disabled, readOnly: readOnly))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The month: the controlled `value` when given (`nil` inside it, or text
  /// that is not a month, is none), otherwise the field's own.
  private var value: PMMonth? {
    props.value.map { PMDates.month($0) } ?? draft
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  private var calendar: Calendar {
    PMDates.calendar(locale)
  }

  /// The month the wheels show: the value, or while empty this month held to
  /// `min` and `max`. Setting it sets the value and reports it.
  private var month: Binding<PMMonth> {
    Binding {
      value ?? opening
    } set: { next in
      guard next != value else { return }
      draft = next
      props.onChange?(PMDates.text(next))
    }
  }

  /// This month, or the nearer bound when this month is outside them.
  private var opening: PMMonth {
    let now = PMDates.value(Date(), in: calendar)
    let today = PMMonth(year: Int(now.year), month: Int(now.month))
    if let low = PMDates.month(props.min), today < low { return low }
    if let high = PMDates.month(props.max), today > high { return high }
    return today
  }

  /// The month in the locale's figures: `8/2029`.
  private func figures(_ month: PMMonth) -> String {
    format(month, style: style.month(.defaultDigits).year())
  }

  /// The month in the locale's words: `August 2029`.
  private func words(_ month: PMMonth) -> String {
    format(month, style: style.month(.wide).year())
  }

  private var style: Date.FormatStyle {
    var style = Date.FormatStyle(date: .omitted, time: .omitted, locale: locale, calendar: calendar)
    style.timeZone = calendar.timeZone
    return style
  }

  private func format(_ month: PMMonth, style: Date.FormatStyle) -> String {
    PMDates.date(month.day, in: calendar).map { $0.formatted(style) } ?? ""
  }

  /// What an empty field says as its value.
  private var empty: String {
    props.messages?.empty ?? PMStrings.monthInputMessages.empty
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  private func attributes(
    _ size: PMControlSize, current: PMMonth?, invalid: Bool, disabled: Bool, readOnly: Bool
  ) -> [String: String] {
    var attributes = ["size": size.rawValue]
    if let current { attributes["month"] = PMDates.text(current) } else { attributes["placeholder"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    return attributes
  }
}

/// The wheels a month is chosen on: the months, by the locale's names, and
/// the years, in its digits without grouping, in the locale's order. Each
/// offers only what lies between `low` and `high`: the years between their
/// years, and in a bound's own year the months on its side. A year turned to
/// one where the chosen month is out of bounds takes the nearest month in.
struct PMMonthWheels: View {
  let label: String
  @Binding var selection: PMMonth
  let low: PMMonth?
  let high: PMMonth?
  let locale: Locale
  let calendar: Calendar

  var body: some View {
    HStack(spacing: 0) {
      if PMDates.yearFirst(locale) {
        yearWheel
        monthWheel
      } else {
        monthWheel
        yearWheel
      }
    }
  }

  /// The years offered: the engine's 1 to 9999, narrowed to the bounds.
  var years: ClosedRange<Int> {
    let first = max(PMDates.years.lowerBound, low?.year ?? PMDates.years.lowerBound)
    let last = min(PMDates.years.upperBound, high?.year ?? PMDates.years.upperBound)
    return first...max(first, last)
  }

  /// The months offered in `year`.
  func months(in year: Int) -> ClosedRange<Int> {
    let first = low.map { $0.year == year ? $0.month : 1 } ?? 1
    let last = high.map { $0.year == year ? $0.month : 12 } ?? 12
    return first...max(first, last)
  }

  /// `month` in `year`, held to what that year offers.
  func held(year: Int, month: Int) -> PMMonth {
    let range = months(in: year)
    return PMMonth(year: year, month: min(range.upperBound, max(range.lowerBound, month)))
  }

  private var shown: PMMonth {
    let year = min(years.upperBound, max(years.lowerBound, selection.year))
    return held(year: year, month: selection.month)
  }

  private var monthWheel: some View {
    let year = shown.year
    let names = calendar.standaloneMonthSymbols
    return Picker(
      label,
      selection: Binding { shown.month } set: { selection = held(year: year, month: $0) }
    ) {
      ForEach(Array(months(in: year)), id: \.self) { month in
        Text(names[month - 1]).tag(month)
      }
    }
    .modifier(PMWheelStyle())
    .labelsHidden()
    .frame(maxWidth: .infinity)
  }

  private var yearWheel: some View {
    let month = shown.month
    return Picker(
      label,
      selection: Binding { shown.year } set: { selection = held(year: $0, month: month) }
    ) {
      ForEach(Array(years), id: \.self) { year in
        Text(year.formatted(.number.grouping(.never).locale(locale))).tag(year)
      }
    }
    .modifier(PMWheelStyle())
    .labelsHidden()
    .frame(maxWidth: .infinity)
  }
}

/// MonthInput's states, from the spec's States table: a card's expiry,
/// August 2029, and fixed months rather than this one, so a render does not
/// change with the month it is drawn in.
public struct MonthInputStates: PMStates {
  public let member = "MonthInput"

  public init() {}

  private static let expiry = "2029-08"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("empty", expect: ["size": "md", "placeholder": "true"]) {
        PMMonthInput(props: PMMonthInputProps(ariaLabel: "Expires"))
      },
      PMStateEntry("filled", expect: ["size": "md", "month": Self.expiry]) {
        PMMonthInput(props: PMMonthInputProps(ariaLabel: "Expires", defaultValue: Self.expiry))
      },
      PMStateEntry("sizes side by side", expect: ["size": "sm"]) {
        MonthInputSizes(expiry: Self.expiry)
      },
      PMStateEntry("out-of-range value", expect: ["invalid": "true", "month": "2026-02"]) {
        PMMonthInput(
          props: PMMonthInputProps(
            ariaLabel: "Billing month, before the first allowed month", defaultValue: "2026-02",
            max: "2027-02", min: "2026-03"))
      },
      PMStateEntry("locale order — en-US", expect: ["month": Self.expiry]) {
        PMMonthInput(
          props: PMMonthInputProps(ariaLabel: "Expires", defaultValue: Self.expiry, locale: "en-US"))
      },
      PMStateEntry("locale order — ja-JP", expect: ["month": Self.expiry]) {
        PMMonthInput(
          props: PMMonthInputProps(ariaLabel: "有効期限", defaultValue: Self.expiry, locale: "ja-JP"))
      },
      PMStateEntry("right-to-left locale — he-IL", expect: ["month": Self.expiry]) {
        PMMonthInput(
          props: PMMonthInputProps(ariaLabel: "תוקף", defaultValue: Self.expiry, locale: "he-IL"))
        .environment(\.layoutDirection, .rightToLeft)
      },
      PMStateEntry("readOnly", expect: ["readonly": "true"]) {
        PMMonthInput(
          props: PMMonthInputProps(ariaLabel: "Expires", defaultValue: Self.expiry, readOnly: true))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMMonthInput(props: PMMonthInputProps(ariaLabel: "Expires, required", invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMMonthInput(
          props: PMMonthInputProps(ariaLabel: "Expires", defaultValue: Self.expiry, disabled: true))
      },
      // The field a FormField governs, named by its label through the field
      // context, as FormField hands it over. FormField's own root would be the
      // entry's first element, so the context is given directly.
      PMStateEntry("expiry form", expect: ["placeholder": "true"]) {
        PMMonthInput(props: PMMonthInputProps(min: "2020-01", name: "expiry"))
          .environment(
            \.pmField, PMFieldContext(label: "Expires", hint: nil, required: false, invalid: false))
      },
    ]
  }
}

/// The three sizes in a row, a field's gap apart.
private struct MonthInputSizes: View {
  @Environment(\.pmTheme) private var theme
  let expiry: String

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      ForEach(PMControlSize.allCases, id: \.self) { size in
        PMMonthInput(
          props: PMMonthInputProps(
            ariaLabel: "Expires (\(size.rawValue))", defaultValue: expiry, size: size))
      }
    }
  }
}
