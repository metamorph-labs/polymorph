// DurationInput's arithmetic (`design/components/duration-input.md`), the
// engine's `packages/engine/src/conventions/duration.ts` in Swift: which units
// a field shows, a number of seconds split across them and summed back, the
// bounds a value is held inside, the range of each count, and a commit. The
// words a count is written and said with are Foundation's duration formatter
// (`Duration.UnitsFormatStyle`), the platform's counterpart of the `Intl`
// formats the engine reads. `InputLogicTests` holds it to the engine's cases.

import Foundation
import PolymorphTokens

/// What the reader has set, by unit. A missing unit shows its placeholder and
/// counts as zero.
typealias PMDurationDraft = [PMDurationUnit: Int]

/// The units a field shows, its `min` and `max` in seconds, and its locale.
struct PMDurationOptions {
  var units: [PMDurationUnit]? = nil
  var min: Double? = nil
  var max: Double? = nil
}

enum PMDurations {
  /// Every unit, largest first.
  static let order: [PMDurationUnit] = [.days, .hours, .minutes, .seconds]

  /// The units a field shows when the caller names none (the engine's
  /// `DURATION_DEFAULT_UNITS`).
  static let defaultUnits: [PMDurationUnit] = [.days, .hours, .minutes]

  /// The most seconds a field holds with no `max`: JavaScript's largest safe
  /// integer, the engine's `Number.MAX_SAFE_INTEGER`.
  static let ceiling: Double = 9_007_199_254_740_991

  /// How many counts the largest unit's wheel offers when `max` sets none: a
  /// wheel draws its whole list, so it holds three digits of the unit.
  static let wheelReach = 999

  /// What an empty count shows: dashes, as an empty time segment shows (the
  /// engine's `PLACEHOLDER`).
  static let placeholder = "––"

  /// The seconds in one of `unit`.
  static func seconds(_ unit: PMDurationUnit) -> Double {
    switch unit {
    case .days: 86_400
    case .hours: 3_600
    case .minutes: 60
    case .seconds: 1
    }
  }

  /// The units a field shows, largest first, each once; the default units
  /// when the list names none (`durationUnits`).
  static func units(_ units: [PMDurationUnit]?) -> [PMDurationUnit] {
    let shown = order.filter { units?.contains($0) == true }
    return shown.isEmpty ? defaultUnits : shown
  }

  /// JavaScript's `Math.round`: the nearest whole number, a half rounded up.
  static func round(_ value: Double) -> Double {
    (value + 0.5).rounded(.down)
  }

  /// The seconds in the smallest unit shown: every drawn value is a multiple of it.
  private static func grain(_ options: PMDurationOptions) -> Double {
    seconds(units(options.units).last ?? .minutes)
  }

  /// The bounds a committed value is held inside: `min` and `max` moved
  /// inwards to whole counts of the smallest unit shown, or the caller's own
  /// when no whole count lies between them (`durationBounds`).
  static func bounds(_ options: PMDurationOptions) -> (min: Double, max: Double) {
    let step = grain(options)
    let low = Swift.max(0, options.min ?? 0)
    let high = Swift.max(low, options.max ?? ceiling)
    let min = (low / step).rounded(.up) * step
    let max = (high / step).rounded(.down) * step
    return max < min ? (low, high) : (min, max)
  }

  /// Seconds held inside the bounds, in whole seconds; no value, or a number
  /// that is not finite, is no value (`clampDuration`).
  static func clamp(_ seconds: Double?, _ options: PMDurationOptions) -> Double? {
    guard let seconds, seconds.isFinite else { return nil }
    let (min, max) = bounds(options)
    return Swift.min(max, Swift.max(min, round(seconds)))
  }

  /// Seconds as a draft: the count of each unit shown, the largest taking
  /// what the smaller do not hold, rounded to the nearest count of the
  /// smallest unit, half up (`durationDraft`).
  static func draft(_ seconds: Double?, _ options: PMDurationOptions) -> PMDurationDraft {
    guard let seconds, seconds.isFinite else { return [:] }
    let step = grain(options)
    var rest = round(Swift.max(0, seconds) / step) * step
    var draft: PMDurationDraft = [:]
    for unit in units(options.units) {
      let count = (rest / self.seconds(unit)).rounded(.down)
      draft[unit] = Int(count)
      rest -= count * self.seconds(unit)
    }
    return draft
  }

  /// The draft's seconds, an empty count counting as zero; `nil` while every
  /// count is empty. Not clamped (`durationOfDraft`).
  static func total(_ draft: PMDurationDraft, _ options: PMDurationOptions) -> Double? {
    let shown = units(options.units)
    guard shown.contains(where: { draft[$0] != nil }) else { return nil }
    return shown.reduce(0) { $0 + Double(draft[$1] ?? 0) * seconds($1) }
  }

  /// The range a count stays inside: below the next larger unit shown (59
  /// minutes under hours), and for the largest unit as many as `max` holds
  /// (`durationSegmentRange`).
  static func range(_ unit: PMDurationUnit, _ options: PMDurationOptions) -> ClosedRange<Int> {
    let shown = units(options.units)
    if let at = shown.firstIndex(of: unit), at > 0 {
      return 0...(Int(seconds(shown[at - 1]) / seconds(unit)) - 1)
    }
    return 0...Int((bounds(options).max / seconds(unit)).rounded(.down))
  }

  /// Whether the largest unit's count has a ceiling of `max`'s.
  static func bounded(_ unit: PMDurationUnit, _ options: PMDurationOptions) -> Bool {
    unit != units(options.units).first || options.max != nil
  }

  /// One of `unit` more or less, held inside the bounds and split again: a
  /// count carries into the next larger one, and an empty field counts as
  /// zero (`stepDuration`).
  static func step(
    _ draft: PMDurationDraft, _ unit: PMDurationUnit, by delta: Int, _ options: PMDurationOptions
  ) -> PMDurationDraft {
    let total = total(draft, options) ?? 0
    return self.draft(clamp(total + Double(delta) * seconds(unit), options), options)
  }

  /// What a commit makes of a draft: its seconds held inside the bounds, and
  /// the draft of that value. A draft that holds the seconds `reported` is
  /// drawn with commits nothing, so a value the units cannot write exactly is
  /// kept until the reader changes what the counts show (`commitDuration`).
  static func commit(
    _ draft: PMDurationDraft, reported: Double?, _ options: PMDurationOptions
  ) -> (draft: PMDurationDraft, value: Double?, changed: Bool) {
    let drawn = self.draft(reported, options)
    if total(draft, options) == total(drawn, options) {
      return (drawn, reported, false)
    }
    let value = clamp(total(draft, options), options)
    return (self.draft(value, options), value, value != reported)
  }

  // MARK: The words

  /// A count with its unit's short word, as the locale writes them ("7 days",
  /// "0 hr"): the count's digits, the word, and whether the word comes first.
  static func short(_ count: Int, _ unit: PMDurationUnit, _ locale: Locale) -> PMDurationWords {
    let text = formatted(count, unit, width: .abbreviated, locale)
    var digits = ""
    var word = ""
    var wordFirst = false
    for run in text.runs {
      let part = String(text[run.range].characters)
      switch run.measurement {
      case .value?: digits += part
      case .unit?:
        if digits.isEmpty { wordFirst = true }
        word += part
      default: break
      }
    }
    if digits.isEmpty {
      digits = count.formatted(.number.grouping(.never).locale(locale))
    }
    return PMDurationWords(digits: digits, word: word, wordFirst: wordFirst)
  }

  /// A count and its unit's long word, as said ("15 minutes").
  static func spoken(_ count: Int, _ unit: PMDurationUnit, _ locale: Locale) -> String {
    String(formatted(count, unit, width: .wide, locale).characters)
  }

  /// The unit's name in the locale ("minute"), which names its count: the
  /// word of one of it, said.
  static func name(_ unit: PMDurationUnit, _ locale: Locale) -> String {
    let text = formatted(1, unit, width: .wide, locale)
    let word = text.runs.filter { $0.measurement == .unit }
      .map { String(text[$0.range].characters) }.joined()
    return word.isEmpty ? String(text.characters) : word
  }

  private static func formatted(
    _ count: Int, _ unit: PMDurationUnit, width: Duration.UnitsFormatStyle.UnitWidth,
    _ locale: Locale
  ) -> AttributedString {
    let allowed: Duration.UnitsFormatStyle.Unit =
      switch unit {
      case .days: .days
      case .hours: .hours
      case .minutes: .minutes
      case .seconds: .seconds
      }
    let length = Int64(count) * Int64(seconds(unit))
    return Duration.seconds(length).formatted(
      .units(allowed: [allowed], width: width, zeroValueUnits: .show(length: 1))
        .locale(locale).attributed)
  }
}

/// A count as a field draws it: its digits and its unit's word, on the side
/// the locale writes it.
struct PMDurationWords: Equatable {
  let digits: String
  let word: String
  let wordFirst: Bool
}
