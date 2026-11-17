import SwiftUI
import XCTest

@testable import PolymorphTokens

/// Every pairing the package carries, checked as values a view would read.
final class CatalogueTests: XCTestCase {
  func testTheCatalogueListsEveryPairingOnce() {
    XCTAssertFalse(PMTheme.catalogue.isEmpty)
    XCTAssertEqual(Set(PMTheme.catalogue.map(\.name)).count, PMTheme.catalogue.count)
    for theme in PMTheme.catalogue {
      XCTAssertEqual(theme.name, "\(theme.system)/\(theme.palette)")
      XCTAssertEqual(PMTheme.named(system: theme.system, palette: theme.palette), theme)
    }
    XCTAssertNil(PMTheme.named(system: "no-such-system", palette: "neutral"))
  }

  /// `default` is one of the catalogue's pairings. Which one is the web's
  /// decision, `design/defaults.json`; `emit-swift.test.ts` checks the generated
  /// file names it.
  func testTheDefaultIsACataloguePairing() {
    XCTAssertTrue(PMTheme.catalogue.contains(PMTheme.default))
  }

  /// The iOS minimum is a hit area: the hit target is at least 44 points at
  /// every density, and a control's height stays the density's, at least the
  /// web's 24, so compact and comfortable still differ on a phone.
  func testTheHitTargetMeetsTheIOSFloorAndHeightsStayTheDensitys() {
    for theme in PMTheme.catalogue {
      for name in PMDensityName.allCases {
        let density = theme.density[name]
        let heights = [density.controlHeight.sm, density.controlHeight.md, density.controlHeight.lg]
        for height in heights {
          XCTAssertGreaterThanOrEqual(height, 24, "\(theme.name) \(name) control height")
        }
        XCTAssertGreaterThanOrEqual(
          density.hitTarget, PMTheme.tokenDocumentFloor, "\(theme.name) \(name) hit target")
      }
      XCTAssertLessThan(
        theme.density.compact.controlHeight.md, theme.density.comfortable.controlHeight.md,
        theme.name)
    }
  }

  func testTheDefaultModeIsOneOfTheThree() {
    for theme in PMTheme.catalogue {
      XCTAssertTrue(PMModePreference.allCases.contains(theme.defaultMode), theme.name)
    }
  }

  func testEveryDynamicColourResolvesToItsChannelsInEachScheme() {
    for theme in PMTheme.catalogue {
      let colors = dynamicColors(in: theme)
      XCTAssertGreaterThan(colors.count, 100, theme.name)
      for (path, color) in colors {
        for scheme in [ColorScheme.light, .dark] {
          let expected = color.resolved(in: scheme)
          let actual = resolve(color, in: scheme)
          let label = "\(theme.name) \(path) \(scheme)"
          XCTAssertEqual(actual.red, Double(expected.red) / 255, accuracy: 0.5 / 255, label)
          XCTAssertEqual(actual.green, Double(expected.green) / 255, accuracy: 0.5 / 255, label)
          XCTAssertEqual(actual.blue, Double(expected.blue) / 255, accuracy: 0.5 / 255, label)
          XCTAssertEqual(actual.alpha, expected.alpha, accuracy: 0.001, label)
        }
      }
    }
  }

  func testTheTextureIsListedAsUnsupportedAndNotEmitted() {
    for theme in PMTheme.catalogue {
      XCTAssertEqual(theme.unsupported, ["texture.page"], theme.name)
    }
  }

  func testTheReadersAgreeWithTheMembers() {
    let theme = PMTheme.plain_neutral
    XCTAssertEqual(theme.density.standard.space[4], theme.density.standard.space.s4)
    XCTAssertEqual(theme.defaultDensity, theme.density[theme.axes.density])
    XCTAssertEqual(theme.motion.none.duration.overlay, 0)
    XCTAssertEqual(theme.preferredColorScheme, .light)
    XCTAssertEqual(theme.colors.accentBg.resolved(in: .dark), theme.colors.accentBg.dark)
    // A weight between the nine is matched as CSS matches it: from 400 up, below it down.
    let style = { (wght: Int) in
      PMTextStyle(
        size: 16, lineHeight: 1.5, wght: wght, tracking: 0, family: "Geist", fallback: .sans,
        italic: false, opsz: nil)
    }
    XCTAssertEqual(style(550).weight, .semibold)
    XCTAssertEqual(style(450).weight, .medium)
    XCTAssertEqual(style(400).weight, .regular)
    XCTAssertEqual(style(350).weight, .light)
    // A 135° gradient runs corner to corner.
    let gradient = theme.gradients.accentGradient
    XCTAssertEqual(gradient.angle, 135)
    XCTAssertEqual(gradient.startPoint.x, 0, accuracy: 1e-9)
    XCTAssertEqual(gradient.endPoint.y, 1, accuracy: 1e-9)
  }

  /// Every `PMDynamicColor` reachable from a theme, by its path.
  private func dynamicColors(in value: Any, path: String = "") -> [(String, PMDynamicColor)] {
    if let color = value as? PMDynamicColor { return [(path, color)] }
    return Mirror(reflecting: value).children.enumerated().flatMap { index, child in
      dynamicColors(in: child.value, path: "\(path).\(child.label ?? String(index))")
    }
  }

  /// The colour SwiftUI draws for `color` in an environment with `scheme`, in sRGB.
  private func resolve(_ color: PMDynamicColor, in scheme: ColorScheme) -> (
    red: Double, green: Double, blue: Double, alpha: Double
  ) {
    var environment = EnvironmentValues()
    environment.colorScheme = scheme
    let resolved = color.color.resolve(in: environment)
    let srgb = resolved.cgColor.converted(
      to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)!
    let parts = srgb.components!.map(Double.init)
    return (parts[0], parts[1], parts[2], parts[3])
  }
}
