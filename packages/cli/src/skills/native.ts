import { NO_SUBSTITUTE, PUBLISHED_NAMES, type Registry } from '@polymorph/registry'

import { DEFAULT_SYSTEM } from '../plan'
import { all, commands, Facts, skill, SkillFactError, type SkillFile } from './facts'

/** Where the native names the texts cite are declared, below the repository root. */
const IOS_UI = 'platforms/ios/Sources/PolymorphUI'
const IOS_TOKENS = 'platforms/ios/Sources/PolymorphTokens'
const KOTLIN_UI = 'platforms/android/ui/src/main/kotlin'
const KOTLIN_MEMBERS = 'platforms/android/ui/src/generated/kotlin'
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

/** A slug as the native packages spell it: `deep-sea` is `deepSea`. */
const camel = (slug: string): string =>
  slug.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

/** What every native text reads from the registry. */
function nativeFacts(registry: Registry) {
  const f = new Facts(registry)
  const pairings = registry.theme.systems.map(
    (system) => `${camel(system.name)}_${camel(system.defaultPalette)}`,
  )
  const plain = registry.theme.systems.find((system) => system.name === DEFAULT_SYSTEM)
  const pairing = `${camel(DEFAULT_SYSTEM)}_${camel(plain?.defaultPalette ?? '')}`
  if (!pairings.includes(pairing)) throw new SkillFactError(`no catalogue pairing ${pairing}`)
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
  return {
    f,
    version: registry.version,
    tag: `v${registry.version}`,
    pairing,
    pairings,
    grid,
    adapted: { name: adapted.name, as: adapted.platforms.ios.as ?? '' },
    absent: { name: absent.name, substitute: absent.platforms.ios.substitute as string },
    archetypes: f.tier('archetypes').filter((name) => name !== 'AppShell'),
  }
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
| None of these | Add the packages | step 2 |

## 2. Add the packages at a release

The packages are released at the git tag \`${tag}\`, and every line the references give names
that release. A newer release is the same lines with its version.

| Platform | What the app adds | The lines |
| --- | --- | --- |
| iOS 17 or macOS 14 and later | One Swift package by the repository's URL, \`${REPOSITORY}\`, with two libraries: PolymorphTokens, each catalogue pairing as a ${x(f, 'PMTheme', IOS_TOKENS)}, and PolymorphUI, the members | [references/swiftui.md](references/swiftui.md) |
| Android | Two Gradle modules that JitPack builds from the tag, \`com.github.metamorph-labs.polymorph:tokens:${tag}\` and \`com.github.metamorph-labs.polymorph:ui:${tag}\`, or the same modules from a checkout of polymorph | [references/compose.md](references/compose.md) |
| Flutter or Dart | The tokens only: polymorph has no Flutter members | [references/flutter.md](references/flutter.md) |

## 3. Read the vocabulary for the platform

The polymorph tools run from a shell with Node.js 24 or later. Every command starts with the same
words:

${commands(run, 'card --framework react --platform ios', 'search date --framework react --platform android', 'component DatePicker --framework react')}

\`card\` prints every member with its props, its variant and tone pairs and its parts, then the
icon roles and a Platforms section. \`--framework react\` names the whole vocabulary by its spec's
names, and \`--platform\` (\`ios\` or \`android\`) leaves out the members absent there. \`search\`
finds members by what they do. \`component\` prints one member's props with their types and
defaults, its parts and states, and under "Where it renders" a line per platform. A
\`polymorph/system-card.md\` in the repository is the web card. An MCP server named \`polymorph\`
answers the same through \`get_system_card\` and \`search_components\`, given \`framework\` and
\`platform\`, and \`get_component\`.

A member's line under "Where it renders" says one of three things:

| The line says | What to do |
| --- | --- |
| native | Use the member as the card lists it. |
| adapted | Use it the same way. It renders as the line says, such as ${f.m(n.adapted.name)} on iOS: ${n.adapted.as}. The member chooses by the device, so the screen never branches on it. |
| absent | Use the substitute the line names, such as ${f.m(n.absent.substitute)} for ${f.m(n.absent.name)}. Where it names none, the screen goes without it, or the need goes in a ${f.m('Bespoke')} zone (step 6). |

The props are the web's. A hyphenated name is camelCased (\`aria-label\` is \`ariaLabel\`), a
callback is called without the web's DOM event, and ${all(n.grid.map((name) => f.m(name)))} take
\`variant\` and \`tone\` as one \`appearance\`, a lawful pair. The reference for the platform has
the whole mapping.

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
   states. \`loading\` draws skeleton rows. \`failed\` draws a danger alert with the message, with
   "Try again" when the archetype's \`onRetry\` is set. \`empty\` draws ${f.m('ListPage')}'s or
   ${f.m('SearchPage')}'s ${f.p('ListPage', 'emptyState')}, and draws as \`ready\` elsewhere.
2. It holds no state: no \`@State\` or \`@Environment\`, no \`remember\` or \`mutableStateOf\`. A
   member keeps its own state, such as a field's draft or an open sheet.
3. It calls nothing asynchronous: no \`.task\` or \`Task { }\`, no \`LaunchedEffect(…)\`. The route
   that shows the view starts the load.
4. It navigates nowhere: no \`NavigationLink(…)\` and no \`navigate(…)\`. Opening something is an
   action the app implements.
5. It names no theme and no token.

${f.m('AppShell')} is the app's frame around its router, never a screen's root. The reference for
the platform has a worked screen with its store and its route.

## 5. Install the theme at the root

| | SwiftUI | Compose |
| --- | --- | --- |
| Install the pairing | ${x(f, 'pmTheme', IOS_UI, '.', `(.${n.pairing})`)} on the root view | ${x(f, 'ProvidePMTheme', KOTLIN_UI, '', `(PMThemes.${n.pairing}) { … }`)}, which also gives Material 3 the pairing |
| Before the app installs one | \`PMTheme.default\`, which is \`.${n.pairing}\` | \`PMThemes.default\`, the same |
| Light and dark | Each colour resolves in the colour scheme it is drawn in. ${x(f, 'preferredColorScheme', IOS_TOKENS, '.preferredColorScheme(theme.', ')')} draws the pairing in its own mode. | The system's mode. ${x(f, 'preferredDark', KOTLIN_TOKENS, 'dark = theme.')} draws the pairing in its own mode. |

The packages carry each system worn with its default palette:
${n.pairings.map((name) => `\`.${name}\``).join(', ')}. \`axes\` lists the systems and the font
families each names. The app bundles those fonts, and until it does each type step falls back to
the system font. A tenant's theme, outside the catalogue, reaches an iOS app as a token document
that a server admits ([references/swiftui.md](references/swiftui.md)). The Kotlin and Dart token
packages read no documents, so Android and Flutter wear catalogue pairings only.

The app sets the pairing, the mode, its fonts and its translations of the words the members write
by default, such as a dialog's "Close". It never overrides a member's colour, size or font, and
never installs a second pairing on part of a screen. ${f.m('DensityScope')} and
${f.m('ToneScope')} re-assign density and the inverse tone for a subtree, as on the web: the
\`polymorph-rules\` skill has the exception ladder, which holds on every platform.

## 6. Check your own work

No polymorph tool reads Swift or Kotlin. The red rules lint web code, \`validate\` checks no
\`.swift\` or \`.kt\` file, and \`check\` reads 0 files in a native repository. Three checks
remain, and you run them:

1. Build. A member the package does not draw, an action the store does not implement, and in
   Swift an argument out of the initialiser's order each fail to compile.
2. Search the view's file, not the store's, for what a screen may not write. The reference for the
   platform has the search. Replace each hit:

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

3. Run the app in the simulator or an emulator when the session can, in light and dark mode, at a
   phone's width and at the largest text size.

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
  contract's shape (step 4). A spec whose \`platform\` is \`ios\` or \`android\` can still be
  checked against that platform's members: \`${run} validate screen.json --framework react\`
  (the \`polymorph-screen\` skill has the format).
- Draw a native screen with the tools. \`render\` draws web specs in a browser.
- Change a member. \`add\` and \`update\` copy web members only. Never edit the package's copy
  (\`.build/checkouts/polymorph\`, Xcode's package cache or Gradle's): a change to a member is a
  polymorph release.
- Wear a tenant's theme on Android or in Flutter.
`
  return [
    {
      path: 'polymorph-native/SKILL.md',
      contents: skill(
        'polymorph-native',
        'Build or change a SwiftUI or Jetpack Compose screen with the polymorph design ' +
          "system's native members, or add them to an iOS or Android app. Use when Swift code " +
          'imports PolymorphUI or PolymorphTokens, when Package.swift or an Xcode project names ' +
          'github.com/metamorph-labs/polymorph, when a Gradle build depends on ' +
          'com.github.metamorph-labs.polymorph (JitPack) or dev.polymorph and Kotlin imports ' +
          'dev.polymorph.ui, when pubspec.yaml names polymorph_tokens, or when asked to use ' +
          'polymorph on iOS, Android, SwiftUI, Compose or Flutter. Covers the Swift package and ' +
          'JitPack dependency lines, the PM-prefixed members (PMButton) and how their props map, ' +
          'the native screen contract (model, actions, a stateless view, four load states), ' +
          'installing a pairing with pmTheme or ProvidePMTheme, a tenant theme on iOS, the ' +
          'members a platform adapts or lacks, and checking a screen when no lint reads Swift ' +
          'or Kotlin.',
        body,
      ),
    },
    { path: 'polymorph-native/references/swiftui.md', contents: swiftReference(registry) },
    { path: 'polymorph-native/references/compose.md', contents: composeReference(registry) },
    { path: 'polymorph-native/references/flutter.md', contents: flutterReference(registry) },
  ]
}

/** SwiftUI: how a member is written, a worked screen, the app around it and a tenant's theme. */
function swiftReference(registry: Registry): string {
  const { f, pairing, version } = nativeFacts(registry)
  const engine = PUBLISHED_NAMES['@polymorph/engine']
  const range = registry.packages['@polymorph/engine']
  if (engine === undefined || range === undefined) {
    throw new SkillFactError('the registry has no published name or range for @polymorph/engine')
  }
  return `# SwiftUI: members, a worked screen and the app around it

## Add the package

SwiftPM reads the package by the repository's URL, takes its version from the release tag, and
names it \`polymorph\`:

\`\`\`swift
// Package.swift
dependencies: [
  .package(url: "${REPOSITORY}", from: "${version}"),
],
targets: [
  .target(
    name: "App",
    dependencies: [
      .product(name: "PolymorphTokens", package: "polymorph"),
      .product(name: "PolymorphUI", package: "polymorph"),
    ]
  ),
]
\`\`\`

An Xcode project with no \`Package.swift\` adds the package in Xcode: File › Add Package
Dependencies…, the URL above, Up to Next Major Version from ${version}, and both libraries on the
app's target. Xcode writes the project file, so ask the person to take this step rather than
editing \`project.pbxproj\`.

## How a member is written

A file imports PolymorphUI, and also PolymorphTokens where it names a
${x(f, 'PMTheme', IOS_TOKENS)}. A member is a view built from one value of its
props, \`PM<Member>(props: .init(…))\`. The initialiser takes the props as labelled arguments, in
the order it declares them: the order \`component\` lists the props in, with
\`appearance\` where \`tone\` would be, and \`loadStatus\` and \`onRetry\` first on a page
archetype. The generated \`Contracts.swift\` declares every initialiser. In a Swift package it is
\`.build/checkouts/polymorph/platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift\`. When
the order is wrong, the compiler names the argument that must come first.

| On the web | In SwiftUI |
| --- | --- |
| A member, ${f.m('Button')} | \`PMButton(props: .init(label: "Save"))\` |
| A part, ${f.part('SettingsRow', 'Group')} | \`PMSettingsRow.Group(props: .init(…))\` |
| A string or a boolean | Itself: \`label: "Save"\`, \`disabled: true\` |
| A number | A Swift Double: \`lines: 2\` |
| A literal value | A case: \`size: .sm\`, \`type: .submit\`, \`icon: .add\`, \`tone: .accent\` |
| A spacing step, \`gap={5}\` | \`gap: .s5\` |
| ${f.m('Grid')}'s \`columns={2}\` | \`columns: .columns2\` |
| ${f.m('Button')}'s ${f.v('Button', 'variant', 'outline')} with ${f.v('Button', 'tone', 'danger')} | \`appearance: .outlineDanger\`: ${x(f, 'PMButtonAppearance', IOS_UI)} holds only the lawful pairs |
| A child, or a prop that holds an element (\`control\`, \`trigger\`, \`actions\`) | ${x(f, 'PMContent', IOS_UI)}, SwiftUI's type-erased view: \`AnyView(…)\`, and several as \`AnyView(Group { … })\` |
| Words where an element goes, as ${f.m('Text')}'s children | \`AnyView(Text("…"))\` |
| A callback, \`onClick\` | A \`@MainActor\` closure without the DOM event: \`onClick: actions.onSave\`, \`onChange: { value in … }\` |
| A value the app controls that may be null, as ${f.m('Select')}'s ${f.p('Select', 'value')} | \`.some(model.frequency)\`: given, \`nil\` included. Left out, the member holds the value itself. |
| A data type, such as ${x(f, 'SelectOption', '@polymorph/react-ui')} | \`PM\` and its name: \`.option(PMSelectOption(value: "now", label: "As they happen"))\` |

## A worked screen

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

## The app around it

The store holds the model and supplies the actions, the route shows the view and starts the load,
and the root installs the pairing. These are the app's own code, so state and tasks live here.

\`\`\`swift
import Observation
import PolymorphTokens
import PolymorphUI
import SwiftUI

@MainActor @Observable
final class NotificationsStore {
  private(set) var model = NotificationsModel(
    loadStatus: .loading,
    digest: false,
    frequency: nil,
    frequencyOptions: [
      .option(PMSelectOption(value: "now", label: "As they happen")),
      .option(PMSelectOption(value: "hourly", label: "Once an hour")),
    ]
  )

  var actions: NotificationsActions {
    NotificationsActions(
      onDigestChange: { self.model.digest = $0 },
      onFrequencyChange: { self.model.frequency = $0 },
      onSignOut: { /* the app's own sign-out */ }
    )
  }

  func load() async {
    model.loadStatus = .loading
    do {
      model.digest = try await fetchDigest()
      model.loadStatus = .ready
    } catch {
      model.loadStatus = .failed(message: error.localizedDescription)
    }
  }

  private func fetchDigest() async throws -> Bool { true }
}

struct NotificationsRoute: View {
  @State private var store = NotificationsStore()

  var body: some View {
    NotificationsView(model: store.model, actions: store.actions)
      .task { await store.load() }
  }
}

struct RootView: View {
  let theme = PMTheme.${pairing}

  var body: some View {
    NotificationsRoute()
      .pmTheme(theme)
      .preferredColorScheme(theme.preferredColorScheme)
  }
}
\`\`\`

A view under no \`.pmTheme(_:)\` draws under \`PMTheme.default\`. The words the members write by
default, such as a dialog's "Close" or a page's "Try again", are looked up in the app's string
catalog, so the app translates them there. A pairing names its font families: the app bundles the
files and registers them, and until it does each type step uses the system font.

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

Search the view's file for what a screen may not write, and replace each hit as the skill's table
says:

\`\`\`sh
grep -nE 'Color[(.]|foregroundStyle|\\.background\\(|\\.font\\(|\\.padding\\(|\\.frame\\(|cornerRadius|withAnimation|\\.animation\\(|systemName|@State|@Environment|\\.task|Task \\{|NavigationLink|[HVZ]Stack|Spacer\\(|(^|[^A-Za-z])(Button|Toggle|TextField|Picker)\\(' NotificationsView.swift
\`\`\`

\`AnyView(Text("…"))\` is lawful: it is words handed to a member. Then build: \`swift build\` in a
Swift package, or \`xcodebuild -scheme <App> -destination 'generic/platform=iOS Simulator' build\`
in an Xcode project.

## A tenant's theme

The device does not run the theme engine. A server admits the tenant's system and palette under
the same laws the catalogue meets, and sends the app a token document for iOS. The server, a Node
project, installs the engine under the name the code imports:

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

func tenantTheme(_ data: Data) -> PMTheme {
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

/** Compose: how a member is written, a worked screen, the app around it and what it provides. */
function composeReference(registry: Registry): string {
  const { f, pairing, tag } = nativeFacts(registry)
  const local = (name: string) => x(f, name, KOTLIN_UI)
  return `# Compose: members, a worked screen and the app around it

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
without a default, such as \`label\` on \`PMButton\`, must be given. The generated \`Members.kt\`
declares every composable. An IDE shows its parameters, and a checkout of polymorph has it at
\`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/Members.kt\`.

| On the web | In Compose |
| --- | --- |
| A member, ${f.m('Button')} | \`PMButton(label = "Save")\` |
| A part, ${f.part('SettingsRow', 'Group')} | ${x(f, 'PMSettingsRowGroup', KOTLIN_MEMBERS)}: the member's name and the part's, joined |
| A string or a boolean | Itself: \`label = "Save"\`, \`disabled = true\` |
| A number | A Kotlin Double: \`lines = 2.0\` |
| A literal value | An enum: \`size = PMControlSize.Sm\`, \`icon = PMIconRole.Add\` |
| A spacing step, \`gap={6}\` | \`gap = PMSpaceStep.S6\` |
| ${f.m('Grid')}'s \`columns={4}\` | \`columns = PMGridColumns.Columns4\` |
| ${f.m('Button')}'s ${f.v('Button', 'variant', 'outline')} with ${f.v('Button', 'tone', 'danger')} | \`appearance = PMButtonAppearance.OutlineDanger\`, one of the lawful pairs |
| A child | The trailing lambda: \`PMCard { … }\` |
| A prop that holds an element (\`control\`, \`actions\`, \`search\`) | A \`@Composable\` lambda: \`control = { PMSwitch(…) }\` |
| Words where an element goes, as ${f.m('Text')}'s children | Material's \`Text("…")\`, which takes the style the member provides |
| A callback | A function without the DOM event. A required action binds as a reference, \`onClick = actions::onSignOut\`, and an optional one as itself, \`onRetry = actions.onRetry\` |
| A value the app controls that may be null, as ${f.m('Select')}'s ${f.p('Select', 'value')} | \`value = PMSome(model.frequency)\`: given, \`null\` included. Left out, the member holds the value itself. |
| A data type, such as ${x(f, 'SelectOption', '@polymorph/react-ui')} | \`PM\` and its name: \`PMSelectOptionEntry.Option(PMSelectOption(value = "now", label = "As they happen"))\` |

${x(f, 'PMSome', KOTLIN_UI)} tells a value that is given as null from a value left out. A prop
named \`as\` is written between backticks in Kotlin, because \`as\` is a keyword there.

## A worked screen

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

## The app around it

The store is an AndroidX ViewModel that holds the model and implements the actions. The route collects
the model and starts the load, and the root provides the pairing. These are the app's own code, so
coroutines and state live here.

\`\`\`kotlin
package com.example.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import dev.polymorph.tokens.PMThemes
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMSelectOption
import dev.polymorph.ui.PMSelectOptionEntry
import dev.polymorph.ui.ProvidePMTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

val NotificationsModel.Companion.placeholder: NotificationsModel
    get() = NotificationsModel(
        loadStatus = PMLoadStatus.Loading,
        digest = false,
        frequency = null,
        frequencyOptions = listOf(
            PMSelectOptionEntry.Option(PMSelectOption(value = "now", label = "As they happen")),
            PMSelectOptionEntry.Option(PMSelectOption(value = "hourly", label = "Once an hour")),
        ),
    )

class NotificationsStore : ViewModel(), NotificationsActions {
    private val state = MutableStateFlow(NotificationsModel.placeholder)
    val model: StateFlow<NotificationsModel> = state.asStateFlow()

    override fun onDigestChange(next: Boolean) = state.update { it.copy(digest = next) }
    override fun onFrequencyChange(value: String?) = state.update { it.copy(frequency = value) }
    override fun onSignOut() { /* the app's own sign-out */ }

    suspend fun load() {
        state.update { it.copy(loadStatus = PMLoadStatus.Loading) }
        try {
            val digest = fetchDigest()
            state.update { it.copy(digest = digest, loadStatus = PMLoadStatus.Ready) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            state.update { it.copy(loadStatus = PMLoadStatus.Failed(error.message.orEmpty())) }
        }
    }

    private suspend fun fetchDigest(): Boolean = true
}

@Composable
fun NotificationsRoute(store: NotificationsStore) {
    val model by store.model.collectAsState()
    LaunchedEffect(store) { store.load() }
    NotificationsScreen(model = model, actions = store)
}

@Composable
fun App(store: NotificationsStore) {
    val theme = PMThemes.${pairing}
    ProvidePMTheme(theme, dark = theme.preferredDark) {
        NotificationsRoute(store)
    }
}
\`\`\`

The store needs \`androidx.lifecycle\` and \`kotlinx.coroutines\`. ${local('ProvidePMTheme')}
also gives Material 3 the pairing, so the app's own Material components match the members. A
composable under none draws under ${x(f, 'PMThemes', KOTLIN_CATALOGUE, '', '.default')} in the
system's mode.

## What the app provides

The members read these from the composition. Provide each that the screen's members need, at the
root, with \`CompositionLocalProvider(…)\`:

| Composition local | What it is | Without it |
| --- | --- | --- |
| ${local('LocalPMStrings')} | The app's translations of the words the members write by default | English |
| ${local('LocalPMFontFamilies')} | The font files for the families the pairing names | The system font |
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

Search the screen's file for what a screen may not write, and replace each hit as the skill's
table says:

\`\`\`sh
grep -nE 'Color\\(|\\.dp([^A-Za-z]|$)|\\.sp([^A-Za-z]|$)|MaterialTheme|Modifier\\.|animate[A-Z]|remember|mutableStateOf|LaunchedEffect|navigate\\(|Icons\\.|(^|[^A-Za-z])(Column|Row|Box|Spacer|Button|Switch|TextField|Icon)\\(' NotificationsScreen.kt
\`\`\`

Material's \`Text("…")\` inside a member is lawful: it is words handed to the member. Then build:
\`./gradlew :app:compileDebugKotlin\`.

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
