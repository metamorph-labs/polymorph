// ReasoningDisclosure (`design/components/reasoning-disclosure.md`): a model's
// reasoning behind one trigger, labelled in the app's words ("Thinking…",
// "Thought for 12 seconds"). It is Collapsible with a status, drawn in the
// same disclosure grammar (`PMDisclosureTrigger`, `PMDisclosureRegion`) at
// Collapsible's sizes exactly: the small control height, `text.sm` in
// `text.secondary`, the small chevron, a `space.2` gap, colour-only hover. The
// one addition to the trigger is a leading mark in `text.muted`: the
// `reasoning` glyph, or while the model reasons the `loading` glyph on the
// `spin` loop (`PMSpinGlyph`, Button's spinner, still at the `none`
// temperament). The label stays the app's: the member never writes a verb or
// a duration.
//
// The region holds the reasoning (a Markdown or a StreamingText at `sm`, which
// set their own type) `space.3` below the trigger, inside the animated region
// so the gap closes with it, `space.2` in from the leading edge and behind
// Markdown's quote rule (`pmQuoteRule`), so quoting and thinking share one
// quieter style. It opens and closes as Collapsible's does.
//
// The trigger is a button, not a heading: a disclosure inside a reply is not
// an outline entry. Its state is expanded or collapsed, as the web's
// `aria-expanded` is announced. The web's `aria-busy` has no counterpart in
// Compose's semantics: the label says the model is still thinking, and the
// root carries `streaming`. A closed region is not in the tree. `open` with
// `onOpenChange` is the controlled pair; without it the disclosure keeps its
// own state, from `defaultOpen`, closed by default.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

object PMReasoningDisclosure : PMReasoningDisclosureRendering {
    @Composable
    override fun Render(props: PMReasoningDisclosureProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val streaming = props.streaming ?: false
        val muted = theme.colors.textMuted.color
        val recipe = PMDisclosureRecipe(
            minHeight = density.controlHeight.sm.dp,
            paddingY = 0.dp,
            gap = space.s2,
            text = theme.text.sm,
            rest = theme.colors.textSecondary,
            chevron = PMControlSize.Sm,
            fills = false,
        )
        val attributes = buildMap {
            put("state", if (open) "open" else "closed")
            if (streaming) put("streaming", "true")
        }

        Column(Modifier.pmMember("ReasoningDisclosure", attributes).fillMaxWidth()) {
            PMDisclosureTrigger(
                label = props.label,
                open = open,
                recipe = recipe,
                onToggle = {
                    own = !open
                    props.onOpenChange?.invoke(!open)
                },
                mark = {
                    if (streaming) PMSpinGlyph(PMControlSize.Sm, muted) else PMIconView(PMIconRole.Reasoning, PMControlSize.Sm, tint = muted)
                },
            )
            PMDisclosureRegion(open) {
                Box(Modifier.fillMaxWidth().padding(top = space.s3, start = space.s2).pmQuoteRule()) {
                    CompositionLocalProvider(
                        LocalTextStyle provides theme.text.sm.textStyle,
                        LocalContentColor provides theme.colors.textSecondary.color,
                    ) { props.children() }
                }
            }
        }
    }
}

/** ReasoningDisclosure's states, from the spec's States table. */
object ReasoningDisclosureStates : PMStates {
    override val member = "ReasoningDisclosure"

    private const val thought = "Thought for 12 seconds"
    private const val thinking = "Thinking…"
    private const val reasoning = "The receiver refused the second delivery, so the key must be the same on both. " +
        "The backoff cap was three; the incident log shows a fourth attempt was needed."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed", expect = mapOf("state" to "closed")) {
                PMReasoningDisclosure(label = thought) { Text(reasoning) }
            },
            PMStateEntry("open", expect = mapOf("state" to "open", "contains" to "Markdown")) {
                PMReasoningDisclosure(defaultOpen = true, label = thought) { PMMarkdown(children = reasoning, size = PMMarkdownSize.Sm) }
            },
            PMStateEntry("thinking — the mark spins", expect = mapOf("state" to "open", "streaming" to "true", "contains" to "StreamingText")) {
                PMReasoningDisclosure(defaultOpen = true, label = thinking, streaming = true) {
                    PMStreamingText(children = reasoning.take(TYPED), size = PMStreamingTextSize.Sm, streaming = true)
                }
            },
            PMStateEntry("controlled", expect = mapOf("state" to "open")) {
                PMReasoningDisclosure(label = thought, onOpenChange = {}, open = true) { Text(reasoning) }
            },
        )

    /** How much of the reasoning has arrived in the thinking entry. */
    private const val TYPED = 60
}
