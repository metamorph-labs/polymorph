import { NO_SUBSTITUTE, PUBLISHED_NAMES, type Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM } from '../plan'
import { all, commands, either, Facts, skill, SkillFactError, type SkillFile } from './facts'

/** Where the native names the texts cite are declared, below the repository root. */
const IOS_UI = 'platforms/ios/Sources/PolymorphUI'
const IOS_CONTRACTS = 'platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift'
const IOS_TOKENS = 'platforms/ios/Sources/PolymorphTokens'
const KOTLIN_UI = 'platforms/android/ui/src/main/kotlin'
const KOTLIN_MEMBERS = 'platforms/android/ui/src/generated/kotlin'
const KOTLIN_CONTRACTS = 'platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Contracts.kt'
const KOTLIN_TOKENS = 'platforms/android/tokens/src/main/kotlin'
const KOTLIN_CATALOGUE = 'platforms/android/tokens/src/generated/kotlin'
const DART = 'platforms/dart/lib'

/** The repository a native app depends on, by URL or through JitPack. */
const REPOSITORY = 'https://github.com/metamorph-labs/polymorph'

/** `before`, `name` and `after` in code font, once `name` is declared at `from` (`Facts.x`). */
function x(f: Facts, name: string, from: string, before = '', after = ''): string {
  f.x(name, from)
  return `\`${before}${name}${after}\``
}

/** A name both contracts declare, in code font, held to the Swift and the Kotlin file. */
function both(f: Facts, name: string): string {
  f.x(name, KOTLIN_CONTRACTS)
  return x(f, name, IOS_CONTRACTS)
}

/** A slug as the native packages spell it: `deep-sea` is `deepSea`. */
const camel = (slug: string): string =>
  slug.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

/** What every native text reads from the registry. */
function nativeFacts(registry: Registry) {
  const f = new Facts(registry)
  const named = (system: { name: string; defaultPalette: string }) =>
    `${camel(system.name)}_${camel(system.defaultPalette)}`
  const pairings = registry.theme.systems.map(named)
  const plain = registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)
  const pairing = `${camel(DEFAULT_SYSTEM)}_${camel(plain?.defaultPalette ?? '')}`
  if (!pairings.includes(pairing)) throw new SkillFactError(`no catalogue pairing ${pairing}`)
  // A system of the `tenant` kind is in the catalogue like a designed one.
  const tenant = registry.theme.systems.find((system) => system.kind === 'tenant')
  if (tenant === undefined) throw new SkillFactError('the catalogue has no system of kind tenant')
  // The members whose variant and tone form a lawful grid take them as one `appearance`.
  const grid = registry.components
    .filter((member) => member.grid !== null)
    .filter((member) => ['variant', 'tone'].every((p) => member.props.some((e) => e.name === p)))
    .map((member) => member.name)
  const adapted = registry.components.find((member) => member.platforms.ios.status === 'adapted')
  const absent = registry.components.find(
    (member) =>
      member.platforms.ios.status === 'absent' &&
      member.platforms.ios.substitute !== undefined &&
      member.platforms.ios.substitute !== NO_SUBSTITUTE,
  )
  if (adapted === undefined || absent === undefined) {
    throw new SkillFactError(
      'the iOS map has no adapted member, or no absent one with a substitute',
    )
  }
  // A phone platform carries the parts whose props the registry flattens into the member's
  // (`Row.selected`), as `shippedParts` in the registry reads them; the web carries every part.
  const table = registry.components.find((member) => member.name === 'Table')
  const parts = (table as { parts?: { name: string }[] } | undefined)?.parts ?? []
  const carried = new Set(
    (table?.props ?? [])
      .filter((prop) => prop.name.includes('.'))
      .map((prop) => prop.name.slice(0, prop.name.indexOf('.'))),
  )
  const kept = parts.filter((part) => carried.has(part.name)).map((part) => part.name)
  const lost = parts.filter((part) => !carried.has(part.name)).map((part) => part.name)
  if (kept.length === 0 || lost.length === 0) {
    throw new SkillFactError('Table carries every web part on a phone, or none')
  }
  // How a member of the list screen renders on each phone, from the platform maps.
  const on = (name: string, platform: 'ios' | 'android', status: 'native' | 'adapted') => {
    const entry = registry.components.find((member) => member.name === name)?.platforms[platform]
    if (entry?.status !== status)
      throw new SkillFactError(`${name} is not ${status} on ${platform}`)
    return entry.as ?? ''
  }
  const renders = {
    rangeIos: on('DateRangePicker', 'ios', 'adapted'),
    tableIos: on('DataTable', 'ios', 'adapted'),
    tableAndroid: on('DataTable', 'android', 'adapted'),
  }
  on('DateRangePicker', 'android', 'native')
  return {
    f,
    version: registry.version,
    tag: `v${registry.version}`,
    pairing,
    pairings,
    tenant: { name: tenant.name, pairing: named(tenant) },
    grid,
    adapted: { name: adapted.name, as: adapted.platforms.ios.as ?? '' },
    absent: { name: absent.name, substitute: absent.platforms.ios.substitute as string },
    archetypes: f.tier('archetypes').filter((name) => name !== 'AppShell'),
    tableParts: {
      kept: kept.map((part) => f.part('Table', part)),
      lost: lost.map((part) => f.part('Table', part)),
    },
    renders,
  }
}

/**
 * The list screen both references work, as a spec for `platform`: what `validate` checks, and
 * what the worked views are the hand-written form of.
 */
function listSpec(platform: 'ios' | 'android'): string {
  return `\`\`\`json
{
  "spec": "polymorph-screen/1",
  "name": "${platform === 'ios' ? 'OrdersView' : 'OrdersScreen'}",
  "purpose": "Every order, searchable and filtered by the day it was placed; a tap opens one.",
  "platform": "${platform}",
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
\`\`\``
}

export function nativeSkill(registry: Registry, run: string): SkillFile[] {
  const n = nativeFacts(registry)
  const { f, tag } = n
  const body = `
# Build a SwiftUI or Compose screen with polymorph

Polymorph is a closed vocabulary of interface components, called members. On iOS they are SwiftUI
views and on Android Jetpack Compose composables, each drawn from the platform's own controls. A
member keeps its name with a \`PM\` prefix (${f.m('Button')} is ${x(f, 'PMButton', IOS_UI)}), its
props and its events. The theme decides every colour, length, font and motion: one pairing, a
system worn with a palette, installed at the app's root. A screen composes members and binds data
and actions to them. It decides no style.

## 1. Find the platform

| The repository has | The platform | Then read |
| --- | --- | --- |
| \`import PolymorphUI\`, or the PolymorphUI library in \`Package.swift\` or the Xcode project | \`ios\`, SwiftUI | [references/swiftui.md](references/swiftui.md) |
| \`import dev.polymorph.ui\`, or \`com.github.metamorph-labs.polymorph:ui\` or \`dev.polymorph:ui\` in a Gradle file | \`android\`, Compose | [references/compose.md](references/compose.md) |
| \`polymorph_tokens:\` in \`pubspec.yaml\` | Flutter or Dart: the tokens only | [references/flutter.md](references/flutter.md) |
| An Xcode project, a \`Package.swift\` or a Gradle build without these | Add the packages | step 2 |
| No Xcode project, no \`Package.swift\` and no Gradle build | Start the app | step 2 |

## 2. Add the packages at a release

The packages are released at the git tag \`${tag}\`, and every line the references give names
that release. A newer release is the same lines with its version.

| Platform | What the app adds | The lines |
| --- | --- | --- |
| iOS 17 or macOS 14 and later | One Swift package by the repository's URL, \`${REPOSITORY}\`, with two libraries: PolymorphTokens, each catalogue pairing as a ${x(f, 'PMTheme', IOS_TOKENS)}, and PolymorphUI, the members | [references/swiftui.md](references/swiftui.md) |
| Android | Two Gradle modules that JitPack builds from the tag, \`com.github.metamorph-labs.polymorph:tokens:${tag}\` and \`com.github.metamorph-labs.polymorph:ui:${tag}\`, or the same modules from a checkout of polymorph | [references/compose.md](references/compose.md) |
| Flutter or Dart | The tokens only: polymorph has no Flutter members | [references/flutter.md](references/flutter.md) |

An iOS app is an Xcode project and an Android app is a Gradle build, and the IDE writes each. When
the repository has neither, ask the person to create the app: in Xcode, File › New › Project ›
App, with the SwiftUI interface; in Android Studio, New Project › Empty Activity, which is
Compose. Then add the packages. Until the iOS app exists, its screens can live in a Swift
package's library target, which \`swift build\` compiles on a Mac and the app later adds as a
local package. [references/swiftui.md](references/swiftui.md) has that \`Package.swift\`.

## 3. Read the vocabulary for the platform

The polymorph tools run from a shell with Node.js 24 or later. Every command starts with the same
words:

${commands(run, 'card --framework react --platform ios', 'search date --framework react --platform android', 'component DatePicker --framework react')}

\`card\` prints every member with its props, its variant and tone pairs and its parts, then the
icon roles and a Platforms section. \`--framework react\` names the whole vocabulary by its spec's
names. \`--platform\` (\`ios\` or \`android\`) leaves out the members absent there, says how an
adapted member renders, and lists each member's parts as that platform has them. \`search\` finds
members by what they do. \`component\` prints one member's props with their types and defaults,
its parts on the web, its states, and under "Where it renders" a line per platform. A
\`polymorph/system-card.md\` in the repository is the web card. An MCP server named \`polymorph\`
answers the same through \`get_system_card\` and \`search_components\`, given \`framework\` and
\`platform\`, and \`get_component\`.

A member's line under "Where it renders" says one of three things:

| The line says | What to do |
| --- | --- |
| native | Use the member as the card lists it. |
| adapted | Use it the same way. It renders as the line says, such as ${f.m(n.adapted.name)} on iOS: ${n.adapted.as}. The member chooses by the device, so the screen never branches on it. |
| absent | Use the substitute the line names, such as ${f.m(n.absent.substitute)} for ${f.m(n.absent.name)}. Where it names none, the screen goes without it, or the need goes in a ${f.m('Bespoke')} zone (step 6). |

Take a member's parts from the platform's card, not from \`component\`. A phone carries only the
parts its contract declares: on iOS and Android ${f.m('Table')} is composed of
${all(n.tableParts.kept)}, and has no ${either(n.tableParts.lost)}.

The props are the web's. A hyphenated name is camelCased (\`aria-label\` is \`ariaLabel\`), a
callback is called without the web's DOM event, and ${all(n.grid.map((name) => f.m(name)))} take
\`variant\` and \`tone\` as one \`appearance\`, a lawful pair. Every Swift or Kotlin name is the
web's with \`PM\` in front: the member ${x(f, 'PMBadge', IOS_UI)}, its props
${both(f, 'PMBadgeProps')}, the enum of a prop that takes one of a few words
${both(f, 'PMBadgeTone')}, the web's data types ${both(f, 'PMDateRange')} and
${both(f, 'PMCalendarDate')}, and a member's props passed as a value, ${both(f, 'PMEmptyStateProps')}.
The reference for the platform has the rule in full, where the generated \`Contracts.swift\` or
\`Contracts.kt\` that declares every name is, and the command that prints one declaration.

## 4. Write the screen to the screen contract

A native screen is a stateless view of two values: the model, which is the data it shows, and the
actions, which are the code the app supplies. The app owns the store that holds the model, the
router and every asynchronous task.

| Part | SwiftUI | Compose |
| --- | --- | --- |
| The model: \`loadStatus\` first, then each piece of data | \`struct <Name>Model\` | \`data class <Name>Model\`, with an empty \`companion object\` |
| The actions: one for each thing the app does | \`struct <Name>Actions\` of \`@MainActor\` closures | \`interface <Name>Actions\` of functions |
| The view | \`@MainActor struct <Name>View: View\` with \`let model\` and \`let actions\` | \`@Composable fun <Name>Screen(model, actions)\` |
| Actions that do nothing, until the store is wired | \`static let inert\` on the actions | \`object <Name>Inert : <Name>Actions\` |

The view keeps five rules:

1. Its root is a page archetype: ${all(n.archetypes.map((name) => f.m(name)))}. It passes
   \`model.loadStatus\`, a ${x(f, 'PMLoadStatus', IOS_UI)}, to the archetype, which draws the four
   states. The cases are \`.loading\`, \`.ready\`, \`.empty\` and \`.failed(message:)\` in Swift,
   and the same words capitalised in Kotlin, such as \`PMLoadStatus.Failed(message)\`. \`loading\`
   draws skeleton rows. \`failed\` draws a danger alert with the message, with "Try again" when the
   archetype's \`onRetry\` is set. \`empty\` draws ${f.m('ListPage')}'s or ${f.m('SearchPage')}'s
   ${f.p('ListPage', 'emptyState')}, and draws as \`ready\` elsewhere. The header, and a
   ${f.m('ListPage')}'s ${f.p('ListPage', 'summary')} and ${f.p('ListPage', 'filters')}, stay
   drawn in every state.
2. It holds no state: no \`@State\` or \`@Environment\`, no \`remember\` or \`mutableStateOf\`. A
   member keeps its own state, such as a field's draft or an open sheet.
3. It calls nothing asynchronous: no \`.task\` or \`Task { }\`, no \`LaunchedEffect(…)\`. The route
   that shows the view starts the load.
4. It navigates nowhere: no \`NavigationLink(…)\` and no \`navigate(…)\`. Opening something is an
   action the app implements.
5. It names no theme and no token.

The view hands what was tapped to an action, as in \`onRowClick: actions.onOpenOrder\`. The store
implements the action by changing the app's router. The router is the platform's own, written in
app code at the app's root: \`NavigationStack(path:) { … }\` with \`.navigationDestination(for:)\`
in SwiftUI, Navigation Compose's \`NavHost(…) { … }\` in Compose. ${f.m('AppShell')} is the app's
frame around that router, never a screen's root. On iOS it already draws its content inside a
navigation stack of its own, so the app adds its destinations to that content and nests no second
stack. In Compose the app's navigation host is its content. The system's back stays: the
navigation bar's back button and the edge swipe on iOS, the back gesture on Android. No member
hides it, and the app does not hide it either. ${f.m('DetailPage')}'s ${f.p('DetailPage', 'onBack')}
is an action too, which the app implements by popping the same router.

The reference for the platform has two worked screens, a settings page and a list, and the store,
the route and the root around the list.

## 5. Install the theme at the root

| | SwiftUI | Compose |
| --- | --- | --- |
| Install the pairing | ${x(f, 'pmTheme', IOS_UI, '.', `(.${n.pairing})`)} on the root view | ${x(f, 'ProvidePMTheme', KOTLIN_UI, '', `(PMThemes.${n.pairing}) { … }`)}, which also gives Material 3 the pairing |
| Before the app installs one | \`PMTheme.default\`, which is \`.${n.pairing}\` | \`PMThemes.default\`, the same |
| Light and dark | Each colour resolves in the colour scheme it is drawn in. ${x(f, 'preferredColorScheme', IOS_TOKENS, '.preferredColorScheme(theme.', ')')} draws the pairing in its own mode. | The system's mode. ${x(f, 'preferredDark', KOTLIN_TOKENS, 'dark = theme.')} draws the pairing in its own mode. |

The packages carry each system worn with its default palette, named \`<system>_<palette>\`:
${n.pairings.map((name) => `\`.${name}\``).join(', ')}. \`PMTheme.named(system:palette:)\` and
\`PMThemes.named(system, palette)\` find one by its two names. The card's Theme section lists each
system with its kind. \`tenant\`, as on ${n.tenant.name}'s line, marks a system that takes a
designed system's axes with another brand's seeds. It says nothing about how an app gets it:
${n.tenant.name} is \`.${n.tenant.pairing}\` like the rest. A system worn with another palette is
not in the packages. On iOS a theme outside the catalogue arrives as a token document that a server
admits ([references/swiftui.md](references/swiftui.md)). The Kotlin and Dart token packages read
no documents, so Android and Flutter wear catalogue pairings only.

A pairing names three font families and carries no font files: \`theme.fonts.body\`, \`.display\`
and \`.mono\`, each with its \`family\`. Each is the web's family without the web's "Variable"
suffix, so read it from the pairing, not from the card. The app bundles the files: on iOS it adds
them to the app target and lists them under \`<key>UIAppFonts</key>\` in its Info.plist, and on
Android it provides ${x(f, 'LocalPMFontFamilies', KOTLIN_UI)}. Until it does, each type step uses
the system font in its slot's design.

The app sets the pairing, the mode, its fonts and its translations of the words the members write
by default, such as a dialog's "Close". It never overrides a member's colour, size or font, and
never installs a second pairing on part of a screen. ${f.m('DensityScope')} and
${f.m('ToneScope')} re-assign density and the inverse tone for a subtree, as on the web: the
\`polymorph-rules\` skill has the exception ladder, which holds on every platform.

## 6. Check your own work

\`check\` and \`validate\` lint web code and apply no rule to a \`.swift\` or \`.kt\` file. What
either prints about a native repository is not a result: a clean report says nothing about the
screen. \`check\` takes one directory, and \`validate\` takes files or a spec. Run these four
checks, in this order:

1. Build. A member the package does not draw, an action the store does not implement, an argument
   of the wrong type, and in Swift an argument out of the initialiser's order each fail to
   compile. The reference for the platform has the command.
2. Search the view files, not the store's or the route's, for what a screen may not write. The
   reference for the platform has the search. Replace each hit as the table below says.
3. Check the composition as a spec. Write the view's tree as a screen spec whose \`platform\` is
   \`ios\` or \`android\`, and run \`${run} validate orders.json --framework react\`. \`validate\`
   takes no \`--platform\` flag: the spec's own field carries the platform, and \`react\` is the
   one framework it accepts with a native spec. It needs no \`package.json\`. It names a member the
   platform lacks with its substitute, a part the platform lacks with the parts it has, a prop the
   member does not take, and a required prop left out.
4. Run the app in the simulator or an emulator when the session can, in light and dark mode, at a
   phone's width and at the largest text size.

| A hit | Write instead |
| --- | --- |
| A colour: \`Color(…)\`, \`.foregroundStyle(…)\`, \`MaterialTheme.colorScheme\` | A member's \`tone\` or \`variant\` |
| A layout container: \`VStack { }\`, \`HStack { }\`, \`Column { }\`, \`Row { }\` | ${all(['Stack', 'Inline', 'Grid'].map((name) => f.m(name)))} |
| A length: \`.padding(…)\`, \`.frame(…)\`, \`16.dp\`, \`Modifier.size(…)\` | Their spacing steps: ${all(f.shared(['Stack', 'Inline', 'Grid'], ['gap', 'p', 'px', 'py']))} |
| A font: \`.font(…)\`, \`fontSize = 20.sp\` | ${f.m('Heading')}'s ${f.p('Heading', 'level')}, ${f.m('Text')}'s ${f.p('Text', 'size')} and ${f.p('Text', 'tone')} |
| A platform control: \`Button(…)\`, \`Toggle(…)\`, \`TextField(…)\`, \`Picker(…)\`, Material's \`Switch(…)\` | The member: ${x(f, 'PMButton', IOS_UI)}, ${x(f, 'PMSwitch', IOS_UI)}, ${x(f, 'PMInput', IOS_UI)}, ${x(f, 'PMSelect', IOS_UI)} |
| An icon: \`Image(systemName:)\`, \`Icon(Icons.…)\` | ${x(f, 'PMIcon', IOS_UI)} with a role, or a member's \`icon\` |
| Motion: \`withAnimation\`, \`.animation(…)\`, \`animate…AsState\` | Nothing: members animate their own states |
| State, a task or navigation | The store and the route (step 4) |
| What no member draws | A ${x(f, 'PMBespoke', IOS_UI)} zone with its \`reason\`, drawn from the theme's tokens (the reference has one) |

The spec for check 3 spells each prop as the web does (\`aria-label\`, \`variant\` and \`tone\`),
writes a plain object such as an empty state as \`{ "$object": { … } }\`, and binds every value
the app supplies to an input. On a native archetype it may also bind \`onRetry\` to an action. The
\`polymorph-screen\` skill has the format. This is the list screen the references work, for iOS:

${listSpec('ios')}

## 7. Let a member behave like the platform's own control

A native member behaves like the same control in any other app on its platform, and the app does
not work around it. Do not wrap a member in modifiers that change its size, its tap area, its
colours or its behaviour. Do not swap a member for a UIKit view or a Material component to make it
behave otherwise. Where a member differs from its web rendering, the difference is decided: on
iOS ${f.m('DatePicker')} is SwiftUI's own date picker, and UIKit sets its tap area. When a screen
seems to need a member to behave otherwise, tell the person which member and what the screen
needs. The change belongs in a polymorph release.

## What you cannot do here

- Emit a native screen from a spec. \`emit\` writes only into a directory with a \`package.json\`
  or \`polymorph.json\`, and a native repository has neither, so write the view by hand in the
  contract's shape (step 4), and check its composition as a spec (step 6).
- Draw a native screen with the tools. \`render\` draws web specs in a browser.
- Change a member. \`add\` and \`update\` copy web members only. Never edit the package's copy
  (\`.build/checkouts/polymorph\`, Xcode's package cache or Gradle's): a change to a member is a
  polymorph release.
- Wear a theme outside the catalogue on Android or in Flutter.
`
  return [
    {
      path: 'polymorph-native/SKILL.md',
      contents: skill(
        'polymorph-native',
        'Build or change a SwiftUI or Jetpack Compose screen with the polymorph design ' +
          "system's native members, or add them to a new or existing iOS or Android app. Use " +
          'when Swift code imports PolymorphUI or PolymorphTokens, when Package.swift or an ' +
          'Xcode project names github.com/metamorph-labs/polymorph, when a Gradle build depends ' +
          'on com.github.metamorph-labs.polymorph (JitPack) or dev.polymorph and Kotlin imports ' +
          'dev.polymorph.ui, when pubspec.yaml names polymorph_tokens, or when asked to use ' +
          'polymorph on iOS, Android, SwiftUI, Compose or Flutter. Covers the Swift package and ' +
          'JitPack lines, the PM-prefixed names (PMButton, PMBadgeTone, PMDateRange) and where ' +
          'they are declared, the native screen contract (model, actions, a stateless view, ' +
          'four load states), a list screen (ListPage, FilterBar, DataTable) with its store and ' +
          'navigation, installing a pairing with pmTheme or ProvidePMTheme and its fonts, the ' +
          'members and parts a platform adapts or lacks, and checking a screen when no lint ' +
          'reads Swift or Kotlin.',
        body,
      ),
    },
    { path: 'polymorph-native/references/swiftui.md', contents: swiftReference(registry) },
    { path: 'polymorph-native/references/compose.md', contents: composeReference(registry) },
    { path: 'polymorph-native/references/flutter.md', contents: flutterReference(registry) },
  ]
}

/** SwiftUI: how a member is written, two worked screens, the app around them and other themes. */
function swiftReference(registry: Registry): string {
  const { f, pairing, version, renders } = nativeFacts(registry)
  const engine = PUBLISHED_NAMES['@polymorph/engine']
  const range = registry.packages['@polymorph/engine']
  if (engine === undefined || range === undefined) {
    throw new SkillFactError('the registry has no published name or range for @polymorph/engine')
  }
  return `# SwiftUI: members, two worked screens and the app around them

## Add the package

SwiftPM reads the package by the repository's URL, takes its version from the release tag, and
names it \`polymorph\`. A Swift package that holds an app's screens before the app exists is this
whole \`Package.swift\`, with its sources in \`Sources/AppScreens/\`:

\`\`\`swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "AppScreens",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "AppScreens", targets: ["AppScreens"])],
  dependencies: [
    .package(url: "${REPOSITORY}", from: "${version}"),
  ],
  targets: [
    .target(
      name: "AppScreens",
      dependencies: [
        .product(name: "PolymorphTokens", package: "polymorph"),
        .product(name: "PolymorphUI", package: "polymorph"),
      ]
    ),
  ]
)
\`\`\`

The \`platforms\` line is required: the libraries need iOS 17 or macOS 14, and SwiftPM refuses a
target that supports less. \`swift build\` compiles the package for the Mac. An existing package
adds the \`.package\` line and the two products to its own manifest.

An Xcode project with no \`Package.swift\` adds the package in Xcode: File › Add Package
Dependencies…, the URL above, Up to Next Major Version from ${version}, and both libraries on the
app's target. A package of screens is added with Add Local… in the same dialog. Xcode writes the
project file, so ask the person to take this step rather than editing \`project.pbxproj\`.

## How a member is written

A file imports PolymorphUI, and also PolymorphTokens where it names a
${x(f, 'PMTheme', IOS_TOKENS)}. A member is a view built from one value of its
props, \`PM<Member>(props: .init(…))\`. The initialiser takes the props as labelled arguments, in
the order it declares them: the order \`component\` lists the props in, with
\`appearance\` where \`tone\` would be, and \`loadStatus\` and \`onRetry\` first on a page
archetype. When the order is wrong, the compiler names the argument that must come first.

| On the web | In SwiftUI |
| --- | --- |
| A member, ${f.m('Button')} | \`PMButton(props: .init(label: "Save"))\`, whose props are ${x(f, 'PMButtonProps', IOS_CONTRACTS)} |
| A part, ${f.part('SettingsRow', 'Group')} | Nested in the member: \`PMSettingsRow.Group(props: .init(…))\`, whose props are ${x(f, 'PMSettingsRowGroupProps', IOS_CONTRACTS)}, as \`PMTable.Row(props: .init(…))\` takes ${x(f, 'PMTableRowProps', IOS_CONTRACTS)} |
| A string or a boolean | Itself: \`label: "Save"\`, \`disabled: true\` |
| A number | A Swift Double: \`lines: 2\`. A ${both(f, 'PMCalendarDate')}'s \`year\`, \`month\` and \`day\` are Doubles too. |
| A prop that takes one of a few words | A case of the enum \`PM<Member><Prop>\`: \`tone: .accent\` is a ${both(f, 'PMBadgeTone')}. A hyphenated word is camelCased: \`.codeBlock\`. |
| A size, an icon role, a spacing step, a sort direction | One enum every member shares: \`size: .sm\` is a ${x(f, 'PMControlSize', IOS_UI)}, \`icon: .add\` a ${both(f, 'PMIconRole')}, \`gap: .s5\` a ${both(f, 'PMSpaceStep')}, \`.desc\` a ${both(f, 'PMSortDirection')} |
| ${f.m('Grid')}'s \`columns={2}\` | \`columns: .columns2\` |
| ${f.m('Button')}'s ${f.v('Button', 'variant', 'outline')} with ${f.v('Button', 'tone', 'danger')} | \`appearance: .outlineDanger\`: ${x(f, 'PMButtonAppearance', IOS_UI)} holds only the lawful pairs |
| A child, or a prop that holds an element (\`control\`, \`trigger\`, \`actions\`) | ${x(f, 'PMContent', IOS_UI)}, SwiftUI's type-erased view: \`AnyView(…)\`, and several as \`AnyView(Group { … })\` |
| Words where an element goes, as ${f.m('Text')}'s children or a table cell's | SwiftUI's \`AnyView(Text("…"))\`, which takes the member's type step and colour. ${x(f, 'PMText', IOS_UI)} is for words with a size or tone of their own. |
| A callback, \`onClick\` | A \`@MainActor\` closure without the DOM event: \`onClick: actions.onSave\`, \`onChange: { value in … }\` |
| A value the app controls that may be null, as ${f.m('Select')}'s ${f.p('Select', 'value')} | \`T??\`, written \`.some(model.frequency)\`: given, \`nil\` included. Left out, the member holds the value itself. A value that cannot be null is passed as itself: \`value: model.query\`. |
| A data type, such as ${x(f, 'SelectOption', '@polymorph/react-ui')} or ${x(f, 'DateRange', '@polymorph/react-ui')} | \`PM\` and its name: \`.option(PMSelectOption(value: "now", label: "As they happen"))\`, \`PMDateRange(start:end:)\` of two \`PMCalendarDate(year:month:day:)\` |
| A member's props passed as a value, as ${f.m('ListPage')}'s ${f.p('ListPage', 'emptyState')} | That member's props struct: \`PMEmptyStateProps(icon: .search, title: "No orders match")\` |

## Where the declarations are

\`Generated/Contracts.swift\` in PolymorphUI declares every props struct with its initialiser,
every enum and every data type. \`PolymorphUI.swift\` beside it declares ${x(f, 'PMLoadStatus', IOS_UI)},
${x(f, 'PMControlSize', IOS_UI)} and ${x(f, 'PMContent', IOS_UI)}. A Swift package has them under
\`.build/checkouts/polymorph/platforms/ios/Sources/PolymorphUI/\` once it has resolved, and an
Xcode project under \`SourcePackages/checkouts/polymorph/\` in its DerivedData folder. Find the
file, then print a declaration whole, up to its closing brace:

\`\`\`sh
C=$(find . ~/Library/Developer/Xcode/DerivedData -path '*/checkouts/polymorph/platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift' 2>/dev/null | head -n 1)
sed -n '/^public struct PMListPageProps/,/^}/p' "$C"
sed -n '/^public enum PMBadgeTone/,/^}/p' "$C"
\`\`\`

## A worked screen: settings

This view compiles against the package at the release tag. It is the shape the screen contract
asks for, and the shape to write by hand.

\`\`\`swift
import PolymorphUI
import SwiftUI

/// What \`NotificationsView\` shows. \`loadStatus\` says which of the four load states it is in.
struct NotificationsModel {
  var loadStatus: PMLoadStatus
  /// Whether the morning digest is on.
  var digest: Bool
  var frequency: String?
  var frequencyOptions: [PMSelectOptionEntry]
}

/// The code the app supplies to \`NotificationsView\`, one closure per action.
struct NotificationsActions {
  let onDigestChange: @MainActor (Bool) -> Void
  let onFrequencyChange: @MainActor (String?) -> Void
  let onSignOut: @MainActor () -> Void
}

/// Which emails the person receives, and a way to sign out.
@MainActor
struct NotificationsView: View {
  let model: NotificationsModel
  let actions: NotificationsActions

  var body: some View {
    PMSettingsPage(
      props: .init(
        loadStatus: model.loadStatus,
        children: AnyView(
          Group {
            PMSettingsRow.Group(
              props: .init(
                children: AnyView(
                  Group {
                    PMSettingsRow(
                      props: .init(
                        control: AnyView(
                          PMSwitch(
                            props: .init(
                              checked: model.digest,
                              onCheckedChange: actions.onDigestChange
                            )
                          )
                        ),
                        description: "One email with what changed overnight.",
                        label: "Morning digest"
                      )
                    )
                    PMSettingsRow(
                      props: .init(
                        control: AnyView(
                          PMSelect(
                            props: .init(
                              onChange: actions.onFrequencyChange,
                              options: model.frequencyOptions,
                              value: .some(model.frequency)
                            )
                          )
                        ),
                        label: "Alerts"
                      )
                    )
                  }
                ),
                title: "Email"
              )
            )
            PMSettingsRow.Group(
              props: .init(
                children: AnyView(
                  PMSettingsRow(
                    props: .init(
                      control: AnyView(
                        PMButton(
                          props: .init(
                            label: "Sign out",
                            onClick: actions.onSignOut,
                            appearance: .outlineDanger
                          )
                        )
                      ),
                      label: "This device"
                    )
                  )
                ),
                title: "Account"
              )
            )
          }
        ),
        title: "Notifications"
      )
    )
  }
}

extension NotificationsActions {
  /// Every action doing nothing, so the app compiles before it wires its store.
  @MainActor static let inert: Self = Self(
    onDigestChange: { _ in },
    onFrequencyChange: { _ in },
    onSignOut: {}
  )
}
\`\`\`

## A worked screen: a list

A records screen is a ${f.m('ListPage')}. Its ${f.p('ListPage', 'filters')} hold a
${f.m('FilterBar')} with the search field in ${f.p('FilterBar', 'search')} and the other filters as
its children, and its body is a ${f.m('DataTable')}. On iOS ${f.m('DateRangePicker')} is
adapted: ${renders.rangeIos}. ${f.m('DataTable')} is adapted too: ${renders.tableIos}, a row's
cells stacked in the list. A tap on a row calls ${f.p('DataTable', 'onRowClick')} with the row.
This view is what the spec in the skill's step 6 describes, with \`onRetry\` bound as well.

\`\`\`swift
import PolymorphUI
import SwiftUI

/// What \`OrdersView\` shows. \`loadStatus\` says which of the four load states it is in.
struct OrdersModel {
  var loadStatus: PMLoadStatus
  /// Already searched and filtered.
  var orders: [Order]
  var columns: [PMDataTableColumn<Order>]
  var query: String
  var placed: PMDateRange?
  var isFiltered: Bool
}

/// The code the app supplies to \`OrdersView\`, one closure per action.
struct OrdersActions {
  let getRowId: @MainActor (Order) -> String
  let onOpenOrder: @MainActor (Order) -> Void
  let onQueryChange: @MainActor (String) -> Void
  let onPlacedChange: @MainActor (PMDateRange?) -> Void
  let onClearFilters: @MainActor () -> Void
  let onRetry: @MainActor () -> Void
}

/// Every order, searchable and filtered by the day it was placed; a tap opens one.
@MainActor
struct OrdersView: View {
  let model: OrdersModel
  let actions: OrdersActions

  var body: some View {
    PMListPage(
      props: .init(
        loadStatus: model.loadStatus,
        onRetry: actions.onRetry,
        children: AnyView(
          PMDataTable(
            props: .init(
              columns: model.columns,
              data: model.orders,
              emptyState: PMEmptyStateProps(icon: .inbox, title: "No orders yet"),
              getRowId: actions.getRowId,
              label: "Orders",
              onRowClick: actions.onOpenOrder
            )
          )
        ),
        emptyState: PMEmptyStateProps(
          icon: .search,
          secondaryAction: AnyView(
            PMButton(
              props: .init(
                label: "Clear filters",
                onClick: actions.onClearFilters,
                appearance: .ghostNeutral
              )
            )
          ),
          title: "No orders match these filters"
        ),
        filters: AnyView(
          PMFilterBar(
            props: .init(
              children: AnyView(
                PMDateRangePicker(
                  props: .init(
                    ariaLabel: "Placed between",
                    onChange: actions.onPlacedChange,
                    size: .sm,
                    value: .some(model.placed)
                  )
                )
              ),
              isFiltered: model.isFiltered,
              onClear: actions.onClearFilters,
              search: AnyView(
                PMSearchInput(
                  props: .init(
                    ariaLabel: "Search orders",
                    onChange: actions.onQueryChange,
                    size: .sm,
                    value: model.query
                  )
                )
              )
            )
          )
        ),
        title: "Orders"
      )
    )
  }
}

extension OrdersActions {
  /// Every action doing nothing, so the app compiles before it wires its store.
  @MainActor static let inert: Self = Self(
    getRowId: { _ in "" },
    onOpenOrder: { _ in },
    onQueryChange: { _ in },
    onPlacedChange: { _ in },
    onClearFilters: {},
    onRetry: {}
  )
}
\`\`\`

## The app around it

The store holds the model and supplies the actions, the root's navigation stack reads the router,
and the root starts the load. These are the app's own code, so state, tasks and
navigation live here.

\`\`\`swift
import Foundation
import Observation
import PolymorphTokens
import PolymorphUI
import SwiftUI

/// One order as the list shows it. The store formats its words before they reach the view.
struct Order {
  enum Status: String {
    case open, shipped, cancelled
  }

  let id: String
  let customer: String
  let status: Status
  /// The total as the person's locale writes it, such as "$1,204.00".
  let total: String
  let placedOn: PMCalendarDate
}

extension OrdersModel {
  /// The columns. A column's \`value\` is its cell's text, and \`cell\` draws a member in its place.
  static var columns: [PMDataTableColumn<Order>] {
    [
      PMDataTableColumn(key: "id", header: "Order", value: { $0.id }),
      PMDataTableColumn(key: "customer", header: "Customer", value: { $0.customer }),
      PMDataTableColumn(
        key: "status", header: "Status", value: { $0.status.rawValue.capitalized },
        cell: { order in
          AnyView(
            PMBadge(
              props: .init(
                children: order.status.rawValue.capitalized,
                tone: order.status == .open ? .accent : .neutral, variant: .soft)))
        }),
      PMDataTableColumn(key: "total", header: "Total", value: { $0.total }, numeric: true),
    ]
  }
}

/// Where the app can go.
enum Route: Hashable {
  case order(String)
}

/// The app's router: the path its root \`NavigationStack\` reads.
@MainActor @Observable
final class Router {
  var path: [Route] = []
}

@MainActor @Observable
final class OrdersStore {
  private(set) var model = OrdersModel(
    loadStatus: .loading, orders: [], columns: OrdersModel.columns, query: "", placed: nil,
    isFiltered: false)
  private var all: [Order] = []

  func actions(router: Router) -> OrdersActions {
    OrdersActions(
      getRowId: { $0.id },
      onOpenOrder: { router.path.append(.order($0.id)) },
      onQueryChange: { self.model.query = $0; self.refilter() },
      onPlacedChange: { self.model.placed = $0; self.refilter() },
      onClearFilters: { self.model.query = ""; self.model.placed = nil; self.refilter() },
      onRetry: { Task { await self.load() } }
    )
  }

  func load() async {
    model.loadStatus = .loading
    do {
      all = try await fetchOrders()
      refilter(settle: true)
    } catch {
      model.loadStatus = .failed(message: error.localizedDescription)
    }
  }

  /// Keeps the orders the query and the dates allow. Once loaded, the status is \`.empty\` only
  /// while a filter hides every order; with no orders at all it is \`.ready\`, and the table
  /// draws its own empty state.
  private func refilter(settle: Bool = false) {
    let day = { (date: PMCalendarDate) in date.year * 10_000 + date.month * 100 + date.day }
    let query = model.query
    let placed = model.placed
    model.isFiltered = !query.isEmpty || placed != nil
    model.orders = all.filter { order in
      (query.isEmpty || order.customer.localizedCaseInsensitiveContains(query))
        && (placed.map { day($0.start) <= day(order.placedOn) && day(order.placedOn) <= day($0.end) }
          ?? true)
    }
    if settle || model.loadStatus == .ready || model.loadStatus == .empty {
      model.loadStatus = model.orders.isEmpty && model.isFiltered ? .empty : .ready
    }
  }

  private func fetchOrders() async throws -> [Order] {
    [
      Order(
        id: "1042", customer: "Dana Ruiz", status: .open,
        total: Decimal(1204).formatted(.currency(code: "USD")),
        placedOn: PMCalendarDate(year: 2026, month: 3, day: 18))
    ]
  }
}

struct RootView: View {
  @State private var router = Router()
  @State private var orders = OrdersStore()
  let theme = PMTheme.${pairing}

  var body: some View {
    NavigationStack(path: $router.path) {
      OrdersView(model: orders.model, actions: orders.actions(router: router))
        .task { await orders.load() }
        .navigationDestination(for: Route.self) { route in
          switch route {
          case .order(let id): Text(id)  // the order's own route, whose root is a DetailPage
          }
        }
    }
    .pmTheme(theme)
    .preferredColorScheme(theme.preferredColorScheme)
  }
}
\`\`\`

An app framed by ${f.m('AppShell')} has no \`NavigationStack(path:) { … }\` of its own: the
shell draws its content in a navigation stack that takes no path, so the root adds
\`.navigationDestination(item:)\` to that content, bound to the order the router holds.

The store formats money and dates before they reach the model, with Foundation's formatters in the
person's locale: a column's \`value\`, a ${f.m('Badge')}'s words and a ${f.m('Stat')}'s value are
text. A column with \`numeric: true\` draws its figures as the system draws numbers, at the side of
the column it decides. A ${both(f, 'PMCalendarDate')} holds Doubles, so the store converts it to
and from a Foundation date itself. A view under no \`.pmTheme(_:)\` draws under
\`PMTheme.default\`. The words the members write by default, such as a dialog's "Close" or a
page's "Try again", are looked up in the app's string catalog, so the app translates them there.

A pairing's fonts are drawn when they are installed: the app adds the font files to its target and
lists each under \`<key>UIAppFonts</key>\` in its Info.plist. The family a file declares must equal
the pairing's \`theme.fonts.body.family\` (and \`.display\`, \`.mono\`). Until then each type step
uses the system font in its slot's design.

## What no member draws

A ${x(f, 'PMBespoke', IOS_UI)} zone declares it, with the reason a reviewer reads. Inside, the view
reads the pairing from the environment and draws with its tokens, and keeps every accessibility
rule.

\`\`\`swift
import PolymorphUI
import SwiftUI

struct Flagged: View {
  @Environment(\\.pmTheme) private var theme

  var body: some View {
    PMBespoke(
      props: .init(
        children: AnyView(
          Circle().fill(theme.colors.accentBg.color)
            .frame(width: theme.defaultDensity.space.s6, height: theme.defaultDensity.space.s6)
            .accessibilityHidden(true)
        ),
        reason: "Unread marker: the vocabulary has no dot that is not a Badge."
      )
    )
  }
}
\`\`\`

## Check the view

Build: \`swift build\` in a Swift package, or
\`xcodebuild -scheme <App> -destination 'generic/platform=iOS Simulator' build\` in an Xcode
project. Then search each view's file, and not the store's or the route's, for what a screen may
not write, and replace each hit as the skill's table says:

\`\`\`sh
grep -nE 'Color[(.]|foregroundStyle|\\.background\\(|\\.font\\(|\\.padding\\(|\\.frame\\(|cornerRadius|withAnimation|\\.animation\\(|systemName|@State|@Environment|\\.task|Task \\{|NavigationLink|NavigationStack|navigationDestination|[HVZ]Stack|Spacer\\(|(^|[^A-Za-z])(Button|Toggle|TextField|Picker)\\(' OrdersView.swift
\`\`\`

\`AnyView(Text("…"))\` is lawful: it is words handed to a member.

## A theme outside the catalogue

The device does not run the theme engine. A server admits the system and palette under the same
laws the catalogue meets, and sends the app a token document for iOS. The server, a Node project,
installs the engine under the name the code imports:

\`\`\`sh
npm install @polymorph/engine@npm:${engine}@${range}
\`\`\`

\`\`\`ts
import { admitTheme, emitTokenDocumentJSON } from '@polymorph/engine'

const admission = admitTheme({ system, palette })
if (!admission.lawful) throw new Error(admission.faults.map((fault) => fault.message).join('\\n'))
const body = emitTokenDocumentJSON(admission.resolved, { platform: 'ios' })
// admission.fonts lists the families the app bundles
\`\`\`

The app reads it into a pairing, and keeps the default while the document is unavailable:

\`\`\`swift
import Foundation
import PolymorphTokens

func documentTheme(_ data: Data) -> PMTheme {
  do {
    return try PMTheme(tokenDocument: data)
  } catch {
    return .default
  }
}
\`\`\`

The initialiser throws a ${x(f, 'PMTokenDocumentError', IOS_TOKENS)} that names the problem: a
document of another format or platform, a value missing or of the wrong kind at its path, or a hit
target under 44 points. ${x(f, 'admitTheme', '@polymorph/engine')} and
${x(f, 'emitTokenDocumentJSON', '@polymorph/engine')} run in Node, on the server, not in the app.
`
}

/** Compose: how a member is written, two worked screens, the app around them and what it provides. */
function composeReference(registry: Registry): string {
  const { f, pairing, tag, renders } = nativeFacts(registry)
  const local = (name: string) => x(f, name, KOTLIN_UI)
  // The enums the table writes as `prop = PMEnum.Entry`, held to their Kotlin declarations.
  for (const name of ['PMIconRole', 'PMSpaceStep', 'PMSortDirection', 'PMGridColumns']) {
    f.x(name, KOTLIN_CONTRACTS)
  }
  f.x('PMButtonAppearance', KOTLIN_CONTRACTS)
  f.x('PMSelectOptionEntry', KOTLIN_CONTRACTS)
  return `# Compose: members, two worked screens and the app around them

## Add the modules

JitPack builds the two Gradle modules from the release tag: \`tokens\`, plain Kotlin with each
catalogue pairing as a \`PMTheme\`, and \`ui\`, the members on Compose Multiplatform, published with
an Android library and a JVM variant:

\`\`\`kotlin
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
    implementation("com.github.metamorph-labs.polymorph:tokens:${tag}")
    implementation("com.github.metamorph-labs.polymorph:ui:${tag}")
}
\`\`\`

The app module compiles against API 37 (\`compileSdk = 37\`), because the Compose libraries \`ui\`
brings require it. JitPack builds a tag the first time an app asks for it, which takes some
minutes. A repository that holds a checkout of polymorph at the tag, or a git submodule of it,
includes the build instead (the last section).

## How a member is written

A file imports each name from \`dev.polymorph.ui\`, and pairings from \`dev.polymorph.tokens\`. A
member is a composable that takes its props as named arguments, in any order. A required argument
without a default, such as \`label\` on \`PMButton\`, must be given.

| On the web | In Compose |
| --- | --- |
| A member, ${f.m('Button')} | \`PMButton(label = "Save")\`, whose props are ${x(f, 'PMButtonProps', KOTLIN_CONTRACTS)} |
| A part, ${f.part('SettingsRow', 'Group')} | ${x(f, 'PMSettingsRowGroup', KOTLIN_MEMBERS)}: the member's name and the part's, joined, as ${x(f, 'PMTableRow', KOTLIN_MEMBERS)} |
| A string or a boolean | Itself: \`label = "Save"\`, \`disabled = true\` |
| A number | A Kotlin Double: \`lines = 2.0\`. A ${both(f, 'PMCalendarDate')}'s \`year\`, \`month\` and \`day\` are Doubles too. |
| A prop that takes one of a few words | An entry of the enum \`PM<Member><Prop>\`, PascalCased: \`tone = PMBadgeTone.Accent\` |
| A size, an icon role, a spacing step, a sort direction | One enum every member shares: \`size = PMControlSize.Sm\`, \`icon = PMIconRole.Add\`, \`gap = PMSpaceStep.S6\`, \`direction = PMSortDirection.Desc\` |
| ${f.m('Grid')}'s \`columns={4}\` | \`columns = PMGridColumns.Columns4\` |
| ${f.m('Button')}'s ${f.v('Button', 'variant', 'outline')} with ${f.v('Button', 'tone', 'danger')} | \`appearance = PMButtonAppearance.OutlineDanger\`, one of the lawful pairs |
| A child | The trailing lambda: \`PMCard { … }\` |
| A prop that holds an element (\`control\`, \`actions\`, \`search\`) | A \`@Composable\` lambda: \`control = { PMSwitch(…) }\` |
| Words where an element goes, as ${f.m('Text')}'s children or a table cell's | Material's \`Text("…")\`, which takes the style the member provides. ${x(f, 'PMText', KOTLIN_MEMBERS)} is for words with a size or tone of their own. |
| A callback | A function without the DOM event. A required action binds as a reference, \`onClick = actions::onSignOut\`, and an optional one as itself, \`onRetry = actions.onRetry\` |
| A value the app controls that may be null, as ${f.m('Select')}'s ${f.p('Select', 'value')} | \`value = PMSome(model.frequency)\`: given, \`null\` included. Left out, the member holds the value itself. A value that cannot be null is passed as itself: \`value = model.query\`. |
| A data type, such as ${x(f, 'SelectOption', '@polymorph/react-ui')} or ${x(f, 'DateRange', '@polymorph/react-ui')} | \`PM\` and its name: \`PMSelectOptionEntry.Option(PMSelectOption(value = "now", label = "As they happen"))\`, \`PMDateRange(start, end)\` of two \`PMCalendarDate(year = 2026.0, month = 3.0, day = 18.0)\` |
| A member's props passed as a value, as ${f.m('ListPage')}'s ${f.p('ListPage', 'emptyState')} | That member's props class: \`PMEmptyStateProps(title = "No orders match")\` |

${x(f, 'PMSome', KOTLIN_UI)} tells a value that is given as null from a value left out. A prop
named \`as\` is written between backticks in Kotlin, because \`as\` is a keyword there.

## Where the declarations are

\`Members.kt\` declares every member's and part's composable with its arguments, and
\`Contracts.kt\` every props class, enum and data type, both in
\`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/\`. \`PolymorphUI.kt\` in
\`platforms/android/ui/src/main/kotlin/dev/polymorph/ui/\` declares ${local('PMLoadStatus')},
${local('PMSome')}, ${local('PMControlSize')} and ${local('PMContent')}, and the
\`PolymorphUI*.kt\` files beside it the composition locals. An app on JitPack has the compiled
modules only: an IDE opens a declaration, or the files are in the repository at the release tag,
under \`${REPOSITORY}/tree/${tag}/platforms/android/ui/src\`. With a checkout beside the app, print
a declaration whole:

\`\`\`sh
K=../polymorph/platforms/android/ui/src/generated/kotlin/dev/polymorph/ui
sed -n '/^fun PMListPage(/,/^)/p' "$K/Members.kt"
sed -n '/^enum class PMBadgeTone(/,/^}/p' "$K/Contracts.kt"
\`\`\`

## A worked screen: settings

This file compiles against the package at the release tag. It is the shape the screen contract
asks for, and the shape to write by hand.

\`\`\`kotlin
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

/** What \`NotificationsScreen\` shows. \`loadStatus\` says which of the four load states it is in. */
data class NotificationsModel(
    val loadStatus: PMLoadStatus,
    /** Whether the morning digest is on. */
    val digest: Boolean,
    val frequency: String?,
    val frequencyOptions: List<PMSelectOptionEntry>,
) {
    companion object
}

/** The code the app supplies to \`NotificationsScreen\`, one function per action. */
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
\`\`\`

## A worked screen: a list

A records screen is a ${f.m('ListPage')}. Its ${f.p('ListPage', 'filters')} hold a
${f.m('FilterBar')} with the search field in ${f.p('FilterBar', 'search')} and the other filters as
its children, and its body is a ${f.m('DataTable')}. On Android ${f.m('DateRangePicker')} is
Material's own date range picker. ${f.m('DataTable')} is adapted: ${renders.tableAndroid}, a row's
cells stacked in the list. A tap on a row calls ${f.p('DataTable', 'onRowClick')} with the row.
This screen is what the spec in the skill's step 6 describes, for \`"platform": "android"\` and with
\`onRetry\` bound as well.

\`\`\`kotlin
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

/** What \`OrdersScreen\` shows. \`loadStatus\` says which of the four load states it is in. */
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

/** The code the app supplies to \`OrdersScreen\`, one function per action. */
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
\`\`\`

## The app around it

The store is an AndroidX ViewModel that holds the model, implements the actions and opens screens
through the app's router. The route collects the model and starts the load, and the root provides
the pairing. These are the app's own code, so coroutines, state and navigation live here.

\`\`\`kotlin
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

/** The columns. A column's \`value\` is its cell's text, and \`cell\` draws a member in its place. */
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
     * status is \`Empty\` only while a filter hides every order; with no orders at all it is
     * \`Ready\`, and the table draws its own empty state.
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
    val theme = PMThemes.${pairing}
    ProvidePMTheme(theme, dark = theme.preferredDark) {
        OrdersRoute(store)
    }
}
\`\`\`

The store needs \`androidx.lifecycle\` and \`kotlinx.coroutines\`. The router here is a back stack
the root reads. An app on Navigation Compose keeps its navigation controller in the router instead:
\`open\` calls \`navController.navigate(…)\`, and the root's \`NavHost(…) { … }\` draws each route inside
${local('ProvidePMTheme')}, where the system's back gesture pops it. The store formats money and
dates before they reach the model, in the person's locale: a column's \`value\`, a
${f.m('Badge')}'s words and a ${f.m('Stat')}'s value are text. A column with \`numeric = true\` draws its figures as the system draws numbers, at the side of
the column it decides. A ${both(f, 'PMCalendarDate')} holds Doubles, so the store converts it to and from
its own date type. ${local('ProvidePMTheme')} also gives Material 3 the pairing, so the app's own
Material components match the members. A composable under none draws under
${x(f, 'PMThemes', KOTLIN_CATALOGUE, '', '.default')} in the system's mode.

## What the app provides

The members read these from the composition. Provide each that the screen's members need, at the
root, with \`CompositionLocalProvider(…)\`:

| Composition local | What it is | Without it |
| --- | --- | --- |
| ${local('LocalPMStrings')} | The app's translations of the words the members write by default | English |
| ${local('LocalPMFontFamilies')} | A function from each of the pairing's fonts, a ${x(f, 'PMFont', KOTLIN_TOKENS)}, to a Compose font family built from the files the app bundles for its \`family\`, or null | The system font in the slot's design |
| ${local('LocalPMImageLoader')} | A painter for a picture's URL, from the app's image loader | Each member draws its fallback |
| ${local('LocalPMFilePicker')} | The platform's document picker, for file upload and attaching | A dropzone opens nothing, and a prompt has no attach button |
| ${local('LocalPMImageEncoder')} | Writes an edited image as a file | The image editor's confirm hands nothing over |
| ${local('LocalPMToday')} | The person's date, for calendars and relative times | The date in UTC |

A link opens through Compose's \`LocalUriHandler.current\`, or through a member's \`onNavigate\` when the
app routes its own paths.

## What no member draws

A ${x(f, 'PMBespoke', IOS_UI)} zone declares it, with the reason a reviewer reads. Inside, the
composable reads the pairing through \`PM.theme\` and draws with its tokens, and keeps every
accessibility rule.

\`\`\`kotlin
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
\`\`\`

\`.color\` resolves a colour role in the mode the members draw in. ${x(f, 'PM', KOTLIN_UI, '', '.theme')}
is the pairing the root provided.

## Check the screen

Build: \`./gradlew :app:compileDebugKotlin\`. Then search each screen's file, and not the store's
or the route's, for what a screen may not write, and replace each hit as the skill's table says:

\`\`\`sh
grep -nE 'Color\\(|\\.dp([^A-Za-z]|$)|\\.sp([^A-Za-z]|$)|MaterialTheme|Modifier\\.|animate[A-Z]|remember|mutableStateOf|LaunchedEffect|navigate\\(|NavHost|Icons\\.|(^|[^A-Za-z])(Column|Row|Box|Spacer|Button|Switch|TextField|Icon)\\(' OrdersScreen.kt
\`\`\`

Material's \`Text("…")\` inside a member is lawful: it is words handed to the member.

## A checkout instead of JitPack

A repository that holds a checkout of polymorph at the release tag, or a git submodule of it,
includes the Gradle build and depends on the modules by their own names:

\`\`\`kotlin
// settings.gradle.kts
includeBuild("../polymorph/platforms/android")

// app/build.gradle.kts
dependencies {
    implementation("dev.polymorph:tokens")
    implementation("dev.polymorph:ui")
}
\`\`\`

The included build runs on the app's Gradle, which is 9.5 or a later 9.x release, and compiles the
members. That compile runs out of memory at Gradle's default heap, so the app's
\`gradle.properties\` sets \`org.gradle.jvmargs=-Xmx4g\` and \`kotlin.daemon.jvmargs=-Xmx4g\`.
`
}

/** Flutter and Dart: the token package, and how its values map to Flutter's types. */
function flutterReference(registry: Registry): string {
  const { f, pairing, tag } = nativeFacts(registry)
  const dart = (name: string) => x(f, name, DART)
  return `# Flutter and Dart: the tokens only

Polymorph has no Flutter members. The Dart package polymorph_tokens holds each catalogue pairing
as a \`const PMTheme\` of plain Dart values, with no dependencies, Flutter included. A Flutter app
reads the same decisions the native members read, and builds its own widgets from them: the
colours in light and dark, the type steps, spacing, radii, shadows and motion. Nothing in polymorph
checks those widgets. The members, the screen contract and the red rules do not reach Flutter, so
the widgets keep the rule by hand: every colour, length, font and duration comes from the pairing.

## Add the package

The package lives in a directory of the repository, so a Flutter app depends on it by git at the
release tag:

\`\`\`yaml
dependencies:
  polymorph_tokens:
    git:
      url: ${REPOSITORY}.git
      path: platforms/dart
      ref: ${tag}
\`\`\`

An app that holds a checkout of polymorph, or a git submodule of it, depends on it by path
instead: \`path: ../polymorph/platforms/dart\`.

## Read a pairing

\`\`\`dart
import 'package:polymorph_tokens/polymorph_tokens.dart';

const theme = PMThemes.${pairing};
final density = theme.defaultDensity; // the density the system's axes select
final accent = theme.colors.accentBg.resolve(isDark: false); // a PMRgba
final gutter = density.space[4];
final body = theme.text.md; // size, lineHeight, tracking, weight
final duration = theme.defaultMotion.duration.control; // milliseconds
\`\`\`

\`PMThemes.named(system, palette)\` finds a pairing by name, and \`PMThemes.catalogue\` lists them.
A colour role resolves for a mode with \`resolve(isDark:)\`, so the app passes the platform's
brightness.

## Map a value to Flutter

| Value | In Flutter |
| --- | --- |
| A colour, ${dart('PMRgba')} | \`Color(rgba.argb)\` |
| A length: \`space[4]\`, \`radius.control\`, \`controlHeight.md\` | The \`double\` itself, in logical pixels |
| A type step's \`lineHeight\` | \`TextStyle.height\` |
| A type step's \`tracking\`, in em | \`letterSpacing: tracking * size\` |
| A duration, in milliseconds | \`Duration(milliseconds: …)\` |
| ${dart('PMEasing')} | \`Cubic(x1, y1, x2, y2)\` |
| ${dart('PMSpring')} | \`SpringDescription(mass: s.mass, stiffness: s.stiffness, damping: s.damping)\` |

The hit target, \`density.hitTarget\`, is 48 at every density, Flutter's minimum interactive size. A
widget shorter than it keeps its drawn height and extends its tap area to it, as Material's
\`MaterialTapTargetSize.padded\` does. The pairing names its font families and does not carry the
files, so the app bundles the fonts it uses.
`
}
