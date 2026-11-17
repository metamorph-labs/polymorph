// NumberInput (`design/components/number-input.md`): a field that holds,
// formats and steps a number. Input's container in every state (`PMFieldBox`),
// with Input's affixes, and the stepper pair inside its trailing end: step
// down, then step up, each the small control height wide and the field's own
// height tall, in the embedded-button recipe; a stepper that cannot move, at
// `min` or `max`, is disabled and dimmed while the other keeps working.
//
// The text is a SwiftUI `TextField` bound to the number through a format
// style, so typing is a draft and the value is committed on Return or when the
// field loses focus, as the web's commits on blur and Enter: the committed
// number is clamped to `min` and `max`, an empty field commits `nil`, and text
// that does not parse restores the last committed value, so `onChange` only
// ever reports a number or `nil`. `format` formats the shown text with the
// person's locale: `decimal` (the default), `percent`, which shows a ratio
// multiplied by 100 and steps by 0.01 unless `step` is set, or `currency` in
// its ISO 4217 code; `maximumFractionDigits` caps the fraction. The steppers
// snap to `step` (1 by default) and commit as they fire. `onBlur` fires after
// the commit, so touched validation reads the committed number.
//
// VoiceOver steps the field with its adjustable action, the counterpart of
// the arrow keys, and the steppers are buttons named "Increase" and
// "Decrease". `readOnly` shows the formatted value as selectable text with no
// steppers, because a value that cannot be edited cannot be stepped; a
// disabled field keeps its steppers, disabled, so the frame keeps its shape.
// `name`, `id` and the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMNumberInput: PMNumberInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var locale
  @FocusState private var focused: Bool
  @State private var draft: Double?
  private let props: PMNumberInputProps

  public init(props: PMNumberInputProps) {
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
      if let prefix = props.prefix { affix(prefix, disabled: disabled) }
      if readOnly {
        Text(current.map(formatted) ?? "")
          .lineLimit(1)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel(Text(name ?? ""))
          .accessibilityValue(Text(current.map(formatted) ?? ""))
      } else {
        PMNumberField(
          name: name ?? "", value: binding, format: props.format, locale: locale,
          placeholder: props.placeholder
        )
        .focused($focused)
        .pmFocusWhenNamed($focused)
        .disabled(disabled)
        .tint(colors.accentText.color)
        .pmFieldHint(invalid: invalid, field?.hint)
        .accessibilityAdjustableAction { direction in
          switch direction {
          case .increment: stepBy(1)
          case .decrement: stepBy(-1)
          @unknown default: break
          }
        }
      }
      if let suffix = props.suffix { affix(suffix, disabled: disabled) }
      if !readOnly {
        HStack(spacing: 0) {
          stepper(
            .down, by: -1, label: PMStrings.numberInputDecrement, height: metrics.height,
            disabled: disabled || !canStep(-1))
          stepper(
            .up, by: 1, label: PMStrings.numberInputIncrement, height: metrics.height,
            disabled: disabled || !canStep(1))
        }
      }
    }
    .pmTextStyle(metrics.text)
    .foregroundStyle(
      (disabled ? colors.textDisabled : readOnly ? colors.textSecondary : colors.textPrimary).color
    )
    .padding(.leading, metrics.padding)
    .padding(.trailing, readOnly ? metrics.padding : 0)
    .frame(minHeight: metrics.height)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: readOnly, focused: focused))
    .pmHitTarget()
    // A tap in the frame outside the steppers focuses the field; a stepper's tap is its own.
    .pmOpensOnTap(!disabled && !readOnly) { focused = true }
    .onChange(of: focused) { _, now in
      if now { props.onFocus?() } else { props.onBlur?() }
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "NumberInput", attributes(size, invalid: invalid, disabled: disabled, readOnly: readOnly))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The committed number: the controlled `value` when given (`nil` inside it
  /// is the empty field), otherwise the field's own.
  private var value: Double? {
    props.value ?? draft
  }

  /// What the text field commits: clamped to the limits, and reported.
  private var binding: Binding<Double?> {
    Binding {
      value
    } set: { next in
      commit(next.map(clamped))
    }
  }

  private func commit(_ next: Double?) {
    guard next != value else { return }
    draft = next
    props.onChange?(next)
  }

  private var step: Double {
    props.step ?? (props.format?.style == .percent ? 0.01 : 1)
  }

  private func clamped(_ number: Double) -> Double {
    min(props.max ?? .infinity, max(props.min ?? -.infinity, number))
  }

  /// The next value a stepper gives: the next multiple of the step in its
  /// direction, then clamped. An empty field steps to `min`, or to zero.
  private func stepped(_ direction: Double) -> Double {
    guard let base = value else { return clamped(props.min ?? 0) }
    let ratio = base / step
    // A value on the step moves a whole step; one between steps snaps to the next.
    let onStep = abs(ratio - ratio.rounded()) < 1e-9
    let index =
      onStep ? ratio.rounded() + direction : ratio.rounded(direction > 0 ? .up : .down)
    return clamped(index * step)
  }

  private func canStep(_ direction: Double) -> Bool {
    guard let current = value else { return true }
    return stepped(direction) != current
  }

  private func stepBy(_ direction: Double) {
    guard !(props.disabled ?? false), !(props.readOnly ?? false) else { return }
    commit(stepped(direction))
  }

  /// A stepper, identified as the member's `decrement` or `increment` part,
  /// so a UI test finds it and the harness reads whether it is disabled.
  private func stepper(
    _ role: PMIconRole, by direction: Double, label: String, height: CGFloat, disabled: Bool
  ) -> some View {
    Button {
      stepBy(direction)
    } label: {
      PMIconView(role, size: props.size ?? .md)
    }
    .buttonStyle(
      PMEmbeddedButtonStyle(side: height, width: theme.defaultDensity.controlHeight.sm))
    .disabled(disabled)
    .accessibilityLabel(Text(label))
    .pmMember(
      "NumberInput",
      ["part": direction < 0 ? "decrement" : "increment"].merging(
        disabled ? ["disabled": "true"] : [:], uniquingKeysWith: { a, _ in a }))
  }

  /// The name the field is spoken by: its own `ariaLabel`, else its FormField's label.
  private var name: String? {
    props.ariaLabel ?? field?.label ?? props.placeholder
  }

  private func formatted(_ number: Double) -> String {
    PMNumberField.text(number, format: props.format, locale: locale)
  }

  /// A prefix or suffix: muted, not part of the value, and not spoken.
  private func affix(_ text: String, disabled: Bool) -> some View {
    Text(text)
      .lineLimit(1)
      .fixedSize()
      .foregroundStyle((disabled ? theme.colors.textDisabled : theme.colors.textMuted).color)
      .accessibilityHidden(true)
  }

  private func attributes(_ size: PMControlSize, invalid: Bool, disabled: Bool, readOnly: Bool)
    -> [String: String]
  {
    var attributes = ["size": size.rawValue]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    // The committed number, as written for a machine, and the text the field
    // shows and speaks: the web's `aria-valuenow` and `aria-valuetext`.
    if let number = value {
      attributes["valuenow"] = number.formatted(
        .number.grouping(.never).locale(Locale(identifier: "en_US_POSIX")))
      attributes["valuetext"] = formatted(number)
    }
    if let prefix = props.prefix { attributes["prefix"] = prefix }
    if let suffix = props.suffix { attributes["suffix"] = suffix }
    return attributes
  }
}

/// The text field, bound to the number through the format style `format`
/// names, so it parses what is typed and commits on Return or on losing focus.
private struct PMNumberField: View {
  @Environment(\.pmTheme) private var theme
  let name: String
  @Binding var value: Double?
  let format: PMNumberFormat?
  let locale: Locale
  let placeholder: String?

  var body: some View {
    let prompt = placeholder.map { Text($0).foregroundStyle(theme.colors.textMuted.color) }
    let digits = format?.maximumFractionDigits.map { 0...Int($0) }
    Group {
      switch format?.style ?? .decimal {
      case .decimal:
        let style = FloatingPointFormatStyle<Double>.number.locale(locale)
        TextField(
          name, value: $value,
          format: digits.map { style.precision(.fractionLength($0)) } ?? style, prompt: prompt)
      case .percent:
        let style = FloatingPointFormatStyle<Double>.Percent.percent.locale(locale)
        TextField(
          name, value: $value,
          format: digits.map { style.precision(.fractionLength($0)) } ?? style, prompt: prompt)
      case .currency:
        let style = FloatingPointFormatStyle<Double>.Currency(
          code: format?.currency ?? locale.currency?.identifier ?? "", locale: locale)
        TextField(
          name, value: $value,
          format: digits.map { style.precision(.fractionLength($0)) } ?? style, prompt: prompt)
      }
    }
    .textFieldStyle(.plain)
    .lineLimit(1)
    .pmEntryName(name)
    #if os(iOS)
      .keyboardType(.decimalPad)
      .autocorrectionDisabled(true)
    #endif
  }

  /// A number as the field shows it.
  static func text(_ number: Double, format: PMNumberFormat?, locale: Locale) -> String {
    let digits = format?.maximumFractionDigits.map { 0...Int($0) }
    switch format?.style ?? .decimal {
    case .decimal:
      let style = FloatingPointFormatStyle<Double>.number.locale(locale)
      return number.formatted(digits.map { style.precision(.fractionLength($0)) } ?? style)
    case .percent:
      let style = FloatingPointFormatStyle<Double>.Percent.percent.locale(locale)
      return number.formatted(digits.map { style.precision(.fractionLength($0)) } ?? style)
    case .currency:
      let style = FloatingPointFormatStyle<Double>.Currency(
        code: format?.currency ?? locale.currency?.identifier ?? "", locale: locale)
      return number.formatted(digits.map { style.precision(.fractionLength($0)) } ?? style)
    }
  }
}

/// NumberInput's states, from the spec's States table. The formatted entries
/// are laid out in American English, so the text they promise is the same on
/// every machine.
public struct NumberInputStates: PMStates {
  public let member = "NumberInput"

  public init() {}

  private static let american = Locale(identifier: "en_US")

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "rest md",
        expect: [
          "size": "md", "valuenow": "",
          "contains": "NumberInput[part=decrement],NumberInput[part=increment]",
        ]
      ) {
        PMNumberInput(
          props: PMNumberInputProps(ariaLabel: "Agents on this plan", placeholder: "0"))
      },
      PMStateEntry("with value", expect: ["valuenow": "5", "valuetext": "5"]) {
        PMNumberInput(
          props: PMNumberInputProps(ariaLabel: "Agents", defaultValue: 5, min: 1, step: 1))
        .environment(\.locale, Self.american)
      },
      PMStateEntry(
        "at the rail — step down disabled",
        expect: [
          "valuenow": "1",
          "contains":
            "NumberInput[part=decrement disabled=true],NumberInput[part=increment disabled=]",
        ]
      ) {
        PMNumberInput(props: PMNumberInputProps(ariaLabel: "Agents", defaultValue: 1, min: 1))
      },
      PMStateEntry(
        "currency — the per-seat price", expect: ["valuenow": "29", "valuetext": "$29.00"]
      ) {
        PMNumberInput(
          props: PMNumberInputProps(
            ariaLabel: "Price per seat", defaultValue: 29,
            format: PMNumberFormat(currency: "USD", style: .currency)))
        .environment(\.locale, Self.american)
      },
      PMStateEntry(
        "percent — the CSAT target, stepping by 0.01",
        expect: ["valuenow": "0.9", "valuetext": "90%"]
      ) {
        PMNumberInput(
          props: PMNumberInputProps(
            ariaLabel: "CSAT target", defaultValue: 0.9, format: PMNumberFormat(style: .percent)))
        .environment(\.locale, Self.american)
      },
      PMStateEntry("affixed — hours", expect: ["valuenow": "4", "suffix": "hrs"]) {
        PMNumberInput(
          props: PMNumberInputProps(ariaLabel: "First response", defaultValue: 4, suffix: "hrs"))
      },
      PMStateEntry("sm", expect: ["size": "sm"]) {
        PMNumberInput(props: PMNumberInputProps(ariaLabel: "Agents", defaultValue: 5, size: .sm))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMNumberInput(props: PMNumberInputProps(ariaLabel: "Agents", defaultValue: 0, invalid: true))
      },
      PMStateEntry("disabled — the steppers disabled with it", expect: ["disabled": "true"]) {
        PMNumberInput(props: PMNumberInputProps(ariaLabel: "Agents", defaultValue: 5, disabled: true))
      },
      PMStateEntry("readOnly — no steppers", expect: ["readonly": "true"]) {
        PMNumberInput(props: PMNumberInputProps(ariaLabel: "Agents", defaultValue: 5, readOnly: true))
      },
      PMStateEntry("readOnly currency — the formatted text", expect: ["readonly": "true"]) {
        PMNumberInput(
          props: PMNumberInputProps(
            ariaLabel: "Price per seat", defaultValue: 1234.5,
            format: PMNumberFormat(currency: "USD", style: .currency), readOnly: true))
      },
    ]
  }
}
