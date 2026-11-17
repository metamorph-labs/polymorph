// ToneScope (rung 2 of the exception ladder, `docs/rules.md`): an inverted
// region, `value: .inverse`, the one tone there is. On the web it sets
// `data-tone="inverse"`, and the colour and chart roles take the opposite
// mode's values there, while the gradients, glows, shadows, shell surfaces and
// the glass surface keep the outer scope's.
//
// Here the region is drawn in the opposite colour scheme, the platform's own
// way of inverting a region, so every role resolves to the other mode's value
// and the system-drawn parts inside (a menu, a picker, a text cursor) invert
// with it. The values the web keeps are kept: the region's pairing has their
// light and dark values exchanged, so they resolve, in the opposite scheme,
// to what the outer scheme gives. It is not a second palette, and it adds no
// value the pairing does not have.
//
// A scope is a wrapper, not a surface: it draws nothing, and its children are
// read one by one. A child that wants the inverted surface draws it, as a
// Card does. `as` chooses the web's element and is kept as an attribute.

import PolymorphTokens
import SwiftUI

public struct PMToneScope: PMToneScopeRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.colorScheme) private var scheme
  private let props: PMToneScopeProps

  public init(props: PMToneScopeProps) {
    self.props = props
  }

  public var body: some View {
    Group {
      // The switch names every tone, so a tone the contract adds does not
      // compile until it is drawn.
      switch props.value {
      case .inverse:
        Group {
          if let children = props.children { children }
        }
        .pmTheme(theme.keepingOuterScheme())
        .environment(\.colorScheme, scheme == .dark ? .light : .dark)
      }
    }
    .accessibilityElement(children: .contain)
    .pmMember("ToneScope", ["tone": props.value.rawValue, "as": (props.as ?? .div).rawValue])
  }
}

extension PMDynamicColor {
  /// The light and dark values exchanged: in the opposite scheme it resolves
  /// as this colour does in the outer one.
  fileprivate var exchanged: PMDynamicColor { PMDynamicColor(light: dark, dark: light) }
}

extension PMShadow {
  fileprivate var exchanged: PMShadow {
    PMShadow(
      layers: layers.map {
        PMShadowLayer(
          x: $0.x, y: $0.y, blur: $0.blur, spread: $0.spread, color: $0.color.exchanged,
          inset: $0.inset)
      })
  }
}

extension PMGradient {
  fileprivate var exchanged: PMGradient {
    PMGradient(
      solid: solid, angle: angle,
      stops: stops.map { PMGradientStop(color: $0.color.exchanged, at: $0.at) })
  }
}

extension PMTheme {
  /// The pairing with every value the web's inverse tone keeps exchanged, so
  /// that drawn in the opposite scheme those values are the outer scheme's:
  /// the shadows, the inset top light, the glows, the gradients, the shell
  /// surfaces, the glass surface and the shadows member exceptions name.
  fileprivate func keepingOuterScheme() -> PMTheme {
    let shadows = PMShadows(
      control: self.shadows.control.exchanged, raised: self.shadows.raised.exchanged,
      overlay: self.shadows.overlay.exchanged, seat: self.shadows.seat.exchanged,
      resting: self.shadows.resting.exchanged, transient: self.shadows.transient.exchanged)
    let glow = PMGlow(focus: self.glow.focus.exchanged, hover: self.glow.hover.exchanged)
    let gradients = PMGradients(
      accentGradient: self.gradients.accentGradient.exchanged,
      bgWash: self.gradients.bgWash.exchanged)
    let shell = PMShell(
      topbarBg: self.shell.topbarBg.exchanged, railBg: self.shell.railBg.exchanged,
      topbarBorder: self.shell.topbarBorder.exchanged,
      railBorder: self.shell.railBorder.exchanged)
    let material = PMMaterial(
      blur: self.material.blur, saturate: self.material.saturate,
      surface: self.material.surface.exchanged)
    let exceptions = self.exceptions.map { exception -> PMException in
      guard case .shadow(let shadow) = exception.value else { return exception }
      return PMException(
        member: exception.member, token: exception.token, ref: exception.ref,
        value: .shadow(shadow.exchanged))
    }
    return PMTheme(
      name: name, system: system, palette: palette, kind: kind, axes: axes,
      defaultMode: defaultMode, chartCap: chartCap, fonts: fonts, numeric: numeric, text: text,
      display: display, radius: radius, shadows: shadows, insetTop: insetTop.exchanged,
      glow: glow, material: material, focus: focus, icon: icon, z: z, colors: colors,
      chart: chart, gradients: gradients, shell: shell, density: density, motion: motion,
      exceptions: exceptions, unsupported: unsupported)
  }
}

/// ToneScope's states: an inverted panel, a Card inside it, and a Badge and a
/// Button on the inverted surface, the roles all from the other mode.
public struct ToneScopeStates: PMStates {
  public let member = "ToneScope"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "inverse — a card in the other mode",
        expect: ["tone": "inverse", "as": "div", "contains": "Heading,Text"]
      ) {
        PMToneScope(
          props: PMToneScopeProps(children: PMContent(ToneScopeSample()), value: .inverse))
      },
      PMStateEntry(
        "inverse section — a badge and a button", expect: ["tone": "inverse", "as": "section"]
      ) {
        PMToneScope(
          props: PMToneScopeProps(
            as: .section,
            children: PMContent(
              PMCard(
                props: PMCardProps(
                  children: PMContent(
                    PMInline(
                      props: PMInlineProps(
                        children: PMContent(
                          Group {
                            PMBadge(props: PMBadgeProps(children: "Beta", tone: .accent))
                            PMButton(props: PMButtonProps(label: "Try it"))
                          }), gap: .s3)))))),
            value: .inverse))
      },
    ]
  }
}

/// A card with a heading and a line of body text.
private struct ToneScopeSample: View {
  private static let note = "Saved views now follow you between devices."

  var body: some View {
    PMCard(
      props: PMCardProps(
        children: PMContent(
          PMStack(
            props: PMStackProps(
              children: PMContent(
                Group {
                  PMHeading(props: PMHeadingProps(children: "What’s new", level: .level3))
                  PMText(props: PMTextProps(children: PMContent(Text(Self.note)), tone: .secondary))
                }), gap: .s2)))))
  }
}
