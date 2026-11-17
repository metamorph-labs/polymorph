// PasswordInput (`design/components/password-input.md`): an Input preset for
// passwords, with a reveal toggle. Input's container in every state
// (`pmFieldBox`), at Input's sizes and padding, with a Compose
// `BasicTextField` and, at its trailing end, the toggle: the clear button's
// embedded-adornment recipe unchanged (`PMEmbeddedButton`), a square the
// field's height, the `visible` glyph while the password is masked and
// `hidden` while it shows, crossfading over the control duration, muted at
// rest and never in danger colours, because it is an action, not a status. It
// is always there, even on an empty field, so the frame never moves. It sits
// inside the field's end padding, where Input's clear button sits, as the
// web's toggle sits in Input's trailing slot; the SwiftUI member sets it flush
// against the edge.
//
// The field is drawn here rather than through `PMInput`, as the SwiftUI
// member draws its own: Input ties the masking to its `type`, and a revealed
// password must keep the password keyboard, never corrected or capitalised.
// The flip changes only the visual transformation of the same text field, so
// the value, the caret, the selection and the autofill content type are kept.
// The content type is `autoComplete`'s: the current password, or a new one on
// a sign-up screen. While masked, the field reports itself as a password, so
// TalkBack does not read its value. Visibility is the member's own state, by
// design.
//
// The toggle is named by `toggleLabel` and reports its toggle state, on while
// the password shows, as `aria-pressed` does. A disabled field disables the
// toggle; a read-only one keeps it, because revealing is not editing. The
// field is named by `ariaLabel` or its FormField's label, and while invalid
// reports its error (the FormField's message, else "Invalid"). `name`, `id`,
// `ariaRequired` and the `aria-describedby`/`aria-labelledby` ids have no
// Compose counterpart. The phone's focus-zoom floor is a browser behaviour.

package dev.polymorph.ui

import androidx.compose.animation.Crossfade
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation

object PMPasswordInput : PMPasswordInputRendering {
    @Composable
    override fun Render(props: PMPasswordInputProps) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val facts = pmFieldFacts(props.ariaLabel, props.placeholder, props.disabled, props.invalid, props.readOnly)
        val autoComplete = props.autoComplete ?: PMPasswordInputAutoComplete.CurrentPassword

        var draft by remember { mutableStateOf(props.defaultValue ?: "") }
        var revealed by remember { mutableStateOf(false) }
        val value = props.value ?: draft
        val set: (String) -> Unit = { next ->
            draft = next
            props.onChange?.invoke(next)
        }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val hovered by interaction.collectIsHoveredAsState()
        // Return submits the form the field is in, as Enter does in the web's `<form>`.
        val submit = LocalPMSubmitAction.current
        val step = metrics.text.textStyle
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (revealed) "visible" else "hidden")
            if (facts.invalid) put("invalid", "true")
            if (facts.disabled) put("disabled", "true")
            if (facts.readOnly) put("readonly", "true")
        }

        BasicTextField(
            value = value,
            onValueChange = set,
            modifier = Modifier
                .pmMember("PasswordInput", attributes)
                .pmFieldError(facts)
                .semantics {
                    contentType = when (autoComplete) {
                        PMPasswordInputAutoComplete.CurrentPassword -> ContentType.Password
                        PMPasswordInputAutoComplete.NewPassword -> ContentType.NewPassword
                    }
                }
                .fillMaxWidth()
                .pmHitTarget()
                .hoverable(interaction),
            enabled = !facts.disabled,
            readOnly = facts.readOnly,
            textStyle = step.copy(color = facts.textColor),
            // The password keyboard whether masked or not: a revealed password
            // is still a secret, never corrected or capitalised.
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Password,
                imeAction = if (submit != null) ImeAction.Done else ImeAction.Default,
            ),
            // Compose hides the keyboard on Done only for a field with no
            // handler, so a field with nothing to submit runs that default.
            keyboardActions = KeyboardActions(onDone = { if (submit != null) submit() else defaultKeyboardAction(ImeAction.Done) }),
            singleLine = true,
            visualTransformation = if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
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
                    Box(Modifier.weight(1f).pmFieldName(facts.name), contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) props.placeholder?.let { PMFieldPlaceholder(it, step) }
                        text()
                    }
                    PMEmbeddedButton(
                        label = props.toggleLabel,
                        width = metrics.height,
                        height = metrics.height,
                        onClick = { revealed = !revealed },
                        enabled = !facts.disabled,
                        pressed = revealed,
                    ) { tint ->
                        // `visible` while masked (the action shows), `hidden`
                        // while revealed (the action masks).
                        Crossfade(
                            targetState = revealed,
                            animationSpec = motion.easing.standard.tween(motion.duration.control),
                            label = "glyph",
                        ) { shown ->
                            PMIconView(if (shown) PMIconRole.Hidden else PMIconRole.Visible, size, tint = tint)
                        }
                    }
                }
            },
        )
    }
}

/**
 * PasswordInput's states, from the spec's States table. The revealed state
 * exists only after a press, so it has no entry, as on the web; the entry in a
 * FormField is FormField's to draw, because the harness reads the first member
 * in the tree as the root.
 */
object PasswordInputStates : PMStates {
    override val member = "PasswordInput"

    private const val password = "Password"
    private const val toggle = "Show password"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest", expect = mapOf("state" to "hidden", "size" to "md", "label" to password)) {
                PMPasswordInput(ariaLabel = password, toggleLabel = toggle)
            },
            PMStateEntry(
                "with value — masked, and never in an announcement",
                expect = mapOf("state" to "hidden", "label" to password),
            ) { PMPasswordInput(ariaLabel = password, defaultValue = "hunter2", toggleLabel = toggle) },
            PMStateEntry("new password — for sign-up", expect = mapOf("state" to "hidden")) {
                PMPasswordInput(
                    ariaLabel = "New password",
                    autoComplete = PMPasswordInputAutoComplete.NewPassword,
                    placeholder = "At least twelve characters",
                    toggleLabel = toggle,
                )
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMPasswordInput(ariaLabel = password, size = PMControlSize.Sm, toggleLabel = toggle)
            },
            PMStateEntry("lg", expect = mapOf("size" to "lg")) {
                PMPasswordInput(ariaLabel = password, defaultValue = "hunter2", size = PMControlSize.Lg, toggleLabel = toggle)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMPasswordInput(ariaLabel = password, defaultValue = "hunter2", invalid = true, toggleLabel = toggle)
            },
            PMStateEntry("disabled — the toggle goes with the field", expect = mapOf("disabled" to "true")) {
                PMPasswordInput(ariaLabel = password, defaultValue = "hunter2", disabled = true, toggleLabel = toggle)
            },
            PMStateEntry(
                "readOnly — reveal still matters for a generated password",
                expect = mapOf("readonly" to "true"),
            ) {
                PMPasswordInput(ariaLabel = password, defaultValue = "k9!vX2#mQ8", readOnly = true, toggleLabel = toggle)
            },
        )
}
