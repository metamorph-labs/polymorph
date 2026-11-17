// A number of seconds as a recording's clock writes it and as a screen reader
// says it: the engine's `clockTime` and `spokenDuration`
// (`packages/engine/src/conventions/audio.ts`, over `time-text.ts`), in
// Kotlin. AudioPlayer writes its clock and its spoken position with these,
// and RecordButton its time. `ClockTextTest` holds them to the engine's cases.
//
// The digits are Western around a colon, as this module writes every number
// (NumberInput's), because its common source set reaches no locale's
// numerals. The words are the app's to give, as DurationInput's are
// (`LocalPMDurationWords`, on Android `MeasureFormat` for the member's
// `locale`), else `PMStrings`' English: each unit that is not zero, joined by
// commas as an English list of units is.

package dev.polymorph.ui

import androidx.compose.runtime.Composable
import kotlin.math.floor

object PMClock {
    /**
     * Whole seconds, never negative: a value that is not a finite number above
     * zero is zero, and a fraction is dropped, so a clock moves once a second
     * and a recording's elapsed time equals its length when it ends.
     */
    fun whole(seconds: Double): Long = if (seconds.isFinite() && seconds > 0) floor(seconds).toLong() else 0L

    /**
     * `65` → `1:05`, `3725` → `1:02:05`: minutes and two-digit seconds, with
     * the hours in front from an hour on and the minutes then in two digits
     * too. Hours are not grouped, and a day is 24 of them.
     */
    fun digits(seconds: Double): String {
        val time = whole(seconds)
        val hours = time / SECONDS_PER_HOUR
        val minutes = time % SECONDS_PER_HOUR / SECONDS_PER_MINUTE
        val rest = time % SECONDS_PER_MINUTE
        val two = { count: Long -> count.toString().padStart(2, '0') }
        return if (hours > 0) "$hours:${two(minutes)}:${two(rest)}" else "$minutes:${two(rest)}"
    }

    /**
     * `65` → `1 minute, 5 seconds`: each unit that is not zero, in the words
     * `unit` gives a count of it, hours past a day included. No time at all is
     * zero seconds.
     */
    fun words(seconds: Double, unit: (Long, PMDurationUnit) -> String): String {
        val time = whole(seconds)
        val said = listOf(
            time / SECONDS_PER_HOUR to PMDurationUnit.Hours,
            time % SECONDS_PER_HOUR / SECONDS_PER_MINUTE to PMDurationUnit.Minutes,
            time % SECONDS_PER_MINUTE to PMDurationUnit.Seconds,
        ).filter { (count, _) -> count > 0 }.map { (count, of) -> unit(count, of) }
        return if (said.isEmpty()) unit(0L, PMDurationUnit.Seconds) else said.joinToString(", ")
    }

    private const val SECONDS_PER_MINUTE = 60L
    private const val SECONDS_PER_HOUR = 3_600L
}

/**
 * A count of a unit as a member that says a length speaks it: the app's
 * words for `locale` (`LocalPMDurationWords`), else `PMStrings`' English.
 */
@Composable
fun pmSpokenUnits(locale: String?): (Long, PMDurationUnit) -> String {
    val app = LocalPMDurationWords.current
    val strings = PMSpecDefault.strings
    return { count, unit -> app?.words(count, unit, true, locale) ?: PMDurationCounts.english(strings, count, unit, true) }
}
