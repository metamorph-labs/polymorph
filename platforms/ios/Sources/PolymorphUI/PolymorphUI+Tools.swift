// The chevron that turns while its disclosure is open, which JsonTree (`next`
// a quarter turn), ToolCall, Accordion's and Collapsible's trigger, and the
// choosing fields (`down` or `expand` a half turn) share; and the ghost row
// that a press washes, JsonTree's branch toggle on `bg.subtle` and
// ToolCall's trigger on `bg.surface`. Accordion and Collapsible draw a
// disclosure as colour only, with no wash, and open it with an animated
// region; JsonTree's children appear at once and both triggers here are
// washed rows, so they share the row here rather than that grammar.

import PolymorphTokens
import SwiftUI

/// A disclosure's chevron: the glyph of `role` at `size` (`sm` unless given),
/// turned by `turn` while `open`, over the control duration on the standard
/// easing. It stands still under Reduce Motion, and at the `none`
/// temperament, whose duration is 0. Its colour is the theme's `color`,
/// `text.muted` unless given, or with `nil` the colour the trigger around it
/// sets by state (a field's embedded button). Decorative: the trigger's value
/// says whether it is open.
struct PMTurningChevron: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let role: PMIconRole
  let open: Bool
  let turn: Angle
  var size: PMControlSize = .sm
  var color: KeyPath<PMColors, PMDynamicColor>? = \.textMuted

  var body: some View {
    let motion = theme.defaultMotion
    PMIconView(role, size: size)
      .modifier(PMOptionalForeground(color: color.map { theme.colors[keyPath: $0] }))
      .rotationEffect(open ? turn : .zero)
      .animation(
        reduceMotion ? nil : motion.easing.standard.animation(duration: motion.duration.control),
        value: open)
  }
}

/// A ghost row as a `ButtonStyle`: transparent at rest; under the pointer and
/// while pressed, `wash` fills the label's box at `cornerRadius` and the text
/// turns `active`, on `stateFeedback` (the control duration on the standard
/// easing). `rest` is the label's colour otherwise; without one the label
/// keeps the colour it inherits. The row takes the width it is offered and at
/// least the hit target's height, all of it pressable, so two rows one above
/// the other are each a target of their own.
struct PMWashRowStyle: ButtonStyle {
  let wash: PMDynamicColor
  let cornerRadius: CGFloat
  var rest: PMDynamicColor? = nil
  var active: PMDynamicColor? = nil

  func makeBody(configuration: Configuration) -> some View {
    PMWashRow(style: self, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMWashRow<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let style: PMWashRowStyle
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let motion = theme.defaultMotion
    let on = enabled && (hovering || pressed)
    let text = on ? style.active ?? style.rest : style.rest
    label()
      .modifier(PMOptionalForeground(color: text))
      .background {
        RoundedRectangle(cornerRadius: style.cornerRadius)
          .fill(on ? style.wash.color : .clear)
      }
      .animation(motion.easing.standard.animation(duration: motion.duration.control), value: on)
      .frame(maxWidth: .infinity, alignment: .leading)
      .onHover { hovering = $0 }
      .pmHitTarget()
  }
}

/// The foreground `color` when there is one; otherwise the inherited one.
private struct PMOptionalForeground: ViewModifier {
  let color: PMDynamicColor?

  func body(content: Content) -> some View {
    if let color {
      content.foregroundStyle(color.color)
    } else {
      content
    }
  }
}
