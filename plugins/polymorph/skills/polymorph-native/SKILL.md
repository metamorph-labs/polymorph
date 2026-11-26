---
name: polymorph-native
description: Build or change a SwiftUI or Jetpack Compose screen with the polymorph design system's native members, or add them to a new or existing iOS or Android app. Use when Swift code imports PolymorphUI or PolymorphTokens, when Package.swift or an Xcode project names github.com/metamorph-labs/polymorph, when a Gradle build depends on com.github.metamorph-labs.polymorph (JitPack) or dev.polymorph and Kotlin imports dev.polymorph.ui, when pubspec.yaml names polymorph_tokens, or when asked to use polymorph on iOS, Android, SwiftUI, Compose or Flutter. Covers the Swift package and JitPack lines, the PM-prefixed names (PMButton, PMBadgeTone, PMDateRange) and where they are declared, the native screen contract (model, actions, a stateless view, four load states), emitting it from a spec, a list screen (ListPage, FilterBar, DataTable) with its store and navigation, installing a pairing with pmTheme or ProvidePMTheme and its fonts, the members and parts a platform adapts or lacks, and checking a screen no lint reads.
---

# Build a SwiftUI or Compose screen with polymorph

Polymorph is a closed vocabulary of interface components, called members. On iOS they are SwiftUI
views and on Android Jetpack Compose composables, each drawn from the platform's own controls. A
member keeps its name with a `PM` prefix (`Button` is `PMButton`), its
props and its events. The theme decides every colour, length, font and motion: one pairing, a
system worn with a palette, installed at the app's root. A screen composes members and binds data
and actions to them. It decides no style.

## 1. Find the platform

| The repository has | The platform | Then read |
| --- | --- | --- |
| `import PolymorphUI`, or the PolymorphUI library in `Package.swift` or the Xcode project | `ios`, SwiftUI | [references/swiftui.md](references/swiftui.md) |
| `import dev.polymorph.ui`, or `com.github.metamorph-labs.polymorph:ui` or `dev.polymorph:ui` in a Gradle file | `android`, Compose | [references/compose.md](references/compose.md) |
| `polymorph_tokens:` in `pubspec.yaml` | Flutter or Dart: the tokens only | [references/flutter.md](references/flutter.md) |
| An Xcode project, a `Package.swift` or a Gradle build without these | Add the packages | step 2 |
| No Xcode project, no `Package.swift` and no Gradle build | Start the app | step 2 |

## 2. Add the packages at a release

The packages are released at the git tag `v1.0.18`, and every line the references give names
that release. A newer release is the same lines with its version.

| Platform | What the app adds | The lines |
| --- | --- | --- |
| iOS 17 or macOS 14 and later | One Swift package by the repository's URL, `https://github.com/metamorph-labs/polymorph`, with two libraries: PolymorphTokens, each catalogue pairing as a `PMTheme`, and PolymorphUI, the members | [references/swiftui.md](references/swiftui.md) |
| Android | Two Gradle modules that JitPack builds from the tag, `com.github.metamorph-labs.polymorph:tokens:v1.0.18` and `com.github.metamorph-labs.polymorph:ui:v1.0.18`, or the same modules from a checkout of polymorph | [references/compose.md](references/compose.md) |
| Flutter or Dart | The tokens only: polymorph has no Flutter members | [references/flutter.md](references/flutter.md) |

An iOS app is an Xcode project and an Android app is a Gradle build, and the IDE writes each. When
the repository has neither, ask the person to create the app: in Xcode, File › New › Project ›
App, with the SwiftUI interface; in Android Studio, New Project › Empty Activity, which is
Compose. Then add the packages. Until the iOS app exists, its screens can live in a Swift
package's library target, which `swift build` compiles on a Mac and the app later adds as a
local package. [references/swiftui.md](references/swiftui.md) has that `Package.swift`.

## 3. Read the vocabulary for the platform

The polymorph tools run from a shell with Node.js 24 or later. Every command starts with the same
words:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --framework react --platform ios
npx -y @metamorph-labs/polymorph@1.0.18 search date --framework react --platform android
npx -y @metamorph-labs/polymorph@1.0.18 component DatePicker --framework react
```

`card` prints every member with its props, its variant and tone pairs and its parts, then the
icon roles and a Platforms section. `--framework react` names the whole vocabulary by its spec's
names. `--platform` (`ios` or `android`) leaves out the members absent there, says how an
adapted member renders, and lists each member's parts as that platform has them. `search` finds
members by what they do. `component` prints one member's props with their types and defaults,
its parts on the web, its states, and under "Where it renders" a line per platform. A
`polymorph/system-card.md` in the repository is the web card. An MCP server named `polymorph`
answers the same through `get_system_card` and `search_components`, given `framework` and
`platform`, and `get_component`.

A member's line under "Where it renders" says one of three things:

| The line says | What to do |
| --- | --- |
| native | Use the member as the card lists it. |
| adapted | Use it the same way. It renders as the line says, such as `SplitPane` on iOS: iPad side by side; one pane at a time on iPhone. The member chooses by the device, so the screen never branches on it. |
| absent | Use the substitute the line names, such as `Textarea` for `RichTextInput`. Where it names none, the screen goes without it, or the need goes in a `Bespoke` zone (step 6). |

Take a member's parts from the platform's card, not from `component`. A phone carries only the
parts its contract declares: on iOS and Android `Table` is composed of
`Table.Row`, `Table.Header` and `Table.Cell`, and has no `Table.Head`, `Table.Body` or `Table.Foot`.

The props are the web's. A hyphenated name is camelCased (`aria-label` is `ariaLabel`), a
callback is called without the web's DOM event, and `Button` and `SplitButton` take
`variant` and `tone` as one `appearance`, a lawful pair. Every Swift or Kotlin name is the
web's with `PM` in front: the member `PMBadge`, its props
`PMBadgeProps`, the enum of a prop that takes one of a few words
`PMBadgeTone`, the web's data types `PMDateRange` and
`PMCalendarDate`, and a member's props passed as a value, `PMEmptyStateProps`.
The reference for the platform has the rule in full, where the generated `Contracts.swift` or
`Contracts.kt` that declares every name is, and the command that prints one declaration.

## 4. Emit the screen from a spec

A native screen is a stateless view of two values: the model, which is the data it shows, and the
actions, which are the code the app supplies. The app owns the store that holds the model, the
router and every asynchronous task. Write the screen as a spec whose `platform` is `ios` or
`android` (step 6 has one), and emit the view from the repository's root:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 emit screens/orders.json Sources/AppScreens/OrdersView.swift
npx -y @metamorph-labs/polymorph@1.0.18 emit screens/orders.json app/src/main/kotlin/com/acme/orders/OrdersScreen.kt
```

`emit` checks the spec as `validate` does, writes nothing when it finds a fault, and prints
each fault at its path. The `platform` decides the file: `.swift` for `ios`, `.kt` for
`android`, and no `--framework`. It writes below the directory it runs in, which holds the
app's `Package.swift`, `.xcodeproj`, `.xcworkspace` or Gradle build and takes only that
platform's screens. A Kotlin file declares the package its directory names below `kotlin/`.
After a change to the spec, emit again: `emit` replaces its own file, hand edits included, and
refuses any other.

| Part | SwiftUI | Compose |
| --- | --- | --- |
| The model: `loadStatus` first, then each piece of data | `struct <Name>Model` | `data class <Name>Model`, with an empty `companion object` |
| The actions: one for each thing the app does | `struct <Name>Actions` of `@MainActor` closures | `interface <Name>Actions` of functions |
| The view | `@MainActor struct <Name>View: View` with `let model` and `let actions` | `@Composable fun <Name>Screen(model, actions)` |
| Actions that do nothing, until the store is wired | `static let inert` on the actions | `object <Name>Inert : <Name>Actions` |

A spec has no condition, loop or handler body, so a view that draws a part only when the model
says so, or a `PMBespoke` zone's drawing, is written by hand in the same shape.
Every view keeps five rules, which an emitted one keeps by construction:

1. Its root is a page archetype: `ListPage`, `DetailPage`, `FormPage`, `SettingsPage`, `Dashboard`, `AuthPage`, `MasterDetailPage`, `SearchPage` and `ConversationPage`. It passes
   `model.loadStatus`, a `PMLoadStatus`, to the archetype, which draws the four
   states. The cases are `.loading`, `.ready`, `.empty` and `.failed(message:)` in Swift,
   and the same words capitalised in Kotlin, such as `PMLoadStatus.Failed(message)`. `loading`
   draws skeleton rows. `failed` draws a danger alert with the message, with "Try again" when the
   archetype's `onRetry` is set. `empty` draws `ListPage`'s or `SearchPage`'s
   `emptyState`, and draws as `ready` elsewhere. The header, and a
   `ListPage`'s `summary` and `filters`, stay
   drawn in every state.
2. It holds no state: no `@State` or `@Environment`, no `remember` or `mutableStateOf`. A
   member keeps its own state, such as a field's draft or an open sheet.
3. It calls nothing asynchronous: no `.task` or `Task { }`, no `LaunchedEffect(…)`. The route
   that shows the view starts the load.
4. It navigates nowhere: no `NavigationLink(…)` and no `navigate(…)`. Opening something is an
   action the app implements.
5. It names no theme and no token.

The view hands what was tapped to an action, as in `onRowClick: actions.onOpenOrder`. The store
implements the action by changing the app's router. The router is the platform's own, written in
app code at the app's root: `NavigationStack(path:) { … }` with `.navigationDestination(for:)`
in SwiftUI, Navigation Compose's `NavHost(…) { … }` in Compose. `AppShell` is the app's
frame around that router, never a screen's root. On iOS it already draws its content inside a
navigation stack of its own, so the app adds its destinations to that content and nests no second
stack. In Compose the app's navigation host is its content. The system's back stays: the
navigation bar's back button and the edge swipe on iOS, the back gesture on Android. No member
hides it, and the app does not hide it either. `DetailPage`'s `onBack`
is an action too, which the app implements by popping the same router.

The reference for the platform has two worked screens, a settings page and a list, in the shape
`emit` writes, and the store, the route and the root around the list.

## 5. Install the theme at the root

| | SwiftUI | Compose |
| --- | --- | --- |
| Install the pairing | `.pmTheme(.plain_neutral)` on the root view | `ProvidePMTheme(PMThemes.plain_neutral) { … }`, which also gives Material 3 the pairing |
| Before the app installs one | `PMTheme.default`, which is `.plain_neutral` | `PMThemes.default`, the same |
| Light and dark | Each colour resolves in the colour scheme it is drawn in. `.preferredColorScheme(theme.preferredColorScheme)` draws the pairing in its own mode. | The system's mode. `dark = theme.preferredDark` draws the pairing in its own mode. |

The packages carry each system worn with its default palette, named `<system>_<palette>`:
`.desktop_azure`, `.dew_verdigris`, `.flint_cobalt`, `.glassmorphic_azure`, `.harbor_ember`, `.journal_umber`, `.pastel_amethyst`, `.pebble_azure`, `.plain_neutral`, `.pop_orchid`, `.press_carmine`, `.terminal_petrol`. `PMTheme.named(system:palette:)` and
`PMThemes.named(system, palette)` find one by its two names. The card's Theme section lists each
system with its kind. `tenant`, as on harbor's line, marks a system that takes a
designed system's axes with another brand's seeds. It says nothing about how an app gets it:
harbor is `.harbor_ember` like the rest. A system worn with another palette is
not in the packages. On iOS a theme outside the catalogue arrives as a token document that a server
admits ([references/swiftui.md](references/swiftui.md)). The Kotlin and Dart token packages read
no documents, so Android and Flutter wear catalogue pairings only.

A pairing names three font families and carries no font files: `theme.fonts.body`, `.display`
and `.mono`, each with its `family`. Each is the web's family without the web's "Variable"
suffix, so read it from the pairing, not from the card. The app bundles the files: on iOS it adds
them to the app target and lists them under `<key>UIAppFonts</key>` in its Info.plist, and on
Android it provides `LocalPMFontFamilies`. Until it does, each type step uses
the system font in its slot's design.

The app sets the pairing, the mode, its fonts and its translations of the words the members write
by default, such as a dialog's "Close". It never overrides a member's colour, size or font, and
never installs a second pairing on part of a screen. `DensityScope` and
`ToneScope` re-assign density and the inverse tone for a subtree, as on the web: the
`polymorph-rules` skill has the exception ladder, which holds on every platform.

## 6. Check your own work

`check` and `validate` lint web code and apply no rule to a `.swift` or `.kt` file. What
either prints about a native repository is not a result: a clean report says nothing about the
screen. `check` takes one directory, and `validate` takes files or a spec. Run these four
checks, in this order:

1. Build. A member the package does not draw, an action the store does not implement, an argument
   of the wrong type, and in Swift an argument out of the initialiser's order each fail to
   compile. The reference for the platform has the command.
2. Search the view files, not the store's or the route's, for what a screen may not write. The
   reference for the platform has the search. Replace each hit as the table below says.
3. Check the composition as a spec. `emit` checked the spec of an emitted view. For a view
   written by hand, write its tree as a screen spec whose `platform` is `ios` or `android`, and
   run `npx -y @metamorph-labs/polymorph@1.0.18 validate orders.json --framework react`. `validate` takes no `--platform` flag:
   the spec's own field carries the platform, and `react` is the one framework it accepts with a
   native spec. It names a member the platform lacks with its substitute, a part the platform lacks
   with the parts it has, a prop the member does not take, and a required prop left out.
4. Run the app in the simulator or an emulator when the session can, in light and dark mode, at a
   phone's width and at the largest text size.

| A hit | Write instead |
| --- | --- |
| A colour: `Color(…)`, `.foregroundStyle(…)`, `MaterialTheme.colorScheme` | A member's `tone` or `variant` |
| A layout container: `VStack { }`, `HStack { }`, `Column { }`, `Row { }` | `Stack`, `Inline` and `Grid` |
| A length: `.padding(…)`, `.frame(…)`, `16.dp`, `Modifier.size(…)` | Their spacing steps: `gap`, `p`, `px` and `py` |
| A font: `.font(…)`, `fontSize = 20.sp` | `Heading`'s `level`, `Text`'s `size` and `tone` |
| A platform control: `Button(…)`, `Toggle(…)`, `TextField(…)`, `Picker(…)`, Material's `Switch(…)` | The member: `PMButton`, `PMSwitch`, `PMInput`, `PMSelect` |
| An icon: `Image(systemName:)`, `Icon(Icons.…)` | `PMIcon` with a role, or a member's `icon` |
| Motion: `withAnimation`, `.animation(…)`, `animate…AsState` | Nothing: members animate their own states |
| State, a task or navigation | The store and the route (step 4) |
| What no member draws | A `PMBespoke` zone with its `reason`, drawn from the theme's tokens (the reference has one) |

A spec, for `emit` or for check 3, spells each prop as the web does (`aria-label`, `variant` and
`tone`), writes a plain object such as an empty state as `{ "$object": { … } }`, and binds every
value the app supplies to an input. On a native archetype it may also bind `onRetry` to an action.
The `polymorph-screen` skill has the format. This is the list screen the references work, for iOS
(`"platform": "android"` and `"name": "OrdersScreen"` make it Android's):

```json
{
  "spec": "polymorph-screen/1",
  "name": "OrdersView",
  "purpose": "Every order, searchable and filtered by the day it was placed; a tap opens one.",
  "platform": "ios",
  "types": { "@polymorph/react-ui": ["DataTableColumn", "DateRange"], "./orders": ["Order"] },
  "inputs": [
    { "name": "orders", "type": "Order[]", "doc": "Already searched and filtered." },
    { "name": "columns", "type": "DataTableColumn<Order>[]" },
    { "name": "query", "type": "string" },
    { "name": "placed", "type": "DateRange | null" },
    { "name": "isFiltered", "type": "boolean" },
    { "name": "getRowId", "type": "(order: Order) => string" },
    { "name": "onOpenOrder", "type": "(order: Order) => void" },
    { "name": "onQueryChange", "type": "(query: string) => void" },
    { "name": "onPlacedChange", "type": "(placed: DateRange | null) => void" },
    { "name": "onClearFilters", "type": "() => void" }
  ],
  "root": {
    "component": "ListPage",
    "props": {
      "title": "Orders",
      "emptyState": {
        "$object": {
          "title": "No orders match these filters",
          "icon": "search",
          "secondaryAction": {
            "component": "Button",
            "props": { "label": "Clear filters", "variant": "ghost", "tone": "neutral", "onClick": { "$": "onClearFilters" } }
          }
        }
      },
      "filters": {
        "component": "FilterBar",
        "props": {
          "isFiltered": { "$": "isFiltered" },
          "onClear": { "$": "onClearFilters" },
          "search": {
            "component": "SearchInput",
            "props": { "aria-label": "Search orders", "size": "sm", "value": { "$": "query" }, "onChange": { "$": "onQueryChange" } }
          }
        },
        "children": [
          {
            "component": "DateRangePicker",
            "props": { "aria-label": "Placed between", "size": "sm", "value": { "$": "placed" }, "onChange": { "$": "onPlacedChange" } }
          }
        ]
      }
    },
    "children": [
      {
        "component": "DataTable",
        "props": {
          "label": "Orders",
          "columns": { "$": "columns" },
          "data": { "$": "orders" },
          "getRowId": { "$": "getRowId" },
          "onRowClick": { "$": "onOpenOrder" },
          "emptyState": { "$object": { "title": "No orders yet", "icon": "inbox" } }
        }
      }
    ]
  }
}
```

## 7. Let a member behave like the platform's own control

A native member behaves like the same control in any other app on its platform, and the app does
not work around it. Do not wrap a member in modifiers that change its size, its tap area, its
colours or its behaviour. Do not swap a member for a UIKit view or a Material component to make it
behave otherwise. Where a member differs from its web rendering, the difference is decided: on
iOS `DatePicker` is SwiftUI's own date picker, and UIKit sets its tap area. When a screen
seems to need a member to behave otherwise, tell the person which member and what the screen
needs. The change belongs in a polymorph release.

## What you cannot do here

- Draw a native screen with the tools. `render` draws web specs in a browser.
- Change a member. `add` and `update` copy web members only. Never edit the package's copy
  (`.build/checkouts/polymorph`, Xcode's package cache or Gradle's): a change to a member is a
  polymorph release.
- Wear a theme outside the catalogue on Android or in Flutter.
