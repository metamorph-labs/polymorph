// NumberInput (`design/components/number-input.md`): a field that holds,
// formats and steps a number. Input's container in every state
// (`pmFieldBox`), at Input's sizes and padding, with Input's affixes and, at
// its trailing end, the stepper pair: step down, then step up, each drawn the
// small control height wide and the field's height tall, touching, in the
// embedded-button recipe (`PMEmbeddedButton`). Each stepper sits in a slot
// the hit target wide, so their touch areas meet where they touch and do not
// overlap, and the pair takes two hit targets of the field's width, the
// Android measure `number-input.md` records. A stepper that cannot move, at
// `min` or `max`, is disabled and dimmed while the other keeps working. The
// pair sits inside the field's end padding, as the recipe and Input's clear
// button place an embedded control; the SwiftUI member sets it flush against
// the edge.
//
// Typing is a draft; the value is committed when the field loses focus or on
// the keyboard's action key, as the web commits on blur and Enter: the typed
// number is clamped to `min` and `max`, an empty field commits null, and text
// that does not read as a number restores the last committed value, so
// `onChange` only ever reports a number or null. The steppers snap to `step`
// (1, or 0.01 for a percent) and commit as they fire; an empty field steps to
// `min`, or to zero. `onBlur` fires after the commit. With a hardware
// keyboard, the up and down arrows step and Home and End go to `min` and
// `max`. TalkBack steps the field with its custom actions, named as the
// steppers are ("Increase" and "Decrease"); the steppers are buttons TalkBack
// reaches and the keyboard's focus order leaves out, as the web leaves them
// out of the Tab order.
//
// `format` formats the shown text: `decimal` (up to three fraction digits),
// `percent` (the ratio multiplied by 100, whole by default) or `currency` in
// its ISO 4217 code (the symbol for the dollar, euro, pound, yen, rupee and
// won, else the code; two fraction digits, none for the yen and the won), and
// `maximumFractionDigits` caps the fraction. Compose's common code has no
// locale-aware number formatter, so the text follows the English conventions,
// `,` between thousands and `.` before the fraction, in every locale: the
// locale's own separators are not honoured. Reading typed text drops every
// character but the digits, the sign and the point.
//
// `readOnly` shows the formatted value, selectable, with no steppers, because
// a value that cannot be edited cannot be stepped; a disabled field keeps its
// steppers, disabled, so the frame keeps its shape. Not honoured: the held
// stepper's repeat, which needs a repeat rate no token holds; `name`, `id`,
// `ariaRequired` and the `aria-describedby`/`aria-labelledby` ids, which have
// no Compose counterpart; and the phone's focus-zoom floor, a browser
// behaviour.

package dev.polymorph.ui

import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTextStyle
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round

object PMNumberInput : PMNumberInputRendering {
    @Composable
    override fun Render(props: PMNumberInputProps) {
        val theme = PM.theme
        val colors = theme.colors
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val facts = pmFieldFacts(props.ariaLabel, props.placeholder, props.disabled, props.invalid, props.readOnly)
        val numbers = NumberRules(props.min, props.max, props.step, props.format)

        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The controlled `value` when given (null inside it is the empty
        // field), otherwise the field's own.
        val value = if (props.value != null) props.value.value else own
        // The text being typed, or null while the field shows the committed value.
        var draft by remember { mutableStateOf<String?>(null) }
        val shown = draft ?: value?.let { numbers.format(it) } ?: ""

        fun commit(next: Double?) {
            draft = null
            if (next != value) {
                own = next
                props.onChange?.invoke(next)
            }
        }
        // The draft read as a number, or the committed value while there is none.
        fun current(): Double? = when (val read = draft?.let { numbers.read(it) }) {
            is NumberRead.Number -> numbers.clamp(read.value)
            NumberRead.Empty -> null
            NumberRead.Unreadable, null -> value
        }
        fun commitDraft() {
            val text = draft ?: return
            when (val read = numbers.read(text)) {
                NumberRead.Empty -> commit(null)
                is NumberRead.Number -> commit(numbers.clamp(read.value))
                // Text that is not a number restores the last committed value.
                NumberRead.Unreadable -> draft = null
            }
        }
        val live = !facts.disabled && !facts.readOnly
        fun stepBy(direction: Int) {
            if (live) commit(numbers.stepped(current(), direction))
        }
        val canDown = numbers.canStep(current(), -1)
        val canUp = numbers.canStep(current(), 1)

        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val hovered by interaction.collectIsHoveredAsState()
        val submit = LocalPMSubmitAction.current
        val step = metrics.text.textStyle.tabular(theme)
        val affix = (if (facts.disabled) colors.textDisabled else colors.textMuted).color
        val attributes = buildMap {
            put("size", size.value)
            if (facts.invalid) put("invalid", "true")
            if (facts.disabled) put("disabled", "true")
            if (facts.readOnly) put("readonly", "true")
        }
        val increase = strings.numberInputIncrement
        val decrease = strings.numberInputDecrement

        BasicTextField(
            value = shown,
            onValueChange = { draft = it },
            modifier = Modifier
                .pmMember("NumberInput", attributes)
                .pmFieldError(facts)
                .semantics {
                    if (live) {
                        customActions = listOf(
                            CustomAccessibilityAction(increase) { stepBy(1); true },
                            CustomAccessibilityAction(decrease) { stepBy(-1); true },
                        )
                    }
                }
                .fillMaxWidth()
                .pmHitTarget()
                .hoverable(interaction)
                .pmFocusEvents(props.onFocus) {
                    // The commit settles first, so touched validation reads the committed number.
                    commitDraft()
                    props.onBlur?.invoke()
                }
                .onPreviewKeyEvent { event ->
                    if (event.type != KeyEventType.KeyDown || !live) return@onPreviewKeyEvent false
                    when (event.key) {
                        Key.DirectionUp -> { stepBy(1); true }
                        Key.DirectionDown -> { stepBy(-1); true }
                        Key.MoveHome -> props.min?.let { commit(it); true } ?: false
                        Key.MoveEnd -> props.max?.let { commit(it); true } ?: false
                        else -> false
                    }
                },
            enabled = !facts.disabled,
            readOnly = facts.readOnly,
            textStyle = step.copy(color = facts.textColor),
            keyboardOptions = KeyboardOptions(
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Decimal,
                imeAction = ImeAction.Done,
            ),
            // Compose hides the keyboard on Done only for a field with no
            // handler, so a field with nothing to submit runs that default.
            keyboardActions = KeyboardActions(onDone = {
                commitDraft()
                if (submit != null) submit() else defaultKeyboardAction(ImeAction.Done)
            }),
            singleLine = true,
            interactionSource = interaction,
            cursorBrush = SolidColor(colors.accentText.color),
            decorationBox = { text ->
                Row(
                    modifier = Modifier
                        .pmFieldBox(
                            invalid = facts.invalid,
                            disabled = facts.disabled,
                            readOnly = facts.readOnly,
                            focused = focused,
                            hovered = hovered,
                        )
                        .heightIn(min = metrics.height)
                        .padding(horizontal = metrics.padding),
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    props.prefix?.let { Affix(it, metrics.text, affix) }
                    Box(Modifier.weight(1f).pmFieldName(facts.name), contentAlignment = Alignment.CenterStart) {
                        if (shown.isEmpty()) props.placeholder?.let { PMFieldPlaceholder(it, step) }
                        text()
                    }
                    props.suffix?.let { Affix(it, metrics.text, affix) }
                    if (!facts.readOnly) {
                        // Step down, then step up: the number line in the reading direction.
                        Row {
                            Stepper(PMIconRole.Down, decrease, size, metrics, !facts.disabled && canDown, Alignment.CenterEnd) { stepBy(-1) }
                            Stepper(PMIconRole.Up, increase, size, metrics, !facts.disabled && canUp, Alignment.CenterStart) { stepBy(1) }
                        }
                    }
                }
            },
        )
    }

    /**
     * One stepper: the embedded button, the small control height wide, out of
     * the keyboard's focus order, drawn at `alignment` in its hit-target slot.
     * The pair's buttons are drawn at the slots' facing ends, so they touch as
     * the recipe draws them and each slot's spare width lies on its outer side.
     */
    @Composable
    private fun Stepper(
        glyph: PMIconRole,
        label: String,
        size: PMControlSize,
        metrics: PMControlMetrics,
        enabled: Boolean,
        alignment: Alignment,
        onClick: () -> Unit,
    ) {
        PMEmbeddedButton(
            label = label,
            width = PM.theme.defaultDensity.controlHeight.sm.dp,
            height = metrics.height,
            onClick = onClick,
            enabled = enabled,
            keyboardFocusable = false,
            alignment = alignment,
        ) { tint -> PMIconView(glyph, size, tint = tint) }
    }

    /** A prefix or suffix: adornment strength, never part of the value, and not spoken. */
    @Composable
    private fun Affix(text: String, step: PMTextStyle, color: Color) {
        Text(
            text = text,
            style = step.textStyle,
            color = color,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.clearAndSetSemantics {},
        )
    }
}

/** What typed text reads as: nothing, a number, or text that is not a number. */
private sealed interface NumberRead {
    data object Empty : NumberRead
    data class Number(val value: Double) : NumberRead
    data object Unreadable : NumberRead
}

/**
 * NumberInput's arithmetic and text: the limits, the step, and the format,
 * written out because Compose's common code has no number formatter.
 */
private class NumberRules(
    private val lowest: Double?,
    private val highest: Double?,
    step: Double?,
    private val format: PMNumberFormat?,
) {
    private val style = format?.style ?: PMNumberFormatStyle.Decimal

    /** The step: as given, else 0.01 for a percent, which is a ratio, else 1. */
    val step: Double = step?.takeIf { it > 0 } ?: if (style == PMNumberFormatStyle.Percent) PERCENT_STEP else 1.0

    /** `number` within the limits. */
    fun clamp(number: Double): Double =
        min(highest ?: Double.POSITIVE_INFINITY, max(lowest ?: Double.NEGATIVE_INFINITY, number))

    /**
     * The value a stepper gives from `base` in `direction`: the next multiple
     * of the step that way, then clamped. A value on the step moves a whole
     * step; one between steps snaps to the next. An empty field steps to
     * `min`, or to zero.
     */
    fun stepped(base: Double?, direction: Int): Double {
        if (base == null) return clamp(lowest ?: 0.0)
        val ratio = base / step
        val onStep = abs(ratio - round(ratio)) < EPSILON
        val index = when {
            onStep -> round(ratio) + direction
            direction > 0 -> ceil(ratio)
            else -> floor(ratio)
        }
        return clamp(snapped(index * step))
    }

    /** Whether a stepper can move `base` at all. */
    fun canStep(base: Double?, direction: Int): Boolean = base == null || stepped(base, direction) != base

    /** `number` rounded to the step's own fraction digits, so a step of 0.1 never reports 0.30000000000000004. */
    private fun snapped(number: Double): Double {
        val scale = TEN.pow(fractionDigits(step))
        return round(number * scale) / scale
    }

    /** How many fraction digits `number` is written with. */
    private fun fractionDigits(number: Double): Int {
        val written = number.toString()
        if (written.contains('E') || written.contains('e')) return MOST_FRACTION_DIGITS
        return written.substringAfter('.', "").trimEnd('0').length
    }

    /** `number` as the field shows it. */
    fun format(number: Double): String {
        val code = format?.currency?.uppercase().orEmpty()
        val most = format?.maximumFractionDigits?.toInt()
        val (least, cap) = when (style) {
            PMNumberFormatStyle.Decimal -> 0 to (most ?: DECIMAL_FRACTION_DIGITS)
            PMNumberFormatStyle.Percent -> 0 to (most ?: 0)
            PMNumberFormatStyle.Currency -> {
                val digits = if (code in WHOLE_CURRENCIES) 0 else CURRENCY_FRACTION_DIGITS
                val top = most ?: digits
                min(digits, top) to top
            }
        }
        val shown = if (style == PMNumberFormatStyle.Percent) number * PERCENT else number
        val (negative, body) = digits(shown, least, cap)
        val sign = if (negative) MINUS else ""
        return when (style) {
            PMNumberFormatStyle.Decimal -> sign + body
            PMNumberFormatStyle.Percent -> sign + body + PERCENT_SIGN
            PMNumberFormatStyle.Currency -> sign + (SYMBOLS[code] ?: "$code$NO_BREAK") + body
        }
    }

    /** Typed text as a number: every character but the digits, the sign and the point is dropped. */
    fun read(text: String): NumberRead {
        if (text.isBlank()) return NumberRead.Empty
        val kept = text.filter { it in '0'..'9' || it == '.' || it == '-' }
        val number = kept.toDoubleOrNull() ?: return NumberRead.Unreadable
        return NumberRead.Number(if (style == PMNumberFormatStyle.Percent) number / PERCENT else number)
    }

    /**
     * The magnitude of `number` rounded half away from zero to `cap` fraction
     * digits, with `,` between thousands and at least `least` fraction digits,
     * and whether it is negative once rounded.
     */
    private fun digits(number: Double, least: Int, cap: Int): Pair<Boolean, String> {
        val scale = TEN.pow(cap)
        val rounded = floor(abs(number) * scale + HALF).toLong()
        val unit = scale.toLong()
        val whole = (rounded / unit).toString().reversed().chunked(GROUP).joinToString(GROUPING).reversed()
        val fraction = (rounded % unit).toString().padStart(cap, '0').take(cap).trimEnd('0').padEnd(least, '0')
        val body = if (fraction.isEmpty()) whole else "$whole$POINT$fraction"
        return (number < 0 && rounded != 0L) to body
    }

    private companion object {
        const val PERCENT_STEP = 0.01
        const val PERCENT = 100.0
        const val TEN = 10.0
        const val HALF = 0.5
        const val EPSILON = 1e-9
        const val GROUP = 3
        const val DECIMAL_FRACTION_DIGITS = 3
        const val CURRENCY_FRACTION_DIGITS = 2
        const val MOST_FRACTION_DIGITS = 10
        const val GROUPING = ","
        const val POINT = "."
        const val MINUS = "-"
        const val PERCENT_SIGN = "%"
        const val NO_BREAK = " "

        /** The currencies with no minor unit in use. */
        val WHOLE_CURRENCIES = setOf("JPY", "KRW")

        /** The currencies shown by their symbol; any other by its code. */
        val SYMBOLS = mapOf("USD" to "$", "EUR" to "€", "GBP" to "£", "JPY" to "¥", "INR" to "₹", "KRW" to "₩")
    }
}

/** NumberInput's states, from the spec's States table. */
object NumberInputStates : PMStates {
    override val member = "NumberInput"

    private const val agents = "Agents on this plan"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest md", expect = mapOf("size" to "md", "label" to agents)) {
                PMNumberInput(ariaLabel = agents, placeholder = "0")
            },
            PMStateEntry("with value", expect = mapOf("size" to "md", "label" to agents)) {
                PMNumberInput(ariaLabel = agents, defaultValue = PMSome(5.0), min = 1.0, step = 1.0)
            },
            PMStateEntry("at the rail — step down disabled") {
                PMNumberInput(ariaLabel = agents, defaultValue = PMSome(1.0), min = 1.0)
            },
            PMStateEntry("currency — the per-seat price") {
                PMNumberInput(
                    ariaLabel = "Price per seat",
                    defaultValue = PMSome(29.0),
                    format = PMNumberFormat(currency = "USD", style = PMNumberFormatStyle.Currency),
                )
            },
            PMStateEntry("percent — the CSAT target, stepping by 0.01") {
                PMNumberInput(
                    ariaLabel = "CSAT target",
                    defaultValue = PMSome(0.9),
                    format = PMNumberFormat(style = PMNumberFormatStyle.Percent),
                )
            },
            PMStateEntry("affixed — the first-response target in hours") {
                PMNumberInput(ariaLabel = "First response within", defaultValue = PMSome(4.0), suffix = "hrs")
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMNumberInput(ariaLabel = agents, size = PMControlSize.Sm)
            },
            PMStateEntry("lg, a large number grouped", expect = mapOf("size" to "lg")) {
                PMNumberInput(ariaLabel = "Monthly tickets", defaultValue = PMSome(1234567.0), size = PMControlSize.Lg)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMNumberInput(ariaLabel = agents, invalid = true)
            },
            PMStateEntry("disabled — the steppers disabled with it", expect = mapOf("disabled" to "true")) {
                PMNumberInput(ariaLabel = agents, defaultValue = PMSome(5.0), disabled = true)
            },
            PMStateEntry("readOnly — no steppers", expect = mapOf("readonly" to "true")) {
                PMNumberInput(ariaLabel = agents, defaultValue = PMSome(5.0), readOnly = true)
            },
            PMStateEntry("readOnly currency — the formatted text", expect = mapOf("readonly" to "true")) {
                PMNumberInput(
                    ariaLabel = "Price per seat",
                    defaultValue = PMSome(1234.5),
                    format = PMNumberFormat(currency = "USD", style = PMNumberFormatStyle.Currency),
                    readOnly = true,
                )
            },
        )
}
