// DurationInput (`design/components/duration-input.md`): a length of time in
// whole seconds, drawn as counts of days, hours, minutes or seconds, each
// with its unit's short word in `text.muted` beside it ("7 days 0 hr 0 min"),
// largest first, a quantity's count and word `space.1` apart and the
// quantities `space.3` apart. It is Input's container (`PMFieldBox`) at
// Input's sizes; an empty count shows `––`, muted. A tap anywhere in its hit
// area opens the platform's wheel pickers, one per unit shown, side by side
// largest first, as the Clock app's timer sets a length: a sheet on iPhone
// and a popover at the field on iPad, as TimeInput opens its time wheel. The
// web types the counts; iOS sets a length on wheels.
//
// The arithmetic is the engine's, in `PolymorphUI+Durations.swift`. A turn of
// a wheel commits at once, as a step does on the web: the counts' seconds,
// held inside `min` and `max` (moved inwards to whole counts of the smallest
// unit), are reported through `onChange` when they differ from the value, and
// the wheels redraw what was committed. A wheel offers its unit below the
// next larger unit shown (0 to 59 minutes under hours), and the largest
// unit's wheel as many as `max` holds. A value the units cannot write is
// drawn rounded to the nearest count of the smallest unit and kept until a
// wheel turns. `units` chooses the counts, `locale` writes their digits and
// words (Foundation's duration formatter), and `messages.empty` is what an
// empty field says. `readOnly` draws the counts in `text.secondary` and opens
// nothing. `value` with `onChange` is the controlled pair.
//
// The field is a button named by `ariaLabel` or its FormField's label, whose
// value is each count with its unit's long word ("7 days, 0 hours, 0
// minutes"), and whose hint says "Invalid" first while invalid; each wheel is
// named by the label and its unit ("Inactivity lifetime day"). A platform gap
// (`PLATFORM_GAPS` in `packages/native/src/pending.ts`): a wheel draws its
// whole list, so without `max` the largest unit's wheel offers 0 to 999, or
// to the count the field holds when that is more. `name`, `id` and the
// `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMDurationInput: PMDurationInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  @State private var own: Double?
  @State private var presented = false
  private let props: PMDurationInputProps

  public init(props: PMDurationInputProps) {
    self.props = props
    _own = State(initialValue: props.defaultValue ?? nil)
  }

  public var body: some View {
    let size = props.size ?? .md
    let metrics = PMControlMetrics(size, theme)
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let drawn = PMDurations.draft(value, options)
    let units = PMDurations.units(props.units)

    HStack(spacing: theme.defaultDensity.space.s3) {
      ForEach(units, id: \.self) { unit in
        quantity(unit, count: drawn[unit], disabled: disabled, readOnly: readOnly)
      }
      Spacer(minLength: 0)
    }
    .pmTextStyle(metrics.text)
    .pmTabularFigures(true)
    .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(name ?? ""))
    .accessibilityValue(Text(spoken(drawn, units: units)))
    .modifier(PMDurationOpener(readOnly: readOnly, open: { presented = true }))
    .pmFieldHint(invalid: invalid, field?.hint)
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
        PMDurationWheels(
          label: name ?? "", units: units, draft: drawn, options: options, locale: locale,
          set: set
        )
        .padding(theme.defaultDensity.space.s3)
      }
    )
    .environment(\.locale, locale)
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember(
      "DurationInput",
      attributes(size, invalid: invalid, disabled: disabled, readOnly: readOnly, units: units))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The seconds the field holds: the controlled `value` when given (`nil`
  /// inside it is the empty field), otherwise the field's own.
  private var value: Double? {
    props.value ?? own
  }

  private var options: PMDurationOptions {
    PMDurationOptions(units: props.units, min: props.min, max: props.max)
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  /// A wheel turned: its unit's count set in the drawn counts, and the
  /// result committed and reported when it differs from the value.
  private func set(_ unit: PMDurationUnit, _ count: Int) {
    var next = PMDurations.draft(value, options)
    next[unit] = count
    let result = PMDurations.commit(next, reported: value, options)
    guard result.changed else { return }
    own = result.value
    props.onChange?(result.value)
  }

  /// One count and its unit's word, the word on the side the locale writes it.
  private func quantity(
    _ unit: PMDurationUnit, count: Int?, disabled: Bool, readOnly: Bool
  ) -> some View {
    let colors = theme.colors
    let words = PMDurations.short(count ?? 0, unit, locale)
    let digits = Text(count == nil ? PMDurations.placeholder : words.digits)
      .foregroundStyle(
        (disabled
          ? colors.textDisabled
          : count == nil ? colors.textMuted : readOnly ? colors.textSecondary : colors.textPrimary)
          .color)
    let word = Text(words.word)
      .foregroundStyle((disabled ? colors.textDisabled : colors.textMuted).color)
    return HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s1) {
      if words.wordFirst {
        word
        digits
      } else {
        digits
        word
      }
    }
    .lineLimit(1)
    .fixedSize()
  }

  /// What the field says as its value: each count and its unit's long word,
  /// or `messages.empty` while it is empty.
  private func spoken(_ drawn: PMDurationDraft, units: [PMDurationUnit]) -> String {
    guard !drawn.isEmpty else { return props.messages?.empty ?? PMStrings.durationInputMessages.empty }
    return units.map { PMDurations.spoken(drawn[$0] ?? 0, $0, locale) }
      .formatted(.list(type: .and, width: .narrow).locale(locale))
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  private func attributes(
    _ size: PMControlSize, invalid: Bool, disabled: Bool, readOnly: Bool, units: [PMDurationUnit]
  ) -> [String: String] {
    var attributes = [
      "size": size.rawValue, "units": units.map(\.rawValue).joined(separator: ","),
    ]
    if let value {
      attributes["seconds"] = value.formatted(
        .number.grouping(.never).locale(Locale(identifier: "en_US_POSIX")))
    } else {
      attributes["placeholder"] = "true"
    }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    return attributes
  }
}

/// The counts as one button that opens the wheels, unless the field is
/// read-only, when they are one element that opens nothing.
private struct PMDurationOpener: ViewModifier {
  let readOnly: Bool
  let open: @MainActor () -> Void

  func body(content: Content) -> some View {
    if readOnly {
      content
    } else {
      content
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { open() }
    }
  }
}

/// The wheels a length is set on, one per unit shown, largest first, each
/// row a count with its unit's short word. A wheel offers its unit below the
/// next larger unit shown, and the largest unit's wheel as many as `max`
/// holds, or `PMDurations.wheelReach` (or the count shown, when more) without
/// one.
struct PMDurationWheels: View {
  let label: String
  let units: [PMDurationUnit]
  let draft: PMDurationDraft
  let options: PMDurationOptions
  let locale: Locale
  let set: @MainActor (PMDurationUnit, Int) -> Void

  var body: some View {
    HStack(spacing: 0) {
      ForEach(units, id: \.self) { unit in
        Picker(
          "\(label) \(PMDurations.name(unit, locale))",
          selection: Binding { shown(unit) } set: { set(unit, $0) }
        ) {
          ForEach(Array(counts(unit)), id: \.self) { count in
            Text(row(count, unit)).tag(count)
          }
        }
        .modifier(PMWheelStyle())
        .labelsHidden()
        .frame(maxWidth: .infinity)
      }
    }
  }

  /// The counts a unit's wheel offers.
  func counts(_ unit: PMDurationUnit) -> ClosedRange<Int> {
    let range = PMDurations.range(unit, options)
    guard !PMDurations.bounded(unit, options) else { return range }
    return 0...max(PMDurations.wheelReach, draft[unit] ?? 0)
  }

  private func shown(_ unit: PMDurationUnit) -> Int {
    let range = counts(unit)
    return min(range.upperBound, max(range.lowerBound, draft[unit] ?? 0))
  }

  private func row(_ count: Int, _ unit: PMDurationUnit) -> String {
    let words = PMDurations.short(count, unit, locale)
    return words.wordFirst ? "\(words.word) \(words.digits)" : "\(words.digits) \(words.word)"
  }
}

/// DurationInput's states, from the spec's States table, with the surveyed
/// screens' own values: an inactivity lifetime of seven days, an absolute
/// lifetime of thirty, and a five-minute timeout.
public struct DurationInputStates: PMStates {
  public let member = "DurationInput"

  public init() {}

  private static let week: Double = 604_800

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("empty", expect: ["size": "md", "placeholder": "true"]) {
        PMDurationInput(props: PMDurationInputProps(ariaLabel: "Inactivity lifetime"))
      },
      PMStateEntry("filled", expect: ["size": "md", "seconds": "604800"]) {
        PMDurationInput(
          props: PMDurationInputProps(ariaLabel: "Inactivity lifetime", defaultValue: Self.week))
      },
      PMStateEntry("days only", expect: ["units": "days", "seconds": "2592000"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Absolute lifetime", defaultValue: 2_592_000, units: [.days]))
      },
      PMStateEntry("with seconds", expect: ["units": "minutes,seconds", "seconds": "300"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Request timeout", defaultValue: 300, units: [.minutes, .seconds]))
      },
      PMStateEntry("bounded", expect: ["seconds": "900"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Inactivity lifetime", defaultValue: 900, max: Self.week, min: 900))
      },
      PMStateEntry("remainder", expect: ["units": "minutes", "seconds": "90"]) {
        PMDurationInput(
          props: PMDurationInputProps(ariaLabel: "Grace period", defaultValue: 90, units: [.minutes]))
      },
      PMStateEntry("locale", expect: ["seconds": "5400"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Inaktivitätsdauer", defaultValue: 5_400, locale: "de-DE"))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Inactivity lifetime", defaultValue: Self.week, size: .sm))
      },
      PMStateEntry("readOnly", expect: ["readonly": "true"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Inactivity lifetime", defaultValue: Self.week, readOnly: true))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMDurationInput(
          props: PMDurationInputProps(ariaLabel: "Inactivity lifetime, required", invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMDurationInput(
          props: PMDurationInputProps(
            ariaLabel: "Inactivity lifetime", defaultValue: Self.week, disabled: true))
      },
    ]
  }
}
