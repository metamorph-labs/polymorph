// Highlight's runs (`design/components/highlight.md`): a text cut into the
// parts that match and the parts that do not, as data. On the web the engine's
// `highlightRuns` decides them; this is the same function, held to the
// engine's own cases (`Tests/PolymorphUITests/HighlightRunsTests.swift`), so
// the same text and the same query mark the same characters on iOS.
//
// Offsets are UTF-16 code units, as JavaScript counts a string, because the
// ranges a search engine returns are counted that way. Case folds one code
// point at a time, each to its upper case lowered in the locale, on both the
// text and each term, and a match in the folded text is read back to whole
// code points of the text. A term is matched unit for unit, never as a pattern
// and never by canonical equivalence, which `String`'s own comparison applies.

import Foundation

/// One stretch of the text: marked when it matches, plain when it does not.
struct PMHighlightRun: Equatable, Sendable {
  let text: String
  let marked: Bool
}

enum PMHighlightRuns {
  /// The text as runs, in reading order, marked where it matches. With
  /// `ranges`, the marks are the ranges; without them, every occurrence of
  /// each term of `query`. Marks that overlap or touch are one mark. An empty
  /// text has no runs, and a text with no match is one plain run.
  static func runs(
    _ text: String, query: PMChoiceValue? = nil, ranges: [(Double, Double)]? = nil,
    locale: String? = nil
  ) -> [PMHighlightRun] {
    let units = Array(text.utf16)
    guard !units.isEmpty else { return [] }
    let found: [(Int, Int)]
    if let ranges {
      found = given(units, ranges)
    } else if let query {
      found = occurrences(units, of: query, locale: locale)
    } else {
      found = []
    }
    var runs: [PMHighlightRun] = []
    var at = 0
    for (start, end) in merged(found) {
      if start > at { runs.append(PMHighlightRun(text: spell(units[at..<start]), marked: false)) }
      runs.append(PMHighlightRun(text: spell(units[start..<end]), marked: true))
      at = end
    }
    if at < units.count {
      runs.append(PMHighlightRun(text: spell(units[at...]), marked: false))
    }
    return runs
  }

  /// Code units back into a string. A run's ends are whole code points, so
  /// nothing is lost.
  private static func spell(_ units: ArraySlice<UInt16>) -> String {
    String(decoding: units, as: UTF16.self)
  }

  /// The text folded one code point at a time, with each folded code unit's
  /// source: the start and the end of the code point it came from. Folding can
  /// change a length (`ß` folds to `ss`), so a match in the folded text is
  /// read back through these.
  private static func folded(
    _ units: [UInt16], locale: Locale
  ) -> (units: [UInt16], start: [Int], end: [Int]) {
    var out: [UInt16] = []
    var start: [Int] = []
    var end: [Int] = []
    var index = 0
    while index < units.count {
      let pair =
        index + 1 < units.count && UTF16.isLeadSurrogate(units[index])
        && UTF16.isTrailSurrogate(units[index + 1])
      let width = pair ? 2 : 1
      let point = fold(String(decoding: units[index..<(index + width)], as: UTF16.self), locale)
      for unit in point.utf16 {
        out.append(unit)
        start.append(index)
        end.append(index + width)
      }
      index += width
    }
    return (out, start, end)
  }

  /// One code point's folded case: its upper case, lowered. The round trip
  /// folds the forms lower case alone keeps apart (Greek's final `ς` and `σ`,
  /// `ß` and `ss`). A locale identifier Foundation cannot read folds as the
  /// root locale does.
  private static func fold(_ point: String, _ locale: Locale) -> String {
    point.uppercased(with: locale).lowercased(with: locale)
  }

  /// The locale that folds case: the one named, or the device's.
  private static func folding(_ identifier: String?) -> Locale {
    identifier.map { Locale(identifier: $0) } ?? .current
  }

  /// Where each term occurs in the text, as ranges of the text.
  private static func occurrences(
    _ units: [UInt16], of query: PMChoiceValue, locale identifier: String?
  ) -> [(Int, Int)] {
    let locale = folding(identifier)
    let words: [String] =
      switch query {
      case .single(let term): [term]
      case .multiple(let terms): terms
      }
    let terms = words.map {
      folded(Array($0.trimmingCharacters(in: .whitespacesAndNewlines).utf16), locale: locale).units
    }.filter { !$0.isEmpty }
    guard !terms.isEmpty else { return [] }
    let haystack = folded(units, locale: locale)
    var found: [(Int, Int)] = []
    for term in terms {
      var at = index(of: term, in: haystack.units, from: 0)
      while let match = at {
        found.append((haystack.start[match], haystack.end[match + term.count - 1]))
        at = index(of: term, in: haystack.units, from: match + term.count)
      }
    }
    return found
  }

  /// The first offset at or after `from` where `needle` occurs in `haystack`,
  /// unit for unit, as JavaScript's `indexOf` finds it.
  private static func index(of needle: [UInt16], in haystack: [UInt16], from: Int) -> Int? {
    guard needle.count <= haystack.count else { return nil }
    var at = from
    while at + needle.count <= haystack.count {
      if haystack[at..<(at + needle.count)].elementsEqual(needle) { return at }
      at += 1
    }
    return nil
  }

  /// The ranges a search engine returned, made safe to draw: ends that are not
  /// whole read as the whole number below them, a range is cut at the text's
  /// ends, an empty, reversed or not-a-number range is dropped, and an end
  /// inside a surrogate pair moves out to the whole code point.
  private static func given(_ units: [UInt16], _ ranges: [(Double, Double)]) -> [(Int, Int)] {
    var found: [(Int, Int)] = []
    for (from, to) in ranges {
      guard !from.isNaN, !to.isNaN else { continue }
      let low = max(0, from.rounded(.down))
      let high = min(Double(units.count), to.rounded(.down))
      guard high > low else { continue }
      var start = Int(low)
      var end = Int(high)
      if start > 0, UTF16.isTrailSurrogate(units[start]), UTF16.isLeadSurrogate(units[start - 1]) {
        start -= 1
      }
      if end < units.count, UTF16.isTrailSurrogate(units[end]),
        UTF16.isLeadSurrogate(units[end - 1])
      {
        end += 1
      }
      found.append((start, end))
    }
    return found
  }

  /// Sorted, with ranges that overlap or touch joined into one.
  private static func merged(_ ranges: [(Int, Int)]) -> [(Int, Int)] {
    let sorted = ranges.sorted { $0.0 != $1.0 ? $0.0 < $1.0 : $0.1 < $1.1 }
    var out: [(Int, Int)] = []
    for range in sorted {
      if let last = out.last, range.0 <= last.1 {
        out[out.count - 1].1 = max(last.1, range.1)
      } else {
        out.append(range)
      }
    }
    return out
  }
}
