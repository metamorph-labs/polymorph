# Compose: members, two worked screens and the app around them

## Add the modules

JitPack builds the two Gradle modules from the release tag: `tokens`, plain Kotlin with each
catalogue pairing as a `PMTheme`, and `ui`, the members on Compose Multiplatform, published with
an Android library and a JVM variant:

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}

// app/build.gradle.kts
dependencies {
    implementation("com.github.metamorph-labs.polymorph:tokens:v1.0.18")
    implementation("com.github.metamorph-labs.polymorph:ui:v1.0.18")
}
```

The app module compiles against API 37 (`compileSdk = 37`), because the Compose libraries `ui`
brings require it. JitPack builds a tag the first time an app asks for it, which takes some
minutes. A repository that holds a checkout of polymorph at the tag, or a git submodule of it,
includes the build instead (the last section).

## How a member is written

A file imports each name from `dev.polymorph.ui`, and pairings from `dev.polymorph.tokens`. A
member is a composable that takes its props as named arguments, in any order. A required argument
without a default, such as `label` on `PMButton`, must be given.

| On the web | In Compose |
| --- | --- |
| A member, `Button` | `PMButton(label = "Save")`, whose props are `PMButtonProps` |
| A part, `SettingsRow.Group` | `PMSettingsRowGroup`: the member's name and the part's, joined, as `PMTableRow` |
| A string or a boolean | Itself: `label = "Save"`, `disabled = true` |
| A number | A Kotlin Double: `lines = 2.0`. A `PMCalendarDate`'s `year`, `month` and `day` are Doubles too. |
| A prop that takes one of a few words | An entry of the enum `PM<Member><Prop>`, PascalCased: `tone = PMBadgeTone.Accent` |
| A size, an icon role, a spacing step, a sort direction | One enum every member shares: `size = PMControlSize.Sm`, `icon = PMIconRole.Add`, `gap = PMSpaceStep.S6`, `direction = PMSortDirection.Desc` |
| `Grid`'s `columns={4}` | `columns = PMGridColumns.Columns4` |
| `Button`'s `variant="outline"` with `tone="danger"` | `appearance = PMButtonAppearance.OutlineDanger`, one of the lawful pairs |
| A child | The trailing lambda: `PMCard { … }` |
| A prop that holds an element (`control`, `actions`, `search`) | A `@Composable` lambda: `control = { PMSwitch(…) }` |
| Words where an element goes, as `Text`'s children or a table cell's | Material's `Text("…")`, which takes the style the member provides. `PMText` is for words with a size or tone of their own. |
| A callback | A function without the DOM event. A required action binds as a reference, `onClick = actions::onSignOut`, and an optional one as itself, `onRetry = actions.onRetry` |
| A value the app controls that may be null, as `Select`'s `value` | `value = PMSome(model.frequency)`: given, `null` included. Left out, the member holds the value itself. A value that cannot be null is passed as itself: `value = model.query`. |
| A data type, such as `SelectOption` or `DateRange` | `PM` and its name: `PMSelectOptionEntry.Option(PMSelectOption(value = "now", label = "As they happen"))`, `PMDateRange(start, end)` of two `PMCalendarDate(year = 2026.0, month = 3.0, day = 18.0)` |
| A member's props passed as a value, as `ListPage`'s `emptyState` | That member's props class: `PMEmptyStateProps(title = "No orders match")` |

`PMSome` tells a value that is given as null from a value left out. A prop
named `as` is written between backticks in Kotlin, because `as` is a keyword there.

## Where the declarations are

`Members.kt` declares every member's and part's composable with its arguments, and
`Contracts.kt` every props class, enum and data type, both in
`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/`. `PolymorphUI.kt` in
`platforms/android/ui/src/main/kotlin/dev/polymorph/ui/` declares `PMLoadStatus`,
`PMSome`, `PMControlSize` and `PMContent`, and the
`PolymorphUI*.kt` files beside it the composition locals. An app on JitPack has the compiled
modules only: an IDE opens a declaration, or the files are in the repository at the release tag,
under `https://github.com/metamorph-labs/polymorph/tree/v1.0.18/platforms/android/ui/src`. With a checkout beside the app, print
a declaration whole:

```sh
K=../polymorph/platforms/android/ui/src/generated/kotlin/dev/polymorph/ui
sed -n '/^fun PMListPage(/,/^)/p' "$K/Members.kt"
sed -n '/^enum class PMBadgeTone(/,/^}/p' "$K/Contracts.kt"
```

## A worked screen: settings

This file compiles against the package at the release tag. It is the shape `emit` writes from a
spec, and the shape a screen written by hand keeps.

```kotlin
package com.example.app

import androidx.compose.runtime.Composable
import dev.polymorph.ui.PMButton
import dev.polymorph.ui.PMButtonAppearance
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSelect
import dev.polymorph.ui.PMSelectOptionEntry
import dev.polymorph.ui.PMSettingsPage
import dev.polymorph.ui.PMSettingsRow
import dev.polymorph.ui.PMSettingsRowGroup
import dev.polymorph.ui.PMSome
import dev.polymorph.ui.PMSwitch

/** What `NotificationsScreen` shows. `loadStatus` says which of the four load states it is in. */
data class NotificationsModel(
    val loadStatus: PMLoadStatus,
    /** Whether the morning digest is on. */
    val digest: Boolean,
    val frequency: String?,
    val frequencyOptions: List<PMSelectOptionEntry>,
) {
    companion object
}

/** The code the app supplies to `NotificationsScreen`, one function per action. */
interface NotificationsActions {
    fun onDigestChange(next: Boolean)
    fun onFrequencyChange(value: String?)
    fun onSignOut()
}

/** Which emails the person receives, and a way to sign out. */
@Composable
fun NotificationsScreen(model: NotificationsModel, actions: NotificationsActions) {
    PMSettingsPage(loadStatus = model.loadStatus, title = "Notifications") {
        PMSettingsRowGroup(title = "Email") {
            PMSettingsRow(
                control = {
                    PMSwitch(checked = model.digest, onCheckedChange = actions::onDigestChange)
                },
                description = "One email with what changed overnight.",
                label = "Morning digest",
            )
            PMSettingsRow(
                control = {
                    PMSelect(
                        onChange = actions::onFrequencyChange,
                        options = model.frequencyOptions,
                        value = PMSome(model.frequency),
                    )
                },
                label = "Alerts",
            )
        }
        PMSettingsRowGroup(title = "Account") {
            PMSettingsRow(
                control = {
                    PMButton(
                        label = "Sign out",
                        onClick = actions::onSignOut,
                        appearance = PMButtonAppearance.OutlineDanger,
                    )
                },
                label = "This device",
            )
        }
    }
}

/** Every action doing nothing, so the app compiles before it wires its store. */
object NotificationsInert : NotificationsActions {
    override fun onDigestChange(next: Boolean) {}
    override fun onFrequencyChange(value: String?) {}
    override fun onSignOut() {}
}
```

## A worked screen: a list

A records screen is a `ListPage`. Its `filters` hold a
`FilterBar` with the search field in `search` and the other filters as
its children, and its body is a `DataTable`. On Android `DateRangePicker` is
Material's own date range picker. `DataTable` is adapted: a list on phones, a table on tablets, a row's
cells stacked in the list. A tap on a row calls `onRowClick` with the row.
`emit` writes this screen, apart from its comments and its package line, from the spec in the
skill's step 6 made Android's, with `onRetry` bound as well.

```kotlin
package com.example.app

import androidx.compose.runtime.Composable
import dev.polymorph.ui.PMButton
import dev.polymorph.ui.PMButtonAppearance
import dev.polymorph.ui.PMControlSize
import dev.polymorph.ui.PMDataTable
import dev.polymorph.ui.PMDataTableColumn
import dev.polymorph.ui.PMDateRange
import dev.polymorph.ui.PMDateRangePicker
import dev.polymorph.ui.PMEmptyStateProps
import dev.polymorph.ui.PMFilterBar
import dev.polymorph.ui.PMIconRole
import dev.polymorph.ui.PMListPage
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSearchInput
import dev.polymorph.ui.PMSome

/** What `OrdersScreen` shows. `loadStatus` says which of the four load states it is in. */
data class OrdersModel(
    val loadStatus: PMLoadStatus,
    /** Already searched and filtered. */
    val orders: List<Order>,
    val columns: List<PMDataTableColumn<Order>>,
    val query: String,
    val placed: PMDateRange?,
    val isFiltered: Boolean,
) {
    companion object
}

/** The code the app supplies to `OrdersScreen`, one function per action. */
interface OrdersActions {
    fun getRowId(order: Order): String
    fun onOpenOrder(order: Order)
    fun onQueryChange(query: String)
    fun onPlacedChange(placed: PMDateRange?)
    fun onClearFilters()
    fun onRetry()
}

/** Every order, searchable and filtered by the day it was placed; a tap opens one. */
@Composable
fun OrdersScreen(model: OrdersModel, actions: OrdersActions) {
    PMListPage(
        loadStatus = model.loadStatus,
        onRetry = actions::onRetry,
        emptyState = PMEmptyStateProps(
            icon = PMIconRole.Search,
            secondaryAction = {
                PMButton(
                    label = "Clear filters",
                    onClick = actions::onClearFilters,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            },
            title = "No orders match these filters",
        ),
        filters = {
            PMFilterBar(
                isFiltered = model.isFiltered,
                onClear = actions::onClearFilters,
                search = {
                    PMSearchInput(
                        ariaLabel = "Search orders",
                        onChange = actions::onQueryChange,
                        size = PMControlSize.Sm,
                        value = model.query,
                    )
                },
            ) {
                PMDateRangePicker(
                    ariaLabel = "Placed between",
                    onChange = actions::onPlacedChange,
                    size = PMControlSize.Sm,
                    value = PMSome(model.placed),
                )
            }
        },
        title = "Orders",
    ) {
        PMDataTable(
            columns = model.columns,
            data = model.orders,
            emptyState = PMEmptyStateProps(icon = PMIconRole.Inbox, title = "No orders yet"),
            getRowId = actions::getRowId,
            label = "Orders",
            onRowClick = actions::onOpenOrder,
        )
    }
}

/** Every action doing nothing, so the app compiles before it wires its store. */
object OrdersInert : OrdersActions {
    override fun getRowId(order: Order): String = ""
    override fun onOpenOrder(order: Order) {}
    override fun onQueryChange(query: String) {}
    override fun onPlacedChange(placed: PMDateRange?) {}
    override fun onClearFilters() {}
    override fun onRetry() {}
}
```

## The app around it

The store is an AndroidX ViewModel that holds the model, implements the actions and opens screens
through the app's router. The route collects the model and starts the load, and the root provides
the pairing. These are the app's own code, so coroutines, state and navigation live here.

```kotlin
package com.example.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.polymorph.tokens.PMThemes
import dev.polymorph.ui.PMBadge
import dev.polymorph.ui.PMBadgeTone
import dev.polymorph.ui.PMBadgeVariant
import dev.polymorph.ui.PMCalendarDate
import dev.polymorph.ui.PMDataTableColumn
import dev.polymorph.ui.PMDateRange
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.ProvidePMTheme
import java.text.NumberFormat
import java.util.Currency
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** One order as the list shows it. The store formats its words before they reach the screen. */
data class Order(
    val id: String,
    val customer: String,
    val status: Status,
    /** The total as the person's locale writes it, such as "$1,204.00". */
    val total: String,
    val placedOn: PMCalendarDate,
) {
    enum class Status(val label: String) { Open("Open"), Shipped("Shipped"), Cancelled("Cancelled") }
}

/** The columns. A column's `value` is its cell's text, and `cell` draws a member in its place. */
val orderColumns: List<PMDataTableColumn<Order>> = listOf(
    PMDataTableColumn(key = "id", header = "Order", value = { it.id }),
    PMDataTableColumn(key = "customer", header = "Customer", value = { it.customer }),
    PMDataTableColumn(
        key = "status",
        header = "Status",
        value = { it.status.label },
        cell = { order ->
            PMBadge(
                children = order.status.label,
                tone = if (order.status == Order.Status.Open) PMBadgeTone.Accent else PMBadgeTone.Neutral,
                variant = PMBadgeVariant.Soft,
            )
        },
    ),
    PMDataTableColumn(key = "total", header = "Total", value = { it.total }, numeric = true),
)

/** Where the app can go. */
sealed interface Route {
    data class OrderDetail(val id: String) : Route
}

/** The app's router: the back stack its root navigation reads. */
class Router {
    private val stack = MutableStateFlow<List<Route>>(emptyList())
    val path: StateFlow<List<Route>> = stack.asStateFlow()

    fun open(route: Route) = stack.update { it + route }
}

class OrdersStore(private val router: Router) : ViewModel(), OrdersActions {
    private val state = MutableStateFlow(
        OrdersModel(PMLoadStatus.Loading, emptyList(), orderColumns, query = "", placed = null, isFiltered = false),
    )
    val model: StateFlow<OrdersModel> = state.asStateFlow()
    private var all: List<Order> = emptyList()

    override fun getRowId(order: Order): String = order.id
    override fun onOpenOrder(order: Order) = router.open(Route.OrderDetail(order.id))
    override fun onQueryChange(query: String) = refilter { copy(query = query) }
    override fun onPlacedChange(placed: PMDateRange?) = refilter { copy(placed = placed) }
    override fun onClearFilters() = refilter { copy(query = "", placed = null) }
    override fun onRetry() {
        viewModelScope.launch { load() }
    }

    suspend fun load() {
        state.update { it.copy(loadStatus = PMLoadStatus.Loading) }
        try {
            all = fetchOrders()
            refilter(settle = true)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            state.update { it.copy(loadStatus = PMLoadStatus.Failed(error.message.orEmpty())) }
        }
    }

    /**
     * Changes the model, then keeps the orders the query and the dates allow. Once loaded, the
     * status is `Empty` only while a filter hides every order; with no orders at all it is
     * `Ready`, and the table draws its own empty state.
     */
    private fun refilter(settle: Boolean = false, change: OrdersModel.() -> OrdersModel = { this }) =
        state.update { current ->
            val next = current.change()
            val day = { date: PMCalendarDate -> date.year * 10_000 + date.month * 100 + date.day }
            val orders = all.filter { order ->
                (next.query.isEmpty() || order.customer.contains(next.query, ignoreCase = true)) &&
                    (next.placed?.let { day(order.placedOn) in day(it.start)..day(it.end) } ?: true)
            }
            val filtered = next.query.isNotEmpty() || next.placed != null
            val loaded = settle || next.loadStatus == PMLoadStatus.Ready || next.loadStatus == PMLoadStatus.Empty
            next.copy(
                orders = orders,
                isFiltered = filtered,
                loadStatus = when {
                    !loaded -> next.loadStatus
                    orders.isEmpty() && filtered -> PMLoadStatus.Empty
                    else -> PMLoadStatus.Ready
                },
            )
        }

    private suspend fun fetchOrders(): List<Order> = listOf(
        Order(
            id = "1042",
            customer = "Dana Ruiz",
            status = Order.Status.Open,
            total = NumberFormat.getCurrencyInstance().apply { currency = Currency.getInstance("USD") }.format(1204),
            placedOn = PMCalendarDate(year = 2026.0, month = 3.0, day = 18.0),
        ),
    )
}

@Composable
fun OrdersRoute(store: OrdersStore) {
    val model by store.model.collectAsState()
    LaunchedEffect(store) { store.load() }
    OrdersScreen(model = model, actions = store)
}

@Composable
fun App(store: OrdersStore) {
    val theme = PMThemes.plain_neutral
    ProvidePMTheme(theme, dark = theme.preferredDark) {
        OrdersRoute(store)
    }
}
```

The store needs `androidx.lifecycle` and `kotlinx.coroutines`. The router here is a back stack
the root reads. An app on Navigation Compose keeps its navigation controller in the router instead:
`open` calls `navController.navigate(…)`, and the root's `NavHost(…) { … }` draws each route inside
`ProvidePMTheme`, where the system's back gesture pops it. The store formats money and
dates before they reach the model, in the person's locale: a column's `value`, a
`Badge`'s words and a `Stat`'s value are text. A column with `numeric = true` draws its figures as the system draws numbers, at the side of
the column it decides. A `PMCalendarDate` holds Doubles, so the store converts it to and from
its own date type. `ProvidePMTheme` also gives Material 3 the pairing, so the app's own
Material components match the members. A composable under none draws under
`PMThemes.default` in the system's mode.

## What the app provides

The members read these from the composition. Provide each that the screen's members need, at the
root, with `CompositionLocalProvider(…)`:

| Composition local | What it is | Without it |
| --- | --- | --- |
| `LocalPMStrings` | The app's translations of the words the members write by default | English |
| `LocalPMFontFamilies` | A function from each of the pairing's fonts, a `PMFont`, to a Compose font family built from the files the app bundles for its `family`, or null | The system font in the slot's design |
| `LocalPMImageLoader` | A painter for a picture's URL, from the app's image loader | Each member draws its fallback |
| `LocalPMFilePicker` | The platform's document picker, for file upload and attaching | A dropzone opens nothing, and a prompt has no attach button |
| `LocalPMImageEncoder` | Writes an edited image as a file | The image editor's confirm hands nothing over |
| `LocalPMToday` | The person's date, for calendars and relative times | The date in UTC |

A link opens through Compose's `LocalUriHandler.current`, or through a member's `onNavigate` when the
app routes its own paths.

## What no member draws

A `PMBespoke` zone declares it, with the reason a reviewer reads. Inside, the
composable reads the pairing through `PM.theme` and draws with its tokens, and keeps every
accessibility rule.

```kotlin
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import dev.polymorph.ui.PM
import dev.polymorph.ui.PMBespoke
import dev.polymorph.ui.color

@Composable
fun Flagged() {
    val theme = PM.theme
    PMBespoke(reason = "Unread marker: the vocabulary has no dot that is not a Badge.") {
        Box(
            Modifier
                .size(theme.defaultDensity.space[6].dp)
                .background(theme.colors.accentBg.color, CircleShape)
                .clearAndSetSemantics {},
        )
    }
}
```

`.color` resolves a colour role in the mode the members draw in. `PM.theme`
is the pairing the root provided.

## Check the screen

Build: `./gradlew :app:compileDebugKotlin`. Then search each screen's file, and not the store's
or the route's, for what a screen may not write, and replace each hit as the skill's table says:

```sh
grep -nE 'Color\(|\.dp([^A-Za-z]|$)|\.sp([^A-Za-z]|$)|MaterialTheme|Modifier\.|animate[A-Z]|remember|mutableStateOf|LaunchedEffect|navigate\(|NavHost|Icons\.|(^|[^A-Za-z])(Column|Row|Box|Spacer|Button|Switch|TextField|Icon)\(' OrdersScreen.kt
```

Material's `Text("…")` inside a member is lawful: it is words handed to the member.

## A checkout instead of JitPack

A repository that holds a checkout of polymorph at the release tag, or a git submodule of it,
includes the Gradle build and depends on the modules by their own names:

```kotlin
// settings.gradle.kts
includeBuild("../polymorph/platforms/android")

// app/build.gradle.kts
dependencies {
    implementation("dev.polymorph:tokens")
    implementation("dev.polymorph:ui")
}
```

The included build runs on the app's Gradle, which is 9.5 or a later 9.x release, and compiles the
members. That compile runs out of memory at Gradle's default heap, so the app's
`gradle.properties` sets `org.gradle.jvmargs=-Xmx4g` and `kotlin.daemon.jvmargs=-Xmx4g`.
