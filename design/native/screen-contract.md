# The native screen contract

A screen spec (`polymorph-screen/1`, `packages/spec/src/schema.ts`) whose `platform` is `ios` or
`android` emits to native code as a **stateless view of two values**: a **model**, the data the
screen shows, and an **actions** record, the code the app supplies. The app owns everything else:
the store that holds the model, the router, and every asynchronous task.

This page is what a native screen is held to, whoever writes it. The last section says which
statements are checkable and by what. The screen emitter writes a spec for `ios` to this page as
SwiftUI (`packages/spec/src/emit-swift.ts`) and a spec for `android` as Jetpack Compose
(`packages/spec/src/emit-kotlin.ts`); what the two share is `packages/spec/src/emit-native.ts`.
The contracts of the member packages a screen composes are generated from the registry. The
failed state's "Try again" is a default this page names (`packages/native/src/strings.ts`), and
`packages/native/src/strings.test.ts` fails when the page does not hold its words.

## Names

`<Screen>` is the spec's `name` without a trailing `View` or `Screen`: `InboxView` and
`InboxScreen` both give `Inbox`. A name without either suffix is used whole.

| What | Swift | Kotlin |
| --- | --- | --- |
| the model | `struct <Screen>Model` | `data class <Screen>Model` |
| the actions | `struct <Screen>Actions` | `interface <Screen>Actions` |
| the view | `@MainActor struct <Screen>View: View`, created as `<Screen>View(model:actions:)` | `@Composable fun <Screen>Screen(model: <Screen>Model, actions: <Screen>Actions)` |
| the inert actions | `<Screen>Actions.inert` | `object <Screen>Inert : <Screen>Actions` |
| a member | `PM` + the member's name, a view built from its props: `PMButton(props: .init(label: "Save", onClick: actions.onSave))` | `PM` + the member's name |
| a compound part | nested in the member: `PMSettingsRow.Group` | joined: `PMSettingsRowGroup` |
| a prop | the field of the same name in `PM<Member>Props`, passed in the order its initialiser declares; a hyphenated name is camelCased (`aria-label` is `ariaLabel`) | the same |
| a child, or a prop that holds an element | `PMContent`: the element's view as `AnyView` | a `@Composable` lambda |

Members take the `PM` prefix because SwiftUI and Compose already declare `Button`, `Grid`,
`Text`, `Menu` and `Link`, and a screen file imports both. The prefix matches the token
packages' `PMTheme`. On iOS, `PM<Member>Props` is generated from the registry into
`platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift` (`packages/native/src/contracts.ts`),
so a prop's Swift name and type are the member package's, not the emitter's. On Android it is
generated into `platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Contracts.kt`
(`packages/native/src/kotlin.ts`), with a composable of the member's name that takes the props as
arguments (`Members.kt`): `PMButton(label = "Save", onClick = actions::onSave)`.

## The partition of inputs

Every input the spec declares lands in exactly one of the two records, decided by its type alone.

| Input type | Role | Becomes | A binding to it emits |
| --- | --- | --- | --- |
| a function type `(…) => R`, alone or in a union with `null` or `undefined` | an **action** | one member of `<Screen>Actions`, with the input's name | `actions.<name>` in Swift; in Kotlin `actions::<name>` for a required action, `actions.<name>` for an optional one |
| any other type | **model data** | one field of `<Screen>Model`, with the input's name | `model.<path>` |

An action is any code the app supplies, whether it reports an event (`onRowClick`) or answers a
question (`getRowId`).

A binding (`{"$": "a.b"}`) in a prop whose type in the registry is a function (an event prop:
`onClick`, `onChange`, `getRowId`) must name an action, and resolves against the actions. A
binding in any other prop, or among children, must name model data, and resolves against the
model. A dotted path into an action is a fault, because an action has no fields.

## The model

The model is a value type: a `struct` with `var` fields in Swift, a `data class` with `val`
fields in Kotlin. Its first field is the load status; then come the data inputs in the spec's
order, each with its input's `doc` as its doc comment.

```swift
public enum PMLoadStatus: Hashable, Sendable {
  case loading
  case ready
  case empty
  case failed(message: String)
}
```

```kotlin
sealed interface PMLoadStatus {
  data object Loading : PMLoadStatus
  data object Ready : PMLoadStatus
  data object Empty : PMLoadStatus
  data class Failed(val message: String) : PMLoadStatus
}
```

| Field | Swift | Kotlin |
| --- | --- | --- |
| the load status, always first | `var loadStatus: PMLoadStatus` | `val loadStatus: PMLoadStatus` |
| each data input, in order | `var <name>: <mapped type>` | `val <name>: <mapped type>` |

The field is `loadStatus`, not `status`, because `status` is a common domain input: Relay's inbox
filters by ticket status. An input named `loadStatus` is a fault.

The model is complete in every state. While it loads, the app passes what it has (an empty list,
an empty string), and the view reads `loadStatus` to decide what to draw. No other field says what
state the screen is in.

The Kotlin model also declares an empty `companion object`, so the app can extend the type with
values of its own, as Swift's extensions do: `InboxModel.placeholder`, the model before anything
loads.

`PMLoadStatus` is declared by each platform's member package, beside the members that read it.

## Types

An input's `type` is one TypeScript type, which the spec validator has already parsed. It maps to
the platform by this table, the same for a model field, an action's parameter and an action's
result. A type the table does not map is a fault naming the input.

| TypeScript | Swift | Kotlin |
| --- | --- | --- |
| `string` | `String` | `String` |
| `number` | `Double` | `Double` |
| `boolean` | `Bool` | `Boolean` |
| `T[]`, `readonly T[]`, `Array<T>` | `[T]` | `List<T>` |
| `Set<T>`, `ReadonlySet<T>` | `Set<T>` | `Set<T>` |
| `File` | `PMFile`, the member package's: a file's URL, name, size in bytes and media type | `PMFile`, the same |
| `unknown` | `PMJSONValue`, the member package's: any JSON value, an object's keys in order | `PMJSONValue`, the same |
| `T \| null`, `T \| undefined` | `T?` | `T?` |
| a union of string literals, `'low' \| 'high'` | an enum named after the input, nested in the record that holds it: `enum Priority: String { case low, high }` | `enum class Priority(val value: String) { Low("low"), High("high") }` |
| an identifier the spec's `types` names from `@polymorph/react-ui` | `PM` + its name, as the member package declares it: `PMDataTableSort`, `PMEmptyStateProps` | the same |
| a union of vocabulary types the member package names (`SelectOption \| SelectOptionGroup`, `CheckedState`) | the member package's enum of one case per branch: `PMSelectOptionEntry`, `PMCheckedState` | the same |
| an identifier the spec's `types` names from another package, which the member package also declares as `PM` + its name (`CalendarDate` from `@internationalized/date`) | the member package's type: `PMCalendarDate` | the same |
| an identifier the spec's `types` names from any other module | the app's type of the same name: `Ticket` | the same |
| type arguments, `X<T>` | each mapped by this table: `PMDataTableColumn<Ticket>` | the same |
| `void`, `Promise<void>` or `void \| Promise<void>`, as a result | `Void`: the member calls the function and does not wait for it | `Unit`, written as no result |
| a function, `(a: A, b: B) => R` | `@MainActor (A, B) -> R` | `fun <name>(a: A, b: B): R` |
| a DOM event parameter: `MouseEvent<…>`, `KeyboardEvent<…>`, `ChangeEvent<…>`, `FormEvent<…>`, `FocusEvent<…>`, `PointerEvent<…>`, `Event` | left out, because a native member has no DOM event to pass; the other parameters stay: `Button`'s `onClick` is `@MainActor () -> Void`, `Input`'s `onChange(value, event)` is `@MainActor (String) -> Void` | left out the same way: `() -> Unit`, `(String) -> Unit` |
| one of React's handler aliases, `ReactEventHandler<T>` and the other `…EventHandler<T>` | a function of its DOM event alone, so an action that takes nothing: `@MainActor () -> Void` | `fun <name>()` |

- **An object type literal** (`{ shown: number; total: number }`) is a fault. Swift and Kotlin
  type by name, so a structure the screen is handed needs one: a vocabulary type such as
  `FilterResultCount` or `SelectOption`, or one of the app's, named in `types`.
- **A literal case** is camelCased in Swift (`'in-progress'` is `inProgress = "in-progress"`) and
  PascalCased in Kotlin (`InProgress("in-progress")`). A union of literals that more than one
  input uses belongs in `types` under a name; an input whose type holds two such unions is a
  fault. So is an enum whose name the record already uses: a name `types` gives, one of the
  file's declarations, or one of the language's own types (`String`, `Bool` or `Boolean`,
  `Double`, `Set`, `Type`, `Unit`, …), which would shadow the type the record means.
- **The member package's names.** With the member package at hand, a vocabulary type must be one
  it declares, and a union of vocabulary types one its enums hold; each is a fault at the input's
  type otherwise.
- **Modules.** `@polymorph/react-ui` is `import PolymorphUI` in Swift and the
  `dev.polymorph.ui` imports in Kotlin. A relative module in `types` is the app's own, so its
  types need no import; a Kotlin screen declares the package its directory names, so the app's
  types beside it are in scope. The member package maps a member's own props by the same table,
  so a model field bound whole to a prop has the prop's type. A prop the table cannot express
  (React's handler aliases among them, which carry only a DOM event) is declared in the package
  as `PMUnsupported<Member><Prop>`, and a screen that sets it is a fault.

## The actions

`<Screen>Actions` holds one member per action input, in the spec's order, with the input's name
and its mapped function type.

| | Swift | Kotlin |
| --- | --- | --- |
| an action | `let <name>: @MainActor (A) -> R` | `fun <name>(a: A): R`, its parameter names the TypeScript signature's |
| an optional action, `(() => void) \| null` | `let <name>: (@MainActor () -> Void)?` | `val <name>: (() -> Unit)?` |
| a binding to it | the closure itself: `onClick: actions.onNewTicket` | a required action is a function, bound as a reference: `onClick = actions::onNewTicket`; an optional one is a property, bound as itself: `onClear = actions.onClearFilters` |

The record is exhaustive. The view takes the whole record, Swift's memberwise initialiser has no
default for any member, and a Kotlin implementation must override every function, so a missing
action fails to compile. Swift's closures are `@MainActor` because the view calls them on the
main actor and the app's store lives there. No Kotlin action is `suspend`: the app starts every
coroutine in its own code, outside the screen.

Each file also declares the inert actions, every action doing nothing, so an app compiles
against the view before it wires its store: `<Screen>Actions.inert` in Swift, `object
<Screen>Inert` in Kotlin. An action that answers returns the empty value of its result (`""`,
`0`, `false`, `nil` or `null`, an empty list or set), and one with no empty value stops with a
message that names it.

## The view

```swift
@MainActor
struct <Screen>View: View {
  let model: <Screen>Model
  let actions: <Screen>Actions
  var body: some View { /* the spec's tree */ }
}
```

```kotlin
@Composable
fun <Screen>Screen(model: <Screen>Model, actions: <Screen>Actions) { /* the spec's tree */ }
```

The view is the spec's tree and nothing more:

- **It holds no state of its own.** State a member needs (a text field's draft, whether a sheet is
  presented) lives inside the member. The emitted Swift has no `@State`, `@StateObject`,
  `@ObservedObject`, `@Bindable` or `@Environment`; the emitted Kotlin has no `remember`,
  `rememberSaveable` or `mutableStateOf`.
- **It calls no asynchronous API.** No `Task`, `async`, `await`, `.task` or `.onAppear` in Swift;
  no `LaunchedEffect`, `rememberCoroutineScope` or `suspend` in Kotlin.
- **It navigates nowhere.** "Open the ticket" is an action the app implements. No
  `NavigationLink`, `NavigationStack`, `.navigationDestination` or `openURL` in Swift; no
  `NavController` or `navigate(` in Kotlin. An overlay member (`Dialog`, `Drawer`) is bound to the
  model and the actions like any other member.
- **Its root is a page archetype** other than `AppShell`: `ListPage`, `DetailPage`, `FormPage`,
  `Dashboard`, `SettingsPage`, `MasterDetailPage`, `SearchPage`, `ConversationPage` or `AuthPage`.
  The archetype owns the four load states. `AppShell` is the app's frame around its router, never a
  screen.

The spec's `purpose` is the view's doc comment. An exception's `because` is a comment above the
node that takes it, as in the emitted TSX.

## The four load states

The view passes `model.loadStatus` to its root archetype as `loadStatus`. Each native archetype
switches on it exhaustively and draws the state itself, so no screen can ship without all four.
The **header** renders in every state; the **body** is what the state replaces.

| Archetype | Header, in every state | Body | Its own state props on the web |
| --- | --- | --- | --- |
| `ListPage` | `title`, `description`, `actions`, `summary`, `filters` | the panel: `children` | `empty`, `emptyState` |
| `DetailPage` | `backLabel` and `onBack`, `title`, `meta`, `actions` | `tabs` or `children`, and `aside` | none |
| `FormPage` | `title`, `description`, `actions` | `children`, the cards of fields | none |
| `Dashboard` | `title`, `description`, `actions` | `stats`, `primary`, `secondary` | none |
| `SettingsPage` | `title`, `description` | `children`, the groups | none |
| `SearchPage` | `title`, `description`, `actions`, `search`, `filters` | `children`, the groups of results | `empty`, `emptyState`, `pending` |
| `ConversationPage` | `title`, `description`, `actions` | `thread`, `composer`, `aside` | none; its `ChatThread` has `empty` |
| `MasterDetailPage` | `title`, `description`, `actions` | `list`, and `detail` or `emptyState`, and the way back | none; `emptyState` is the detail pane before a pick |
| `AuthPage` | `brand`, `title`, `description`, `backAction`, `footer` | `children`, the fields and actions | `pending` |

What each state draws in the body:

| Archetype | `loading` | `empty` | `failed(message)` |
| --- | --- | --- | --- |
| `ListPage` | `Skeleton` rows in the panel | its own: `empty` is true and `emptyState` is drawn | an `Alert` in the panel |
| `DetailPage` | `Skeleton` in the main column, no aside | as `ready`: an entity has no empty form | an `Alert` in place of the body |
| `FormPage` | `Skeleton` in place of the cards; the actions row is disabled | as `ready`: a blank form is its empty form | an `Alert` above the cards, which keep their input |
| `Dashboard` | `Skeleton` stats and regions | as `ready`: each panel's members carry their own empty states | an `Alert` in place of the body |
| `SettingsPage` | `Skeleton` rows | as `ready` | an `Alert` in place of the groups |
| `SearchPage` | its own: `pending` is true, and the results region keeps what it holds | its own: `empty` is true and `emptyState` is drawn | an `Alert` in place of the results; the field keeps the query |
| `ConversationPage` | `Skeleton` turns in the thread; the composer is disabled | as `ready`: a thread with no turns draws its `ChatThread`'s `empty` | an `Alert` above the composer; the thread stays |
| `MasterDetailPage` | `Skeleton` rows in the list pane | as `ready`: the list's members draw their own empty state | an `Alert` in place of the list |
| `AuthPage` | its own: `pending` is true, and the fields stay | as `ready` | an `Alert` above the fields, which keep their input |

- The failed affordance is an `Alert` with `tone: danger` and the message as its body. A failed
  state never discards what the user typed: `FormPage`, `ConversationPage` and `AuthPage` keep
  their body under it.
- Every archetype that takes `loadStatus` also takes an optional `onRetry`, an action like any
  other: set, the failed state's `Alert` offers it as its action, so a screen can load again;
  absent, the `Alert` has none. The action is a `soft`/`danger` `sm` Button labelled "Try again",
  a default of the member package, which the app translates in its string catalog.
- The failed state's `Alert` is announced when it appears, at high priority, as a danger `Alert`
  is on the web: the failure arrives after the screen did.
- `ListPage`'s `empty` and `AuthPage`'s `pending` are set from `loadStatus`. A native spec that
  binds either is a fault: the status owns them.
- An archetype whose `empty` is "as `ready`" has no empty form of its own on the web either; the
  members inside it draw theirs.

## Members' events

A member's events keep their web names and payloads: `onClick()`, `onChange(value)`,
`onCommit(value)`, `onOpenChange(open)`, `onSortChange(sort)`. A payload's type maps by the type
table: `Select`'s `onChange` is `@MainActor (String?) -> Void` in Swift and `(String?) -> Unit`
in Kotlin. A native member declares each event as a parameter with the web's name, so a binding
needs no renaming. On iOS every closure a member takes is `@MainActor`, as the actions are, so an
action binds to it as it is.

## The platform map

A screen for `ios` or `android` uses only members the platform map (`design/platforms/`) marks
`native` or `adapted` there. The validator already refuses an `absent` one and names its
substitute.

It also uses only members its platform's member package draws. A native or adapted member
without a rendering is listed in `packages/native/src/pending.ts` (iOS) or
`packages/native/src/kotlin-pending.ts` (Android), and a screen that uses one is a fault at that
node, because the emitted call would not compile. On Android a compound part is drawn by a
composable of its own, so a part is a fault until the member package declares that composable.
A compound part is one the platform's contract declares. A part only the web vocabularies carry,
such as `Dashboard.Panel` or `Table.Head`, is a fault that lists the member's parts on the
platform.

An `adapted` member is emitted exactly as a native one. The member renders as its entry's `as`
says (`DataTable` as a list on iPhone, `Dialog` as a modal sheet), so the emitted view never
branches on the device.

Declared exceptions are emitted as on the web: a rung-2 scope is `PMDensityScope` or
`PMToneScope` around its children, a rung-3 patch is the member's `patch` parameter, a rung-4 zone
is `PMBespoke`.

## The theme

A native app renders under one `PMTheme` from its platform's token package, installed once at the
root of the app: a catalogue pairing (`PMTheme.plain_neutral`), or one read at run time from a
token document (`try PMTheme(tokenDocument: data)` on iOS). In SwiftUI the app installs it with
`.pmTheme(theme)`, an environment value, and members read it from the environment. In Compose the
theme is a `CompositionLocal` (`LocalPMTheme`) the member package declares and the app provides at
its root with `ProvidePMTheme(theme) { … }`, and members read it from the composition.
`ProvidePMTheme` also provides Material 3's bridge, which sets the content colour to the pairing's
`text.primary`. `CompositionLocalProvider(LocalPMTheme provides theme)` alone leaves Material's
default content colour, black. The view never names a theme or a token.

## Worked example: Relay's inbox

Relay's inbox for `ios` (`platforms/ios/Examples/Relay/Screens/inbox.json`) differs from the web
spec (`design/screens/inbox.json`) in three places: `platform` is `ios`; `isEmpty` is gone, because
`loadStatus` is `.empty` instead; and its object literals are named types: `summary` is the app's
`QueueStats` (four `StatProps`), `resultCount` is `FilterResultCount`, and the two option lists are
`(SelectOption | SelectOptionGroup)[]`, `Select`'s own `options` type, which is
`[PMSelectOptionEntry]` in Swift. Below is the screen's `InboxView.swift`, without its inputs' doc
comments and with some props elided, then the app's own code that renders it.

The example matches the generated props, argument order included. `DataTable`'s props are
generic over the row type (`PMDataTableProps<Ticket>`), and each `PMDataTableColumn<Ticket>`
carries a `value` accessor, the cell as text, beside the web's `key`, `header` and optional
`cell`.

```swift
import PolymorphUI
import SwiftUI

struct InboxModel {
  var loadStatus: PMLoadStatus
  var tickets: [Ticket]
  var summary: QueueStats
  var columns: [PMDataTableColumn<Ticket>]
  var sort: PMDataTableSort
  var isFiltered: Bool
  var resultCount: PMFilterResultCount
  var query: String
  var status: String?
  var statusOptions: [PMSelectOptionEntry]
  var priority: String?
  var priorityOptions: [PMSelectOptionEntry]
  var emptyState: PMEmptyStateProps
}

struct InboxActions {
  let onSortChange: @MainActor (PMDataTableSort) -> Void
  let getRowId: @MainActor (Ticket) -> String
  let onRowClick: @MainActor (Ticket) -> Void
  let onNewTicket: @MainActor () -> Void
  /// Loads the queue again after a load failed.
  let onRetry: @MainActor () -> Void
  let onClearFilters: @MainActor () -> Void
  let onQueryChange: @MainActor (String) -> Void
  let onStatusChange: @MainActor (String?) -> Void
  let onPriorityChange: @MainActor (String?) -> Void
}

/// Relay's ticket queue — a filtered, sortable table under a page header.
@MainActor
struct InboxView: View {
  let model: InboxModel
  let actions: InboxActions

  var body: some View {
    PMListPage(
      props: .init(
        loadStatus: model.loadStatus,
        onRetry: actions.onRetry,
        actions: AnyView(
          PMButton(props: .init(icon: .add, label: "New ticket", onClick: actions.onNewTicket))),
        children: AnyView(
          // Rung 2, declared: A queue is scanned rather than read, so more rows in the same …
          PMDensityScope(
            props: .init(
              as: .section,
              children: AnyView(
                PMDataTable(
                  props: .init(
                    columns: model.columns, data: model.tickets, emptyState: model.emptyState,
                    getRowId: actions.getRowId, label: "Tickets", onRowClick: actions.onRowClick,
                    onSortChange: actions.onSortChange, sort: model.sort, stickyHeader: true))),
              value: .compact))),
        emptyState: PMEmptyStateProps(icon: .search, title: "No tickets match these filters"),
        filters: AnyView(
          PMFilterBar(
            props: .init(
              children: AnyView(
                PMSelect(
                  props: .init(
                    ariaLabel: "Filter by status", emptyOption: "Any status",
                    onChange: actions.onStatusChange, options: model.statusOptions,
                    value: .some(model.status)))
                /* , and the priority PMSelect … */),
              isFiltered: model.isFiltered, onClear: actions.onClearFilters,
              resultCount: model.resultCount /* , search: the PMSearchInput … */))),
        summary: AnyView(PMGrid(props: .init(/* four PMCards, each a PMStat */))),
        title: "Inbox"))
  }
}

// The app's own code: the store, the task and the router live here, never in the view.
@MainActor @Observable
final class InboxStore {
  // `placeholder` is the app's own extension on InboxModel: .loading, every list empty.
  private(set) var model = InboxModel.placeholder
  private var all: [Ticket] = []
  let service: TicketService
  func actions(router: Router) -> InboxActions {
    InboxActions(
      onSortChange: { self.model.sort = $0; self.refilter() },
      getRowId: { $0.id },
      onRowClick: { router.open(.ticket($0.id)) },
      onNewTicket: { router.open(.newTicket) },
      onRetry: { Task { await self.load() } },
      /* onClearFilters, onQueryChange, onStatusChange, onPriorityChange: set, then refilter() */)
  }
  func load() async {
    model.loadStatus = .loading
    do {
      all = try await service.tickets()
      model.summary = QueueStats(all)
      refilter(settle: true)
    } catch {
      model.loadStatus = .failed(message: error.localizedDescription)
    }
  }
  // The status follows the tickets once the queue has loaded: `.empty` only
  // while a filter hides every ticket, `.ready` for an empty queue, whose table
  // draws its own empty state. A filter changed while loading or after a
  // failure keeps that state.
  private func refilter(settle: Bool = false) {
    model.tickets = visibleTickets(all, filteredBy: model)
    model.isFiltered = !model.query.isEmpty || model.status != nil || model.priority != nil
    if settle || model.loadStatus == .ready || model.loadStatus == .empty {
      model.loadStatus = model.tickets.isEmpty && model.isFiltered ? .empty : .ready
    }
  }
}

struct InboxRoute: View {
  @State var store: InboxStore
  @Environment(Router.self) private var router
  var body: some View {
    InboxView(model: store.model, actions: store.actions(router: router))
      .task { await store.load() }
  }
}
```

The Kotlin counterpart has the same three declarations, and the app's store is a `ViewModel`
that implements the actions.

```kotlin
data class InboxModel(val loadStatus: PMLoadStatus, val tickets: List<Ticket> /* , … in order */)

interface InboxActions {
  fun onRowClick(ticket: Ticket)
  fun onNewTicket()
  // … every other action, in order
}

@Composable
fun InboxScreen(model: InboxModel, actions: InboxActions) {
  PMListPage(loadStatus = model.loadStatus, title = "Inbox" /* … */) {
    PMDataTable(label = "Tickets", data = model.tickets, onRowClick = actions::onRowClick /* … */)
  }
}

// The app's own code. Its route collects the model, starts the load in a LaunchedEffect and
// calls InboxScreen(model, actions = store).
// `placeholder` is the app's own extension on InboxModel, as in Swift.
class InboxStore(private val service: TicketService, private val router: Router) :
  ViewModel(), InboxActions {
  private val state = MutableStateFlow(InboxModel.placeholder)
  val model: StateFlow<InboxModel> = state.asStateFlow()
  override fun onNewTicket() = router.open(Destination.NewTicket)
  // … every other action, and `suspend fun load()`, which the route starts
}
```

## What is checkable

Every statement above is checkable by machine except the last row. The emitter's law and its
validation run where a native emitter runs, before it writes anything or over what it wrote; the
compiler and the member packages' checks hold the rest wherever the screen is built.

| Statement | Checked by | How |
| --- | --- | --- |
| the three names and the inert actions, and `<Screen>` from the spec's `name` | the emitters' laws, `packages/spec/src/emit-swift.test.ts` and `packages/spec/src/emit-kotlin.test.ts` | every declaration at the file's left margin is one of the model, the actions, the view and the inert actions, named for the screen |
| member, part and parameter names; `@MainActor` | the compiler, building each platform's example: `platforms/ios/Examples/Relay` (`packages/spec/src/emit-swift.test.ts` and `pnpm gate:ios`) and `platforms/android/examples/relay` (`packages/spec/src/emit-kotlin.test.ts` and `pnpm gate:android`) | the example's emitted screens compile against the platform's member package: the inbox and the new-ticket form on iOS, the inbox on Android. The other Relay screens' emissions are pinned as snapshots and not compiled; that they compile rests on the next two rows, which refuse what would not |
| only members the member package draws | `validateSpec` (`packages/spec/src/lawful.ts`) with the platform's member package, and the emitter's walk (`packages/spec/src/emit-native.ts`) | a fault at each node whose member or part the package does not draw; the laws hold each Relay screen's faults to exactly those |
| a prop the contract can express, holding a value of its type | the emitter's walk, `packages/spec/src/emit-native.ts` | a prop the package declares as `PMUnsupported…`, a binding whose input's mapped type is not the prop's (an optional level and the member's type parameters aside), and a literal no case or field holds are each refused with a `NativeContractError`, and nothing is written |
| the purpose, each input's `doc` and each exception's `because` as comments | the emitters' laws, `packages/spec/src/emit-swift.test.ts` and `packages/spec/src/emit-kotlin.test.ts` | each is in the emitted source, and each reason sits directly above the call of the member that takes it |
| the partition | the emitters' laws, `packages/spec/src/emit-swift.test.ts` and `packages/spec/src/emit-kotlin.test.ts` | every stored property and function of the two records is counted: each function input once among the actions, every other input once in the model, which holds nothing else but `loadStatus` |
| the type table, and the faults for an object literal, an unmapped type, two literal unions in one input, an enum name the record uses, and a name the member package does not declare | the emitters' validation, `nativeInputFault` (`packages/spec/src/emit-native.ts`) through `validateSpec` (`packages/spec/src/lawful.ts`) | a fault at `$.inputs[i].type`, before anything is written |
| `loadStatus` and the language's words reserved; `ListPage.empty` and `AuthPage.pending` unbound; the root a page archetype other than `AppShell`; no declaration named as `types` or the platform already names | the emitters' validation, `packages/spec/src/validate.ts` | a fault at the input, the node or `$.name` |
| an event prop bound to an action, a data prop to model data, no path into an action | the emitters' validation, `packages/spec/src/validate.ts` | the registry gives each prop's type, a handler alias counted as a function; a fault at the binding |
| the actions are exhaustive | the compiler | the view takes the whole record; Swift's memberwise initialiser has no defaults, and a Kotlin implementation must override every function |
| all four states render, each as the tables above say | the compiler, and each native archetype's states fixture (`platforms/ios/Tests/PolymorphUITests`, `platforms/android/ui/src/test/kotlin`) | each archetype switches on `PMLoadStatus` with no default case; its fixture renders all four, and each state's entry names the members it must hold (`contains`): the affordance the table names, and a field's input still present after `failed` where the table keeps the body |
| no state, no asynchronous call, no navigation, no theme | the emitters' laws, `packages/spec/src/emit-swift.test.ts` and `packages/spec/src/emit-kotlin.test.ts`, and `emitCheckedScreen` (`packages/spec/src/lawful.ts`) before a file is written | the emitted source holds none of the constructs this page lists, used as constructs, and no theme or token |
| events keep their web names and payloads | laws over the member packages, `packages/native/src/laws.test.ts` and `packages/native/src/kotlin-laws.test.ts` | each native member's event parameters equal the registry's event props by name, and their types follow the type table; a handler alias is held to the package's unsupported type |
| only `native` and `adapted` members | `validateSpec` (`packages/spec/src/validate.ts`) | already: an absent member is a fault naming its substitute |
| an adapted member renders as its `as` says | review | the `as` note is prose; the member's own tests show the rendering |
