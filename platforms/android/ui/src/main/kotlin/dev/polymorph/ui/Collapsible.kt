// Collapsible (`design/components/collapsible.md`): one disclosure, such as
// "Advanced options" under a form. A button of the label and the `down`
// chevron, as wide as its label and flush with the content it discloses, and
// the region it opens. It is an inline control, not document structure: no
// rules and no heading (Accordion is the list of sections). The trigger and
// the region are the disclosure grammar Accordion shares
// (`PMDisclosureTrigger`, `PMDisclosureRegion`), at Collapsible's sizes: the
// small control height, `text.sm` in `text.secondary`, the small chevron, a
// `space-2` gap.
//
// The trigger's state is expanded or collapsed, as the web's `aria-expanded`
// is announced, and a press toggles it. The region's content gets the reading
// style, `text.sm` in `text.secondary` (Material's text style and content
// colour), which a member inside replaces with its own; the gap above it is
// inside the animated region, so it closes with the content. `open` with
// `onOpenChange` is the controlled pair; without it the disclosure keeps its
// own state, from `defaultOpen`.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
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

object PMCollapsible : PMCollapsibleRendering {
    @Composable
    override fun Render(props: PMCollapsibleProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val recipe = PMDisclosureRecipe(
            minHeight = density.controlHeight.sm.dp,
            paddingY = 0.dp,
            gap = density.spacing.s2,
            text = theme.text.sm,
            rest = theme.colors.textSecondary,
            chevron = PMControlSize.Sm,
            fills = false,
        )

        Column(Modifier.pmMember("Collapsible", mapOf("state" to if (open) "open" else "closed")).fillMaxWidth()) {
            PMDisclosureTrigger(props.label, open, recipe, onToggle = {
                own = !open
                props.onOpenChange?.invoke(!open)
            })
            PMDisclosureRegion(open) {
                Box(Modifier.fillMaxWidth().padding(top = density.spacing.s3)) {
                    CompositionLocalProvider(
                        LocalTextStyle provides theme.text.sm.textStyle,
                        LocalContentColor provides theme.colors.textSecondary.color,
                    ) { props.children() }
                }
            }
        }
    }
}

/** Collapsible's states, from the spec's States table. */
object CollapsibleStates : PMStates {
    override val member = "Collapsible"

    private const val label = "Advanced options"
    private const val note = "Retries back off exponentially from one second, up to five attempts, before the delivery is marked failed."

    @Composable
    private fun Paragraphs(count: Int) {
        Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
            repeat(count) { Text(note) }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed", expect = mapOf("state" to "closed")) {
                PMCollapsible(label = label) { Paragraphs(1) }
            },
            PMStateEntry("open", expect = mapOf("state" to "open")) {
                PMCollapsible(defaultOpen = true, label = label) { Paragraphs(1) }
            },
            PMStateEntry("controlled — the state follows the prop", expect = mapOf("state" to "open")) {
                PMCollapsible(label = label, onOpenChange = {}, open = true) { Paragraphs(1) }
            },
            PMStateEntry("long content — the trigger keeps its label's width", expect = mapOf("state" to "open")) {
                PMCollapsible(defaultOpen = true, label = label) { Paragraphs(3) }
            },
        )
}
