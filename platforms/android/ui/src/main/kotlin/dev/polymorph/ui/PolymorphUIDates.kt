// The parts the date and time members share. Calendar, DatePicker,
// DateRangePicker and TimeInput use them:
//
// - `PMDates`: a `PMCalendarDate` as a day count and back, in the Gregorian
//   calendar with no time zone, the days a month holds and where its weeks
//   start, and the regions whose week starts on another day or whose clock
//   has twelve hours (CLDR's week and time data).
// - `LocalPMToday`, the day a calendar marks as today.
// - `PMDateLocale` and `PMDateText`: a locale's names for months, weekdays,
//   dates and day periods, from Material 3's date formatter.
// - `PMDateFieldBox`, Input's container as the date and time fields draw it,
//   with the embedded buttons (`PMEmbeddedButton`) in its trailing end.
// - `PMTimeSegments`, the hour, minute and day period TimeInput is and
//   DatePicker appends at its time granularities, and `PMMonthSegments`,
//   MonthInput's month and year, both drawn with `PMDigitSegment`, which
//   DurationInput's counts are drawn with too.
// - `PMDatePickerPanel` and `PMDateRangePickerPanel`: Material 3's date
//   picker and date range picker, the platform's own, in the pairing's
//   colours, type and shapes.
// - `PMCountdownTime`: Countdown's moment, time left, digits and words.
//
// The member module's targets are the JVM's and Android's, on both of which
// Compose's platform locale (`Locale.platformLocale`) is the class Material's
// calendar locale names, so a `locale` prop reaches Material's formatter and
// pickers through Compose's own locale.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerState
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.DateRangePickerDefaults
import androidx.compose.material3.DateRangePickerState
import androidx.compose.material3.DisplayMode
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.utf16CodePoint
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.intl.Locale
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTextStyle
import kotlin.math.ceil
import kotlin.math.max
import kotlin.time.Clock
import kotlin.time.Instant
import kotlinx.coroutines.flow.drop

/* Dates -------------------------------------------------------------------- */

/**
 * Calendar dates as the contract carries them, a `PMCalendarDate` of the
 * Gregorian calendar with no time zone, so no zone moves a day. A date is
 * also a day count from 1970-01-01 (`epochDay`), and the moment of its
 * midnight in UTC (`utcMillis`), which is how Material's pickers and its
 * formatter name a day.
 */
object PMDates {
    /** The day a calendar date names, as a sortable key: `20261015`. */
    fun key(date: PMCalendarDate): Int = date.year.toInt() * 10_000 + date.month.toInt() * 100 + date.day.toInt()

    fun sameDay(a: PMCalendarDate?, b: PMCalendarDate?): Boolean = a != null && b != null && key(a) == key(b)

    /** The date as the web serializes it: `2026-03-18`. */
    fun iso(date: PMCalendarDate): String =
        "${date.year.toInt()}-${two(date.month.toInt())}-${two(date.day.toInt())}"

    /** A number of at most two digits as two, `09`: the time's own form. */
    fun two(value: Int): String = value.toString().padStart(2, '0')

    private fun leap(year: Int): Boolean = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

    /** How many days a month of a year holds. */
    fun daysIn(year: Int, month: Int): Int = when (month) {
        2 -> if (leap(year)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

    /** The days from 1970-01-01 to a Gregorian date, before it negative. */
    fun epochDay(year: Int, month: Int, day: Int): Long {
        val y = (if (month <= 2) year - 1 else year).toLong()
        val era = y.floorDiv(400)
        val yearOfEra = y - era * 400
        val shifted = (month + 9) % 12
        val dayOfYear = (153 * shifted + 2) / 5 + day - 1
        val dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
        return era * DAYS_PER_ERA + dayOfEra - DAYS_BEFORE_EPOCH
    }

    fun epochDay(date: PMCalendarDate): Long = epochDay(date.year.toInt(), date.month.toInt(), date.day.toInt())

    /** The Gregorian date a day count names. */
    fun fromEpochDay(days: Long): PMCalendarDate {
        val z = days + DAYS_BEFORE_EPOCH
        val era = z.floorDiv(DAYS_PER_ERA)
        val dayOfEra = z - era * DAYS_PER_ERA
        val yearOfEra = (dayOfEra - dayOfEra / 1_460 + dayOfEra / 36_524 - dayOfEra / 146_096) / 365
        val dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100)
        val shifted = (5 * dayOfYear + 2) / 153
        val day = dayOfYear - (153 * shifted + 2) / 5 + 1
        val month = if (shifted < 10) shifted + 3 else shifted - 9
        val year = yearOfEra + era * 400 + (if (month <= 2) 1 else 0)
        return PMCalendarDate(year = year.toDouble(), month = month.toDouble(), day = day.toDouble())
    }

    /** The moment of the day's midnight in UTC, in milliseconds. */
    fun utcMillis(date: PMCalendarDate): Long = epochDay(date) * MILLIS_PER_DAY

    /** The day whose UTC midnight is at or before `millis`. */
    fun fromUtcMillis(millis: Long): PMCalendarDate = fromEpochDay(millis.floorDiv(MILLIS_PER_DAY))

    /** The day of the week, 0 being Sunday. 1970-01-01 was a Thursday. */
    fun weekday(date: PMCalendarDate): Int = (epochDay(date) + THURSDAY).mod(DAYS_PER_WEEK)

    /** The first day of the date's month. */
    fun monthOf(date: PMCalendarDate): PMCalendarDate = PMCalendarDate(year = date.year, month = date.month, day = 1.0)

    /** The first day of the month `months` after the date's month, before it when negative. */
    fun addMonths(date: PMCalendarDate, months: Int): PMCalendarDate {
        val index = date.year.toInt() * MONTHS_PER_YEAR + (date.month.toInt() - 1) + months
        return PMCalendarDate(
            year = index.floorDiv(MONTHS_PER_YEAR).toDouble(),
            month = (index.mod(MONTHS_PER_YEAR) + 1).toDouble(),
            day = 1.0,
        )
    }

    /** The month index of a date, for comparing months: year × 12 + month. */
    fun monthIndex(date: PMCalendarDate): Int = date.year.toInt() * MONTHS_PER_YEAR + date.month.toInt()

    /**
     * `YYYY-MM` as its year and month, or null when the text is not a month:
     * four digits, a dash and two digits, a year from 1 and a month from 1 to
     * 12 (the engine's `monthDraft`).
     */
    fun month(text: String?): PMMonth? {
        val parts = text?.split('-') ?: return null
        if (parts.size != 2 || parts[0].length != 4 || parts[1].length != 2) return null
        if (!parts.all { part -> part.all { it in '0'..'9' } }) return null
        val year = parts[0].toInt()
        val month = parts[1].toInt()
        return if (year >= 1 && month in 1..MONTHS_PER_YEAR) PMMonth(year, month) else null
    }

    /** A month as `YYYY-MM`, the year in four digits, so two months compare as text (the engine's `monthFieldValue`). */
    fun monthText(month: PMMonth): String = "${month.year.toString().padStart(4, '0')}-${two(month.month)}"

    /**
     * Whether a month is before `min` or after `max`, each `YYYY-MM` text. A
     * bound that is not a month bounds nothing, and no month is never out of
     * its bounds (the engine's `monthOutOfBounds`).
     */
    fun monthOutOfBounds(value: PMMonth?, min: String?, max: String?): Boolean {
        if (value == null) return false
        val low = month(min)
        val high = month(max)
        return (low != null && value < low) || (high != null && value > high)
    }

    /**
     * The month's weeks, a row of seven days each from the week's first day
     * (0 being Sunday), null for a day of another month: the grid draws no
     * days from other months (`calendar.md`).
     */
    fun weeks(month: PMCalendarDate, firstDayOfWeek: Int): List<List<PMCalendarDate?>> {
        val first = monthOf(month)
        val lead = (weekday(first) - firstDayOfWeek).mod(DAYS_PER_WEEK)
        val count = daysIn(first.year.toInt(), first.month.toInt())
        val cells = MutableList<PMCalendarDate?>(lead) { null }
        for (day in 1..count) cells += first.copy(day = day.toDouble())
        while (cells.size % DAYS_PER_WEEK != 0) cells += null
        return cells.chunked(DAYS_PER_WEEK)
    }

    /**
     * Whether a day can be chosen: inside `minValue` and `maxValue`, and not
     * refused by the app's `unavailable` policy.
     */
    fun available(
        date: PMCalendarDate,
        minValue: PMCalendarDate?,
        maxValue: PMCalendarDate?,
        unavailable: ((PMCalendarDate) -> Boolean)?,
    ): Boolean {
        val key = key(date)
        if (minValue != null && key < key(minValue)) return false
        if (maxValue != null && key > key(maxValue)) return false
        return unavailable?.invoke(date) != true
    }

    /**
     * Whether a range can be chosen: every day from `start` to `end`, both
     * included, is `available`, because a range spans no refused day
     * (`date-range-picker.md`). The bounds are checked at the ends alone,
     * which is enough when no day is refused.
     */
    fun spanAvailable(
        start: PMCalendarDate,
        end: PMCalendarDate,
        minValue: PMCalendarDate?,
        maxValue: PMCalendarDate?,
        unavailable: ((PMCalendarDate) -> Boolean)?,
    ): Boolean {
        if (!available(start, minValue, maxValue, unavailable) || !available(end, minValue, maxValue, unavailable)) return false
        if (unavailable == null) return true
        for (day in epochDay(start) + 1 until epochDay(end)) {
            if (!available(fromEpochDay(day), minValue, maxValue, unavailable)) return false
        }
        return true
    }

    /**
     * The day a calendar marks as today: `LocalPMToday` when the app provides
     * it, otherwise the system clock's date in UTC.
     */
    val today: PMCalendarDate
        @Composable @ReadOnlyComposable get() =
            LocalPMToday.current ?: fromUtcMillis(Clock.System.now().toEpochMilliseconds())

    /**
     * The week's first day in a region, 0 being Sunday: CLDR's week data, in
     * which most of the world starts on Monday.
     */
    fun firstDayOfWeek(region: String): Int = when (region.uppercase()) {
        in SUNDAY_REGIONS -> 0
        in SATURDAY_REGIONS -> 6
        in FRIDAY_REGIONS -> 5
        else -> 1
    }

    /**
     * Whether a region's clock has twelve hours, from CLDR's time data, or
     * null for a locale that names no region.
     */
    fun twelveHour(region: String): Boolean? =
        if (region.isEmpty()) null else region.uppercase() in TWELVE_HOUR_REGIONS

    private const val MILLIS_PER_DAY = 86_400_000L
    private const val DAYS_PER_ERA = 146_097L
    private const val DAYS_BEFORE_EPOCH = 719_468L
    private const val DAYS_PER_WEEK = 7
    private const val MONTHS_PER_YEAR = 12
    private const val THURSDAY = 4L

    private val SUNDAY_REGIONS = (
        "AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX " +
            "MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW"
        ).split(" ").toSet()
    private val SATURDAY_REGIONS = "AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY".split(" ").toSet()
    private val FRIDAY_REGIONS = setOf("MV")
    private val TWELVE_HOUR_REGIONS = (
        "AE AG AS AU BB BD BH BM BN BS CA CO DM DZ EG EH FJ FM GD GM GU GY HK IN IQ JM JO KI KN KR KW KY " +
            "LB LC LR LY MH MO MP MR MW MY NZ OM PH PK PR PS QA SA SB SD SG SL SS SY SZ TC TN TT TW UM US " +
            "VC VG VI YE ZM"
        ).split(" ").toSet()
}

/**
 * The day a calendar marks as today. An app provides it from its clock in the
 * person's time zone: `java.util.Calendar.getInstance()`'s year, month and day
 * as a `PMCalendarDate`, because `java.time` needs API 26. A fixture provides
 * a fixed day, so its render does not change with the day it is drawn on.
 * Unprovided, it is the system clock's date in UTC. The member module's common
 * source set reaches no time zone, because `java.time` is outside its imports
 * and `kotlinx-datetime` is not one of its dependencies. Material's own
 * pickers read the zone themselves.
 */
val LocalPMToday = compositionLocalOf<PMCalendarDate?> { null }

/** A month of the Gregorian calendar: what MonthInput holds, and writes as `YYYY-MM` (`month-input.md`). */
data class PMMonth(val year: Int, val month: Int) : Comparable<PMMonth> {
    override fun compareTo(other: PMMonth): Int = compareValuesBy(this, other, { it.year }, { it.month })
}

/* A locale's names ---------------------------------------------------------- */

/**
 * A locale's names for what the date and time members show, as Material 3's
 * date formatter writes them: the month and year a grid shows, a date in the
 * locale's medium and full forms, the weekdays' short names, a day's number
 * and the day periods. `region` is the locale's region; `firstDayOfWeek` is
 * the week's first day, 0 being Sunday, and `twelveHour` whether its clock has
 * twelve hours. `pattern` is an empty date's placeholder in the locale's
 * order (`MM/dd/yyyy`, `dd.MM.yyyy`), from its medium date, as the web shows
 * its unfilled segments.
 */
@Immutable
class PMDateText internal constructor(
    val region: String,
    val firstDayOfWeek: Int,
    val twelveHour: Boolean,
    private val monthYearOf: (Long) -> String,
    private val mediumOf: (Long) -> String,
    private val fullOf: (Long) -> String,
    private val weekdayOf: (Long) -> String,
    private val dayOf: (Long) -> String,
    private val periodOf: (Long) -> String,
    private val monthNameOf: (Long) -> String,
) {
    /** The month and year, `March 2026`. */
    fun monthYear(date: PMCalendarDate): String = monthYearOf(PMDates.utcMillis(PMDates.monthOf(date)))

    /** A month's name standing alone, `August`, 1 being January. */
    fun monthName(month: Int): String =
        monthNameOf(PMDates.utcMillis(PMCalendarDate(year = PROBE.year, month = month.toDouble(), day = 1.0)))

    /**
     * Whether the locale writes a month's year before its month, from the
     * order of its medium date (`2026/11/22` in `ja-JP`).
     */
    val yearFirst: Boolean by lazy { pattern.indexOf(YEAR_PART) < pattern.indexOf(MONTH_PART) }

    /** The separator a month and its year are written with, from the medium date's: `/`, `.` or `-`. */
    val monthSeparator: String by lazy {
        pattern.firstOrNull { !it.isLetterOrDigit() }?.toString() ?: SLASH
    }

    /** The date in the locale's medium form, `Mar 18, 2026`. */
    fun medium(date: PMCalendarDate): String = mediumOf(PMDates.utcMillis(date))

    /** The date in full, `Wednesday, March 18, 2026`: a day's spoken name. */
    fun full(date: PMCalendarDate): String = fullOf(PMDates.utcMillis(date))

    /** A weekday's short name, 0 being Sunday. 1970-01-04 was a Sunday. */
    fun weekday(day: Int): String = weekdayOf(PMDates.utcMillis(PMDates.fromEpochDay(SUNDAY_EPOCH_DAY + day)))

    /** The day's number in the locale's digits. */
    fun day(date: PMCalendarDate): String = dayOf(PMDates.utcMillis(date))

    /** The day period's name, `AM` or `PM`. */
    fun dayPeriod(pm: Boolean): String = periodOf(if (pm) AFTERNOON_MILLIS else MORNING_MILLIS)

    /** An empty date's placeholder in the locale's order. */
    val pattern: String by lazy { patternOf(mediumOf(PMDates.utcMillis(PROBE))) }

    private companion object {
        const val SUNDAY_EPOCH_DAY = 3L
        const val MORNING_MILLIS = 3_600_000L
        const val AFTERNOON_MILLIS = 46_800_000L

        /** A date whose day, month and year differ in every digit, to find their order. */
        val PROBE = PMCalendarDate(year = 2026.0, month = 11.0, day = 22.0)
        const val PROBE_DAY = "22"
        const val PROBE_MONTH = "11"
        const val PROBE_YEAR = "2026"
        const val DAY_PART = "dd"
        const val MONTH_PART = "MM"
        const val YEAR_PART = "yyyy"
        const val SLASH = "/"

        /**
         * The order of the day, the month and the year in a medium date, joined
         * by its separator when it writes the month as a number, by a slash
         * when it writes it as a word.
         */
        fun patternOf(medium: String): String {
            val day = medium.indexOf(PROBE_DAY)
            val year = medium.indexOf(PROBE_YEAR)
            val numericMonth = medium.indexOf(PROBE_MONTH)
            val month = if (numericMonth >= 0) numericMonth else medium.indexOfFirst { it.isLetter() }
            if (day < 0 || year < 0 || month < 0) return listOf(DAY_PART, MONTH_PART, YEAR_PART).joinToString(SLASH)
            val separator = if (numericMonth >= 0) {
                medium.firstOrNull { !it.isLetterOrDigit() && !it.isWhitespace() }?.toString() ?: SLASH
            } else {
                SLASH
            }
            return listOf(day to DAY_PART, month to MONTH_PART, year to YEAR_PART)
                .sortedBy { it.first }
                .joinToString(separator) { it.second }
        }
    }
}

/**
 * Draws `content` with the names of `locale` (a BCP 47 tag; the app's locale
 * when null), the week starting on `firstDayOfWeek` when it is set (0 being
 * Sunday, else the region's), and the clock `twelveHour` sets (else the
 * region's when `locale` names one, else the platform's: on Android the
 * person's 12- or 24-hour setting). The content is drawn inside the Material
 * bridge, whose formatter writes the names.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PMDateLocale(
    locale: String?,
    firstDayOfWeek: Int? = null,
    twelveHour: Boolean? = null,
    content: @Composable (PMDateText) -> Unit,
) {
    PMMaterialTheme {
        val platformTwelve = !rememberTimePickerState().is24hour
        val tag = locale ?: Locale.current.toLanguageTag()
        val text = remember(tag, firstDayOfWeek, twelveHour, platformTwelve, locale == null) {
            dateText(tag, firstDayOfWeek, twelveHour, platformTwelve, given = locale != null)
        }
        content(text)
    }
}

/**
 * Material's calendar locale for a tag, the week starting on `firstDayOfWeek`
 * when it is set: Compose's platform locale, which is the class Material's
 * calendar locale names on the module's two targets. A `fw` Unicode extension
 * sets the week's first day for the platform's calendar, which Material's grid
 * reads.
 */
private fun calendarLocale(tag: String, firstDayOfWeek: Int?) = Locale(
    if (firstDayOfWeek == null || tag.contains(UNICODE_EXTENSION)) {
        tag
    } else {
        "$tag$UNICODE_EXTENSION$WEEK_KEY${WEEKDAY_KEYS[firstDayOfWeek]}"
    },
).platformLocale

private fun dateText(tag: String, firstDayOfWeek: Int?, twelveHour: Boolean?, platformTwelve: Boolean, given: Boolean): PMDateText {
    val compose = Locale(tag)
    val calendar = calendarLocale(tag, null)
    val plain = DatePickerDefaults.dateFormatter()
    val weekday = DatePickerDefaults.dateFormatter(selectedDateSkeleton = WEEKDAY_SKELETON)
    val day = DatePickerDefaults.dateFormatter(selectedDateSkeleton = DAY_SKELETON)
    val period = DatePickerDefaults.dateFormatter(selectedDateSkeleton = PERIOD_SKELETON)
    val monthName = DatePickerDefaults.dateFormatter(selectedDateSkeleton = MONTH_SKELETON)
    val region = compose.region
    return PMDateText(
        region = region,
        firstDayOfWeek = firstDayOfWeek ?: PMDates.firstDayOfWeek(region),
        twelveHour = twelveHour ?: (if (given) PMDates.twelveHour(region) else null) ?: platformTwelve,
        monthYearOf = { plain.formatMonthYear(it, calendar).orEmpty() },
        mediumOf = { plain.formatDate(it, calendar).orEmpty() },
        fullOf = { plain.formatDate(it, calendar, forContentDescription = true).orEmpty() },
        weekdayOf = { weekday.formatDate(it, calendar).orEmpty() },
        dayOf = { day.formatDate(it, calendar).orEmpty() },
        periodOf = { period.formatDate(it, calendar).orEmpty() },
        monthNameOf = { monthName.formatDate(it, calendar).orEmpty() },
    )
}

/** The formatter's patterns for what its default skeletons do not write. */
private const val WEEKDAY_SKELETON = "EEE"
private const val DAY_SKELETON = "d"
private const val PERIOD_SKELETON = "a"
private const val MONTH_SKELETON = "LLLL"
private const val UNICODE_EXTENSION = "-u-"
private const val WEEK_KEY = "fw-"
private val WEEKDAY_KEYS = listOf("sun", "mon", "tue", "wed", "thu", "fri", "sat")

/* The field ---------------------------------------------------------------- */

/**
 * Input's container as the date and time fields draw it (`date-picker.md`,
 * the field row): the surface, border, seat and focus ring of every state
 * (`pmFieldBox`), at the size's height, padded at the start and, unless an
 * embedded button ends the row (`trailing`), at the end, the content a row
 * at the size's gap. `held` keeps the hover border, as an open picker's field
 * does. `modifier` carries the member's identity and the tap that focuses or
 * opens the field.
 */
@Composable
fun PMDateFieldBox(
    size: PMControlSize,
    invalid: Boolean,
    disabled: Boolean,
    readOnly: Boolean,
    held: Boolean,
    focused: Boolean,
    trailing: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    val metrics = PMControlMetrics(size, PM.theme)
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .pmHitTarget()
            .hoverable(interaction, enabled = !disabled)
            .pmFieldBox(invalid = invalid, disabled = disabled, readOnly = readOnly, focused = focused, hovered = hovered, held = held)
            .heightIn(min = metrics.height)
            .padding(start = metrics.padding, end = if (trailing) 0.dp else metrics.padding),
        horizontalArrangement = Arrangement.spacedBy(metrics.gap),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/* The time segments --------------------------------------------------------- */

/**
 * The time segments (`time-input.md`, from `date-picker.md`'s cells): the
 * hour, a `:` separator in `text.muted`, the minute when `minutes` is set,
 * and the day period on a twelve-hour clock, in the size's type with tabular
 * figures. An unfilled segment shows its pattern (`hh` or `HH`, `mm`) in
 * `text.muted`; the focused segment takes the accent wash in `radius.sm` and
 * `accent.text`, the transient position and not a choice, and no caret is
 * drawn. Each digit segment is a text field with the number keyboard, so a
 * phone shows its keypad: a first digit no second digit can follow is the
 * whole segment (`9` is `09`), a full segment moves to the next, a second
 * digit out of range is refused, and typing into a full segment starts it
 * again. Up and down step the segment, wrapping; right at a segment's end and
 * left at its start move between segments; backspace in an empty segment
 * moves back. The day period is a button that toggles AM and PM, and the
 * period's initial typed into a segment sets it. Each segment and the day
 * period is centred in a slot the hit target wide, so neighbouring touch
 * areas meet without overlapping; the field's own hit area gives them their
 * height.
 *
 * `hour` (0 to 23) and `minute` are the time shown, null while empty. Each
 * change is reported as a complete time, the hour 0 to 23 and the minute, null
 * when `minutes` is not set, or as two nulls when a segment is emptied. Each
 * segment is named `name`, on the part that holds its digits
 * (`pmFieldName`), and reports `error` while it is set; the separator and a
 * placeholder are not spoken.
 */
@Composable
fun PMTimeSegments(
    hour: Int?,
    minute: Int?,
    minutes: Boolean,
    text: PMDateText,
    size: PMControlSize,
    name: String?,
    error: String?,
    disabled: Boolean,
    readOnly: Boolean,
    onChange: (hour: Int?, minute: Int?) -> Unit,
    modifier: Modifier = Modifier,
    first: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    val theme = PM.theme
    val colors = theme.colors
    val metrics = PMControlMetrics(size, theme)
    val twelve = text.twelveHour
    val shown = hour?.let { if (twelve) twelveOf(it) else it }
    var hourDigits by remember { mutableStateOf(digits(shown)) }
    var minuteDigits by remember { mutableStateOf(digits(minute)) }
    var pm by remember { mutableStateOf((hour ?: 0) >= NOON) }
    var reported by remember { mutableStateOf(hour to minute) }
    val second = remember { FocusRequester() }
    val periodFocus = remember { FocusRequester() }
    var focusedParts by remember { mutableStateOf(0) }
    val change by rememberUpdatedState(onChange)

    // A time set from outside replaces what the segments hold; the time they
    // reported comes back unchanged and leaves them as they are.
    LaunchedEffect(hour, minute, twelve) {
        if ((hour to minute) != reported) {
            hourDigits = digits(hour?.let { if (twelve) twelveOf(it) else it })
            minuteDigits = digits(minute)
            pm = (hour ?: 0) >= NOON
            reported = hour to minute
        }
    }

    val commit: () -> Unit = {
        val h = hourDigits.text.toIntOrNull()?.takeIf { if (twelve) it in 1..NOON else it in 0 until HOURS }
        val m = minuteDigits.text.toIntOrNull()
        val next: Pair<Int?, Int?> = when {
            h == null || (minutes && m == null) -> null to null
            else -> (if (twelve) h % NOON + (if (pm) NOON else 0) else h) to (if (minutes) m else null)
        }
        val complete = next.first != null
        if (next != reported && (complete || reported.first != null)) {
            reported = next
            change(next.first, next.second)
        }
    }
    val periodInitials = remember(text) {
        text.dayPeriod(false).firstOrNull()?.lowercaseChar() to text.dayPeriod(true).firstOrNull()?.lowercaseChar()
    }
    val setPeriodFrom: (String) -> Unit = { typed ->
        if (twelve) {
            typed.lowercase().forEach { letter ->
                if (letter == periodInitials.first) pm = false
                if (letter == periodInitials.second) pm = true
            }
        }
    }

    val hourPlaceholder = if (twelve) HOUR_12_PLACEHOLDER else HOUR_24_PLACEHOLDER
    val muted = (if (disabled) colors.textDisabled else colors.textMuted).color

    // A time reads hours, then minutes, then the day period, from the left in
    // either layout direction, so the segments are laid out left to right,
    // and the right arrow moves to the segment drawn on the right.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier,
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PMDigitSegment(
                value = hourDigits,
                placeholder = hourPlaceholder,
                step = metrics.text,
                name = name,
                error = error,
                disabled = disabled,
                readOnly = readOnly,
                focus = first,
                onFocus = { focused -> focusedParts = if (focused) focusedParts or HOUR_BIT else focusedParts and HOUR_BIT.inv(); onFocusChange(focusedParts != 0) },
                onType = { next ->
                    if (next.text == hourDigits.text) {
                        hourDigits = next
                        return@PMDigitSegment
                    }
                    setPeriodFrom(next.text)
                    val (kept, full) = typed(hourDigits.text, next, if (twelve) NOON else HOURS - 1, refuseZero = twelve)
                    val grew = kept.length > hourDigits.text.length || (full && kept != hourDigits.text)
                    hourDigits = TextFieldValue(kept, TextRange(kept.length))
                    commit()
                    if (full && grew) (if (minutes) second else if (twelve) periodFocus else null)?.requestFocus()
                },
                onStep = { delta ->
                    val current = hourDigits.text.toIntOrNull() ?: if (twelve) NOON else 0
                    val next = if (twelve) (current - 1 + delta).mod(NOON) + 1 else (current + delta).mod(HOURS)
                    hourDigits = TextFieldValue(PMDates.two(next), TextRange(2))
                    commit()
                },
                onNext = { (if (minutes) second else if (twelve) periodFocus else null)?.requestFocus() },
                onPrevious = null,
            )
            if (minutes) {
                Separator(muted, metrics.text)
                PMDigitSegment(
                    value = minuteDigits,
                    placeholder = MINUTE_PLACEHOLDER,
                    step = metrics.text,
                    name = name,
                    error = error,
                    disabled = disabled,
                    readOnly = readOnly,
                    focus = second,
                    onFocus = { focused -> focusedParts = if (focused) focusedParts or MINUTE_BIT else focusedParts and MINUTE_BIT.inv(); onFocusChange(focusedParts != 0) },
                    onType = { next ->
                        if (next.text == minuteDigits.text) {
                            minuteDigits = next
                            return@PMDigitSegment
                        }
                        setPeriodFrom(next.text)
                        val (kept, full) = typed(minuteDigits.text, next, MINUTES - 1, refuseZero = false)
                        val grew = kept.length > minuteDigits.text.length || (full && kept != minuteDigits.text)
                        minuteDigits = TextFieldValue(kept, TextRange(kept.length))
                        commit()
                        if (full && grew && twelve) periodFocus.requestFocus()
                    },
                    onStep = { delta ->
                        val current = minuteDigits.text.toIntOrNull() ?: 0
                        minuteDigits = TextFieldValue(PMDates.two((current + delta).mod(MINUTES)), TextRange(2))
                        commit()
                    },
                    onNext = { if (twelve) periodFocus.requestFocus() },
                    onPrevious = { first.requestFocus() },
                )
            }
            if (twelve) {
                Period(
                    pm = pm,
                    label = text.dayPeriod(pm),
                    filled = hourDigits.text.isNotEmpty(),
                    step = metrics.text,
                    disabled = disabled,
                    readOnly = readOnly,
                    focus = periodFocus,
                    initials = periodInitials,
                    onFocus = { focused -> focusedParts = if (focused) focusedParts or PERIOD_BIT else focusedParts and PERIOD_BIT.inv(); onFocusChange(focusedParts != 0) },
                    onSet = { next ->
                        pm = next
                        commit()
                    },
                    onPrevious = { (if (minutes) second else first).requestFocus() },
                )
            }
        }
    }
}

/**
 * The digits a segment keeps after a change, and whether it is full: a
 * typed digit after a full segment starts it again; a first digit no second
 * digit can follow is padded and fills it; a second digit out of range is
 * refused.
 */
private fun typed(old: String, edited: TextFieldValue, max: Int, refuseZero: Boolean): Pair<String, Boolean> {
    var digits = edited.text.filter { it.isDigit() }
    if (old.length == 2 && digits.length > 2) {
        // The digit typed is the one before the caret.
        val entered = edited.text.getOrNull(edited.selection.start - 1)?.takeIf { it.isDigit() } ?: digits.last()
        digits = entered.toString()
    }
    digits = digits.take(2)
    return when (digits.length) {
        0 -> digits to false
        1 -> if (digits[0].digitToInt() * 10 > max) "0$digits" to true else digits to false
        else -> {
            val value = digits.toInt()
            if (value > max || (refuseZero && value == 0)) digits.take(1) to false else digits to true
        }
    }
}

private fun digits(value: Int?): TextFieldValue {
    val text = value?.let { PMDates.two(it) } ?: ""
    return TextFieldValue(text, TextRange(text.length))
}

/** An hour of the day on a twelve-hour clock: 0 and 12 are 12. */
private fun twelveOf(hour: Int): Int = if (hour % NOON == 0) NOON else hour % NOON

/**
 * One digit segment, which the time, month and duration fields are drawn
 * with. `onNext` and `onPrevious` move to the segments drawn on its right and
 * its left, and `onErase` to the one before it in reading order, which
 * backspace in an empty segment moves to: the one on the left unless the row
 * runs right to left. `said` is what the segment says beside its digits (a
 * month's name), and `empty` what it says while it has none. `onEnter`, when
 * set, is Enter's and the keyboard's Done action.
 */
@Composable
internal fun PMDigitSegment(
    value: TextFieldValue,
    placeholder: String,
    step: PMTextStyle,
    name: String?,
    error: String?,
    disabled: Boolean,
    readOnly: Boolean,
    focus: FocusRequester,
    onFocus: (Boolean) -> Unit,
    onType: (TextFieldValue) -> Unit,
    onStep: (Int) -> Unit,
    onNext: () -> Unit,
    onPrevious: (() -> Unit)?,
    onErase: (() -> Unit)? = onPrevious,
    said: String? = null,
    empty: String? = null,
    onEnter: (() -> Unit)? = null,
) {
    val theme = PM.theme
    val colors = theme.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val active = focused && !disabled
    val color = when {
        disabled -> colors.textDisabled
        active -> colors.accentText
        readOnly -> colors.textSecondary
        else -> colors.textPrimary
    }.color
    val style = step.textStyle.tabular(theme)
    // As wide as what it shows, the digits or the pattern, as a segment is on the web.
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val shown = value.text.ifEmpty { placeholder }
    val width = remember(shown, style) { with(density) { measurer.measure(shown, style).size.width.toDp() } }
    Box(
        modifier = Modifier
            // The slot the segment's touch area fills: the hit target wide,
            // the segment centred in it, so the touch areas of neighbouring
            // segments meet and do not overlap.
            .pmHitTarget(vertical = false)
            .clip(theme.rounded(theme.radius.sm))
            .background(if (active) colors.accentSubtle.color else Color.Transparent)
            .padding(horizontal = theme.defaultDensity.spacing.s1),
        contentAlignment = Alignment.Center,
    ) {
        BasicTextField(
            value = value,
            onValueChange = onType,
            modifier = Modifier
                .width(width)
                .focusRequester(focus)
                .onFocusChanged { onFocus(it.isFocused) }
                .onPreviewKeyEvent { event ->
                    if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    when {
                        event.key == Key.DirectionUp && !readOnly -> { onStep(1); true }
                        event.key == Key.DirectionDown && !readOnly -> { onStep(-1); true }
                        event.key == Key.DirectionRight && value.selection.start >= value.text.length -> { onNext(); true }
                        event.key == Key.DirectionLeft && value.selection.start == 0 && onPrevious != null -> { onPrevious(); true }
                        event.key == Key.Backspace && value.text.isEmpty() && onErase != null -> { onErase(); true }
                        event.key == Key.Enter && onEnter != null -> { onEnter(); true }
                        else -> false
                    }
                }
                .semantics {
                    error?.let { error(it) }
                    (if (value.text.isEmpty()) empty else said)?.let { stateDescription = it }
                },
            enabled = !disabled,
            readOnly = readOnly,
            textStyle = style.copy(color = color),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = if (onEnter != null) ImeAction.Done else ImeAction.Default,
            ),
            keyboardActions = KeyboardActions(onDone = { onEnter?.invoke() }),
            singleLine = true,
            interactionSource = interaction,
            // The segment's wash marks the position, so no caret is drawn.
            cursorBrush = SolidColor(Color.Transparent),
            decorationBox = { inner ->
                Box(Modifier.pmFieldName(name), contentAlignment = Alignment.Center) {
                    if (value.text.isEmpty()) {
                        Text(
                            text = placeholder,
                            style = style,
                            color = if (active) colors.accentText.color else (if (disabled) colors.textDisabled else colors.textMuted).color,
                            modifier = Modifier.semantics { hideFromAccessibility() },
                        )
                    }
                    inner()
                }
            },
        )
    }
}

/** The separator between the hour and the minute: punctuation, not spoken. */
@Composable
private fun Separator(color: Color, step: PMTextStyle) {
    Text(
        text = TIME_SEPARATOR,
        style = step.textStyle.tabular(PM.theme),
        color = color,
        modifier = Modifier.clearAndSetSemantics { hideFromAccessibility() },
    )
}

/** The day period segment: a button that toggles AM and PM. */
@Composable
private fun Period(
    pm: Boolean,
    label: String,
    filled: Boolean,
    step: PMTextStyle,
    disabled: Boolean,
    readOnly: Boolean,
    focus: FocusRequester,
    initials: Pair<Char?, Char?>,
    onFocus: (Boolean) -> Unit,
    onSet: (Boolean) -> Unit,
    onPrevious: () -> Unit,
) {
    val theme = PM.theme
    val colors = theme.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val active = focused && !disabled
    Box(
        modifier = Modifier
            .focusRequester(focus)
            .onFocusChanged { onFocus(it.isFocused) }
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || readOnly) return@onPreviewKeyEvent false
                val letter = event.utf16CodePoint.toChar().lowercaseChar()
                when {
                    event.key == Key.DirectionUp || event.key == Key.DirectionDown -> { onSet(!pm); true }
                    event.key == Key.DirectionLeft || event.key == Key.Backspace -> { onPrevious(); true }
                    letter == initials.first -> { onSet(false); true }
                    letter == initials.second -> { onSet(true); true }
                    else -> false
                }
            }
            .clickable(interactionSource = interaction, indication = null, enabled = !disabled && !readOnly) {
                onSet(!pm)
            }
            .semantics {
                contentDescription = label
                role = Role.Button
            }
            // The hit target wide, as a digit segment's slot is.
            .pmHitTarget(vertical = false)
            .clip(theme.rounded(theme.radius.sm))
            .background(if (active) colors.accentSubtle.color else Color.Transparent)
            .padding(horizontal = theme.defaultDensity.spacing.s1),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = step.textStyle,
            color = when {
                disabled -> colors.textDisabled
                active -> colors.accentText
                !filled -> colors.textMuted
                readOnly -> colors.textSecondary
                else -> colors.textPrimary
            }.color,
            maxLines = 1,
        )
    }
}

/* The month segments --------------------------------------------------------- */

/**
 * The month segments (`month-input.md`, from `date-picker.md`'s cells): the
 * month and the year in the locale's order (`mm/yyyy`, `yyyy/mm`), with the
 * separator its dates use between them in `text.muted`, in the size's type
 * with tabular figures, drawn in the layout's direction. Each is a digit
 * segment as the time's are: the month keeps the hour's rules on its 1 to 12
 * (`9` is `09`, `13` is refused), and the year takes four digits, a fifth
 * starting it again. Up and down step a segment and wrap at its ends, an
 * empty one taking its first value: January or year 1 going up, December or
 * 9999 going down (the engine's `stepSegment`). An unfilled segment shows
 * `mm` or `yyyy` muted and says `empty`; a filled month says its name.
 *
 * `month` and `year` are the month shown, null while empty. Each change is
 * reported as both parts, either null while its segment is empty or the year
 * is 0. Each segment is named `name` and reports `error` while it is set.
 */
@Composable
fun PMMonthSegments(
    month: Int?,
    year: Int?,
    text: PMDateText,
    size: PMControlSize,
    name: String?,
    error: String?,
    empty: String,
    disabled: Boolean,
    readOnly: Boolean,
    onChange: (month: Int?, year: Int?) -> Unit,
    modifier: Modifier = Modifier,
    first: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    val theme = PM.theme
    val colors = theme.colors
    val metrics = PMControlMetrics(size, theme)
    var monthDigits by remember { mutableStateOf(digits(month)) }
    var yearDigits by remember { mutableStateOf(yearDigitsOf(year)) }
    var reported by remember { mutableStateOf(month to year) }
    val second = remember { FocusRequester() }
    var focusedParts by remember { mutableStateOf(0) }
    val change by rememberUpdatedState(onChange)
    val rightToLeft = LocalLayoutDirection.current == LayoutDirection.Rtl

    // A month set from outside replaces what the segments hold; the month they
    // reported comes back unchanged and leaves them as they are.
    LaunchedEffect(month, year) {
        if ((month to year) != reported) {
            monthDigits = digits(month)
            yearDigits = yearDigitsOf(year)
            reported = month to year
        }
    }

    val commit: () -> Unit = {
        val m = monthDigits.text.toIntOrNull()?.takeIf { it in 1..NOON }
        val y = yearDigits.text.toIntOrNull()?.takeIf { it >= 1 }
        val next = m to y
        if (next != reported) {
            reported = next
            change(m, y)
        }
    }

    // The segments in reading order, and the focus each one hands on to.
    val yearFirst = text.yearFirst
    val monthFocus = if (yearFirst) second else first
    val yearFocus = if (yearFirst) first else second
    val muted = (if (disabled) colors.textDisabled else colors.textMuted).color
    val track: (Int) -> (Boolean) -> Unit = { bit ->
        { focused ->
            focusedParts = if (focused) focusedParts or bit else focusedParts and bit.inv()
            onFocusChange(focusedParts != 0)
        }
    }
    // The arrows move to the segment drawn on their side, so a right-to-left
    // row moves the other way through the reading order.
    val after: (FocusRequester) -> () -> Unit = { next -> { next.requestFocus() } }

    val monthSegment: @Composable (FocusRequester?, FocusRequester?) -> Unit = { next, previous ->
        PMDigitSegment(
            value = monthDigits,
            placeholder = MONTH_PLACEHOLDER,
            step = metrics.text,
            name = name,
            error = error,
            disabled = disabled,
            readOnly = readOnly,
            focus = monthFocus,
            onFocus = track(MONTH_BIT),
            onType = { edited ->
                if (edited.text == monthDigits.text) {
                    monthDigits = edited
                    return@PMDigitSegment
                }
                val (kept, full) = typed(monthDigits.text, edited, NOON, refuseZero = true)
                val grew = kept.length > monthDigits.text.length || (full && kept != monthDigits.text)
                monthDigits = TextFieldValue(kept, TextRange(kept.length))
                commit()
                if (full && grew && !yearFirst) yearFocus.requestFocus()
            },
            onStep = { delta ->
                val current = monthDigits.text.toIntOrNull()?.takeIf { it in 1..NOON }
                val next = if (current == null) (if (delta > 0) 1 else NOON) else (current - 1 + delta).mod(NOON) + 1
                monthDigits = TextFieldValue(PMDates.two(next), TextRange(2))
                commit()
            },
            onNext = { (if (rightToLeft) previous else next)?.requestFocus() },
            onPrevious = (if (rightToLeft) next else previous)?.let(after),
            onErase = previous?.let(after),
            said = monthDigits.text.toIntOrNull()?.takeIf { it in 1..NOON }?.let { text.monthName(it) },
            empty = empty,
        )
    }
    val yearSegment: @Composable (FocusRequester?, FocusRequester?) -> Unit = { next, previous ->
        PMDigitSegment(
            value = yearDigits,
            placeholder = YEAR_PLACEHOLDER,
            step = metrics.text,
            name = name,
            error = error,
            disabled = disabled,
            readOnly = readOnly,
            focus = yearFocus,
            onFocus = track(YEAR_BIT),
            onType = { edited ->
                if (edited.text == yearDigits.text) {
                    yearDigits = edited
                    return@PMDigitSegment
                }
                val kept = typedYear(yearDigits.text, edited)
                val full = kept.length == YEAR_DIGITS && kept != yearDigits.text
                yearDigits = TextFieldValue(kept, TextRange(kept.length))
                commit()
                if (full && yearFirst) monthFocus.requestFocus()
            },
            onStep = { delta ->
                val current = yearDigits.text.toIntOrNull()?.takeIf { it >= 1 }
                val next = if (current == null) (if (delta > 0) 1 else LAST_YEAR) else (current - 1 + delta).mod(LAST_YEAR) + 1
                yearDigits = yearDigitsOf(next)
                commit()
            },
            onNext = { (if (rightToLeft) previous else next)?.requestFocus() },
            onPrevious = (if (rightToLeft) next else previous)?.let(after),
            onErase = previous?.let(after),
            empty = empty,
        )
    }

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (yearFirst) yearSegment(monthFocus, null) else monthSegment(yearFocus, null)
        Text(
            text = text.monthSeparator,
            style = metrics.text.textStyle.tabular(theme),
            color = muted,
            modifier = Modifier.clearAndSetSemantics { hideFromAccessibility() },
        )
        if (yearFirst) monthSegment(null, yearFocus) else yearSegment(null, monthFocus)
    }
}

/**
 * The digits a year segment keeps after a change: at most four, and a digit
 * typed into a full segment starts it again.
 */
private fun typedYear(old: String, edited: TextFieldValue): String {
    val digits = edited.text.filter { it.isDigit() }
    if (old.length == YEAR_DIGITS && digits.length > YEAR_DIGITS) {
        val entered = edited.text.getOrNull(edited.selection.start - 1)?.takeIf { it.isDigit() } ?: digits.last()
        return entered.toString()
    }
    return digits.take(YEAR_DIGITS)
}

private fun yearDigitsOf(year: Int?): TextFieldValue {
    val text = year?.toString()?.padStart(YEAR_DIGITS, '0') ?: ""
    return TextFieldValue(text, TextRange(text.length))
}

private const val MONTH_BIT = 1
private const val YEAR_BIT = 2
private const val YEAR_DIGITS = 4
private const val LAST_YEAR = 9999
private const val MONTH_PLACEHOLDER = "mm"
private const val YEAR_PLACEHOLDER = "yyyy"

private const val NOON = 12
private const val HOURS = 24
private const val MINUTES = 60
private const val HOUR_BIT = 1
private const val MINUTE_BIT = 2
private const val PERIOD_BIT = 4
private const val TIME_SEPARATOR = ":"
private const val HOUR_12_PLACEHOLDER = "hh"
private const val HOUR_24_PLACEHOLDER = "HH"
private const val MINUTE_PLACEHOLDER = "mm"

/* Material's pickers ------------------------------------------------------- */

/**
 * Material 3's date picker, the platform's own (`design/platforms/android.json`):
 * the month grid with its year menu and its input mode, which is where a date
 * is typed. It is drawn in the pairing: the container `bg.overlay`, the chosen
 * day in the selection colours, today in `accent.text` with an `accent.bg`
 * ring, an unavailable day in `text.disabled`, the weekdays muted, and the
 * input mode's field in the field colours. `selected` is the chosen day;
 * `minValue`, `maxValue` and `unavailable` decide which days can be chosen;
 * `locale` names and orders what it shows and `firstDayOfWeek` starts its
 * weeks. `title` is the picker's title, Material's own ("Select date") when
 * null. A day chosen, by a tap or typed in the input mode, is reported.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PMDatePickerPanel(
    selected: PMCalendarDate?,
    minValue: PMCalendarDate?,
    maxValue: PMCalendarDate?,
    unavailable: ((PMCalendarDate) -> Boolean)?,
    locale: String?,
    firstDayOfWeek: Int?,
    title: String?,
    onPick: (PMCalendarDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val today = PMDates.today
    PMMaterialTheme {
        val refuse by rememberUpdatedState(unavailable)
        val tag = locale ?: Locale.current.toLanguageTag()
        val state = remember(tag, firstDayOfWeek, minValue, maxValue) {
            DatePickerState(
                locale = calendarLocale(tag, firstDayOfWeek),
                initialSelectedDateMillis = selected?.let { PMDates.utcMillis(it) },
                initialDisplayedMonthMillis = PMDates.utcMillis(shownMonth(selected, today, minValue, maxValue)),
                yearRange = years(minValue, maxValue),
                initialDisplayMode = DisplayMode.Picker,
                selectableDates = selectable(minValue, maxValue) { refuse },
            )
        }
        val pick by rememberUpdatedState(onPick)
        LaunchedEffect(state) {
            snapshotFlow { state.selectedDateMillis }.drop(1).collect { millis ->
                if (millis != null) pick(PMDates.fromUtcMillis(millis))
            }
        }
        val colors = pickerColors()
        DatePicker(
            state = state,
            modifier = modifier,
            colors = colors,
            title = {
                PickerTitle(title) {
                    DatePickerDefaults.DatePickerTitle(displayMode = state.displayMode, modifier = it, contentColor = colors.titleContentColor)
                }
            },
            headline = {
                PMDateLocale(locale, firstDayOfWeek) { text ->
                    PickerHeadline(text, listOf(state.selectedDateMillis), range = false)
                }
            },
            showModeToggle = true,
        )
    }
}

/**
 * Material 3's date range picker, the platform's own: the months in a
 * scrolling column, the first day pressed the start and the second the end,
 * and its input mode, in the pairing as `PMDatePickerPanel` is, the days
 * between the ends on the accent wash. A range is reported once both ends are
 * chosen and it spans no unavailable day; a half-made range is not. In the
 * calendar, a second press past an unavailable day starts a new range there;
 * in the input mode, typed ends that span one stay as they were typed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PMDateRangePickerPanel(
    start: PMCalendarDate?,
    end: PMCalendarDate?,
    minValue: PMCalendarDate?,
    maxValue: PMCalendarDate?,
    unavailable: ((PMCalendarDate) -> Boolean)?,
    locale: String?,
    firstDayOfWeek: Int?,
    title: String?,
    onPick: (PMDateRange) -> Unit,
    modifier: Modifier = Modifier,
) {
    val today = PMDates.today
    PMMaterialTheme {
        val refuse by rememberUpdatedState(unavailable)
        val tag = locale ?: Locale.current.toLanguageTag()
        val state = remember(tag, firstDayOfWeek, minValue, maxValue) {
            DateRangePickerState(
                locale = calendarLocale(tag, firstDayOfWeek),
                initialSelectedStartDateMillis = start?.let { PMDates.utcMillis(it) },
                initialSelectedEndDateMillis = end?.let { PMDates.utcMillis(it) },
                initialDisplayedMonthMillis = PMDates.utcMillis(shownMonth(start, today, minValue, maxValue)),
                yearRange = years(minValue, maxValue),
                initialDisplayMode = DisplayMode.Picker,
                selectableDates = selectable(minValue, maxValue) { refuse },
            )
        }
        val pick by rememberUpdatedState(onPick)
        LaunchedEffect(state) {
            snapshotFlow { state.selectedStartDateMillis to state.selectedEndDateMillis }.drop(1).collect { (from, to) ->
                if (from == null || to == null) return@collect
                val range = PMDateRange(PMDates.fromUtcMillis(from), PMDates.fromUtcMillis(to))
                // A range reaches only the unbroken run of available days
                // around its start. Material judges each day once, when it is
                // first drawn, so the days past that run cannot be disabled once
                // a start is pressed; a press past it starts a new range there
                // instead, as a press before the start does. Typed ends are the
                // person's own: they stay, and the range is not reported.
                when {
                    PMDates.spanAvailable(range.start, range.end, minValue, maxValue, refuse) -> pick(range)
                    state.displayMode == DisplayMode.Picker -> state.setSelection(startDateMillis = to, endDateMillis = null)
                }
            }
        }
        val colors = pickerColors()
        DateRangePicker(
            state = state,
            modifier = modifier,
            colors = colors,
            title = {
                PickerTitle(title) {
                    DateRangePickerDefaults.DateRangePickerTitle(displayMode = state.displayMode, modifier = it, contentColor = colors.titleContentColor)
                }
            },
            headline = {
                PMDateLocale(locale, firstDayOfWeek) { text ->
                    PickerHeadline(text, listOf(state.selectedStartDateMillis, state.selectedEndDateMillis), range = true)
                }
            },
            showModeToggle = true,
        )
    }
}

/**
 * A picker's headline: the chosen date, or the two ends of a range joined by
 * an en dash, in `locale`'s medium form, each end not yet chosen the locale's
 * pattern in `text.muted`, at the title's inset. A date is in the `3xl` step,
 * Material's headline step through the bridge; a range is in the `lg` step,
 * Material's range headline step, and its end moves to a second line when the
 * two do not fit. Material's own headline writes the platform's locale
 * whatever `locale` is, so the picker draws this one. It is a polite live
 * region, so a choice is announced.
 */
@Composable
private fun PickerHeadline(text: PMDateText, millis: List<Long?>, range: Boolean) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val style = (if (range) theme.text.lg else theme.text.text3xl).textStyle
    PMRowLayout(
        gap = space.s2,
        align = PMCrossAlign.Baseline,
        justify = PMMainJustify.Start,
        wrap = true,
        modifier = Modifier
            .padding(start = space.s6, end = space.s4, bottom = space.s4)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
    ) {
        millis.forEachIndexed { index, value ->
            val shown = value?.let { text.medium(PMDates.fromUtcMillis(it)) } ?: text.pattern
            val ink = (if (value == null) theme.colors.textMuted else theme.colors.textPrimary).color
            if (index == 0) {
                Text(shown, style = style, color = ink, maxLines = 1)
            } else {
                // The dash stays with the end it introduces when the line breaks.
                Row(horizontalArrangement = Arrangement.spacedBy(space.s2)) {
                    Text(EN_DASH, style = style, color = theme.colors.textMuted.color, modifier = Modifier.clearAndSetSemantics {})
                    Text(shown, style = style, color = ink, maxLines = 1)
                }
            }
        }
    }
}

/** The en dash between a range's ends: punctuation, so nothing in it to translate. */
private const val EN_DASH = "–"

/**
 * A picker's title, at Material's title inset in the space scale: `title` in
 * the label step, or Material's own when it is null.
 */
@Composable
private fun PickerTitle(title: String?, platform: @Composable (Modifier) -> Unit) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val inset = Modifier.padding(start = space.s6, end = space.s4, top = space.s5)
    if (title == null) {
        platform(inset)
    } else {
        Text(title, style = theme.text.sm.textStyle, color = theme.colors.textSecondary.color, modifier = inset)
    }
}

/** The month a picker opens on: the chosen day's, else today's, inside the bounds. */
private fun shownMonth(
    chosen: PMCalendarDate?,
    today: PMCalendarDate,
    minValue: PMCalendarDate?,
    maxValue: PMCalendarDate?,
): PMCalendarDate {
    val month = PMDates.monthOf(chosen ?: today)
    return when {
        chosen == null && minValue != null && PMDates.monthIndex(month) < PMDates.monthIndex(minValue) -> PMDates.monthOf(minValue)
        chosen == null && maxValue != null && PMDates.monthIndex(month) > PMDates.monthIndex(maxValue) -> PMDates.monthOf(maxValue)
        else -> month
    }
}

/** The years a picker offers: Material's range, narrowed to the bounds. */
private fun years(minValue: PMCalendarDate?, maxValue: PMCalendarDate?): IntRange {
    val range = DatePickerDefaults.YearRange
    return (minValue?.year?.toInt() ?: range.first)..(maxValue?.year?.toInt() ?: range.last)
}

/** The days a picker lets a person choose: inside the bounds, and not refused. */
@OptIn(ExperimentalMaterial3Api::class)
private fun selectable(
    minValue: PMCalendarDate?,
    maxValue: PMCalendarDate?,
    refused: () -> ((PMCalendarDate) -> Boolean)?,
) = run {
    object : SelectableDates {
        override fun isSelectableDate(utcTimeMillis: Long): Boolean =
            PMDates.available(PMDates.fromUtcMillis(utcTimeMillis), minValue, maxValue, refused())

        override fun isSelectableYear(year: Int): Boolean =
            (minValue == null || year >= minValue.year.toInt()) && (maxValue == null || year <= maxValue.year.toInt())
    }
}

/** Material's date picker colours from the pairing's roles. */
@Composable
private fun pickerColors() = PM.theme.colors.let { c ->
    DatePickerDefaults.colors(
        containerColor = c.bgOverlay.color,
        titleContentColor = c.textSecondary.color,
        headlineContentColor = c.textPrimary.color,
        weekdayContentColor = c.textMuted.color,
        subheadContentColor = c.textSecondary.color,
        navigationContentColor = c.textSecondary.color,
        yearContentColor = c.textPrimary.color,
        disabledYearContentColor = c.textDisabled.color,
        currentYearContentColor = c.accentText.color,
        selectedYearContentColor = c.selectionText.color,
        disabledSelectedYearContentColor = c.textDisabled.color,
        selectedYearContainerColor = c.selectionBg.color,
        disabledSelectedYearContainerColor = c.bgSubtle.color,
        dayContentColor = c.textPrimary.color,
        disabledDayContentColor = c.textDisabled.color,
        selectedDayContentColor = c.selectionText.color,
        disabledSelectedDayContentColor = c.textDisabled.color,
        selectedDayContainerColor = c.selectionBg.color,
        disabledSelectedDayContainerColor = c.bgSubtle.color,
        todayContentColor = c.accentText.color,
        todayDateBorderColor = c.accentBg.color,
        dayInSelectionRangeContentColor = c.textPrimary.color,
        dayInSelectionRangeContainerColor = c.accentSubtle.color,
        dividerColor = c.borderSubtle.color,
        dateTextFieldColors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = c.textPrimary.color,
            unfocusedTextColor = c.textPrimary.color,
            disabledTextColor = c.textDisabled.color,
            focusedContainerColor = c.bgSurface.color,
            unfocusedContainerColor = c.bgSurface.color,
            disabledContainerColor = c.bgSubtle.color,
            errorContainerColor = c.bgSurface.color,
            cursorColor = c.accentText.color,
            errorCursorColor = c.dangerText.color,
            focusedBorderColor = c.borderFocus.color,
            unfocusedBorderColor = c.borderField.color,
            disabledBorderColor = c.borderSubtle.color,
            errorBorderColor = c.dangerBorder.color,
            focusedLabelColor = c.accentText.color,
            unfocusedLabelColor = c.textSecondary.color,
            errorLabelColor = c.dangerText.color,
            focusedPlaceholderColor = c.textMuted.color,
            unfocusedPlaceholderColor = c.textMuted.color,
            focusedSupportingTextColor = c.textSecondary.color,
            unfocusedSupportingTextColor = c.textSecondary.color,
            errorSupportingTextColor = c.dangerText.color,
        ),
    )
}

/* Countdown's time ---------------------------------------------------------- */

/**
 * Countdown's time (`countdown.md`), the engine's `countdownMoment`,
 * `countdownLeft`, `countdownClock` and `countdownSpoken`: the moment `until`
 * names, the whole seconds left, and the digits and the words it writes. The
 * time left is always read from the clock and never counted down by
 * subtraction, so a late wake or a changed system clock cannot make it drift.
 * The module reaches no time zone, so an instant written without an offset is
 * read in UTC, as RelativeTime reads it, and no locale-aware formatter, so
 * the digits are Western and the words `PMStrings`' English.
 */
object PMCountdownTime {
    /**
     * The marks, in seconds left, at which a Countdown that announces says the
     * time left: one minute, which leaves more than the 20 seconds WCAG 2.2.1
     * asks a warning to leave, and ten seconds, the last notice.
     */
    val marks: List<Long> = listOf(60L, 10L)

    /** The moment `until` names, or null when it names none: a calendar date has no time of day to count to. */
    fun moment(until: String): Instant? {
        if (DATE_ONLY.matches(until)) return null
        return listOf(until, until + UTC, until + SECONDS + UTC).firstNotNullOfOrNull { runCatching { Instant.parse(it) }.getOrNull() }
    }

    /** Whole seconds from `now` to `moment`, rounded up and never below zero: `0:01` through the last second, `0:00` at the moment. */
    fun left(moment: Instant, now: Instant): Long =
        max(0L, ceil((moment - now).inWholeMilliseconds / SECOND_MS).toLong())

    /**
     * Whether a change from `previous` seconds left to `left` reached a mark.
     * The end is not a mark, and a count that starts below a mark has not
     * reached it.
     */
    fun marked(previous: Long, left: Long): Boolean = left > 0 && marks.any { previous > it && left <= it }

    /**
     * `299` is `4:59`, `3725` is `1:02:05`: minutes and two-digit seconds, with
     * the hours in front from an hour on and the minutes then in two digits,
     * the hours not grouped. Negative seconds are none.
     */
    fun clock(seconds: Long): String {
        val whole = max(0L, seconds)
        val hours = whole / HOUR
        val minutes = (whole % HOUR) / MINUTE
        val rest = whole % MINUTE
        val padded = { part: Long -> part.toString().padStart(2, '0') }
        return if (hours > 0) "$hours:${padded(minutes)}:${padded(rest)}" else "$minutes:${padded(rest)}"
    }

    /**
     * `299` is "4 minutes, 59 seconds": each unit that is not zero in
     * `strings`' words, one and other, joined by a comma, so TalkBack says
     * words and not "4 colon 59". No time at all is "0 seconds".
     */
    fun spoken(seconds: Long, strings: PMStrings): String {
        val whole = max(0L, seconds)
        val hours = whole / HOUR
        val minutes = (whole % HOUR) / MINUTE
        val rest = whole % MINUTE
        val said = buildList {
            if (hours > 0) add(if (hours == 1L) strings.relativeHour(hours.toDouble()) else strings.relativeHours(hours.toDouble()))
            if (minutes > 0) add(if (minutes == 1L) strings.relativeMinute(minutes.toDouble()) else strings.relativeMinutes(minutes.toDouble()))
            if (rest > 0) add(if (rest == 1L) strings.countdownSecond(rest.toDouble()) else strings.countdownSeconds(rest.toDouble()))
        }
        return if (said.isEmpty()) strings.countdownSeconds(0.0) else said.joinToString(LIST_SEPARATOR)
    }

    private val DATE_ONLY = Regex("""\d{4}-\d{2}-\d{2}""")
    private const val UTC = "Z"
    private const val SECONDS = ":00"
    private const val SECOND_MS = 1000.0
    private const val MINUTE = 60L
    private const val HOUR = 3_600L
    private const val LIST_SEPARATOR = ", "
}
