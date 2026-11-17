// RelativeTime (`design/components/relative-time.md`): a moment as a phrase
// such as "2h ago", for timestamps in lists, tables and running text. It is a
// word, not a widget: it sets no type step and no colour and takes both from
// the text around it (Material's text style and content colour), as the web's
// `<time>` inherits them.
//
// The phrase follows the spec's ladder, which the web's engine
// (`relativeTimePhrase`) implements: under a minute "now"; then the largest
// unit with a count of at least one (minutes, hours, days, weeks, months,
// years), the count rounded to the nearest and moved up a unit when it
// reaches the next unit's threshold, so 59 minutes 40 seconds is "1h ago"; a
// date-only value is a calendar date, measured in days and larger from today,
// and "today" when it is today; the future reads "in 2d". `narrow` is "5m
// ago", `long` "5 minutes ago".
//
// The words are the platform's to give, as `Intl` gives the web's: an app
// provides `LocalPMRelativeTimeWords`, on Android `android.icu.text.
// RelativeDateTimeFormatter` for `locale`, which this module's common source
// set cannot reach. Unprovided, the words are `PMStrings`' English, which an
// app translates through `LocalPMStrings`; English counts one and other, so
// a language with other plural forms provides its own words. The English
// names the day before "yesterday" under `numeric: auto`; any other unit of
// one reads as a number, as `always` reads it.
//
// `mode: absolute` draws the moment itself and `both` the moment and the
// phrase joined by `messages.both`, so a locale orders and punctuates them;
// without `messages` the moment comes first and the phrase follows in
// parentheses. The moment's words are the app's too, through
// `PMRelativeTimeWords.absolute`, from the platform's formatter in the
// reader's zone: the medium date under `format: narrow` and the long one under
// `long`, and an instant's short time (Intl's `dateStyle` and `timeStyle` on
// the web). Unprovided, the member writes Material 3's medium date in
// `locale`, whatever `format` says, because Material's formatter writes no
// long date without a weekday; an instant adds its 24-hour time in UTC and
// says UTC (`PMStrings.relativeUtc`), because the module reaches no time zone.
//
// The clock is the system's, and today is `PMDates.today` (`LocalPMToday`, or
// the clock's date in UTC): the common source set reaches no time zone, so a
// timestamp written without an offset is read in UTC, and an app that wants
// the reader's day provides `LocalPMToday`. A full timestamp keeps its offset.
// A value that is not a moment draws nothing, because no phrase about it is
// true. It never refreshes: the phrase is as current as the composition that
// drew it, and a timestamp that ticks is motion nobody asked for.
//
// TalkBack reads the long form of what is drawn ("5 minutes ago") whatever
// `format` draws: the narrow abbreviations do not say their unit when spoken.
// The root carries the value as its `datetime` attribute, the web's
// `dateTime`, for a test to read the moment back.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToLong
import kotlin.time.Clock
import kotlin.time.Instant

/** A unit the ladder counts in. */
enum class PMRelativeTimeUnit { Minute, Hour, Day, Week, Month, Year }

/** What the ladder decided: a moment under a minute away, today, or a signed count of a unit (negative is past). */
sealed interface PMRelativeMoment {
    data object Now : PMRelativeMoment
    data object Today : PMRelativeMoment
    data class Span(val count: Long, val unit: PMRelativeTimeUnit) : PMRelativeMoment
}

/** The moment RelativeTime's absolute form writes: a calendar date, or an instant. */
sealed interface PMAbsoluteMoment {
    /** A date-only value: no time of day and no time zone. */
    data class Day(val date: PMCalendarDate) : PMAbsoluteMoment

    /** A full timestamp, at its offset. */
    data class At(val instant: Instant) : PMAbsoluteMoment
}

/**
 * How RelativeTime words a moment: in the `long` or narrow form, with `named`
 * single units ("yesterday") under `numeric: auto`, in `locale` (the prop, or
 * null for the app's). An app provides one through `LocalPMRelativeTimeWords`.
 */
fun interface PMRelativeTimeWords {
    fun phrase(moment: PMRelativeMoment, long: Boolean, named: Boolean, locale: String?): String

    /**
     * The moment itself, for `mode: absolute` and `both`: the `long` or the
     * medium date, and an instant's short time in the reader's zone, in
     * `locale`. Null, the default, leaves it to the member, which writes it in
     * UTC.
     */
    fun absolute(moment: PMAbsoluteMoment, long: Boolean, locale: String?): String? = null
}

/** The app's words for RelativeTime; null words it in `PMStrings`' English. */
val LocalPMRelativeTimeWords = staticCompositionLocalOf<PMRelativeTimeWords?> { null }

object PMRelativeTime : PMRelativeTimeRendering {
    @Composable
    override fun Render(props: PMRelativeTimeProps) {
        val moment = moment(props.value, Clock.System.now(), PMDates.epochDay(PMDates.today)) ?: return
        val strings = PMSpecDefault.strings
        val words = LocalPMRelativeTimeWords.current ?: PMRelativeTimeWords { m, long, named, _ -> english(strings, m, long, named) }
        val named = props.numeric == PMRelativeTimeNumeric.Auto
        val long = props.format == PMRelativeTimeFormat.Long
        val drawn = words.phrase(moment, long, named, props.locale)
        val spoken = words.phrase(moment, true, named, props.locale)
        val mode = props.mode ?: PMRelativeTimeMode.Relative
        val at = absolute(props.value)
        if (mode == PMRelativeTimeMode.Relative || at == null) {
            Draw(props.value, drawn, spoken)
            return
        }

        val app = LocalPMRelativeTimeWords.current
        val given = app?.absolute(at, long, props.locale)
        val givenSpoken = app?.absolute(at, true, props.locale)
        if (given != null && givenSpoken != null) {
            Draw(props.value, joined(props, given, drawn), joined(props, givenSpoken, spoken))
            return
        }
        // Material's formatter is drawn inside the bridge, which provides its own
        // text style and colour; the time takes the ones around it, as a word does.
        val style = LocalTextStyle.current
        val color = LocalContentColor.current
        PMDateLocale(props.locale) { text ->
            val own = own(at, text, strings)
            CompositionLocalProvider(LocalTextStyle provides style, LocalContentColor provides color) {
                Draw(props.value, joined(props, own, drawn), joined(props, own, spoken))
            }
        }
    }

    /** The words, with the value as the root's `datetime` and the long form as what is spoken. */
    @Composable
    private fun Draw(value: String, drawn: String, spoken: String) {
        Text(
            text = drawn,
            modifier = Modifier
                .pmMember("RelativeTime", mapOf("datetime" to value))
                .clearAndSetSemantics { contentDescription = spoken },
        )
    }

    /**
     * What `both` draws: the moment and the phrase joined by `messages.both`,
     * or by the spec's English, the moment and then the phrase in parentheses;
     * `absolute` the moment alone.
     */
    private fun joined(props: PMRelativeTimeProps, moment: String, phrase: String): String {
        if (props.mode != PMRelativeTimeMode.Both) return moment
        val both = props.messages?.both ?: return "$moment ($phrase)"
        return both(moment, phrase)
    }

    /**
     * The member's own words for the moment: Material 3's medium date, and for
     * an instant its 24-hour time in UTC, said as UTC.
     */
    private fun own(moment: PMAbsoluteMoment, text: PMDateText, strings: PMStrings): String = when (moment) {
        is PMAbsoluteMoment.Day -> text.medium(moment.date)
        is PMAbsoluteMoment.At -> {
            val millis = moment.instant.toEpochMilliseconds()
            val minutes = millis.floorDiv(MINUTE.toLong()).mod(MINUTES_PER_DAY)
            val time = PMDates.two((minutes / MINUTES_PER_HOUR).toInt()) + TIME_SEPARATOR + PMDates.two((minutes % MINUTES_PER_HOUR).toInt())
            strings.relativeUtc(text.medium(PMDates.fromUtcMillis(millis)) + DATE_TIME_SEPARATOR + time)
        }
    }

    /** The moment `value` names, for the absolute form, or null when it is not a moment. */
    fun absolute(value: String): PMAbsoluteMoment? {
        DATE_ONLY.matchEntire(value)?.let { match ->
            val (year, month, day) = match.destructured
            val date = PMDates.fromEpochDay(PMDates.epochDay(year.toInt(), month.toInt(), day.toInt()))
            // A date that does not exist (`2026-02-30`) is no moment.
            if (date.year.toInt() != year.toInt() || date.month.toInt() != month.toInt() || date.day.toInt() != day.toInt()) return null
            return PMAbsoluteMoment.Day(date)
        }
        return instant(value)?.let { PMAbsoluteMoment.At(it) }
    }

    /** The English phrase, from `PMStrings`. */
    private fun english(strings: PMStrings, moment: PMRelativeMoment, long: Boolean, named: Boolean): String = when (moment) {
        PMRelativeMoment.Now -> strings.relativeNow
        PMRelativeMoment.Today -> strings.relativeToday
        is PMRelativeMoment.Span -> {
            if (named && moment.unit == PMRelativeTimeUnit.Day && moment.count == -1L) {
                strings.relativeYesterday
            } else {
                val count = abs(moment.count).toDouble()
                val one = abs(moment.count) == 1L
                val span = when (moment.unit) {
                    PMRelativeTimeUnit.Minute -> if (!long) strings.relativeMinutesNarrow(count) else if (one) strings.relativeMinute(count) else strings.relativeMinutes(count)
                    PMRelativeTimeUnit.Hour -> if (!long) strings.relativeHoursNarrow(count) else if (one) strings.relativeHour(count) else strings.relativeHours(count)
                    PMRelativeTimeUnit.Day -> if (!long) strings.relativeDaysNarrow(count) else if (one) strings.relativeDay(count) else strings.relativeDays(count)
                    PMRelativeTimeUnit.Week -> if (!long) strings.relativeWeeksNarrow(count) else if (one) strings.relativeWeek(count) else strings.relativeWeeks(count)
                    PMRelativeTimeUnit.Month -> if (!long) strings.relativeMonthsNarrow(count) else if (one) strings.relativeMonth(count) else strings.relativeMonths(count)
                    PMRelativeTimeUnit.Year -> if (!long) strings.relativeYearsNarrow(count) else if (one) strings.relativeYear(count) else strings.relativeYears(count)
                }
                if (moment.count < 0) strings.relativeAgo(span) else strings.relativeIn(span)
            }
        }
    }

    /** A unit's length in milliseconds; a month is the Gregorian average, so months and years agree. */
    private fun millis(unit: PMRelativeTimeUnit): Double = when (unit) {
        PMRelativeTimeUnit.Minute -> MINUTE
        PMRelativeTimeUnit.Hour -> HOUR
        PMRelativeTimeUnit.Day -> DAY
        PMRelativeTimeUnit.Week -> DAY * DAYS_PER_WEEK
        PMRelativeTimeUnit.Month -> DAY * DAYS_PER_MONTH
        PMRelativeTimeUnit.Year -> DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR
    }

    /**
     * The ladder's decision for `value`, measured from `now` and today's
     * epoch day, or null when `value` is not a moment.
     */
    fun moment(value: String, now: Instant, today: Long): PMRelativeMoment? {
        DATE_ONLY.matchEntire(value)?.let { match ->
            val (year, month, day) = match.destructured
            val epoch = PMDates.epochDay(year.toInt(), month.toInt(), day.toInt())
            // A date that does not exist (`2026-02-30`) is no moment.
            val back = PMDates.fromEpochDay(epoch)
            if (back.year.toInt() != year.toInt() || back.month.toInt() != month.toInt() || back.day.toInt() != day.toInt()) return null
            val days = epoch - today
            if (days == 0L) return PMRelativeMoment.Today
            val rung = rung(abs(days) * DAY, PMRelativeTimeUnit.Day)
            return PMRelativeMoment.Span(if (days < 0) -rung.first else rung.first, rung.second)
        }
        val moment = instant(value) ?: return null
        val signed = (moment - now).inWholeMilliseconds.toDouble()
        if (abs(signed) < MINUTE) return PMRelativeMoment.Now
        val rung = rung(abs(signed), PMRelativeTimeUnit.Minute)
        return PMRelativeMoment.Span(if (signed < 0) -rung.first else rung.first, rung.second)
    }

    /**
     * The largest unit from `smallest` up that the span has at least one of,
     * the count rounded to the nearest; a count that reaches the next unit's
     * threshold moves up to that unit, and on, so one carry can lead to
     * another. The smallest unit is the least, even under one of it.
     */
    private fun rung(span: Double, smallest: PMRelativeTimeUnit): Pair<Long, PMRelativeTimeUnit> {
        val units = PMRelativeTimeUnit.entries.filter { it.ordinal >= smallest.ordinal }
        var held = units.first()
        for (unit in units) if (span >= millis(unit)) held = unit
        var count = (span / millis(held)).roundToLong()
        for (unit in units) {
            if (millis(unit) > millis(held) && count * millis(held) >= millis(unit)) {
                held = unit
                count = max(1L, (span / millis(unit)).roundToLong())
            }
        }
        return count to held
    }

    /** A full timestamp: with its offset, or, written without one, in UTC. */
    private fun instant(value: String): Instant? =
        listOf(value, value + UTC, value + SECONDS + UTC).firstNotNullOfOrNull { runCatching { Instant.parse(it) }.getOrNull() }

    private val DATE_ONLY = Regex("""(\d{4})-(\d{2})-(\d{2})""")
    private const val UTC = "Z"
    private const val SECONDS = ":00"
    private const val MINUTE = 60_000.0
    private const val HOUR = 3_600_000.0
    private const val DAY = 86_400_000.0
    private const val DAYS_PER_WEEK = 7
    private const val DAYS_PER_MONTH = 30.4375
    private const val MONTHS_PER_YEAR = 12
    private const val MINUTES_PER_HOUR = 60L
    private const val MINUTES_PER_DAY = 1_440L
    private const val TIME_SEPARATOR = ":"
    private const val DATE_TIME_SEPARATOR = ", "
}

/**
 * RelativeTime's states, from the spec's States table. Each moment is
 * computed from the clock as the fixture composes, as the web's fixture
 * computes it, so a render never drifts from its phrase; the calendar date is
 * fixed, and so is the today it is measured from (`LocalPMToday`). An unparseable
 * value draws nothing, so it has no entry: the harness holds every entry to
 * drawing.
 */
object RelativeTimeStates : PMStates {
    override val member = "RelativeTime"

    private const val updated = "Updated"
    private const val opened = "Opened"
    private const val replied = "Replied"
    private const val due = "Due"
    private const val english = "en-US"
    private const val minute = 60_000L
    private const val hour = 3_600_000L
    private const val day = 86_400_000L

    /** The ISO value `offset` milliseconds from now. */
    private fun at(offset: Long): String = Instant.fromEpochMilliseconds(Clock.System.now().toEpochMilliseconds() + offset).toString()

    /** A label and then the time, in a table cell's `text.sm` and `text.secondary`: the member takes both from around it. */
    @Composable
    private fun In(lead: String, time: @Composable () -> Unit) {
        val theme = PM.theme
        CompositionLocalProvider(
            LocalTextStyle provides theme.text.sm.textStyle,
            LocalContentColor provides theme.colors.textSecondary.color,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2)) {
                Text(lead, modifier = Modifier.clearAndSetSemantics {})
                time()
            }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("minutes — the queue register", expect = mapOf("label" to "5 minutes ago")) {
                In(updated) { PMRelativeTime(value = at(-5 * minute)) }
            },
            PMStateEntry("hours", expect = mapOf("label" to "2 hours ago")) {
                In(updated) { PMRelativeTime(value = at(-2 * hour)) }
            },
            PMStateEntry("days, long — for sentences", expect = mapOf("label" to "3 days ago")) {
                In(opened) { PMRelativeTime(format = PMRelativeTimeFormat.Long, value = at(-3 * day)) }
            },
            PMStateEntry("auto — prose surfaces get yesterday", expect = mapOf("label" to "yesterday")) {
                In(replied) { PMRelativeTime(format = PMRelativeTimeFormat.Long, numeric = PMRelativeTimeNumeric.Auto, value = at(-day)) }
            },
            PMStateEntry("calendar date — days and larger, only", expect = mapOf("datetime" to "2026-08-04", "label" to "2 days ago")) {
                CompositionLocalProvider(LocalPMToday provides PMCalendarDate(year = 2026.0, month = 8.0, day = 6.0)) {
                    In(due) { PMRelativeTime(value = "2026-08-04") }
                }
            },
            PMStateEntry("due date — the future reads in 2d", expect = mapOf("label" to "in 2 days")) {
                In(due) { PMRelativeTime(value = at(2 * day)) }
            },
            PMStateEntry("just now — the one true word under a minute", expect = mapOf("label" to "now")) {
                In(updated) { PMRelativeTime(value = at(-20_000L)) }
            },
            PMStateEntry("absolute — the moment itself, in UTC without the app’s words") {
                In(opened) { PMRelativeTime(locale = english, mode = PMRelativeTimeMode.Absolute, value = at(-2 * hour)) }
            },
            PMStateEntry("absolute calendar date — the date alone", expect = mapOf("datetime" to "2026-08-04", "label" to "Aug 4, 2026")) {
                In(due) { PMRelativeTime(locale = english, mode = PMRelativeTimeMode.Absolute, value = "2026-08-04") }
            },
            PMStateEntry("both — the moment, then how long ago") {
                In(opened) { PMRelativeTime(locale = english, mode = PMRelativeTimeMode.Both, value = at(-2 * hour)) }
            },
        )
}
