// Dashboard (`design/archetypes/dashboard.md`): the overview screen. The page
// header, the stat row, and the body's two weighted regions, in that order, in
// the page column at ListPage's thirteen of the largest space step
// (`PMRecipe.dashboardMeasure`), so the two overview archetypes match. It is
// not a widget canvas: the regions are named and fixed.
//
// The stat row takes data, not composables: each `PMStatProps` is a Stat in a
// Card, in equal tracks that follow Grid's rule with the row's count as the
// ceiling (all of them from 44rem, half rounded up from 28rem, one below), with
// the page gutter between them rather than a space step. Stat draws without
// its spark on Android, and its trend chip carries the direction, as the
// platform map says. The body is the primary region and the secondary one at 2
// to 1 from a 44rem body, stacked below it with the secondary second
// (`PMPageRegions`); with no secondary the primary takes the width. Each
// region is a column of the app's panels at the page gutter.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton stats, as many as the row holds (two,
// the spec's least, while the app passes an empty row), and a panel of
// Skeleton rows in the primary region; `failed` a danger Alert in place of the
// stats and the regions, with `onRetry` when it is set; `empty` is `ready`,
// because each panel's members carry their own empty states.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

object PMDashboard : PMDashboardRendering {
    /** The stat row's least count, the spec's, drawn while loading an empty row. */
    private const val LEAST_STATS = 2

    @Composable
    override fun Render(props: PMDashboardProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        val stats = props.stats ?: emptyList()
        PMPage(PMRecipe.dashboardMeasure, "Dashboard", status) {
            PMPageHeader(actions = props.actions, description = props.description, title = props.title)
            when (status) {
                PMLoadStatus.Ready, PMLoadStatus.Empty -> {
                    if (stats.isNotEmpty()) {
                        PMGridLayout(ceiling = stats.size, gap = space.s6, align = PMCrossAlign.Stretch) {
                            for (stat in stats) PMCard { PMStat.Render(stat) }
                        }
                    }
                    Regions(props.primary, props.secondary)
                }
                PMLoadStatus.Loading -> {
                    val count = maxOf(stats.size, LEAST_STATS)
                    PMGridLayout(ceiling = count, gap = space.s6, align = PMCrossAlign.Stretch) {
                        repeat(count) {
                            PMCard {
                                Column(verticalArrangement = Arrangement.spacedBy(space.s2)) {
                                    PMSkeleton(textStep = PMSkeletonTextStep.Xs, width = PMSkeletonWidth.Width8)
                                    PMSkeleton(textStep = PMSkeletonTextStep.TextStep2xl, width = PMSkeletonWidth.Width9)
                                }
                            }
                        }
                    }
                    PMPagePanel { Box(Modifier.padding(space.s4)) { PMPageSkeletonRows() } }
                }
                is PMLoadStatus.Failed -> PMPageFailure(status.message, props.onRetry)
            }
        }
    }

    /** The primary region and the secondary one at 2 to 1, or the primary alone. */
    @Composable
    private fun Regions(primary: PMContent, secondary: PMContent?) {
        val space = PM.theme.defaultDensity.spacing
        val column: @Composable (PMContent) -> Unit = { content ->
            Column(verticalArrangement = Arrangement.spacedBy(space.s6)) { content() }
        }
        if (secondary == null) {
            column(primary)
        } else {
            PMPageRegions(gap = space.s6, main = { column(primary) }, side = { column(secondary) }, weights = PRIMARY to SECONDARY)
        }
    }

    /** The body's weights, the recipe's `2fr 1fr`. */
    private const val PRIMARY = 2f
    private const val SECONDARY = 1f
}

/**
 * Dashboard's states: the four load states over three stats, a primary table
 * panel and a secondary panel, and the spec's entries with four stats and with
 * no secondary. Each names what its body holds (`contains`).
 */
object DashboardStates : PMStates {
    override val member = "Dashboard"

    private const val title = "Support"
    private const val description = "How the queue is doing this week."
    private const val failure = "The dashboard could not be loaded."

    private val three = listOf(
        PMStatProps(label = "Open", value = "128"),
        PMStatProps(label = "Waiting", value = "36"),
        PMStatProps(label = "Solved today", value = "54"),
    )
    private val four = three + PMStatProps(label = "First reply", value = "2h 10m")

    @Composable
    private fun Primary() {
        PMCard {
            PMDataTable(
                columns = listOf(
                    PMDataTableColumn("subject", "Subject", { it.subject }),
                    PMDataTableColumn("status", "Status", { it.status }),
                ),
                data = DataTableStates.tickets,
                emptyState = PMEmptyStateProps(title = "No tickets yet"),
                getRowId = { it.id },
                label = "Tickets",
            )
        }
    }

    @Composable
    private fun Secondary() {
        PMCard { PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(PMSamples.note) } }
    }

    @Composable
    private fun Page(status: PMLoadStatus, stats: List<PMStatProps> = three, secondary: Boolean = true) {
        PMDashboard(
            loadStatus = status,
            onRetry = {},
            description = description,
            primary = { Primary() },
            secondary = if (secondary) ({ Secondary() }) else null,
            stats = stats,
            title = title,
        )
    }

    /** The wide entry's height, in multiples of `space.10`: the page scrolls, so its frame is bounded. */
    private const val TABLET = 12

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready — three stats and two regions", expect = mapOf("status" to "ready", "contains" to "Stat,DataTable,Text")) {
                Page(PMLoadStatus.Ready)
            },
            PMStateEntry("loading", expect = mapOf("status" to "loading", "contains" to "Skeleton")) { Page(PMLoadStatus.Loading) },
            PMStateEntry("empty — as ready", expect = mapOf("status" to "empty", "contains" to "Stat")) { Page(PMLoadStatus.Empty) },
            PMStateEntry("failed", expect = mapOf("status" to "failed", "contains" to "Alert")) { Page(PMLoadStatus.Failed(failure)) },
            PMStateEntry("four stats", expect = mapOf("status" to "ready", "contains" to "Stat")) { Page(PMLoadStatus.Ready, stats = four) },
            PMStateEntry("no secondary", expect = mapOf("status" to "ready", "contains" to "DataTable")) {
                Page(PMLoadStatus.Ready, secondary = false)
            },
            PMStateEntry("wide — the regions side by side", expect = mapOf("status" to "ready")) {
                PMFixtureWidth(PMGeometry.compactWidth * 2) {
                    Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * TABLET)) { Page(PMLoadStatus.Ready, stats = four) }
                }
            },
        )
}
