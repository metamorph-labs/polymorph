// A number of seconds as a recording's clock writes it and as a screen reader
// says it: the engine's `clockTime` and `spokenDuration`
// (`packages/engine/src/conventions/audio.ts`, over `time-text.ts`), in Swift.
// AudioPlayer writes its clock and its spoken position with these, and
// RecordButton its time. The digits are the locale's own numerals around a
// colon, as the engine's `Intl.NumberFormat` writes them; the words are
// Foundation's duration formatter (`Duration.UnitsFormatStyle`), the
// platform's counterpart of the `Intl` unit names joined as a list of units.
// `ClockTextTests` holds both to the engine's cases.

import Foundation

enum PMClock {
  /// Whole seconds, never negative: a value that is not a finite number
  /// above zero is zero, and a fraction is dropped, so a clock moves once a
  /// second and a recording's elapsed time equals its length when it ends.
  static func whole(_ seconds: Double) -> Int {
    seconds.isFinite && seconds > 0 ? Int(seconds.rounded(.down)) : 0
  }

  /// `65` → `1:05`, `3725` → `1:02:05`: minutes and two-digit seconds, with
  /// the hours in front from an hour on and the minutes then in two digits
  /// too. Hours are not grouped, and a day is 24 of them.
  static func digits(_ seconds: Double, _ locale: Locale) -> String {
    let time = whole(seconds)
    let hours = time / 3600
    let minutes = time % 3600 / 60
    let rest = time % 60
    let plain = IntegerFormatStyle<Int>.number.grouping(.never).locale(locale)
    let padded = plain.precision(.integerLength(2))
    return hours > 0
      ? "\(hours.formatted(plain)):\(minutes.formatted(padded)):\(rest.formatted(padded))"
      : "\(minutes.formatted(plain)):\(rest.formatted(padded))"
  }

  /// `65` → `1 minute, 5 seconds`: each unit that is not zero in the locale's
  /// words, hours past a day included. No time at all is `0 seconds`.
  static func words(_ seconds: Double, _ locale: Locale) -> String {
    Duration.seconds(whole(seconds)).formatted(
      .units(allowed: [.hours, .minutes, .seconds], width: .wide).locale(locale))
  }
}
