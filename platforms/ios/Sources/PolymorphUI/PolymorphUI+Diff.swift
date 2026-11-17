// Diff's rows (`design/components/diff.md`): two texts compared line by line,
// as data, and the runs the lines form draws them in. On the web the engine's
// `diffLines` and `diffRuns` decide them; this is the same comparison, held to
// the engine's own cases (`Tests/PolymorphUITests/LineDiffTests.swift`), so the
// same two texts give the same rows on iOS. `CollectionDifference` is not used:
// it does not write a change's removed lines before its added ones, and it
// breaks ties between equally long matches its own way, so its hunks differ
// from the engine's.
//
// Lines are compared as JavaScript compares strings, code unit for code unit,
// not by `String`'s canonical equivalence, so two lines that differ only in
// their Unicode form are a change here as they are on the web.

import SwiftUI

extension PMSpecDefault {
  /// Diff's `context` (`diff.md`): the unchanged lines kept beside each change.
  static let diffContext: Double = 3
}

/// The glyphs Diff draws: the marks a reader sees, which say nothing to
/// VoiceOver because the member's label says it in words, and the invisible
/// characters that set the inline form's direction.
enum PMDiffGlyphs {
  /// An added line's marker, and the sign before an added value.
  static let added = "+"
  /// A removed line's marker: the minus sign, not a hyphen.
  static let removed = "−"
  /// An unchanged line's marker: a space, so the cell is one line tall.
  static let blank = " "

  /// The arrow between an old value and a new one. It has no mirrored form of
  /// its own, so a right-to-left line draws the arrow that points left, as the
  /// web mirrors it.
  static func arrow(_ direction: LayoutDirection) -> String {
    direction == .rightToLeft ? "←" : "→"
  }

  /// The mark that sets a line's direction to the layout's: the right-to-left
  /// or the left-to-right mark, neither drawn. The values around it are
  /// isolates, which do not set it.
  static func direction(_ direction: LayoutDirection) -> String {
    direction == .rightToLeft ? "\u{200F}" : "\u{200E}"
  }

  /// A value as a bidi isolate, the web's `unicode-bidi: isolate`: its own
  /// direction inside, and no effect on the order of what is around it.
  static func isolated(_ value: String) -> String {
    "\u{2068}" + value + "\u{2069}"
  }

  /// An empty run `width` wide, the margin the recipe sets beside the arrow and
  /// after the sign, which a run of text cannot carry.
  static func gap(_ width: CGFloat) -> Text {
    Text(
      Image(size: CGSize(width: width, height: width), label: nil, opaque: false) { _ in })
  }
}

/// What a line is to the comparison: in both texts, only in the new one, or only in the old one.
enum PMDiffRowKind: String, Sendable {
  case same
  case added
  case removed
}

/// One line of the comparison.
struct PMDiffRow: Equatable, Sendable {
  let kind: PMDiffRowKind
  /// The line, without its line ending.
  let text: String
  /// Its place in the old text, from 1. An added line has none.
  let beforeLine: Int?
  /// Its place in the new text, from 1. A removed line has none.
  let afterLine: Int?
}

/// A stretch of consecutive rows, drawn as they are or, when `collapsed`, as
/// one row that says how many unchanged lines it holds.
struct PMDiffRun: Equatable, Sendable {
  /// The index of the run's first row among all rows, which no other run shares.
  let key: Int
  let collapsed: Bool
  var rows: [PMDiffRow]
}

enum PMLineDiff {
  /// The most cells the comparison fills, the engine's `DIFF_LINES_LIMIT`: the
  /// old text's line count times the new text's, counted between the lines the
  /// two texts start and end with in common. Past it the comparison is not
  /// computed, so no input holds the screen.
  static let limit = 1_000_000

  /// A text's lines. `\r\n` reads as `\n`. A final line ending closes the last
  /// line and starts no empty one. A missing or empty text has no lines.
  static func lines(_ text: String?) -> [String] {
    guard let text, !text.isEmpty else { return [] }
    var lines = text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
    if lines.last?.isEmpty == true { lines.removeLast() }
    return lines
  }

  /// The line diff of `before` against `after`: every line of both texts, in
  /// reading order, as unchanged, added or removed. Within one change the
  /// removed lines come before the added ones. The lines the texts start and
  /// end with in common are unchanged without a comparison; the lines between
  /// are compared by their longest common subsequence, unless that would fill
  /// more than `limit` cells, when every old line between is removed and every
  /// new line between is added.
  static func rows(_ before: String?, _ after: String?) -> [PMDiffRow] {
    let old = lines(before)
    let next = lines(after)
    // Each distinct line as a number, by its code units, so a comparison is one
    // integer test and never `String`'s canonical equivalence.
    var ids: [[UInt16]: Int] = [:]
    let id = { (line: String) -> Int in
      let units = Array(line.utf16)
      if let known = ids[units] { return known }
      ids[units] = ids.count
      return ids.count - 1
    }
    let a = old.map(id)
    let b = next.map(id)

    var start = 0
    while start < a.count, start < b.count, a[start] == b[start] { start += 1 }
    var oldEnd = a.count
    var nextEnd = b.count
    while oldEnd > start, nextEnd > start, a[oldEnd - 1] == b[nextEnd - 1] {
      oldEnd -= 1
      nextEnd -= 1
    }

    var rows: [PMDiffRow] = []
    rows.reserveCapacity(old.count + next.count)
    let same = { (i: Int, j: Int) in
      rows.append(PMDiffRow(kind: .same, text: old[i], beforeLine: i + 1, afterLine: j + 1))
    }
    let removed = { (i: Int) in
      rows.append(PMDiffRow(kind: .removed, text: old[i], beforeLine: i + 1, afterLine: nil))
    }
    let added = { (j: Int) in
      rows.append(PMDiffRow(kind: .added, text: next[j], beforeLine: nil, afterLine: j + 1))
    }

    for i in 0..<start { same(i, i) }

    let height = oldEnd - start
    let width = nextEnd - start
    if height == 0 || width == 0 || height * width > limit {
      for i in start..<oldEnd { removed(i) }
      for j in start..<nextEnd { added(j) }
    } else {
      // `lengths[i * row + j]` is the longest common subsequence of the old
      // lines from `start + i` and the new lines from `start + j`.
      let row = width + 1
      var lengths = [Int32](repeating: 0, count: (height + 1) * row)
      for i in (0..<height).reversed() {
        for j in (0..<width).reversed() {
          lengths[i * row + j] =
            a[start + i] == b[start + j]
            ? lengths[(i + 1) * row + j + 1] + 1
            : max(lengths[(i + 1) * row + j], lengths[i * row + j + 1])
        }
      }

      // One change's added lines wait until its removed lines are written.
      var pending: [Int] = []
      let flush = {
        for j in pending { added(j) }
        pending = []
      }
      var i = 0
      var j = 0
      while i < height || j < width {
        if i < height, j < width, a[start + i] == b[start + j] {
          flush()
          same(start + i, start + j)
          i += 1
          j += 1
        } else if j == width
          || (i < height && lengths[(i + 1) * row + j] >= lengths[i * row + j + 1])
        {
          removed(start + i)
          i += 1
        } else {
          pending.append(start + j)
          j += 1
        }
      }
      flush()
    }

    var j = nextEnd
    for i in oldEnd..<old.count {
      same(i, j)
      j += 1
    }
    return rows
  }

  /// The rows in the runs the lines form draws. `context` unchanged lines stay
  /// beside each change, and the unchanged lines past them are one collapsed
  /// run: more than `2 × context` between two changes, or more than `context`
  /// before the first change or after the last. A stretch that would hide one
  /// line is drawn instead. A context that is not a count reads as the count
  /// below it, and never below none; infinity collapses nothing. A text with
  /// no change is one collapsed run.
  static func runs(_ rows: [PMDiffRow], context: Double = 3) -> [PMDiffRun] {
    let keep: Int =
      context.isNaN || context <= 0
      ? 0 : context >= Double(rows.count) ? rows.count : Int(context.rounded(.down))
    var runs: [PMDiffRun] = []
    // The index in `runs` of the drawn run rows are being added to.
    var open: Int?
    let draw = { (from: Int, to: Int) in
      guard to > from else { return }
      if open == nil {
        runs.append(PMDiffRun(key: from, collapsed: false, rows: []))
        open = runs.count - 1
      }
      if let open { runs[open].rows.append(contentsOf: rows[from..<to]) }
    }

    var at = 0
    while at < rows.count {
      if rows[at].kind != .same {
        draw(at, at + 1)
        at += 1
        continue
      }
      var end = at
      while end < rows.count, rows[end].kind == .same { end += 1 }
      let head = at > 0 ? min(keep, end - at) : 0
      let tail = end < rows.count ? min(keep, end - at - head) : 0
      if end - at - head - tail < 2 {
        draw(at, end)
      } else {
        draw(at, at + head)
        runs.append(
          PMDiffRun(key: at + head, collapsed: true, rows: Array(rows[(at + head)..<(end - tail)])))
        open = nil
        draw(end - tail, end)
      }
      at = end
    }
    return runs
  }
}
