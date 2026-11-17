// EmptyState (`design/components/empty-state.md`): the message a view shows
// when there is nothing to show, for first runs, filters that match nothing
// and error-empty cases alike. Guidance, not an alarm: a muted glyph on a
// subtle wash whatever the case, a title that states the situation, what to do
// about it, and at most two actions.
//
// No entrance motion of its own: the fade belongs to whatever swapped the
// content out (ListPage's body), because a fade on first paint would animate a
// page load. Plain content, read in order, with no live region; the title is a
// heading, the web's `<h2>`, so TalkBack's headings navigation stops at it.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign

object PMEmptyState : PMEmptyStateRendering {
    @Composable
    override fun Render(props: PMEmptyStateProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val icon = props.icon ?: PMIconRole.Inbox
        val colors = theme.colors

        Column(
            modifier = Modifier
                .pmMember("EmptyState", mapOf("icon" to icon.value))
                .fillMaxWidth()
                .padding(horizontal = space.s6, vertical = space.s8),
            verticalArrangement = Arrangement.spacedBy(space.s4),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PMIconView(
                icon,
                PMControlSize.Lg,
                Modifier.background(colors.bgSubtle.color, theme.rounded(theme.radius.pill)).padding(space.s4),
                tint = colors.textMuted.color,
            )
            Text(
                text = props.title,
                style = theme.text.lg.textStyle,
                color = colors.textPrimary.color,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            props.description?.let {
                Text(
                    text = it,
                    style = theme.text.sm.textStyle,
                    color = colors.textSecondary.color,
                    textAlign = TextAlign.Center,
                    // A line length, not a width: the recipe's multiple of the largest space step.
                    modifier = Modifier.widthIn(max = space.s10 * PMRecipe.emptyStateMeasure),
                )
            }
            if (props.action != null || props.secondaryAction != null) {
                Row(
                    // One space step beyond the gap, to set the actions apart from the text.
                    modifier = Modifier.padding(top = space.s2),
                    horizontalArrangement = Arrangement.spacedBy(space.s3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    props.action?.invoke()
                    props.secondaryAction?.invoke()
                }
            }
        }
    }
}

/**
 * EmptyState's states, from the spec's States table. The actions are Buttons,
 * as the spec's convention names them: `soft`/`accent` and `ghost`.
 */
object EmptyStateStates : PMStates {
    override val member = "EmptyState"

    private const val title = "No tickets yet"
    private const val description = "Tickets your customers open by email or chat appear here."
    private const val create = "New ticket"
    private const val import = "Import tickets"
    private const val noResults = "No results match"
    private const val clear = "Clear filters"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("minimal", expect = mapOf("icon" to "inbox")) { PMEmptyState(title = title) },
            PMStateEntry("standard", expect = mapOf("icon" to "inbox")) {
                PMEmptyState(description = description, title = title)
            },
            PMStateEntry("with action", expect = mapOf("contains" to "Button")) {
                PMEmptyState(
                    action = { PMButton(icon = PMIconRole.Add, label = create, appearance = PMButtonAppearance.SoftAccent) },
                    description = description,
                    title = title,
                )
            },
            PMStateEntry("with both actions") {
                PMEmptyState(
                    action = { PMButton(icon = PMIconRole.Add, label = create, appearance = PMButtonAppearance.SoftAccent) },
                    description = description,
                    secondaryAction = { PMButton(label = import, appearance = PMButtonAppearance.GhostNeutral) },
                    title = title,
                )
            },
            PMStateEntry("filtered dry", expect = mapOf("icon" to "search")) {
                PMEmptyState(
                    icon = PMIconRole.Search,
                    secondaryAction = { PMButton(label = clear, appearance = PMButtonAppearance.GhostNeutral) },
                    title = noResults,
                )
            },
        )
}
