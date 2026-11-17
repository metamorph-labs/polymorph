#if os(macOS)
  import AppKit
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What the example's renders share: a phone's screen, the environment every
  /// screen is drawn in, the page's height, and where the PNGs go.
  ///
  /// `ImageRenderer` does not draw a scroll view's content, so a render turns
  /// the page's scrolling off, as every page archetype's states fixture does,
  /// and draws the whole page. A Mac has no width class, so a render sets the
  /// table's list form, which an iPhone's compact width chooses. Both settings
  /// are the members' own environment values, which `@testable` reaches.
  @MainActor
  enum ScreenRenders {
    /// An iPhone's screen, in points: its width, and the least height a render is given.
    static let screen = CGSize(width: 390, height: 844)
    static let scale: CGFloat = 2

    /// `platforms/ios/.snapshots/Examples/Relay`, created when missing.
    static func directory() throws -> URL {
      let directory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent(".snapshots/Examples/Relay")
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      return directory
    }

    /// Removes a screen's earlier renders, `<screen>.*.png`.
    static func clear(_ screen: String) throws {
      let directory = try directory()
      for name in try FileManager.default.contentsOfDirectory(atPath: directory.path)
      where name.hasPrefix("\(screen).") {
        try FileManager.default.removeItem(at: directory.appendingPathComponent(name))
      }
    }

    /// The view in the environment every render shares: the pairing, light
    /// mode, the page drawn whole and the table in its phone form.
    static func staged(_ view: some View, theme: PMTheme) -> some View {
      view
        .pmTheme(theme)
        .environment(\.colorScheme, .light)
        .environment(\.pmPageScrolls, false)
        .environment(\.pmDataTableLayout, .list)
    }

    /// The page's height at the screen's width, and no less than the screen's.
    static func height(of view: some View, theme: PMTheme) -> CGFloat {
      let measure = ImageRenderer(
        content: staged(view, theme: theme)
          .frame(width: screen.width)
          .fixedSize(horizontal: false, vertical: true))
      // Measured at the scale it is drawn at: text lays out to the pixel grid.
      measure.scale = scale
      let height = measure.cgImage.map { CGFloat($0.height) / scale } ?? screen.height
      return max(screen.height, height.rounded(.up))
    }

    /// The view on a canvas of the screen's width and `height`, the pairing's
    /// app background behind it.
    static func render(_ view: some View, theme: PMTheme, height: CGFloat? = nil) throws -> CGImage {
      let renderer = ImageRenderer(
        content: staged(view, theme: theme)
          .frame(width: screen.width, height: height ?? screen.height)
          .background(theme.colors.bgApp.color))
      renderer.scale = scale
      return try XCTUnwrap(renderer.cgImage, "ImageRenderer produced no image")
    }

    /// The image's pixels as 8-bit RGBA, so two renders compare byte for byte.
    static func pixels(of image: CGImage) throws -> [UInt8] {
      var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
      let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
        guard
          let context = CGContext(
            data: buffer.baseAddress, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return false }
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return true
      }
      XCTAssertTrue(drawn, "could not read the render's pixels")
      return bytes
    }

    /// Renders each state at its own height, holds each to drawing something
    /// and to drawing other pixels than every other state, and writes
    /// `<screen>.<state>.png`.
    static func check(_ screenName: String, _ states: [(name: String, view: AnyView)]) throws {
      try clear(screenName)
      let directory = try directory()
      let theme = PMTheme.default
      var drawn: [String: [UInt8]] = [:]
      for state in states {
        let height = height(of: state.view, theme: theme)
        let image = try render(state.view, theme: theme, height: height)
        XCTAssertEqual(image.width, Int(screen.width * scale), state.name)
        XCTAssertEqual(image.height, Int(height * scale), state.name)

        // Compared as a whole, so a failure names the states, not millions of bytes.
        let bytes = try pixels(of: image)
        let empty = try pixels(of: render(Color.clear, theme: theme, height: height))
        XCTAssertFalse(bytes == empty, "\(state.name) drew nothing")
        for (other, earlier) in drawn {
          XCTAssertFalse(bytes == earlier, "\(state.name) draws what \(other) draws")
        }
        drawn[state.name] = bytes

        let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
        try XCTUnwrap(png, state.name)
          .write(to: directory.appendingPathComponent("\(screenName).\(state.name).png"))
      }
    }
  }
#endif
