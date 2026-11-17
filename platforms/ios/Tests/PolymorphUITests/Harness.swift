import PolymorphTokens
import SwiftUI

// `@testable` reaches the members' own environment values: the harness decides
// whether they draw their scroll views (`\.pmPageScrolls`).
@testable import PolymorphUI

/// What every harness test shares: the pairings an entry is rendered under, the
/// size it is rendered at, and how an entry is named on disk.
enum Harness {
  /// The canvas every entry is rendered on, in points: its width, and the least
  /// height an entry is given.
  static let canvas = CGSize(width: 360, height: 120)

  /// The most height an entry is given: a phone's screen, so a page archetype's
  /// state shows whole.
  static let tallest: CGFloat = 844

  /// The pixels per point an entry is drawn at, and measured at: text lays out
  /// to the pixel grid, so a height measured at another scale differs.
  static let scale: CGFloat = 2

  /// The size an entry is rendered at: the canvas's width, and the entry's own
  /// height at that width and text size, from the canvas's height up to
  /// `tallest`. A short member keeps the canvas; a tall one (a card, a page) is
  /// not cut off. The entry is measured at the text size and the scale it is
  /// rendered at, because either changes how tall its text lays out, and with
  /// its scroll views drawn at rest, as `scene` draws them by default.
  @MainActor
  static func size(
    of entry: PMStateEntry, _ pass: Pass, dynamicTypeSize: DynamicTypeSize = .large
  ) -> CGSize {
    let measure = ImageRenderer(
      content: entry.render()
        .frame(width: canvas.width)
        .fixedSize(horizontal: false, vertical: true)
        .pmTheme(pass.theme)
        .environment(\.colorScheme, pass.scheme)
        .environment(\.pmPageScrolls, false)
        .dynamicTypeSize(dynamicTypeSize))
    measure.scale = scale
    let height = measure.cgImage.map { CGFloat($0.height) / scale } ?? canvas.height
    return CGSize(width: canvas.width, height: min(tallest, max(canvas.height, height.rounded(.up))))
  }

  /// One way of rendering an entry: a pairing and a colour scheme.
  struct Pass {
    let name: String
    let theme: PMTheme
    let scheme: ColorScheme
  }

  /// The environment's default pairing in light mode, and the first pairing
  /// whose system defaults to dark, in dark mode; the default pairing in dark
  /// mode when no system does.
  static let passes: [Pass] = {
    let base = EnvironmentValues().pmTheme
    let dark = PMTheme.catalogue.first { $0.defaultMode == .dark } ?? base
    return [
      Pass(name: "\(slug(base.name))-light", theme: base, scheme: .light),
      Pass(name: "\(slug(dark.name))-dark", theme: dark, scheme: .dark),
    ]
  }()

  /// An entry on a canvas of `size` under a pass: the pairing's app background
  /// behind it, the pairing and the scheme in its environment. `scrolls` says
  /// whether the members draw their scroll views (`\.pmPageScrolls`). It is off
  /// by default, because `ImageRenderer` draws no scroll view's content, so the
  /// renders and the identity tests draw each scroll view's content at rest
  /// instead. The simulator audit hosts each entry both ways, to tell what a
  /// scroll view holds. A fixture leaves it to the harness.
  static func scene(
    _ entry: PMStateEntry, _ pass: Pass, size: CGSize = canvas, scrolls: Bool = false
  ) -> some View {
    dressed(
      entry.render()
        .frame(width: size.width, height: size.height)
        .background(pass.theme.colors.bgApp.color),
      pass, scrolls: scrolls)
  }

  /// `content` with a pass's pairing and scheme in its environment, and
  /// whether the members draw their scroll views (`scene`'s `scrolls`).
  static func dressed<Content: View>(_ content: Content, _ pass: Pass, scrolls: Bool = false) -> some View {
    content
      .pmTheme(pass.theme)
      .environment(\.colorScheme, pass.scheme)
      .environment(\.pmPageScrolls, scrolls)
  }

  /// The canvas with nothing on it, to tell an entry that drew from one that did not.
  static func blank(_ pass: Pass, size: CGSize = canvas) -> some View {
    Color.clear
      .frame(width: size.width, height: size.height)
      .background(pass.theme.colors.bgApp.color)
      .pmTheme(pass.theme)
      .environment(\.colorScheme, pass.scheme)
  }

  /// `soft / neutral` → `soft-neutral`.
  static func slug(_ name: String) -> String {
    name.lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .joined(separator: "-")
  }

  /// `platforms/ios`, found from this file, so the snapshots land in the
  /// package whichever directory the tests run from.
  static let packageRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()

  /// Where a person looks at the renders: gitignored, rewritten each run.
  static let snapshots = packageRoot.appendingPathComponent(".snapshots")
}
