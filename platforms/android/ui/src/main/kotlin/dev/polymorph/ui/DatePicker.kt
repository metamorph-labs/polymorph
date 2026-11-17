// DatePicker (`design/components/date-picker.md`): a date field with a
// calendar. The field is Input's container at Input's sizes (`PMDateFieldBox`)
// holding the date in the locale's medium form (`Mar 18, 2026`), or, while
// empty, the locale's date pattern (`MM/dd/yyyy`, `dd.MM.yyyy`) in
// `text.muted`, as the web's unfilled segments show; then the clear button
// when `clearable` and a date is chosen, and the `calendar` button, Input's
// embedded button in the clear slot the spec places it in, named "Show
// calendar". A press on the date or on the button opens the calendar.
//
// The calendar is the platform's own, the platform map's form: Material 3's
// date picker (`PMDatePickerPanel`) in a modal dialog window, on the overlay
// surface, at every window size, no taller than the window less `space-8`
// above and below, and scrolling inside that when it does not fit. The window
// takes the back gesture and makes the screen behind it inert to TalkBack, and
// the platform dims behind it; its content is outside the field that opens it
// (`PMOverlayContent`). A date is typed in the picker's input mode, which its
// mode toggle opens, so the field shows the date rather than taking
// keystrokes; choosing a day, or completing a typed one, fills the field and
// closes the dialog. The web's sheet below 30rem does not apply, and
// `presentation` changes nothing.
//
// Dates are `PMCalendarDate`s with no time zone: at `day` granularity the
// value is the day alone; at `hour` and `minute` it carries `hour` and
// `minute`, the web's `CalendarDateTime`, and the time is TimeInput's segments
// after the date (`PMTimeSegments`), typed and stepped, never picked, on the
// clock the locale's region keeps (the platform's when `locale` is not set).
// The calendar sets the date part and keeps the time; the value is reported
// when both are complete, and a date chosen before its time waits in the
// field. At `hour` granularity the value's minute passes through unchanged.
// `minValue`, `maxValue` and `isDateUnavailable` decide what the calendar
// offers; a value outside them marks the field invalid, as a typed date out
// of range does on the web. `locale` orders and names the date's parts and
// `firstDayOfWeek` (0 being Sunday) starts the calendar's weeks. `value` with
// `onChange` is the controlled pair; clearing reports null.
//
// The date is a button named by `ariaLabel` or its FormField's label, its
// value the date's medium form, and an invalid field reports its error (the
// FormField's message, else "Invalid"), as `aria-invalid` is announced. The
// field draws the focus ring while the date or a time segment has keyboard
// focus. `messages.chooseDate` titles the calendar; without `messages` the
// title is Material's own, in the platform's language, and the dialog's pane
// is named "Choose a date". Not honoured:
// `messages.previousMonth` and `messages.nextMonth`, because Material's month
// buttons carry their own names; `name`, `id`, `ariaRequired` and the
// `aria-*by` ids, which have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

object PMDatePicker : PMDatePickerRendering {
    @Composable
    override fun Render(props: PMDatePickerProps) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val granularity = props.granularity ?: PMDatePickerGranularity.Day
        val timed = granularity != PMDatePickerGranularity.Day

        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The controlled `value` when given (null inside it is no date),
        // otherwise the field's own.
        val current = if (props.value != null) props.value.value else own
        // A date or a time entered before the other waits here until the
        // value is complete.
        var waitingDate by remember { mutableStateOf<PMCalendarDate?>(null) }
        var waitingTime by remember { mutableStateOf<Pair<Int, Int?>?>(null) }
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }

        val day = current?.let { PMCalendarDate(year = it.year, month = it.month, day = it.day) } ?: waitingDate
        val time: Pair<Int, Int?>? = current?.let { value -> value.hour?.let { it.toInt() to value.minute?.toInt() } } ?: waitingTime
        val refused = current != null && !PMDates.available(current, props.minValue, props.maxValue, props.isDateUnavailable)
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false) || refused
        val name = props.ariaLabel ?: field?.label
        val failure = if (invalid) field?.error ?: strings.invalid else null

        val commit: (PMCalendarDate?) -> Unit = { next ->
            waitingDate = null
            waitingTime = null
            if (next != current) {
                own = next
                props.onChange?.invoke(next)
            }
        }
        /** The value from a date and a time, the time's minute the value's own at `hour` granularity. */
        val combine: (PMCalendarDate, Pair<Int, Int?>) -> PMCalendarDate = { date, (hour, minute) ->
            date.copy(
                hour = hour.toDouble(),
                minute = (if (granularity == PMDatePickerGranularity.Minute) minute else current?.minute?.toInt())?.toDouble() ?: 0.0,
            )
        }
        val pickDate: (PMCalendarDate) -> Unit = { date ->
            open = false
            when {
                !timed -> commit(date)
                time != null -> commit(combine(date, time))
                else -> {
                    if (current != null) commit(null)
                    waitingDate = date
                }
            }
        }
        val setTime: (Int?, Int?) -> Unit = { hour, minute ->
            when {
                hour == null -> {
                    waitingDate = day
                    waitingTime = null
                    if (current != null) {
                        own = null
                        props.onChange?.invoke(null)
                    }
                }
                day != null -> commit(combine(day, hour to minute))
                else -> waitingTime = hour to minute
            }
        }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val dateInteraction = remember { MutableInteractionSource() }
        val dateFocused by dateInteraction.collectIsFocusedAsState()
        var timeFocused by remember { mutableStateOf(false) }
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (open) "open" else "closed")
            put("granularity", granularity.value)
            if (day == null) put("placeholder", "true")
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
        }
        val showCalendar = props.messages?.showCalendar ?: strings.datePickerShowCalendar
        val clearLabel = props.messages?.clear ?: strings.clear
        val firstDay = props.firstDayOfWeek?.value

        PMDateLocale(props.locale, firstDay) { text ->
            val shown = day?.let { text.medium(it) }
            PMDateFieldBox(
                size = size,
                invalid = invalid,
                disabled = disabled,
                readOnly = false,
                held = open,
                focused = (dateFocused || timeFocused) && !disabled,
                trailing = true,
                modifier = Modifier.pmMember("DatePicker", attributes),
            ) {
                // The date and, right after it, the time, in the room before
                // the buttons, which stay at the end.
                Row(
                    Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            // The date gives up width first, so the time's
                            // segments and the buttons keep their touch areas.
                            .weight(1f, fill = false)
                            // Before the clearing semantics: the click gives the
                            // date its action and its disabled state.
                            .clickable(interactionSource = dateInteraction, indication = null, enabled = !disabled) { open = true }
                            .clearAndSetSemantics {
                                (name ?: shown ?: text.pattern).let { contentDescription = it }
                                shown?.let { stateDescription = it }
                                role = Role.Button
                                failure?.let { error(it) }
                            }
                            .heightIn(min = metrics.height),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(
                            text = shown ?: text.pattern,
                            style = metrics.text.textStyle.tabular(theme),
                            color = when {
                                disabled -> colors.textDisabled
                                shown == null -> colors.textMuted
                                else -> colors.textPrimary
                            }.color,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (timed) {
                        PMTimeSegments(
                            hour = time?.first,
                            minute = if (granularity == PMDatePickerGranularity.Minute) time?.second else null,
                            minutes = granularity == PMDatePickerGranularity.Minute,
                            text = text,
                            size = size,
                            name = name,
                            error = failure,
                            disabled = disabled,
                            readOnly = false,
                            onChange = setTime,
                            onFocusChange = { timeFocused = it },
                        )
                    }
                }
                // The clear button fades in over the control duration, as Input's does.
                AnimatedVisibility(
                    visible = (props.clearable ?: false) && day != null && !disabled,
                    enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                    exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
                ) {
                    PMEmbeddedButton(PMIconRole.Clear, clearLabel, size, onClick = { commit(null) })
                }
                PMEmbeddedButton(PMIconRole.Calendar, showCalendar, size, onClick = { open = true }, enabled = !disabled)
            }
            if (open) {
                val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() }
                Dialog(
                    onDismissRequest = { open = false },
                    properties = DialogProperties(usePlatformDefaultWidth = false),
                ) {
                    PMOverlayContent {
                        val chooseDate = props.messages?.chooseDate
                        val pane = chooseDate ?: strings.datePickerChooseDate
                        PMDatePickerPanel(
                            selected = day,
                            minValue = props.minValue,
                            maxValue = props.maxValue,
                            unavailable = props.isDateUnavailable,
                            locale = props.locale,
                            firstDayOfWeek = firstDay,
                            title = chooseDate,
                            onPick = pickDate,
                            modifier = Modifier
                                .semantics { paneTitle = pane }
                                .heightIn(max = window - PMGeometry.bothEdges(theme.defaultDensity.spacing.s8))
                                .pmOverlaySurface(colors.bgOverlay, colors.borderSubtle)
                                .clip(theme.rounded(theme.radius.surface))
                                .verticalScroll(rememberScrollState()),
                        )
                    }
                }
            }
        }
    }
}

/**
 * DatePicker's states, from the spec's States table, on March 2026. The open
 * entry draws Material's date picker in its dialog window over the canvas, on
 * a phone-tall canvas.
 */
object DatePickerStates : PMStates {
    override val member = "DatePicker"

    private const val due = "Due date"
    private val chosen = PMCalendarDate(year = 2026.0, month = 3.0, day = 18.0)

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty — the locale's pattern", expect = mapOf("placeholder" to "true", "size" to "md", "state" to "closed")) {
                PMDatePicker(ariaLabel = due, locale = "en-US")
            },
            PMStateEntry("filled", expect = mapOf("state" to "closed", "granularity" to "day")) {
                PMDatePicker(ariaLabel = due, defaultValue = PMSome(chosen), locale = "en-US")
            },
            PMStateEntry("open — Material's date picker in a dialog", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDatePicker(ariaLabel = due, defaultOpen = true, defaultValue = PMSome(chosen), locale = "en-US")
                }
            },
            PMStateEntry("open, titled, Monday first", expect = mapOf("state" to "open")) {
                PMFixturePhone {
                    PMDatePicker(
                        ariaLabel = due,
                        defaultOpen = true,
                        defaultValue = PMSome(chosen),
                        firstDayOfWeek = PMFirstDayOfWeek.FirstDayOfWeek1,
                        locale = "en-US",
                        messages = PMDatePickerMessages(
                            previousMonth = "Previous month",
                            nextMonth = "Next month",
                            showCalendar = "Show calendar",
                            clear = "Clear",
                            chooseDate = "Choose a due date",
                        ),
                    )
                }
            },
            PMStateEntry("locale order — de-DE", expect = mapOf("placeholder" to "true")) {
                PMDatePicker(ariaLabel = "Fälligkeitsdatum", locale = "de-DE")
            },
            PMStateEntry("filled — de-DE", expect = mapOf("state" to "closed")) {
                PMDatePicker(ariaLabel = "Fälligkeitsdatum", defaultValue = PMSome(chosen), locale = "de-DE")
            },
            PMStateEntry("clearable", expect = mapOf("state" to "closed")) {
                PMDatePicker(ariaLabel = due, clearable = true, defaultValue = PMSome(chosen), locale = "en-US")
            },
            PMStateEntry("out of range — after maxValue", expect = mapOf("invalid" to "true")) {
                PMDatePicker(
                    ariaLabel = due,
                    defaultValue = PMSome(chosen),
                    locale = "en-US",
                    maxValue = PMCalendarDate(year = 2026.0, month = 3.0, day = 10.0),
                )
            },
            PMStateEntry("a refused date — invalid", expect = mapOf("invalid" to "true")) {
                PMDatePicker(ariaLabel = "Delivery day", defaultValue = PMSome(chosen), isDateUnavailable = { true }, locale = "en-US")
            },
            PMStateEntry("datetime — the time after the date", expect = mapOf("granularity" to "minute")) {
                PMDatePicker(
                    ariaLabel = "Starts",
                    defaultValue = PMSome(PMCalendarDate(year = 2026.0, month = 3.0, day = 18.0, hour = 9.0, minute = 30.0)),
                    granularity = PMDatePickerGranularity.Minute,
                    locale = "en-US",
                )
            },
            PMStateEntry("datetime, empty — de-DE's 24-hour clock", expect = mapOf("granularity" to "minute", "placeholder" to "true")) {
                PMDatePicker(ariaLabel = "Beginn", granularity = PMDatePickerGranularity.Minute, locale = "de-DE")
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMDatePicker(ariaLabel = due, locale = "en-US", size = PMControlSize.Sm)
            },
            PMStateEntry("lg", expect = mapOf("size" to "lg")) {
                PMDatePicker(ariaLabel = due, defaultValue = PMSome(chosen), locale = "en-US", size = PMControlSize.Lg)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMDatePicker(ariaLabel = due, invalid = true, locale = "en-US")
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMDatePicker(ariaLabel = due, defaultValue = PMSome(chosen), disabled = true, locale = "en-US")
            },
        )
}
