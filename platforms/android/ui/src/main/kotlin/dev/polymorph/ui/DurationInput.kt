// DurationInput (`design/components/duration-input.md`): a length of time in
// whole seconds, typed as counts of days, hours, minutes or seconds. It is
// Input's container at Input's sizes (`PMDateFieldBox`) holding one quantity
// per unit shown, largest first: the count, a digit segment as TimeInput's
// are (`PMDigitSegment`), and its unit's short word in `text.muted` beside it
// on the side the locale writes it, `space.1` apart, the quantities `space.3`
// apart. An empty count shows `––` muted, and the focused one the accent
// wash. Each count is a text field with the number keyboard, so a phone shows
// its keypad. Material's time picker holds a clock's hours and minutes, and a
// duration's largest unit has no ceiling, so the spec's counts are drawn here
// from Compose's text fields, as TimeInput draws its time.
//
// The arithmetic is the engine's, in `PolymorphUIDurations.kt`. Digits type
// into a count and move on once no further digit could fit; a count below the
// largest stays under the next unit shown, so 90 is refused in the minutes
// under hours, and the largest takes as many digits as `max` allows. Typed and
// erased digits are a draft, committed when focus leaves the field or on
// Enter (the keyboard's Done); up and down step a count, carrying into the
// next unit, and commit at once. A commit holds the seconds inside `min` and
// `max`, moved inwards to whole counts of the smallest unit, redraws the
// counts, and reports through `onChange` only a value that differs. A value
// the units cannot write is drawn rounded to the nearest count of the smallest
// unit and kept until the reader changes a count. `readOnly` keeps the counts
// focusable and selectable, and neither digits nor arrows edit them. `value`
// with `onChange` is the controlled pair: a value the app changes replaces the
// counts. The row follows the layout's direction.
//
// The words are the app's to give (`LocalPMDurationWords`, from Android's
// `MeasureFormat`), else `PMStrings`' English. Each count is named by
// `ariaLabel` or its FormField's label and its unit ("Inactivity lifetime
// minute"), says its count with the unit's long word ("15 minutes"), or
// `messages.empty` while it is empty, and an invalid field reports its error
// (the FormField's message, else "Invalid") on each; the words beside the
// counts are not spoken. `locale` reaches the app's words; the English has
// one. `name`, `id`, `ariaRequired` and the `aria-*by` ids have no Compose
// counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.LayoutDirection

object PMDurationInput : PMDurationInputRendering {
    @Composable
    override fun Render(props: PMDurationInputProps) {
        val theme = PM.theme
        val colors = theme.colors
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val readOnly = props.readOnly ?: false
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val label = props.ariaLabel ?: field?.label
        val failure = if (invalid) field?.error ?: strings.invalid else null
        val empty = props.messages?.empty ?: strings.durationInputMessages.empty
        val app = LocalPMDurationWords.current
        val words = { count: Long, unit: PMDurationUnit, long: Boolean ->
            app?.words(count, unit, long, props.locale) ?: PMDurationCounts.english(strings, count, unit, long)
        }
        val options = PMDurationOptions(units = props.units, min = props.min, max = props.max)
        val units = PMDurationCounts.units(props.units)

        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The seconds the field holds: the controlled `value` when given (null
        // inside it is the empty field), otherwise the field's own.
        val value = if (props.value != null) props.value.value else own
        // The digits each count holds, a draft between commits, and the value
        // they were last drawn from.
        var texts by remember { mutableStateOf(textsOf(PMDurationCounts.draft(value, options))) }
        var drawnFrom by remember { mutableStateOf(value) }
        LaunchedEffect(value, units) {
            if (value != drawnFrom) {
                texts = textsOf(PMDurationCounts.draft(value, options))
                drawnFrom = value
            }
        }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val commit: (PMDurationDraft) -> Unit = { draft ->
            val result = PMDurationCounts.commit(draft, value, options)
            texts = textsOf(result.draft)
            drawnFrom = result.value
            if (result.changed) {
                own = result.value
                props.onChange?.invoke(result.value)
            }
        }
        val draft = { texts.mapNotNull { (unit, text) -> text.text.toLongOrNull()?.let { unit to it } }.toMap() }

        val focus = remember(units) { units.map { FocusRequester() } }
        var focusedParts by remember { mutableStateOf(0) }
        val rightToLeft = LocalLayoutDirection.current == LayoutDirection.Rtl
        val attributes = buildMap {
            put("size", size.value)
            put("units", units.joinToString(UNIT_LIST) { it.value })
            if (value == null) put("placeholder", "true") else put("seconds", PMDurationCounts.round(value).toLong().toString())
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (readOnly) put("readonly", "true")
        }

        PMDateFieldBox(
            size = size,
            invalid = invalid,
            disabled = disabled,
            readOnly = readOnly,
            held = false,
            focused = focusedParts != 0 && !disabled,
            trailing = false,
            modifier = Modifier
                .pmMember("DurationInput", attributes)
                // A tap anywhere in the field focuses its first count, as a tap
                // in Input's frame focuses its text.
                .pointerInput(disabled) { detectTapGestures { if (!disabled) focus.first().requestFocus() } },
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                units.forEachIndexed { at, unit ->
                    val text = texts[unit] ?: TextFieldValue()
                    val count = text.text.toLongOrNull()
                    val parts = PMDurationCounts.parts(words(count ?: 0L, unit, false))
                    val name = PMDurationCounts.parts(words(1L, unit, true)).word
                    val next = focus.getOrNull(at + 1)
                    val previous = focus.getOrNull(at - 1)
                    val word: @Composable () -> Unit = {
                        Text(
                            text = parts.word,
                            style = metrics.text.textStyle,
                            color = (if (disabled) colors.textDisabled else colors.textMuted).color,
                            maxLines = 1,
                            modifier = Modifier.clearAndSetSemantics { hideFromAccessibility() },
                        )
                    }
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (parts.wordFirst) word()
                        PMDigitSegment(
                            value = text,
                            placeholder = PLACEHOLDER,
                            step = metrics.text,
                            name = listOfNotNull(label, name).joinToString(UNIT_NAME),
                            error = failure,
                            disabled = disabled,
                            readOnly = readOnly,
                            focus = focus[at],
                            onFocus = { focused ->
                                val bit = 1 shl at
                                val was = focusedParts
                                focusedParts = if (focused) focusedParts or bit else focusedParts and bit.inv()
                                // Focus leaving the field commits what was typed; a move between its counts does not.
                                if (was != 0 && focusedParts == 0 && !readOnly) commit(draft())
                            },
                            onType = { edited ->
                                if (edited.text == text.text) {
                                    texts = texts + (unit to edited)
                                    return@PMDigitSegment
                                }
                                val (kept, full) = PMDurationCounts.typed(text.text, edited, PMDurationCounts.most(unit, options))
                                texts = texts + (unit to TextFieldValue(kept, TextRange(kept.length)))
                                if (full && kept != text.text) next?.requestFocus()
                            },
                            onStep = { delta -> commit(PMDurationCounts.step(draft(), unit, delta, options)) },
                            onNext = { (if (rightToLeft) previous else next)?.requestFocus() },
                            onPrevious = (if (rightToLeft) next else previous)?.let { requester -> { requester.requestFocus() } },
                            onErase = previous?.let { requester -> { requester.requestFocus() } },
                            said = count?.let { words(it, unit, true) },
                            empty = empty,
                            onEnter = { if (!readOnly) commit(draft()) },
                        )
                        if (!parts.wordFirst) word()
                    }
                }
            }
            Spacer(Modifier.weight(1f))
        }
    }

    /** A draft's counts as the digits each count's field holds. */
    private fun textsOf(draft: PMDurationDraft): Map<PMDurationUnit, TextFieldValue> =
        draft.mapValues { (_, count) -> count.toString().let { TextFieldValue(it, TextRange(it.length)) } }

    /** What an empty count shows, the web's dashes. */
    private const val PLACEHOLDER = "––"
    private const val UNIT_LIST = ","
    private const val UNIT_NAME = " "
}

/**
 * DurationInput's states, from the spec's States table, with the surveyed
 * screens' own values: an inactivity lifetime of seven days, an absolute
 * lifetime of thirty, and a five-minute timeout.
 */
object DurationInputStates : PMStates {
    override val member = "DurationInput"

    private const val lifetime = "Inactivity lifetime"
    private const val week = 604_800.0

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty", expect = mapOf("size" to "md", "placeholder" to "true")) {
                PMDurationInput(ariaLabel = lifetime)
            },
            PMStateEntry("filled", expect = mapOf("size" to "md", "seconds" to "604800")) {
                PMDurationInput(ariaLabel = lifetime, defaultValue = PMSome(week))
            },
            PMStateEntry("days only", expect = mapOf("units" to "days", "seconds" to "2592000")) {
                PMDurationInput(ariaLabel = "Absolute lifetime", defaultValue = PMSome(2_592_000.0), units = listOf(PMDurationUnit.Days))
            },
            PMStateEntry("with seconds", expect = mapOf("units" to "minutes,seconds", "seconds" to "300")) {
                PMDurationInput(
                    ariaLabel = "Request timeout",
                    defaultValue = PMSome(300.0),
                    units = listOf(PMDurationUnit.Minutes, PMDurationUnit.Seconds),
                )
            },
            PMStateEntry("bounded", expect = mapOf("seconds" to "900")) {
                PMDurationInput(ariaLabel = lifetime, defaultValue = PMSome(900.0), max = week, min = 900.0)
            },
            PMStateEntry("remainder", expect = mapOf("units" to "minutes", "seconds" to "90")) {
                PMDurationInput(ariaLabel = "Grace period", defaultValue = PMSome(90.0), units = listOf(PMDurationUnit.Minutes))
            },
            PMStateEntry("locale", expect = mapOf("seconds" to "5400")) {
                PMDurationInput(ariaLabel = "Inaktivitätsdauer", defaultValue = PMSome(5_400.0), locale = "de-DE")
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMDurationInput(ariaLabel = lifetime, defaultValue = PMSome(week), size = PMControlSize.Sm)
            },
            PMStateEntry("readOnly", expect = mapOf("readonly" to "true")) {
                PMDurationInput(ariaLabel = lifetime, defaultValue = PMSome(week), readOnly = true)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMDurationInput(ariaLabel = "Inactivity lifetime, required", invalid = true)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMDurationInput(ariaLabel = lifetime, defaultValue = PMSome(week), disabled = true)
            },
        )
}
