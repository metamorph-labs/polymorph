#if os(macOS)
  import AppKit
  import ImageIO
  import PolymorphTokens
  import SwiftUI
  import XCTest

  @testable import PolymorphUI

  /// What Lightbox, AudioPlayer and RecordButton do when a reader acts on them,
  /// read through the accessibility tree AppKit publishes, as an assistive
  /// client reads it. AudioPlayer plays silent recordings, so nothing is
  /// heard. The scene is `BehaviourTests.Scene`.
  @MainActor
  final class MediaBehaviourTests: XCTestCase {
    typealias Scene = BehaviourTests.Scene

    override func setUp() async throws {
      // SwiftUI builds its accessibility nodes once an assistive client asks;
      // setting `AXEnhancedUserInterface`, as such a client does, turns them on.
      _ = NSApplication.shared.perform(
        NSSelectorFromString("accessibilitySetValue:forAttribute:"),
        with: NSNumber(value: true), with: "AXEnhancedUserInterface" as NSString)
    }

    // MARK: Lightbox

    /// Three pictures with nothing to load, so each is Image's named fallback.
    private static let pictures = ["A harbour at dusk", "A pine ridge", "Red cliffs"].map {
      PMLightboxImage(src: "", alt: $0)
    }

    /// `lightbox.md`: previous and next move one picture and the position
    /// follows; previous is disabled on the first picture and next on the
    /// last, because the lightbox does not wrap.
    func testTheTravelButtonsMoveOnePictureAndStopAtTheEnds() throws {
      let words = PMStrings.lightboxMessages
      let scene = Scene(
        LightboxInPlace(label: "Photographs", images: Self.pictures),
        size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      let previous = try XCTUnwrap(scene.element(role: .button, named: words.previous))
      XCTAssertFalse(enabled(previous), "previous is enabled on the first picture")
      XCTAssertNotNil(scene.element(named: words.position(1, 3)))
      XCTAssertNotNil(scene.element(named: "A harbour at dusk"))

      press(try XCTUnwrap(scene.element(role: .button, named: words.next)))
      XCTAssertNotNil(scene.element(named: words.position(2, 3)), "next did not move")
      XCTAssertNotNil(scene.element(named: "A pine ridge"))
      XCTAssertTrue(enabled(try XCTUnwrap(scene.element(role: .button, named: words.previous))))

      press(try XCTUnwrap(scene.element(role: .button, named: words.next)))
      XCTAssertNotNil(scene.element(named: words.position(3, 3)))
      XCTAssertFalse(
        enabled(try XCTUnwrap(scene.element(role: .button, named: words.next))),
        "next is enabled on the last picture")

      press(try XCTUnwrap(scene.element(role: .button, named: words.previous)))
      XCTAssertNotNil(scene.element(named: words.position(2, 3)), "previous did not move")
    }

    /// One picture has nowhere to move: no previous, no next, no position.
    func testOnePictureDrawsNoTravelAndNoPosition() throws {
      let words = PMStrings.lightboxMessages
      let scene = Scene(
        LightboxInPlace(label: "Attachment preview", images: [Self.pictures[0]]),
        size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(role: .button, named: words.close))
      XCTAssertNil(scene.element(role: .button, named: words.previous))
      XCTAssertNil(scene.element(role: .button, named: words.next))
      XCTAssertNil(scene.element(named: words.position(1, 1)))
    }

    /// The arrow keys move one picture by the layout's direction: right to
    /// left, the left arrow moves to the next picture.
    func testTheArrowKeysMoveByTheLayoutsDirection() throws {
      let words = PMStrings.lightboxMessages
      for (direction, forward) in [
        (LayoutDirection.leftToRight, KeyEquivalent.rightArrow),
        (.rightToLeft, .leftArrow),
      ] {
        let scene = Scene(
          LightboxInPlace(label: "Photographs", images: Self.pictures)
            .environment(\.layoutDirection, direction),
          size: CGSize(width: 360, height: 640))
        defer { scene.close() }
        scene.press(key: forward)
        XCTAssertNotNil(
          scene.element(named: words.position(2, 3)), "\(direction): the arrow did not move")
        scene.press(key: forward == .rightArrow ? .leftArrow : .rightArrow)
        XCTAssertNotNil(
          scene.element(named: words.position(1, 3)), "\(direction): the arrow did not move back")
      }
    }

    /// A controlled lightbox reports a move and shows the app's `index`.
    func testAControlledLightboxReportsAMoveAndShowsTheAppsIndex() throws {
      let words = PMStrings.lightboxMessages
      var reported: [Double] = []
      let panel = PMLightboxPanel(
        props: PMLightboxProps(images: Self.pictures, index: 2, label: "Photographs"), index: 2,
        travel: { reported.append(Double($0)) }, close: {})
      let scene = Scene(panel, size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      XCTAssertNotNil(scene.element(named: words.position(3, 3)))
      press(try XCTUnwrap(scene.element(role: .button, named: words.previous)))
      XCTAssertEqual(reported, [1])
    }

    /// The close Button closes; a press on the picture does not.
    func testTheCloseButtonCloses() throws {
      var closed = 0
      let panel = PMLightboxPanel(
        props: PMLightboxProps(images: Self.pictures, label: "Photographs"), index: 0,
        travel: { _ in }, close: { closed += 1 })
      let scene = Scene(panel, size: CGSize(width: 360, height: 640))
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .button, named: PMStrings.lightboxMessages.close)))
      XCTAssertEqual(closed, 1)
    }

    /// `lightbox.md`, Detail: a picture is fitted inside the panel less
    /// `space.4` on each side, by its height when it is tall and by its width
    /// when it is wide, and a small one is drawn at its own size.
    func testAPictureIsFittedInsideThePanelAndNeverEnlarged() throws {
      let space = PMTheme.default.defaultDensity.space
      let panel = CGSize(width: 360, height: 640)
      for (width, height) in [(600, 1600), (2400, 900), (120, 80)] {
        let url = try Self.picture(width: width, height: height)
        let alt = "A picture of \(width) by \(height)"
        let scene = Scene(
          PMLightboxPanel(
            props: PMLightboxProps(images: [PMLightboxImage(src: url, alt: alt)], label: "Pictures"),
            index: 0, travel: { _ in }, close: {}
          )
          .frame(width: panel.width, height: panel.height),
          size: panel)
        defer { scene.close() }
        var drawn = CGRect.zero
        for _ in 0..<40 where drawn.width < 1 {
          scene.settle()
          drawn = scene.element(named: alt).map(frame) ?? .zero
        }
        let room = CGSize(
          width: panel.width - space.s4 * 2, height: panel.height - space.s4 * 2)
        let scale = min(1, room.width / CGFloat(width), room.height / CGFloat(height))
        XCTAssertEqual(drawn.width, CGFloat(width) * scale, accuracy: 1, "\(alt): its width")
        XCTAssertEqual(drawn.height, CGFloat(height) * scale, accuracy: 1, "\(alt): its height")
      }
    }

    /// A PNG of one colour at `width` by `height` pixels, written to a
    /// temporary file, as a file URL.
    private static func picture(width: Int, height: Int) throws -> String {
      let context = try XCTUnwrap(
        CGContext(
          data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
      context.setFillColor(CGColor(red: 0.2, green: 0.3, blue: 0.4, alpha: 1))
      context.fill(CGRect(x: 0, y: 0, width: width, height: height))
      let image = try XCTUnwrap(context.makeImage())
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("lightbox-\(width)x\(height)-\(UUID().uuidString).png")
      let destination = try XCTUnwrap(
        CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil))
      CGImageDestinationAddImage(destination, image, nil)
      XCTAssertTrue(CGImageDestinationFinalize(destination))
      return url.absoluteString
    }

    // MARK: AudioPlayer

    /// `audio-player.md`: a press plays the recording, which is reported once
    /// and names the Button "Pause"; the recording plays to its end, which is
    /// reported once, and the player is ended, its Button "Play" again.
    func testAPressPlaysTheRecordingToItsEnd() throws {
      let words = PMStrings.audioPlayerMessages
      var played = 0
      var ended = 0
      let scene = Scene(
        PMAudioPlayer(
          props: PMAudioPlayerProps(
            label: "Voice message from Ada", onEnded: { ended += 1 }, onPlay: { played += 1 },
            src: AudioPlayerStates.recording(1))))
      defer { scene.close() }
      XCTAssertTrue(wait(scene) { self.state(of: "AudioPlayer", in: scene) == nil })
      press(try XCTUnwrap(scene.element(role: .button, named: words.play)))
      XCTAssertTrue(
        wait(scene) { self.state(of: "AudioPlayer", in: scene) == "playing" }, "it did not play")
      XCTAssertNotNil(scene.element(role: .button, named: words.pause))
      XCTAssertTrue(
        wait(scene) { self.state(of: "AudioPlayer", in: scene) == "ended" }, "it did not end")
      XCTAssertNotNil(scene.element(role: .button, named: words.play))
      XCTAssertEqual(played, 1)
      XCTAssertEqual(ended, 1)
    }

    /// Starting one player pauses the other, so two recordings never play
    /// over each other.
    func testStartingOnePlayerPausesTheOther() throws {
      let words = PMStrings.audioPlayerMessages
      let scene = Scene(
        VStack {
          PMAudioPlayer(
            props: PMAudioPlayerProps(label: "Ada", src: AudioPlayerStates.recording(18)))
          PMAudioPlayer(
            props: PMAudioPlayerProps(label: "Grace", src: AudioPlayerStates.recording(7)))
        })
      defer { scene.close() }
      press(try XCTUnwrap(scene.element(role: .button, named: words.play)))
      XCTAssertTrue(wait(scene) { self.buttons(named: words.pause, in: scene) == 1 })
      // The first "Play" is now the second player's.
      press(try XCTUnwrap(scene.element(role: .button, named: words.play)))
      XCTAssertTrue(
        wait(scene) {
          self.buttons(named: words.pause, in: scene) == 1
            && self.buttons(named: words.play, in: scene) == 1
            && self.identities(of: "AudioPlayer", in: scene).last?["state"] == "playing"
        }, "both players play")
      XCTAssertNil(self.identities(of: "AudioPlayer", in: scene).first?["state"])
      press(try XCTUnwrap(scene.element(role: .button, named: words.pause)))
    }

    /// Without `duration` the scrubber takes the file's own length, and is
    /// enabled once the file gives it.
    func testTheScrubberTakesTheFilesOwnLength() throws {
      let words = PMStrings.audioPlayerMessages
      let scene = Scene(
        PMAudioPlayer(
          props: PMAudioPlayerProps(
            label: "Recorded call", src: AudioPlayerStates.recording(18))))
      defer { scene.close() }
      XCTAssertTrue(
        wait(scene) { scene.element(named: words.scrubber).map(self.enabled) == true },
        "the file's length did not arrive")
    }

    /// A file that cannot be loaded shows the failure's words in place of the
    /// scrubber, and keeps the Button, enabled, so a press asks again; an
    /// empty `src` has nothing to ask for, and disables it.
    func testAFailureKeepsTheButtonAndAnEmptySourceDisablesIt() throws {
      let words = PMStrings.audioPlayerMessages
      let missing = FileManager.default.temporaryDirectory
        .appendingPathComponent("polymorph-missing-\(UUID().uuidString).wav").absoluteString
      let scene = Scene(
        PMAudioPlayer(props: PMAudioPlayerProps(duration: 18, label: "Ada", src: missing)))
      defer { scene.close() }
      XCTAssertTrue(
        wait(scene) { self.state(of: "AudioPlayer", in: scene) == "failed" }, "it did not fail")
      XCTAssertNotNil(scene.element(named: words.failed))
      XCTAssertNil(scene.element(named: words.scrubber))
      XCTAssertTrue(enabled(try XCTUnwrap(scene.element(role: .button, named: words.play))))

      let empty = Scene(PMAudioPlayer(props: PMAudioPlayerProps(label: "Ada", src: "")))
      defer { empty.close() }
      XCTAssertEqual(state(of: "AudioPlayer", in: empty), "failed")
      XCTAssertNotNil(empty.element(named: words.failed))
      XCTAssertFalse(enabled(try XCTUnwrap(empty.element(role: .button, named: words.play))))
    }

    // MARK: RecordButton

    /// `record-button.md`: a press calls `onStart` at rest and `onStop` while
    /// recording and changes nothing itself; the Button's name says what a
    /// press does, and the time is read as its length in words.
    func testAPressReportsAndTheAppDecidesTheState() throws {
      var started = 0
      var stopped = 0
      let button = { (recording: Bool) in
        PMRecordButton(
          props: PMRecordButtonProps(
            elapsed: 12, label: "Record a voice message", locale: "en-US",
            onStart: { started += 1 }, onStop: { stopped += 1 }, recording: recording,
            stopLabel: "Stop recording"))
      }
      let rest = Scene(button(false))
      defer { rest.close() }
      press(try XCTUnwrap(rest.element(role: .button, named: "Record a voice message")))
      XCTAssertEqual([started, stopped], [1, 0])
      XCTAssertNotNil(
        rest.element(role: .button, named: "Record a voice message"),
        "a press changed the state the app holds")
      XCTAssertNil(rest.element(named: "12 seconds"), "the time shows at rest")

      let live = Scene(button(true))
      defer { live.close() }
      press(try XCTUnwrap(live.element(role: .button, named: "Stop recording")))
      XCTAssertEqual([started, stopped], [1, 1])
      XCTAssertNotNil(live.element(named: "12 seconds"), "the time is not read as its length")
      XCTAssertEqual(state(of: "RecordButton", in: live), "recording")
    }

    // MARK: Helpers

    /// Turns the run loop until `condition` holds, for up to five seconds.
    private func wait(_ scene: Scene, until condition: () -> Bool) -> Bool {
      for _ in 0..<25 {
        if condition() { return true }
        scene.settle()
      }
      return condition()
    }

    /// The attributes of each element whose identifier names `member`, in order.
    private func identities(of member: String, in scene: Scene) -> [[String: String]] {
      Scene.elements(in: scene.host).compactMap { element in
        guard let parsed = PMMember.parse(attribute(element, "accessibilityIdentifier") ?? ""),
          parsed.name == member
        else { return nil }
        return parsed.attributes
      }
    }

    /// The first `member`'s `state`.
    private func state(of member: String, in scene: Scene) -> String? {
      identities(of: member, in: scene).first?["state"]
    }

    private func buttons(named name: String, in scene: Scene) -> Int {
      Scene.elements(in: scene.host).filter {
        attribute($0, "accessibilityRole") == NSAccessibility.Role.button.rawValue
          && attribute($0, "accessibilityLabel") == name
      }.count
    }

    private func attribute(_ element: NSObject, _ name: String) -> String? {
      guard element.responds(to: NSSelectorFromString(name)) else { return nil }
      return element.value(forKey: name).map { "\($0)" }
    }

    private func press(_ element: NSObject) {
      _ = element.perform(NSSelectorFromString("accessibilityPerformPress"))
      RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    }

    private func frame(_ element: NSObject) -> CGRect {
      (element.value(forKey: "accessibilityFrame") as? NSValue)?.rectValue ?? .zero
    }

    private func enabled(_ element: NSObject) -> Bool {
      (element.value(forKey: "accessibilityEnabled") as? Bool) ?? true
    }
  }
#endif
