// A pairing read at run time from a token document, written by hand.
//
// The statics in `Generated/` are the catalogue, compiled in. A pairing the
// catalogue does not hold (a tenant's system and palette, admitted by the
// engine on a server with `admitTheme`) reaches a device as the token
// document the engine emits for iOS (`emitTokenDocumentJSON(resolved,
// { platform: 'ios' })`, `packages/theme/src/emit-tokens.ts`). This file reads
// that document into the same `PMTheme` the Swift emitter would have written
// for the pairing, so a view cannot tell the two apart.
//
// It reads the document as `packages/theme/src/emit-swift.ts` does, field for
// field:
// - Lengths are points, type sizes the step's `px`, tracking its em × that
//   size, durations milliseconds ÷ 1000.
// - Every number is rounded as the emitter writes it: at most four decimals,
//   as JavaScript's `toFixed(4)` rounds. A document therefore decodes to the
//   value the generated static holds, equal under `==`.
// - Colours are dynamic: each role's light and dark channels. A glow and a
//   gradient keep the light mode's geometry and take a colour per mode, and a
//   document whose geometry differs between the modes is refused, as the
//   emitter refuses it. An alpha is read exactly: one with more than four
//   decimals is refused, as the emitter refuses to round it.
// - Control heights are the density's, as on the web. The platform's minimum
//   is a hit area, so only the hit target is held to a floor, and a member
//   extends its hit area to it.
// - Not read: `inverse` (on the web, inverse tone swaps the colour and chart
//   roles alone; a renderer that draws it resolves those roles in the opposite
//   scheme, and `inverse` lists them), `floor.controlHeight` and
//   `floor.raised` (the document's audit trail), each mode's `texture` (listed
//   in `unsupported`) and a gradient's `from`/`to` (its stops carry them).
//
// It refuses a document that is not `polymorph-tokens/1`; one resolved for a
// platform other than iOS, whose floors and unsupported list would be another
// platform's; one that does not list `texture.page` as unsupported, which
// `PMTheme` has no field for; one that declares a hit-target floor under
// Apple's 44 points; and one whose hit target is under the floor it declares.

import Foundation

/// Why a token document is not a `PMTheme`.
public enum PMTokenDocumentError: Error, Hashable, Sendable {
  /// The data is not a JSON object.
  case notJSON(String)
  /// The document's `format` is not `polymorph-tokens/1`; `nil` when it names
  /// none. A `format` that is not a string is `invalid`.
  case format(String?)
  /// The document was resolved for another platform.
  case platform(String)
  /// A value is missing or of the wrong kind. `path` is where, such as
  /// `mode.light.color["accent.bg"].r`.
  case invalid(path: String, reason: String)
  /// A glow or a gradient whose geometry differs between light and dark mode.
  case geometryDiffersByMode(String)
  /// A hit target below the floor: `floor.hitTarget` under Apple's 44 points,
  /// or a density's `hitTarget` under the `floor.hitTarget` the document
  /// declares.
  case belowFloor(path: String, points: Double)
}

extension PMTokenDocumentError: CustomStringConvertible, LocalizedError {
  public var description: String {
    switch self {
    case .notJSON(let detail):
      return "The data is not a token document: it is not a JSON object (\(detail))."
    case .format(nil):
      return "The document names no format. PMTheme(tokenDocument:) reads "
        + "\(PMTheme.tokenDocumentFormat) only."
    case .format(let format?):
      return "The document's format is \"\(format)\". PMTheme(tokenDocument:) reads "
        + "\(PMTheme.tokenDocumentFormat) only."
    case .platform(let platform):
      return "The document is resolved for \"\(platform)\", not \"ios\": its floors and "
        + "unsupported list are that platform's. Emit it with { platform: 'ios' }."
    case .invalid(let path, let reason):
      return "\(path): \(reason)."
    case .geometryDiffersByMode(let path):
      return "\(path) has a different geometry in light and dark mode. A PMTheme holds one "
        + "geometry with a colour per mode, as the Swift emitter writes it."
    case .belowFloor(let path, let points):
      let measured = points.formatted(.number.locale(Locale(identifier: "en_US_POSIX")))
      if path == "floor.hitTarget" {
        return "floor.hitTarget is \(measured) points, below the "
          + "\(Int(PMTheme.tokenDocumentFloor))-point iOS hit target. A document emitted for "
          + "ios declares it, so this one was not."
      }
      return "\(path) is \(measured) points, below the hit-target floor the document declares "
        + "in floor.hitTarget. A document emitted for ios raises it, so this one was not."
    }
  }

  public var errorDescription: String? { description }
}

extension PMTheme {
  /// The token document format this package reads.
  public static let tokenDocumentFormat = "polymorph-tokens/1"

  /// The platform a document must be resolved for.
  public static let tokenDocumentPlatform = "ios"

  /// The smallest hit-target floor, in points, a document may declare in
  /// `floor.hitTarget`: Apple's 44-point minimum hit area, the engine's
  /// `PLATFORM_FLOORS.ios.hitTarget` (a law in `packages/theme/src/native.test.ts`
  /// holds the two equal). Control heights have no iOS floor of their own:
  /// they are the density's, and a member extends its hit area to `hitTarget`.
  public static let tokenDocumentFloor: CGFloat = 44

  /// The pairing a `polymorph-tokens/1` document for iOS describes: the value
  /// the generated static for the same pairing holds.
  ///
  /// ```swift
  /// let theme = try PMTheme(tokenDocument: data)  // from the server that admitted it
  /// ```
  ///
  /// - Throws: `PMTokenDocumentError`, naming the format, the platform or the
  ///   path of the value that cannot be read.
  public init(tokenDocument: Data) throws {
    let root = try TokenNode.parse(tokenDocument)
    let format: String? = try root.has("format") ? root["format"].string() : nil
    guard format == PMTheme.tokenDocumentFormat else { throw PMTokenDocumentError.format(format) }
    let platform = try root["platform"].string()
    guard platform == PMTheme.tokenDocumentPlatform else {
      throw PMTokenDocumentError.platform(platform)
    }
    let unsupported = try root["unsupported"]
    let listed = try unsupported.items().map { try $0.string() }
    for path in omitted where !listed.contains(path) {
      throw unsupported.invalid("does not list \"\(path)\", which PMTheme has no field for")
    }
    self = try TokenDocumentReader(root: root).theme()
  }
}

/// The paths `PMTheme` has no field for, which a document must list as
/// unsupported, as `emit-swift.ts` requires.
private let omitted = ["texture.page"]

// MARK: - Numbers

/// The value the Swift emitter writes for `value` (`swiftNumber` in
/// `emit-swift.ts`): JavaScript's `Number(value.toFixed(4))`, with `-0` as `0`.
///
/// `toFixed` rounds the exact binary value, and a tie goes away from zero.
/// `%.4f` rounds the exact value too, but a tie to even, so ties are taken
/// apart first. `value × 10⁴` is exactly `n + ½` only when `value` is an odd
/// multiple of 1/32, and multiplying by 32 is exact.
func emittedNumber(_ value: Double) -> Double {
  let magnitude = value.magnitude
  let thirtySeconds = magnitude * 32
  let rounded: Double
  if thirtySeconds.rounded(.towardZero) == thirtySeconds,
    thirtySeconds.truncatingRemainder(dividingBy: 2) == 1
  {
    rounded = ((magnitude * 10_000).rounded(.down) + 1) / 10_000
  } else {
    rounded = Double(String(format: "%.4f", magnitude)) ?? magnitude
  }
  let signed = value < 0 ? -rounded : rounded
  return signed == 0 ? 0 : signed
}

// MARK: - Reading JSON

/// A JSON value, kept whole so a key with dots in it (`text.md.size`) is one key.
private enum TokenJSON: Decodable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([TokenJSON])
  case object([String: TokenJSON])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([TokenJSON].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: TokenJSON].self))
    }
  }

  var kind: String {
    switch self {
    case .null: "null"
    case .bool: "a boolean"
    case .number: "a number"
    case .string: "a string"
    case .array: "an array"
    case .object: "an object"
    }
  }
}

/// A value in the document and the path that reaches it, for the error that names it.
private struct TokenNode {
  let value: TokenJSON
  let path: [String]

  static func parse(_ data: Data) throws -> TokenNode {
    let value: TokenJSON
    do {
      value = try JSONDecoder().decode(TokenJSON.self, from: data)
    } catch {
      throw PMTokenDocumentError.notJSON(String(describing: error))
    }
    guard case .object = value else {
      throw PMTokenDocumentError.notJSON("the top level is \(value.kind)")
    }
    return TokenNode(value: value, path: [])
  }

  /// `mode.light.color["accent.bg"].r`: a key that is not a plain name is quoted.
  var location: String {
    let rendered = path.enumerated().map { index, segment -> String in
      if segment.hasPrefix("[") { return segment }
      let plain = segment.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
      return plain ? (index == 0 ? segment : ".\(segment)") : "[\"\(segment)\"]"
    }
    return path.isEmpty ? "the document" : rendered.joined()
  }

  func invalid(_ reason: String) -> PMTokenDocumentError {
    .invalid(path: location, reason: reason)
  }

  func has(_ key: String) -> Bool {
    guard case .object(let fields) = value else { return false }
    return fields[key] != nil
  }

  subscript(key: String) -> TokenNode {
    get throws {
      guard case .object(let fields) = value else {
        throw invalid("expected an object, found \(value.kind)")
      }
      guard let field = fields[key] else {
        throw TokenNode(value: .null, path: path + [key]).invalid("missing")
      }
      return TokenNode(value: field, path: path + [key])
    }
  }

  func items() throws -> [TokenNode] {
    guard case .array(let items) = value else {
      throw invalid("expected an array, found \(value.kind)")
    }
    return items.enumerated().map { TokenNode(value: $1, path: path + ["[\($0)]"]) }
  }

  func string() throws -> String {
    guard case .string(let string) = value else {
      throw invalid("expected a string, found \(value.kind)")
    }
    return string
  }

  func bool() throws -> Bool {
    guard case .bool(let bool) = value else {
      throw invalid("expected a boolean, found \(value.kind)")
    }
    return bool
  }

  /// The number as the document holds it.
  func exactNumber() throws -> Double {
    guard case .number(let number) = value else {
      throw invalid("expected a number, found \(value.kind)")
    }
    return number
  }

  /// The number as the Swift emitter writes it.
  func number() throws -> Double {
    emittedNumber(try exactNumber())
  }

  /// A number the emitter writes exactly, an alpha: one it would have to round
  /// is refused, as the emitter refuses it.
  func exactAtFourDecimals() throws -> Double {
    let number = try exactNumber()
    guard emittedNumber(number) == number else {
      throw invalid("expected at most four decimals, found \(number)")
    }
    return number
  }

  func int() throws -> Int {
    let number = try exactNumber()
    guard number.rounded() == number, let int = Int(exactly: number) else {
      throw invalid("expected a whole number, found \(number)")
    }
    return int
  }

  /// An sRGB channel, 0–255.
  func channel() throws -> UInt8 {
    let number = try exactNumber()
    guard let channel = UInt8(exactly: number) else {
      throw invalid("expected a channel from 0 to 255, found \(number)")
    }
    return channel
  }

  /// One of an enum's raw values.
  func oneOf<Value: RawRepresentable & CaseIterable>(_: Value.Type = Value.self) throws -> Value
  where Value.RawValue == String {
    let raw = try string()
    guard let value = Value(rawValue: raw) else {
      let known = Value.allCases.map { "\"\($0.rawValue)\"" }.joined(separator: ", ")
      throw invalid("expected one of \(known), found \"\(raw)\"")
    }
    return value
  }
}

// MARK: - Reading the document

/// The document's sections, read into a `PMTheme` exactly as `swiftThemeExpression` writes one.
private struct TokenDocumentReader {
  let root: TokenNode

  func theme() throws -> PMTheme {
    let pairing = try root["pairing"]
    let floor = try root["floor"]["hitTarget"]
    let hitTargetFloor = try floor.number()
    guard CGFloat(hitTargetFloor) >= PMTheme.tokenDocumentFloor else {
      throw PMTokenDocumentError.belowFloor(path: floor.location, points: hitTargetFloor)
    }
    let axes = try pairing["axes"]
    let invariant = try root["invariant"]
    let px = { (key: String) throws -> Double in try invariant[key]["value"].number() }
    let raw = { (key: String) throws -> Double in try invariant[key].number() }

    return try PMTheme(
      name: pairing["name"].string(),
      system: pairing["system"].string(),
      palette: pairing["palette"].string(),
      kind: pairing["kind"].oneOf(),
      axes: PMAxes(
        geometry: axes["geometry"].string(),
        depth: axes["depth"].string(),
        density: axes["density"].oneOf(),
        contrastTemperament: axes["contrastTemperament"].string(),
        typePersonality: axes["typePersonality"].string(),
        colorStrategy: axes["colorStrategy"].string(),
        motionTemperament: axes["motionTemperament"].oneOf(),
        ornament: axes["ornament"].string()
      ),
      defaultMode: pairing["defaultMode"].oneOf(),
      chartCap: pairing["chartCap"].int(),
      fonts: PMFonts(body: font("body"), display: font("display"), mono: font("mono")),
      numeric: numeric(invariant["font.numeric"]),
      text: PMTextStyles(
        xs: textStyle("text.xs"),
        sm: textStyle("text.sm"),
        md: textStyle("text.md"),
        lg: textStyle("text.lg"),
        xl: textStyle("text.xl"),
        text2xl: textStyle("text.2xl"),
        text3xl: textStyle("text.3xl")
      ),
      display: PMDisplayStyles(
        sm: textStyle("display.sm", display: true),
        md: textStyle("display.md", display: true),
        lg: textStyle("display.lg", display: true)
      ),
      radius: PMRadius(
        none: px("radius.none"),
        sm: px("radius.sm"),
        md: px("radius.md"),
        lg: px("radius.lg"),
        pill: px("radius.pill"),
        control: px("radius.control"),
        detail: px("radius.detail"),
        surface: px("radius.surface")
      ),
      shadows: PMShadows(
        control: shadow(invariant["shadow.control"]),
        raised: shadow(invariant["shadow.raised"]),
        overlay: shadow(invariant["shadow.overlay"]),
        seat: shadow(invariant["shadow.seat"]),
        resting: shadow(invariant["shadow.resting"]),
        transient: shadow(invariant["shadow.transient"])
      ),
      insetTop: shadow(invariant["shadow.insetTop"]),
      glow: PMGlow(focus: glow("glow.focus"), hover: glow("glow.hover")),
      material: PMMaterial(
        blur: px("material.blur"),
        saturate: raw("material.saturate"),
        surface: dynamic(mode("light")["materialSurface"], mode("dark")["materialSurface"])
      ),
      focus: PMFocus(width: px("focus.width"), offset: px("focus.offset")),
      icon: PMIconScale(
        size: PMSizeSteps(sm: px("icon.size.sm"), md: px("icon.size.md"), lg: px("icon.size.lg")),
        stroke: PMSizeSteps(
          sm: raw("icon.stroke.sm"), md: raw("icon.stroke.md"), lg: raw("icon.stroke.lg"))
      ),
      z: PMZ(
        raise: raw("z.raise"), shell: raw("z.shell"), overlay: raw("z.overlay"),
        toast: raw("z.toast")),
      colors: colors(),
      chart: chart(),
      gradients: PMGradients(
        accentGradient: gradient("accent.gradient"), bgWash: gradient("bg.wash")),
      shell: PMShell(
        topbarBg: modeColor("shell", "shell.topbar.bg"),
        railBg: modeColor("shell", "shell.rail.bg"),
        topbarBorder: modeColor("shell", "shell.topbar.border"),
        railBorder: modeColor("shell", "shell.rail.border")
      ),
      density: PMDensities(
        compact: density("compact", hitTargetFloor: hitTargetFloor),
        standard: density("standard", hitTargetFloor: hitTargetFloor),
        comfortable: density("comfortable", hitTargetFloor: hitTargetFloor)
      ),
      motion: PMMotions(
        none: motion("none"),
        subtle: motion("subtle"),
        standard: motion("standard"),
        expressive: motion("expressive")
      ),
      exceptions: root["exceptions"].items().map(exception),
      unsupported: root["unsupported"].items().map { try $0.string() }
    )
  }

  // MARK: Type

  func font(_ role: String) throws -> PMFont {
    let slot = try root["fonts"][role]
    return try PMFont(
      family: slot["family"].string(),
      variable: slot["variable"].bool(),
      fallback: slot["fallback"].oneOf(),
      italic: slot["style"].string() == "italic",
      weights: slot["weights"].items().map { try $0.int() },
      opsz: slot.has("opsz") ? slot["opsz"].items().map { try $0.number() } : []
    )
  }

  func numeric(_ node: TokenNode) throws -> PMNumeric {
    let features = try node["features"].items().map { try $0.string() }
    return PMNumeric(tabular: features.contains("tnum"), slashedZero: features.contains("zero"))
  }

  /// A type step. Tracking is the em value × the step's unrounded size, then rounded.
  func textStyle(_ prefix: String, display: Bool = false) throws -> PMTextStyle {
    let invariant = try root["invariant"]
    let size = try invariant["\(prefix).size"]["px"].exactNumber()
    let family = try invariant["\(prefix).family"]
    let ref = try family["ref"].string()
    guard ref.hasPrefix("font.") else {
      throw try family["ref"].invalid(
        "expected a font slot such as \"font.body\", found \"\(ref)\"")
    }
    let slot = try root["fonts"][String(ref.dropFirst("font.".count))]
    return try PMTextStyle(
      size: emittedNumber(size),
      lineHeight: invariant["\(prefix).lineHeight"].number(),
      wght: invariant["\(prefix).weight"].int(),
      tracking: emittedNumber(invariant["\(prefix).tracking"]["value"].exactNumber() * size),
      family: family["family"].string(),
      fallback: slot["fallback"].oneOf(),
      italic: display && invariant["\(prefix).style"].string() == "italic",
      opsz: display ? invariant["\(prefix).opsz"].number() : nil
    )
  }

  // MARK: Colour

  func mode(_ name: String) throws -> TokenNode {
    try root["mode"][name]
  }

  func rgba(_ node: TokenNode) throws -> PMRGBA {
    try PMRGBA(
      node["r"].channel(), node["g"].channel(), node["b"].channel(),
      node["alpha"].exactAtFourDecimals())
  }

  func dynamic(_ light: TokenNode, _ dark: TokenNode) throws -> PMDynamicColor {
    try PMDynamicColor(light: rgba(light), dark: rgba(dark))
  }

  /// A role in one of a mode's records (`color`, `chart`, `shell`), in both modes.
  func modeColor(_ record: String, _ role: String) throws -> PMDynamicColor {
    try dynamic(mode("light")[record][role], mode("dark")[record][role])
  }

  func colors() throws -> PMColors {
    let color = { (role: String) throws -> PMDynamicColor in try modeColor("color", role) }
    return try PMColors(
      bgApp: color("bg.app"),
      bgSubtle: color("bg.subtle"),
      bgSurface: color("bg.surface"),
      bgRaised: color("bg.raised"),
      bgOverlay: color("bg.overlay"),
      bgScrim: color("bg.scrim"),
      bgInverse: color("bg.inverse"),
      accentBg: color("accent.bg"),
      accentBgHover: color("accent.bgHover"),
      accentBgActive: color("accent.bgActive"),
      accentSubtle: color("accent.subtle"),
      accentSubtleHover: color("accent.subtleHover"),
      accentSubtleActive: color("accent.subtleActive"),
      accentText: color("accent.text"),
      accentUnderline: color("accent.underline"),
      accentContrast: color("accent.contrast"),
      accentGlow: color("accent.glow"),
      textPrimary: color("text.primary"),
      textSecondary: color("text.secondary"),
      textMuted: color("text.muted"),
      textDisabled: color("text.disabled"),
      textInverse: color("text.inverse"),
      borderSubtle: color("border.subtle"),
      borderDefault: color("border.default"),
      borderStrong: color("border.strong"),
      borderField: color("border.field"),
      borderFocus: color("border.focus"),
      borderFocusSolid: color("border.focusSolid"),
      dangerSolid: color("danger.solid"),
      dangerSolidHover: color("danger.solidHover"),
      dangerSolidActive: color("danger.solidActive"),
      dangerSubtle: color("danger.subtle"),
      dangerSubtleHover: color("danger.subtleHover"),
      dangerSubtleActive: color("danger.subtleActive"),
      dangerText: color("danger.text"),
      dangerBorder: color("danger.border"),
      dangerContrast: color("danger.contrast"),
      dangerGlow: color("danger.glow"),
      warningSolid: color("warning.solid"),
      warningSolidHover: color("warning.solidHover"),
      warningSolidActive: color("warning.solidActive"),
      warningSubtle: color("warning.subtle"),
      warningSubtleHover: color("warning.subtleHover"),
      warningSubtleActive: color("warning.subtleActive"),
      warningText: color("warning.text"),
      warningBorder: color("warning.border"),
      warningContrast: color("warning.contrast"),
      warningGlow: color("warning.glow"),
      successSolid: color("success.solid"),
      successSolidHover: color("success.solidHover"),
      successSolidActive: color("success.solidActive"),
      successSubtle: color("success.subtle"),
      successSubtleHover: color("success.subtleHover"),
      successSubtleActive: color("success.subtleActive"),
      successText: color("success.text"),
      successBorder: color("success.border"),
      successContrast: color("success.contrast"),
      successGlow: color("success.glow"),
      infoSolid: color("info.solid"),
      infoSolidHover: color("info.solidHover"),
      infoSolidActive: color("info.solidActive"),
      infoSubtle: color("info.subtle"),
      infoSubtleHover: color("info.subtleHover"),
      infoSubtleActive: color("info.subtleActive"),
      infoText: color("info.text"),
      infoBorder: color("info.border"),
      infoContrast: color("info.contrast"),
      infoGlow: color("info.glow"),
      selectionBg: color("selection.bg"),
      selectionBgHover: color("selection.bgHover"),
      selectionText: color("selection.text"),
      selectionBorder: color("selection.border"),
      selectionSurface: color("selection.surface"),
      selectionSurfaceHover: color("selection.surfaceHover")
    )
  }

  func chart() throws -> PMChart {
    let chart = { (role: String) throws -> PMDynamicColor in try modeColor("chart", role) }
    return try PMChart(
      chart1: chart("chart.1"),
      chart2: chart("chart.2"),
      chart3: chart("chart.3"),
      chart4: chart("chart.4"),
      chart5: chart("chart.5"),
      chart6: chart("chart.6"),
      chart7: chart("chart.7"),
      chart8: chart("chart.8"),
      other: chart("chart.other"),
      seq1: chart("chart.seq.1"),
      seq2: chart("chart.seq.2"),
      seq3: chart("chart.seq.3"),
      seq4: chart("chart.seq.4"),
      seq5: chart("chart.seq.5"),
      seq6: chart("chart.seq.6"),
      seq7: chart("chart.seq.7"),
      neg1: chart("chart.neg.1"),
      neg2: chart("chart.neg.2"),
      neg3: chart("chart.neg.3"),
      mid: chart("chart.mid"),
      pos1: chart("chart.pos.1"),
      pos2: chart("chart.pos.2"),
      pos3: chart("chart.pos.3"),
      grid: chart("chart.grid"),
      axis: chart("chart.axis")
    )
  }

  /// One geometry, from light mode, with a colour per mode at each stop.
  func gradient(_ role: String) throws -> PMGradient {
    let light = try mode("light")["gradient"][role]
    let dark = try mode("dark")["gradient"][role]
    let (lightStops, darkStops) = try (light["stops"].items(), dark["stops"].items())
    let sameShape =
      try light["solid"].bool() == dark["solid"].bool()
      && light["angle"].exactNumber() == dark["angle"].exactNumber()
      && lightStops.count == darkStops.count
      && zip(lightStops, darkStops).allSatisfy {
        try $0["at"].exactNumber() == $1["at"].exactNumber()
      }
    guard sameShape else { throw PMTokenDocumentError.geometryDiffersByMode(role) }
    return try PMGradient(
      solid: light["solid"].bool(),
      angle: light["angle"].number(),
      stops: zip(lightStops, darkStops).map { stop, darkStop in
        try PMGradientStop(
          color: dynamic(stop["color"], darkStop["color"]), at: stop["at"].number())
      }
    )
  }

  // MARK: Shadows

  func layer(_ node: TokenNode, color: PMDynamicColor) throws -> PMShadowLayer {
    try PMShadowLayer(
      x: node["x"].number(),
      y: node["y"].number(),
      blur: node["blur"].number(),
      spread: node["spread"].number(),
      color: color,
      inset: node["inset"].bool()
    )
  }

  /// A shadow no mode changes: each layer's colour is the same in both.
  func shadow(_ node: TokenNode) throws -> PMShadow {
    try PMShadow(
      layers: node["layers"].items().map { layer in
        try self.layer(layer, color: dynamic(layer["color"], layer["color"]))
      })
  }

  /// A halo takes its colour from a role, so each layer has a colour per mode.
  func glow(_ step: String) throws -> PMShadow {
    let light = try mode("light")["glow"][step]["layers"].items()
    let dark = try mode("dark")["glow"][step]["layers"].items()
    let geometry = { (layer: TokenNode) throws -> [Double] in
      try ["x", "y", "blur", "spread"].map { try layer[$0].exactNumber() }
        + [layer["inset"].bool() ? 1 : 0]
    }
    let sameShape =
      try light.count == dark.count
      && zip(light, dark).allSatisfy { try geometry($0) == geometry($1) }
    guard sameShape else { throw PMTokenDocumentError.geometryDiffersByMode(step) }
    return try PMShadow(
      layers: zip(light, dark).map { layer, darkLayer in
        try self.layer(layer, color: dynamic(layer["color"], darkLayer["color"]))
      })
  }

  // MARK: Scopes

  /// One density. The hit target is held to the document's floor; a control
  /// height is the density's, whatever its size.
  func density(_ name: String, hitTargetFloor: Double) throws -> PMDensity {
    let set = try root["density"][name]
    let px = { (key: String) throws -> Double in try set[key]["value"].number() }
    let hitTarget = try px("hitTarget")
    guard hitTarget >= hitTargetFloor else {
      throw PMTokenDocumentError.belowFloor(path: try set["hitTarget"].location, points: hitTarget)
    }
    return try PMDensity(
      space: PMSpace(
        s0: px("space.0"),
        s1: px("space.1"),
        s2: px("space.2"),
        s3: px("space.3"),
        s4: px("space.4"),
        s5: px("space.5"),
        s6: px("space.6"),
        s7: px("space.7"),
        s8: px("space.8"),
        s9: px("space.9"),
        s10: px("space.10")
      ),
      controlHeight: PMSizeSteps(
        sm: px("controlHeight.sm"),
        md: px("controlHeight.md"),
        lg: px("controlHeight.lg")
      ),
      hitTarget: hitTarget,
      inset: PMInsets(
        surface: px("inset.surface"), pane: px("inset.pane"), list: px("inset.list"))
    )
  }

  func motion(_ name: String) throws -> PMMotion {
    let set = try root["motion"][name]
    let seconds = { (key: String) throws -> TimeInterval in
      emittedNumber(try set[key].exactNumber() / 1000)
    }
    let easing = { (role: String) throws -> PMEasing in
      let curve = try set["motion.easing.\(role)"]
      return try PMEasing(
        x1: curve["x1"].number(), y1: curve["y1"].number(),
        x2: curve["x2"].number(), y2: curve["y2"].number())
    }
    let spring = { (role: String) throws -> PMSpring in
      let spring = try set["motion.spring.\(role)"]
      return try PMSpring(
        stiffness: spring["stiffness"].number(),
        damping: spring["damping"].number(),
        mass: spring["mass"].number(),
        dampingRatio: spring["dampingRatio"].number()
      )
    }
    return try PMMotion(
      duration: PMDurations(
        control: seconds("motion.duration.control"),
        controlExit: seconds("motion.duration.controlExit"),
        surface: seconds("motion.duration.surface"),
        surfaceExit: seconds("motion.duration.surfaceExit"),
        overlay: seconds("motion.duration.overlay"),
        overlayExit: seconds("motion.duration.overlayExit")
      ),
      easing: PMEasings(
        enter: easing("enter"), exit: easing("exit"), standard: easing("standard"),
        overshoot: easing("overshoot")),
      spring: PMSprings(
        base: spring("default"), snappy: spring("snappy"), gentle: spring("gentle")),
      pressScale: set["motion.pressScale"].number(),
      ambient: PMAmbient(
        shimmer: seconds("motion.ambient.shimmer"), spin: seconds("motion.ambient.spin")),
      stagger: PMStagger(step: seconds("motion.stagger.step"), max: seconds("motion.stagger.max"))
    )
  }

  // MARK: Exceptions

  /// An inset names a space step, so it carries a length per density; a
  /// shadow carries layers; a radius, one length.
  func exception(_ node: TokenNode) throws -> PMException {
    let value = try node["value"]
    let resolved: PMExceptionValue
    if value.has("density") {
      let lengths = try value["density"]
      resolved = .inset(
        try PMDensityLengths(
          compact: lengths["compact"]["value"].number(),
          standard: lengths["standard"]["value"].number(),
          comfortable: lengths["comfortable"]["value"].number()
        ))
    } else if value.has("layers") {
      resolved = .shadow(try shadow(value))
    } else {
      resolved = .radius(try value["value"].number())
    }
    return try PMException(
      member: node["member"].string(),
      token: node["token"].string(),
      ref: value["ref"].string(),
      value: resolved
    )
  }
}
