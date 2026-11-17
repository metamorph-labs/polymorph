#if os(macOS)
  import AppKit
  import PolymorphUI
  import SwiftUI
  import XCTest

  /// Every states fixture entry, rendered with `ImageRenderer` at the canvas's
  /// width and its own height (`Harness.size`) under the default pairing and a
  /// dark one. Each render must draw something (it differs from an empty canvas
  /// of its size, unless its `expect` says it `renders` `nothing`, when it must
  /// match that canvas), and each is written to
  /// `platforms/ios/.snapshots/<Member>/<entry>.<pass>.png` for a person to look at.
  @MainActor
  final class RenderingTests: XCTestCase {
    func testEveryEntryDrawsUnderEachPass() throws {
      let fixtures = PMFixtures.all
      XCTAssertFalse(fixtures.isEmpty, "no states fixture is registered")
      for fixture in fixtures {
        XCTAssertFalse(fixture.entries.isEmpty, "\(fixture.member) promises no states")
        let directory = Harness.snapshots.appendingPathComponent(fixture.member)
        try? FileManager.default.removeItem(at: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let names = fixture.entries.map(\.name)
        XCTAssertEqual(Set(names).count, names.count, "\(fixture.member) names two entries alike")

        for pass in Harness.passes {
          var blanks: [CGFloat: [UInt8]] = [:]
          for entry in fixture.entries {
            let label = "\(fixture.member) — \(entry.name) (\(pass.name))"
            let size = Harness.size(of: entry, pass)
            let image = try render(Harness.scene(entry, pass, size: size))
            XCTAssertEqual(image.width, Int(size.width * scale), label)
            XCTAssertEqual(image.height, Int(size.height * scale), label)
            if blanks[size.height] == nil {
              blanks[size.height] = try pixels(Harness.blank(pass, size: size))
            }
            if entry.expect["renders"] == "nothing" {
              // The web's `rendersNothing`: a state whose rule is to draw nothing.
              XCTAssertEqual(try pixels(of: image), blanks[size.height], "\(label) drew something")
            } else {
              XCTAssertNotEqual(try pixels(of: image), blanks[size.height], "\(label) drew nothing")
            }

            let file = directory.appendingPathComponent("\(Harness.slug(entry.name)).\(pass.name).png")
            let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
            try XCTUnwrap(png, label).write(to: file)
          }
        }
      }
    }

    private let scale = Harness.scale

    private func render(_ view: some View) throws -> CGImage {
      let renderer = ImageRenderer(content: view)
      renderer.scale = scale
      return try XCTUnwrap(renderer.cgImage, "ImageRenderer produced no image")
    }

    private func pixels(_ view: some View) throws -> [UInt8] {
      try pixels(of: render(view))
    }

    /// The image's pixels as 8-bit RGBA, so two renders compare byte for byte.
    private func pixels(of image: CGImage) throws -> [UInt8] {
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
  }
#endif
