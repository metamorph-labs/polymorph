import XCTest

@testable import PolymorphUI

/// Highlight's runs, held to the engine's cases (`packages/engine/highlight.test.ts`):
/// what a query marks and how a search engine's ranges are read, so the same
/// text and the same query mark the same characters on iOS as on the web.
final class HighlightRunsTests: XCTestCase {
  /// The runs as one string, each mark in brackets.
  private func spell(
    _ text: String, query: PMChoiceValue? = nil, ranges: [(Double, Double)]? = nil,
    locale: String? = nil
  ) -> String {
    PMHighlightRuns.runs(text, query: query, ranges: ranges, locale: locale)
      .map { $0.marked ? "[\($0.text)]" : $0.text }
      .joined()
  }

  func testAQueryMarksEveryOccurrenceOfATermAsWritten() {
    XCTAssertEqual(
      spell("Invoice 2026, invoice 2025", query: .single("invoice")),
      "[Invoice] 2026, [invoice] 2025")
  }

  func testAQueryIsNeverAPattern() {
    XCTAssertEqual(spell("a.b and axb", query: .single("a.b")), "[a.b] and axb")
    XCTAssertEqual(spell("(x) [y]", query: .single("[y]")), "(x) [[y]]")
  }

  func testSeveralTermsAreEachMarkedAndMarksThatOverlapOrTouchJoin() {
    XCTAssertEqual(
      spell("lodestone cloud", query: .multiple(["lode", "stone", "cloud"])),
      "[lodestone] [cloud]")
    XCTAssertEqual(spell("abcdef", query: .multiple(["abc", "bcd"])), "[abcd]ef")
  }

  func testEachTermIsTrimmedAndAnEmptyOneMarksNothing() {
    XCTAssertEqual(spell("pay the invoice", query: .single("  invoice ")), "pay the [invoice]")
    XCTAssertEqual(
      PMHighlightRuns.runs("pay the invoice", query: .multiple(["", "   "])),
      [PMHighlightRun(text: "pay the invoice", marked: false)])
  }

  func testCaseFoldsInTheLocaleItIsGiven() {
    // In Turkish, `I` folds to the dotless `ı`, so `ı` matches it and `i` does not.
    XCTAssertEqual(spell("ISTANBUL", query: .single("ıstanbul"), locale: "tr"), "[ISTANBUL]")
    XCTAssertEqual(spell("ISTANBUL", query: .single("istanbul"), locale: "tr"), "ISTANBUL")
    XCTAssertEqual(spell("ISTANBUL", query: .single("istanbul"), locale: "en"), "[ISTANBUL]")
    XCTAssertEqual(
      spell("İSTANBUL OFİSİ", query: .single("istanbul"), locale: "tr"), "[İSTANBUL] OFİSİ")
  }

  func testAMarkCoversWholeCharactersWhenFoldingChangesALength() {
    // `ß` folds to `ss`, and `İ` to `i` and a combining dot, in English.
    XCTAssertEqual(spell("Straße 4", query: .single("STRASSE")), "[Straße] 4")
    XCTAssertEqual(spell("Straße 4", query: .single("ss")), "Stra[ß]e 4")
    XCTAssertEqual(spell("İzmir", query: .single("i"), locale: "en"), "[İ]zm[i]r")
  }

  func testTheFormsLowerCaseAloneKeepsApartFold() {
    // Greek's final sigma `ς` and `σ` are one letter.
    XCTAssertEqual(spell("ΟΔΟΣ", query: .single("οδος")), "[ΟΔΟΣ]")
    XCTAssertEqual(spell("οδος", query: .single("ΟΔΟΣ")), "[οδος]")
  }

  func testALocaleFoundationCannotReadFoldsAsTheRootLocale() {
    XCTAssertEqual(spell("Invoice", query: .single("INV"), locale: "not a locale"), "[Inv]oice")
  }

  func testATextWithNoMatchIsOnePlainRun() {
    XCTAssertEqual(
      PMHighlightRuns.runs("nothing here", query: .single("invoice")),
      [PMHighlightRun(text: "nothing here", marked: false)])
    XCTAssertEqual(
      PMHighlightRuns.runs("nothing here"), [PMHighlightRun(text: "nothing here", marked: false)])
  }

  func testAnEmptyTextHasNoRuns() {
    XCTAssertEqual(PMHighlightRuns.runs("", query: .single("x")), [])
  }

  func testRangesAreMarkedEndExclusive() {
    XCTAssertEqual(spell("pay the invoice", ranges: [(8, 15)]), "pay the [invoice]")
  }

  func testRangesTakeThePlaceOfAQuery() {
    XCTAssertEqual(
      spell("running runner", query: .single("runner"), ranges: [(0, 7)]), "[running] runner")
    // An empty list of ranges is an engine saying nothing matched.
    XCTAssertEqual(spell("running runner", query: .single("runner"), ranges: []), "running runner")
  }

  func testRangesThatOverlapOrTouchJoinInAnyOrder() {
    XCTAssertEqual(
      spell("abcdefghij", ranges: [(6, 8), (0, 3), (2, 5), (8, 9)]), "[abcde]f[ghi]j")
  }

  func testARangeIsCutAtTheTextsEndsAndOneEmptyReversedOrNotANumberIsDropped() {
    XCTAssertEqual(spell("abc", ranges: [(-4, 1), (2, 99)]), "[a]b[c]")
    XCTAssertEqual(spell("abc", ranges: [(1, 1), (2, 1), (.nan, 2), (5, 9)]), "abc")
    XCTAssertEqual(spell("abc", ranges: [(1, .infinity)]), "a[bc]")
  }

  func testAnEndThatIsNotWholeReadsAsTheWholeNumberBelowIt() {
    XCTAssertEqual(spell("abcdef", ranges: [(1.9, 3.2)]), "a[bc]def")
  }

  func testARangeNeverSplitsACharacterThatTakesTwoCodeUnits() {
    // `𝔸` is one code point and two code units, at offsets 1 and 2.
    XCTAssertEqual(spell("a𝔸b", ranges: [(2, 3)]), "a[𝔸]b")
    XCTAssertEqual(spell("a𝔸b", ranges: [(0, 2)]), "[a𝔸]b")
  }
}
