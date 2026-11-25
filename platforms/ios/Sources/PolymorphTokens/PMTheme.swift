// The types the generated pairings in `Generated/` are values of. Written by
// hand and kept stable: `pnpm emit:native` writes only `Generated/`.
//
// Every value comes from the theme engine's token document for iOS
// (`packages/theme/src/emit-tokens.ts`), which resolves every reference and
// raises the hit target to Apple's 44 points. Control heights stay the
// density's, as on the web: the 44 points are a hit area, so a member extends
// its hit area to `hitTarget` (`.contentShape` over a frame of at least that
// size) and keeps its height. Lengths are points: the CSS reference pixel is
// the iOS point. Type sizes are rem × 16.
//
// Names. A member is its token path relative to its group, camelCased:
// `accent.bgHover` is `colors.accentBgHover`, `shell.topbar.bg` is
// `shell.topbarBg`. A name that would start with a digit takes a prefix, the
// group's name or, for the space ladder, `s`: `chart.1` is `chart.chart1`,
// `text.2xl` is `text.text2xl`, `space.0` is `space.s0`. A name that is a
// Swift keyword is renamed: the `default` spring is `spring.base`.
// `swiftMember` in `packages/theme/src/emit-swift.ts` is the rule.
//
// Not here, on purpose:
// - The page texture (`texture.page`) is an SVG noise tile no native toolkit
//   draws. It is listed in `PMTheme.unsupported` and not emitted.
// - Inverse tone has no table. On the web, `[data-tone="inverse"]` borrows the
//   other mode's value for the colour and chart roles alone; gradients, glows,
//   shell surfaces and the glass surface keep the outer scope's. Under
//   `.environment(\.colorScheme, …)` set to the opposite scheme, every dynamic
//   value flips, those four included. A renderer that draws the web's inverse
//   tone resolves the colour and chart roles in the opposite scheme
//   (`resolved(in:)`) and leaves the rest; the token document's `inverse`
//   table lists them.

import CoreText
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

// MARK: - Colour

/// An sRGB colour: channels 0–255, exactly as the stylesheet ships them, and
/// an alpha.
public struct PMRGBA: Sendable, Hashable {
  public let red: UInt8
  public let green: UInt8
  public let blue: UInt8
  public let alpha: Double

  public init(_ red: UInt8, _ green: UInt8, _ blue: UInt8, _ alpha: Double = 1) {
    self.red = red
    self.green = green
    self.blue = blue
    self.alpha = alpha
  }

  /// `#rrggbb`, without the alpha.
  public var hex: String { String(format: "#%02x%02x%02x", red, green, blue) }

  public var color: Color {
    Color(
      .sRGB, red: Double(red) / 255, green: Double(green) / 255, blue: Double(blue) / 255,
      opacity: alpha)
  }

  #if canImport(UIKit)
    public var uiColor: UIColor {
      UIColor(
        red: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255,
        alpha: CGFloat(alpha))
    }
  #elseif canImport(AppKit)
    public var nsColor: NSColor {
      NSColor(
        srgbRed: CGFloat(red) / 255, green: CGFloat(green) / 255, blue: CGFloat(blue) / 255,
        alpha: CGFloat(alpha))
    }
  #endif
}

/// A colour role: its light and dark values. `color` resolves by the colour
/// scheme of the environment it is drawn in, so one value serves both modes.
public struct PMDynamicColor: Sendable, Hashable {
  public let light: PMRGBA
  public let dark: PMRGBA

  public init(light: PMRGBA, dark: PMRGBA) {
    self.light = light
    self.dark = dark
  }

  /// The same value in both modes (a shadow's colour).
  public init(_ both: PMRGBA) {
    self.init(light: both, dark: both)
  }

  public func resolved(in scheme: ColorScheme) -> PMRGBA {
    scheme == .dark ? dark : light
  }

  #if canImport(UIKit)
    /// Built on `UIColor(dynamicProvider:)`: resolves by the trait
    /// collection's `userInterfaceStyle`.
    public var uiColor: UIColor {
      let (light, dark) = (light, dark)
      return UIColor { traits in
        (traits.userInterfaceStyle == .dark ? dark : light).uiColor
      }
    }

    public var color: Color { Color(uiColor: uiColor) }
  #elseif canImport(AppKit)
    /// Built on `NSColor(name:dynamicProvider:)`: resolves by the appearance
    /// it is drawn in.
    public var nsColor: NSColor {
      let (light, dark) = (light, dark)
      return NSColor(name: nil) { appearance in
        let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        return (isDark ? dark : light).nsColor
      }
    }

    public var color: Color { Color(nsColor: nsColor) }
  #endif
}

// MARK: - Names

public enum PMThemeKind: String, Sendable, Hashable, CaseIterable {
  case designed, tenant
}

public enum PMModePreference: String, Sendable, Hashable, CaseIterable {
  case light, dark, system

  /// For `.preferredColorScheme(_:)`: `nil` follows the device.
  public var colorScheme: ColorScheme? {
    switch self {
    case .light: .light
    case .dark: .dark
    case .system: nil
    }
  }
}

public enum PMDensityName: String, Sendable, Hashable, CaseIterable {
  case compact, standard, comfortable
}

public enum PMMotionTemperament: String, Sendable, Hashable, CaseIterable {
  case none, subtle, standard, expressive
}

public enum PMFontFallback: String, Sendable, Hashable, CaseIterable {
  case sans, serif, mono

  public var design: Font.Design {
    switch self {
    case .sans: .default
    case .serif: .serif
    case .mono: .monospaced
    }
  }
}

/// What a member exception re-points its class token to.
public enum PMExceptionValue: Sendable, Hashable {
  case radius(CGFloat)
  case shadow(PMShadow)
  /// An inset names a space step, so its value varies by density.
  case inset(PMDensityLengths)
}

// MARK: - Values

/// A resolved pairing: every token the stylesheet ships for it, as values.
public struct PMTheme: Sendable, Hashable {
  /// `<system>/<palette>`.
  public let name: String
  public let system: String
  public let palette: String
  public let kind: PMThemeKind
  /// The system's eight axes.
  public let axes: PMAxes
  /// The mode the system opens in.
  public let defaultMode: PMModePreference
  /// The any-neighbour series cap: how many chart slots a chart may use.
  public let chartCap: Int
  public let fonts: PMFonts
  public let numeric: PMNumeric
  public let text: PMTextStyles
  public let display: PMDisplayStyles
  public let radius: PMRadius
  public let shadows: PMShadows
  /// The top highlight drawn inside raised surfaces; no layers when the depth has none.
  public let insetTop: PMShadow
  public let glow: PMGlow
  public let material: PMMaterial
  public let focus: PMFocus
  public let icon: PMIconScale
  public let z: PMZ
  public let colors: PMColors
  public let chart: PMChart
  public let gradients: PMGradients
  public let shell: PMShell
  /// All three densities, whatever the axes select; `axes.density` names the default.
  public let density: PMDensities
  /// All four temperaments, whatever the axes select; `axes.motionTemperament` names the default.
  public let motion: PMMotions
  /// Member exceptions the system declares, with their targets resolved.
  public let exceptions: [PMException]
  /// Token paths iOS cannot draw. They are listed and not emitted.
  public let unsupported: [String]

  public init(
    name: String,
    system: String,
    palette: String,
    kind: PMThemeKind,
    axes: PMAxes,
    defaultMode: PMModePreference,
    chartCap: Int,
    fonts: PMFonts,
    numeric: PMNumeric,
    text: PMTextStyles,
    display: PMDisplayStyles,
    radius: PMRadius,
    shadows: PMShadows,
    insetTop: PMShadow,
    glow: PMGlow,
    material: PMMaterial,
    focus: PMFocus,
    icon: PMIconScale,
    z: PMZ,
    colors: PMColors,
    chart: PMChart,
    gradients: PMGradients,
    shell: PMShell,
    density: PMDensities,
    motion: PMMotions,
    exceptions: [PMException],
    unsupported: [String]
  ) {
    self.name = name
    self.system = system
    self.palette = palette
    self.kind = kind
    self.axes = axes
    self.defaultMode = defaultMode
    self.chartCap = chartCap
    self.fonts = fonts
    self.numeric = numeric
    self.text = text
    self.display = display
    self.radius = radius
    self.shadows = shadows
    self.insetTop = insetTop
    self.glow = glow
    self.material = material
    self.focus = focus
    self.icon = icon
    self.z = z
    self.colors = colors
    self.chart = chart
    self.gradients = gradients
    self.shell = shell
    self.density = density
    self.motion = motion
    self.exceptions = exceptions
    self.unsupported = unsupported
  }
}

/// The system's eight axes, as the system document writes them. The two that select a scope are typed as that scope's name.
public struct PMAxes: Sendable, Hashable {
  public let geometry: String
  public let depth: String
  public let density: PMDensityName
  public let contrastTemperament: String
  public let typePersonality: String
  public let colorStrategy: String
  public let motionTemperament: PMMotionTemperament
  public let ornament: String

  public init(
    geometry: String,
    depth: String,
    density: PMDensityName,
    contrastTemperament: String,
    typePersonality: String,
    colorStrategy: String,
    motionTemperament: PMMotionTemperament,
    ornament: String
  ) {
    self.geometry = geometry
    self.depth = depth
    self.density = density
    self.contrastTemperament = contrastTemperament
    self.typePersonality = typePersonality
    self.colorStrategy = colorStrategy
    self.motionTemperament = motionTemperament
    self.ornament = ornament
  }
}

/// The three font slots.
public struct PMFonts: Sendable, Hashable {
  public let body: PMFont
  public let display: PMFont
  public let mono: PMFont

  public init(body: PMFont, display: PMFont, mono: PMFont) {
    self.body = body
    self.display = display
    self.mono = mono
  }
}

/// A font slot: the family to bundle, and what the type steps ask of it.
public struct PMFont: Sendable, Hashable {
  /// The family name, without Fontsource's ` Variable` suffix.
  public let family: String
  /// Whether the system seeds the variable build of the family.
  public let variable: Bool
  /// The system design to fall back to when the family is not installed.
  public let fallback: PMFontFallback
  public let italic: Bool
  /// Every weight a type step sets in this slot, ascending.
  public let weights: [Int]
  /// The display slot only: every optical size a display step requests, ascending.
  public let opsz: [Double]

  public init(
    family: String,
    variable: Bool,
    fallback: PMFontFallback,
    italic: Bool,
    weights: [Int],
    opsz: [Double]
  ) {
    self.family = family
    self.variable = variable
    self.fallback = fallback
    self.italic = italic
    self.weights = weights
    self.opsz = opsz
  }
}

/// `font-variant-numeric` as two switches, and the side of its column a
/// numeric column's figures sit on.
public struct PMNumeric: Sendable, Hashable {
  /// Tabular figures (`tnum`): `Font.monospacedDigit()`.
  public let tabular: Bool
  /// A slashed zero (`zero`).
  public let slashedZero: Bool
  /// The side of its column a numeric column's figures sit on (`numeric.align`),
  /// which Table's and DataTable's numeric headers and cells read.
  public let align: PMNumericAlign

  public init(tabular: Bool, slashedZero: Bool, align: PMNumericAlign = .end) {
    self.tabular = tabular
    self.slashedZero = slashedZero
    self.align = align
  }
}

/// The side of its column a numeric column's figures sit on: `end`, the
/// default, or `start`. Both keep tabular figures.
public enum PMNumericAlign: String, Sendable, Hashable, CaseIterable {
  case end, start

  /// Where a cell's frame places its content.
  public var alignment: Alignment {
    switch self {
    case .end: .trailing
    case .start: .leading
    }
  }

  /// How a cell's lines of text align.
  public var textAlignment: TextAlignment {
    switch self {
    case .end: .trailing
    case .start: .leading
    }
  }
}

/// The text steps. `2xl` and `3xl` start with a digit, so they are `text2xl` and `text3xl`.
public struct PMTextStyles: Sendable, Hashable {
  public let xs: PMTextStyle
  public let sm: PMTextStyle
  public let md: PMTextStyle
  public let lg: PMTextStyle
  public let xl: PMTextStyle
  public let text2xl: PMTextStyle
  public let text3xl: PMTextStyle

  public init(
    xs: PMTextStyle,
    sm: PMTextStyle,
    md: PMTextStyle,
    lg: PMTextStyle,
    xl: PMTextStyle,
    text2xl: PMTextStyle,
    text3xl: PMTextStyle
  ) {
    self.xs = xs
    self.sm = sm
    self.md = md
    self.lg = lg
    self.xl = xl
    self.text2xl = text2xl
    self.text3xl = text3xl
  }
}

/// The display steps.
public struct PMDisplayStyles: Sendable, Hashable {
  public let sm: PMTextStyle
  public let md: PMTextStyle
  public let lg: PMTextStyle

  public init(sm: PMTextStyle, md: PMTextStyle, lg: PMTextStyle) {
    self.sm = sm
    self.md = md
    self.lg = lg
  }
}

/// One type step.
public struct PMTextStyle: Sendable, Hashable {
  /// Points: the step's rem × 16.
  public let size: CGFloat
  /// A multiplier of `size`, as CSS `line-height` is.
  public let lineHeight: CGFloat
  /// The weight as a number (100–900, or between for a variable family). `weight` is the nearest `Font.Weight`.
  public let wght: Int
  /// Points: the step's em tracking × `size`.
  public let tracking: CGFloat
  public let family: String
  public let fallback: PMFontFallback
  public let italic: Bool
  /// The optical size a display step requests; `nil` for a text step.
  public let opsz: Double?

  public init(
    size: CGFloat,
    lineHeight: CGFloat,
    wght: Int,
    tracking: CGFloat,
    family: String,
    fallback: PMFontFallback,
    italic: Bool,
    opsz: Double?
  ) {
    self.size = size
    self.lineHeight = lineHeight
    self.wght = wght
    self.tracking = tracking
    self.family = family
    self.fallback = fallback
    self.italic = italic
    self.opsz = opsz
  }
}

/// Corner radii in points: the five steps, then the three classes members read.
public struct PMRadius: Sendable, Hashable {
  public let none: CGFloat
  public let sm: CGFloat
  public let md: CGFloat
  public let lg: CGFloat
  public let pill: CGFloat
  public let control: CGFloat
  public let detail: CGFloat
  public let surface: CGFloat

  public init(
    none: CGFloat,
    sm: CGFloat,
    md: CGFloat,
    lg: CGFloat,
    pill: CGFloat,
    control: CGFloat,
    detail: CGFloat,
    surface: CGFloat
  ) {
    self.none = none
    self.sm = sm
    self.md = md
    self.lg = lg
    self.pill = pill
    self.control = control
    self.detail = detail
    self.surface = surface
  }
}

/// Shadows: the three steps, then the three classes members read.
public struct PMShadows: Sendable, Hashable {
  public let control: PMShadow
  public let raised: PMShadow
  public let overlay: PMShadow
  public let seat: PMShadow
  public let resting: PMShadow
  public let transient: PMShadow

  public init(
    control: PMShadow,
    raised: PMShadow,
    overlay: PMShadow,
    seat: PMShadow,
    resting: PMShadow,
    transient: PMShadow
  ) {
    self.control = control
    self.raised = raised
    self.overlay = overlay
    self.seat = seat
    self.resting = resting
    self.transient = transient
  }
}

/// A `box-shadow` as layers, back to front. No layers is `none`.
public struct PMShadow: Sendable, Hashable {
  public let layers: [PMShadowLayer]

  public init(layers: [PMShadowLayer]) {
    self.layers = layers
  }
}

/// One shadow layer, in points.
public struct PMShadowLayer: Sendable, Hashable {
  public let x: CGFloat
  public let y: CGFloat
  /// The CSS blur radius. SwiftUI's `shadow(radius:)` is about half of it.
  public let blur: CGFloat
  public let spread: CGFloat
  /// Constant for a shadow; per mode for a glow, which takes its colour from a role.
  public let color: PMDynamicColor
  public let inset: Bool

  public init(
    x: CGFloat,
    y: CGFloat,
    blur: CGFloat,
    spread: CGFloat,
    color: PMDynamicColor,
    inset: Bool
  ) {
    self.x = x
    self.y = y
    self.blur = blur
    self.spread = spread
    self.color = color
    self.inset = inset
  }
}

/// Halos, coloured from the accent's glow role in each mode.
public struct PMGlow: Sendable, Hashable {
  public let focus: PMShadow
  public let hover: PMShadow

  public init(focus: PMShadow, hover: PMShadow) {
    self.focus = focus
    self.hover = hover
  }
}

/// The glass material.
public struct PMMaterial: Sendable, Hashable {
  /// The backdrop blur radius, in points.
  public let blur: CGFloat
  /// The backdrop saturation multiplier.
  public let saturate: Double
  /// The pane's fill.
  public let surface: PMDynamicColor

  public init(blur: CGFloat, saturate: Double, surface: PMDynamicColor) {
    self.blur = blur
    self.saturate = saturate
    self.surface = surface
  }
}

/// The focus mark, in points. Its colour is `colors.borderFocusSolid`. A
/// negative offset lies inside the part's edge, the derived default at minus
/// the width; 0 or more lies outside it.
public struct PMFocus: Sendable, Hashable {
  public let width: CGFloat
  public let offset: CGFloat

  public init(width: CGFloat, offset: CGFloat) {
    self.width = width
    self.offset = offset
  }
}

/// Icon sizes in points and stroke widths, one per control size. It is `PMIconScale`, not
/// `PMIcon`, because `PMIcon` is the vocabulary member `Icon` in `PolymorphUI`, and an app
/// imports both packages.
public struct PMIconScale: Sendable, Hashable {
  public let size: PMSizeSteps
  public let stroke: PMSizeSteps

  public init(size: PMSizeSteps, stroke: PMSizeSteps) {
    self.size = size
    self.stroke = stroke
  }
}

/// A small/medium/large triple.
public struct PMSizeSteps: Sendable, Hashable {
  public let sm: CGFloat
  public let md: CGFloat
  public let lg: CGFloat

  public init(sm: CGFloat, md: CGFloat, lg: CGFloat) {
    self.sm = sm
    self.md = md
    self.lg = lg
  }
}

/// The stacking ladder, for `zIndex`.
public struct PMZ: Sendable, Hashable {
  public let raise: Double
  public let shell: Double
  public let overlay: Double
  public let toast: Double

  public init(raise: Double, shell: Double, overlay: Double, toast: Double) {
    self.raise = raise
    self.shell = shell
    self.overlay = overlay
    self.toast = toast
  }
}

/// The shell's region surfaces, resolved from the roles they reference.
public struct PMShell: Sendable, Hashable {
  public let topbarBg: PMDynamicColor
  public let railBg: PMDynamicColor
  public let topbarBorder: PMDynamicColor
  public let railBorder: PMDynamicColor

  public init(
    topbarBg: PMDynamicColor,
    railBg: PMDynamicColor,
    topbarBorder: PMDynamicColor,
    railBorder: PMDynamicColor
  ) {
    self.topbarBg = topbarBg
    self.railBg = railBg
    self.topbarBorder = topbarBorder
    self.railBorder = railBorder
  }
}

/// The gradient roles.
public struct PMGradients: Sendable, Hashable {
  public let accentGradient: PMGradient
  public let bgWash: PMGradient

  public init(accentGradient: PMGradient, bgWash: PMGradient) {
    self.accentGradient = accentGradient
    self.bgWash = bgWash
  }
}

/// The colour roles, light and dark. A role path is camelCased: `accent.bgHover` is `accentBgHover`.
public struct PMColors: Sendable, Hashable {
  public let bgApp: PMDynamicColor
  public let bgSubtle: PMDynamicColor
  public let bgSurface: PMDynamicColor
  public let bgRaised: PMDynamicColor
  public let bgOverlay: PMDynamicColor
  public let bgScrim: PMDynamicColor
  public let bgInverse: PMDynamicColor
  public let accentBg: PMDynamicColor
  public let accentBgHover: PMDynamicColor
  public let accentBgActive: PMDynamicColor
  public let accentSubtle: PMDynamicColor
  public let accentSubtleHover: PMDynamicColor
  public let accentSubtleActive: PMDynamicColor
  public let accentText: PMDynamicColor
  public let accentUnderline: PMDynamicColor
  public let accentContrast: PMDynamicColor
  public let accentGlow: PMDynamicColor
  public let textPrimary: PMDynamicColor
  public let textSecondary: PMDynamicColor
  public let textMuted: PMDynamicColor
  public let textDisabled: PMDynamicColor
  public let textInverse: PMDynamicColor
  public let borderSubtle: PMDynamicColor
  public let borderDefault: PMDynamicColor
  public let borderStrong: PMDynamicColor
  public let borderField: PMDynamicColor
  public let borderFocus: PMDynamicColor
  public let borderFocusSolid: PMDynamicColor
  public let dangerSolid: PMDynamicColor
  public let dangerSolidHover: PMDynamicColor
  public let dangerSolidActive: PMDynamicColor
  public let dangerSubtle: PMDynamicColor
  public let dangerSubtleHover: PMDynamicColor
  public let dangerSubtleActive: PMDynamicColor
  public let dangerText: PMDynamicColor
  public let dangerBorder: PMDynamicColor
  public let dangerContrast: PMDynamicColor
  public let dangerGlow: PMDynamicColor
  public let warningSolid: PMDynamicColor
  public let warningSolidHover: PMDynamicColor
  public let warningSolidActive: PMDynamicColor
  public let warningSubtle: PMDynamicColor
  public let warningSubtleHover: PMDynamicColor
  public let warningSubtleActive: PMDynamicColor
  public let warningText: PMDynamicColor
  public let warningBorder: PMDynamicColor
  public let warningContrast: PMDynamicColor
  public let warningGlow: PMDynamicColor
  public let successSolid: PMDynamicColor
  public let successSolidHover: PMDynamicColor
  public let successSolidActive: PMDynamicColor
  public let successSubtle: PMDynamicColor
  public let successSubtleHover: PMDynamicColor
  public let successSubtleActive: PMDynamicColor
  public let successText: PMDynamicColor
  public let successBorder: PMDynamicColor
  public let successContrast: PMDynamicColor
  public let successGlow: PMDynamicColor
  public let infoSolid: PMDynamicColor
  public let infoSolidHover: PMDynamicColor
  public let infoSolidActive: PMDynamicColor
  public let infoSubtle: PMDynamicColor
  public let infoSubtleHover: PMDynamicColor
  public let infoSubtleActive: PMDynamicColor
  public let infoText: PMDynamicColor
  public let infoBorder: PMDynamicColor
  public let infoContrast: PMDynamicColor
  public let infoGlow: PMDynamicColor
  public let selectionBg: PMDynamicColor
  public let selectionBgHover: PMDynamicColor
  public let selectionText: PMDynamicColor
  public let selectionBorder: PMDynamicColor
  public let selectionSurface: PMDynamicColor
  public let selectionSurfaceHover: PMDynamicColor

  public init(
    bgApp: PMDynamicColor,
    bgSubtle: PMDynamicColor,
    bgSurface: PMDynamicColor,
    bgRaised: PMDynamicColor,
    bgOverlay: PMDynamicColor,
    bgScrim: PMDynamicColor,
    bgInverse: PMDynamicColor,
    accentBg: PMDynamicColor,
    accentBgHover: PMDynamicColor,
    accentBgActive: PMDynamicColor,
    accentSubtle: PMDynamicColor,
    accentSubtleHover: PMDynamicColor,
    accentSubtleActive: PMDynamicColor,
    accentText: PMDynamicColor,
    accentUnderline: PMDynamicColor,
    accentContrast: PMDynamicColor,
    accentGlow: PMDynamicColor,
    textPrimary: PMDynamicColor,
    textSecondary: PMDynamicColor,
    textMuted: PMDynamicColor,
    textDisabled: PMDynamicColor,
    textInverse: PMDynamicColor,
    borderSubtle: PMDynamicColor,
    borderDefault: PMDynamicColor,
    borderStrong: PMDynamicColor,
    borderField: PMDynamicColor,
    borderFocus: PMDynamicColor,
    borderFocusSolid: PMDynamicColor,
    dangerSolid: PMDynamicColor,
    dangerSolidHover: PMDynamicColor,
    dangerSolidActive: PMDynamicColor,
    dangerSubtle: PMDynamicColor,
    dangerSubtleHover: PMDynamicColor,
    dangerSubtleActive: PMDynamicColor,
    dangerText: PMDynamicColor,
    dangerBorder: PMDynamicColor,
    dangerContrast: PMDynamicColor,
    dangerGlow: PMDynamicColor,
    warningSolid: PMDynamicColor,
    warningSolidHover: PMDynamicColor,
    warningSolidActive: PMDynamicColor,
    warningSubtle: PMDynamicColor,
    warningSubtleHover: PMDynamicColor,
    warningSubtleActive: PMDynamicColor,
    warningText: PMDynamicColor,
    warningBorder: PMDynamicColor,
    warningContrast: PMDynamicColor,
    warningGlow: PMDynamicColor,
    successSolid: PMDynamicColor,
    successSolidHover: PMDynamicColor,
    successSolidActive: PMDynamicColor,
    successSubtle: PMDynamicColor,
    successSubtleHover: PMDynamicColor,
    successSubtleActive: PMDynamicColor,
    successText: PMDynamicColor,
    successBorder: PMDynamicColor,
    successContrast: PMDynamicColor,
    successGlow: PMDynamicColor,
    infoSolid: PMDynamicColor,
    infoSolidHover: PMDynamicColor,
    infoSolidActive: PMDynamicColor,
    infoSubtle: PMDynamicColor,
    infoSubtleHover: PMDynamicColor,
    infoSubtleActive: PMDynamicColor,
    infoText: PMDynamicColor,
    infoBorder: PMDynamicColor,
    infoContrast: PMDynamicColor,
    infoGlow: PMDynamicColor,
    selectionBg: PMDynamicColor,
    selectionBgHover: PMDynamicColor,
    selectionText: PMDynamicColor,
    selectionBorder: PMDynamicColor,
    selectionSurface: PMDynamicColor,
    selectionSurfaceHover: PMDynamicColor
  ) {
    self.bgApp = bgApp
    self.bgSubtle = bgSubtle
    self.bgSurface = bgSurface
    self.bgRaised = bgRaised
    self.bgOverlay = bgOverlay
    self.bgScrim = bgScrim
    self.bgInverse = bgInverse
    self.accentBg = accentBg
    self.accentBgHover = accentBgHover
    self.accentBgActive = accentBgActive
    self.accentSubtle = accentSubtle
    self.accentSubtleHover = accentSubtleHover
    self.accentSubtleActive = accentSubtleActive
    self.accentText = accentText
    self.accentUnderline = accentUnderline
    self.accentContrast = accentContrast
    self.accentGlow = accentGlow
    self.textPrimary = textPrimary
    self.textSecondary = textSecondary
    self.textMuted = textMuted
    self.textDisabled = textDisabled
    self.textInverse = textInverse
    self.borderSubtle = borderSubtle
    self.borderDefault = borderDefault
    self.borderStrong = borderStrong
    self.borderField = borderField
    self.borderFocus = borderFocus
    self.borderFocusSolid = borderFocusSolid
    self.dangerSolid = dangerSolid
    self.dangerSolidHover = dangerSolidHover
    self.dangerSolidActive = dangerSolidActive
    self.dangerSubtle = dangerSubtle
    self.dangerSubtleHover = dangerSubtleHover
    self.dangerSubtleActive = dangerSubtleActive
    self.dangerText = dangerText
    self.dangerBorder = dangerBorder
    self.dangerContrast = dangerContrast
    self.dangerGlow = dangerGlow
    self.warningSolid = warningSolid
    self.warningSolidHover = warningSolidHover
    self.warningSolidActive = warningSolidActive
    self.warningSubtle = warningSubtle
    self.warningSubtleHover = warningSubtleHover
    self.warningSubtleActive = warningSubtleActive
    self.warningText = warningText
    self.warningBorder = warningBorder
    self.warningContrast = warningContrast
    self.warningGlow = warningGlow
    self.successSolid = successSolid
    self.successSolidHover = successSolidHover
    self.successSolidActive = successSolidActive
    self.successSubtle = successSubtle
    self.successSubtleHover = successSubtleHover
    self.successSubtleActive = successSubtleActive
    self.successText = successText
    self.successBorder = successBorder
    self.successContrast = successContrast
    self.successGlow = successGlow
    self.infoSolid = infoSolid
    self.infoSolidHover = infoSolidHover
    self.infoSolidActive = infoSolidActive
    self.infoSubtle = infoSubtle
    self.infoSubtleHover = infoSubtleHover
    self.infoSubtleActive = infoSubtleActive
    self.infoText = infoText
    self.infoBorder = infoBorder
    self.infoContrast = infoContrast
    self.infoGlow = infoGlow
    self.selectionBg = selectionBg
    self.selectionBgHover = selectionBgHover
    self.selectionText = selectionText
    self.selectionBorder = selectionBorder
    self.selectionSurface = selectionSurface
    self.selectionSurfaceHover = selectionSurfaceHover
  }
}

/// The chart roles. Relative to `chart`, camelCased; a slot number takes the family name, so `chart.1` is `chart1` and `chart.seq.1` is `seq1`.
public struct PMChart: Sendable, Hashable {
  public let chart1: PMDynamicColor
  public let chart2: PMDynamicColor
  public let chart3: PMDynamicColor
  public let chart4: PMDynamicColor
  public let chart5: PMDynamicColor
  public let chart6: PMDynamicColor
  public let chart7: PMDynamicColor
  public let chart8: PMDynamicColor
  public let other: PMDynamicColor
  public let seq1: PMDynamicColor
  public let seq2: PMDynamicColor
  public let seq3: PMDynamicColor
  public let seq4: PMDynamicColor
  public let seq5: PMDynamicColor
  public let seq6: PMDynamicColor
  public let seq7: PMDynamicColor
  public let neg1: PMDynamicColor
  public let neg2: PMDynamicColor
  public let neg3: PMDynamicColor
  public let mid: PMDynamicColor
  public let pos1: PMDynamicColor
  public let pos2: PMDynamicColor
  public let pos3: PMDynamicColor
  public let grid: PMDynamicColor
  public let axis: PMDynamicColor

  public init(
    chart1: PMDynamicColor,
    chart2: PMDynamicColor,
    chart3: PMDynamicColor,
    chart4: PMDynamicColor,
    chart5: PMDynamicColor,
    chart6: PMDynamicColor,
    chart7: PMDynamicColor,
    chart8: PMDynamicColor,
    other: PMDynamicColor,
    seq1: PMDynamicColor,
    seq2: PMDynamicColor,
    seq3: PMDynamicColor,
    seq4: PMDynamicColor,
    seq5: PMDynamicColor,
    seq6: PMDynamicColor,
    seq7: PMDynamicColor,
    neg1: PMDynamicColor,
    neg2: PMDynamicColor,
    neg3: PMDynamicColor,
    mid: PMDynamicColor,
    pos1: PMDynamicColor,
    pos2: PMDynamicColor,
    pos3: PMDynamicColor,
    grid: PMDynamicColor,
    axis: PMDynamicColor
  ) {
    self.chart1 = chart1
    self.chart2 = chart2
    self.chart3 = chart3
    self.chart4 = chart4
    self.chart5 = chart5
    self.chart6 = chart6
    self.chart7 = chart7
    self.chart8 = chart8
    self.other = other
    self.seq1 = seq1
    self.seq2 = seq2
    self.seq3 = seq3
    self.seq4 = seq4
    self.seq5 = seq5
    self.seq6 = seq6
    self.seq7 = seq7
    self.neg1 = neg1
    self.neg2 = neg2
    self.neg3 = neg3
    self.mid = mid
    self.pos1 = pos1
    self.pos2 = pos2
    self.pos3 = pos3
    self.grid = grid
    self.axis = axis
  }
}

/// A linear gradient.
public struct PMGradient: Sendable, Hashable {
  /// Two equal stops: the palette has no partner hue and pins no stop. The
  /// same in both modes.
  public let solid: Bool
  /// Degrees, CSS convention: 0 points up, 90 right.
  public let angle: Double
  public let stops: [PMGradientStop]

  public init(solid: Bool, angle: Double, stops: [PMGradientStop]) {
    self.solid = solid
    self.angle = angle
    self.stops = stops
  }
}

/// A gradient stop.
public struct PMGradientStop: Sendable, Hashable {
  public let color: PMDynamicColor
  /// 0…1 along the gradient line.
  public let at: CGFloat

  public init(color: PMDynamicColor, at: CGFloat) {
    self.color = color
    self.at = at
  }
}

/// The three densities.
public struct PMDensities: Sendable, Hashable {
  public let compact: PMDensity
  public let standard: PMDensity
  public let comfortable: PMDensity

  public init(compact: PMDensity, standard: PMDensity, comfortable: PMDensity) {
    self.compact = compact
    self.standard = standard
    self.comfortable = comfortable
  }
}

/// What one density sets, in points.
public struct PMDensity: Sendable, Hashable {
  public let space: PMSpace
  /// The density's control heights, as on the web: at least 24, never raised
  /// to the hit target, so densities stay apart on a phone.
  public let controlHeight: PMSizeSteps
  /// The smallest pressable size: 44 on iOS. A member shorter than it extends
  /// its hit area to it (`.contentShape` over a frame of at least this size)
  /// and keeps its drawn height.
  public let hitTarget: CGFloat
  /// Container padding, resolved from the space step each class names.
  public let inset: PMInsets

  public init(space: PMSpace, controlHeight: PMSizeSteps, hitTarget: CGFloat, inset: PMInsets) {
    self.space = space
    self.controlHeight = controlHeight
    self.hitTarget = hitTarget
    self.inset = inset
  }
}

/// The space ladder. Steps are numbers, so the members are `s0`…`s10`; `space[4]` reads the same value.
public struct PMSpace: Sendable, Hashable {
  public let s0: CGFloat
  public let s1: CGFloat
  public let s2: CGFloat
  public let s3: CGFloat
  public let s4: CGFloat
  public let s5: CGFloat
  public let s6: CGFloat
  public let s7: CGFloat
  public let s8: CGFloat
  public let s9: CGFloat
  public let s10: CGFloat

  public init(
    s0: CGFloat,
    s1: CGFloat,
    s2: CGFloat,
    s3: CGFloat,
    s4: CGFloat,
    s5: CGFloat,
    s6: CGFloat,
    s7: CGFloat,
    s8: CGFloat,
    s9: CGFloat,
    s10: CGFloat
  ) {
    self.s0 = s0
    self.s1 = s1
    self.s2 = s2
    self.s3 = s3
    self.s4 = s4
    self.s5 = s5
    self.s6 = s6
    self.s7 = s7
    self.s8 = s8
    self.s9 = s9
    self.s10 = s10
  }
}

/// Container insets.
public struct PMInsets: Sendable, Hashable {
  public let surface: CGFloat
  public let pane: CGFloat
  public let list: CGFloat

  public init(surface: CGFloat, pane: CGFloat, list: CGFloat) {
    self.surface = surface
    self.pane = pane
    self.list = list
  }
}

/// A length that varies by density.
public struct PMDensityLengths: Sendable, Hashable {
  public let compact: CGFloat
  public let standard: CGFloat
  public let comfortable: CGFloat

  public init(compact: CGFloat, standard: CGFloat, comfortable: CGFloat) {
    self.compact = compact
    self.standard = standard
    self.comfortable = comfortable
  }
}

/// The four motion temperaments. `none` zeroes every duration.
public struct PMMotions: Sendable, Hashable {
  public let none: PMMotion
  public let subtle: PMMotion
  public let standard: PMMotion
  public let expressive: PMMotion

  public init(none: PMMotion, subtle: PMMotion, standard: PMMotion, expressive: PMMotion) {
    self.none = none
    self.subtle = subtle
    self.standard = standard
    self.expressive = expressive
  }
}

/// One temperament.
public struct PMMotion: Sendable, Hashable {
  public let duration: PMDurations
  public let easing: PMEasings
  public let spring: PMSprings
  /// The scale a pressed control settles at.
  public let pressScale: Double
  public let ambient: PMAmbient
  public let stagger: PMStagger

  public init(
    duration: PMDurations,
    easing: PMEasings,
    spring: PMSprings,
    pressScale: Double,
    ambient: PMAmbient,
    stagger: PMStagger
  ) {
    self.duration = duration
    self.easing = easing
    self.spring = spring
    self.pressScale = pressScale
    self.ambient = ambient
    self.stagger = stagger
  }
}

/// Durations in seconds.
public struct PMDurations: Sendable, Hashable {
  public let control: TimeInterval
  public let controlExit: TimeInterval
  public let surface: TimeInterval
  public let surfaceExit: TimeInterval
  public let overlay: TimeInterval
  public let overlayExit: TimeInterval

  public init(
    control: TimeInterval,
    controlExit: TimeInterval,
    surface: TimeInterval,
    surfaceExit: TimeInterval,
    overlay: TimeInterval,
    overlayExit: TimeInterval
  ) {
    self.control = control
    self.controlExit = controlExit
    self.surface = surface
    self.surfaceExit = surfaceExit
    self.overlay = overlay
    self.overlayExit = overlayExit
  }
}

/// Easing curves.
public struct PMEasings: Sendable, Hashable {
  public let enter: PMEasing
  public let exit: PMEasing
  public let standard: PMEasing
  public let overshoot: PMEasing

  public init(enter: PMEasing, exit: PMEasing, standard: PMEasing, overshoot: PMEasing) {
    self.enter = enter
    self.exit = exit
    self.standard = standard
    self.overshoot = overshoot
  }
}

/// A cubic Bézier easing, by its two control points.
public struct PMEasing: Sendable, Hashable {
  public let x1: Double
  public let y1: Double
  public let x2: Double
  public let y2: Double

  public init(x1: Double, y1: Double, x2: Double, y2: Double) {
    self.x1 = x1
    self.y1 = y1
    self.x2 = x2
    self.y2 = y2
  }
}

/// Springs. The engine's `default` spring is `base` here: `default` is a Swift keyword.
public struct PMSprings: Sendable, Hashable {
  public let base: PMSpring
  public let snappy: PMSpring
  public let gentle: PMSpring

  public init(base: PMSpring, snappy: PMSpring, gentle: PMSpring) {
    self.base = base
    self.snappy = snappy
    self.gentle = gentle
  }
}

/// A spring by its physical parameters.
public struct PMSpring: Sendable, Hashable {
  public let stiffness: Double
  public let damping: Double
  public let mass: Double
  /// `damping / (2 × √(stiffness × mass))`: below 1 overshoots.
  public let dampingRatio: Double

  public init(stiffness: Double, damping: Double, mass: Double, dampingRatio: Double) {
    self.stiffness = stiffness
    self.damping = damping
    self.mass = mass
    self.dampingRatio = dampingRatio
  }
}

/// Periods of the ambient loops, in seconds.
public struct PMAmbient: Sendable, Hashable {
  public let shimmer: TimeInterval
  public let spin: TimeInterval

  public init(shimmer: TimeInterval, spin: TimeInterval) {
    self.shimmer = shimmer
    self.spin = spin
  }
}

/// List stagger, in seconds.
public struct PMStagger: Sendable, Hashable {
  public let step: TimeInterval
  public let max: TimeInterval

  public init(step: TimeInterval, max: TimeInterval) {
    self.step = step
    self.max = max
  }
}

/// A member exception: the class token it re-points, and the value it re-points it to.
public struct PMException: Sendable, Hashable {
  /// The member's slug.
  public let member: String
  /// The class token, such as `radius.control`.
  public let token: String
  /// The token it names instead, such as `radius.sm`.
  public let ref: String
  public let value: PMExceptionValue

  public init(member: String, token: String, ref: String, value: PMExceptionValue) {
    self.member = member
    self.token = token
    self.ref = ref
    self.value = value
  }
}

// MARK: - Reading the values

extension PMTheme: Identifiable {
  public var id: String { name }

  /// The density the system's axes select.
  public var defaultDensity: PMDensity { density[axes.density] }

  /// The motion temperament the system's axes select.
  public var defaultMotion: PMMotion { motion[axes.motionTemperament] }

  /// For `.preferredColorScheme(_:)`.
  public var preferredColorScheme: ColorScheme? { defaultMode.colorScheme }
}

extension PMDensities {
  public subscript(_ name: PMDensityName) -> PMDensity {
    switch name {
    case .compact: compact
    case .standard: standard
    case .comfortable: comfortable
    }
  }
}

extension PMMotions {
  public subscript(_ name: PMMotionTemperament) -> PMMotion {
    switch name {
    case .none: self.none
    case .subtle: subtle
    case .standard: standard
    case .expressive: expressive
    }
  }
}

extension PMSpace {
  /// The ladder by step number, 0…10.
  public subscript(_ step: Int) -> CGFloat {
    switch step {
    case 0: s0
    case 1: s1
    case 2: s2
    case 3: s3
    case 4: s4
    case 5: s5
    case 6: s6
    case 7: s7
    case 8: s8
    case 9: s9
    case 10: s10
    default: preconditionFailure("PMSpace has steps 0…10, not \(step)")
    }
  }
}

extension PMTextStyle {
  /// The nearest of SwiftUI's nine weights, chosen as CSS font matching
  /// chooses among them: below 400 the next lighter, from 400 the next heavier.
  public var weight: Font.Weight {
    let hundred = wght < 400 ? wght / 100 * 100 : (wght + 99) / 100 * 100
    switch hundred {
    case ...100: return .ultraLight
    case 200: return .thin
    case 300: return .light
    case 400: return .regular
    case 500: return .medium
    case 600: return .semibold
    case 700: return .bold
    case 800: return .heavy
    default: return .black
    }
  }

  /// The family at `size` when it is installed, otherwise the system font in
  /// the slot's fallback design; weighted, and italic when the step is.
  public var font: Font {
    let base: Font =
      PMFontLookup.isInstalled(family)
      ? .custom(family, size: size)
      : .system(size: size, design: fallback.design)
    let weighted = base.weight(weight)
    return italic ? weighted.italic() : weighted
  }

  /// The line box CSS draws: `size × lineHeight`.
  public var lineBox: CGFloat { size * lineHeight }

  /// `lineSpacing` that brings the drawn font's own line height up to
  /// `lineBox`: the family's when it is installed, the system font's in the
  /// fallback design otherwise, as `font` draws.
  public var lineSpacing: CGFloat {
    max(0, lineBox - PMFontLookup.naturalLineHeight(family, size: size, fallback: fallback))
  }
}

/// `pmTextStyle`: the step at the size Dynamic Type scales its text style to,
/// with the line box CSS draws.
private struct PMScaledTextStyle: ViewModifier {
  let style: PMTextStyle
  @ScaledMetric private var scaledSize: CGFloat

  init(style: PMTextStyle) {
    self.style = style
    _scaledSize = ScaledMetric(wrappedValue: style.size, relativeTo: style.relativeTextStyle)
  }

  func body(content: Content) -> some View {
    let factor = style.size > 0 ? scaledSize / style.size : 1
    let leading = style.lineSpacing * factor
    content
      .font(style.font(fixedSize: scaledSize))
      .tracking(style.tracking * factor)
      .lineSpacing(leading)
      // CSS puts half a line box's extra height above the glyphs and half
      // below, on every line. `lineSpacing` adds it between lines only, so the
      // first line's half above and the last line's half below are padding,
      // and a run of text is as tall as its lines' boxes, as on the web.
      .padding(.vertical, leading / 2)
  }
}

extension PMTextStyle {
  /// The system text style whose scaling Dynamic Type applies to this step: a
  /// display step (one that requests an optical size) scales as the largest
  /// title does, which grows less at the larger sizes than body text, and a
  /// text step as body text.
  public var relativeTextStyle: Font.TextStyle {
    opsz == nil ? .body : .largeTitle
  }

  /// The family at `size` points, or the fallback design, weighted and italic
  /// as `font`; a size Dynamic Type has already scaled, so it is not scaled again.
  fileprivate func font(fixedSize size: CGFloat) -> Font {
    let base: Font =
      PMFontLookup.isInstalled(family)
      ? .custom(family, fixedSize: size)
      : .system(size: size, design: fallback.design)
    let weighted = base.weight(weight)
    return italic ? weighted.italic() : weighted
  }
}

enum PMFontLookup {
  static func isInstalled(_ family: String) -> Bool {
    let font = CTFontCreateWithName(family as CFString, 12, nil)
    return (CTFontCopyFamilyName(font) as String) == family
  }

  /// One line's height in the font a step draws: the family when it is
  /// installed, otherwise the system font in the fallback design. CoreText
  /// answers an unknown family with Helvetica, whose lines are shorter than
  /// the system font's, so the family alone would overstate the spacing.
  static func naturalLineHeight(_ family: String, size: CGFloat, fallback: PMFontFallback) -> CGFloat {
    let font = isInstalled(family) ? CTFontCreateWithName(family as CFString, size, nil) : system(size, fallback)
    return CTFontGetAscent(font) + CTFontGetDescent(font) + CTFontGetLeading(font)
  }

  /// The system font at `size` in the fallback's design.
  private static func system(_ size: CGFloat, _ fallback: PMFontFallback) -> CTFont {
    #if canImport(UIKit)
      let base = UIFont.systemFont(ofSize: size).fontDescriptor
      let design: UIFontDescriptor.SystemDesign =
        switch fallback {
        case .sans: .default
        case .serif: .serif
        case .mono: .monospaced
        }
      return UIFont(descriptor: base.withDesign(design) ?? base, size: size) as CTFont
    #else
      let base = NSFont.systemFont(ofSize: size).fontDescriptor
      let design: NSFontDescriptor.SystemDesign =
        switch fallback {
        case .sans: .default
        case .serif: .serif
        case .mono: .monospaced
        }
      return (NSFont(descriptor: base.withDesign(design) ?? base, size: size)
        ?? NSFont.systemFont(ofSize: size)) as CTFont
    #endif
  }
}

extension PMShadow {
  public var isNone: Bool { layers.isEmpty }
}

extension PMGradient {
  public var gradient: Gradient {
    Gradient(stops: stops.map { Gradient.Stop(color: $0.color.color, location: $0.at) })
  }

  /// Where the CSS gradient line starts, in unit space. Exact for a square;
  /// CSS measures the angle in the box's own aspect.
  public var startPoint: UnitPoint {
    let (dx, dy, half) = direction
    return UnitPoint(x: 0.5 - dx * half, y: 0.5 - dy * half)
  }

  public var endPoint: UnitPoint {
    let (dx, dy, half) = direction
    return UnitPoint(x: 0.5 + dx * half, y: 0.5 + dy * half)
  }

  public var linear: LinearGradient {
    LinearGradient(gradient: gradient, startPoint: startPoint, endPoint: endPoint)
  }

  /// The unit direction (y down), and the half-length that reaches the corners.
  private var direction: (Double, Double, Double) {
    let radians = angle * .pi / 180
    let (dx, dy) = (sin(radians), -cos(radians))
    return (dx, dy, (abs(dx) + abs(dy)) / 2)
  }
}

extension PMEasing {
  public var curve: UnitCurve {
    .bezier(startControlPoint: UnitPoint(x: x1, y: y1), endControlPoint: UnitPoint(x: x2, y: y2))
  }

  public func animation(duration: TimeInterval) -> Animation {
    .timingCurve(x1, y1, x2, y2, duration: duration)
  }
}

extension PMSpring {
  /// Over-damping is allowed, so a damping ratio of 1 or more does not
  /// overshoot, as on the web.
  public var spring: Spring {
    Spring(mass: mass, stiffness: stiffness, damping: damping, allowOverDamping: true)
  }

  public var animation: Animation { .spring(spring) }
}

extension View {
  /// A type step: font, tracking and line spacing, scaled with Dynamic Type,
  /// in the line box CSS draws. The step's size is its size at the default
  /// text size; a larger or smaller text size scales the font, the tracking
  /// and the line spacing by the factor its text style scales by
  /// (`relativeTextStyle`: body text for a text step, the largest title for a
  /// display step), as `Font.custom(_:size:relativeTo:)` scales an installed
  /// family. `Font.system(size:)` alone does not scale, so the fallback design
  /// would otherwise stay at its default size. The line's extra height is
  /// split above and below each line, as the web's half-leading is, so a run
  /// of text is `lineBox` tall per line.
  public func pmTextStyle(_ style: PMTextStyle) -> some View {
    modifier(PMScaledTextStyle(style: style))
  }

  /// A shadow's outer layers, drawn with SwiftUI's `shadow`, whose radius is
  /// half the CSS blur. `shadow` has no spread and no inset, so this helper
  /// leaves spread at 0 and skips inset layers; their values are in the layer.
  public func pmShadow(_ shadow: PMShadow) -> some View {
    shadow.layers.filter { !$0.inset }.reduce(AnyView(self)) { view, layer in
      AnyView(
        view.shadow(color: layer.color.color, radius: layer.blur / 2, x: layer.x, y: layer.y))
    }
  }
}
