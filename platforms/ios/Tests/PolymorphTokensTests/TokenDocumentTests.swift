import Foundation
import XCTest

@testable import PolymorphTokens

/// `PMTheme(tokenDocument:)` against the emitter: a document decodes to exactly
/// the `PMTheme` the Swift emitter writes for the same pairing.
///
/// The documents are the engine's current output. `Tests/fixtures/token-documents.mjs`
/// writes them into a temporary directory once per run, so this test needs
/// `node` and the repository's installed dependencies. Without `node` on
/// `PATH`, and on an iOS simulator, which cannot start a process, every test
/// that reads the documents is skipped and says why. The directory is removed
/// when the class's tests end, whether or not the script succeeded.
final class TokenDocumentTests: XCTestCase {
  override class func tearDown() {
    try? FileManager.default.removeItem(at: TokenDocuments.directory)
    super.tearDown()
  }

  func testEveryCataloguePairingDecodesToItsGeneratedStatic() throws {
    let documents = try TokenDocuments.shared()
    XCTAssertEqual(
      documents.catalogue.map { "\($0.system)/\($0.palette)" },
      PMTheme.catalogue.map(\.name)
    )
    for entry in documents.catalogue {
      let expected = try XCTUnwrap(PMTheme.named(system: entry.system, palette: entry.palette))
      assertSame(try PMTheme(tokenDocument: entry.document), expected)
    }
  }

  func testTheQuietExampleDecodesToItsStatic() throws {
    let quiet = try TokenDocuments.shared().example("example-quiet")
    assertSame(try PMTheme(tokenDocument: quiet.document), .exampleQuiet_exampleViolet)
  }

  /// The probe holds what no catalogue pairing does: a tenant, an italic
  /// display face, a heading face of its own, glass, a gradient partner and an
  /// exception of each family.
  func testTheProbeDecodesToItsStatic() throws {
    let probe = try TokenDocuments.shared().example("example-probe")
    let theme = try PMTheme(tokenDocument: probe.document)
    assertSame(theme, .exampleProbe_exampleDusk)

    XCTAssertEqual(theme.kind, .tenant)
    XCTAssertTrue(theme.display.md.italic)
    XCTAssertNotEqual(theme.fonts.heading.family, theme.fonts.body.family)
    XCTAssertEqual(theme.text.lg.family, theme.fonts.heading.family)
    XCTAssertEqual(theme.text.md.family, theme.fonts.body.family)
    XCTAssertFalse(theme.gradients.accentGradient.solid)
    let standard = theme.density.standard.space.s4
    XCTAssertEqual(
      theme.exceptions.map(\.value),
      [
        .radius(theme.radius.sm),
        .shadow(theme.shadows.overlay),
        .inset(
          PMDensityLengths(
            compact: theme.density.compact.space.s4, standard: standard,
            comfortable: theme.density.comfortable.space.s4)),
      ])
  }

  /// The examples are not in `Generated/`, so their statics are test sources.
  /// They must be what the emitter writes today, or the comparisons above
  /// compare against an older engine.
  func testTheExampleStaticsAreCurrent() throws {
    let documents = try TokenDocuments.shared()
    for example in documents.examples {
      let current = try String(contentsOf: example.currentStatic, encoding: .utf8)
      let committed = try String(contentsOf: example.committedStatic, encoding: .utf8)
      XCTAssertTrue(
        current == committed,
        "\(example.committedStatic.lastPathComponent) is stale: run "
          + "`node platforms/ios/Tests/fixtures/token-documents.mjs --write-statics` "
          + "from the repository root")
    }
  }

  func testNumbersRoundAsTheSwiftEmitterWritesThem() throws {
    let numbers = try TokenDocuments.shared().numbers
    XCTAssertGreaterThan(numbers.count, 400)
    for (input, written) in numbers {
      let rounded = emittedNumber(input)
      XCTAssertEqual(rounded, written, "\(input)")
      XCTAssertEqual(rounded.sign, written == 0 ? .plus : written.sign, "\(input)")
    }
  }

  /// A document written before the heading slot has no `fonts.heading`, and
  /// its heading steps name `font.body`. It decodes to the theme the emitter
  /// writes today, whose heading slot is the body slot.
  func testADocumentWithNoHeadingSlotReadsTheBodySlotAsIt() throws {
    let entry = try TokenDocuments.shared().catalogue[0]
    let older = try edited(entry.document) { root in
      root[path: ["fonts", "heading"]] = nil
      for step in ["lg", "xl", "2xl", "3xl"] {
        root[path: ["invariant", "text.\(step).family", "ref"]] = "font.body"
      }
    }
    let theme = try PMTheme(tokenDocument: older)
    XCTAssertEqual(theme.fonts.heading, theme.fonts.body)
    assertSame(theme, try XCTUnwrap(PMTheme.named(system: entry.system, palette: entry.palette)))
  }

  // MARK: Refusals

  func testAnotherFormatIsRefused() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    assertRefused(try edited(document) { $0["format"] = "polymorph-tokens/2" }) {
      $0 == .format("polymorph-tokens/2")
    }
    assertRefused(try edited(document) { $0["format"] = nil }) { $0 == .format(nil) }
    // A format that is not a string is a malformed value, not another format.
    assertRefused(try edited(document) { $0["format"] = ["polymorph-tokens/1"] }) {
      $0 == .invalid(path: "format", reason: "expected a string, found an array")
    }
  }

  func testADocumentThatDoesNotListTheTextureAsUnsupportedIsRefused() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    assertRefused(try edited(document) { $0["unsupported"] = [String]() }) {
      $0
        == .invalid(
          path: "unsupported",
          reason: #"does not list "texture.page", which PMTheme has no field for"#)
    }
  }

  func testAnotherPlatformIsRefused() throws {
    assertRefused(try TokenDocuments.shared().android) { $0 == .platform("android") }
  }

  func testDataThatIsNotAnObjectIsRefused() {
    assertRefused(Data("not json".utf8)) {
      if case .notJSON = $0 { return true }
      return false
    }
    assertRefused(Data("[]".utf8)) { $0 == .notJSON("the top level is an array") }
  }

  func testAValueThatCannotBeReadNamesItsPath() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    let missing = try edited(document) { root in
      root[path: ["mode", "light", "color", "accent.bg"]] = nil
    }
    assertRefused(missing) {
      $0 == .invalid(path: #"mode.light.color["accent.bg"]"#, reason: "missing")
    }
    let mistyped = try edited(document) { $0[path: ["pairing", "chartCap"]] = "3" }
    assertRefused(mistyped) {
      $0 == .invalid(path: "pairing.chartCap", reason: "expected a number, found a string")
    }
    let unknown = try edited(document) { $0[path: ["pairing", "axes", "density"]] = "dense" }
    assertRefused(unknown) {
      $0
        == .invalid(
          path: "pairing.axes.density",
          reason: #"expected one of "compact", "standard", "comfortable", found "dense""#)
    }
  }

  /// The floor is the document's `floor.hitTarget`, which may not be under
  /// Apple's 44 points, and it holds the hit target only.
  func testAHitTargetBelowTheFloorIsRefused() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    let low = try edited(document) {
      $0[path: ["density", "compact", "hitTarget", "value"]] = 30
    }
    assertRefused(low) { $0 == .belowFloor(path: "density.compact.hitTarget", points: 30) }

    let lowFloor = try edited(document) { $0[path: ["floor", "hitTarget"]] = 24 }
    assertRefused(lowFloor) { $0 == .belowFloor(path: "floor.hitTarget", points: 24) }

    // A document may declare a larger floor; its hit targets must then meet it.
    let higherFloor = try edited(document) { $0[path: ["floor", "hitTarget"]] = 48 }
    assertRefused(higherFloor) { $0 == .belowFloor(path: "density.compact.hitTarget", points: 44) }
  }

  /// A control's height is the density's: the iOS minimum is a hit area, and
  /// a member extends its hit area to `hitTarget` instead.
  func testAControlHeightIsReadAsTheDensityGivesIt() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    let short = try edited(document) {
      $0[path: ["density", "compact", "controlHeight.sm", "value"]] = 28
    }
    let theme = try PMTheme(tokenDocument: short)
    XCTAssertEqual(theme.density.compact.controlHeight.sm, 28)
    XCTAssertEqual(theme.density.compact.hitTarget, 44)
  }

  func testAnAlphaWithMoreDecimalsThanTheEmitterWritesIsRefused() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    let precise = try edited(document) {
      $0[path: ["mode", "light", "color", "bg.scrim", "alpha"]] = 0.123456
    }
    assertRefused(precise) {
      $0
        == .invalid(
          path: #"mode.light.color["bg.scrim"].alpha"#,
          reason: "expected at most four decimals, found 0.123456")
    }
  }

  func testAGlowWithAnotherGeometryInDarkModeIsRefused() throws {
    let document = try TokenDocuments.shared().catalogue[0].document
    let skewed = try edited(document) { root in
      var layers = root[path: ["mode", "dark", "glow", "glow.focus", "layers"]] as! [Any]
      var layer = layers[0] as! [String: Any]
      layer["blur"] = 99
      layers[0] = layer
      root[path: ["mode", "dark", "glow", "glow.focus", "layers"]] = layers
    }
    assertRefused(skewed) { $0 == .geometryDiffersByMode("glow.focus") }
  }

  func testTheErrorsReadAsSentences() {
    XCTAssertEqual(
      PMTokenDocumentError.platform("android").localizedDescription,
      "The document is resolved for \"android\", not \"ios\": its floors and unsupported list "
        + "are that platform's. Emit it with { platform: 'ios' }.")
    XCTAssertEqual(
      PMTokenDocumentError.belowFloor(path: "density.compact.hitTarget", points: 24).description,
      "density.compact.hitTarget is 24 points, below the hit-target floor the document declares "
        + "in floor.hitTarget. A document emitted for ios raises it, so this one was not.")
    XCTAssertEqual(
      PMTokenDocumentError.belowFloor(path: "floor.hitTarget", points: 24).description,
      "floor.hitTarget is 24 points, below the 44-point iOS hit target. A document emitted for "
        + "ios declares it, so this one was not.")
  }

  // MARK: Helpers

  /// Equal under `==`; on failure, the first path at which the two differ.
  private func assertSame(
    _ actual: PMTheme, _ expected: PMTheme, file: StaticString = #filePath, line: UInt = #line
  ) {
    guard actual != expected else { return }
    let at = firstDifference(actual, expected) ?? "somewhere `Mirror` cannot see"
    XCTFail("\(expected.name) decodes to another theme: \(at)", file: file, line: line)
  }

  private func firstDifference(_ actual: Any, _ expected: Any, path: String = "") -> String? {
    let (left, right) = (Mirror(reflecting: actual), Mirror(reflecting: expected))
    if left.children.isEmpty || right.children.isEmpty
      || left.children.count != right.children.count
    {
      let (a, b) = (String(describing: actual), String(describing: expected))
      return a == b ? nil : "\(path) is \(a), the static holds \(b)"
    }
    for (index, (a, b)) in zip(left.children, right.children).enumerated() {
      let next = "\(path).\(a.label ?? String(index))"
      if let found = firstDifference(a.value, b.value, path: next) { return found }
    }
    return nil
  }

  private func assertRefused(
    _ document: Data, file: StaticString = #filePath, line: UInt = #line,
    _ expected: (PMTokenDocumentError) -> Bool
  ) {
    do {
      let theme = try PMTheme(tokenDocument: document)
      XCTFail("decoded \(theme.name) instead of refusing it", file: file, line: line)
    } catch let error as PMTokenDocumentError {
      XCTAssertTrue(expected(error), "refused with: \(error)", file: file, line: line)
    } catch {
      XCTFail("threw \(error), not a PMTokenDocumentError", file: file, line: line)
    }
  }

  /// The document with one edit, through `JSONSerialization`.
  private func edited(_ document: Data, _ edit: (inout [String: Any]) -> Void) throws -> Data {
    var root = try XCTUnwrap(JSONSerialization.jsonObject(with: document) as? [String: Any])
    edit(&root)
    return try JSONSerialization.data(withJSONObject: root)
  }
}

extension Dictionary where Key == String, Value == Any {
  /// A value at a path of keys, set through every object on the way.
  fileprivate subscript(path keys: [String]) -> Any? {
    get {
      guard let first = keys.first else { return self }
      let value = self[first]
      if keys.count == 1 { return value }
      return (value as? [String: Any])?[path: Array(keys.dropFirst())]
    }
    set {
      guard let first = keys.first else { return }
      if keys.count == 1 {
        self[first] = newValue
        return
      }
      var child = self[first] as? [String: Any] ?? [:]
      child[path: Array(keys.dropFirst())] = newValue
      self[first] = child
    }
  }
}

/// The documents `token-documents.mjs` writes, once per test run.
private struct TokenDocuments {
  struct Entry {
    let system: String
    let palette: String
    let document: Data
  }

  struct Example {
    let system: String
    let document: Data
    /// The static the emitter writes today.
    let currentStatic: URL
    /// The copy this target compiles.
    let committedStatic: URL
  }

  /// The temporary directory the script writes into, one per test run. The
  /// script creates it; `TokenDocumentTests.tearDown()` removes it.
  static let directory = FileManager.default.temporaryDirectory
    .appendingPathComponent("polymorph-token-documents-\(UUID().uuidString)")

  let catalogue: [Entry]
  let examples: [Example]
  let android: Data
  let numbers: [(Double, Double)]

  func example(_ system: String) throws -> Example {
    try XCTUnwrap(examples.first { $0.system == system }, "no example \(system)")
  }

  /// `platforms/ios`, from this file's own path.
  static let package = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  static let repository = package.deletingLastPathComponent().deletingLastPathComponent()

  private static let written = Result { try write() }

  static func shared() throws -> TokenDocuments { try written.get() }

  private static func write() throws -> TokenDocuments {
    #if !os(macOS)
      // `Process` exists on macOS alone, and a simulator cannot run `node`.
      throw XCTSkip("the token documents are written by `node`, which runs on macOS only")
    #else
      return try writeWithNode()
    #endif
  }

  #if os(macOS)
  private static func writeWithNode() throws -> TokenDocuments {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = [
      "node", package.appendingPathComponent("Tests/fixtures/token-documents.mjs").path,
      directory.path,
    ]
    process.currentDirectoryURL = repository
    let output = Pipe()
    process.standardOutput = output
    process.standardError = output
    try process.run()
    let printed = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    process.waitUntilExit()
    if process.terminationStatus == 127 {
      throw XCTSkip("`node` is not on PATH, so the token documents cannot be written: \(printed)")
    }
    guard process.terminationStatus == 0 else {
      throw TokenDocumentsFailure(message: "token-documents.mjs failed:\n\(printed)")
    }

    let read = { (name: String) throws -> Data in
      try Data(contentsOf: directory.appendingPathComponent(name))
    }
    let index = try JSONDecoder().decode(Index.self, from: read("index.json"))
    let numbers = try JSONDecoder().decode([[Double]].self, from: read(index.numbers))
    return TokenDocuments(
      catalogue: try index.catalogue.map {
        Entry(system: $0.system, palette: $0.palette, document: try read($0.document))
      },
      examples: try index.examples.map {
        Example(
          system: $0.system,
          document: try read($0.document),
          currentStatic: directory.appendingPathComponent($0.static),
          committedStatic: repository.appendingPathComponent(index.statics)
            .appendingPathComponent($0.static)
        )
      },
      android: try read(index.android),
      numbers: numbers.map { ($0[0], $0[1]) }
    )
  }
  #endif

  private struct Index: Decodable {
    struct Document: Decodable {
      let system: String
      let palette: String
      let document: String
    }

    struct ExampleDocument: Decodable {
      let system: String
      let document: String
      let `static`: String
    }

    let catalogue: [Document]
    let examples: [ExampleDocument]
    let android: String
    let numbers: String
    let statics: String
  }
}

private struct TokenDocumentsFailure: Error, CustomStringConvertible {
  let message: String
  var description: String { message }
}
