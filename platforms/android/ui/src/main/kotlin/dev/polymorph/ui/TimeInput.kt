// TimeInput (`design/components/time-input.md`): a time of day with no date,
// typed into segments with no popup. It is Input's container at Input's sizes
// (`PMDateFieldBox`) holding the time segments (`PMTimeSegments`), the cells
// DatePicker's time granularities share: the hour, a `:` in `text.muted`, the
// minute, and the day period on a twelve-hour clock. An unfilled segment shows
// its pattern (`hh`, `HH`, `mm`) muted, and the focused one the accent wash.
// Each digit segment is a text field with the number keyboard, so a phone
// shows its keypad; digits type through and advance, up and down step the
// segment, and the day period is a button that toggles AM and PM. A tap
// anywhere in the field focuses the hour. There is no glyph and no popup, as
// the spec decides. The SwiftUI member draws the system's compact time picker
// instead; Android's own time picker is a dial in a dialog, so the segments
// the spec describes are drawn here, from Compose's text fields.
//
// The value is a `PMTime`, a wall-clock time with no date and no time zone. It
// is reported once the segments hold a complete time and as null when one is
// emptied; editing keeps the seconds and milliseconds a supplied value carries,
// and at `hour` granularity, which drops the minute segment, the value's
// minute too. `hourCycle` sets the clock; without it the clock is the region's
// that `locale` names, or, with no `locale`, the platform's (on Android the
// person's 12- or 24-hour setting). `locale` names the day periods.
// `readOnly` keeps the segments focusable and selectable, and neither digits
// nor arrows edit them. `value` with `onChange` is the controlled pair.
//
// Each segment is named by `ariaLabel` or its FormField's label, and an
// invalid field reports its error (the FormField's message, else "Invalid")
// on each, as `aria-invalid` is announced; the separator and the patterns are
// not spoken. The field draws the focus ring while a segment has focus. Not
// honoured: the separator is the colon in every locale; `name`, `id`,
// `ariaRequired` and the `aria-*by` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.pointer.pointerInput

object PMTimeInput : PMTimeInputRendering {
    @Composable
    override fun Render(props: PMTimeInputProps) {
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val readOnly = props.readOnly ?: false
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val granularity = props.granularity ?: PMTimeInputGranularity.Minute
        val minutes = granularity == PMTimeInputGranularity.Minute

        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The controlled `value` when given (null inside it is no time),
        // otherwise the field's own.
        val current = if (props.value != null) props.value.value else own
        val name = props.ariaLabel ?: field?.label
        val failure = if (invalid) field?.error ?: strings.invalid else null
        val first = remember { FocusRequester() }
        var focused by remember { mutableStateOf(false) }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val commit: (Int?, Int?) -> Unit = { hour, minute ->
            val next = hour?.let {
                PMTime(
                    hour = it.toDouble(),
                    minute = minute?.toDouble() ?: current?.minute ?: 0.0,
                    second = current?.second ?: 0.0,
                    millisecond = current?.millisecond ?: 0.0,
                )
            }
            if (next != current) {
                own = next
                props.onChange?.invoke(next)
            }
        }
        val attributes = buildMap {
            put("size", size.value)
            put("granularity", granularity.value)
            if (current == null) put("placeholder", "true")
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (readOnly) put("readonly", "true")
        }
        val twelve = props.hourCycle?.let { it == PMTimeInputHourCycle.HourCycle12 }

        PMDateLocale(props.locale, twelveHour = twelve) { text ->
            PMDateFieldBox(
                size = size,
                invalid = invalid,
                disabled = disabled,
                readOnly = readOnly,
                held = false,
                focused = focused && !disabled,
                trailing = false,
                modifier = Modifier
                    .pmMember("TimeInput", attributes)
                    // A tap anywhere in the field focuses the hour, as a tap in
                    // Input's frame focuses its text.
                    .pointerInput(disabled) { detectTapGestures { if (!disabled) first.requestFocus() } },
            ) {
                PMTimeSegments(
                    hour = current?.hour?.toInt(),
                    minute = if (minutes) current?.minute?.toInt() else null,
                    minutes = minutes,
                    text = text,
                    size = size,
                    name = name,
                    error = failure,
                    disabled = disabled,
                    readOnly = readOnly,
                    onChange = commit,
                    first = first,
                    onFocusChange = { focused = it },
                )
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** TimeInput's states, from the spec's States table. */
object TimeInputStates : PMStates {
    override val member = "TimeInput"

    private const val opens = "Opens at"
    private val nine = PMTime(hour = 9.0, minute = 0.0, second = 0.0, millisecond = 0.0)
    private val evening = PMTime(hour = 17.0, minute = 45.0, second = 0.0, millisecond = 0.0)

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty — the pattern", expect = mapOf("placeholder" to "true", "size" to "md", "granularity" to "minute")) {
                PMTimeInput(ariaLabel = opens, locale = "en-US")
            },
            PMStateEntry("filled — a business-hours start", expect = mapOf("granularity" to "minute")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(nine), locale = "en-US")
            },
            PMStateEntry("12-hour clock — the afternoon", expect = mapOf("granularity" to "minute")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(evening), hourCycle = PMTimeInputHourCycle.HourCycle12, locale = "en-US")
            },
            PMStateEntry("24-hour clock — no day period", expect = mapOf("granularity" to "minute")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(evening), hourCycle = PMTimeInputHourCycle.HourCycle24, locale = "en-US")
            },
            PMStateEntry("locale cycle — de-DE, 24-hour by its region", expect = mapOf("granularity" to "minute")) {
                PMTimeInput(ariaLabel = "Öffnet um", defaultValue = PMSome(evening), locale = "de-DE")
            },
            PMStateEntry("hour only", expect = mapOf("granularity" to "hour")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(nine), granularity = PMTimeInputGranularity.Hour, locale = "en-US")
            },
            PMStateEntry("readOnly", expect = mapOf("readonly" to "true")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(nine), locale = "en-US", readOnly = true)
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(nine), locale = "en-US", size = PMControlSize.Sm)
            },
            PMStateEntry("lg", expect = mapOf("size" to "lg")) {
                PMTimeInput(ariaLabel = opens, locale = "en-US", size = PMControlSize.Lg)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMTimeInput(ariaLabel = opens, invalid = true, locale = "en-US")
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMTimeInput(ariaLabel = opens, defaultValue = PMSome(nine), disabled = true, locale = "en-US")
            },
        )
}
