// ListPage (`design/archetypes/list-page.md`): the records screen. The page
// header, the summary band, the filter row and the body panel, in that order,
// in a scroll container. The order is the archetype's, so a screen cannot
// assemble it another way.
//
// The body is a panel in Card's surface recipe, and the load status decides
// what is in it (`design/native/screen-contract.md`, "The four load states"):
// `ready` draws `children`, `loading` rows of Skeletons, `empty` the
// `emptyState` the page cannot be built without, and `failed` a danger Alert
// with the message, offering `onRetry` when it is set. The header, the summary
// and the filters render in every state, so the page's own numbers outlive a
// filter that matches nothing. The body crossfades at the surface's duration;
// nothing moves focus.
//
// The page column, the panel, the failed Alert and the skeleton rows are what
// the page archetypes share (`PolymorphUIPages.kt`).

package dev.polymorph.ui

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

object PMListPage : PMListPageRendering {
    @Composable
    override fun Render(props: PMListPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val status = props.loadStatus
        PMPage(PMRecipe.listPageMeasure, "ListPage", status) {
            PMPageHeader(actions = props.actions, description = props.description, title = props.title)
            props.summary?.invoke()
            props.filters?.let { filters -> PMInline(gap = PMSpaceStep.S3, wrap = true) { filters() } }
            PMPagePanel {
                Crossfade(status, animationSpec = motion.easing.standard.tween(motion.duration.surface), label = "body") { shown ->
                    when (shown) {
                        PMLoadStatus.Ready -> props.children()
                        PMLoadStatus.Loading -> Box(Modifier.padding(space.s4)) { PMPageSkeletonRows() }
                        PMLoadStatus.Empty -> PMEmptyState(
                            action = props.emptyState.action,
                            description = props.emptyState.description,
                            icon = props.emptyState.icon,
                            secondaryAction = props.emptyState.secondaryAction,
                            title = props.emptyState.title,
                        )
                        is PMLoadStatus.Failed -> Box(Modifier.padding(space.s4)) { PMPageFailure(shown.message, props.onRetry) }
                    }
                }
            }
        }
    }
}

/**
 * ListPage's states: the four load states the screen contract names, the
 * summary band, and the filtered-dry empty state with its secondary action.
 * Each names what its panel holds (`contains`): the table, the Skeletons, the
 * empty state or the Alert.
 */
object ListPageStates : PMStates {
    override val member = "ListPage"

    private const val title = "Tickets"
    private const val description = "Everything customers have asked, newest first."
    private const val create = "New ticket"
    private const val clear = "Clear filters"
    private const val failure = "The tickets could not be loaded. Check your connection."

    @Composable
    private fun Page(status: PMLoadStatus, summary: Boolean = false, filtered: Boolean = false) {
        val empty = if (filtered) {
            PMEmptyStateProps(
                icon = PMIconRole.Search,
                secondaryAction = { PMButton(label = clear, appearance = PMButtonAppearance.GhostNeutral) },
                title = "No tickets match these filters",
            )
        } else {
            PMEmptyStateProps(title = "No tickets yet")
        }
        PMListPage(
            loadStatus = status,
            onRetry = {},
            actions = { PMButton(icon = PMIconRole.Add, label = create) },
            description = description,
            emptyState = empty,
            filters = {
                PMBadge(children = "Open", variant = PMBadgeVariant.Outline)
                PMBadge(children = "High", variant = PMBadgeVariant.Outline)
            },
            summary = if (summary) ({ Summary() }) else null,
            title = title,
        ) {
            PMDataTable(
                columns = listOf(
                    PMDataTableColumn("subject", "Subject", { it.subject }),
                    PMDataTableColumn("status", "Status", { it.status }),
                ),
                data = DataTableStates.tickets,
                emptyState = PMEmptyStateProps(title = "No tickets yet"),
                getRowId = { it.id },
                label = title,
            )
        }
    }

    @Composable
    private fun Summary() {
        PMGrid(columns = PMGridColumns.Columns4, gap = PMSpaceStep.S6) {
            PMCard { PMStat(label = "Open", value = "128") }
            PMCard { PMStat(label = "Waiting", value = "36") }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready", expect = mapOf("status" to "ready", "contains" to "DataTable")) { Page(PMLoadStatus.Ready) },
            PMStateEntry("loading", expect = mapOf("status" to "loading", "contains" to "Skeleton")) {
                Page(PMLoadStatus.Loading)
            },
            PMStateEntry("empty", expect = mapOf("status" to "empty", "contains" to "EmptyState")) {
                Page(PMLoadStatus.Empty)
            },
            PMStateEntry("failed", expect = mapOf("status" to "failed", "contains" to "Alert,Button")) {
                Page(PMLoadStatus.Failed(failure))
            },
            PMStateEntry("with a summary", expect = mapOf("status" to "ready", "contains" to "Stat,DataTable")) {
                Page(PMLoadStatus.Ready, summary = true)
            },
            PMStateEntry("empty with a summary", expect = mapOf("status" to "empty", "contains" to "Stat,EmptyState")) {
                Page(PMLoadStatus.Empty, summary = true)
            },
            PMStateEntry("filtered dry", expect = mapOf("status" to "empty", "contains" to "EmptyState")) {
                Page(PMLoadStatus.Empty, filtered = true)
            },
        )
}
