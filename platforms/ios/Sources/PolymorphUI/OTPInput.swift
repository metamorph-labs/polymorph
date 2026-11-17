// OTPInput (`design/components/otp-input.md`): a verification code drawn as
// separate digit cells. It is one field: a real text field spans the cells,
// with the one-time-code content type, so iOS offers the code from Messages
// above the keyboard, and the number pad; the field draws nothing itself, and
// the cells paint its digits. Every write is filtered to digits and cut at
// `length` (4 or 6, 6 by default), so pasted or offered text fills the cells
// from the first, and typing into a full code changes nothing. `onChange`
// reports the digits; `onComplete` follows it once, when the code becomes
// full.
//
// A cell is a square of the large control height in Input's rest recipe,
// `bg.surface` in a `border.default` hairline with the control seat and the
// control radius, its digit in `text.md` with tabular figures, appearing with
// a fade over the control duration. The cells are `space-3` apart. While the
// field has focus the caret cell, the next to fill or the last when full,
// draws the focus ring and the `border.focus.solid` hairline; invalid draws
// every cell's hairline in `danger.border` and wins over the caret's. Disabled
// cells are Input's disabled cell. There is no hover, because the cells are
// one target, and an empty cell shows nothing, because a dot would look like
// masking.
//
// The cells are hidden from assistive technology: the field is the one
// element, named by `ariaLabel` or its FormField's label, its value the digits
// typed, and its hint "Invalid" first while invalid. `name`, `id` and the
// `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMOTPInput: PMOTPInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @FocusState private var focused: Bool
  @State private var draft: String
  private let props: PMOTPInputProps

  public init(props: PMOTPInputProps) {
    self.props = props
    let length = (props.length ?? .length6).rawValue
    _draft = State(initialValue: Self.digits(props.defaultValue ?? "", length))
  }

  public var body: some View {
    let length = (props.length ?? .length6).rawValue
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let code = current
    let caret = Swift.min(code.count, length - 1)
    let characters = Array(code)

    HStack(spacing: theme.defaultDensity.space.s3) {
      ForEach(0..<length, id: \.self) { index in
        PMOTPCell(
          digit: index < characters.count ? String(characters[index]) : nil,
          caret: focused && index == caret, invalid: invalid, disabled: disabled)
      }
    }
    .accessibilityHidden(true)
    // The field lies under the cells, which paint its digits; a tap on them focuses it.
    .background {
      TextField(name ?? "", text: text)
        .textFieldStyle(.plain)
        .foregroundStyle(.clear)
        .tint(.clear)
        .focused($focused)
        .pmFocusWhenNamed($focused)
        .disabled(disabled)
        .modifier(PMOneTimeCode())
        .pmEntryName(name)
        .accessibilityValue(Text(code))
        .pmFieldHint(invalid: invalid, field?.hint)
    }
    .contentShape(.rect)
    .onTapGesture { if !disabled { focused = true } }
    .accessibilityElement(children: .contain)
    .pmMember("OTPInput", attributes(code, length: length, invalid: invalid, disabled: disabled))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The digits: the controlled `value` when given, otherwise the field's own.
  private var current: String {
    Self.digits(props.value ?? draft, (props.length ?? .length6).rawValue)
  }

  private var text: Binding<String> {
    Binding {
      current
    } set: { next in
      let length = (props.length ?? .length6).rawValue
      let digits = Self.digits(next, length)
      guard digits != current else { return }
      draft = digits
      props.onChange?(digits)
      if digits.count == length { props.onComplete?(digits) }
    }
  }

  /// `text` with everything but the ASCII digits left out, cut at `length`.
  private static func digits(_ text: String, _ length: Int) -> String {
    String(text.filter { $0.isASCII && $0.isNumber }.prefix(length))
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  private func attributes(_ code: String, length: Int, invalid: Bool, disabled: Bool)
    -> [String: String]
  {
    var attributes = ["length": String(length), "filled": String(code.count)]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// The one-time-code content type and the number pad. iOS only: a Mac
/// keyboard has neither.
private struct PMOneTimeCode: ViewModifier {
  func body(content: Content) -> some View {
    #if os(iOS)
      content
        .textContentType(.oneTimeCode)
        .keyboardType(.numberPad)
        .autocorrectionDisabled(true)
        .textInputAutocapitalization(.never)
    #else
      content
    #endif
  }
}

/// One cell: Input's rest cell at the large control height, square.
private struct PMOTPCell: View {
  @Environment(\.pmTheme) private var theme
  let digit: String?
  let caret: Bool
  let invalid: Bool
  let disabled: Bool

  var body: some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let side = theme.defaultDensity.controlHeight.lg
    let shape = RoundedRectangle(cornerRadius: theme.radius.control)
    let border =
      disabled
      ? colors.borderSubtle
      : invalid ? colors.dangerBorder : caret ? colors.borderFocusSolid : colors.borderDefault
    ZStack {
      if let digit {
        Text(digit)
          .pmTextStyle(theme.text.md)
          .pmTabularFigures(true)
          .foregroundStyle((disabled ? colors.textDisabled : colors.textPrimary).color)
          .transition(.opacity)
      }
    }
    .frame(width: side, height: side)
    .background {
      shape
        .fill((disabled ? colors.bgSubtle : colors.bgSurface).color)
        .pmShadow(disabled ? PMShadow(layers: []) : theme.shadows.control)
    }
    .overlay { shape.strokeBorder(border.color, lineWidth: 1) }
    .pmFocusRing(caret && !disabled, cornerRadius: theme.radius.control)
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: digit)
  }
}

/// OTPInput's states, from the spec's States table.
public struct OTPInputStates: PMStates {
  public let member = "OTPInput"

  public init() {}

  private static let name = "Verification code"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("empty — six cells", expect: ["length": "6", "filled": "0"]) {
        PMOTPInput(props: PMOTPInputProps(ariaLabel: Self.name))
      },
      PMStateEntry("four", expect: ["length": "4", "filled": "0"]) {
        PMOTPInput(props: PMOTPInputProps(ariaLabel: Self.name, length: .length4))
      },
      PMStateEntry("partial", expect: ["filled": "2"]) {
        PMOTPInput(props: PMOTPInputProps(ariaLabel: Self.name, defaultValue: "42"))
      },
      PMStateEntry("full", expect: ["filled": "6"]) {
        PMOTPInput(props: PMOTPInputProps(ariaLabel: Self.name, defaultValue: "428051"))
      },
      PMStateEntry("a pasted code — digits only, cut at the length", expect: ["filled": "4"]) {
        PMOTPInput(
          props: PMOTPInputProps(ariaLabel: Self.name, defaultValue: "42-80 51", length: .length4))
      },
      PMStateEntry("invalid", expect: ["invalid": "true", "filled": "6"]) {
        PMOTPInput(
          props: PMOTPInputProps(ariaLabel: Self.name, defaultValue: "428051", invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMOTPInput(props: PMOTPInputProps(ariaLabel: Self.name, disabled: true))
      },
    ]
  }
}
