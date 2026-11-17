// Calendar (`design/components/calendar.md`): a month grid for choosing a
// date, drawn from the recipe, as the SwiftUI member draws it, `space.3`
// inside its own width: the header (the previous and next month buttons,
// Button's ghost/neutral/sm icon-only, around the month and year in `text.sm`
// with tabular figures), the weekday row in the locale's short names in
// `text.xs` `text.muted`, from the week's first day, and the weeks, with no
// days from other months. A day is the small control height square in
// `text.sm` with tabular figures, its cell the hit target wide. Under the
// pointer an available day takes the accent wash; a press is a ripple in the
// wash's third step, with press feedback. The chosen day takes the selection
// recipe (`selection.bg`, `selection.text`, a `selection.border` hairline), its
// hover `selection.bg.hover`. Today has an `accent.bg` hairline and
// `accent.text` unless it is chosen. A day outside `minValue` and `maxValue`,
// or one `isDateUnavailable` refuses, is struck through in `text.disabled`
// and cannot be chosen; `disabled` makes the whole grid inert. Changing the
// month slides the new one in by `space.2` from the side it comes from over
// the surface duration, and replaces the old one at once.
//
// Dates are `PMCalendarDate`s in the Gregorian calendar, never moments, so no
// time zone moves a day. `value` with `onChange` is the controlled pair, and a
// day chosen is reported as itself; `focusedValue` sets the month shown, and
// `onFocusChange` hears the month change, as the first day of the new month.
// `locale` names the months and the days and numbers them, through Material
// 3's date formatter; `firstDayOfWeek` overrides the region's first day (0
// being Sunday). Today is `LocalPMToday` when the app provides it, which an
// app does from its clock in the person's time zone, otherwise the system
// clock's date in UTC, because the member module reaches no time zone.
//
// Accessibility: the grid is Android's collection, each day a button named by
// its full date, in its row and column, selected while chosen and disabled
// while it cannot be chosen; the month's title is a heading and a polite live
// region, so a month change is announced; the weekday row is not spoken,
// because each day's name says its weekday; `ariaLabel` names the calendar.
// Arrow keys move between days through Compose's directional focus, so each
// day is a tab stop rather than the web's one roving stop. Not honoured:
// PageUp, PageDown, Home and End, which have no Compose default; an
// unavailable day is not keyboard-focusable, because Compose's disabled
// click leaves the focus order (TalkBack still reads it); `ariaLabelledby`,
// which names an element id Compose has none of.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.max

object PMCalendar : PMCalendarRendering {
    @Composable
    override fun Render(props: PMCalendarProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val motion = theme.defaultMotion
        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The controlled `value` when given (null inside it is no day),
        // otherwise the calendar's own.
        val current = if (props.value != null) props.value.value else own
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val messages = props.messages ?: PMSpecDefault.strings.calendarMessages
        val today = PMDates.today
        var month by remember { mutableStateOf(PMDates.monthOf(props.focusedValue ?: current ?: today)) }
        val shown = props.focusedValue?.let { PMDates.monthOf(it) } ?: month
        var forward by remember { mutableStateOf(true) }
        val pitch = max(density.controlHeight.sm, density.hitTarget).dp
        val step: (Int) -> Unit = { months ->
            forward = months > 0
            val next = PMDates.addMonths(shown, months)
            month = next
            props.onFocusChange?.invoke(next)
        }
        val pick: (PMCalendarDate) -> Unit = { day ->
            if (!PMDates.sameDay(day, current)) {
                own = day
                props.onChange?.invoke(day)
            }
        }
        val before = props.minValue?.let { PMDates.monthIndex(shown) <= PMDates.monthIndex(it) } ?: false
        val after = props.maxValue?.let { PMDates.monthIndex(shown) >= PMDates.monthIndex(it) } ?: false
        val attributes = buildMap {
            current?.let { put("selected", PMDates.iso(it)) }
            put("month", PMDates.iso(shown).dropLast(MONTH_DAY_SUFFIX))
            if (disabled) put("disabled", "true")
        }
        val travel = with(LocalDensity.current) { space.s2.roundToPx() }
        val ltr = LocalLayoutDirection.current == LayoutDirection.Ltr

        PMDateLocale(props.locale, props.firstDayOfWeek?.value) { text ->
            Column(
                modifier = Modifier
                    .pmMember("Calendar", attributes)
                    .semantics { props.ariaLabel?.let { contentDescription = it } }
                    .padding(space.s3)
                    .width(pitch * DAYS),
                verticalArrangement = Arrangement.spacedBy(space.s2),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().heightIn(min = density.controlHeight.sm.dp),
                    horizontalArrangement = Arrangement.spacedBy(space.s2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PMButton(
                        appearance = PMButtonAppearance.GhostNeutral,
                        disabled = disabled || before,
                        icon = PMIconRole.Previous,
                        iconOnly = true,
                        label = messages.previousMonth,
                        onClick = { step(-1) },
                        size = PMControlSize.Sm,
                    )
                    Text(
                        text = text.monthYear(shown),
                        style = theme.text.sm.textStyle.tabular(theme),
                        color = theme.colors.textPrimary.color,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        modifier = Modifier
                            .weight(1f)
                            .semantics {
                                heading()
                                liveRegion = LiveRegionMode.Polite
                            },
                    )
                    PMButton(
                        appearance = PMButtonAppearance.GhostNeutral,
                        disabled = disabled || after,
                        icon = PMIconRole.Next,
                        iconOnly = true,
                        label = messages.nextMonth,
                        onClick = { step(1) },
                        size = PMControlSize.Sm,
                    )
                }
                // The weekday row: each day's name says its weekday, so the row is not spoken.
                Row(Modifier.clearAndSetSemantics { hideFromAccessibility() }) {
                    for (column in 0 until DAYS) {
                        Text(
                            text = text.weekday((text.firstDayOfWeek + column) % DAYS),
                            style = theme.text.xs.textStyle,
                            color = theme.colors.textMuted.color,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            modifier = Modifier.width(pitch),
                        )
                    }
                }
                AnimatedContent(
                    targetState = shown,
                    transitionSpec = {
                        val enter = motion.easing.enter
                        val offset = if (forward == ltr) travel else -travel
                        (slideInHorizontally(enter.tween(motion.duration.surface)) { offset } + fadeIn(enter.tween(motion.duration.surface))) togetherWith
                            // The outgoing month is replaced, not dismissed.
                            fadeOut(snap()) using SizeTransform(clip = false) { _, _ -> snap() }
                    },
                    label = "month",
                ) { visible ->
                    val weeks = PMDates.weeks(visible, text.firstDayOfWeek)
                    Column(Modifier.semantics { collectionInfo = CollectionInfo(weeks.size, DAYS) }) {
                        weeks.forEachIndexed { row, week ->
                            Row {
                                week.forEachIndexed { column, day ->
                                    if (day == null) {
                                        Spacer(Modifier.size(pitch))
                                    } else {
                                        Day(
                                            day = day,
                                            text = text,
                                            chosen = PMDates.sameDay(day, current),
                                            today = PMDates.sameDay(day, today),
                                            unavailable = !PMDates.available(day, props.minValue, props.maxValue, props.isDateUnavailable),
                                            inert = disabled,
                                            pitch = pitch,
                                            row = row,
                                            column = column,
                                        ) { pick(day) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * One day: its square in its cell, coloured by its place (`calendar.md`,
     * the day rows). `unavailable` strikes it through; `inert` is a disabled
     * grid.
     */
    @Composable
    private fun Day(
        day: PMCalendarDate,
        text: PMDateText,
        chosen: Boolean,
        today: Boolean,
        unavailable: Boolean,
        inert: Boolean,
        pitch: Dp,
        row: Int,
        column: Int,
        pick: () -> Unit,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val off = unavailable || inert
        val active = !off && hovered
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val wash by animateColorAsState(
            when {
                chosen -> if (active) colors.selectionBgHover.color else colors.selectionBg.color
                active -> colors.accentSubtle.color
                else -> Color.Transparent
            },
            spec,
            label = "wash",
        )
        val ink by animateColorAsState(
            when {
                chosen -> colors.selectionText
                off -> colors.textDisabled
                today || active -> colors.accentText
                else -> colors.textPrimary
            }.color,
            spec,
            label = "ink",
        )
        // Today is a fact, not a choice: a border, never a fill. The
        // selection's recipe wins over it, and over a disabled or unavailable
        // day's colours, as the recipe orders them, so the value stays shown.
        val edge = when {
            chosen -> colors.selectionBorder.color
            today && !off -> colors.accentBg.color
            else -> Color.Transparent
        }
        val shape = theme.rounded(theme.radius.sm)
        val label = text.full(day)
        Box(
            modifier = Modifier
                .size(pitch)
                // Before the clearing semantics: the click gives the day its
                // action and its disabled state.
                .clickable(interactionSource = interaction, indication = null, enabled = !off, onClick = pick)
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                    if (chosen) selected = true
                    if (off) disabled()
                    collectionItemInfo = CollectionItemInfo(row, 1, column, 1)
                },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(theme.defaultDensity.controlHeight.sm.dp)
                    .pmPressFeedback(pressed && !off)
                    .pmFocusRing(focused && !off, theme.radius.sm.dp)
                    .clip(shape)
                    .background(wash)
                    .border(PMGeometry.hairline, edge, shape),
                contentAlignment = Alignment.Center,
            ) {
                if (!off && !chosen) PMPressLayer(interaction, colors.accentSubtleActive.color, Modifier.matchParentSize())
                Text(
                    text = text.day(day),
                    style = theme.text.sm.textStyle.tabular(theme).copy(
                        textDecoration = if (unavailable) TextDecoration.LineThrough else TextDecoration.None,
                    ),
                    color = ink,
                    maxLines = 1,
                )
            }
        }
    }

    /** Days in a week: the grid's columns. */
    private const val DAYS = 7

    /** `-18` of `2026-03-18`: what the month attribute leaves off. */
    private const val MONTH_DAY_SUFFIX = 3
}

/**
 * Calendar's states, from the spec's States table, on March 2026, so the
 * renders do not change with the day they are drawn on: today is provided
 * where the entry shows it.
 */
object CalendarStates : PMStates {
    override val member = "Calendar"

    private val chosen = PMCalendarDate(year = 2026.0, month = 3.0, day = 18.0)
    private const val due = "Due date"

    /** Whether a day falls on a Saturday or a Sunday. */
    private fun weekend(day: PMCalendarDate): Boolean = PMDates.weekday(day) == 0 || PMDates.weekday(day) == 6

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("month with selection", expect = mapOf("selected" to "2026-03-18", "month" to "2026-03", "label" to due)) {
                PMCalendar(ariaLabel = due, defaultValue = PMSome(chosen), locale = "en-US")
            },
            PMStateEntry("today visible — the 12th ringed, nothing chosen", expect = mapOf("month" to "2026-03")) {
                CompositionLocalProvider(LocalPMToday provides PMCalendarDate(year = 2026.0, month = 3.0, day = 12.0)) {
                    PMCalendar(ariaLabel = due, locale = "en-US")
                }
            },
            PMStateEntry("today chosen — the selection wins", expect = mapOf("selected" to "2026-03-18")) {
                CompositionLocalProvider(LocalPMToday provides chosen) {
                    PMCalendar(ariaLabel = due, defaultValue = PMSome(chosen), locale = "en-US")
                }
            },
            PMStateEntry("min and max bounds — the days outside struck", expect = mapOf("selected" to "2026-03-18")) {
                PMCalendar(
                    ariaLabel = due,
                    defaultValue = PMSome(chosen),
                    locale = "en-US",
                    maxValue = PMCalendarDate(year = 2026.0, month = 3.0, day = 24.0),
                    minValue = PMCalendarDate(year = 2026.0, month = 3.0, day = 10.0),
                )
            },
            PMStateEntry("unavailable dates — the weekends struck", expect = mapOf("selected" to "2026-03-18")) {
                PMCalendar(
                    ariaLabel = "Delivery day",
                    defaultValue = PMSome(chosen),
                    isDateUnavailable = { weekend(it) },
                    locale = "en-US",
                )
            },
            PMStateEntry("week start override — Monday first", expect = mapOf("selected" to "2026-03-18")) {
                PMCalendar(
                    ariaLabel = due,
                    defaultValue = PMSome(chosen),
                    firstDayOfWeek = PMFirstDayOfWeek.FirstDayOfWeek1,
                    locale = "en-US",
                )
            },
            PMStateEntry("locale de-DE — its names, Monday first by region", expect = mapOf("selected" to "2026-03-18")) {
                PMCalendar(ariaLabel = "Fälligkeitsdatum", defaultValue = PMSome(chosen), locale = "de-DE")
            },
            PMStateEntry("a short month — four rows", expect = mapOf("month" to "2026-02")) {
                PMCalendar(
                    ariaLabel = due,
                    firstDayOfWeek = PMFirstDayOfWeek.FirstDayOfWeek0,
                    focusedValue = PMCalendarDate(year = 2026.0, month = 2.0, day = 1.0),
                    locale = "en-US",
                )
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMCalendar(ariaLabel = due, defaultValue = PMSome(chosen), disabled = true, locale = "en-US")
            },
        )
}
