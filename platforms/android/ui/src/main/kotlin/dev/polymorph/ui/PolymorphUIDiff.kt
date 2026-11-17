// Diff's rows (`design/components/diff.md`): two texts compared line by line,
// as data, and the runs the lines form draws them in. On the web the engine's
// `diffLines` and `diffRuns` decide them; this is the same comparison, held to
// the engine's own cases (`LineDiffTest`), so the same two texts give the same
// rows on Android. A Kotlin string compares code unit for code unit, as
// JavaScript's does.

package dev.polymorph.ui

import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Diff's `context` (`diff.md`): the unchanged lines kept beside each change. */
val PMSpecDefault.diffContext: Double get() = 3.0

/**
 * The glyphs Diff draws: the marks a reader sees, which say nothing to TalkBack
 * because the member's words say it, and the invisible characters that set the
 * inline form's direction.
 */
object PMDiffGlyphs {
    /** An added line's marker, and the sign before an added value. */
    const val added = "+"

    /** A removed line's marker: the minus sign, not a hyphen. */
    const val removed = "−"

    /** An unchanged line's marker: a space, so the cell is one line tall. */
    const val blank = " "

    /** What an inline gap stands in for in the text: a zero-width space. */
    const val gap = "​"

    /**
     * The arrow between an old value and a new one. It has no mirrored form
     * of its own, so a right-to-left line draws the arrow that points left, as
     * the web mirrors it.
     */
    fun arrow(direction: LayoutDirection): String = if (direction == LayoutDirection.Rtl) "←" else "→"

    /**
     * The mark that sets a line's direction to the layout's: the right-to-left
     * or the left-to-right mark, neither drawn. The values around it are
     * isolates, which do not set it.
     */
    fun direction(direction: LayoutDirection): String = if (direction == LayoutDirection.Rtl) "‏" else "‎"

    /**
     * A value as a bidi isolate, the web's `unicode-bidi: isolate`: its own
     * direction inside, and no effect on the order of what is around it.
     */
    fun isolated(value: String): String = "⁨" + value + "⁩"
}

/** What a line is to the comparison: in both texts, only in the new one, or only in the old one. */
enum class PMDiffRowKind { Same, Added, Removed }

/** One line of the comparison: its line numbers count from 1, and a side the line is not on has none. */
data class PMDiffRow(val kind: PMDiffRowKind, val text: String, val beforeLine: Int?, val afterLine: Int?)

/**
 * A stretch of consecutive rows, drawn as they are or, when `collapsed`, as one
 * row that says how many unchanged lines it holds. `key` is the index of its
 * first row among all rows, which no other run shares.
 */
data class PMDiffRun(val key: Int, val collapsed: Boolean, val rows: List<PMDiffRow>)

object PMLineDiff {
    /**
     * The most cells the comparison fills, the engine's `DIFF_LINES_LIMIT`:
     * the old text's line count times the new text's, between the lines the
     * two texts start and end with in common. Past it the comparison is not
     * computed, so no input holds the screen.
     */
    const val LIMIT = 1_000_000

    /**
     * A text's lines. `\r\n` reads as `\n`. A final line ending closes the
     * last line and starts no empty one. A missing or empty text has no lines.
     */
    fun lines(text: String?): List<String> {
        if (text.isNullOrEmpty()) return emptyList()
        val lines = text.replace("\r\n", "\n").split("\n").toMutableList()
        if (lines.last().isEmpty()) lines.removeAt(lines.size - 1)
        return lines
    }

    /**
     * The line diff of `before` against `after`: every line of both texts, in
     * reading order, as unchanged, added or removed. Within one change the
     * removed lines come before the added ones. The lines the texts start and
     * end with in common are unchanged without a comparison; the lines between
     * are compared by their longest common subsequence, unless that would fill
     * more than `LIMIT` cells, when every old line between is removed and
     * every new line between is added.
     */
    fun rows(before: String?, after: String?): List<PMDiffRow> {
        val old = lines(before)
        val next = lines(after)
        // Each distinct line as a number, so a comparison is one integer test.
        val ids = HashMap<String, Int>()
        val a = IntArray(old.size) { ids.getOrPut(old[it]) { ids.size } }
        val b = IntArray(next.size) { ids.getOrPut(next[it]) { ids.size } }

        var start = 0
        while (start < a.size && start < b.size && a[start] == b[start]) start += 1
        var oldEnd = a.size
        var nextEnd = b.size
        while (oldEnd > start && nextEnd > start && a[oldEnd - 1] == b[nextEnd - 1]) {
            oldEnd -= 1
            nextEnd -= 1
        }

        val rows = ArrayList<PMDiffRow>(old.size + next.size)
        fun same(i: Int, j: Int) = rows.add(PMDiffRow(PMDiffRowKind.Same, old[i], i + 1, j + 1))
        fun removed(i: Int) = rows.add(PMDiffRow(PMDiffRowKind.Removed, old[i], i + 1, null))
        fun added(j: Int) = rows.add(PMDiffRow(PMDiffRowKind.Added, next[j], null, j + 1))

        for (i in 0 until start) same(i, i)

        val height = oldEnd - start
        val width = nextEnd - start
        if (height == 0 || width == 0 || height.toLong() * width > LIMIT) {
            for (i in start until oldEnd) removed(i)
            for (j in start until nextEnd) added(j)
        } else {
            // `lengths[i * row + j]` is the longest common subsequence of the
            // old lines from `start + i` and the new lines from `start + j`.
            val row = width + 1
            val lengths = IntArray((height + 1) * row)
            for (i in height - 1 downTo 0) {
                for (j in width - 1 downTo 0) {
                    lengths[i * row + j] =
                        if (a[start + i] == b[start + j]) lengths[(i + 1) * row + j + 1] + 1
                        else max(lengths[(i + 1) * row + j], lengths[i * row + j + 1])
                }
            }

            // One change's added lines wait until its removed lines are written.
            val pending = ArrayList<Int>()
            fun flush() {
                for (j in pending) added(j)
                pending.clear()
            }
            var i = 0
            var j = 0
            while (i < height || j < width) {
                if (i < height && j < width && a[start + i] == b[start + j]) {
                    flush()
                    same(start + i, start + j)
                    i += 1
                    j += 1
                } else if (j == width || (i < height && lengths[(i + 1) * row + j] >= lengths[i * row + j + 1])) {
                    removed(start + i)
                    i += 1
                } else {
                    pending += start + j
                    j += 1
                }
            }
            flush()
        }

        var j = nextEnd
        for (i in oldEnd until old.size) {
            same(i, j)
            j += 1
        }
        return rows
    }

    /**
     * The rows in the runs the lines form draws. `context` unchanged lines
     * stay beside each change, and the unchanged lines past them are one
     * collapsed run: more than `2 × context` between two changes, or more than
     * `context` before the first change or after the last. A stretch that
     * would hide one line is drawn instead. A context that is not a count
     * reads as the count below it, and never below none; infinity collapses
     * nothing. A text with no change is one collapsed run.
     */
    fun runs(rows: List<PMDiffRow>, context: Double = PMSpecDefault.diffContext): List<PMDiffRun> {
        val keep = if (context.isNaN() || context <= 0) 0 else min(floor(context), rows.size.toDouble()).toInt()
        val runs = mutableListOf<PMDiffRun>()
        // The rows of the drawn run being added to, while there is one.
        var open: MutableList<PMDiffRow>? = null
        fun draw(from: Int, to: Int) {
            if (to <= from) return
            val target = open ?: mutableListOf<PMDiffRow>().also {
                runs += PMDiffRun(from, collapsed = false, rows = it)
                open = it
            }
            for (index in from until to) target += rows[index]
        }

        var at = 0
        while (at < rows.size) {
            if (rows[at].kind != PMDiffRowKind.Same) {
                draw(at, at + 1)
                at += 1
                continue
            }
            var end = at
            while (end < rows.size && rows[end].kind == PMDiffRowKind.Same) end += 1
            val head = if (at > 0) min(keep, end - at) else 0
            val tail = if (end < rows.size) min(keep, end - at - head) else 0
            if (end - at - head - tail < 2) {
                draw(at, end)
            } else {
                draw(at, at + head)
                runs += PMDiffRun(at + head, collapsed = true, rows = rows.subList(at + head, end - tail).toList())
                open = null
                draw(end - tail, end)
            }
            at = end
        }
        return runs
    }
}
