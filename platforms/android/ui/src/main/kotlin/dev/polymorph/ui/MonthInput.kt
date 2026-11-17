// MonthInput (`design/components/month-input.md`): a month and a year, with
// no day, typed into segments with no popup. It is Input's container at
// Input's sizes (`PMDateFieldBox`) holding the month segments
// (`PMMonthSegments`), DatePicker's field cells: the month and the year in
// the locale's order, the separator its dates use between them in
// `text.muted`. An unfilled segment shows `mm` or `yyyy` muted, and the
// focused one the accent wash. Each segment is a text field with the number
// keyboard, so a phone shows its keypad; digits type through and advance, and
// up and down step a segment, wrapping. A tap anywhere in the field focuses
// its first segment. Material 3 has no month picker, and its date picker
// chooses a day, so the segments the spec describes are drawn here from
// Compose's text fields, as TimeInput draws its time.
//
// The value is `YYYY-MM` text, as on the web; text that is not a month shows
// as empty. It is reported once both segments are filled, on each digit that
// changes it after that, and as null once a filled segment is emptied. A month
// outside `min` and `max` marks the field invalid and stays in the field.
// `locale` orders the segments, gives the separator and names the month.
// `readOnly` keeps the segments focusable and selectable, and neither digits
// nor arrows edit them. `value` with `onChange` is the controlled pair. The
// row follows the layout's direction, so a right-to-left layout turns it.
//
// Each segment is named by `ariaLabel` or its FormField's label, says
// `messages.empty` while it is empty and a filled month its name, and an
// invalid field reports its error (the FormField's message, else "Invalid")
// on each, as `aria-invalid` is announced; the separator and the patterns are
// not spoken. The field draws the focus ring while a segment has focus.
// `name`, `id`, `ariaRequired` and the `aria-*by` ids have no Compose
// counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection

object PMMonthInput : PMMonthInputRendering {
    @Composable
    override fun Render(props: PMMonthInputProps) {
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val readOnly = props.readOnly ?: false

        var own by remember { mutableStateOf(PMDates.month(props.defaultValue?.value)) }
        // The controlled `value` when given (null inside it, or text that is
        // not a month, is none), otherwise the field's own.
        val current = if (props.value != null) PMDates.month(props.value.value) else own
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false) ||
            PMDates.monthOutOfBounds(current, props.min, props.max)
        val name = props.ariaLabel ?: field?.label
        val failure = if (invalid) field?.error ?: strings.invalid else null
        val empty = props.messages?.empty ?: strings.monthInputMessages.empty
        val first = remember { FocusRequester() }
        var focused by remember { mutableStateOf(false) }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val commit: (Int?, Int?) -> Unit = { month, year ->
            val next = if (month != null && year != null) PMMonth(year, month) else null
            if (next != current) {
                own = next
                props.onChange?.invoke(next?.let { PMDates.monthText(it) })
            }
        }
        val attributes = buildMap {
            put("size", size.value)
            if (current == null) put("placeholder", "true") else put("month", PMDates.monthText(current))
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (readOnly) put("readonly", "true")
        }

        PMDateLocale(props.locale) { text ->
            PMDateFieldBox(
                size = size,
                invalid = invalid,
                disabled = disabled,
                readOnly = readOnly,
                held = false,
                focused = focused && !disabled,
                trailing = false,
                modifier = Modifier
                    .pmMember("MonthInput", attributes)
                    // A tap anywhere in the field focuses its first segment, as
                    // a tap in Input's frame focuses its text.
                    .pointerInput(disabled) { detectTapGestures { if (!disabled) first.requestFocus() } },
            ) {
                PMMonthSegments(
                    month = current?.month,
                    year = current?.year,
                    text = text,
                    size = size,
                    name = name,
                    error = failure,
                    empty = empty,
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

/**
 * MonthInput's states, from the spec's States table: a card's expiry, August
 * 2029, and fixed months rather than this one, so a render does not change
 * with the month it is drawn in.
 */
object MonthInputStates : PMStates {
    override val member = "MonthInput"

    private const val expires = "Expires"
    private const val expiry = "2029-08"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty", expect = mapOf("size" to "md", "placeholder" to "true")) {
                PMMonthInput(ariaLabel = expires, locale = "en-US")
            },
            PMStateEntry("filled", expect = mapOf("size" to "md", "month" to expiry)) {
                PMMonthInput(ariaLabel = expires, defaultValue = PMSome(expiry), locale = "en-US")
            },
            PMStateEntry("sizes side by side", expect = mapOf("size" to "sm")) {
                MonthInputSizes()
            },
            PMStateEntry("out-of-range value", expect = mapOf("invalid" to "true", "month" to "2026-02")) {
                PMMonthInput(
                    ariaLabel = "Billing month, before the first allowed month",
                    defaultValue = PMSome("2026-02"),
                    locale = "en-US",
                    max = "2027-02",
                    min = "2026-03",
                )
            },
            PMStateEntry("locale order — en-US", expect = mapOf("month" to expiry)) {
                PMMonthInput(ariaLabel = expires, defaultValue = PMSome(expiry), locale = "en-US")
            },
            PMStateEntry("locale order — ja-JP", expect = mapOf("month" to expiry)) {
                PMMonthInput(ariaLabel = "有効期限", defaultValue = PMSome(expiry), locale = "ja-JP")
            },
            PMStateEntry("right-to-left locale — he-IL", expect = mapOf("month" to expiry)) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    PMMonthInput(ariaLabel = "תוקף", defaultValue = PMSome(expiry), locale = "he-IL")
                }
            },
            PMStateEntry("readOnly", expect = mapOf("readonly" to "true")) {
                PMMonthInput(ariaLabel = expires, defaultValue = PMSome(expiry), locale = "en-US", readOnly = true)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMMonthInput(ariaLabel = "Expires, required", invalid = true, locale = "en-US")
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMMonthInput(ariaLabel = expires, defaultValue = PMSome(expiry), disabled = true, locale = "en-US")
            },
            // The field a FormField governs, named by its label through the
            // field context, as FormField hands it over. FormField's own node
            // would be the entry's first member, so the context is given directly.
            PMStateEntry("expiry form", expect = mapOf("placeholder" to "true")) {
                CompositionLocalProvider(
                    LocalPMField provides PMFieldContext(label = expires, error = null, required = false, invalid = false),
                ) {
                    PMMonthInput(locale = "en-US", min = "2020-01", name = "expiry")
                }
            },
        )

    /**
     * The three sizes, a field's gap apart. They are stacked, because each
     * segment's slot is the hit target wide and three fields do not fit
     * beside each other on a phone.
     */
    @Composable
    private fun MonthInputSizes() {
        Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
            for (size in PMControlSize.entries) {
                PMMonthInput(ariaLabel = "Expires (${size.value})", defaultValue = PMSome(expiry), locale = "en-US", size = size)
            }
        }
    }
}
