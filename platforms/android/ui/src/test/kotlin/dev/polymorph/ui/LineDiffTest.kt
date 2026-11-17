package dev.polymorph.ui

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Diff's rows and runs, held to the engine's cases (`packages/engine/diff.test.ts`):
 * which lines a comparison calls unchanged, added and removed, and which
 * unchanged lines the lines form draws closed, so the same two texts give the
 * same rows on Android as on the web.
 */
class LineDiffTest {
    /** A row as one string: its mark, its line numbers and its text. */
    private fun spell(row: PMDiffRow): String {
        val mark = when (row.kind) {
            PMDiffRowKind.Added -> "+"
            PMDiffRowKind.Removed -> "-"
            PMDiffRowKind.Same -> " "
        }
        return "$mark${row.beforeLine ?: "·"}/${row.afterLine ?: "·"} ${row.text}"
    }

    private fun diff(before: String?, after: String?): List<String> = PMLineDiff.rows(before, after).map(::spell)

    /** The old text and the new text, rebuilt from the rows. */
    private fun sides(rows: List<PMDiffRow>) =
        rows.filter { it.kind != PMDiffRowKind.Added }.map { it.text } to rows.filter { it.kind != PMDiffRowKind.Removed }.map { it.text }

    @Test
    fun noRowsWhenNeitherSideHasALine() {
        assertEquals(emptyList(), PMLineDiff.rows(null, null))
        assertEquals(emptyList(), PMLineDiff.rows(null, ""))
        assertEquals(emptyList(), PMLineDiff.rows("", ""))
    }

    @Test
    fun equalSidesAreUnchangedLinesNumberedOnBothSides() {
        assertEquals(listOf(" 1/1 a", " 2/2 b"), diff("a\nb", "a\nb"))
    }

    @Test
    fun aMissingOrEmptyOldSideIsEveryLineAdded() {
        assertEquals(listOf("+·/1 a", "+·/2 b"), diff(null, "a\nb"))
        assertEquals(listOf("+·/1 a"), diff("", "a"))
    }

    @Test
    fun aMissingOrEmptyNewSideIsEveryLineRemoved() {
        assertEquals(listOf("-1/· a", "-2/· b"), diff("a\nb", null))
        assertEquals(listOf("-1/· a"), diff("a", ""))
    }

    @Test
    fun aChangeInTheMiddleWritesTheRemovedLineBeforeTheAddedOne() {
        assertEquals(listOf(" 1/1 a", "-2/· b", "+·/2 B", " 3/3 c"), diff("a\nb\nc", "a\nB\nc"))
    }

    @Test
    fun aLineAddedAndALineRemovedRenumberTheRest() {
        assertEquals(listOf(" 1/1 a", "+·/2 b", " 2/3 c"), diff("a\nc", "a\nb\nc"))
        assertEquals(listOf(" 1/1 a", "-2/· b", " 3/2 c"), diff("a\nb\nc", "a\nc"))
    }

    @Test
    fun theRemovedLinesOfOneChangeComeBeforeItsAddedLines() {
        assertEquals(listOf("-1/· a", "-2/· b", "-3/· c", "+·/1 x", "+·/2 y", " 4/3 z"), diff("a\nb\nc\nz", "x\ny\nz"))
        // A change the comparison walks as removed, added, removed is still written in that order.
        assertEquals(
            listOf("-2/· a", "-4/· m", "+·/3 c", "+·/4 d"),
            diff("k\na\nb\nm\nn", "k\nb\nc\nd\nn").filter { !it.startsWith(" ") },
        )
    }

    @Test
    fun aFinalLineEndingEndsTheLastLineAndStartsNoEmptyOne() {
        assertEquals(listOf(" 1/1 a", " 2/2 b"), diff("a\nb", "a\nb\n"))
        assertEquals(listOf(" 1/1 a"), diff("a\n", "a"))
        // A second line ending is an empty line.
        assertEquals(listOf(" 1/1 a", "+·/2 "), diff("a\n", "a\n\n"))
        assertEquals(listOf("-1/· "), diff("\n", null))
    }

    @Test
    fun carriageReturnAndLineFeedReadsAsALineFeed() {
        assertEquals(listOf(" 1/1 a", " 2/2 b"), diff("a\r\nb\r\n", "a\nb"))
        assertEquals(listOf(" 1/1 a", "-2/· b", "+·/2 c"), diff("a\r\nb", "a\r\nc"))
    }

    @Test
    fun theMostLinesAreKeptAmongRepeatedOnes() {
        val rows = PMLineDiff.rows("}\n}\n}", "}\n}")
        assertEquals(2, rows.count { it.kind == PMDiffRowKind.Same })
        assertEquals(1, rows.count { it.kind == PMDiffRowKind.Removed })

        val braces = PMLineDiff.rows("{\n  a\n}\n{\n  b\n}", "{\n  a\n}\n{\n  c\n}\n{\n  b\n}")
        assertEquals(0, braces.count { it.kind == PMDiffRowKind.Removed })
        assertEquals(3, braces.count { it.kind == PMDiffRowKind.Added })
        assertEquals("{\n  a\n}\n{\n  c\n}\n{\n  b\n}", sides(braces).second.joinToString("\n"))
    }

    @Test
    fun theRowsRebuildBothTextsInOrder() {
        val before = "one\ntwo\nthree\nfour\nfive\nsix"
        val after = "zero\none\nthree\nfour\n4.5\nsix\nseven"
        val rows = PMLineDiff.rows(before, after)
        assertEquals(before, sides(rows).first.joinToString("\n"))
        assertEquals(after, sides(rows).second.joinToString("\n"))
        assertEquals(listOf("one", "three", "four", "six"), rows.filter { it.kind == PMDiffRowKind.Same }.map { it.text })
    }

    @Test
    fun theSameTextsGiveTheSameRows() {
        assertEquals(PMLineDiff.rows("a\nb\na\nb\na", "b\na\nb\na\nb"), PMLineDiff.rows("a\nb\na\nb\na", "b\na\nb\na\nb"))
    }

    @Test
    fun linesThatDifferOnlyInTheirUnicodeFormAreAChange() {
        // `é` as one code point and as `e` with a combining accent: two lines to JavaScript's equality.
        assertEquals(listOf("-1/· café", "+·/1 café"), diff("café", "café"))
    }

    @Test
    fun pastTheLimitEveryOldLineBetweenIsRemovedAndEveryNewOneAdded() {
        val side = ceil(sqrt(PMLineDiff.LIMIT.toDouble())).toInt() + 1
        // Every other line between is shared, so a comparison would keep them.
        fun between(name: String) = List(side) { if (it % 2 == 1 && it < side - 1) "shared" else "$name $it" }
        val old = between("old")
        val next = between("new")
        val rows = PMLineDiff.rows(
            (listOf("first") + old + "last").joinToString("\n"),
            (listOf("first") + next + "last").joinToString("\n"),
        )
        assertEquals(" 1/1 first", spell(rows.first()))
        assertEquals(" ${side + 2}/${side + 2} last", spell(rows.last()))
        val changed = rows.subList(1, rows.size - 1)
        assertEquals(2 * side, changed.size)
        assertTrue(changed.take(side).all { it.kind == PMDiffRowKind.Removed })
        assertTrue(changed.drop(side).all { it.kind == PMDiffRowKind.Added })
        assertEquals(listOf("first") + old + "last", sides(rows).first)
        assertEquals(listOf("first") + next + "last", sides(rows).second)
    }

    @Test
    fun twoTextsAtTheLimitAreCompared() {
        val side = floor(sqrt(PMLineDiff.LIMIT.toDouble())).toInt()
        val old = List(side) { if (it % 2 == 0) "shared" else "old $it" }
        val next = List(side) { if (it % 2 == 1) "shared" else "new $it" }
        val rows = PMLineDiff.rows(old.joinToString("\n"), next.joinToString("\n"))
        assertTrue(rows.count { it.kind == PMDiffRowKind.Same } > side / 2 - 2)
    }

    /** The runs as strings: a drawn run's row marks, or a collapsed run's count. */
    private fun shape(runs: List<PMDiffRun>): List<String> = runs.map { run ->
        if (run.collapsed) {
            "(${run.rows.size})"
        } else {
            run.rows.joinToString("") {
                when (it.kind) {
                    PMDiffRowKind.Same -> "="
                    PMDiffRowKind.Added -> "+"
                    PMDiffRowKind.Removed -> "-"
                }
            }
        }
    }

    /** `count` unchanged lines named by `name`. */
    private fun lines(name: String, count: Int) = List(count) { "$name $it" }

    private val sample = PMLineDiff.rows(
        (lines("head", 10) + "old" + lines("middle", 10) + "gone" + lines("tail", 10)).joinToString("\n"),
        (lines("head", 10) + "new" + lines("middle", 10) + lines("tail", 10)).joinToString("\n"),
    )

    @Test
    fun threeUnchangedLinesStayBesideEachChangeAndTheRestCollapse() {
        assertEquals(listOf("(7)", "===-+===", "(4)", "===-===", "(7)"), shape(PMLineDiff.runs(sample)))
    }

    @Test
    fun everyRunHasItsFirstRowsIndexAndEveryRowOneRun() {
        val runs = PMLineDiff.runs(sample)
        assertEquals(listOf(0, 7, 15, 19, 26), runs.map { it.key })
        assertEquals(sample, runs.flatMap { it.rows })
        assertTrue(runs.filter { it.collapsed }.all { run -> run.rows.all { it.kind == PMDiffRowKind.Same } })
    }

    @Test
    fun aStretchBetweenTwoChangesThatContextCoversIsDrawn() {
        assertEquals(listOf("(5)", "=====-+==========-=====", "(5)"), shape(PMLineDiff.runs(sample, 5.0)))
    }

    @Test
    fun aStretchThatWouldHideOneLineIsDrawn() {
        val near = PMLineDiff.rows(
            (listOf("a") + lines("same", 7) + "b").joinToString("\n"),
            (listOf("A") + lines("same", 7) + "B").joinToString("\n"),
        )
        assertEquals(listOf("-+=======-+"), shape(PMLineDiff.runs(near)))
        val far = PMLineDiff.rows(
            (listOf("a") + lines("same", 8) + "b").joinToString("\n"),
            (listOf("A") + lines("same", 8) + "B").joinToString("\n"),
        )
        assertEquals(listOf("-+===", "(2)", "===-+"), shape(PMLineDiff.runs(far)))
    }

    @Test
    fun noContextCollapsesEveryUnchangedLine() {
        assertEquals(listOf("(10)", "-+", "(10)", "-", "(10)"), shape(PMLineDiff.runs(sample, 0.0)))
    }

    @Test
    fun infiniteContextCollapsesNothing() {
        val runs = PMLineDiff.runs(sample, Double.POSITIVE_INFINITY)
        assertEquals(1, runs.size)
        assertEquals(false, runs.first().collapsed)
        assertEquals(sample, runs.first().rows)
    }

    @Test
    fun aContextThatIsNotACountReadsAsTheCountBelowItAndNeverBelowNone() {
        assertEquals(shape(PMLineDiff.runs(sample)), shape(PMLineDiff.runs(sample, 3.9)))
        assertEquals(shape(PMLineDiff.runs(sample, 0.0)), shape(PMLineDiff.runs(sample, -2.0)))
        assertEquals(shape(PMLineDiff.runs(sample, 0.0)), shape(PMLineDiff.runs(sample, Double.NaN)))
    }

    @Test
    fun aTextWithNoChangeIsOneCollapsedRun() {
        assertEquals(listOf("(3)"), shape(PMLineDiff.runs(PMLineDiff.rows("a\nb\nc", "a\nb\nc"))))
        assertEquals(listOf("="), shape(PMLineDiff.runs(PMLineDiff.rows("a", "a"))))
    }

    @Test
    fun aTextWhoseEveryLineChangedIsOneRun() {
        assertEquals(listOf("--++"), shape(PMLineDiff.runs(PMLineDiff.rows("a\nb", "c\nd"))))
    }

    @Test
    fun noRowsHaveNoRuns() {
        assertEquals(emptyList(), PMLineDiff.runs(emptyList()))
    }
}
