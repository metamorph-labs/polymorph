// DetailPage (`design/archetypes/detail-page.md`): one entity in full. The back
// Button, the identity header (the title, the meta row, the actions), the
// full-width tabs, and the body: the main column with the aside beside it, in
// the page column at eleven of the largest space step
// (`PMRecipe.detailPageMeasure`), in a scroll container.
//
// The back Button is Button's ghost/neutral/sm with the `back` glyph, first in
// reading order, before the title, as the web puts it first; it sits `space.2`
// above the title because it belongs to it. The title is `text.2xl`, the
// page's one top-level heading. The meta row is a wrapping Inline of the app's
// items at `space.3`, in `text.sm` secondary. The actions sit beside the title
// and meta when both fit on one line and wrap under them when they do not, as
// PageHeader's do: on a phone that is usually under.
//
// The aside is `space.10 * 3` wide (`PMRecipe.detailAsideWidth`) beside the
// main column from a 44rem body (`PMPageRegions`), and moves under the main
// column below it, with the page gutter between them: on a phone a fixed-width
// aside would leave the main column a sliver. It scrolls with the page,
// because two scroll regions on one screen lose the reader's place.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton rows in the main column and no aside
// and no tabs; `failed` a danger Alert in place of the body, with `onRetry`
// when it is set; `empty` is `ready`, because an entity has no empty form.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import kotlin.math.max

object PMDetailPage : PMDetailPageRendering {
    @Composable
    override fun Render(props: PMDetailPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        PMPage(PMRecipe.detailPageMeasure, "DetailPage", status) {
            Column(verticalArrangement = Arrangement.spacedBy(space.s2)) {
                Row {
                    PMButton(
                        icon = PMIconRole.Back,
                        label = props.backLabel,
                        onClick = props.onBack,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
                Header(props)
            }
            when (status) {
                PMLoadStatus.Ready, PMLoadStatus.Empty -> {
                    props.tabs?.invoke()
                    val aside = props.aside
                    if (aside != null) {
                        PMPageRegions(
                            gap = space.s6,
                            main = { props.children?.invoke() },
                            side = { Column(verticalArrangement = Arrangement.spacedBy(space.s4)) { aside() } },
                            sideWidth = space.s10 * PMRecipe.detailAsideWidth,
                        )
                    } else {
                        props.children?.invoke()
                    }
                }
                PMLoadStatus.Loading -> PMPagePanel { Box(Modifier.padding(space.s4)) { PMPageSkeletonRows() } }
                is PMLoadStatus.Failed -> PMPageFailure(status.message, props.onRetry)
            }
        }
    }

    /**
     * The title and the meta row, with the actions beside them when all fit
     * on one line and under them when they do not.
     */
    @Composable
    private fun Header(props: PMDetailPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val actions = props.actions
        Layout(
            content = {
                Column(verticalArrangement = Arrangement.spacedBy(space.s2)) {
                    Text(
                        text = props.title,
                        style = theme.text.text2xl.textStyle,
                        color = theme.colors.textPrimary.color,
                        modifier = Modifier.semantics { heading() },
                    )
                    props.meta?.let { meta ->
                        CompositionLocalProvider(
                            LocalTextStyle provides theme.text.sm.textStyle,
                            LocalContentColor provides theme.colors.textSecondary.color,
                        ) { PMInline(gap = PMSpaceStep.S3, wrap = true) { meta() } }
                    }
                }
                if (actions != null) PMInline(gap = PMSpaceStep.S3, wrap = true) { actions() }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { measurables, constraints ->
            val width = constraints.maxWidth
            val loose = constraints.copy(minWidth = 0, minHeight = 0)
            if (measurables.size == 1) {
                val identity = measurables[0].measure(loose)
                return@Layout layout(width, identity.height) { identity.placeRelative(0, 0) }
            }
            val gap = space.s6.roundToPx()
            val actionsWidth = measurables[1].maxIntrinsicWidth(Constraints.Infinity)
            val identityWidth = measurables[0].maxIntrinsicWidth(Constraints.Infinity)
            if (identityWidth + gap + actionsWidth <= width) {
                val identity = measurables[0].measure(loose.copy(maxWidth = width - gap - actionsWidth))
                val row = measurables[1].measure(Constraints.fixedWidth(actionsWidth))
                layout(width, max(identity.height, row.height)) {
                    identity.placeRelative(0, 0)
                    row.placeRelative(width - actionsWidth, 0)
                }
            } else {
                val identity = measurables[0].measure(loose)
                val row = measurables[1].measure(loose)
                val under = space.s4.roundToPx()
                layout(width, identity.height + under + row.height) {
                    identity.placeRelative(0, 0)
                    row.placeRelative(0, identity.height + under)
                }
            }
        }
    }
}

/**
 * DetailPage's states: the four load states over the full page (back, meta,
 * actions, tabs and aside), and the spec's entries without tabs, without an
 * aside, and minimal. Each names what its body holds (`contains`).
 */
object DetailPageStates : PMStates {
    override val member = "DetailPage"

    private const val back = "Tickets"
    private const val title = "Refund for a duplicate charge"
    private const val failure = "The ticket could not be loaded."
    private const val opened = "Opened 3 days ago"
    private const val assignee = "Ada Okonkwo"
    private const val priority = "High"
    private const val body = "The customer was charged twice for the March invoice and asks for the second charge back."

    private val tabs = listOf(
        PMTabDescriptor(value = "conversation", label = "Conversation"),
        PMTabDescriptor(value = "history", label = "History"),
    )

    @Composable
    private fun Tabs() {
        PMTabs(defaultValue = "conversation", tabs = tabs) {
            for (tab in tabs) PMTabsContent(tab.value) { PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(tab.label) } }
        }
    }

    @Composable
    private fun Meta() {
        PMBadge(children = "Waiting", tone = PMBadgeTone.Warning)
        Text(opened)
    }

    @Composable
    private fun Aside() {
        PMCard {
            PMDescriptionList(
                items = listOf(
                    PMDescriptionListItem("Assignee") { Text(assignee) },
                    PMDescriptionListItem("Priority") { Text(priority) },
                ),
            )
        }
    }

    @Composable
    private fun Page(
        status: PMLoadStatus,
        withTabs: Boolean = true,
        withAside: Boolean = true,
        minimal: Boolean = false,
    ) {
        PMDetailPage(
            loadStatus = status,
            onRetry = {},
            actions = if (minimal) null else ({ PMButton(label = "Reply") }),
            aside = if (withAside && !minimal) ({ Aside() }) else null,
            backLabel = back,
            meta = if (minimal) null else ({ Meta() }),
            onBack = {},
            tabs = if (withTabs && !minimal) ({ Tabs() }) else null,
            title = title,
        ) { PMText { Text(body) } }
    }

    /** The wide entry's height, in multiples of `space.10`: the page scrolls, so its frame is bounded. */
    private const val TABLET = 10

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready — the full page", expect = mapOf("status" to "ready", "contains" to "Button,Badge,Tabs,DescriptionList")) {
                Page(PMLoadStatus.Ready)
            },
            PMStateEntry("loading", expect = mapOf("status" to "loading", "contains" to "Skeleton")) { Page(PMLoadStatus.Loading) },
            PMStateEntry("empty — as ready", expect = mapOf("status" to "empty", "contains" to "DescriptionList")) { Page(PMLoadStatus.Empty) },
            PMStateEntry("failed", expect = mapOf("status" to "failed", "contains" to "Alert")) { Page(PMLoadStatus.Failed(failure)) },
            PMStateEntry("no tabs", expect = mapOf("status" to "ready", "contains" to "DescriptionList")) {
                Page(PMLoadStatus.Ready, withTabs = false)
            },
            PMStateEntry("no aside", expect = mapOf("status" to "ready", "contains" to "Text")) { Page(PMLoadStatus.Ready, withAside = false) },
            PMStateEntry("minimal — back, title and body", expect = mapOf("status" to "ready", "contains" to "Button,Text")) {
                Page(PMLoadStatus.Ready, minimal = true)
            },
            PMStateEntry("wide — the aside beside the main column", expect = mapOf("status" to "ready")) {
                PMFixtureWidth(PMGeometry.compactWidth * 2) {
                    Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * TABLET)) { Page(PMLoadStatus.Ready) }
                }
            },
        )
}
