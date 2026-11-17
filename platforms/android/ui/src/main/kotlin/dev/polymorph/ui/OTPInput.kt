// OTPInput (`design/components/otp-input.md`): a verification code drawn as
// separate digit cells. It is one field: a Compose `BasicTextField` spans the
// cells, its text and caret transparent, with the SMS one-time-code autofill
// content type and the digit keyboard, and the cells paint its digits. Every
// write is filtered to the ASCII digits and cut at `length` (4 or 6, 6 by
// default). Text that arrives whole (a paste, or the code autofill offers)
// replaces the code and fills the cells from the first; typing into a full
// code changes nothing; the caret is always at the end, so the arrow keys move
// nothing. `onChange` reports the digits, and `onComplete` follows it once,
// when the code becomes full.
//
// A cell is a square of the large control height in Input's rest recipe:
// `bg.surface` in a `border.field` hairline with the seat shadow and the
// control radius. These are the recipe's tokens: the spec's table gives the
// border as `border.default` and the radius as `radius.md`, and the SwiftUI
// member draws `border.default`; where the two differ, the recipe decides, as
// Button's does. The digit is `text.md` with the pairing's tabular figures,
// appearing with a fade over the control duration. The cells are `space.3`
// apart and shrink together when the row is narrower than they are. While the
// field has focus, the caret cell (the next to fill, or the last when the
// code is full) draws the focus ring and the `border.focus.solid` hairline;
// invalid draws every cell's hairline in `danger.border`, which wins over the
// caret's. Disabled cells are Input's disabled cell. There is no hover,
// because the cells are one target, and an empty cell shows nothing, because a
// dot would look like masking.
//
// The cells are not read: the field is the one element, named by `ariaLabel`
// or its FormField's label, its text the digits typed, and while invalid it
// reports its error (the FormField's message, else "Invalid"). `name`, `id`,
// `ariaRequired` and the `aria-describedby`/`aria-labelledby` ids have no
// Compose counterpart, and the phone's focus-zoom floor is a browser
// behaviour.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow

object PMOTPInput : PMOTPInputRendering {
    @Composable
    override fun Render(props: PMOTPInputProps) {
        val theme = PM.theme
        val length = (props.length ?: PMOTPInputLength.Length6).value
        val facts = pmFieldFacts(props.ariaLabel, null, props.disabled, props.invalid)

        var draft by remember { mutableStateOf(digits(props.defaultValue ?: "", length)) }
        val code = digits(props.value ?: draft, length)
        val write: (String) -> Unit = { next ->
            if (next != code) {
                draft = next
                props.onChange?.invoke(next)
                if (next.length == length) props.onComplete?.invoke(next)
            }
        }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val caret = minOf(code.length, length - 1)
        val attributes = buildMap {
            put("length", length.toString())
            put("filled", code.length.toString())
            if (facts.invalid) put("invalid", "true")
            if (facts.disabled) put("disabled", "true")
        }

        BasicTextField(
            // The caret stays at the end: a code is entered, not edited in the middle.
            value = TextFieldValue(code, TextRange(code.length)),
            onValueChange = { next -> write(entered(code, next.text, length)) },
            modifier = Modifier
                .pmMember("OTPInput", attributes)
                .pmFieldError(facts)
                .semantics { contentType = ContentType.SmsOtpCode }
                .pmHitTarget(),
            enabled = !facts.disabled,
            textStyle = theme.text.sm.textStyle.copy(color = Color.Transparent),
            keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, keyboardType = KeyboardType.NumberPassword),
            singleLine = true,
            interactionSource = interaction,
            cursorBrush = SolidColor(Color.Transparent),
            decorationBox = { text ->
                Box {
                    Row(
                        // The cells paint the field's digits; the field is what is read.
                        modifier = Modifier.clearAndSetSemantics {},
                        horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
                    ) {
                        for (index in 0 until length) {
                            Cell(
                                digit = code.getOrNull(index)?.toString(),
                                caret = focused && index == caret,
                                invalid = facts.invalid,
                                disabled = facts.disabled,
                                // The cells shrink together when the row is narrower than they are.
                                modifier = Modifier.weight(1f, fill = false),
                            )
                        }
                    }
                    // The real field lies under the cells, across the whole group,
                    // so a tap anywhere on them focuses it.
                    Box(Modifier.matchParentSize().pmFieldName(facts.name)) { text() }
                }
            },
        )
    }

    /** One cell: Input's rest cell at the large control height, square. */
    @Composable
    private fun Cell(
        digit: String?,
        caret: Boolean,
        invalid: Boolean,
        disabled: Boolean,
        modifier: Modifier,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val side = theme.defaultDensity.controlHeight.lg.dp
        val shape = theme.rounded(theme.radius.control)
        val border = when {
            disabled -> colors.borderSubtle
            invalid -> colors.dangerBorder
            caret -> colors.borderFocusSolid
            else -> colors.borderField
        }.color
        Box(
            modifier
                .width(side)
                .height(side)
                .pmFocusRing(caret && !disabled, theme.radius.control.dp)
                .pmShadow(if (disabled) PMShadow(emptyList()) else theme.shadows.seat, shape)
                .background((if (disabled) colors.bgSubtle else colors.bgSurface).color, shape)
                .border(PMGeometry.hairline, border, shape),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = digit != null,
                enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
            ) {
                Text(
                    text = digit.orEmpty(),
                    style = theme.text.md.textStyle.tabular(theme),
                    color = (if (disabled) colors.textDisabled else colors.textPrimary).color,
                    maxLines = 1,
                )
            }
        }
    }

    /** `text` with everything but the ASCII digits left out, cut at `length`. */
    private fun digits(text: String, length: Int): String = text.filter { it in '0'..'9' }.take(length)

    /**
     * The code after an edit: what was added, when more than one digit arrives
     * at once (a paste, or the code autofill offers), replaces the code; a
     * typed digit is added at the end, and a full code takes no more.
     */
    private fun entered(code: String, next: String, length: Int): String {
        val added = if (next.startsWith(code)) digits(next.substring(code.length), length) else ""
        return if (added.length > 1) added else digits(next, length)
    }
}

/**
 * OTPInput's states, from the spec's States table. The caret cell needs focus,
 * which exists only after a tap, as on the web; the entry in a FormField is
 * FormField's to draw, because the harness reads the first member in the tree
 * as the root.
 */
object OTPInputStates : PMStates {
    override val member = "OTPInput"

    private const val name = "Verification code"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "empty — six cells, no placeholder dots",
                expect = mapOf("length" to "6", "filled" to "0", "label" to name),
            ) { PMOTPInput(ariaLabel = name) },
            PMStateEntry("four — the other length real code systems use", expect = mapOf("length" to "4", "filled" to "0")) {
                PMOTPInput(ariaLabel = name, length = PMOTPInputLength.Length4)
            },
            PMStateEntry("partial — the code so far", expect = mapOf("filled" to "2")) {
                PMOTPInput(ariaLabel = name, defaultValue = "42")
            },
            PMStateEntry("full", expect = mapOf("filled" to "6", "label" to name)) {
                PMOTPInput(ariaLabel = name, defaultValue = "428051")
            },
            PMStateEntry("a pasted code — digits only, cut at the length", expect = mapOf("filled" to "4")) {
                PMOTPInput(ariaLabel = name, defaultValue = "42-80 51", length = PMOTPInputLength.Length4)
            },
            PMStateEntry("invalid — the code is wrong, not a digit", expect = mapOf("invalid" to "true", "filled" to "6")) {
                PMOTPInput(ariaLabel = name, defaultValue = "428051", invalid = true)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMOTPInput(ariaLabel = name, disabled = true)
            },
        )
}
