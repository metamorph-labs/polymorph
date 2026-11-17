import XCTest

@testable import PolymorphUI

/// Diff's rows and runs, held to the engine's cases (`packages/engine/diff.test.ts`):
/// which lines a comparison calls unchanged, added and removed, and which
/// unchanged lines the lines form draws closed, so the same two texts give the
/// same rows on iOS as on the web.
final class LineDiffTests: XCTestCase {
  /// A row as one string: its mark, its line numbers and its text.
  private func spell(_ row: PMDiffRow) -> String {
    let mark = row.kind == .added ? "+" : row.kind == .removed ? "-" : " "
    return "\(mark)\(row.beforeLine.map(String.init) ?? "·")/\(row.afterLine.map(String.init) ?? "·") \(row.text)"
  }

  private func diff(_ before: String?, _ after: String?) -> [String] {
    PMLineDiff.rows(before, after).map(spell)
  }

  /// The old text and the new text, rebuilt from the rows.
  private func sides(_ rows: [PMDiffRow]) -> (before: [String], after: [String]) {
    (
      rows.filter { $0.kind != .added }.map(\.text),
      rows.filter { $0.kind != .removed }.map(\.text)
    )
  }

  func testNoRowsWhenNeitherSideHasALine() {
    XCTAssertEqual(PMLineDiff.rows(nil, nil), [])
    XCTAssertEqual(PMLineDiff.rows(nil, ""), [])
    XCTAssertEqual(PMLineDiff.rows("", ""), [])
  }

  func testEqualSidesAreUnchangedLinesNumberedOnBothSides() {
    XCTAssertEqual(diff("a\nb", "a\nb"), [" 1/1 a", " 2/2 b"])
  }

  func testAMissingOrEmptyOldSideIsEveryLineAdded() {
    XCTAssertEqual(diff(nil, "a\nb"), ["+·/1 a", "+·/2 b"])
    XCTAssertEqual(diff("", "a"), ["+·/1 a"])
  }

  func testAMissingOrEmptyNewSideIsEveryLineRemoved() {
    XCTAssertEqual(diff("a\nb", nil), ["-1/· a", "-2/· b"])
    XCTAssertEqual(diff("a", ""), ["-1/· a"])
  }

  func testAChangeInTheMiddleWritesTheRemovedLineBeforeTheAddedOne() {
    XCTAssertEqual(diff("a\nb\nc", "a\nB\nc"), [" 1/1 a", "-2/· b", "+·/2 B", " 3/3 c"])
  }

  func testALineAddedAndALineRemovedRenumberTheRest() {
    XCTAssertEqual(diff("a\nc", "a\nb\nc"), [" 1/1 a", "+·/2 b", " 2/3 c"])
    XCTAssertEqual(diff("a\nb\nc", "a\nc"), [" 1/1 a", "-2/· b", " 3/2 c"])
  }

  func testTheRemovedLinesOfOneChangeComeBeforeItsAddedLines() {
    XCTAssertEqual(
      diff("a\nb\nc\nz", "x\ny\nz"),
      ["-1/· a", "-2/· b", "-3/· c", "+·/1 x", "+·/2 y", " 4/3 z"])
    // A change the comparison walks as removed, added, removed is still written in that order.
    XCTAssertEqual(
      diff("k\na\nb\nm\nn", "k\nb\nc\nd\nn").filter { !$0.hasPrefix(" ") },
      ["-2/· a", "-4/· m", "+·/3 c", "+·/4 d"])
  }

  func testAFinalLineEndingEndsTheLastLineAndStartsNoEmptyOne() {
    XCTAssertEqual(diff("a\nb", "a\nb\n"), [" 1/1 a", " 2/2 b"])
    XCTAssertEqual(diff("a\n", "a"), [" 1/1 a"])
    // A second line ending is an empty line.
    XCTAssertEqual(diff("a\n", "a\n\n"), [" 1/1 a", "+·/2 "])
    XCTAssertEqual(diff("\n", nil), ["-1/· "])
  }

  func testCarriageReturnAndLineFeedReadsAsALineFeed() {
    XCTAssertEqual(diff("a\r\nb\r\n", "a\nb"), [" 1/1 a", " 2/2 b"])
    XCTAssertEqual(diff("a\r\nb", "a\r\nc"), [" 1/1 a", "-2/· b", "+·/2 c"])
  }

  func testTheMostLinesAreKeptAmongRepeatedOnes() {
    let rows = PMLineDiff.rows("}\n}\n}", "}\n}")
    XCTAssertEqual(rows.filter { $0.kind == .same }.count, 2)
    XCTAssertEqual(rows.filter { $0.kind == .removed }.count, 1)

    let braces = PMLineDiff.rows("{\n  a\n}\n{\n  b\n}", "{\n  a\n}\n{\n  c\n}\n{\n  b\n}")
    XCTAssertEqual(braces.filter { $0.kind == .removed }.count, 0)
    XCTAssertEqual(braces.filter { $0.kind == .added }.count, 3)
    XCTAssertEqual(sides(braces).after.joined(separator: "\n"), "{\n  a\n}\n{\n  c\n}\n{\n  b\n}")
  }

  func testTheRowsRebuildBothTextsInOrder() {
    let before = "one\ntwo\nthree\nfour\nfive\nsix"
    let after = "zero\none\nthree\nfour\n4.5\nsix\nseven"
    let rows = PMLineDiff.rows(before, after)
    XCTAssertEqual(sides(rows).before.joined(separator: "\n"), before)
    XCTAssertEqual(sides(rows).after.joined(separator: "\n"), after)
    XCTAssertEqual(rows.filter { $0.kind == .same }.map(\.text), ["one", "three", "four", "six"])
  }

  func testTheSameTextsGiveTheSameRows() {
    XCTAssertEqual(
      PMLineDiff.rows("a\nb\na\nb\na", "b\na\nb\na\nb"),
      PMLineDiff.rows("a\nb\na\nb\na", "b\na\nb\na\nb"))
  }

  func testLinesThatDifferOnlyInTheirUnicodeFormAreAChange() {
    // `é` as one code point and as `e` with a combining accent: one line to
    // `String`'s equality, two to JavaScript's.
    XCTAssertEqual(diff("caf\u{E9}", "cafe\u{301}"), ["-1/· caf\u{E9}", "+·/1 cafe\u{301}"])
  }

  func testPastTheLimitEveryOldLineBetweenIsRemovedAndEveryNewOneAdded() {
    let side = Int(Double(PMLineDiff.limit).squareRoot().rounded(.up)) + 1
    // Every other line between is shared, so a comparison would keep them.
    let between = { (name: String) in
      (0..<side).map { $0 % 2 == 1 && $0 < side - 1 ? "shared" : "\(name) \($0)" }
    }
    let old = between("old")
    let next = between("new")
    let rows = PMLineDiff.rows(
      (["first"] + old + ["last"]).joined(separator: "\n"),
      (["first"] + next + ["last"]).joined(separator: "\n"))

    XCTAssertEqual(spell(rows[0]), " 1/1 first")
    XCTAssertEqual(spell(rows[rows.count - 1]), " \(side + 2)/\(side + 2) last")
    let changed = Array(rows[1..<(rows.count - 1)])
    XCTAssertEqual(changed.count, 2 * side)
    XCTAssertTrue(changed.prefix(side).allSatisfy { $0.kind == .removed })
    XCTAssertTrue(changed.suffix(side).allSatisfy { $0.kind == .added })
    XCTAssertEqual(sides(rows).before, ["first"] + old + ["last"])
    XCTAssertEqual(sides(rows).after, ["first"] + next + ["last"])
  }

  func testTwoTextsAtTheLimitAreCompared() {
    let side = Int(Double(PMLineDiff.limit).squareRoot().rounded(.down))
    let old = (0..<side).map { $0 % 2 == 0 ? "shared" : "old \($0)" }
    let next = (0..<side).map { $0 % 2 == 1 ? "shared" : "new \($0)" }
    let rows = PMLineDiff.rows(old.joined(separator: "\n"), next.joined(separator: "\n"))
    XCTAssertGreaterThan(rows.filter { $0.kind == .same }.count, side / 2 - 2)
  }

  /// The runs as strings: a drawn run's row marks, or a collapsed run's count.
  private func shape(_ runs: [PMDiffRun]) -> [String] {
    runs.map { run in
      run.collapsed
        ? "(\(run.rows.count))"
        : run.rows.map { $0.kind == .same ? "=" : $0.kind == .added ? "+" : "-" }.joined()
    }
  }

  /// `count` unchanged lines named by `name`.
  private func lines(_ name: String, _ count: Int) -> [String] {
    (0..<count).map { "\(name) \($0)" }
  }

  private var sample: [PMDiffRow] {
    PMLineDiff.rows(
      (lines("head", 10) + ["old"] + lines("middle", 10) + ["gone"] + lines("tail", 10))
        .joined(separator: "\n"),
      (lines("head", 10) + ["new"] + lines("middle", 10) + lines("tail", 10))
        .joined(separator: "\n"))
  }

  func testThreeUnchangedLinesStayBesideEachChangeAndTheRestCollapse() {
    XCTAssertEqual(shape(PMLineDiff.runs(sample)), ["(7)", "===-+===", "(4)", "===-===", "(7)"])
  }

  func testEveryRunHasItsFirstRowsIndexAndEveryRowOneRun() {
    let runs = PMLineDiff.runs(sample)
    XCTAssertEqual(runs.map(\.key), [0, 7, 15, 19, 26])
    XCTAssertEqual(runs.flatMap(\.rows), sample)
    XCTAssertTrue(
      runs.filter(\.collapsed).allSatisfy { $0.rows.allSatisfy { $0.kind == .same } })
  }

  func testAStretchBetweenTwoChangesThatContextCoversIsDrawn() {
    XCTAssertEqual(
      shape(PMLineDiff.runs(sample, context: 5)), ["(5)", "=====-+==========-=====", "(5)"])
  }

  func testAStretchThatWouldHideOneLineIsDrawn() {
    let near = PMLineDiff.rows(
      (["a"] + lines("same", 7) + ["b"]).joined(separator: "\n"),
      (["A"] + lines("same", 7) + ["B"]).joined(separator: "\n"))
    XCTAssertEqual(shape(PMLineDiff.runs(near)), ["-+=======-+"])
    let far = PMLineDiff.rows(
      (["a"] + lines("same", 8) + ["b"]).joined(separator: "\n"),
      (["A"] + lines("same", 8) + ["B"]).joined(separator: "\n"))
    XCTAssertEqual(shape(PMLineDiff.runs(far)), ["-+===", "(2)", "===-+"])
  }

  func testNoContextCollapsesEveryUnchangedLine() {
    XCTAssertEqual(shape(PMLineDiff.runs(sample, context: 0)), ["(10)", "-+", "(10)", "-", "(10)"])
  }

  func testInfiniteContextCollapsesNothing() {
    let runs = PMLineDiff.runs(sample, context: .infinity)
    XCTAssertEqual(runs.count, 1)
    XCTAssertEqual(runs.first?.collapsed, false)
    XCTAssertEqual(runs.first?.rows, sample)
  }

  func testAContextThatIsNotACountReadsAsTheCountBelowItAndNeverBelowNone() {
    XCTAssertEqual(shape(PMLineDiff.runs(sample, context: 3.9)), shape(PMLineDiff.runs(sample)))
    XCTAssertEqual(
      shape(PMLineDiff.runs(sample, context: -2)), shape(PMLineDiff.runs(sample, context: 0)))
    XCTAssertEqual(
      shape(PMLineDiff.runs(sample, context: .nan)), shape(PMLineDiff.runs(sample, context: 0)))
  }

  func testATextWithNoChangeIsOneCollapsedRun() {
    XCTAssertEqual(shape(PMLineDiff.runs(PMLineDiff.rows("a\nb\nc", "a\nb\nc"))), ["(3)"])
    XCTAssertEqual(shape(PMLineDiff.runs(PMLineDiff.rows("a", "a"))), ["="])
  }

  func testATextWhoseEveryLineChangedIsOneRun() {
    XCTAssertEqual(shape(PMLineDiff.runs(PMLineDiff.rows("a\nb", "c\nd"))), ["--++"])
  }

  func testNoRowsHaveNoRuns() {
    XCTAssertEqual(PMLineDiff.runs([]), [])
  }
}
