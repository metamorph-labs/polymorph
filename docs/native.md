# Native rendering

Polymorph's vocabulary is one set of members. Native rendering means drawing those members with
each platform's own toolkit, SwiftUI on iOS and Jetpack Compose on Android, not inside a web view.
A native screen makes the same design decisions as a web screen on the same pairing, because its
values come from the same theme engine, and it is built from the same members under the same
names. It looks and behaves like an app of its platform, because each member is drawn from that
platform's primitives.

This page covers what native rendering means here, the contract a native screen is emitted to,
how a screen spec is emitted to SwiftUI and to Compose, how a tenant's theme reaches a device, and
what the repository holds.

## One vocabulary, rendered idiomatically

A member keeps its name, its props and its events on every platform. What changes is how it is
drawn. The platform map (`design/platforms/ios.json`, `android.json`, `web.json`) gives every
member one of three statuses on each platform:

| Status | Meaning | Example |
| --- | --- | --- |
| `native` | drawn from the platform's own primitives | `Button` everywhere; `LineChart` on iOS, through Swift Charts |
| `adapted` | drawn another way, which the entry's `as` describes | `Dialog` as a modal sheet; `DataTable` as a list on iPhone |
| `absent` | no sensible rendering; the entry names a substitute | `Tooltip`, because touch has no hover; use `Text` |

A screen spec that names its platform (`"platform": "ios"`) is checked against the map: an absent
member is a fault that names its substitute. The system card can be rendered for one platform,
and the MCP server's `get_system_card` and `search_components` take a `platform`.
[concepts.md](concepts.md) explains the statuses, and [tooling.md](tooling.md) the screen spec.

Idiomatic means the member follows its platform where the platform has a settled answer: a
sheet rather than a centred modal on a phone, a list rather than a wide table, 44-point hit
targets on iOS and 48dp on Android. It never means a second design. Colours, type, spacing,
radii, shadows and motion are the pairing's, read from the token package. A hit target is an
area, not a height: a member keeps the density's control height and extends its hit area to the
theme's `hitTarget` (in SwiftUI, `.contentShape` over a frame of at least that size, on the part
that takes the touch, because an area on a container does not widen a button inside it, and, where
the recipe keeps a smaller drawn box, a hit area centred on the box and reaching past its edges, so
the element VoiceOver finds is the hit target while the layout keeps the box (`pmHitRegion`); a
control UIKit hosts keeps UIKit's own frame as its element, as it does in every SwiftUI app, so the
simulator audit holds a text field to the box its member takes its tap in (`pmOpensOnTap`) and
records a system control whose taps UIKit takes over less than the hit target; in
Compose, `Modifier.pmHitTarget()`, which reserves the area as Material's
`minimumInteractiveComponentSize()` does, at the theme's size), as a web member extends its own to
`--pm-hit-target`.

A member keeps every prop on every platform, and some props have nothing to do on a phone: a
form control's `name`, the ids in `aria-labelledby`, an image's `referrerPolicy`. A rendering
reads every field of its contract, or the field is listed with its reason in
`packages/native/src/undrawn.ts`, the one list of what a SwiftUI or a Compose rendering does not
draw. The law of drawn props holds both platforms to it ([verification.md](verification.md),
"Undrawn props"). It fails on a field the list does not name that a rendering never reads, or
reads only to write into its identifier, and on an entry that names a field a rendering reads for
anything else. The identifier is what `pmMember` is handed: the tests and the audits read it, and
no person sees or hears it. A prop recorded there and nowhere else is therefore listed, as
`stickyHeader` on Table and DataTable is. Each entry gives its reason, and most are of these
kinds:

- the web document's wiring, which no native view has: `id`, a form's `name` and `value`, the
  ARIA id relations, an element's name in `as`, Table's grid model, and `aria-required`, which
  neither platform has a trait for;
- a browser's fetch hints on `Image`, and the number field's `min`, `max` and `step` on `Input`;
- a choice the platform has already made: `presentation` where the platform gives the member one
  form, `defaultOpen` on a system menu or picker, `initialFocus` and `alert` on an overlay,
  Textarea's `resize`, a sticky header in a scroll container the member does not own;
- what a platform map adapts a member without: Citation's hover preview, Stat's spark on Android;
- a name, a level or a state for something the platform's own control does not have: a month
  button in Material's range picker, a heading's level on Android, a busy region on Android;
- what the platform's text does not report: RichTextContent's selection bar (`selectionActions`
  and its `messages`) on iOS, because a SwiftUI Text with selection on copies its whole text and
  reports no selected range, and on Android, where the member's text is not selectable and
  Compose gives a selection's words to its content without their place in the text.

The law finds a field that is not read. It does not prove that a field is drawn: any read outside
the identifier counts, whatever the rendering does with the value. A presence check such as
`props.rowDetail != nil` counts as a read, and so does a value read into a property that nothing
draws. A reviewer still checks what a read does. The law reads source text: a read is
`props.<field>` under a binding `props: PM<Member>Props`, and a field of another shape of the
contract is read where a field of its name is read. Three things are exempt:

- a field the contract types `PMUnsupported…`, which is declared by its type and carries no
  value;
- a member's states fixture, which is not a rendering, so nothing in it is a read;
- a shape the hand-written sources build, which the member writes for the app to read, as an
  event's payload.

`AppShell`'s `banner` is a row of its own across the frame on both platforms. The navigation and
the content start under it, so the frame shortens by its height and nothing scrolls under it. In
SwiftUI the row is above the navigation stack on an iPhone and above the split view on an iPad,
inside the top safe area. In Compose it is the first row of the drawer's content on a phone, so
Material's drawer opens over it, and above the rail and the topbar on a tablet, inside the top and
side safe-drawing insets. The slot draws the view the app passes: one `Banner`, as on the web.
A Banner's action and dismiss button take the platform's hit target in the layout, so a line of a
Banner that has either is the hit target tall. In Compose the Banner's root is a live region,
polite for neutral, info and warning and assertive for danger. SwiftUI has no live region, and
the Banner's message is the app's view, whose words the member cannot post as an announcement,
so VoiceOver reads it where it is (`PLATFORM_GAPS` in `packages/native/src/pending.ts`).

Two of `DataTable`'s props name a row's parts on both platforms. `getRowName` is the row's own
name, "Invoice 12": VoiceOver and TalkBack announce the row by it, and `detailsLabel` names the
row's disclosure from it. `getRowLabel` is the whole name of the row's Checkbox, "Select Invoice
12": it names the Checkbox and the row's select action. Without `getRowName` a row is named by
`getRowLabel` when the app gives it, else by each column's header and value, so an app that passes
only `getRowLabel` keeps the announcement its rows had.

`DataTable`'s `rowDetail` turns expansion on in both forms the member has on both platforms, the
list and the table. Each row gets a disclosure after its Checkbox and before its cells, in a
column one hit target wide. The disclosure is Button's icon-only ghost, so it has the platform's
hit size and the platform's expanded or collapsed state: VoiceOver's value in SwiftUI, and
TalkBack's state with the expand or collapse action in Compose. `messages.detailsLabel` names it
from what `getRowName` returns, and the defaults are the spec's "Details for Invoice 12" and
"Details" (`PMStrings.detailsFor`, `PMStrings.details`). An open row draws what `rowDetail`
returns in a row of its own under it, across every column, on the subtle fill. The table holds the
open rows, starting from `defaultExpanded`, unless the app passes `expanded`, and
`onExpandedChange` is called with the next set in both cases. A row `isRowExpandable` refuses
keeps the column, empty, and never draws a detail. Three things differ from the web:

- The expansion column has no header, because neither platform's rows have a column for a header
  to name. `detailsLabel` names the disclosures only.
- A row with a disclosure is not one accessibility element, as a row with a drawn cell is not, so
  the disclosure and what the detail holds are reachable. The detail is an element of its own
  after its row.
- `close` closes the row on both platforms. In Compose it first moves keyboard focus that is
  inside the detail to the row's disclosure. In SwiftUI it moves no focus, because UIKit's focus
  system and VoiceOver each move their own when the element they are on leaves.

## The screen contract

A native screen for `ios` or `android` is a stateless view of two values. The full contract, with
the tables a native screen is held to, is
[design/native/screen-contract.md](../design/native/screen-contract.md). In short:

| Part | Swift | Kotlin |
| --- | --- | --- |
| the model: every data input, plus `loadStatus` | `struct InboxModel` | `data class InboxModel` |
| the actions: every function input | `struct InboxActions` of `@MainActor` closures | `interface InboxActions` |
| the view | `InboxView(model:actions:)` | `@Composable fun InboxScreen(model, actions)` |

- **Inputs split by type.** A function-typed input is an action; every other input is model data.
  A binding in an event prop resolves against the actions, any other against the model. Types map
  by a fixed table (`string` is `String`, `number` is `Double`, a union of string literals is an
  enum), and a type the table cannot map is a fault.
- **Four load states, always.** `loadStatus` is a `PMLoadStatus`: `loading`, `ready`, `empty` or
  `failed(message)`. The view passes it to its root page archetype, which draws all four, so a
  screen cannot ship without them. The contract's tables say what each archetype draws in each
  state.
- **The view decides nothing else.** It holds no state of its own, calls nothing asynchronous and
  navigates nowhere. The app owns the store, the router and every task, and "open the ticket" is
  an action the app implements.
- **Events keep their web names and payloads** (`onChange`, `onCommit`, `onOpenChange`), so a
  binding means the same thing on every platform.
- **One theme per app**, installed at its root: `.pmTheme(theme)` in SwiftUI, a
  `CompositionLocal` the app provides in Compose.

A spec for `ios` or `android` is emitted to this contract (below). The two emitters share the
type table, the walk over the tree and the faults (`packages/spec/src/emit-native.ts`); each
spells the result in its own language.

## Emitting a screen to SwiftUI

A screen spec whose `platform` is `ios` emits one Swift file, written to the contract above by
`packages/spec/src/emit-swift.ts`:

```sh
pnpm emit platforms/ios/Examples/Relay/Screens/inbox.json            # Swift to stdout
pnpm emit platforms/ios/Examples/Relay/Screens/inbox.json InboxView.swift
```

The MCP tool `emit_screen` does the same for a `.swift` path, and its answer names the language
it wrote ([tooling.md](tooling.md)). A web framework (`--framework`, `framework`) is refused for a
native spec, whose language is its platform's.

The file declares four things, and nothing else:

| Declaration | What it is |
| --- | --- |
| `struct InboxModel` | `loadStatus: PMLoadStatus`, then every input whose type is not a function, in the spec's order, each with its `doc` as its doc comment |
| `struct InboxActions` | one `@MainActor` closure per function input, in the spec's order, with no defaults |
| `@MainActor struct InboxView: View` | `init(model:actions:)`; its body is the spec's tree, the root archetype handed `model.loadStatus` |
| `InboxActions.inert` | every action doing nothing, so an app compiles before it wires its store; an action that answers returns the empty value of its result |

The member package decides every Swift name and type. The emitter reads each member's props,
their order and their types from the generated contract,
`platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift`, and the members the package draws
from `Generated/Fixtures.swift` (both read by `readNativePackage(root, 'ios')`), and maps a spec's
literals onto
them: `"sm"` is `.sm`, `"variant": "ghost", "tone": "neutral"` is `appearance: .ghostNeutral`, a
structured object is the struct its prop holds (`PMEmptyStateProps(…)`), an element is
`AnyView(PM<Member>(props: .init(…)))`, and several elements are one `AnyView(Group { … })`. A
binding in an event prop reads `actions`, any other binding `model`, and a model value bound to a
prop that is both nullable and optional is passed as `.some(…)`. A value the contract has no
place for is refused with a `SwiftContractError` (a `NativeContractError`) and nothing is
written: a `columns` of 5 where `PMGridColumns` has no such case, a prop the contract declares as
`PMUnsupported…` because the table cannot express it, a binding whose input's type is not the
prop's (`Text(verbatim:)` given a `Double`, an optional action where a closure is required), or a
member the package does not draw. The file is laid out by the emitter at 100 columns, and the
same spec gives the same bytes.

Validation runs first. Beyond the checks every spec gets, a spec for `ios` or `android` is held to
the contract's faults, each at its path with what to do instead. The faults are the same on both
platforms; the words a language has taken and the names it already uses are each language's own.

| Fault | Path |
| --- | --- |
| an object type literal, a type the table does not map, two literal unions in one input, an enum named like a type the record uses, and, with the member package, a vocabulary type or a union of them the package does not declare | `$.inputs[i].type` |
| an input named `loadStatus`, or a word the language has taken (Swift's keywords with `async` and `await`; Kotlin's hard keywords with `equals`, `hashCode` and `toString`) | `$.inputs[i].name` |
| a root that is not a page archetype, or is `AppShell` | `$.root` |
| a member or a compound part the member package does not draw | the node |
| `ListPage`'s `empty` or `AuthPage`'s `pending` set at all | the prop |
| an event prop given anything but an action, a data prop or a child bound to an action, a path into an action | the binding |
| a grid member's `variant` or `tone` bound, or given alone where it pairs with more than one | the prop |
| several texts for a member that takes its children as one `String` | the children |
| a name that leaves no stem, whose declarations `types` already names, or that the file uses from its platform (`AnyView`, `EmptyView`) | `$.name` |

The member-package faults need the package: `pnpm emit`, `emit_screen` and the MCP `validate`
tool read it from the checkout, and a caller passes it as `native` (`readNativePackage`). The
browser's validator has no package and leaves them out.

A page archetype also takes `onRetry` in a spec for a native platform, an action like any other:
set, the failed state's Alert offers "Try again".

Relay's inbox for iOS (`platforms/ios/Examples/Relay/Screens/inbox.json`) is the web spec with the
changes the contract names: `platform` is `ios`, `isEmpty` is gone, and the object literals are
named types. It emits this, trimmed:

```swift
struct InboxModel {
  var loadStatus: PMLoadStatus
  /// Already filtered and sorted.
  var tickets: [Ticket]
  var summary: QueueStats
  var columns: [PMDataTableColumn<Ticket>]
  var sort: PMDataTableSort
  // … isFiltered, resultCount, query, status, statusOptions, priority, priorityOptions, emptyState
}

struct InboxActions {
  let onSortChange: @MainActor (PMDataTableSort) -> Void
  let getRowId: @MainActor (Ticket) -> String
  let onRowClick: @MainActor (Ticket) -> Void
  let onNewTicket: @MainActor () -> Void
  // … onClearFilters, onQueryChange, onStatusChange, onPriorityChange
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
        actions: AnyView(
          PMButton(props: .init(icon: .add, label: "New ticket", onClick: actions.onNewTicket))
        ),
        children: AnyView(
          // Rung 2, declared: A queue is scanned rather than read, so more rows in the same
          // viewport is worth more here than the breathing room the rest of the product gets. …
          PMDensityScope(
            props: .init(
              as: .section,
              children: AnyView(
                PMDataTable(
                  props: .init(
                    columns: model.columns,
                    data: model.tickets,
                    // … emptyState, getRowId, label, onRowClick, onSortChange, sort
                    stickyHeader: true
                  )
                )
              ),
              value: .compact
            )
          )
        ),
        // … emptyState, filters, summary
        title: "Inbox"
      )
    )
  }
}
```

The app renders the view from a store, which holds the model and supplies the actions. This is
the example's store (`platforms/ios/Examples/Relay/Sources/RelayExample/InboxStore.swift`):

```swift
@MainActor @Observable
final class InboxStore {
  private(set) var model = InboxModel.placeholder
  private var all: [Ticket] = []
  private let service: any TicketService

  func actions(router: Router) -> InboxActions {
    InboxActions(
      onSortChange: { self.model.sort = $0; self.refilter() },
      getRowId: { $0.id },
      onRowClick: { router.open(.ticket($0.id)) },
      onNewTicket: { router.open(.newTicket) },
      onRetry: { Task { await self.load() } },
      // … the filters: set the model's field, then refilter()
    )
  }

  func load() async {
    model.loadStatus = .loading
    do {
      all = try await service.tickets()
      model.summary = QueueStats(all)
      refilter(settle: true)  // `.empty` only while a filter hides every ticket
    } catch {
      model.loadStatus = .failed(message: error.localizedDescription)
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

### The example and how it is checked

`platforms/ios/Examples/Relay/` is a Swift target of the package, `RelayExample`, that no
product exports:

| Path | |
| --- | --- |
| `Screens/` | Relay's inbox, new-ticket and settings screens for iOS. `packages/spec/src/emit-swift.test.ts` pins their emissions as snapshots. |
| `Sources/RelayExample/InboxView.swift`, `NewTicketView.swift` | Emitted from `Screens/inbox.json` and `Screens/new-ticket.json` by `pnpm emit:examples`; never edited by hand. `pnpm emit:examples --check` and `emit-swift.test.ts` fail when either differs from what the emitter writes. |
| `Sources/RelayExample/Ticket.swift`, `InboxStore.swift`, `NewTicketStore.swift` | The app's own code: the `Ticket` and `QueueStats` types the inbox names, the stores, the router and the routes. The new-ticket store checks the two required fields on submit and hands the ticket to a desk. |
| `Tests/RelayExampleTests/` | Renders `InboxView` with `ImageRenderer` at a phone's width under the default pairing, in each of the four load states as the store reaches them, and `NewTicketView` blank, filled in, refused and failed, and writes `platforms/ios/.snapshots/Examples/Relay/<screen>.<state>.png`. `NewTicketFocusTests` presses each link of the refused form's ErrorSummary and checks that focus moves to its field. `InboxStoreTests` holds the store's load status to the load, in the four cases Android's `InboxStoreTest` pins: a filter changed while the queue loads or after it failed keeps that state, the status is `.empty` only while a filter hides every ticket and `.ready` for an empty queue, and `onRetry` loads again after a failure. |

`emit-swift.test.ts` builds the target with `swift build` and runs its test with `swift test`
where `xcrun swift` exists, and `pnpm gate:ios` does both as part of the whole package.
`ImageRenderer` draws neither a scroll view's content nor an AppKit text field, so the render
turns the page's scrolling off, as the archetypes' states fixtures do, and every text field and
system date picker shows as a placeholder box.

## How a tenant theme reaches a device

A tenant's theme is a system and a palette the catalogue does not hold: two JSON documents. On
the web, the browser admits them at run time with `admitTheme` ([theming.md](theming.md)). A
native app does not run the engine. A server admits the theme instead and sends the device the
result as a token document, which the app reads into a theme.

On the server, with `@polymorph/engine`:

```ts
import { admitTheme, emitTokenDocumentJSON } from '@polymorph/engine'

const admission = admitTheme({ system, palette }) // the same laws the browser runs
if (!admission.lawful) throw new Error(admission.faults.map((fault) => fault.message).join('\n'))
const body = emitTokenDocumentJSON(admission.resolved, { platform: 'ios' })
```

The document for `ios` has every reference resolved and the iOS floor applied: the hit target is
44 points, and control heights are the density's. The same pairing and platform always give the
same bytes, so the response caches well.

In the app, with `PolymorphTokens`:

```swift
import PolymorphTokens

let theme: PMTheme
do {
  theme = try PMTheme(tokenDocument: data)
} catch {
  theme = .default // the default pairing, while the tenant's is unavailable
}
```

`PMTheme(tokenDocument:)` (`platforms/ios/Sources/PolymorphTokens/PMTheme+TokenDocument.swift`)
builds the same `PMTheme` the Swift emitter would have generated for the pairing, equal under
`==`. It reads each field as `emit-swift.ts` writes it, and rounds every number as the emitter
does, to at most four decimals, except an alpha, which both write exactly. It throws a
`PMTokenDocumentError` that names the problem:

| Error | When |
| --- | --- |
| `format(_:)` | the document is not `polymorph-tokens/1`, or names no format |
| `platform(_:)` | the document was resolved for another platform, whose floors and unsupported list differ |
| `notJSON(_:)` | the data is not a JSON object |
| `invalid(path:reason:)` | a value is missing or of the wrong kind, at a path such as `mode.light.color["accent.bg"]` (a `format` that is not a string included); `unsupported` does not list `texture.page`, which `PMTheme` has no field for; an alpha has more than four decimals |
| `geometryDiffersByMode(_:)` | a glow or a gradient has another geometry in dark mode than in light |
| `belowFloor(path:points:)` | `floor.hitTarget` is under 44 points, or a density's hit target is under the `floor.hitTarget` the document declares |

Control heights are read as the density gives them: the iOS minimum is a hit area, which the hit
target carries.

A document names its font families but does not carry the fonts. `admission.fonts` lists them;
the app bundles the files. Until it does, each type step falls back to the system font in its
slot's fallback design, as for a catalogue pairing.

The Kotlin and Dart token packages hold the catalogue pairings only and read no documents at run
time.

A palette's `moreContrast` partner ([theming.md](theming.md#more-contrast)) does not reach a
device. The token document holds one pairing and names no partner, the Swift and Kotlin emitters
write none, and no member reads the platform's contrast setting. An iOS app that wants the partner
asks the server for a second document, admitted with the partner palette
(`admitTheme({ system, palette: partner })`), and installs that theme while the environment's
`colorSchemeContrast` is `.increased`. The Kotlin and Dart token packages read no documents, so an
Android app has no partner to install.

A server that admits a palette naming a partner passes the partner too
(`admitTheme({ system, palette, moreContrast })`), because admission refuses the palette without
it. The document it emits still holds the one pairing.

A system's two drawing choices, `overrides.focus.field` and `overrides.hover.unfilled`
([theming.md](theming.md)), reach the web only. The token document carries both as `invariant`
entries, and neither `PMTheme` nor the Compose theme has a field for them (`emit-swift.test.ts` and
`native-model.test.ts` list them as unread), so no member can branch on them. A SwiftUI or Compose
field (`Input.swift`, `Input.kt`) draws its focus ring at the system's offset, and an outline or
ghost Button washes under a pointer (`.onHover` in `Button.swift`, `PMButtonPhase.Hover` in
`Button.kt`), whatever the system chooses. A field shows the difference only in a system that moves
the ring outside the edge, while it has focus; a Button shows it only under a pointer: an iPad with
a trackpad, or an Android device with a mouse. The flag `focus.place` is unread too: the focus
modifier reads where the ring sits from `focus.offset`.

### How the loader is tested

`platforms/ios/Tests/PolymorphTokensTests/TokenDocumentTests.swift` runs
`platforms/ios/Tests/fixtures/token-documents.mjs` once per `swift test`. The script admits each
pairing as a server would and writes its iOS document into a temporary directory. The test then
checks:

- every catalogue pairing's document decodes to its static in `Generated/`;
- the engine's quiet example and its probe (`exampleProbeSystem` with `exampleDuskPalette` in
  `packages/theme/src/examples.ts`, the pairing the emitters' tests read too), which holds a
  tenant, an italic display face, glass, a gradient partner and an exception of each family,
  decode to their statics. These two are not in the catalogue, so their statics are test sources
  in `Tests/PolymorphTokensTests/Examples/`, written by
  `node platforms/ios/Tests/fixtures/token-documents.mjs --write-statics`. The test fails,
  naming that command, when they differ from what the emitter writes;
- the loader rounds as the emitter does, over several hundred numbers the script rounds with the
  emitter's own `swiftNumber`;
- another format, a format that is not a string, another platform, a malformed value, a
  document that does not list the texture as unsupported, an alpha with more than four
  decimals, a hit target under the floor, a floor under 44 points and a glow whose geometry
  changes between modes are each refused with the error above, and a control height under 44
  points is read as it is.

The test needs `node` and the repository's installed dependencies. Without `node` on `PATH` it is
skipped and says why, and it removes its temporary directory when it ends. The suite runs it:
`packages/theme/src/swift-build.test.ts` runs `swift test --filter PolymorphTokensTests` when
`xcrun swift` exists, and the freshness law (`packages/theme/src/native.test.ts`) compares the
statics in `Examples/` with what the emitter writes, with or without Swift.

## Android: the Compose members

`platforms/android/ui` is a Compose Multiplatform module with two targets from one source set:
`jvm`, Compose for desktop, which compiles and renders on any machine with a JDK, and `android`,
an Android library, which builds where an Android SDK with the API 37 platform is installed. A
machine without an SDK builds, tests and renders the JVM target; the Android target is declared
and configured there but not compiled. `pnpm gate:android` checks the module
([verification.md](verification.md), "The Android gate"); with an SDK it also builds the Android
library and runs the accessibility audit, which composes every states fixture entry with
Android's Compose runtime under Robolectric and reads the nodes it publishes, as TalkBack reads
them.

The foundation (`PolymorphUI.kt`) is the Compose counterpart of the SwiftUI one:

- **The theme.** `LocalPMTheme` holds the pairing (`PMThemes.default` until the app provides
  one), and `LocalPMDark` the mode (the system's until the app sets it). A member reads both
  through `PM.theme` and `PM.dark`, and a colour role through `.color`, which resolves it in the
  mode. `ProvidePMTheme(theme)` provides both and the Material bridge at an app's root;
  `ProvidePMTheme(theme, dark = theme.preferredDark)` draws the pairing in its own mode, as the
  web does where nothing sets one.
- **The Material bridge.** `PMMaterialTheme { … }` is a `MaterialTheme` built from the pairing:
  its colour scheme from the colour roles (the accent as primary and secondary, info as tertiary,
  the surface as its own tint, so a tonal elevation does not shift a surface's colour), its
  fifteen type styles from the text and display steps, its shapes from the radii, and its minimum
  touch size from the hit target. A member draws Material's components (a dropdown menu, a
  navigation drawer) inside it, so they wear the pairing, and nothing else builds a Material
  theme; a scrim Material draws takes `bg.scrim`. A member's own press is a ripple from the touch
  point in the recipe's active fill (`PMPressLayer`), its elevation the pairing's shadows
  (`pmShadow`, drawn with Compose's `dropShadow` and `innerShadow` from each layer's offset, blur,
  spread and colour), and its shape the pairing's radii, not Material's defaults.
- **Focus and actions.** Keyboard focus draws the focus ring (`pmFocusRing`, `focus.width` in
  `border.focusSolid` at `focus.offset`, inside the part's edge by default) on every part that
  takes it. Compose places it as the web does, by the part's shape: inside the edge by default,
  past a border that carries state; inside a solid fill with a gap, in the colour the label laws
  hold on the fill (Button's solid cells, a selected day, a current SectionNav or
  TableOfContents item); and around a part that cannot hold the line, `spacing.s1` out: a
  control too small for it (Checkbox, Radio, Switch, Slider's thumb, Carousel's dots) and a part
  whose box is its text (a link, a tab, a disclosure's trigger, a step, a sort header). SwiftUI draws the
  ring only on fields, frames and panes, all inside the edge. A control's click or toggle sits
  before the modifier that clears its semantics, because a clearing modifier drops what the
  modifiers after it add. The harness checks every node in every member and window: a node whose
  role is Button, Checkbox, RadioButton, Switch, Tab or DropdownList has its click action, a
  radio button or tab its selected state, and a checkbox or switch its toggle state; a Button,
  Checkbox or Switch member's root also has its role and its disabled state.
- **Touch areas.** A pressable part smaller than the hit target reserves it in its layout
  (`Modifier.pmHitTarget()`), on both axes, or on one where a container reserves the other and
  centres the part on it (an embedded button inside a field's own hit area). Android publishes a
  node's touch area less what a later sibling covers and what lies outside the window, so
  Compose's own extension of a small pressable to 48dp, which changes no layout, is cut wherever a
  neighbour or an edge is near. Parts drawn side by side (a carousel's dots, a time's segments, a
  stepper pair, a field's chips) are a hit target apart, and their drawn size stays the recipe's.
  The room this takes changes the spacing a recipe draws, so each member's spec records its
  Android measure ("On Android" in `tag-input.md`, `number-input.md`, `time-input.md`,
  `month-input.md`, `duration-input.md`,
  `citation.md`, `markdown.md`, `rich-text-content.md`, `prompt-input.md`, `attachment-chip.md`,
  `source-list.md`, `banner.md`, `list.md`, `section-nav.md`, `table-of-contents.md`, `tree.md` and
  `diff.md`),
  and Carousel, whose dot rail changes form, is adapted.
- **Field names.** A text field's name is on a node inside the editable one (`pmFieldName`),
  where Material's text field draws its label, and TalkBack reads it with the field. It is never
  the editable node's own content description, which TalkBack reads in place of what was typed;
  Compose publishes no hint and no labelling relation for a text field.
- **Overlay bodies.** An overlay's body (a Dialog's, a Drawer's, a Popover's panel) is the panel's
  one scroll region (`PMOverlayBody`). Compose cannot measure a vertical scroll inside another, so
  a ScrollArea or a ChatThread inside the body scrolls the body through `LocalPMOverlayScroll`
  rather than nesting its own: the body draws the ScrollArea's rail over its viewport and the
  ChatThread's jump control at its foot.
- **Announcements.** What a member says without showing it (a copy's outcome, a list's count, a
  file's upload, a value removed) goes through `PMAnnouncement(text)`, a polite live region that
  takes no room in the layout and is one pixel square inside, because Android leaves a node with
  no size out of the accessibility tree.
- **Right to left.** A member's own layouts place their children with `placeRelative`, so a row,
  a grid, a split, a page's regions and a header's actions mirror in a right-to-left layout as
  Compose's rows do. SplitPane's drag and arrow keys follow its start pane to the right, and what
  a member draws at an edge (a rail's border, a guide, a pending ribbon) is drawn at the start
  or end edge of the layout direction. What reads left to right in every language keeps its
  direction: TimeInput's hour, minute and day period. ColorInput's picker mirrors, as a slider
  does (`color-input.md`): its plane and rails are drawn, touched and placed from the start edge.
  A chevron turned by a quarter turns the other way, because its glyph is mirrored. The harness
  renders every fixture entry right to left as a third pass (`Harness.rightToLeft`), and
  `RightToLeftTest` holds these cases to it.
- **Identity.** `Modifier.pmMember(name, attributes)` puts the member on its root as a semantics
  property (`PMMemberKey`) and as the node's test tag, `member:<Name> key=value…`, the Swift
  identifier's format, which UI Automator reads when the app sets `testTagsAsResourceId`.
- **The defaults a spec names** are `PMStrings`, in English, generated into `Strings.kt` from
  `packages/native/src/strings.ts`, which holds each to the spec that names it; an app provides
  its translations through `LocalPMStrings`. The SwiftUI members read the same list, generated
  into `Strings.swift`, where each default is looked up through `String(localized:comment:)` in
  the app's string catalog.
- **The recipes' numbers.** A measure the recipe writes as a multiple or a part of a token, a
  breakpoint in rems, a sheet's height, an opacity and a length the content decides are generated
  into `Recipes.kt` (`PMRecipe`) from the recipes' CSS, and ConversationPage's split from the web
  member's source (`packages/native/src/recipes.ts`), so a member multiplies the theme's step by
  the recipe's number rather than a copy of it. The same numbers are generated into
  `Recipes.swift`.
- **Brand marks.** Each provider's mark is generated into `Brands.kt` from the engine's
  `BRAND_DRAWINGS`, path for path with the provider's published colours, as `Brands.swift` is;
  `PMBrandMark` draws it (`PolymorphUIImages.kt`, with the image gateway and the colour model
  ColorInput draws in).
- **Recordings.** AudioPlayer plays through the media player the app provides
  (`LocalPMAudioEngine`, `PolymorphUIAudio.kt`), over `MediaPlayer` or Media3, as it provides its
  image loader, because neither exists on the JVM target. The SwiftUI member plays with
  AVFoundation's `AVPlayer` itself.
- **Framed images.** ImageEditor frames the picture the app's image loader gives, and writes its
  export through the encoder the app provides (`LocalPMImageEncoder`, `PolymorphUIImages.kt`),
  over `Bitmap.compress` or Skia's encoder, because no encoder runs on both targets. The export is
  drawn from the picture at its natural size by the stage's own drawing (`pmDrawFramed`). The
  SwiftUI member encodes with ImageIO itself.

A member is `object PM<Member> : PM<Member>Rendering` beside its states fixture, and a screen
calls the generated composable of the same name with the props as arguments:
`PMButton(label = "Save", onClick = actions::onSave)`. Every member with a file in
`ui/src/main/kotlin` is drawn, and `packages/native/src/kotlin-pending.ts` lists the rest. An
adapted member renders as `design/platforms/android.json` says: Dialog full-screen below 30rem of
window and centred above, or a bottom sheet below 30rem when its `presentation` is `sheet`;
DataTable a list below Material's medium window width and a table above; Stat without its
spark. Toast spans the window below 30rem and is the recipe's corner card above. Menu,
ContextMenu and SplitButton's menu are a bottom sheet of actions below 30rem and a dropdown above
(a context menu's at the press point); Popover and MultiSelect's checklist are a modal bottom sheet
below 30rem and anchored above, and ColorInput's picker is that Popover; ConfirmDialog is a modal
bottom sheet at every width, and so is each step of a Tour, which points at no part of the screen
because `Tour.Target` has no native contract. The bottom sheet is Material 3's, on the pairing's
sheet surface (`PMBottomSheet`), and the anchored panel a popup on the overlay surface (`PMAnchoredPanel`), both
in `PolymorphUIPresentation.kt`. Drawer, adapted, is the bottom sheet on a phone, and a start or end
drawer a side sheet in a dialog window above 30rem. Table is a list below Material's medium window
width, each body row's cells stacked under the first, and a table above. SplitPane is a pager of
its two panes below that width and the split above; a page that measures its own room asks for the
split directly (`LocalPMSplitPaneLayout`), as ConversationPage does from a 48rem page. Citation is
its mark as a link, without the hover preview, which touch cannot open. Carousel's dots are a hit
target apart, and a rail with more dots than fit between its buttons shows whole dots and snaps to
them when a drag ends.

## Emitting a screen to Compose

A screen spec whose `platform` is `android` emits one Kotlin file, written to the contract by
`packages/spec/src/emit-kotlin.ts`:

```sh
pnpm emit platforms/android/examples/relay/Screens/inbox.json                # Kotlin to stdout
pnpm emit platforms/android/examples/relay/Screens/inbox.json app/src/main/kotlin/dev/acme/relay/InboxScreen.kt
```

The MCP tool `emit_screen` does the same for a `.kt` path. The file declares the package its
directory names under the source root (`…/kotlin/dev/acme/relay/` is `dev.acme.relay`, and a
`java/` root counts the same), so the app's own types beside it need no import; printed, or
written outside a source root, it declares none. It declares four things, and nothing else:

| Declaration | What it is |
| --- | --- |
| `data class InboxModel` | `val loadStatus: PMLoadStatus`, then every input whose type is not a function, in the spec's order, each with its `doc` as KDoc; an enum for a literal union nested in it; and an empty `companion object`, which the app extends (`InboxModel.placeholder`) |
| `interface InboxActions` | one `fun` per function input, in the spec's order, its parameters named as the TypeScript signature names them; an action the app may leave unset is a `val` of a nullable function type. None is `suspend` |
| `@Composable fun InboxScreen(model: InboxModel, actions: InboxActions)` | the spec's tree, the root archetype handed `model.loadStatus` |
| `object InboxInert : InboxActions` | every action doing nothing, so an app compiles before it wires its store; an action that answers returns the empty value of its result |

The member package decides every Kotlin name and type. The emitter reads each member's props,
their order and their types from
`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Contracts.kt`, and the members the
package draws from `Members.kt` (both read by `readNativePackage(root, 'android')`). A member is
the composable `Members.kt` declares for it, its props as named arguments in the contract's order
and a `children` slot as a trailing lambda: `PMCard { PMStat(label = model.label, value =
model.value) }`. A compound part is the composable of its joined name, `PMSettingsRowGroup`. A
literal is written in the package's terms: `"sm"` is `PMControlSize.Sm`, `"variant": "ghost",
"tone": "neutral"` is `appearance = PMButtonAppearance.GhostNeutral`, a structured object is the
class its prop holds, a list is `listOf(…)`, a number is a `Double` (`1.0`), and text drawn where a
view goes is Material's `Text("…")`, which takes the style and colour the member around it
provides. A required action is bound as a reference, `actions::onNewTicket`, and an optional one,
an input typed `(() => void) | null`, as itself: `onRetry = actions.onRetry`. Any value given to a
prop that is both nullable and optional is wrapped in `PMSome`. What the contract has no place for
is refused with a
`KotlinContractError`, as on iOS, and validation holds the spec to the same faults. The file is
laid out at 100 columns with Kotlin's four-space indent and trailing commas, and the same spec and
path give the same bytes.

The example's inbox emits this, trimmed:

```kotlin
data class InboxModel(
    val loadStatus: PMLoadStatus,
    /** Already filtered and sorted. */
    val tickets: List<Ticket>,
    val summary: QueueStats,
    val columns: List<PMDataTableColumn<Ticket>>,
    val sort: PMDataTableSort,
    // … isFiltered, resultCount, query, status, statusOptions, priority, priorityOptions, emptyState
) {
    companion object
}

interface InboxActions {
    fun onSortChange(sort: PMDataTableSort)
    fun getRowId(ticket: Ticket): String
    fun onRowClick(ticket: Ticket)
    fun onNewTicket()
    // … onClearFilters, onQueryChange, onStatusChange, onPriorityChange
}

/** Relay's ticket queue — a filtered, sortable table under a page header. */
@Composable
fun InboxScreen(model: InboxModel, actions: InboxActions) {
    PMListPage(
        loadStatus = model.loadStatus,
        actions = {
            PMButton(icon = PMIconRole.Add, label = "New ticket", onClick = actions::onNewTicket)
        },
        // … emptyState, filters (a PMFilterBar: its PMSearchInput and two PMSelects), summary
        title = "Inbox",
    ) {
        // Rung 2, declared: A queue is scanned rather than read, so more rows in the same viewport
        // is worth more here than the breathing room the rest of the product gets. …
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

object InboxInert : InboxActions {
    override fun onSortChange(sort: PMDataTableSort) {}
    override fun getRowId(ticket: Ticket): String = ""
    // … every other action, doing nothing
}
```

The app renders the screen from a store, a `ViewModel` that holds the model and implements the
actions. This is the example's store
(`platforms/android/examples/relay/src/main/kotlin/dev/polymorph/examples/relay/InboxStore.kt`):

```kotlin
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
    // … the filters: change the model, then refilter

    suspend fun load() {
        state.update { it.copy(loadStatus = PMLoadStatus.Loading) }
        try {
            all = service.tickets()
            // `Empty` only while a filter hides every ticket.
            refilter(settle = true) { copy(summary = QueueStats.of(all)) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            state.update { it.copy(loadStatus = PMLoadStatus.Failed(error.message.orEmpty())) }
        }
    }
}

@Composable
fun InboxRoute(store: InboxStore) {
    val model by store.model.collectAsState()
    LaunchedEffect(store) { store.load() }
    InboxScreen(model = model, actions = store)
}
```

The route is the app's code, so the coroutine, the collected state and the router live there and
never in the screen.

### The example and how it is checked

`platforms/android/examples/relay/` is a Gradle module of the build in `platforms/android`,
`:examples:relay`, beside `ui`. It builds the JVM target only, as the member module's harness
does, so it needs no Android SDK.

| Path | |
| --- | --- |
| `Screens/` | Relay's inbox, new-ticket and settings screens for Android: the iOS screens with `platform` and `name` changed. `packages/spec/src/emit-kotlin.test.ts` pins their emissions as snapshots, emitted as if every member were drawn, and holds each screen's faults against the package as it is to exactly the members Compose does not draw. The inbox is the screen the example compiles. |
| `src/main/kotlin/…/InboxScreen.kt` | Emitted from `Screens/inbox.json` by `pnpm emit:examples` (`scripts/emit-examples.mjs`, which writes both platforms' examples); never edited by hand. `pnpm emit:examples --check` and `emit-kotlin.test.ts` fail when it differs from what the emitter writes. |
| `src/main/kotlin/…/Ticket.kt`, `InboxStore.kt` | The app's own code: the `Ticket` and `QueueStats` types the spec names, the store, the router and the route. |
| `src/test/kotlin/…/InboxRenderingTest.kt` | Renders `InboxScreen` through the member module's harness (`ui/src/test/kotlin/…/Harness.kt`, with the semantics walk of `ui/src/commonTest/kotlin/…/SemanticsAudit.kt`, the two files of `ui`'s tests the module compiles) at a phone's width under the default pairing in light mode, in each of the four load states as the store reaches them, at the page's whole height, and writes `platforms/android/.snapshots/Examples/Relay/inbox.<state>.png`. |
| `src/test/kotlin/…/InboxStoreTest.kt` | Holds the store's load status to the load: a filter changed while the queue loads or after it failed keeps that state, the status is `Empty` only while a filter hides every ticket and `Ready` for an empty queue, and `onRetry` loads again after a failure. |

`pnpm gate:android` runs `:examples:relay:jvmTest` after the member module's tests, and
`emit-kotlin.test.ts` runs the same task through the build's wrapper, `platforms/android/gradlew`,
where the wrapper's JDK is 17 or later and its Gradle is already downloaded, or `PM_GRADLE=1`
allows the download; elsewhere it is skipped, with the reason in its title. The page scrolls, so
the test reads how far its column scrolls from the semantics tree and renders the screen that much
taller than a phone, which draws the whole page.

## What is here

| Part | Where | State |
| --- | --- | --- |
| The platform map | `design/platforms/`, held by `packages/registry/src/platforms.test.ts` | in use: the registry, the system card and the spec validator read it |
| Screen specs for a platform | the `platform` field of `polymorph-screen/1` | validated: an absent member is a fault |
| Token packages | `platforms/ios` (Swift), `platforms/android` (Kotlin), `platforms/dart` | the house pairings as values, generated by `pnpm emit:native`; see [theming.md](theming.md) |
| A run-time theme on iOS | `PMTheme(tokenDocument:)` | reads a server's token document into a `PMTheme` |
| The screen contract | `design/native/screen-contract.md` | the specification a native screen and the members it composes are held to |
| The SwiftUI screen emitter | `packages/spec/src/emit-swift.ts`, `pnpm emit`, the MCP tool `emit_screen` | writes a spec for `ios` as a model, an actions record and a view against the generated contract; `platforms/ios/Examples/Relay` compiles and renders Relay's inbox and new-ticket form |
| The Compose screen emitter | `packages/spec/src/emit-kotlin.ts`, `pnpm emit`, the MCP tool `emit_screen` | writes a spec for `android` as a model, an actions interface, a composable and the inert actions against the generated contract; `platforms/android/examples/relay` compiles and renders Relay's inbox |
| The SwiftUI members | `platforms/ios/Sources/PolymorphUI`, checked by `pnpm gate:ios` | the foundation (`PMLoadStatus`, `\.pmTheme`, the icon gateway, the defaults the specs name) and its further files of shared parts (`PolymorphUI+<Topic>.swift`); every native or adapted member's props and rendering protocol, the defaults the specs name (`PMStrings`) and the recipes' numbers (`PMRecipe`), generated from the registry by `pnpm native:contracts`; every member with a file in `Sources/PolymorphUI`, each with its states fixture; the rendering harness, and the accessibility audit on an iPhone simulator. The members the iOS map marks native or adapted that have no view are listed in `packages/native/src/pending.ts`, and its `PLATFORM_GAPS` lists what a member cannot do on iOS that its contract asks, with the reason; see [verification.md](verification.md) and [platforms/ios/README.md](../platforms/ios/README.md) |
| The Compose members | `platforms/android/ui`, checked by `pnpm gate:android` | the foundation (`LocalPMTheme`, the Material bridge, `PMMember`, the icon gateway, `LocalPMStrings`) and its further files (`PolymorphUI<Topic>.kt`); every native or adapted member's props, rendering interface and composable, the defaults the specs name (`PMStrings`) and the recipes' numbers (`PMRecipe`), generated by `pnpm native:contracts`; every member with a file in `ui/src/main/kotlin`, each with its states fixture; the rendering harness on the JVM target, and the accessibility audit on the Android target under Robolectric. The members without a view are listed in `packages/native/src/kotlin-pending.ts`; see [platforms/android/README.md](../platforms/android/README.md) |

Not here: a SwiftUI view for the members `pending.ts` lists, and a Compose view for the members
`kotlin-pending.ts` lists. A screen for a platform that uses a member the platform does not draw
is a fault until it is drawn. The charts draw through Swift Charts, except RadarChart and Treemap, which Swift
Charts cannot draw and SwiftUI shapes draw instead. A native app can also draw with the tokens directly: every
colour, length, type step and motion value the web uses is in the token package as a value.
