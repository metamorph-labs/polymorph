package dev.polymorph.examples.relay

import dev.polymorph.ui.PMLoadStatus
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * The store's load status, which is the load's: a filter changed while the
 * queue loads or after it failed keeps that state, the status is `Empty` only
 * while a filter hides every ticket, and `onRetry` loads again after a
 * failure.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class InboxStoreTest {
    private val router = Router()

    /** `onRetry` launches in `viewModelScope`, whose dispatcher is the main one; here it runs at once. */
    @BeforeTest
    fun main() = Dispatchers.setMain(Dispatchers.Unconfined)

    @AfterTest
    fun reset() = Dispatchers.resetMain()

    @Test
    fun aFilterChangedWhileLoadingKeepsTheSkeleton() = runBlocking {
        val tickets = CompletableDeferred<List<Ticket>>()
        val store = InboxStore(TicketService { tickets.await() }, router)
        val loading = launch { store.load() }
        store.model.first { it.loadStatus == PMLoadStatus.Loading }
        store.onQueryChange("no ticket says this")
        assertEquals(PMLoadStatus.Loading, store.model.value.loadStatus)
        tickets.complete(Ticket.samples)
        loading.join()
        assertEquals(PMLoadStatus.Empty, store.model.value.loadStatus, "the query hides every ticket once loaded")
    }

    @Test
    fun aFilterChangedAfterAFailureKeepsTheFailure() = runBlocking {
        val store = InboxStore(TicketService { throw IllegalStateException(OFFLINE) }, router)
        store.load()
        store.onQueryChange("sync")
        store.onStatusChange(Ticket.Status.entries.first().value)
        assertEquals(PMLoadStatus.Failed(OFFLINE), store.model.value.loadStatus)
    }

    @Test
    fun anEmptyQueueIsReadyAndOnlyAFilterMakesItEmpty() = runBlocking {
        val empty = InboxStore(TicketService { emptyList() }, router).apply { load() }
        assertEquals(PMLoadStatus.Ready, empty.model.value.loadStatus, "an empty queue draws its table's empty state")
        val loaded = InboxStore(TicketService { Ticket.samples }, router).apply { load() }
        loaded.onQueryChange("no ticket says this")
        assertEquals(PMLoadStatus.Empty, loaded.model.value.loadStatus)
        loaded.onClearFilters()
        assertEquals(PMLoadStatus.Ready, loaded.model.value.loadStatus)
    }

    @Test
    fun retryLoadsAgainAfterAFailure() = runBlocking {
        var attempts = 0
        val store = InboxStore(
            TicketService {
                attempts += 1
                if (attempts == 1) throw IllegalStateException(OFFLINE) else Ticket.samples
            },
            router,
        )
        store.load()
        assertIs<PMLoadStatus.Failed>(store.model.value.loadStatus)
        store.onRetry()
        withTimeout(RETRY_MILLIS) { store.model.first { it.loadStatus == PMLoadStatus.Ready } }
        assertEquals(2, attempts)
    }

    private companion object {
        const val OFFLINE = "The tickets could not be loaded."
        const val RETRY_MILLIS = 5_000L
    }
}
