// AudioPlayer (`design/components/audio-player.md`): plays one recording, a
// voice message in a conversation or a recorded call in a ticket. One row,
// `space.3` apart, centred, as wide as its container: the play Button,
// Button's soft/accent/md icon-only, named by what a press does ("Play" with
// `run`, "Pause" with `pause`); the scrubber, Slider from zero to the
// recording's whole seconds by one-second steps, taking the room left and no
// narrower than `space.10`; and the time, the elapsed time and, once the
// length is known, a `text.muted` slash and the total, `space.1` apart, in
// `text.sm` `text.secondary` with tabular figures. The time is hidden from
// VoiceOver, because the scrubber says the same.
//
// The player is AVFoundation's `AVPlayer`, the platform's media player, which
// the containment law admits in this file alone (`MEMBER_IMPORTS`). It is
// made when the member appears, so the file's length is known before a press,
// as the web's `preload="metadata"` gives it, and a new `src` starts from
// nothing. The total is the file's finite length, else `duration`, else
// unknown: then the time shows the elapsed time alone and the scrubber is
// disabled, as it is for a recording under a second. A press plays or
// pauses, and after the end plays from the start. Starting one player pauses
// every other AudioPlayer in the app, because two recordings that play over
// each other cannot be followed. `onPlay` is called when playback starts and
// `onEnded` when it reaches the end. While the scrubber is dragged the clock
// follows it, and the recording moves when it is let go; VoiceOver's swipes
// move it a second at a time. A player that leaves the screen pauses.
//
// When the file cannot be loaded, the scrubber and the time give way to the
// `error` glyph in `danger.text` and `messages.failed`, which is also the
// Button's hint; the Button stays enabled, and a press asks for the file
// again. An empty `src` is failed from the start and disables the Button.
// `locale` writes the clock's numerals and the spoken lengths
// (`PolymorphUI+Clock`), the environment's locale without it.
//
// The root is a group named by `label`, and carries `state` playing, ended or
// failed. Nothing in the player is announced: the Button's new name is what
// VoiceOver reads when a press changes it.

import AVFoundation
import PolymorphTokens
import SwiftUI

public struct PMAudioPlayer: PMAudioPlayerRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var playback = PMAudioPlayback()
  /// The second the scrubber is dragged to, until it is let go.
  @State private var scrub: Double?
  private let props: PMAudioPlayerProps

  public init(props: PMAudioPlayerProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let messages = props.messages ?? PMStrings.audioPlayerMessages
    let known = playback.length ?? Self.length(props.duration)
    let total = Double(PMClock.whole(known ?? 0))
    let failing = props.src.isEmpty || playback.failed
    let seekable = !failing && total >= 1
    let position = playback.ended ? total : min(scrub ?? Double(playback.elapsed), total)
    let _ = playback.listen(play: props.onPlay, ended: props.onEnded)

    HStack(spacing: space.s3) {
      PMButton(
        props: PMButtonProps(
          disabled: props.src.isEmpty, icon: playback.playing ? .pause : .run, iconOnly: true,
          label: playback.playing ? messages.pause : messages.play,
          onClick: { playback.toggle() }, size: .md, appearance: .softAccent)
      )
      .modifier(PMAudioPlayerHint(hint: failing ? messages.failed : nil))
      if failing {
        HStack(spacing: space.s2) {
          PMIconView(.error, size: .sm)
            .foregroundStyle(theme.colors.dangerText.color)
            .accessibilityHidden(true)
          Text(messages.failed)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(theme.colors.textSecondary.color)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        PMSlider(
          props: PMSliderProps(
            ariaLabel: messages.scrubber, disabled: !seekable,
            formatValue: { spoken($0, known: known, total: total, messages) },
            max: seekable ? total : 1, min: 0,
            onChange: { value in if case .single(let second) = value { scrub = second } },
            onCommit: { value in
              if case .single(let second) = value {
                scrub = nil
                playback.seek(second)
              }
            },
            step: 1, value: .single(seekable ? position : 0))
        )
        .frame(minWidth: space.s10)
        HStack(spacing: space.s1) {
          Text(PMClock.digits(position, locale))
          if known != nil {
            Text(verbatim: "/").foregroundStyle(theme.colors.textMuted.color)
            Text(PMClock.digits(total, locale))
          }
        }
        .pmTextStyle(theme.text.sm)
        .pmTabularFigures(true)
        .foregroundStyle(theme.colors.textSecondary.color)
        .fixedSize()
        .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("AudioPlayer", attributes(failing: failing))
    .task(id: props.src) {
      scrub = nil
      playback.load(props.src)
    }
    .onDisappear { playback.pause() }
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  /// `state`: failed first, because a failed player is neither playing nor
  /// ended; none at rest.
  private func attributes(failing: Bool) -> [String: String] {
    if failing { return ["state": "failed"] }
    if playback.playing { return ["state": "playing"] }
    if playback.ended { return ["state": "ended"] }
    return [:]
  }

  /// The scrubber's spoken value: "5 seconds of 18 seconds", or the elapsed
  /// length alone while the total is unknown.
  private func spoken(
    _ second: Double, known: Double?, total: Double, _ messages: PMAudioPlayerMessages
  ) -> String {
    let elapsed = PMClock.words(second, locale)
    return known == nil ? elapsed : messages.position(elapsed, PMClock.words(total, locale))
  }

  /// A length the file or the app gave, or none: not finite, or not above zero.
  static func length(_ seconds: Double?) -> Double? {
    guard let seconds, seconds.isFinite, seconds > 0 else { return nil }
    return seconds
  }
}

/// The failure's words as the Button's hint, the web's `aria-describedby`.
private struct PMAudioPlayerHint: ViewModifier {
  let hint: String?

  func body(content: Content) -> some View {
    if let hint {
      content.accessibilityHint(Text(hint))
    } else {
      content
    }
  }
}

/// One recording in AVFoundation's player: what the member draws from it and
/// what it asks of it. Its state follows the player's own reports: the item's
/// status and length, the player's time control and time, and the item's end.
@MainActor @Observable
final class PMAudioPlayback {
  private(set) var playing = false
  private(set) var ended = false
  /// Whole seconds played, as the clock shows them.
  private(set) var elapsed = 0
  /// The file's own finite length in seconds, once it gives one.
  private(set) var length: Double?
  private(set) var failed = false

  @ObservationIgnored private var onPlay: (@MainActor () -> Void)?
  @ObservationIgnored private var onEnded: (@MainActor () -> Void)?
  @ObservationIgnored private var player: AVPlayer?
  @ObservationIgnored private var watching: [NSKeyValueObservation] = []
  @ObservationIgnored private var clock: Any?
  @ObservationIgnored private var reports: [NSObjectProtocol] = []
  @ObservationIgnored private var source = ""

  /// Every player in the app, so starting one pauses the others.
  private static let all = NSHashTable<PMAudioPlayback>.weakObjects()

  init() {
    Self.all.add(self)
  }

  /// The app's handlers, which a new rendering may replace.
  func listen(play: (@MainActor () -> Void)?, ended: (@MainActor () -> Void)?) {
    onPlay = play
    onEnded = ended
  }

  /// Starts from nothing with `src`: not playing, at zero, its length to come.
  func load(_ src: String) {
    stop()
    playing = false
    ended = false
    elapsed = 0
    length = nil
    failed = false
    source = src
    guard !src.isEmpty else { return }
    guard let url = URL(string: src) else {
      failed = true
      return
    }
    let item = AVPlayerItem(url: url)
    let player = AVPlayer(playerItem: item)
    player.actionAtItemEnd = .pause
    self.player = player
    watching = [
      item.observe(\.status, options: [.initial, .new]) { [weak self] item, _ in
        let failed = item.status == .failed
        Task { @MainActor in if failed { self?.fail() } }
      },
      item.observe(\.duration, options: [.initial, .new]) { [weak self] item, _ in
        let seconds = item.duration.seconds
        Task { @MainActor in self?.learn(seconds) }
      },
      player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
        let moving = player.timeControlStatus != .paused
        Task { @MainActor in self?.moved(moving) }
      },
    ]
    // A quarter of a second, so the clock turns within a frame or so of each
    // whole second.
    clock = player.addPeriodicTimeObserver(
      forInterval: CMTime(value: 1, timescale: 4), queue: .main
    ) { [weak self] time in
      let seconds = time.seconds
      MainActor.assumeIsolated {
        guard let self, !self.ended else { return }
        self.elapsed = PMClock.whole(seconds)
      }
    }
    let center = NotificationCenter.default
    reports = [
      center.addObserver(
        forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.finish() }
      },
      center.addObserver(
        forName: AVPlayerItem.failedToPlayToEndTimeNotification, object: item, queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.fail() }
      },
    ]
  }

  /// Plays a paused recording, from the start after its end, and pauses one
  /// that plays. On a failed recording a press asks for the file again,
  /// because a failure is about one request.
  func toggle() {
    if failed {
      load(source)
      player?.play()
      return
    }
    guard let player else { return }
    if player.timeControlStatus != .paused {
      player.pause()
      return
    }
    if ended {
      ended = false
      elapsed = 0
      player.seek(to: .zero)
    }
    player.play()
  }

  /// Moves the recording to a whole second, leaving the ended state.
  func seek(_ second: Double) {
    elapsed = PMClock.whole(second)
    ended = false
    player?.seek(to: CMTime(value: CMTimeValue(elapsed), timescale: 1))
  }

  func pause() {
    player?.pause()
  }

  private func moved(_ now: Bool) {
    guard now != playing else { return }
    playing = now
    guard now else { return }
    ended = false
    for other in Self.all.allObjects where other !== self {
      other.pause()
    }
    onPlay?()
  }

  private func finish() {
    playing = false
    ended = true
    onEnded?()
  }

  private func fail() {
    failed = true
    playing = false
  }

  private func learn(_ seconds: Double) {
    length = PMAudioPlayer.length(seconds)
  }

  private func stop() {
    player?.pause()
    if let clock { player?.removeTimeObserver(clock) }
    clock = nil
    for report in reports {
      NotificationCenter.default.removeObserver(report)
    }
    reports = []
    watching = []
    player = nil
  }
}

/// AudioPlayer's states, from the spec's States table. A recording is a silent
/// file in the temporary directory, 8-bit mono samples at 8 kHz as the web
/// fixture's, so no sound file is kept in the repository and nothing is heard;
/// no entry is pressed, so none plays. `ImageRenderer` runs no task, so the
/// renders show each player before its file is read: the entry without a
/// `duration` has no total yet.
public struct AudioPlayerStates: PMStates {
  public let member = "AudioPlayer"

  public init() {}

  private static let german = PMAudioPlayerMessages(
    play: "Abspielen", pause: "Pause", scrubber: "Wiedergabeposition",
    position: { "\($0) von \($1)" }, failed: "Die Aufnahme konnte nicht geladen werden")

  /// A silent WAV file of `seconds` seconds, written once, as a file URL.
  static func recording(_ seconds: Int) -> String {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("polymorph-silence-\(seconds)s.wav")
    if !FileManager.default.fileExists(atPath: url.path) {
      let rate = 8000
      let samples = seconds * rate
      var data = Data()
      func text(_ value: String) { data.append(contentsOf: Array(value.utf8)) }
      func four(_ value: Int) {
        withUnsafeBytes(of: UInt32(value).littleEndian) { data.append(contentsOf: $0) }
      }
      func two(_ value: Int) {
        withUnsafeBytes(of: UInt16(value).littleEndian) { data.append(contentsOf: $0) }
      }
      text("RIFF")
      four(36 + samples)
      text("WAVE")
      text("fmt ")
      four(16)
      two(1)
      two(1)
      four(rate)
      four(rate)
      two(1)
      two(8)
      text("data")
      four(samples)
      // 128 is an 8-bit sample's silence.
      data.append(Data(repeating: 128, count: samples))
      try? data.write(to: url, options: .atomic)
    }
    return url.absoluteString
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "rest — a voice message whose length the app knows",
        expect: ["state": "", "label": "Voice message from Ada"]
      ) {
        PMAudioPlayer(
          props: PMAudioPlayerProps(
            duration: 18, label: "Voice message from Ada", src: Self.recording(18)))
      },
      PMStateEntry("the file’s own length — no duration passed", expect: ["state": ""]) {
        PMAudioPlayer(
          props: PMAudioPlayerProps(label: "Recorded call, ticket 4182", src: Self.recording(18)))
      },
      PMStateEntry(
        "localized — the clock and the spoken position in German",
        expect: ["label": "Sprachnachricht von Ada"]
      ) {
        PMAudioPlayer(
          props: PMAudioPlayerProps(
            duration: 18, label: "Sprachnachricht von Ada", locale: "de-DE",
            messages: Self.german, src: Self.recording(18)))
      },
      PMStateEntry("two players — starting one pauses the other") {
        AudioPlayerPair()
      },
      PMStateEntry(
        "failed — no file to load", expect: ["state": "failed", "label": "Voice message from Ada"]
      ) {
        PMAudioPlayer(
          props: PMAudioPlayerProps(duration: 18, label: "Voice message from Ada", src: ""))
      },
    ]
  }
}

/// Two players in a stack, `space.4` apart.
private struct AudioPlayerPair: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    VStack(spacing: theme.defaultDensity.space.s4) {
      PMAudioPlayer(
        props: PMAudioPlayerProps(
          duration: 18, label: "Voice message from Ada",
          src: AudioPlayerStates.recording(18)))
      PMAudioPlayer(
        props: PMAudioPlayerProps(
          duration: 7, label: "Voice message from Grace", src: AudioPlayerStates.recording(7)))
    }
  }
}
