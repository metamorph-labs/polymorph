---
name: polymorph-native
description: Build or change a SwiftUI or Jetpack Compose screen with the polymorph design system's native members, or add them to an iOS or Android app. Use when Swift code imports PolymorphUI or PolymorphTokens, when Package.swift or an Xcode project names github.com/metamorph-labs/polymorph, when a Gradle build depends on com.github.metamorph-labs.polymorph (JitPack) or dev.polymorph and Kotlin imports dev.polymorph.ui, when pubspec.yaml names polymorph_tokens, or when asked to use polymorph on iOS, Android, SwiftUI, Compose or Flutter. Covers the Swift package and JitPack dependency lines, the PM-prefixed members (PMButton) and how their props map, the native screen contract (model, actions, a stateless view, four load states), installing a pairing with pmTheme or ProvidePMTheme, a tenant theme on iOS, the members a platform adapts or lacks, and checking a screen when no lint reads Swift or Kotlin.
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
| None of these | Add the packages | step 2 |

## 2. Add the packages at a release

The packages are released at the git tag `v1.0.18`, and every line the references give names
that release. A newer release is the same lines with its version.

| Platform | What the app adds | The lines |
| --- | --- | --- |
| iOS 17 or macOS 14 and later | One Swift package by the repository's URL, `https://github.com/metamorph-labs/polymorph`, with two libraries: PolymorphTokens, each catalogue pairing as a `PMTheme`, and PolymorphUI, the members | [references/swiftui.md](references/swiftui.md) |
| Android | Two Gradle modules that JitPack builds from the tag, `com.github.metamorph-labs.polymorph:tokens:v1.0.18` and `com.github.metamorph-labs.polymorph:ui:v1.0.18`, or the same modules from a checkout of polymorph | [references/compose.md](references/compose.md) |
| Flutter or Dart | The tokens only: polymorph has no Flutter members | [references/flutter.md](references/flutter.md) |

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
names, and `--platform` (`ios` or `android`) leaves out the members absent there. `search`
finds members by what they do. `component` prints one member's props with their types and
defaults, its parts and states, and under "Where it renders" a line per platform. A
`polymorph/system-card.md` in the repository is the web card. An MCP server named `polymorph`
answers the same through `get_system_card` and `search_components`, given `framework` and
`platform`, and `get_component`.

A member's line under "Where it renders" says one of three things:

| The line says | What to do |
| --- | --- |
| native | Use the member as the card lists it. |
| adapted | Use it the same way. It renders as the line says, such as `SplitPane` on iOS: iPad side by side; one pane at a time on iPhone. The member chooses by the device, so the screen never branches on it. |
| absent | Use the substitute the line names, such as `Textarea` for `RichTextInput`. Where it names none, the screen goes without it, or the need goes in a `Bespoke` zone (step 6). |

The props are the web's. A hyphenated name is camelCased (`aria-label` is `ariaLabel`), a
callback is called without the web's DOM event, and `Button` and `SplitButton` take
`variant` and `tone` as one `appearance`, a lawful pair. The reference for the platform has
the whole mapping.

## 4. Write the screen to the screen contract

A native screen is a stateless view of two values: the model, which is the data it shows, and the
actions, which are the code the app supplies. The app owns the store that holds the model, the
router and every asynchronous task.

| Part | SwiftUI | Compose |
| --- | --- | --- |
| The model: `loadStatus` first, then each piece of data | `struct <Name>Model` | `data class <Name>Model`, with an empty `companion object` |
| The actions: one for each thing the app does | `struct <Name>Actions` of `@MainActor` closures | `interface <Name>Actions` of functions |
| The view | `@MainActor struct <Name>View: View` with `let model` and `let actions` | `@Composable fun <Name>Screen(model, actions)` |
| Actions that do nothing, until the store is wired | `static let inert` on the actions | `object <Name>Inert : <Name>Actions` |

The view keeps five rules:

1. Its root is a page archetype: `ListPage`, `DetailPage`, `FormPage`, `SettingsPage`, `Dashboard`, `AuthPage`, `MasterDetailPage`, `SearchPage` and `ConversationPage`. It passes
   `model.loadStatus`, a `PMLoadStatus`, to the archetype, which draws the four
   states. `loading` draws skeleton rows. `failed` draws a danger alert with the message, with
   "Try again" when the archetype's `onRetry` is set. `empty` draws `ListPage`'s or
   `SearchPage`'s `emptyState`, and draws as `ready` elsewhere.
2. It holds no state: no `@State` or `@Environment`, no `remember` or `mutableStateOf`. A
   member keeps its own state, such as a field's draft or an open sheet.
3. It calls nothing asynchronous: no `.task` or `Task { }`, no `LaunchedEffect(…)`. The route
   that shows the view starts the load.
4. It navigates nowhere: no `NavigationLink(…)` and no `navigate(…)`. Opening something is an
   action the app implements.
5. It names no theme and no token.

`AppShell` is the app's frame around its router, never a screen's root. The reference for
the platform has a worked screen with its store and its route.

## 5. Install the theme at the root

| | SwiftUI | Compose |
| --- | --- | --- |
| Install the pairing | `.pmTheme(.plain_neutral)` on the root view | `ProvidePMTheme(PMThemes.plain_neutral) { … }`, which also gives Material 3 the pairing |
| Before the app installs one | `PMTheme.default`, which is `.plain_neutral` | `PMThemes.default`, the same |
| Light and dark | Each colour resolves in the colour scheme it is drawn in. `.preferredColorScheme(theme.preferredColorScheme)` draws the pairing in its own mode. | The system's mode. `dark = theme.preferredDark` draws the pairing in its own mode. |

The packages carry each system worn with its default palette:
`.desktop_azure`, `.dew_verdigris`, `.flint_cobalt`, `.glassmorphic_azure`, `.harbor_ember`, `.journal_umber`, `.pastel_amethyst`, `.pebble_azure`, `.plain_neutral`, `.pop_orchid`, `.press_carmine`, `.terminal_petrol`. `axes` lists the systems and the font
families each names. The app bundles those fonts, and until it does each type step falls back to
the system font. A tenant's theme, outside the catalogue, reaches an iOS app as a token document
that a server admits ([references/swiftui.md](references/swiftui.md)). The Kotlin and Dart token
packages read no documents, so Android and Flutter wear catalogue pairings only.

The app sets the pairing, the mode, its fonts and its translations of the words the members write
by default, such as a dialog's "Close". It never overrides a member's colour, size or font, and
never installs a second pairing on part of a screen. `DensityScope` and
`ToneScope` re-assign density and the inverse tone for a subtree, as on the web: the
`polymorph-rules` skill has the exception ladder, which holds on every platform.

## 6. Check your own work

No polymorph tool reads Swift or Kotlin. The red rules lint web code, `validate` checks no
`.swift` or `.kt` file, and `check` reads 0 files in a native repository. Three checks
remain, and you run them:

1. Build. A member the package does not draw, an action the store does not implement, and in
   Swift an argument out of the initialiser's order each fail to compile.
2. Search the view's file, not the store's, for what a screen may not write. The reference for the
   platform has the search. Replace each hit:

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

3. Run the app in the simulator or an emulator when the session can, in light and dark mode, at a
   phone's width and at the largest text size.

## 7. Let a member behave like the platform's own control

A native member behaves like the same control in any other app on its platform, and the app does
not work around it. Do not wrap a member in modifiers that change its size, its tap area, its
colours or its behaviour. Do not swap a member for a UIKit view or a Material component to make it
behave otherwise. Where a member differs from its web rendering, the difference is decided: on
iOS `DatePicker` is SwiftUI's own date picker, and UIKit sets its tap area. When a screen
seems to need a member to behave otherwise, tell the person which member and what the screen
needs. The change belongs in a polymorph release.

## What you cannot do here

- Emit a native screen from a spec. `emit` writes only into a directory with a `package.json`
  or `polymorph.json`, and a native repository has neither, so write the view by hand in the
  contract's shape (step 4). A spec whose `platform` is `ios` or `android` can still be
  checked against that platform's members: `npx -y @metamorph-labs/polymorph@1.0.18 validate screen.json --framework react`
  (the `polymorph-screen` skill has the format).
- Draw a native screen with the tools. `render` draws web specs in a browser.
- Change a member. `add` and `update` copy web members only. Never edit the package's copy
  (`.build/checkouts/polymorph`, Xcode's package cache or Gradle's): a change to a member is a
  polymorph release.
- Wear a tenant's theme on Android or in Flutter.
