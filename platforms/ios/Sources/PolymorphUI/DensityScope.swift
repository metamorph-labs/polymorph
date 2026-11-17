// DensityScope (rung 2 of the exception ladder, `docs/rules.md`): a region of
// the screen at another density. On the web it sets `data-density` on a
// subtree, and the stylesheet's density block for that value applies there.
// Here it hands its children the same pairing with the density axis set to
// `value`, so every member inside reads its space, control heights and insets
// from `theme.defaultDensity` at that density, and nothing else changes: the
// type scale, the colours and the motion are the pairing's, as the web's
// density block declares space and control heights only. The hit target is
// the density's, which is 44 points on iOS at every density.
//
// A scope is a wrapper, not a surface: it draws nothing, and its children are
// read one by one. `as` chooses the web's element (`div`, `section`, `span`),
// which has no SwiftUI counterpart; it is kept as an attribute.

import PolymorphTokens
import SwiftUI

public struct PMDensityScope: PMDensityScopeRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMDensityScopeProps

  public init(props: PMDensityScopeProps) {
    self.props = props
  }

  public var body: some View {
    let density = Self.density(props.value)

    Group {
      if let children = props.children { children }
    }
    .pmTheme(theme.at(density: density))
    .accessibilityElement(children: .contain)
    .pmMember(
      "DensityScope", ["density": props.value.rawValue, "as": (props.as ?? .div).rawValue])
  }

  private static func density(_ value: PMDensityScopeValue) -> PMDensityName {
    switch value {
    case .compact: .compact
    case .standard: .standard
    case .comfortable: .comfortable
    }
  }
}

extension PMTheme {
  /// The same pairing with its density axis set to `density`: every other
  /// value, the axes included, as they are.
  fileprivate func at(density: PMDensityName) -> PMTheme {
    let axes = PMAxes(
      geometry: axes.geometry, depth: axes.depth, density: density,
      contrastTemperament: axes.contrastTemperament, typePersonality: axes.typePersonality,
      colorStrategy: axes.colorStrategy, motionTemperament: axes.motionTemperament,
      ornament: axes.ornament)
    return PMTheme(
      name: name, system: system, palette: palette, kind: kind, axes: axes,
      defaultMode: defaultMode, chartCap: chartCap, fonts: fonts, numeric: numeric, text: text,
      display: display, radius: radius, shadows: shadows, insetTop: insetTop, glow: glow,
      material: material, focus: focus, icon: icon, z: z, colors: colors, chart: chart,
      gradients: gradients, shell: shell, density: self.density, motion: motion,
      exceptions: exceptions, unsupported: unsupported)
  }
}

/// DensityScope's states: a form row at each density, so the three read side
/// by side, and a scope around a table, the case the inbox writes.
public struct DensityScopeStates: PMStates {
  public let member = "DensityScope"

  public init() {}

  public var entries: [PMStateEntry] {
    let densities = PMDensityScopeValue.allCases.map { value in
      PMStateEntry(value.rawValue, expect: ["density": value.rawValue, "as": "div"]) {
        PMDensityScope(
          props: PMDensityScopeProps(children: PMContent(DensityScopeSample()), value: value))
      }
    }
    return densities + [
      PMStateEntry(
        "a compact table in a section",
        expect: ["density": "compact", "as": "section"]
      ) {
        PMDensityScope(
          props: PMDensityScopeProps(as: .section, children: PMPageSamples.table(), value: .compact))
      }
    ]
  }
}

/// A field and its actions, whose heights and gaps show the density.
private struct DensityScopeSample: View {
  var body: some View {
    PMStack(
      props: PMStackProps(
        children: PMContent(
          Group {
            PMInput(props: PMInputProps(ariaLabel: "Subject", defaultValue: "Refund request"))
            PMInline(
              props: PMInlineProps(
                children: PMContent(
                  Group {
                    PMButton(props: PMButtonProps(label: "Cancel", appearance: .outlineNeutral))
                    PMButton(props: PMButtonProps(label: "Save"))
                  }), gap: .s3))
          }), gap: .s4))
  }
}
