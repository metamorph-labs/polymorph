package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Highlight's runs, held to the engine's cases (`packages/engine/highlight.test.ts`):
 * what a query marks and how a search engine's ranges are read, so the same
 * text and the same query mark the same characters on Android as on the web.
 */
class HighlightRunsTest {
    /** The runs as one string, each mark in brackets. */
    private fun spell(
        text: String,
        query: PMChoiceValue? = null,
        ranges: List<Pair<Double, Double>>? = null,
        locale: String? = null,
    ): String = PMHighlightRuns.runs(text, query, ranges, locale).joinToString("") { if (it.marked) "[${it.text}]" else it.text }

    private fun one(term: String) = PMChoiceValue.Single(term)

    private fun several(vararg terms: String) = PMChoiceValue.Multiple(terms.toList())

    @Test
    fun aQueryMarksEveryOccurrenceOfATermAsWritten() {
        assertEquals("[Invoice] 2026, [invoice] 2025", spell("Invoice 2026, invoice 2025", one("invoice")))
    }

    @Test
    fun aQueryIsNeverAPattern() {
        assertEquals("[a.b] and axb", spell("a.b and axb", one("a.b")))
        assertEquals("(x) [[y]]", spell("(x) [y]", one("[y]")))
    }

    @Test
    fun severalTermsAreEachMarkedAndMarksThatOverlapOrTouchJoin() {
        assertEquals("[lodestone] [cloud]", spell("lodestone cloud", several("lode", "stone", "cloud")))
        assertEquals("[abcd]ef", spell("abcdef", several("abc", "bcd")))
    }

    @Test
    fun eachTermIsTrimmedAndAnEmptyOneMarksNothing() {
        assertEquals("pay the [invoice]", spell("pay the invoice", one("  invoice ")))
        assertEquals(listOf(PMHighlightRun("pay the invoice", marked = false)), PMHighlightRuns.runs("pay the invoice", several("", "   ")))
    }

    @Test
    fun caseFoldsInTheLocaleItIsGiven() {
        // In Turkish, `I` folds to the dotless `ı`, so `ı` matches it and `i` does not.
        assertEquals("[ISTANBUL]", spell("ISTANBUL", one("ıstanbul"), locale = "tr"))
        assertEquals("ISTANBUL", spell("ISTANBUL", one("istanbul"), locale = "tr"))
        assertEquals("[ISTANBUL]", spell("ISTANBUL", one("istanbul"), locale = "en"))
        assertEquals("[İSTANBUL] OFİSİ", spell("İSTANBUL OFİSİ", one("istanbul"), locale = "tr"))
    }

    @Test
    fun aMarkCoversWholeCharactersWhenFoldingChangesALength() {
        // `ß` folds to `ss`, and `İ` to `i` and a combining dot, in English.
        assertEquals("[Straße] 4", spell("Straße 4", one("STRASSE")))
        assertEquals("Stra[ß]e 4", spell("Straße 4", one("ss")))
        assertEquals("[İ]zm[i]r", spell("İzmir", one("i"), locale = "en"))
    }

    @Test
    fun theFormsLowerCaseAloneKeepsApartFold() {
        // Greek's final sigma `ς` and `σ` are one letter.
        assertEquals("[ΟΔΟΣ]", spell("ΟΔΟΣ", one("οδος")))
        assertEquals("[οδος]", spell("οδος", one("ΟΔΟΣ")))
    }

    @Test
    fun aLocaleThePlatformCannotReadFoldsAsTheRootLocale() {
        assertEquals("[Inv]oice", spell("Invoice", one("INV"), locale = "not a locale"))
    }

    @Test
    fun aTextWithNoMatchIsOnePlainRun() {
        assertEquals(listOf(PMHighlightRun("nothing here", marked = false)), PMHighlightRuns.runs("nothing here", one("invoice")))
        assertEquals(listOf(PMHighlightRun("nothing here", marked = false)), PMHighlightRuns.runs("nothing here"))
    }

    @Test
    fun anEmptyTextHasNoRuns() {
        assertEquals(emptyList(), PMHighlightRuns.runs("", one("x")))
    }

    @Test
    fun rangesAreMarkedEndExclusive() {
        assertEquals("pay the [invoice]", spell("pay the invoice", ranges = listOf(8.0 to 15.0)))
    }

    @Test
    fun rangesTakeThePlaceOfAQuery() {
        assertEquals("[running] runner", spell("running runner", one("runner"), listOf(0.0 to 7.0)))
        // An empty list of ranges is an engine saying nothing matched.
        assertEquals("running runner", spell("running runner", one("runner"), emptyList()))
    }

    @Test
    fun rangesThatOverlapOrTouchJoinInAnyOrder() {
        assertEquals("[abcde]f[ghi]j", spell("abcdefghij", ranges = listOf(6.0 to 8.0, 0.0 to 3.0, 2.0 to 5.0, 8.0 to 9.0)))
    }

    @Test
    fun aRangeIsCutAtTheTextsEndsAndOneEmptyReversedOrNotANumberIsDropped() {
        assertEquals("[a]b[c]", spell("abc", ranges = listOf(-4.0 to 1.0, 2.0 to 99.0)))
        assertEquals("abc", spell("abc", ranges = listOf(1.0 to 1.0, 2.0 to 1.0, Double.NaN to 2.0, 5.0 to 9.0)))
        assertEquals("a[bc]", spell("abc", ranges = listOf(1.0 to Double.POSITIVE_INFINITY)))
    }

    @Test
    fun anEndThatIsNotWholeReadsAsTheWholeNumberBelowIt() {
        assertEquals("a[bc]def", spell("abcdef", ranges = listOf(1.9 to 3.2)))
    }

    @Test
    fun aRangeNeverSplitsACharacterThatTakesTwoCodeUnits() {
        // `𝔸` is one code point and two code units, at offsets 1 and 2.
        assertEquals("a[𝔸]b", spell("a𝔸b", ranges = listOf(2.0 to 3.0)))
        assertEquals("[a𝔸]b", spell("a𝔸b", ranges = listOf(0.0 to 2.0)))
    }
}
