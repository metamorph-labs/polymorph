// DateRangePicker (`design/components/date-range-picker.md`), adapted on iOS:
// a start and an end date in one field, chosen on one range calendar, as a
// sheet on iPhone and a popover at the field on iPad (`presentation:
// .popover` keeps the popover on iPhone too). The field is Input's container
// at Input's sizes holding the two dates, each the locale's medium date or,
// while empty, the locale's date pattern, muted, joined by an en dash that is
// not spoken; then the clear button when `clearable` and a range is chosen,
// and the `calendar` button (Button's ghost/neutral icon-only, named "Show
// calendar"). A tap anywhere in the field's hit area but the clear button
// opens the calendar, named "Choose range".
//
// The calendar is Calendar's month grid (`PMMonthGrid`) with the range's
// cells: the two ends take the selection recipe, the days between the accent
// wash in an unbroken band, and hover is the `bg.subtle` wash, so the accent
// wash only means the range. The first day pressed anchors the range, the
// second ends it, in either order, which reports both ends and closes the
// calendar; a half-made range is never reported, and closing the calendar
// with one drops the anchor. A day outside `minValue` and `maxValue`, or one
// `isDateUnavailable` refuses, cannot be chosen, and while the range is
// anchored nor can a day past the nearest refused one on either side, so a
// range never spans a day that cannot be had. `clearable` adds the clear
// button, which reports `nil`. `value` with `onChange` is the controlled
// pair.
//
// Each date is named by `ariaLabel` or the FormField's label and then its
// end's word, `messages.start` or `messages.end` ("Start date", "End date"),
// as the web names each half's segments, with its date as its value, and says
// "Invalid" first in its hint while invalid. `startName`, `endName`, `id` and
// the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMDateRangePicker: PMDateRangePickerRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  @State private var draft: PMDateRange?
  @State private var anchor: PMCalendarDate?
  @State private var presented: Bool
  private let props: PMDateRangePickerProps

  public init(props: PMDateRangePickerProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)

    Self.field(
      props, value: value, size: size, invalid: invalid, disabled: disabled, open: presented,
      locale: locale, name: props.ariaLabel ?? field?.label ?? "", hint: field?.hint,
      onOpen: { setOpen(true) }, onClear: { commit(nil) }
    )
    .modifier(
      PMAnchoredPresentation(
        isPresented: Binding(get: { presented }, set: setOpen),
        compact: props.presentation == .popover ? .popover : .sheet,
        anchor: .point(.bottomTrailing), edge: .top
      ) {
        Self.grid(props, value: value, anchor: anchor, pick: pick)
          .accessibilityLabel(Text(props.messages?.chooseRange ?? PMStrings.dateRangePickerChooseRange))
      }
    )
    .pmFocusWhenNamed()
    .pmMember(
      "DateRangePicker",
      Self.attributes(props, value: value, size: size, open: presented, invalid: invalid))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The chosen range: the controlled `value` when given (`nil` inside it is
  /// none), otherwise the field's own.
  private var value: PMDateRange? {
    props.value ?? draft
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  /// The first press anchors; the second ends the range, in either order.
  private func pick(_ day: PMCalendarDate) {
    guard let start = anchor else {
      anchor = day
      return
    }
    anchor = nil
    let ordered = PMDates.key(day) < PMDates.key(start) ? (day, start) : (start, day)
    commit(PMDateRange(start: ordered.0, end: ordered.1))
    setOpen(false)
  }

  private func commit(_ next: PMDateRange?) {
    draft = next
    props.onChange?(next)
  }

  private func setOpen(_ open: Bool) {
    presented = open
    if !open { anchor = nil }
  }

  // MARK: The parts

  static func field(
    _ props: PMDateRangePickerProps, value: PMDateRange?, size: PMControlSize, invalid: Bool,
    disabled: Bool, open: Bool, locale: Locale, name: String, hint: String?,
    onOpen: @escaping @MainActor () -> Void, onClear: @escaping @MainActor () -> Void
  ) -> some View {
    PMDateRangeField(
      props: props, value: value, size: size, invalid: invalid, disabled: disabled, open: open,
      locale: locale, name: name, hint: hint, onOpen: onOpen, onClear: onClear)
  }

  static func grid(
    _ props: PMDateRangePickerProps, value: PMDateRange?, anchor: PMCalendarDate?,
    pick: @escaping @MainActor (PMCalendarDate) -> Void
  ) -> some View {
    PMMonthGrid(
      selection: anchor.map { .range(start: $0, end: nil) }
        ?? .range(start: value?.start, end: value?.end),
      minValue: props.minValue, maxValue: props.maxValue, unavailable: props.isDateUnavailable,
      locale: props.locale, firstDayOfWeek: props.firstDayOfWeek,
      previousLabel: props.messages?.previousMonth ?? PMStrings.calendarMessages.previousMonth,
      nextLabel: props.messages?.nextMonth ?? PMStrings.calendarMessages.nextMonth, onPick: pick)
  }

  static func attributes(
    _ props: PMDateRangePickerProps, value: PMDateRange?, size: PMControlSize, open: Bool,
    invalid: Bool
  ) -> [String: String] {
    var attributes = ["size": size.rawValue, "state": open ? "open" : "closed"]
    if value == nil { attributes["placeholder"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if props.disabled == true { attributes["disabled"] = "true" }
    return attributes
  }
}

/// The field: the two dates joined by an en dash, the clear button and the
/// calendar button.
private struct PMDateRangeField: View {
  @Environment(\.pmTheme) private var theme
  let props: PMDateRangePickerProps
  let value: PMDateRange?
  let size: PMControlSize
  let invalid: Bool
  let disabled: Bool
  let open: Bool
  let locale: Locale
  let name: String
  let hint: String?
  let onOpen: @MainActor () -> Void
  let onClear: @MainActor () -> Void

  var body: some View {
    let metrics = PMControlMetrics(size, theme)
    let colors = theme.colors
    let dash = Text(verbatim: "–")
      .foregroundStyle(colors.textMuted.color)
      .accessibilityHidden(true)
    // One row while it fits; otherwise, at the largest text sizes, the end on
    // a line of its own with the buttons, so the field grows taller rather
    // than past the window.
    let start = props.messages?.start ?? PMStrings.dateRangePickerStart
    let finish = props.messages?.end ?? PMStrings.dateRangePickerEnd
    ViewThatFits(in: .horizontal) {
      HStack(spacing: metrics.gap) {
        end(value?.start, word: start)
        dash
        end(value?.end, word: finish)
        Spacer(minLength: 0)
        buttons(metrics)
      }
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: metrics.gap) {
          end(value?.start, word: start)
          dash
        }
        HStack(spacing: metrics.gap) {
          end(value?.end, word: finish)
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
    .pmOpensOnTap(!disabled, onOpen)
    .accessibilityElement(children: .contain)
  }

  /// The clear button while there is a range to clear, and the calendar button.
  @ViewBuilder
  private func buttons(_ metrics: PMControlMetrics) -> some View {
    if (props.clearable ?? false) && value != nil && !disabled {
      Button(action: onClear) {
        PMIconView(.clear, size: size)
      }
      .buttonStyle(PMEmbeddedButtonStyle(side: metrics.height))
      .accessibilityLabel(Text(props.messages?.clear ?? PMStrings.clear))
    }
    PMButton(
      props: PMButtonProps(
        disabled: disabled, icon: .calendar, iconOnly: true,
        label: props.messages?.showCalendar ?? PMStrings.datePickerShowCalendar, onClick: onOpen,
        size: size, appearance: .ghostNeutral))
  }

  /// One end: its date, or the locale's pattern while the range is empty,
  /// named by the field's name and then `word`, "Stay, Start date".
  private func end(_ day: PMCalendarDate?, word: String) -> some View {
    let calendar = PMDates.calendar(locale)
    let text = day.flatMap { PMDates.date($0, in: calendar) }.map {
      $0.formatted(.dateTime.day().month(.abbreviated).year().locale(locale))
    }
    let colors = theme.colors
    return Button(action: onOpen) {
      Text(text ?? PMDates.pattern(locale))
        .lineLimit(1)
        .foregroundStyle(
          (disabled ? colors.textDisabled : text == nil ? colors.textMuted : colors.textPrimary)
            .color)
        .fixedSize()
        .frame(minHeight: PMControlMetrics(size, theme).height)
        .pmHitRegion(height: PMControlMetrics(size, theme).height)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(name.isEmpty ? word : "\(name), \(word)"))
    .accessibilityValue(Text(text ?? ""))
    .pmFieldHint(invalid: invalid, hint)
  }
}

/// DateRangePicker's states, from the spec's States table. The open rows draw
/// the field and the range calendar under it, because the harness renders no
/// presentation.
public struct DateRangePickerStates: PMStates {
  public let member = "DateRangePicker"

  public init() {}

  private static let stay = PMDateRange(
    start: PMCalendarDate(year: 2026, month: 3, day: 9),
    end: PMCalendarDate(year: 2026, month: 3, day: 13))

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("empty — the locale's patterns", expect: ["placeholder": "true"]) {
        PMDateRangePicker(props: PMDateRangePickerProps(ariaLabel: "Stay"))
      },
      PMStateEntry("filled", expect: ["state": "closed"]) {
        PMDateRangePicker(props: PMDateRangePickerProps(ariaLabel: "Stay", defaultValue: Self.stay))
      },
      PMStateEntry("open — the range on the grid", expect: ["state": "open"]) {
        DateRangeOpen(props: PMDateRangePickerProps(ariaLabel: "Stay", defaultValue: Self.stay))
      },
      PMStateEntry("open — one day", expect: ["state": "open"]) {
        DateRangeOpen(
          props: PMDateRangePickerProps(
            ariaLabel: "Stay",
            defaultValue: PMDateRange(start: Self.stay.start, end: Self.stay.start)))
      },
      PMStateEntry("open — bounds and unavailable days", expect: ["state": "open"]) {
        DateRangeOpen(
          props: PMDateRangePickerProps(
            ariaLabel: "Stay", defaultValue: Self.stay,
            isDateUnavailable: { CalendarStates.weekend($0) },
            maxValue: PMCalendarDate(year: 2026, month: 3, day: 27),
            minValue: PMCalendarDate(year: 2026, month: 3, day: 4)))
      },
      PMStateEntry(
        "open — anchored, reaching to the nearest refused days", expect: ["state": "open"]
      ) {
        DateRangeOpen(
          props: PMDateRangePickerProps(
            ariaLabel: "Stay", isDateUnavailable: { CalendarStates.weekend($0) },
            maxValue: PMCalendarDate(year: 2026, month: 3, day: 27),
            minValue: PMCalendarDate(year: 2026, month: 3, day: 4)),
          anchor: PMCalendarDate(year: 2026, month: 3, day: 10))
      },
      PMStateEntry("clearable", expect: ["state": "closed"]) {
        PMDateRangePicker(
          props: PMDateRangePickerProps(ariaLabel: "Stay", clearable: true, defaultValue: Self.stay))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMDateRangePicker(props: PMDateRangePickerProps(ariaLabel: "Stay", size: .sm))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMDateRangePicker(
          props: PMDateRangePickerProps(ariaLabel: "Stay", defaultValue: Self.stay, invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMDateRangePicker(
          props: PMDateRangePickerProps(ariaLabel: "Stay", defaultValue: Self.stay, disabled: true))
      },
    ]
  }
}

/// An open range picker as the fixture draws it: the field, and the range
/// calendar on the panel's surface under it, with the first day pressed
/// (`anchor`) when there is one.
private struct DateRangeOpen: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var locale
  let props: PMDateRangePickerProps
  var anchor: PMCalendarDate? = nil

  var body: some View {
    VStack(alignment: .trailing, spacing: theme.defaultDensity.space.s1) {
      PMDateRangePicker.field(
        props, value: props.defaultValue ?? nil, size: props.size ?? .md, invalid: false,
        disabled: false, open: true, locale: locale, name: props.ariaLabel ?? "", hint: nil,
        onOpen: {}, onClear: {})
      PMDateRangePicker.grid(
        props, value: props.defaultValue ?? nil, anchor: anchor, pick: { _ in })
        .modifier(PMPanelFrame(visible: true))
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "DateRangePicker",
      PMDateRangePicker.attributes(
        props, value: props.defaultValue ?? nil, size: props.size ?? .md, open: true,
        invalid: false))
  }
}
