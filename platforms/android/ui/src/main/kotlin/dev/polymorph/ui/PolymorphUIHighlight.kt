// Highlight's runs (`design/components/highlight.md`): a text cut into the
// parts that match and the parts that do not, as data. On the web the engine's
// `highlightRuns` decides them; this is the same function, held to the
// engine's own cases (`HighlightRunsTest`), so the same text and the same
// query mark the same characters on Android.
//
// A Kotlin string counts UTF-16 code units, as JavaScript's does, so the
// ranges a search engine returns are offsets into it as they are. Case folds
// one code point at a time, each to its upper case lowered in the locale, on
// both the text and each term, and a match in the folded text is read back to
// whole code points of the text. A term is matched unit for unit, never as a
// pattern.

package dev.polymorph.ui

import androidx.compose.ui.text.intl.Locale
import androidx.compose.ui.text.toLowerCase
import androidx.compose.ui.text.toUpperCase
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** One stretch of the text: marked when it matches, plain when it does not. */
data class PMHighlightRun(val text: String, val marked: Boolean)

object PMHighlightRuns {
    /**
     * The text as runs, in reading order, marked where it matches. With
     * `ranges`, the marks are the ranges; without them, every occurrence of
     * each term of `query`. Marks that overlap or touch are one mark. An empty
     * text has no runs, and a text with no match is one plain run.
     */
    fun runs(
        text: String,
        query: PMChoiceValue? = null,
        ranges: List<Pair<Double, Double>>? = null,
        locale: String? = null,
    ): List<PMHighlightRun> {
        if (text.isEmpty()) return emptyList()
        val found = when {
            ranges != null -> given(text, ranges)
            query != null -> occurrences(text, query, locale)
            else -> emptyList()
        }
        val runs = mutableListOf<PMHighlightRun>()
        var at = 0
        for ((start, end) in merged(found)) {
            if (start > at) runs += PMHighlightRun(text.substring(at, start), marked = false)
            runs += PMHighlightRun(text.substring(start, end), marked = true)
            at = end
        }
        if (at < text.length) runs += PMHighlightRun(text.substring(at), marked = false)
        return runs
    }

    /** The text folded, with each folded code unit's source: the start and the end of its code point. */
    private class Folded(val text: String, val start: IntArray, val end: IntArray)

    /**
     * The text folded one code point at a time. Folding can change a length
     * (`ß` folds to `ss`), so a match in the folded text is read back through
     * each unit's source.
     */
    private fun folded(text: String, locale: Locale?): Folded {
        val out = StringBuilder()
        val start = mutableListOf<Int>()
        val end = mutableListOf<Int>()
        var index = 0
        while (index < text.length) {
            val pair = index + 1 < text.length && text[index].isHighSurrogate() && text[index + 1].isLowSurrogate()
            val width = if (pair) 2 else 1
            val point = fold(text.substring(index, index + width), locale)
            repeat(point.length) {
                start += index
                end += index + width
            }
            out.append(point)
            index += width
        }
        return Folded(out.toString(), start.toIntArray(), end.toIntArray())
    }

    /**
     * One code point's folded case: its upper case, lowered. The round trip
     * folds the forms lower case alone keeps apart (Greek's final `ς` and `σ`,
     * `ß` and `ss`). With no locale it folds as the root locale does.
     */
    private fun fold(point: String, locale: Locale?): String =
        if (locale == null) point.uppercase().lowercase() else point.toUpperCase(locale).toLowerCase(locale)

    /**
     * The locale that folds case: the one named, or the device's. A tag
     * Compose cannot read is no locale, which folds as the root locale does.
     */
    private fun folding(tag: String?): Locale? =
        if (tag == null) Locale.current else runCatching { Locale(tag) }.getOrNull()

    /** Where each term occurs in the text, as ranges of the text. */
    private fun occurrences(text: String, query: PMChoiceValue, tag: String?): List<Pair<Int, Int>> {
        val locale = folding(tag)
        val words = when (query) {
            is PMChoiceValue.Single -> listOf(query.value)
            is PMChoiceValue.Multiple -> query.value
        }
        val terms = words.map { folded(it.trim(), locale).text }.filter { it.isNotEmpty() }
        if (terms.isEmpty()) return emptyList()
        val haystack = folded(text, locale)
        val found = mutableListOf<Pair<Int, Int>>()
        for (term in terms) {
            var at = haystack.text.indexOf(term)
            while (at != -1) {
                found += haystack.start[at] to haystack.end[at + term.length - 1]
                at = haystack.text.indexOf(term, at + term.length)
            }
        }
        return found
    }

    /**
     * The ranges a search engine returned, made safe to draw: ends that are
     * not whole read as the whole number below them, a range is cut at the
     * text's ends, an empty, reversed or not-a-number range is dropped, and an
     * end inside a surrogate pair moves out to the whole code point.
     */
    private fun given(text: String, ranges: List<Pair<Double, Double>>): List<Pair<Int, Int>> {
        val found = mutableListOf<Pair<Int, Int>>()
        for ((from, to) in ranges) {
            if (from.isNaN() || to.isNaN()) continue
            val low = max(0.0, floor(from))
            val high = min(text.length.toDouble(), floor(to))
            if (high <= low) continue
            var start = low.toInt()
            var end = high.toInt()
            if (start > 0 && text[start].isLowSurrogate() && text[start - 1].isHighSurrogate()) start -= 1
            if (end < text.length && text[end].isLowSurrogate() && text[end - 1].isHighSurrogate()) end += 1
            found += start to end
        }
        return found
    }

    /** Sorted, with ranges that overlap or touch joined into one. */
    private fun merged(ranges: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
        val out = mutableListOf<Pair<Int, Int>>()
        for (range in ranges.sortedWith(compareBy({ it.first }, { it.second }))) {
            val last = out.lastOrNull()
            if (last != null && range.first <= last.second) {
                out[out.size - 1] = last.first to max(last.second, range.second)
            } else {
                out += range
            }
        }
        return out
    }
}
