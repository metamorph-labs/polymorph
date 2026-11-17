// ColorInput (`design/components/color-input.md`): a colour field, a swatch and
// a hex entry. The swatch is drawn to the recipe at the control height of
// `size`: the colour over `bg.surface` (over the checker with `alpha`), at the
// control radius, in a `border.strong` hairline that turns `accent.bg` under
// the pointer, `danger.border` while invalid, and `border.subtle` on
// `bg.subtle` with no colour while disabled. Under it is the platform's colour
// well (SwiftUI's ColorPicker, UIColorWell on iOS), scaled to the hit target,
// because UIKit sizes the well whatever frame it is given, and drawn only where
// the swatch covers it, so a tap anywhere in the hit target opens the system's
// colour picker, named by `pickerLabel`; the colour it picks is reported
// continuously while it changes, as the web's drag is. The hex entry is an
// Input with `#` as its prefix and the digits as its value: three, six or eight
// digits, with or without a typed `#`, committed on Return; text that names no
// colour reverts to the current value instead of showing an error. With `alpha`
// the picker offers opacity and the hex grows to eight digits.
//
// The value is lowercase hex, `#rrggbb`, or `#rrggbbaa` with `alpha`, and a mid
// grey by default (`PMSpecDefault.colorValue`); it is data, not a theme colour,
// so the foundation's `PMHexColor` reads it. `value` with `onChange` is the
// controlled pair. Invalid draws the field invalid, and disabled disables the
// well and the field. `defaultOpen` cannot open the system's picker, which
// opens only from a person's tap. `name`, `id` and the `aria-*by` ids have no
// SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMColorInput: PMColorInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var draft: String
  @State private var typed: String?
  @State private var hovering = false
  /// The system well's own side: UIKit sizes the well whatever frame it is
  /// given, so it is scaled to the hit target.
  @State private var well: CGFloat?
  private let props: PMColorInputProps

  public init(props: PMColorInputProps) {
    self.props = props
    let alpha = props.alpha ?? false
    _draft = State(
      initialValue: PMHexColor.normalized(props.defaultValue ?? PMSpecDefault.colorValue, alpha: alpha)
        ?? PMSpecDefault.colorValue)
  }

  public var body: some View {
    let size = props.size ?? .md
    let height = theme.defaultDensity.controlHeight[size]
    let target = max(height, theme.defaultDensity.hitTarget)
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let alpha = props.alpha ?? false

    HStack(spacing: theme.defaultDensity.space.s2) {
      // The well takes the whole hit target and shows only under the swatch,
      // which is drawn over it and takes no touches; the layout keeps the
      // swatch's size, so the hit area reaches past it.
      ColorPicker(props.pickerLabel, selection: swatch, supportsOpacity: alpha)
        .labelsHidden()
        .onGeometryChange(for: CGFloat.self) {
          $0.size.height
        } action: {
          well = $0
        }
        .scaleEffect(well.map { target / Swift.max($0, .ulpOfOne) } ?? 1)
        .frame(width: target, height: target)
        .mask {
          RoundedRectangle(cornerRadius: theme.radius.control).frame(width: height, height: height)
        }
        .overlay {
          PMColorSwatch(
            color: disabled ? nil : PMHexColor.color(current), alpha: alpha, invalid: invalid,
            disabled: disabled, hovering: hovering
          )
          .frame(width: height, height: height)
          .allowsHitTesting(false)
        }
        .onHover { hovering = $0 }
        .disabled(disabled)
        .accessibilityLabel(Text(props.pickerLabel))
        .pmHitTarget(drawn: CGSize(width: height, height: height))
      PMInput(
        props: PMInputProps(
          ariaLabel: props.ariaLabel ?? field?.label ?? props.pickerLabel, disabled: disabled,
          invalid: invalid, onChange: { typed = $0 }, prefix: "#", size: size,
          value: typed ?? String(current.dropFirst())))
      .onSubmit(commitTyped)
    }
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember("ColorInput", attributes(size, invalid: invalid, disabled: disabled, alpha: alpha))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The colour: the controlled `value` when given, otherwise the field's own.
  private var current: String {
    props.value.flatMap { PMHexColor.normalized($0, alpha: props.alpha ?? false) } ?? draft
  }

  /// The well's colour; picking reports the hex as it changes.
  private var swatch: Binding<Color> {
    Binding {
      PMHexColor.color(current) ?? .clear
    } set: { next in
      commit(PMHexColor.hex(next, alpha: props.alpha ?? false))
    }
  }

  /// Return in the hex field: a colour it names, or the current one back.
  private func commitTyped() {
    if let text = typed, let hex = PMHexColor.normalized(text, alpha: props.alpha ?? false) {
      commit(hex)
    }
    typed = nil
  }

  private func commit(_ hex: String) {
    guard hex != current else { return }
    draft = hex
    props.onChange?(hex)
  }

  private func attributes(_ size: PMControlSize, invalid: Bool, disabled: Bool, alpha: Bool)
    -> [String: String]
  {
    var attributes = ["size": size.rawValue, "hex": String(current.dropFirst())]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if alpha { attributes["alpha"] = "true" }
    return attributes
  }
}

/// The swatch (the recipe's `.swatch` and `.swatchFill`): the colour over the
/// surface, or over the checker of `space-4` tiles with `alpha`, so a
/// translucent colour shows it, inside the border of its state.
private struct PMColorSwatch: View {
  @Environment(\.pmTheme) private var theme
  let color: Color?
  let alpha: Bool
  let invalid: Bool
  let disabled: Bool
  let hovering: Bool

  var body: some View {
    let colors = theme.colors
    let shape = RoundedRectangle(cornerRadius: theme.radius.control)
    let border =
      disabled
      ? colors.borderSubtle
      : invalid ? colors.dangerBorder : hovering ? colors.accentBg : colors.borderStrong
    ZStack {
      if disabled {
        shape.fill(colors.bgSubtle.color)
      } else {
        if alpha {
          PMChecker(tile: theme.defaultDensity.space.s4)
        } else {
          shape.fill(colors.bgSurface.color)
        }
        if let color { shape.fill(color) }
      }
    }
    .clipShape(shape)
    .overlay { shape.strokeBorder(border.color, lineWidth: 1) }
  }
}

/// The checker under a translucent colour: tiles `tile` wide, each a
/// `bg.subtle` square at its top right and bottom left and a `bg.surface`
/// square at the other two corners, as the recipe's conic gradient draws them.
private struct PMChecker: View {
  @Environment(\.pmTheme) private var theme
  let tile: CGFloat

  var body: some View {
    let subtle = theme.colors.bgSubtle.color
    let surface = theme.colors.bgSurface.color
    Canvas { context, size in
      let cell = tile / 2
      context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(surface))
      guard cell > 0 else { return }
      let columns = Int((size.width / cell).rounded(.up))
      let rows = Int((size.height / cell).rounded(.up))
      for row in 0..<rows {
        for column in 0..<columns where (row + column) % 2 == 1 {
          let square = CGRect(
            x: CGFloat(column) * cell, y: CGFloat(row) * cell, width: cell, height: cell)
          context.fill(Path(square), with: .color(subtle))
        }
      }
    }
  }
}

/// ColorInput's states, from the spec's States table. The picker is the
/// system's and opens only from a tap, so the open rows draw the field. The
/// sample colours are written without their `#`, which the field accepts,
/// because a member's source holds no colour literal.
public struct ColorInputStates: PMStates {
  public let member = "ColorInput"

  public init() {}

  private static let label = "Choose accent colour"

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMColorInput(
          props: PMColorInputProps(defaultValue: "8864f0", pickerLabel: Self.label, size: size))
      }
    }
    return [
      PMStateEntry("rest", expect: ["hex": "8864f0"]) {
        PMColorInput(props: PMColorInputProps(defaultValue: "8864f0", pickerLabel: Self.label))
      },
      PMStateEntry("alpha — eight digits", expect: ["alpha": "true", "hex": "8864f0cc"]) {
        PMColorInput(
          props: PMColorInputProps(alpha: true, defaultValue: "8864f0cc", pickerLabel: Self.label))
      },
      PMStateEntry("the default — no value given", expect: ["hex": "888888"]) {
        PMColorInput(props: PMColorInputProps(pickerLabel: Self.label))
      },
    ] + sizes + [
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMColorInput(
          props: PMColorInputProps(defaultValue: "8864f0", invalid: true, pickerLabel: Self.label))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMColorInput(
          props: PMColorInputProps(defaultValue: "8864f0", disabled: true, pickerLabel: Self.label))
      },
      PMStateEntry("controlled", expect: ["hex": "0089ea"]) {
        PMColorInput(
          props: PMColorInputProps(onChange: { _ in }, pickerLabel: Self.label, value: "0089ea"))
      },
    ]
  }
}
