// Textarea (`design/components/textarea.md`): multi-line text entry, Input's
// recipe extended vertically. A Compose `BasicTextField` that wraps, inside
// Input's container (`pmFieldBox`) in every state, with the recipe's padding
// (`space.3` by `space.4`), the `text.sm` step, whose line box sets the
// rhythm, and at least the `md` control height.
//
// `rows` is the height in lines: the field reserves that many and scrolls
// past them. `autosize` lets it grow with its content, `rows` staying the
// floor. `resize` has no counterpart: Android draws no resize handle, so a
// field is as tall as its rows or its content and is never dragged; the
// attribute still says which the web would draw, and `autosize` implies
// `none`, as on the web. These are the SwiftUI member's decisions.
//
// Platform forms of the web's behaviour, as on Input: a tap anywhere in the
// frame focuses the field; the focus ring is drawn while it has focus;
// `invalid` is the field's accessibility error (the FormField's message, else
// "Invalid"); `readOnly` is Compose's read-only text field, selectable and not
// editable; Return writes a line break. The phone's focus-zoom floor is a
// browser behaviour with no native counterpart.
//
// Not honoured, because Compose has no counterpart: `id`, `name` and the
// `aria-describedby`/`aria-labelledby` ids (a FormField names the field
// through `LocalPMField`); `ariaRequired`, which Android has no semantics for;
// and the opaque `controlRef`, `onSelect` and composition events, whose types
// the contract cannot express (`PMUnsupported.props`).

package dev.polymorph.ui

import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import kotlin.math.max

object PMTextarea : PMTextareaRendering {
    @Composable
    override fun Render(props: PMTextareaProps) {
        val theme = PM.theme
        val colors = theme.colors
        val density = theme.defaultDensity
        val space = density.spacing
        val facts = pmFieldFacts(props.ariaLabel, props.placeholder, props.disabled, props.invalid, props.readOnly)
        val rows = max(1, (props.rows ?: DEFAULT_ROWS).toInt())
        val autosize = props.autosize ?: false
        // Autosize implies `none`: a box that sizes itself has one owner for its height.
        val resize = if (autosize) PMTextareaResize.None else props.resize ?: PMTextareaResize.Vertical

        var draft by remember { mutableStateOf(props.defaultValue ?: "") }
        val value = props.value ?: draft
        val set: (String) -> Unit = { next ->
            val kept = props.maxLength?.let { next.take(it.toInt()) } ?: next
            draft = kept
            props.onChange?.invoke(kept)
        }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val hovered by interaction.collectIsHoveredAsState()
        val focus = remember { FocusRequester() }
        LaunchedEffect(Unit) { if (props.autoFocus == true && !facts.disabled) focus.requestFocus() }

        val step = theme.text.sm.textStyle
        val attributes = buildMap {
            put("resize", resize.value)
            if (autosize) put("autosize", "true")
            if (facts.invalid) put("invalid", "true")
            if (facts.disabled) put("disabled", "true")
            if (facts.readOnly) put("readonly", "true")
        }

        BasicTextField(
            value = value,
            onValueChange = set,
            modifier = Modifier
                .pmMember("Textarea", attributes)
                .pmFieldError(facts)
                .fillMaxWidth()
                .pmHitTarget()
                .hoverable(interaction)
                .focusRequester(focus)
                .pmFocusEvents(props.onFocus, props.onBlur),
            enabled = !facts.disabled,
            readOnly = facts.readOnly,
            textStyle = step.copy(color = facts.textColor),
            singleLine = false,
            minLines = rows,
            maxLines = if (autosize) Int.MAX_VALUE else rows,
            interactionSource = interaction,
            cursorBrush = SolidColor(colors.accentText.color),
            decorationBox = { text ->
                Box(
                    Modifier
                        .pmFieldBox(
                            invalid = facts.invalid,
                            disabled = facts.disabled,
                            readOnly = facts.readOnly,
                            focused = focused,
                            hovered = hovered,
                        )
                        .heightIn(min = density.controlHeight.md.dp)
                        .padding(horizontal = space.s4, vertical = space.s3),
                ) {
                    Box(Modifier.pmFieldName(facts.name)) {
                        if (value.isEmpty()) props.placeholder?.let { PMFieldPlaceholder(it, step, singleLine = false) }
                        text()
                    }
                }
            },
        )
    }

    /** The height in lines when `rows` is not given (`textarea.md`). */
    private const val DEFAULT_ROWS = 4.0
}

/**
 * Textarea's states, from the spec's States table. The entry inside a
 * FormField is FormField's to draw, because the harness reads the first
 * member in the tree as the root.
 */
object TextareaStates : PMStates {
    override val member = "Textarea"

    private const val notes = "Notes"
    private const val note =
        "Retries stop after the first 5xx and never resume. Re-delivering by hand works, so the endpoint is reachable."

    /** Longer than four rows, in lines of its own, so the growth does not depend on the width. */
    private val steps = listOf(
        "Steps:",
        "1. Create a webhook endpoint that returns 502 once.",
        "2. Send a delivery.",
        "3. Watch the retry schedule stop instead of backing off.",
        "",
        "First failure 09:12 UTC, POST /hooks/deliveries.",
    ).joinToString("\n")

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest", expect = mapOf("resize" to "vertical", "label" to notes)) {
                PMTextarea(ariaLabel = notes, placeholder = "What happened?")
            },
            PMStateEntry("with a value", expect = mapOf("label" to notes)) {
                PMTextarea(ariaLabel = notes, defaultValue = note)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMTextarea(ariaLabel = notes, defaultValue = "Too short.", invalid = true)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMTextarea(ariaLabel = notes, defaultValue = note, disabled = true)
            },
            PMStateEntry("read only", expect = mapOf("readonly" to "true")) {
                PMTextarea(ariaLabel = notes, defaultValue = note, readOnly = true)
            },
            PMStateEntry("taller — the height decision, in line units") {
                PMTextarea(ariaLabel = notes, defaultValue = note, rows = 8.0)
            },
            PMStateEntry("not resizable", expect = mapOf("resize" to "none")) {
                PMTextarea(ariaLabel = notes, defaultValue = note, resize = PMTextareaResize.None)
            },
            PMStateEntry(
                "autosize — the box is as tall as what is in it",
                expect = mapOf("autosize" to "true", "resize" to "none"),
            ) { PMTextarea(ariaLabel = notes, autosize = true, defaultValue = steps) },
            PMStateEntry(
                "autosize, with one line — `rows` is still the floor",
                expect = mapOf("autosize" to "true", "resize" to "none"),
            ) { PMTextarea(ariaLabel = notes, autosize = true, defaultValue = "It broke.") },
        )
}
