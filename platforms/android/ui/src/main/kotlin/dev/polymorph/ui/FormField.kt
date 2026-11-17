// FormField (`design/components/form-field.md`): one control with its label,
// help text and error, and the wiring between them.
//
// The web clones its child to inject `id`, `aria-describedby`,
// `aria-required` and `invalid`. A composable cannot be cloned, so the field
// hands its control a `PMFieldContext` through `LocalPMField` instead: the
// label the control is named by, the inline error it reports, whether it is
// required, and whether it is invalid. Every control a field governs (Input,
// Select, Checkbox, Switch) reads it. The visible label and error are hidden
// from accessibility, because the control speaks them: its name is the label,
// and its accessibility error is the message. Android has no hint for a
// control, so the description is read as a node of its own after the control's
// name. In the other direction, the control reports whether it carries its
// label in its own row and whether it is disabled (`PMFieldControl`, through
// `LocalPMFieldReport`), which the web reads off the child element: a Checkbox
// or Switch takes the field's label as its row label and the field draws no
// label row, and a disabled control dims the label and the description.
//
// Column-labelled, the field is the label row (the label, the required marker,
// `labelEnd` at the far end), the description, the control and the error;
// row-labelled, it is the control's row, then the description and the error.
// The error replaces the description and slides in from above by one space
// step; it leaves with a fade at the control's exit duration, showing the last
// message while it fades.
//
// `errorPresentation: toast` keeps the label, the marker and the control's
// invalid state and draws no message. The web reports the message to its
// toast viewport; Android has no viewport for a field to report to, so the
// app raises it as a `PMToast`. `required` has no accessibility semantics on
// Android: the marker is drawn and the control is not told. `id` names nothing
// in Compose.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics

object PMFormField : PMFormFieldRendering {
    @Composable
    override fun Render(props: PMFormFieldProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        var control by remember { mutableStateOf(PMFieldControl()) }
        val error = props.error.orEmpty()
        val invalid = error.isNotEmpty()
        // The message the error row shows: the current one, and the last one
        // while the row fades out after the error clears.
        val shownError = remember { mutableStateOf(error) }
        if (invalid && shownError.value != error) shownError.value = error
        val inline = props.errorPresentation != PMFormFieldErrorPresentation.Toast
        val description = if (invalid) null else props.description?.takeIf { it.isNotEmpty() }
        val required = props.required ?: false
        val context = PMFieldContext(
            label = props.label,
            error = if (invalid && inline) error else null,
            required = required,
            invalid = invalid,
        )
        val attributes = buildMap {
            put("kind", if (control.rowLabelled) "row-labelled" else "field")
            if (invalid) put("invalid", "true")
            if (control.disabled) put("disabled", "true")
            if (required) put("required", "true")
        }
        val offset = with(LocalDensity.current) { space.s2.roundToPx() }

        Column(
            modifier = Modifier.pmMember("FormField", attributes).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            if (!control.rowLabelled) {
                LabelRow(control.disabled, required, props)
                description?.let { Message(it, control.disabled) }
            }
            CompositionLocalProvider(
                LocalPMField provides context,
                LocalPMFieldReport provides { reported -> if (reported != control) control = reported },
            ) {
                props.children()
            }
            if (control.rowLabelled) description?.let { Message(it, control.disabled) }
            AnimatedVisibility(
                visible = invalid && inline,
                enter = fadeIn(motion.easing.enter.tween(motion.duration.control)) +
                    slideInVertically(motion.easing.enter.tween(motion.duration.control)) { -offset },
                exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
            ) {
                PMFieldErrorRow(shownError.value)
            }
        }
    }

    /**
     * The label and its required marker at the start, `labelEnd` at the end.
     * The label is not read here: it is the control's name.
     */
    @Composable
    private fun LabelRow(disabled: Boolean, required: Boolean, props: PMFormFieldProps) {
        val theme = PM.theme
        val colors = theme.colors
        Row(
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PMRowLabel(
                props.label,
                required,
                (if (disabled) colors.textDisabled else colors.textPrimary).color,
                Modifier.weight(1f).semantics { hideFromAccessibility() },
            )
            props.labelEnd?.let { end ->
                CompositionLocalProvider(
                    LocalTextStyle provides theme.text.sm.textStyle,
                    LocalContentColor provides colors.textSecondary.color,
                ) { end() }
            }
        }
    }

    /** The description: `text.xs`, secondary. */
    @Composable
    private fun Message(text: String, disabled: Boolean) {
        val theme = PM.theme
        Text(
            text = text,
            style = theme.text.xs.textStyle,
            color = (if (disabled) theme.colors.textDisabled else theme.colors.textSecondary).color,
        )
    }
}

/** FormField's states, from the spec's States table. */
object FormFieldStates : PMStates {
    override val member = "FormField"

    private const val subject = "Subject"
    private const val help = "One line, as the customer would say it."
    private const val missing = "A subject is required."
    private const val password = "Password"

    private val priorities = listOf(
        PMSelectOptionEntry.Option(PMSelectOption("urgent", "Urgent")),
        PMSelectOptionEntry.Option(PMSelectOption("normal", "Normal")),
        PMSelectOptionEntry.Option(PMSelectOption("low", "Low")),
    )

    @Composable
    private fun SubjectInput(disabled: Boolean = false) {
        PMInput(
            defaultValue = if (disabled) "Login loop" else null,
            disabled = disabled,
            placeholder = "What went wrong?",
        )
    }

    @Composable
    private fun Forgot() {
        PMButton(label = "Forgot your password?", appearance = PMButtonAppearance.GhostAccent, size = PMControlSize.Sm)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("plain", expect = mapOf("kind" to "field", "contains" to "Input")) {
                PMFormField(label = subject) { SubjectInput() }
            },
            PMStateEntry("described", expect = mapOf("kind" to "field")) {
                PMFormField(description = help, label = subject) { SubjectInput() }
            },
            PMStateEntry("required", expect = mapOf("required" to "true")) {
                PMFormField(label = subject, required = true) { SubjectInput() }
            },
            PMStateEntry("labelEnd — the row has two ends") {
                PMFormField(label = password, labelEnd = { Forgot() }) { PMInput(type = PMInputType.Password) }
            },
            PMStateEntry(
                "labelEnd, required and in error — the row holds all three",
                expect = mapOf("invalid" to "true", "required" to "true"),
            ) {
                PMFormField(
                    error = "That password does not match.",
                    label = password,
                    labelEnd = { Forgot() },
                    required = true,
                ) { PMInput(type = PMInputType.Password) }
            },
            PMStateEntry("error", expect = mapOf("invalid" to "true")) {
                PMFormField(error = missing, label = subject) { SubjectInput() }
            },
            PMStateEntry("error replaces description", expect = mapOf("invalid" to "true")) {
                PMFormField(description = help, error = missing, label = subject) { SubjectInput() }
            },
            PMStateEntry(
                "error in a toast — the field stays invalid, no message",
                expect = mapOf("invalid" to "true"),
            ) {
                PMFormField(error = missing, errorPresentation = PMFormFieldErrorPresentation.Toast, label = subject) {
                    SubjectInput()
                }
            },
            PMStateEntry("disabled control", expect = mapOf("disabled" to "true")) {
                PMFormField(description = "Locked while the ticket is closed.", label = subject) {
                    SubjectInput(disabled = true)
                }
            },
            PMStateEntry("with Select", expect = mapOf("required" to "true", "contains" to "Select")) {
                PMFormField(description = "How fast this needs an answer.", label = "Priority", required = true) {
                    PMSelect(options = priorities, placeholder = "Choose one")
                }
            },
            PMStateEntry("with Select, in error", expect = mapOf("invalid" to "true")) {
                PMFormField(error = "Pick a priority before sending.", label = "Priority", required = true) {
                    PMSelect(options = priorities, placeholder = "Choose one")
                }
            },
            PMStateEntry(
                "with Checkbox — the field label becomes the row label",
                expect = mapOf("kind" to "row-labelled", "contains" to "Checkbox"),
            ) {
                PMFormField(description = "You can turn this off later.", label = "Email me about replies") {
                    PMCheckbox()
                }
            },
            PMStateEntry(
                "with Checkbox, in error",
                expect = mapOf("kind" to "row-labelled", "invalid" to "true"),
            ) {
                PMFormField(error = "You have to accept the terms to continue.", label = "Accept the terms") {
                    PMCheckbox()
                }
            },
            PMStateEntry(
                "required Checkbox — the row carries the marker",
                expect = mapOf("kind" to "row-labelled", "required" to "true"),
            ) { PMFormField(label = "Accept the terms", required = true) { PMCheckbox() } },
            PMStateEntry("with Switch", expect = mapOf("kind" to "row-labelled", "contains" to "Switch")) {
                PMFormField(label = "Desktop notifications") { PMSwitch() }
            },
            PMStateEntry(
                "described Switch — the message sits below the row",
                expect = mapOf("kind" to "row-labelled"),
            ) {
                PMFormField(
                    description = "One summary each morning instead of a notification per reply. Long enough to " +
                        "wrap, because the message runs the full width of the field.",
                    label = "Send a daily digest",
                ) { PMSwitch() }
            },
        )
}
