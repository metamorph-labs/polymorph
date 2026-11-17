// DurationInput's arithmetic (`design/components/duration-input.md`), the
// engine's `packages/engine/src/conventions/duration.ts` in Kotlin: which
// units a field shows, a number of seconds split across them and summed
// back, the bounds a value is held inside, the range of each count, a step
// that carries, typed digits and a commit. `InputLogicTest` holds it to the
// engine's cases.
//
// The words a count is written and said with are the platform's to give, as
// `Intl` gives the web's: an app provides `LocalPMDurationWords`, on Android
// `android.icu.text.MeasureFormat` for `locale`, which this module's common
// source set cannot reach. Unprovided, the words are `PMStrings`' English,
// which an app translates through `LocalPMStrings`; English counts one and
// other, so a language with other plural forms provides its own words.

package dev.polymorph.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.input.TextFieldValue
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** What the reader has set, by unit. A missing unit shows its placeholder and counts as zero. */
typealias PMDurationDraft = Map<PMDurationUnit, Long>

/** The units a field shows, and its `min` and `max` in seconds. */
data class PMDurationOptions(
    val units: List<PMDurationUnit>? = null,
    val min: Double? = null,
    val max: Double? = null,
)

object PMDurationCounts {
    /** Every unit, largest first. */
    val order = listOf(PMDurationUnit.Days, PMDurationUnit.Hours, PMDurationUnit.Minutes, PMDurationUnit.Seconds)

    /** The units a field shows when the caller names none (the engine's `DURATION_DEFAULT_UNITS`). */
    val defaultUnits = listOf(PMDurationUnit.Days, PMDurationUnit.Hours, PMDurationUnit.Minutes)

    /** The most seconds a field holds with no `max`: the engine's `Number.MAX_SAFE_INTEGER`. */
    private const val CEILING = 9_007_199_254_740_991.0

    /** The seconds in one of `unit`. */
    fun seconds(unit: PMDurationUnit): Double = when (unit) {
        PMDurationUnit.Days -> SECONDS_PER_DAY
        PMDurationUnit.Hours -> SECONDS_PER_HOUR
        PMDurationUnit.Minutes -> SECONDS_PER_MINUTE
        PMDurationUnit.Seconds -> 1.0
    }

    /** The units a field shows, largest first, each once; the default units when the list names none (`durationUnits`). */
    fun units(units: List<PMDurationUnit>?): List<PMDurationUnit> {
        val shown = order.filter { units?.contains(it) == true }
        return shown.ifEmpty { defaultUnits }
    }

    /** JavaScript's `Math.round`: the nearest whole number, a half rounded up. */
    fun round(value: Double): Double = floor(value + HALF)

    /** The seconds in the smallest unit shown: every drawn value is a multiple of it. */
    private fun grain(options: PMDurationOptions): Double = seconds(units(options.units).last())

    /**
     * The bounds a committed value is held inside: `min` and `max` moved
     * inwards to whole counts of the smallest unit shown, or the caller's own
     * when no whole count lies between them (`durationBounds`).
     */
    fun bounds(options: PMDurationOptions): Pair<Double, Double> {
        val step = grain(options)
        val low = max(0.0, options.min ?: 0.0)
        val high = max(low, options.max ?: CEILING)
        val lower = ceil(low / step) * step
        val upper = floor(high / step) * step
        return if (upper < lower) low to high else lower to upper
    }

    /** Seconds held inside the bounds, in whole seconds; no value, or a number that is not finite, is no value (`clampDuration`). */
    fun clamp(seconds: Double?, options: PMDurationOptions): Double? {
        if (seconds == null || !seconds.isFinite()) return null
        val (lower, upper) = bounds(options)
        return min(upper, max(lower, round(seconds)))
    }

    /**
     * Seconds as a draft: the count of each unit shown, the largest taking
     * what the smaller do not hold, rounded to the nearest count of the
     * smallest unit, half up (`durationDraft`).
     */
    fun draft(seconds: Double?, options: PMDurationOptions): PMDurationDraft {
        if (seconds == null || !seconds.isFinite()) return emptyMap()
        val step = grain(options)
        var rest = round(max(0.0, seconds) / step) * step
        val draft = linkedMapOf<PMDurationUnit, Long>()
        for (unit in units(options.units)) {
            val count = floor(rest / seconds(unit))
            draft[unit] = count.toLong()
            rest -= count * seconds(unit)
        }
        return draft
    }

    /** The draft's seconds, an empty count counting as zero; null while every count is empty. Not clamped (`durationOfDraft`). */
    fun total(draft: PMDurationDraft, options: PMDurationOptions): Double? {
        val shown = units(options.units)
        if (shown.none { draft[it] != null }) return null
        return shown.sumOf { (draft[it] ?: 0L).toDouble() * seconds(it) }
    }

    /**
     * The most a count holds: below the next larger unit shown (59 minutes
     * under hours), and for the largest unit as many as `max` holds
     * (`durationSegmentRange`).
     */
    fun most(unit: PMDurationUnit, options: PMDurationOptions): Long {
        val shown = units(options.units)
        val at = shown.indexOf(unit)
        if (at > 0) return (seconds(shown[at - 1]) / seconds(unit)).toLong() - 1
        return floor(bounds(options).second / seconds(unit)).toLong()
    }

    /**
     * One of `unit` more or less, held inside the bounds and split again: a
     * count carries into the next larger one, and an empty field counts as
     * zero (`stepDuration`).
     */
    fun step(draft: PMDurationDraft, unit: PMDurationUnit, delta: Int, options: PMDurationOptions): PMDurationDraft {
        val total = total(draft, options) ?: 0.0
        return draft(clamp(total + delta * seconds(unit), options), options)
    }

    /**
     * The digits a count keeps after its text changes, and whether no further
     * digit could fit, from the engine's `typeIntoDuration`: a digit extends
     * the count while it stays under `most`, and starts it again when it would
     * not; a digit that fits in no count of the unit is refused, and the count
     * keeps its digits. A count is full once a tenfold of it passes `most`.
     */
    fun typed(old: String, edited: TextFieldValue, most: Long): Pair<String, Boolean> {
        val digits = edited.text.filter { it in '0'..'9' }
        if (digits.isEmpty()) return "" to false
        val kept = if ((digits.toLongOrNull() ?: Long.MAX_VALUE) <= most) {
            digits
        } else {
            // The digit typed is the one before the caret.
            val entered = edited.text.getOrNull(edited.selection.start - 1)?.takeIf { it in '0'..'9' } ?: digits.last()
            if (entered.digitToInt() <= most) entered.toString() else return old to false
        }
        val full = (kept.toLongOrNull() ?: Long.MAX_VALUE) > most / TEN || kept.length >= most.toString().length
        return kept to full
    }

    /**
     * What a commit makes of a draft: its seconds held inside the bounds, and
     * the draft of that value. A draft that holds the seconds `reported` is
     * drawn with commits nothing, so a value the units cannot write exactly is
     * kept until the reader changes what the counts show (`commitDuration`).
     */
    fun commit(draft: PMDurationDraft, reported: Double?, options: PMDurationOptions): PMDurationCommit {
        val drawn = draft(reported, options)
        if (total(draft, options) == total(drawn, options)) return PMDurationCommit(drawn, reported, changed = false)
        val value = clamp(total(draft, options), options)
        return PMDurationCommit(draft(value, options), value, changed = value != reported)
    }

    /** The English words, from `PMStrings`: a count with its unit's short word ("7 days", "0 hr"), or with its long word as said ("7 days", "0 hours"). */
    fun english(strings: PMStrings, count: Long, unit: PMDurationUnit, long: Boolean): String {
        val one = count == 1L
        val number = count.toDouble()
        return when (unit) {
            PMDurationUnit.Days -> when {
                long && one -> strings.durationDay(number)
                long -> strings.durationDays(number)
                one -> strings.durationDayShort(number)
                else -> strings.durationDaysShort(number)
            }
            PMDurationUnit.Hours -> when {
                long && one -> strings.durationHour(number)
                long -> strings.durationHours(number)
                else -> strings.durationHoursShort(number)
            }
            PMDurationUnit.Minutes -> when {
                long && one -> strings.durationMinute(number)
                long -> strings.durationMinutes(number)
                else -> strings.durationMinutesShort(number)
            }
            PMDurationUnit.Seconds -> when {
                long && one -> strings.durationSecond(number)
                long -> strings.durationSeconds(number)
                else -> strings.durationSecondsShort(number)
            }
        }
    }

    /**
     * A count's text split into its digits and its unit's word, and whether
     * the word comes first: the digits are the first run of digits in it.
     */
    fun parts(text: String): PMDurationParts {
        val start = text.indexOfFirst { it.isDigit() }
        if (start < 0) return PMDurationParts(digits = "", word = text.trim(), wordFirst = true)
        val end = (start until text.length).firstOrNull { !text[it].isDigit() } ?: text.length
        val before = text.substring(0, start).trim()
        val after = text.substring(end).trim()
        return PMDurationParts(
            digits = text.substring(start, end),
            word = listOf(before, after).filter { it.isNotEmpty() }.joinToString(SPACE),
            wordFirst = before.isNotEmpty(),
        )
    }

    private const val SECONDS_PER_DAY = 86_400.0
    private const val SECONDS_PER_HOUR = 3_600.0
    private const val SECONDS_PER_MINUTE = 60.0
    private const val HALF = 0.5
    private const val TEN = 10
    private const val SPACE = " "
}

/** What a commit leaves in the field, the value it holds, and whether it differs from the one reported. */
data class PMDurationCommit(val draft: PMDurationDraft, val value: Double?, val changed: Boolean)

/** A count's text: its digits, its unit's word, and whether the word comes first. */
data class PMDurationParts(val digits: String, val word: String, val wordFirst: Boolean)

/**
 * How DurationInput words its counts, in `locale` (the prop, or null for the
 * app's): a count with its unit's short word, as it is drawn beside the
 * field's digits ("7 days", "0 hr"), or with its long word, as it is said
 * ("7 days", "0 hours"). An app provides one through `LocalPMDurationWords`.
 */
fun interface PMDurationWords {
    fun words(count: Long, unit: PMDurationUnit, long: Boolean, locale: String?): String
}

/** The app's words for DurationInput; null words it in `PMStrings`' English. */
val LocalPMDurationWords = staticCompositionLocalOf<PMDurationWords?> { null }
