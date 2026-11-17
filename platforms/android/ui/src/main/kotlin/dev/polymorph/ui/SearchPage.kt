// SearchPage (`design/archetypes/search-page.md`): the page whose subject is a
// query. The page header, the search block (the field, then the filters under
// it in a wrapping row at `space.3`, `space.3` below the field), and the
// results, in the page column at nine of the largest space step
// (`PMRecipe.searchPageMeasure`), in a scroll container. The results are not
// panelled: each group the app passes is a Heading over a List, and the groups
// stack a gutter apart.
//
// The search block is a group named by `searchLabel`, the web's search
// landmark, which TalkBack reads as it enters the block. With `onSubmit`, the
// keyboard's search key in the field
// submits through it, as Enter does in the web's `<form>`, and so does a
// `submit` Button in the block: the page hands `onSubmit` to the fields and
// buttons in it (`LocalPMSubmitAction`), as FormPage does. Without it the app
// searches as the reader types, and the search key only closes the keyboard.
//
// The load status (`design/native/screen-contract.md`) owns the web's `empty`
// and `pending`: the header and the search block render in every state, so
// the field keeps the query, and the results region is what the state
// replaces. `ready` draws `children`, and nothing before a query; `empty` the
// `emptyState` the page cannot be built without; `loading` keeps what the
// region holds, the web's `pending`, and draws no spinner of its own, because
// the submit Button's `loading` shows one; `failed` a danger Alert in place of
// the results, with `onRetry` when it is set. The swap is instant and moves no
// focus, because the reader's place is the field. The results are no group of
// their own, as on the web they are no named region. Compose has no busy state
// for a node, so the results are not marked busy while a search runs; the
// page's identifier carries `status=loading`.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics

object PMSearchPage : PMSearchPageRendering {
    @Composable
    override fun Render(props: PMSearchPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        PMPage(PMRecipe.searchPageMeasure, "SearchPage", status) {
            PMPageHeader(actions = props.actions, description = props.description, title = props.title)
            Column(
                Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = props.searchLabel
                        isTraversalGroup = true
                    },
                verticalArrangement = Arrangement.spacedBy(space.s3),
            ) {
                CompositionLocalProvider(LocalPMSubmitAction provides props.onSubmit) {
                    props.search()
                    props.filters?.let { filters -> PMInline(gap = PMSpaceStep.S3, wrap = true) { filters() } }
                }
            }
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space.s6)) {
                when (status) {
                    PMLoadStatus.Ready, PMLoadStatus.Loading -> props.children?.invoke()
                    PMLoadStatus.Empty -> PMEmptyState(
                        action = props.emptyState.action,
                        description = props.emptyState.description,
                        icon = props.emptyState.icon,
                        secondaryAction = props.emptyState.secondaryAction,
                        title = props.emptyState.title,
                    )
                    is PMLoadStatus.Failed -> PMPageFailure(status.message, props.onRetry)
                }
            }
        }
    }
}

/**
 * SearchPage's states: the spec's six entries, with the load states the screen
 * contract names (`ready`, `empty`, `loading`, `failed`), in a workspace search
 * of a support desk whose query finds tickets and help articles. Each names
 * what its search block and its results hold (`contains`).
 */
object SearchPageStates : PMStates {
    override val member = "SearchPage"

    private const val title = "Search"
    private const val description = "Find tickets and help articles across the workspace."
    private const val landmark = "Workspace"
    private const val field = "Search the workspace"
    private const val placeholder = "Search tickets and articles…"
    private const val query = "webhook"
    private const val failure = "The search could not be run. Check your connection."

    private val tickets = listOf(
        Triple("Webhook retries stop after the first 5xx", "T-1019 · Northwind · open", "2h"),
        Triple("Webhook signature fails after rotating the secret", "T-0987 · Contoso · waiting", "3d"),
        Triple("Duplicate webhook deliveries during the outage", "T-0952 · Fabrikam · solved", "2w"),
    )

    private val articles = listOf(
        "Retrying failed webhook deliveries" to "Help centre · updated last month",
        "Verifying webhook signatures" to "Help centre · updated in March",
    )

    private fun options(vararg labels: String) =
        labels.map { PMSelectOptionEntry.Option(PMSelectOption(value = it.lowercase(), label = it)) }

    /** Four `sm` Selects, the filter row the page's measure is set against. */
    @Composable
    private fun Selects() {
        PMSelect(ariaLabel = "Kind", emptyOption = "Any kind", options = options("Tickets", "Articles"), size = PMControlSize.Sm)
        PMSelect(ariaLabel = "Status", emptyOption = "Any status", options = options("Open", "Waiting", "Solved"), size = PMControlSize.Sm)
        PMSelect(ariaLabel = "Assignee", emptyOption = "Anyone", options = options("Me", "My team", "Unassigned"), size = PMControlSize.Sm)
        PMSelect(ariaLabel = "Updated", emptyOption = "Any time", options = options("Today", "This week", "This month"), size = PMControlSize.Sm)
    }

    @Composable
    private fun Field(value: String? = query) {
        PMSearchInput(ariaLabel = field, defaultValue = value, placeholder = placeholder)
    }

    /** A FormField whose Input submits from its trailing Button, `loading` while a search runs. */
    @Composable
    private fun Submitted(loading: Boolean = false) {
        PMFormField(label = field) {
            PMInput(
                defaultValue = query,
                trailing = {
                    PMButton(
                        icon = PMIconRole.Search,
                        label = "Search",
                        loading = loading,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                        type = PMButtonType.Submit,
                    )
                },
                type = PMInputType.Search,
            )
        }
    }

    @Composable
    private fun Tickets() {
        PMList(label = "Tickets") {
            for ((subject, about, age) in tickets) PMListItem(description = about, meta = age, onSelect = {}, title = subject)
        }
    }

    /** Two groups of results, each a Heading over a List; the tickets load further windows. */
    @Composable
    private fun Groups() {
        PMStack(gap = PMSpaceStep.S3) {
            PMHeading(children = "Tickets")
            Tickets()
            PMCursorPagination(hasNext = true, hasPrevious = false, label = "Tickets", mode = PMCursorPaginationMode.Append, onNext = {})
        }
        PMStack(gap = PMSpaceStep.S3) {
            PMHeading(children = "Articles")
            PMList(label = "Articles") {
                for ((name, about) in articles) PMListItem(description = about, onSelect = {}, title = name)
            }
        }
    }

    private val nothing = PMEmptyStateProps(
        description = "Check the spelling, or search with fewer filters.",
        icon = PMIconRole.Search,
        secondaryAction = { PMButton(label = "Clear filters", appearance = PMButtonAppearance.GhostNeutral) },
        title = "Nothing matches that search",
    )

    @Composable
    private fun Page(
        status: PMLoadStatus = PMLoadStatus.Ready,
        search: PMContent = { Field() },
        filters: PMContent? = null,
        onSubmit: (() -> Unit)? = null,
        description: String? = null,
        results: PMContent? = { Groups() },
    ) {
        PMSearchPage(
            loadStatus = status,
            onRetry = {},
            children = results,
            description = description,
            emptyState = nothing,
            filters = filters,
            onSubmit = onSubmit,
            search = search,
            searchLabel = landmark,
            title = title,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "before a query — the field and the filters, nothing below them",
                expect = mapOf("status" to "ready", "contains" to "SearchInput,Select"),
            ) {
                Page(search = { Field(null) }, filters = { Selects() }, description = description, results = null)
            },
            PMStateEntry(
                "results in groups — a heading over each kind",
                expect = mapOf("status" to "ready", "contains" to "SearchInput,Heading,List,CursorPagination"),
            ) { Page() },
            PMStateEntry(
                "one list of results — the filter row counts them",
                expect = mapOf("status" to "ready", "contains" to "FilterBar,Select,List"),
            ) {
                Page(
                    filters = {
                        PMFilterBar(isFiltered = true, onClear = {}, resultCount = PMFilterResultCount(shown = 3.0)) {
                            PMSelect(
                                ariaLabel = "Kind",
                                defaultValue = PMSome("tickets"),
                                emptyOption = "Any kind",
                                options = options("Tickets", "Articles"),
                                size = PMControlSize.Sm,
                            )
                        }
                    },
                    results = { Tickets() },
                )
            },
            PMStateEntry(
                "nothing found — the way out is a secondary action",
                expect = mapOf("status" to "empty", "contains" to "SearchInput,EmptyState,Button"),
            ) { Page(PMLoadStatus.Empty) },
            PMStateEntry(
                "searching — the last results stay, marked busy",
                expect = mapOf("status" to "loading", "contains" to "FormField,Button,List"),
            ) { Page(PMLoadStatus.Loading, search = { Submitted(loading = true) }, onSubmit = {}) },
            PMStateEntry(
                "submitted with a button — the search key and the Button submit the search",
                expect = mapOf("status" to "ready", "contains" to "FormField,Input,Button,List"),
            ) { Page(search = { Submitted() }, onSubmit = {}) },
            PMStateEntry(
                "failed — the Alert in place of the results, the field keeps the query",
                expect = mapOf("status" to "failed", "contains" to "SearchInput,Alert"),
            ) { Page(PMLoadStatus.Failed(failure)) },
        )
}
