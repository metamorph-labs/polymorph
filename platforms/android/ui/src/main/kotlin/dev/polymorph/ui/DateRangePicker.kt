// DateRangePicker (`design/components/date-range-picker.md`): a start and an
// end date in one field, chosen on one range calendar. The field is Input's
// container at Input's sizes (`PMDateFieldBox`) holding the two dates, each in
// the locale's medium form or, while the range is empty, the locale's date
// pattern in `text.muted`, joined by an en dash in `text.muted` that is not
// spoken; then the clear button when `clearable` and a range is chosen, and
// the `calendar` button, Input's embedded button, named "Show calendar". A
// press on the dates or on the button opens the calendar.
//
// The calendar is the platform's own, the platform map's form: Material 3's
// date range picker (`PMDateRangePickerPanel`), the months in a scrolling
// column, the ends in the selection colours and the days between on the
// accent wash. Below 30rem of window width (`PMRecipe.dialogBelow`, the line
// Dialog draws at) it is a full-screen dialog on `bg.overlay`, inside the
// system bars, with a close button (Button's ghost/neutral icon-only `close`,
// named "Close") at its top; wider, it is a dialog window on the overlay
// surface, `space.10` × 4 wide, no taller than the window less `space.8` above
// and below. The window takes the back gesture and makes the screen behind it
// inert to TalkBack, and its content is outside the field that opens it
// (`PMOverlayContent`). The first day pressed is the start and the second the
// end; choosing the end reports both and closes the calendar, and a half-made
// range is never reported. Ranges are typed in the picker's input mode, which
// its mode toggle opens; typed ends that span an unavailable day stay as typed
// and are not reported. The web's sheet below 30rem does not apply, and
// `presentation` changes nothing.
//
// Dates are `PMCalendarDate`s with no time zone. `minValue`, `maxValue` and
// `isDateUnavailable` decide what the calendar offers. A range reaches only the
// unbroken run of available days around its start, as the web's calendar
// limits it: a press past an unavailable day starts a new range there, because
// Material judges each day's availability once, when the day is first drawn,
// so it cannot disable the days past the run once a start is pressed. A value
// outside the bounds, one that spans an unavailable day, or one whose end comes
// before its start marks the field invalid, as the web marks a typed range out
// of bounds or reversed. `locale` orders and names the dates and
// `firstDayOfWeek` (0 being Sunday) starts the calendar's weeks. `value` with
// `onChange` is the controlled pair; clearing reports null.
//
// The dates are one button named by `ariaLabel` or its FormField's label, its
// value the two dates joined by an en dash, and an invalid field reports its
// error (the FormField's message, else "Invalid"). The field draws the focus
// ring while the dates have keyboard focus. `messages.chooseRange` titles the
// calendar; without `messages` the title is Material's own, in the platform's
// language, and the dialog's pane is named "Choose a date range". Not
// honoured: `messages.previousMonth` and `messages.nextMonth`,
// because Material's range picker scrolls its months and has no month
// buttons; `startName`, `endName`, `id`, `ariaRequired` and the `aria-*by`
// ids, which have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.toSize
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/** The two forms of an open DateRangePicker's calendar. */
enum class PMDateRangeForm(val value: String) {
    /** The window, edge to edge: the form below 30rem. */
    FullScreen("full-screen"),

    /** A dialog of its own width, centred: the form from 30rem. */
    Centred("centred"),
}

object PMDateRangePicker : PMDateRangePickerRendering {
    @Composable
    override fun Render(props: PMDateRangePickerProps) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current

        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The controlled `value` when given (null inside it is no range),
        // otherwise the field's own.
        val current = if (props.value != null) props.value.value else own
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }
        // A range is refused when it is reversed, or when any day it spans
        // cannot be chosen, its ends included.
        val refused = current != null && (
            PMDates.key(current.end) < PMDates.key(current.start) ||
                !PMDates.spanAvailable(current.start, current.end, props.minValue, props.maxValue, props.isDateUnavailable)
            )
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false) || refused
        val name = props.ariaLabel ?: field?.label
        val failure = if (invalid) field?.error ?: strings.invalid else null
        val commit: (PMDateRange?) -> Unit = { next ->
            if (next != current) {
                own = next
                props.onChange?.invoke(next)
            }
        }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (open) "open" else "closed")
            if (current == null) put("placeholder", "true")
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
        }
        val showCalendar = props.messages?.showCalendar ?: strings.datePickerShowCalendar
        val clearLabel = props.messages?.clear ?: strings.clear

        PMDateLocale(props.locale, props.firstDayOfWeek?.value) { text ->
            val start = current?.let { text.medium(it.start) }
            val end = current?.let { text.medium(it.end) }
            val shown = if (start != null && end != null) "$start$SPACED_DASH$end" else null
            PMDateFieldBox(
                size = size,
                invalid = invalid,
                disabled = disabled,
                readOnly = false,
                held = open,
                focused = focused && !disabled,
                trailing = true,
                modifier = Modifier.pmMember("DateRangePicker", attributes),
            ) {
                Row(
                    modifier = Modifier
                        // The room before the buttons, which stay at the end:
                        // the dates give up width before the buttons do.
                        .weight(1f)
                        // Before the clearing semantics: the click gives the
                        // dates their action and their disabled state.
                        .clickable(interactionSource = interaction, indication = null, enabled = !disabled) { open = true }
                        .clearAndSetSemantics {
                            contentDescription = name ?: shown ?: text.pattern
                            shown?.let { stateDescription = it }
                            role = Role.Button
                            failure?.let { error(it) }
                        }
                        .heightIn(min = metrics.height),
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val style = metrics.text.textStyle.tabular(theme)
                    val ink = when {
                        disabled -> colors.textDisabled
                        current == null -> colors.textMuted
                        else -> colors.textPrimary
                    }.color
                    Text(start ?: text.pattern, style = style, color = ink, maxLines = 1)
                    Text(EN_DASH, style = style, color = (if (disabled) colors.textDisabled else colors.textMuted).color)
                    Text(end ?: text.pattern, style = style, color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                // The clear button fades in over the control duration, as Input's does.
                AnimatedVisibility(
                    visible = (props.clearable ?: false) && current != null && !disabled,
                    enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                    exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
                ) {
                    PMEmbeddedButton(PMIconRole.Clear, clearLabel, size, onClick = { commit(null) })
                }
                PMEmbeddedButton(PMIconRole.Calendar, showCalendar, size, onClick = { open = true }, enabled = !disabled)
            }
            if (open) {
                val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.toSize().toDpSize() }
                val form = if (window.width < PMRecipe.dialogBelow) PMDateRangeForm.FullScreen else PMDateRangeForm.Centred
                Dialog(
                    onDismissRequest = { open = false },
                    properties = DialogProperties(usePlatformDefaultWidth = false),
                ) {
                    PMOverlayContent {
                        PMDateRangeCalendar(props, current, form, window) { range ->
                            open = false
                            if (range != null) commit(range)
                        }
                    }
                }
            }
        }
    }

    /** The en dash between the two dates: punctuation, so nothing in it to translate. */
    private const val EN_DASH = "–"
    private const val SPACED_DASH = " – "
}

/**
 * The open calendar in its `form`: full-screen, the window on `bg.overlay`
 * inside the system bars, the close button above Material's range picker;
 * centred, the picker on the overlay surface, `space.10` × 4 wide and no taller
 * than `window` less `space.8` above and below, when there is a window to fit.
 * `done` hears the chosen range, or null when the calendar is closed without
 * one.
 */
@Composable
fun PMDateRangeCalendar(
    props: PMDateRangePickerProps,
    value: PMDateRange?,
    form: PMDateRangeForm,
    window: DpSize?,
    done: (PMDateRange?) -> Unit,
) {
    val theme = PM.theme
    val colors = theme.colors
    val space = theme.defaultDensity.spacing
    val chooseRange = props.messages?.chooseRange
    val pane = chooseRange ?: PMSpecDefault.strings.dateRangePickerChooseRange
    val attributes = mapOf("state" to "open", "form" to form.value)
    val panel: @Composable (Modifier) -> Unit = { modifier ->
        PMDateRangePickerPanel(
            start = value?.start,
            end = value?.end,
            minValue = props.minValue,
            maxValue = props.maxValue,
            unavailable = props.isDateUnavailable,
            locale = props.locale,
            firstDayOfWeek = props.firstDayOfWeek?.value,
            title = chooseRange,
            onPick = { done(it) },
            modifier = modifier,
        )
    }
    when (form) {
        PMDateRangeForm.FullScreen -> Column(
            Modifier
                .pmMember("DateRangePicker", attributes)
                .semantics { paneTitle = pane }
                .fillMaxSize()
                .background(colors.bgOverlay.color)
                .windowInsetsPadding(WindowInsets.safeDrawing),
        ) {
            Box(Modifier.fillMaxWidth().padding(horizontal = space.s3, vertical = space.s2)) {
                PMButton(
                    appearance = PMButtonAppearance.GhostNeutral,
                    icon = PMIconRole.Close,
                    iconOnly = true,
                    label = PMSpecDefault.strings.close,
                    onClick = { done(null) },
                    size = PMControlSize.Sm,
                )
            }
            panel(Modifier.weight(1f))
        }
        PMDateRangeForm.Centred -> panel(
            Modifier
                .pmMember("DateRangePicker", attributes)
                .semantics { paneTitle = pane }
                .width(space.s10 * PMRecipe.dialogWidthSm)
                .then(if (window != null) Modifier.heightIn(max = window.height - PMGeometry.bothEdges(space.s8)) else Modifier.heightIn(max = space.s10 * PMRecipe.dialogWidthLg))
                .pmOverlaySurface(colors.bgOverlay, colors.borderSubtle)
                .clip(theme.rounded(theme.radius.surface)),
        )
    }
}

/**
 * DateRangePicker's states, from the spec's States table, on the report
 * window June 1 to 14, 2026. The open entries draw Material's range picker in
 * its full-screen dialog window over a phone-tall canvas; the centred entry
 * draws the calendar's wider form in place, laid out at a tablet's width.
 */
object DateRangePickerStates : PMStates {
    override val member = "DateRangePicker"

    private const val window = "Report window"
    private val report = PMDateRange(
        start = PMCalendarDate(year = 2026.0, month = 6.0, day = 1.0),
        end = PMCalendarDate(year = 2026.0, month = 6.0, day = 14.0),
    )

    /** Whether a day falls on a Saturday or a Sunday. */
    private fun weekend(day: PMCalendarDate): Boolean = PMDates.weekday(day) == 0 || PMDates.weekday(day) == 6

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty — the locale's patterns", expect = mapOf("placeholder" to "true", "size" to "md", "state" to "closed")) {
                PMDateRangePicker(ariaLabel = window, locale = "en-US")
            },
            PMStateEntry("range filled", expect = mapOf("state" to "closed")) {
                PMDateRangePicker(ariaLabel = window, defaultValue = PMSome(report), locale = "en-US")
            },
            PMStateEntry("open with range — full screen on a phone", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDateRangePicker(ariaLabel = window, defaultOpen = true, defaultValue = PMSome(report), locale = "en-US")
                }
            },
            PMStateEntry("one-day range — open", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDateRangePicker(
                        ariaLabel = window,
                        defaultOpen = true,
                        defaultValue = PMSome(PMDateRange(report.start, report.start)),
                        locale = "en-US",
                    )
                }
            },
            PMStateEntry("unavailable inside — the weekends refused, titled", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDateRangePicker(
                        ariaLabel = window,
                        defaultOpen = true,
                        defaultValue = PMSome(PMDateRange(PMCalendarDate(year = 2026.0, month = 6.0, day = 8.0), PMCalendarDate(year = 2026.0, month = 6.0, day = 12.0))),
                        isDateUnavailable = { weekend(it) },
                        locale = "en-US",
                        messages = PMDateRangePickerMessages(
                            previousMonth = "Previous month",
                            nextMonth = "Next month",
                            showCalendar = "Show calendar",
                            clear = "Clear",
                            chooseRange = "Choose the report window",
                        ),
                    )
                }
            },
            PMStateEntry("out of range — after maxValue", expect = mapOf("invalid" to "true")) {
                PMDateRangePicker(
                    ariaLabel = window,
                    defaultValue = PMSome(report),
                    locale = "en-US",
                    maxValue = PMCalendarDate(year = 2026.0, month = 6.0, day = 10.0),
                )
            },
            PMStateEntry("across an unavailable day — the weekend inside refused", expect = mapOf("invalid" to "true")) {
                PMDateRangePicker(
                    ariaLabel = window,
                    defaultValue = PMSome(PMDateRange(report.start, PMCalendarDate(year = 2026.0, month = 6.0, day = 12.0))),
                    isDateUnavailable = { weekend(it) },
                    locale = "en-US",
                )
            },
            PMStateEntry("reversed — the end before the start", expect = mapOf("invalid" to "true")) {
                PMDateRangePicker(ariaLabel = window, defaultValue = PMSome(PMDateRange(report.end, report.start)), locale = "en-US")
            },
            PMStateEntry("clearable", expect = mapOf("state" to "closed")) {
                PMDateRangePicker(ariaLabel = window, clearable = true, defaultValue = PMSome(report), locale = "en-US")
            },
            PMStateEntry("locale de-DE", expect = mapOf("state" to "closed")) {
                PMDateRangePicker(ariaLabel = "Berichtszeitraum", defaultValue = PMSome(report), locale = "de-DE")
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMDateRangePicker(ariaLabel = window, locale = "en-US", size = PMControlSize.Sm)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMDateRangePicker(ariaLabel = window, invalid = true, locale = "en-US")
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMDateRangePicker(ariaLabel = window, defaultValue = PMSome(report), disabled = true, locale = "en-US")
            },
            PMStateEntry("centred on a tablet", expect = mapOf("state" to "open", "form" to "centred")) {
                PMFixtureWidth(PMGeometry.compactWidth) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        PMDateRangeCalendar(
                            PMDateRangePickerProps(ariaLabel = window, locale = "en-US"),
                            report,
                            PMDateRangeForm.Centred,
                            window = null,
                        ) {}
                    }
                }
            },
        )
}
