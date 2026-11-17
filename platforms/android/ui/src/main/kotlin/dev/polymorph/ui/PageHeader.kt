// PageHeader (`design/components/page-header.md`): the title, description and
// actions at the top of a working page. No size, variant or tone: the law keeps
// page headers alike. The title is the page's one top-level heading. The
// actions sit beside the text when both fit on one line, and wrap under it when
// they do not, as the web's wrapping row does; on a phone that is usually below.
// No border: the page body separates the header from what follows.
//
// The actions are the app's Buttons in an Inline: at most one solid, the rest
// outline or ghost (the hierarchy law, held by review).

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import kotlin.math.max

object PMPageHeader : PMPageHeaderRendering {
    @Composable
    override fun Render(props: PMPageHeaderProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val actions = props.actions
        val beside = space.s5
        val under = space.s4

        Layout(
            content = {
                Column(verticalArrangement = Arrangement.spacedBy(space.s2)) {
                    Text(
                        text = props.title,
                        style = theme.text.text2xl.textStyle,
                        color = theme.colors.textPrimary.color,
                        modifier = Modifier.semantics { heading() },
                    )
                    props.description?.let {
                        Text(
                            text = it,
                            style = theme.text.md.textStyle,
                            color = theme.colors.textSecondary.color,
                            // A line length, not a width: the recipe's multiple of the largest space step.
                            modifier = Modifier.widthIn(max = space.s10 * PMRecipe.pageHeaderMeasure),
                        )
                    }
                }
                if (actions != null) PMInline(gap = PMSpaceStep.S3, wrap = true) { actions() }
            },
            modifier = Modifier
                .pmMember("PageHeader", if (actions == null) emptyMap() else mapOf("actions" to "true"))
                .fillMaxWidth()
                .padding(bottom = space.s6),
        ) { measurables, constraints ->
            val width = constraints.maxWidth
            val loose = constraints.copy(minWidth = 0, minHeight = 0)
            if (measurables.size == 1) {
                val text = measurables[0].measure(loose)
                return@Layout layout(width, text.height) { text.placeRelative(0, 0) }
            }
            val gap = beside.roundToPx()
            val actionsWidth = measurables[1].maxIntrinsicWidth(Constraints.Infinity)
            val textWidth = measurables[0].maxIntrinsicWidth(Constraints.Infinity)
            if (textWidth + gap + actionsWidth <= width) {
                val text = measurables[0].measure(loose.copy(maxWidth = width - gap - actionsWidth))
                val row = measurables[1].measure(Constraints.fixedWidth(actionsWidth))
                layout(width, max(text.height, row.height)) {
                    text.placeRelative(0, 0)
                    row.placeRelative(width - actionsWidth, 0)
                }
            } else {
                val text = measurables[0].measure(loose)
                val row = measurables[1].measure(loose)
                val stacked = under.roundToPx()
                layout(width, text.height + stacked + row.height) {
                    text.placeRelative(0, 0)
                    row.placeRelative(0, text.height + stacked)
                }
            }
        }
    }
}

/** PageHeader's states, from the spec's States table. */
object PageHeaderStates : PMStates {
    override val member = "PageHeader"

    private const val title = "Tickets"
    private const val long = "Customer escalations awaiting a reply from the billing team"
    private const val description = "Everything customers have asked, newest first."
    private const val create = "New ticket"
    private const val export = "Export"

    @Composable
    private fun Actions() {
        PMButton(label = export, appearance = PMButtonAppearance.GhostNeutral)
        PMButton(icon = PMIconRole.Add, label = create)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("title only") { PMPageHeader(title = title) },
            PMStateEntry("with description") { PMPageHeader(description = description, title = title) },
            PMStateEntry("with actions", expect = mapOf("actions" to "true", "contains" to "Button")) {
                PMPageHeader(actions = { Actions() }, title = title)
            },
            PMStateEntry("full", expect = mapOf("actions" to "true")) {
                PMPageHeader(actions = { Actions() }, description = description, title = title)
            },
            PMStateEntry("long title and actions", expect = mapOf("actions" to "true")) {
                PMPageHeader(actions = { Actions() }, title = long)
            },
        )
}
