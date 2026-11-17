// TimeInput (`design/components/time-input.md`): a time of day with no date.
// It is SwiftUI's DatePicker showing the hour and minute, the platform's own
// time field, inside Input's container (`PMFieldBox`) at Input's sizes: a
// time shows as the system's compact time, which opens the system's time
// wheel when tapped. An empty field shows the locale's time pattern (`HH:mm`,
// `h:mm a`), muted, as the web's unfilled segments do; a tap on it, anywhere
// in its hit area, presents the time wheel, as a sheet on iPhone and a
// popover at the field on iPad.
//
// The value is a `PMTime`, a wall-clock time with no date and no time zone.
// Editing changes the hour and the minute and keeps the seconds and
// milliseconds a supplied value carries. At `hour` granularity the field is a
// picker of the day's hours (`PMHourPicker`), each as the locale writes an
// hour, because the system's time picker always draws the minute; the minute
// is 0. `hourCycle` overrides the locale's 12- or 24-hour clock, and `locale`
// orders the parts and names the day periods. `readOnly` shows the time as
// selectable text, one element whose value is the time. `value` with
// `onChange` is the controlled pair.
//
// The field is named by `ariaLabel` or its FormField's label and says
// "Invalid" first in its hint while invalid. `name`, `id` and the `aria-*by`
// ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMTimeInput: PMTimeInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  @State private var draft: PMTime?
  @State private var presented = false
  private let props: PMTimeInputProps

  public init(props: PMTimeInputProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
  }

  public var body: some View {
    let size = props.size ?? .md
    let metrics = PMControlMetrics(size, theme)
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let colors = theme.colors
    let current = value

    HStack(spacing: metrics.gap) {
      if readOnly {
        Text(current.map(formatted) ?? "")
          .textSelection(.enabled)
          .foregroundStyle(colors.textSecondary.color)
          .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(name ?? ""))
          .accessibilityValue(Text(current.map(formatted) ?? ""))
      } else if current != nil {
        Group {
          if hourly {
            PMHourPicker(label: name ?? "", selection: time, calendar: calendar, locale: locale)
          } else {
            DatePicker(name ?? "", selection: time, displayedComponents: .hourAndMinute)
              .datePickerStyle(.compact)
              .labelsHidden()
          }
        }
        .tint(colors.accentText.color)
        .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
        .pmFieldHint(invalid: invalid, field?.hint)
      } else {
        Button {
          presented = true
        } label: {
          Text(PMDates.timePattern(locale, minute: !hourly))
            .foregroundStyle((disabled ? colors.textDisabled : colors.textMuted).color)
            .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(name ?? ""))
        .pmFieldHint(invalid: invalid, field?.hint)
      }
    }
    .pmTextStyle(metrics.text)
    .pmTabularFigures(true)
    .padding(.horizontal, metrics.padding)
    .frame(maxWidth: .infinity, minHeight: metrics.height)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: readOnly, focused: false))
    .disabled(disabled)
    .pmHitTarget()
    // An empty field opens from anywhere in its hit area; a filled one leaves
    // its taps to the system's time.
    .pmOpensOnTap(current == nil && !disabled && !readOnly) { presented = true }
    .modifier(
      PMAnchoredPresentation(
        isPresented: $presented, compact: .sheet, anchor: .point(.bottomLeading), edge: .top
      ) {
        Group {
          if hourly {
            PMHourPicker(
              label: name ?? "", selection: time, calendar: calendar, locale: locale, wheel: true)
          } else {
            DatePicker(name ?? "", selection: time, displayedComponents: .hourAndMinute)
              .modifier(PMTimeWheel())
              .labelsHidden()
          }
        }
        .padding(theme.defaultDensity.space.s3)
      }
    )
    .environment(\.locale, locale)
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember(
      "TimeInput",
      attributes(size, current: current, invalid: invalid, disabled: disabled, readOnly: readOnly))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The `hour` granularity: the hour in a picker of its own, which draws no
  /// minute.
  private var hourly: Bool {
    props.granularity == .hour
  }

  /// The time: the controlled `value` when given (`nil` inside it is none),
  /// otherwise the field's own.
  private var value: PMTime? {
    props.value ?? draft
  }

  /// The locale, with `hourCycle`'s clock when it is set.
  private var locale: Locale {
    let base = props.locale.map(Locale.init(identifier:)) ?? environmentLocale
    guard let cycle = props.hourCycle else { return base }
    var parts = Locale.Components(locale: base)
    parts.hourCycle = cycle == .hourCycle12 ? .oneToTwelve : .zeroToTwentyThree
    return Locale(components: parts)
  }

  private var calendar: Calendar {
    PMDates.calendar(locale)
  }

  /// The time as a moment today, for the system's picker; setting it keeps
  /// the finer fields of the time it replaces.
  private var time: Binding<Date> {
    Binding {
      let base = calendar.startOfDay(for: Date())
      let current = value ?? PMTime(hour: 0, minute: 0, second: 0, millisecond: 0)
      return calendar.date(
        bySettingHour: Int(current.hour), minute: Int(current.minute), second: 0, of: base) ?? base
    } set: { next in
      let parts = calendar.dateComponents([.hour, .minute], from: next)
      let minute = props.granularity == .hour ? 0 : Double(parts.minute ?? 0)
      let updated = PMTime(
        hour: Double(parts.hour ?? 0), minute: minute, second: value?.second ?? 0,
        millisecond: value?.millisecond ?? 0)
      guard updated.hour != value?.hour || updated.minute != value?.minute else { return }
      draft = updated
      props.onChange?(updated)
    }
  }

  private func formatted(_ value: PMTime) -> String {
    let base = calendar.startOfDay(for: Date())
    let date =
      calendar.date(
        bySettingHour: Int(value.hour), minute: Int(value.minute), second: 0, of: base) ?? base
    return date.formatted(.dateTime.hour().minute().locale(locale))
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  private func attributes(
    _ size: PMControlSize, current: PMTime?, invalid: Bool, disabled: Bool, readOnly: Bool
  ) -> [String: String] {
    var attributes = ["size": size.rawValue, "granularity": (props.granularity ?? .minute).rawValue]
    if current == nil { attributes["placeholder"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    return attributes
  }
}

/// The time wheel on iOS; a Mac draws its own time field.
private struct PMTimeWheel: ViewModifier {
  func body(content: Content) -> some View {
    #if os(iOS)
      content.datePickerStyle(.wheel)
    #else
      content.datePickerStyle(.stepperField)
    #endif
  }
}

/// TimeInput's states, from the spec's States table.
public struct TimeInputStates: PMStates {
  public let member = "TimeInput"

  public init() {}

  private static let opening = PMTime(hour: 9, minute: 30, second: 0, millisecond: 0)

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("empty — the locale's pattern", expect: ["placeholder": "true"]) {
        PMTimeInput(props: PMTimeInputProps(ariaLabel: "Opens at"))
      },
      PMStateEntry("filled", expect: ["granularity": "minute"]) {
        PMTimeInput(props: PMTimeInputProps(ariaLabel: "Opens at", defaultValue: Self.opening))
      },
      PMStateEntry("hour granularity", expect: ["granularity": "hour"]) {
        PMTimeInput(
          props: PMTimeInputProps(ariaLabel: "Opens at", defaultValue: Self.opening, granularity: .hour))
      },
      PMStateEntry("12-hour clock — a day period", expect: ["readonly": "true"]) {
        PMTimeInput(
          props: PMTimeInputProps(
            ariaLabel: "Opens at", defaultValue: Self.opening, hourCycle: .hourCycle12,
            readOnly: true))
      },
      PMStateEntry("24-hour clock", expect: ["readonly": "true"]) {
        PMTimeInput(
          props: PMTimeInputProps(
            ariaLabel: "Opens at", defaultValue: PMTime(hour: 17, minute: 45, second: 0, millisecond: 0),
            hourCycle: .hourCycle24, readOnly: true))
      },
      PMStateEntry("empty, locale de-DE", expect: ["placeholder": "true"]) {
        PMTimeInput(props: PMTimeInputProps(ariaLabel: "Opens at", locale: "de-DE"))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMTimeInput(props: PMTimeInputProps(ariaLabel: "Opens at", size: .sm))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMTimeInput(props: PMTimeInputProps(ariaLabel: "Opens at", invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMTimeInput(
          props: PMTimeInputProps(ariaLabel: "Opens at", defaultValue: Self.opening, disabled: true))
      },
    ]
  }
}
