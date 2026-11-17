// Button (`design/components/button.md`): the action primitive. A SwiftUI
// `Button` whose style draws the recipe's cells: the lawful variant × tone
// grid (`PMButtonAppearance`, so an unlawful pair cannot be written), the three
// control sizes, the leading and trailing icon, icon-only, loading with the
// spinner in the leading slot, disabled, and the toggle's latched state.
//
// The phases map to the web's pseudo-classes: a touch's press is `:active`, an
// iPad pointer over the button is `:hover`, and the toggle's on state holds the
// active cell, as `data-state="on"` does. Keyboard focus is the system's own
// focus effect, which SwiftUI draws around a focused button.
//
// What the web's attributes become: `aria-busy` is the accessibility value
// (the spinner's "Loading"), `aria-pressed` is the toggle trait with the
// selected trait while on, `aria-current` is the selected trait, and a
// `submit` button answers the keyboard's default action (Return) and submits
// the form it is in: after its own `onClick` it runs the environment's
// `pmSubmitAction`, which FormPage sets around its actions row, as a web
// submit button submits its `<form>`. `aria-expanded` is the accessibility
// value, "expanded" or "collapsed", as a disclosure's trigger reports it; a
// loading button's value is "Loading" instead. The `aria-controls`,
// `aria-describedby` and `aria-labelledby` props name element ids, which
// SwiftUI has none of, so they have no effect here: a row that labels a button
// names it through `ariaLabel`.
//
// A `count` above zero draws a Badge in its count form, from the centre of an
// icon-only button's top edge toward its trailing edge, or after the label of
// any other, and makes `count.label` the accessible name. The Badge is hidden
// from assistive technology and takes no touch, so the count is heard once, in
// the app's words. A wide count reaches past the trailing edge.

import PolymorphTokens
import SwiftUI

public struct PMButton: PMButtonRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmTriggerAction) private var triggerAction
  @Environment(\.pmSubmitAction) private var submitAction
  private let props: PMButtonProps

  public init(props: PMButtonProps) {
    self.props = props
  }

  public var body: some View {
    let appearance = props.appearance ?? .solidAccent
    let size = props.size ?? .md
    let loading = props.loading ?? false
    let disabled = props.disabled ?? false
    let iconOnly = props.iconOnly ?? false
    // Loading takes precedence over the toggle in the state, as on the web;
    // the traits below still report the toggle.
    let state = loading ? "loading" : props.pressed.map { $0 ? "on" : "off" }
    // `value > 0` is false for `nan` as well, which Badge would not draw either.
    let count = props.count.flatMap { $0.value > 0 ? $0 : nil }

    Button {
      // Detached while loading, so a second press never fires a command
      // already in flight.
      guard !loading else { return }
      props.onClick?()
      triggerAction?()
      if props.type == .submit { submitAction?() }
    } label: {
      PMButtonLabel(
        label: props.label, icon: props.icon, trailingIcon: props.trailingIcon, controlSize: size,
        iconOnly: iconOnly, loading: loading, count: iconOnly ? nil : count?.value,
        disabled: disabled)
    }
    .buttonStyle(
      PMButtonStyle(
        appearance: appearance, controlSize: size, iconOnly: iconOnly, loading: loading,
        on: props.pressed == true)
    )
    .overlay(alignment: .topLeading) {
      // The count starts at the square's centre and grows toward the trailing
      // edge, so a wide count reaches past the edge instead of across the glyph.
      if iconOnly, let count {
        let start = PMControlMetrics(size, theme).height / PMRecipe.buttonCountStart
        PMButtonCountBadge(value: count.value, disabled: disabled)
          .fixedSize()
          .alignmentGuide(.leading) { _ in -start }
      }
    }
    .disabled(disabled)
    .keyboardShortcut(props.type == .submit ? .defaultAction : nil)
    .accessibilityLabel(Text(props.ariaLabel ?? count?.label ?? props.label))
    .modifier(PMButtonValue(busy: loading, expanded: props.expanded))
    .accessibilityAddTraits(traits)
    .pmMember("Button", attributes(appearance, size, state: state, disabled, iconOnly))
  }

  private var traits: AccessibilityTraits {
    var traits: AccessibilityTraits = []
    if props.pressed != nil { traits.formUnion(.isToggle) }
    if props.pressed == true || props.current == true { traits.formUnion(.isSelected) }
    return traits
  }

  private func attributes(
    _ appearance: PMButtonAppearance, _ size: PMControlSize, state: String?, _ disabled: Bool,
    _ iconOnly: Bool
  ) -> [String: String] {
    var attributes = [
      "variant": appearance.variant.rawValue,
      "tone": appearance.tone.rawValue,
      "size": size.rawValue,
    ]
    if let state { attributes["state"] = state }
    if disabled { attributes["disabled"] = "true" }
    if iconOnly { attributes["icon-only"] = "true" }
    if let expanded = props.expanded { attributes["expanded"] = String(expanded) }
    if let count = props.count, count.value > 0 {
      attributes["count"] = PMBadge.countText(count.value)
    }
    return attributes
  }
}

/// The count a Button carries: a Badge in its count form, `solid`/`accent`,
/// hidden from assistive technology because the button's name says it, and
/// desaturated and faded on a disabled button, as AvatarButton's face is.
private struct PMButtonCountBadge: View {
  let value: Double
  let disabled: Bool

  var body: some View {
    PMBadge(props: PMBadgeProps(count: value, tone: .accent, variant: .solid))
      .grayscale(disabled ? 1 : 0)
      .opacity(disabled ? PMRecipe.buttonCountDisabledOpacity : 1)
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}

/// The button's value. `aria-busy`: while loading, it is the spinner's label.
/// `aria-expanded`: on a disclosure's trigger, it is the disclosure's state.
private struct PMButtonValue: ViewModifier {
  let busy: Bool
  let expanded: Bool?

  func body(content: Content) -> some View {
    if busy {
      content.accessibilityValue(Text(PMStrings.loading))
    } else if let expanded {
      content.accessibilityValue(Text(PMStrings.disclosure(open: expanded)))
    } else {
      content
    }
  }
}

/// The anatomy: the leading slot (the spinner while loading, else the icon),
/// the label, which never wraps, and the trailing icon. Icon-only draws the
/// leading slot alone; the label is still the accessible name.
struct PMButtonLabel: View {
  @Environment(\.pmTheme) private var theme
  let label: String
  let icon: PMIconRole?
  let trailingIcon: PMIconRole?
  let controlSize: PMControlSize
  let iconOnly: Bool
  let loading: Bool
  /// The count drawn after the label; an icon-only button draws its count on the corner.
  var count: Double? = nil
  var disabled = false

  var body: some View {
    HStack(spacing: PMControlMetrics(controlSize, theme).gap) {
      if loading {
        PMSpinGlyph(controlSize: controlSize)
      } else if let icon {
        PMIconView(icon, size: controlSize)
      }
      if !iconOnly {
        Text(label)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      if let trailingIcon, !iconOnly {
        PMIconView(trailingIcon, size: controlSize)
      }
      if let count {
        PMButtonCountBadge(value: count, disabled: disabled)
      }
    }
  }
}

/// Button's recipe as a `ButtonStyle`, so a SwiftUI button reports the press.
/// Link's `button` variant wears it too, by reference, as the web's costume
/// composes Button's stylesheet.
struct PMButtonStyle: ButtonStyle {
  let appearance: PMButtonAppearance
  let controlSize: PMControlSize
  let iconOnly: Bool
  let loading: Bool
  /// The toggle's on state: the active cell, held.
  let on: Bool
  /// The corners the control radius rounds: all of them, or one side's, for
  /// a half of SplitButton's group, whose inner corners are square. `round`
  /// rounds all of them at the pill radius, for AvatarButton's round box.
  var corners: PMButtonCorners = .all

  func makeBody(configuration: Configuration) -> some View {
    PMButtonChrome(style: self, pressed: configuration.isPressed) { configuration.label }
  }
}

/// Which corners of a Button the control radius rounds, or `round` for every
/// corner at the pill radius.
enum PMButtonCorners {
  case all
  case leading
  case trailing
  case round
}

private struct PMButtonChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let style: PMButtonStyle
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let metrics = PMControlMetrics(style.controlSize, theme)
    let height = metrics.height
    let motion = theme.defaultMotion
    let phase = self.phase
    let cell = PMButtonCell(style.appearance, phase, colors: theme.colors)
    let radius = style.corners == .round ? theme.radius.pill : theme.radius.control
    let leading = style.corners == .trailing ? 0 : radius
    let trailing = style.corners == .leading ? 0 : radius
    let shape = UnevenRoundedRectangle(
      topLeadingRadius: leading, bottomLeadingRadius: leading, bottomTrailingRadius: trailing,
      topTrailingRadius: trailing)

    label()
      .pmTextStyle(metrics.text)
      .foregroundStyle(cell.text.color)
      .padding(.horizontal, style.iconOnly ? 0 : metrics.padding)
      // The density's height, and square when icon-only. Larger text grows
      // the button rather than clipping its label.
      .frame(minWidth: style.iconOnly ? height : nil, minHeight: height)
      .background {
        shape
          .fill(cell.fill?.color ?? .clear)
          .overlay {
            if cell.gradient, !theme.gradients.accentGradient.solid {
              shape.fill(theme.gradients.accentGradient.linear)
            }
          }
          .pmInsetShadow(cell.lit ? theme.insetTop : PMShadow(layers: []), in: shape)
          .pmShadow(shadow(cell))
      }
      // A hairline on every cell, transparent where the recipe has no border,
      // so every variant is one size.
      .overlay { shape.strokeBorder(cell.border?.color ?? .clear, lineWidth: 1) }
      .pmPressFeedback(pressed && enabled && !style.loading)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control), value: phase
      )
      .onHover { hovering = $0 }
      .modifier(PMButtonHitArea(style: style, height: height))
  }

  private var phase: PMButtonPhase {
    if !enabled { return .disabled }
    // Loading keeps the rest colours and answers neither the pointer nor the press.
    if style.loading { return .rest }
    if pressed || style.on { return .active }
    return hovering ? .hover : .rest
  }

  /// The lit fill's seat at rest; the glow replaces it while an accent solid
  /// is hovered, because the glow carries the accent's colour.
  private func shadow(_ cell: PMButtonCell) -> PMShadow {
    if cell.glow { return theme.glow.hover }
    return cell.lit ? theme.shadows.seat : PMShadow(layers: [])
  }
}

/// A Button's hit area: the hit target around the drawn control. A split
/// half's icon-only chevron keeps its drawn square in the layout and reaches
/// past it, so the two halves meet at the seam.
private struct PMButtonHitArea: ViewModifier {
  let style: PMButtonStyle
  let height: CGFloat

  func body(content: Content) -> some View {
    if style.iconOnly && (style.corners == .leading || style.corners == .trailing) {
      content.pmHitTarget(drawn: CGSize(width: height, height: height))
    } else {
      content.pmHitTarget()
    }
  }
}

enum PMButtonPhase: Hashable {
  case rest, hover, active, disabled
}

/// One cell of the recipe: the colours of a variant × tone in a phase,
/// written out beside the spec's tables rather than derived. The CSS is the
/// authority where the two differ: outline/neutral's border is `border.field`.
struct PMButtonCell {
  var text: PMDynamicColor
  var fill: PMDynamicColor? = nil
  var border: PMDynamicColor? = nil
  /// The accent gradient over the fill, where the theme has one.
  var gradient = false
  /// The lit fill: the seat shadow and the inset top light.
  var lit = false
  /// The hover glow, in place of the lit fill's shadow.
  var glow = false

  init(_ appearance: PMButtonAppearance, _ phase: PMButtonPhase, colors c: PMColors) {
    if phase == .disabled {
      // One recipe per variant, whatever the tone (conventions §5).
      switch appearance.variant {
      case .solid, .soft: self.init(text: c.textDisabled, fill: c.bgSubtle)
      case .outline: self.init(text: c.textDisabled, border: c.borderSubtle)
      case .ghost: self.init(text: c.textDisabled)
      }
      return
    }
    switch (appearance, phase) {
    case (.solidAccent, .rest):
      self.init(text: c.accentContrast, fill: c.accentBg, gradient: true, lit: true)
    case (.solidAccent, .hover):
      self.init(text: c.accentContrast, fill: c.accentBgHover, gradient: true, glow: true)
    case (.solidAccent, _):
      self.init(text: c.accentContrast, fill: c.accentBgActive, gradient: true, lit: true)

    case (.solidDanger, .rest): self.init(text: c.dangerContrast, fill: c.dangerSolid, lit: true)
    case (.solidDanger, .hover):
      self.init(text: c.dangerContrast, fill: c.dangerSolidHover, lit: true)
    case (.solidDanger, _):
      self.init(text: c.dangerContrast, fill: c.dangerSolidActive, lit: true)

    case (.softAccent, .rest): self.init(text: c.accentText, fill: c.accentSubtle)
    case (.softAccent, .hover): self.init(text: c.accentText, fill: c.accentSubtleHover)
    case (.softAccent, _): self.init(text: c.accentText, fill: c.accentSubtleActive)

    case (.softDanger, .rest): self.init(text: c.dangerText, fill: c.dangerSubtle)
    case (.softDanger, .hover): self.init(text: c.dangerText, fill: c.dangerSubtleHover)
    case (.softDanger, _): self.init(text: c.dangerText, fill: c.dangerSubtleActive)

    case (.outlineNeutral, .rest): self.init(text: c.textPrimary, border: c.borderField)
    case (.outlineNeutral, _):
      self.init(text: c.textPrimary, fill: c.bgSubtle, border: c.borderStrong)

    case (.outlineAccent, .rest): self.init(text: c.accentText, border: c.accentBg)
    case (.outlineAccent, .hover):
      self.init(text: c.accentText, fill: c.accentSubtle, border: c.accentBg)
    case (.outlineAccent, _):
      self.init(text: c.accentText, fill: c.accentSubtleHover, border: c.accentBg)

    case (.outlineDanger, .rest): self.init(text: c.dangerText, border: c.dangerBorder)
    case (.outlineDanger, .hover):
      self.init(text: c.dangerText, fill: c.dangerSubtle, border: c.dangerBorder)
    case (.outlineDanger, _):
      self.init(text: c.dangerText, fill: c.dangerSubtleHover, border: c.dangerBorder)

    case (.ghostNeutral, .rest): self.init(text: c.textSecondary)
    case (.ghostNeutral, _): self.init(text: c.textPrimary, fill: c.bgSubtle)

    case (.ghostAccent, .rest): self.init(text: c.accentText)
    case (.ghostAccent, .hover): self.init(text: c.accentText, fill: c.accentSubtle)
    case (.ghostAccent, _): self.init(text: c.accentText, fill: c.accentSubtleHover)

    case (.ghostDanger, .rest): self.init(text: c.dangerText)
    case (.ghostDanger, .hover): self.init(text: c.dangerText, fill: c.dangerSubtle)
    case (.ghostDanger, _): self.init(text: c.dangerText, fill: c.dangerSubtleHover)
    }
  }

  private init(
    text: PMDynamicColor, fill: PMDynamicColor? = nil, border: PMDynamicColor? = nil,
    gradient: Bool = false, lit: Bool = false, glow: Bool = false
  ) {
    self.text = text
    self.fill = fill
    self.border = border
    self.gradient = gradient
    self.lit = lit
    self.glow = glow
  }
}

/// Button's states, from the spec's States table: every lawful cell at `md`,
/// the three sizes, the icons, icon-only, loading, disabled (one recipe per
/// variant), and the toggle on and off.
public struct ButtonStates: PMStates {
  public let member = "Button"

  public init() {}

  public var entries: [PMStateEntry] {
    let cells = PMButtonAppearance.lawful.map { cell in
      PMStateEntry(
        "\(cell.variant.rawValue) / \(cell.tone.rawValue)",
        expect: ["variant": cell.variant.rawValue, "tone": cell.tone.rawValue, "label": "Save"]
      ) {
        PMButton(props: PMButtonProps(label: "Save", appearance: cell))
      }
    }
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue, "label": "Save"]) {
        PMButton(props: PMButtonProps(label: "Save", size: size))
      }
    }
    let disabled = PMButtonVariant.allCases.map { variant in
      let cell = PMButtonAppearance.lawful.first { $0.variant == variant } ?? .solidAccent
      return PMStateEntry(
        "disabled \(variant.rawValue)",
        expect: ["variant": variant.rawValue, "disabled": "true", "label": "Save"]
      ) {
        PMButton(props: PMButtonProps(disabled: true, label: "Save", appearance: cell))
      }
    }
    return cells + sizes + [
      PMStateEntry("sizes side by side", expect: ["size": "sm"]) {
        HStackOfSizes()
      },
      PMStateEntry("leading icon", expect: ["label": "New ticket"]) {
        PMButton(props: PMButtonProps(icon: .add, label: "New ticket"))
      },
      PMStateEntry("trailing icon", expect: ["label": "Continue"]) {
        PMButton(props: PMButtonProps(label: "Continue", trailingIcon: .next))
      },
      PMStateEntry("icon-only", expect: ["icon-only": "true", "label": "Edit"]) {
        PMButton(props: PMButtonProps(icon: .edit, iconOnly: true, label: "Edit"))
      },
      PMStateEntry("icon-only at every size", expect: ["icon-only": "true", "size": "sm"]) {
        HStackOfSizes(iconOnly: true)
      },
      PMStateEntry(
        "loading", expect: ["state": "loading", "label": "Saving", "value": "Loading"]
      ) {
        PMButton(props: PMButtonProps(label: "Saving", loading: true))
      },
      PMStateEntry("loading, with a leading icon it replaces", expect: ["state": "loading"]) {
        PMButton(props: PMButtonProps(icon: .add, label: "New ticket", loading: true))
      },
      PMStateEntry("loading + disabled", expect: ["state": "loading", "disabled": "true"]) {
        PMButton(props: PMButtonProps(disabled: true, label: "Saving", loading: true))
      },
      PMStateEntry("pressed on — the active cell, latched", expect: ["state": "on"]) {
        PMButton(props: PMButtonProps(label: "Watching", pressed: true, appearance: .softAccent))
      },
      PMStateEntry("pressed off — the rest cell", expect: ["state": "off"]) {
        PMButton(props: PMButtonProps(label: "Watching", pressed: false, appearance: .softAccent))
      },
      PMStateEntry(
        "expanded — a disclosure’s trigger while its region shows",
        expect: ["expanded": "true", "label": "Details", "value": "expanded"]
      ) {
        PMButton(
          props: PMButtonProps(
            expanded: true, icon: .up, iconOnly: true, label: "Details", appearance: .ghostNeutral))
      },
      PMStateEntry(
        "collapsed — the same trigger while its region is hidden",
        expect: ["expanded": "false", "label": "Details", "value": "collapsed"]
      ) {
        PMButton(
          props: PMButtonProps(
            expanded: false, icon: .down, iconOnly: true, label: "Details", appearance: .ghostNeutral)
        )
      },
      PMStateEntry(
        "a count on the corner of an icon-only button",
        expect: ["count": "3", "label": "Notifications, 3 unread"]
      ) {
        PMButton(
          props: PMButtonProps(
            count: PMButtonCount(value: 3, label: "Notifications, 3 unread"), icon: .notification,
            iconOnly: true, label: "Notifications", appearance: .ghostNeutral))
      },
      PMStateEntry(
        "a count past its cap", expect: ["count": "99+", "label": "Notifications, 128 unread"]
      ) {
        PMButton(
          props: PMButtonProps(
            count: PMButtonCount(value: 128, label: "Notifications, 128 unread"),
            icon: .notification, iconOnly: true, label: "Notifications", appearance: .ghostNeutral)
        )
      },
      PMStateEntry("a count of zero", expect: ["label": "Notifications"]) {
        PMButton(
          props: PMButtonProps(
            count: PMButtonCount(value: 0, label: "Notifications, 0 unread"), icon: .notification,
            iconOnly: true, label: "Notifications", appearance: .ghostNeutral))
      },
      PMStateEntry(
        "a count beside a label", expect: ["count": "12", "label": "Inbox, 12 unread"]
      ) {
        PMButton(
          props: PMButtonProps(
            count: PMButtonCount(value: 12, label: "Inbox, 12 unread"), label: "Inbox",
            appearance: .outlineNeutral))
      },
    ] + disabled
  }
}

/// The three sizes in a row, each with a leading icon: as labelled buttons, or icon-only.
private struct HStackOfSizes: View {
  @Environment(\.pmTheme) private var theme
  var iconOnly = false

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      ForEach(PMControlSize.allCases, id: \.self) { size in
        PMButton(
          props: PMButtonProps(
            icon: iconOnly ? .delete : .add, iconOnly: iconOnly,
            label: iconOnly ? "Delete (\(size.rawValue))" : size.rawValue, size: size))
      }
    }
  }
}
