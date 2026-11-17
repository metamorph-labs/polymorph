// RecordButton (`design/components/record-button.md`): a Button preset that
// starts and stops a recording the app makes, as a composer's voice input or
// a ticket's voice note. The app owns the microphone: it asks for the device,
// records and holds the file, and passes what it has, whether it records, for
// how long and how loud the input is. The member draws that and reports each
// press. It requests no permission and imports no audio framework.
//
// A row, `space.2` apart, centred: while recording the meter, then the
// Button. The Button is Button's icon-only at `size`: ghost/neutral with
// `record` at rest, named `label`, and outline/neutral with `stop` while
// recording, named `stopLabel`. A press calls `onStart` at rest and `onStop`
// while recording, and changes nothing itself; `disabled` is Button's. The
// meter is the mark, a `space.6` box holding a dot in `danger.text`, `space.3`
// in from each edge, over a halo in `danger.border` that grows with `level`
// from the dot's size to the whole box, both at `radius.pill`; and the time
// the app has recorded (`elapsed`) as the clock writes it in `locale`'s
// numerals, `text.sm` at `md` and `text.xs` at `sm`, in `text.secondary` with
// tabular figures. The halo follows the level over the control duration on
// the standard easing; at the `none` temperament and under Reduce Motion it
// stays whole and the level is its opacity.
//
// The mark is hidden from VoiceOver. The time is read where the reader
// reaches it, before the Button, as its length in words (`PolymorphUI+Clock`).
// Nothing is announced: the Button's new name is what VoiceOver reads when a
// recording starts or stops. The meter is drawn before the Button, so in a
// row aligned to its end the Button stays where it was pressed.

import PolymorphTokens
import SwiftUI

public struct PMRecordButton: PMRecordButtonRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  private let props: PMRecordButtonProps

  public init(props: PMRecordButtonProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let recording = props.recording ?? false
    let size = props.size ?? .md

    HStack(spacing: space.s2) {
      if recording {
        HStack(spacing: space.s2) {
          PMRecordMark(level: Self.share(props.level))
          if let elapsed = props.elapsed {
            Text(PMClock.digits(elapsed, locale))
              .pmTextStyle(size == .sm ? theme.text.xs : theme.text.sm)
              .pmTabularFigures(true)
              .foregroundStyle(theme.colors.textSecondary.color)
              .lineLimit(1)
              .fixedSize()
              .accessibilityLabel(Text(PMClock.words(elapsed, locale)))
          }
        }
      }
      PMButton(
        props: PMButtonProps(
          disabled: props.disabled ?? false, icon: recording ? .stop : .record, iconOnly: true,
          label: recording ? props.stopLabel : props.label, onClick: press,
          size: size == .sm ? .sm : .md, appearance: recording ? .outlineNeutral : .ghostNeutral))
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "RecordButton",
      recording ? ["state": "recording", "size": size.rawValue] : ["size": size.rawValue])
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  /// `onStart` at rest and `onStop` while recording; the app sets `recording`.
  private func press() {
    if props.recording ?? false {
      props.onStop?()
    } else {
      props.onStart?()
    }
  }

  /// The level from 0 to 1. A value that is not a number is no level.
  static func share(_ level: Double?) -> Double {
    guard let level, level.isFinite else { return 0 }
    return min(1, max(0, level))
  }
}

/// The mark: the halo, from the dot's size at no level to the whole box at
/// the full level, under the dot. The box holds the halo, so a loud input
/// moves nothing beside it.
private struct PMRecordMark: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let level: Double

  var body: some View {
    let space = theme.defaultDensity.space
    let motion = theme.defaultMotion
    // Without motion the halo does not grow: it is whole, and the level is its
    // opacity, the scale-fade pattern's projection to a fade.
    let still = reduceMotion || motion.duration.control <= 0
    let shape = RoundedRectangle(cornerRadius: theme.radius.pill)
    ZStack {
      shape.fill(theme.colors.dangerBorder.color)
        .scaleEffect(still ? 1 : (1 + 2 * level) / 3)
        .opacity(still ? level : 1)
        .animation(
          still ? nil : motion.easing.standard.animation(duration: motion.duration.control),
          value: level)
      shape.fill(theme.colors.dangerText.color)
        .padding(space.s3)
    }
    .frame(width: space.s6, height: space.s6)
    .accessibilityHidden(true)
  }
}

/// RecordButton's states, from the spec's States table.
public struct RecordButtonStates: PMStates {
  public let member = "RecordButton"

  public init() {}

  private static let label = "Record a voice message"
  private static let stop = "Stop recording"

  private static func button(
    recording: Bool? = nil, elapsed: Double? = nil, level: Double? = nil,
    size: PMRecordButtonSize? = nil, disabled: Bool? = nil
  ) -> PMRecordButton {
    PMRecordButton(
      props: PMRecordButtonProps(
        disabled: disabled, elapsed: elapsed, label: label, level: level, recording: recording,
        size: size, stopLabel: stop))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("rest — ready to record", expect: ["state": "", "size": "md"]) {
        Self.button()
      },
      PMStateEntry(
        "recording — the time and the level beside the stop control",
        expect: ["state": "recording"]
      ) {
        Self.button(recording: true, elapsed: 12, level: 0.6)
      },
      PMStateEntry("silent — recording with no input level", expect: ["state": "recording"]) {
        Self.button(recording: true, elapsed: 47, level: 0)
      },
      PMStateEntry(
        "starting — recording before the app counts a second", expect: ["state": "recording"]
      ) {
        Self.button(recording: true)
      },
      PMStateEntry("sm — the size a composer’s toolbar takes", expect: ["size": "sm"]) {
        Self.button(recording: true, elapsed: 75, level: 0.3, size: .sm)
      },
      PMStateEntry("disabled", expect: ["state": ""]) {
        Self.button(disabled: true)
      },
    ]
  }
}
