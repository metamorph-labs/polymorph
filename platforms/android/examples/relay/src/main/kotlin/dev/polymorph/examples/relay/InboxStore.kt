// Relay's inbox, wired as the screen contract's worked example wires it
// (`design/native/screen-contract.md`): the store holds the emitted screen's
// model and implements its actions, the router opens the screens the actions
// name, and the route renders the screen and starts the load. The screen
// itself, `InboxScreen.kt`, is emitted from `examples/relay/Screens/inbox.json` by
// `pnpm emit:examples` and holds none of this.

package dev.polymorph.examples.relay

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.polymorph.ui.PMBadge
import dev.polymorph.ui.PMBadgeTone
import dev.polymorph.ui.PMBadgeVariant
import dev.polymorph.ui.PMDataTableColumn
import dev.polymorph.ui.PMDataTableSort
import dev.polymorph.ui.PMEmptyStateProps
import dev.polymorph.ui.PMFilterResultCount
import dev.polymorph.ui.PMIconRole
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSelectOption
import dev.polymorph.ui.PMSelectOptionEntry
import dev.polymorph.ui.PMSortDirection
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Where the inbox can send the app. */
sealed interface Destination {
    data class Ticket(val id: String) : Destination
    data object NewTicket : Destination
}

/** The app's router: the path its root navigation reads. */
class Router {
    private val stack = MutableStateFlow<List<Destination>>(emptyList())
    val path: StateFlow<List<Destination>> = stack.asStateFlow()

    fun open(destination: Destination) = stack.update { it + destination }
}

/** Where the tickets come from. */
fun interface TicketService {
    suspend fun tickets(): List<Ticket>
}

/**
 * The inbox's state, and the code behind its actions. Every action changes
 * the model or opens a screen; `load` is the one task, which the route starts
 * and `onRetry` starts again after a failure.
 *
 * The load status is the load's: a filter changed while the queue loads, or
 * after it failed, keeps the skeleton or the failure. Once the queue is
 * loaded, the status is `Empty` only while a filter hides every ticket, the
 * state that offers to clear the filters; a queue with no tickets at all is
 * `Ready`, and its table draws the empty inbox (`emptyState`).
 */
class InboxStore(private val service: TicketService, private val router: Router) :
    ViewModel(),
    InboxActions {
    private val state = MutableStateFlow(InboxModel.placeholder)
    val model: StateFlow<InboxModel> = state.asStateFlow()
    private var all: List<Ticket> = emptyList()

    override fun onSortChange(sort: PMDataTableSort) = refilter { copy(sort = sort) }

    override fun getRowId(ticket: Ticket): String = ticket.id

    override fun onRowClick(ticket: Ticket) = router.open(Destination.Ticket(ticket.id))

    override fun onNewTicket() = router.open(Destination.NewTicket)

    override fun onRetry() {
        viewModelScope.launch { load() }
    }

    override fun onClearFilters() = refilter { copy(query = "", status = null, priority = null) }

    override fun onQueryChange(query: String) = refilter { copy(query = query) }

    override fun onStatusChange(value: String?) = refilter { copy(status = value) }

    override fun onPriorityChange(value: String?) = refilter { copy(priority = value) }

    suspend fun load() {
        state.update { it.copy(loadStatus = PMLoadStatus.Loading) }
        try {
            all = service.tickets()
            refilter(settle = true) { copy(summary = QueueStats.of(all)) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            state.update { it.copy(loadStatus = PMLoadStatus.Failed(error.message.orEmpty())) }
        }
    }

    /**
     * Changes the model, then keeps the tickets its query, filters and sort
     * allow. The status follows the tickets once the queue has loaded: after
     * a load (`settle`), or while it is `Ready` or `Empty`.
     */
    private fun refilter(settle: Boolean = false, change: InboxModel.() -> InboxModel) = state.update { current ->
        val next = current.change()
        val tickets = visibleTickets(all, next)
        val filtered = next.query.isNotEmpty() || next.status != null || next.priority != null
        val loaded = settle || next.loadStatus == PMLoadStatus.Ready || next.loadStatus == PMLoadStatus.Empty
        next.copy(
            tickets = tickets,
            isFiltered = filtered,
            resultCount = PMFilterResultCount(shown = tickets.size.toDouble(), total = all.size.toDouble()),
            loadStatus = when {
                !loaded -> next.loadStatus
                tickets.isEmpty() && filtered -> PMLoadStatus.Empty
                else -> PMLoadStatus.Ready
            },
        )
    }
}

/** The tickets the model's query, filters and sort keep, in order. */
fun visibleTickets(tickets: List<Ticket>, model: InboxModel): List<Ticket> {
    val query = model.query.trim().lowercase()
    val kept = tickets.filter { ticket ->
        (query.isEmpty() || query in ticket.subject.lowercase() || query in ticket.requester.lowercase()) &&
            (model.status == null || ticket.status.value == model.status) &&
            (model.priority == null || ticket.priority.value == model.priority)
    }
    val order: Comparator<Ticket> = when (model.sort.key) {
        "priority" -> compareBy { it.priority.ordinal }
        "subject" -> compareBy { it.subject }
        else -> compareBy { it.id }
    }
    return kept.sortedWith(if (model.sort.direction == PMSortDirection.Asc) order else order.reversed())
}

/**
 * The model before anything has loaded: the status `Loading`, every list
 * empty, the options and the columns in place.
 */
val InboxModel.Companion.placeholder: InboxModel
    get() = InboxModel(
        loadStatus = PMLoadStatus.Loading,
        tickets = emptyList(),
        summary = QueueStats.of(emptyList()),
        columns = inboxColumns,
        sort = PMDataTableSort(key = "updated", direction = PMSortDirection.Desc),
        isFiltered = false,
        resultCount = PMFilterResultCount(shown = 0.0),
        query = "",
        status = null,
        statusOptions = Ticket.Status.entries.map {
            PMSelectOptionEntry.Option(PMSelectOption(value = it.value, label = it.label))
        },
        priority = null,
        priorityOptions = Ticket.Priority.entries.map {
            PMSelectOptionEntry.Option(PMSelectOption(value = it.value, label = it.label))
        },
        emptyState = PMEmptyStateProps(
            description = "New conversations land here as customers write in.",
            icon = PMIconRole.Inbox,
            title = "No tickets yet",
        ),
    )

/** The queue's columns. A cell is text unless the column draws a member. */
private val inboxColumns: List<PMDataTableColumn<Ticket>> = listOf(
    PMDataTableColumn(key = "subject", header = "Subject", value = { it.subject }, sortable = true),
    PMDataTableColumn(key = "requester", header = "Requester", value = { it.requester }),
    PMDataTableColumn(
        key = "status",
        header = "Status",
        value = { it.status.label },
        cell = { ticket ->
            PMBadge(
                children = ticket.status.label,
                tone = if (ticket.status == Ticket.Status.Open) PMBadgeTone.Accent else PMBadgeTone.Neutral,
                variant = PMBadgeVariant.Soft,
            )
        },
    ),
    PMDataTableColumn(key = "priority", header = "Priority", value = { it.priority.label }, sortable = true),
    PMDataTableColumn(key = "updated", header = "Updated", value = { it.updated }),
)

/**
 * The inbox in the app: the route renders the emitted screen from the store
 * and starts the load. The state, the coroutine and the router live here,
 * never in the screen.
 */
@Composable
fun InboxRoute(store: InboxStore) {
    val model by store.model.collectAsState()
    LaunchedEffect(store) { store.load() }
    InboxScreen(model = model, actions = store)
}
