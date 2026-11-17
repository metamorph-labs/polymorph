// Emitted from a screen spec (`polymorph-screen/1`): `InboxScreen`, for Android. The screen is the
// spec's tree and nothing more: it holds no state, launches nothing and navigates nowhere. The app
// renders it from a store that owns the model, its coroutines and its router, and implements the
// actions (`design/native/screen-contract.md`).

package dev.polymorph.examples.relay

import androidx.compose.runtime.Composable
import dev.polymorph.ui.PMButton
import dev.polymorph.ui.PMButtonAppearance
import dev.polymorph.ui.PMCard
import dev.polymorph.ui.PMControlSize
import dev.polymorph.ui.PMDataTable
import dev.polymorph.ui.PMDataTableColumn
import dev.polymorph.ui.PMDataTableSort
import dev.polymorph.ui.PMDensityScope
import dev.polymorph.ui.PMDensityScopeAs
import dev.polymorph.ui.PMDensityScopeValue
import dev.polymorph.ui.PMEmptyStateProps
import dev.polymorph.ui.PMFilterBar
import dev.polymorph.ui.PMFilterResultCount
import dev.polymorph.ui.PMGrid
import dev.polymorph.ui.PMGridColumns
import dev.polymorph.ui.PMIconRole
import dev.polymorph.ui.PMListPage
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSearchInput
import dev.polymorph.ui.PMSelect
import dev.polymorph.ui.PMSelectOptionEntry
import dev.polymorph.ui.PMSome
import dev.polymorph.ui.PMSpaceStep
import dev.polymorph.ui.PMStat

/** What `InboxScreen` shows. `loadStatus` says which of the four load states it is in. */
data class InboxModel(
    val loadStatus: PMLoadStatus,
    /** Already filtered and sorted. */
    val tickets: List<Ticket>,
    /**
     * The queue's four numbers, derived by the container from the whole collection rather than from
     * the filtered view — which is why the band outlives the empty story.
     */
    val summary: QueueStats,
    /** Cell renderers are code, so they arrive as an input. */
    val columns: List<PMDataTableColumn<Ticket>>,
    val sort: PMDataTableSort,
    val isFiltered: Boolean,
    val resultCount: PMFilterResultCount,
    val query: String,
    val status: String?,
    val statusOptions: List<PMSelectOptionEntry>,
    val priority: String?,
    val priorityOptions: List<PMSelectOptionEntry>,
    val emptyState: PMEmptyStateProps,
) {
    /**
     * The app extends it with values of its own: `InboxModel.placeholder`, the model before
     * anything loads.
     */
    companion object
}

/** The code the app supplies to `InboxScreen`, one function per action. */
interface InboxActions {
    fun onSortChange(sort: PMDataTableSort)
    fun getRowId(ticket: Ticket): String
    fun onRowClick(ticket: Ticket)
    fun onNewTicket()
    /** Loads the queue again after a load failed. */
    fun onRetry()
    fun onClearFilters()
    fun onQueryChange(query: String)
    fun onStatusChange(value: String?)
    fun onPriorityChange(value: String?)
}

/** Relay's ticket queue — a filtered, sortable table under a page header. */
@Composable
fun InboxScreen(model: InboxModel, actions: InboxActions) {
    PMListPage(
        loadStatus = model.loadStatus,
        onRetry = actions::onRetry,
        actions = {
            PMButton(icon = PMIconRole.Add, label = "New ticket", onClick = actions::onNewTicket)
        },
        emptyState = PMEmptyStateProps(
            description = "Every conversation is still here — the filters are hiding them.",
            icon = PMIconRole.Search,
            secondaryAction = {
                PMButton(
                    label = "Clear filters",
                    onClick = actions::onClearFilters,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            },
            title = "No tickets match these filters",
        ),
        filters = {
            PMFilterBar(
                isFiltered = model.isFiltered,
                onClear = actions::onClearFilters,
                resultCount = model.resultCount,
                search = {
                    PMSearchInput(
                        ariaLabel = "Search tickets",
                        onChange = actions::onQueryChange,
                        placeholder = "Search tickets…",
                        size = PMControlSize.Sm,
                        value = model.query,
                    )
                },
            ) {
                PMSelect(
                    ariaLabel = "Filter by status",
                    emptyOption = "Any status",
                    onChange = actions::onStatusChange,
                    options = model.statusOptions,
                    size = PMControlSize.Sm,
                    value = PMSome(model.status),
                )
                PMSelect(
                    ariaLabel = "Filter by priority",
                    emptyOption = "Any priority",
                    onChange = actions::onPriorityChange,
                    options = model.priorityOptions,
                    size = PMControlSize.Sm,
                    value = PMSome(model.priority),
                )
            }
        },
        summary = {
            PMGrid(columns = PMGridColumns.Columns4, gap = PMSpaceStep.S6) {
                PMCard {
                    PMStat(
                        footer = model.summary.open.footer,
                        label = model.summary.open.label,
                        trend = model.summary.open.trend,
                        value = model.summary.open.value,
                    )
                }
                PMCard {
                    PMStat(
                        footer = model.summary.urgent.footer,
                        label = model.summary.urgent.label,
                        trend = model.summary.urgent.trend,
                        value = model.summary.urgent.value,
                    )
                }
                PMCard {
                    PMStat(
                        footer = model.summary.response.footer,
                        label = model.summary.response.label,
                        trend = model.summary.response.trend,
                        value = model.summary.response.value,
                    )
                }
                PMCard {
                    PMStat(
                        footer = model.summary.solved.footer,
                        label = model.summary.solved.label,
                        trend = model.summary.solved.trend,
                        value = model.summary.solved.value,
                    )
                }
            }
        },
        title = "Inbox",
    ) {
        // Rung 2, declared: A queue is scanned rather than read, so more rows in the same viewport
        // is worth more here than the breathing room the rest of the product gets. Nothing new is
        // invented: this is the same theme in its compact variant, applied to a region.
        PMDensityScope(`as` = PMDensityScopeAs.Section, value = PMDensityScopeValue.Compact) {
            PMDataTable(
                columns = model.columns,
                data = model.tickets,
                emptyState = model.emptyState,
                getRowId = actions::getRowId,
                label = "Tickets",
                onRowClick = actions::onRowClick,
                onSortChange = actions::onSortChange,
                sort = model.sort,
                stickyHeader = true,
            )
        }
    }
}

/**
 * Every action doing nothing, so an app compiles against the screen before it wires its store. An
 * action that answers returns the empty value of its result.
 */
object InboxInert : InboxActions {
    override fun onSortChange(sort: PMDataTableSort) {}
    override fun getRowId(ticket: Ticket): String = ""
    override fun onRowClick(ticket: Ticket) {}
    override fun onNewTicket() {}
    override fun onRetry() {}
    override fun onClearFilters() {}
    override fun onQueryChange(query: String) {}
    override fun onStatusChange(value: String?) {}
    override fun onPriorityChange(value: String?) {}
}
