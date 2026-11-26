# SwiftUI: members, a worked screen and the app around it

## Add the package

SwiftPM reads the package by the repository's URL, takes its version from the release tag, and
names it `polymorph`:

```swift
// Package.swift
dependencies: [
  .package(url: "https://github.com/metamorph-labs/polymorph", from: "1.0.18"),
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
```

An Xcode project with no `Package.swift` adds the package in Xcode: File › Add Package
Dependencies…, the URL above, Up to Next Major Version from 1.0.18, and both libraries on the
app's target. Xcode writes the project file, so ask the person to take this step rather than
editing `project.pbxproj`.

## How a member is written

A file imports PolymorphUI, and also PolymorphTokens where it names a
`PMTheme`. A member is a view built from one value of its
props, `PM<Member>(props: .init(…))`. The initialiser takes the props as labelled arguments, in
the order it declares them: the order `component` lists the props in, with
`appearance` where `tone` would be, and `loadStatus` and `onRetry` first on a page
archetype. The generated `Contracts.swift` declares every initialiser. In a Swift package it is
`.build/checkouts/polymorph/platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift`. When
the order is wrong, the compiler names the argument that must come first.

| On the web | In SwiftUI |
| --- | --- |
| A member, `Button` | `PMButton(props: .init(label: "Save"))` |
| A part, `SettingsRow.Group` | `PMSettingsRow.Group(props: .init(…))` |
| A string or a boolean | Itself: `label: "Save"`, `disabled: true` |
| A number | A Swift Double: `lines: 2` |
| A literal value | A case: `size: .sm`, `type: .submit`, `icon: .add`, `tone: .accent` |
| A spacing step, `gap={5}` | `gap: .s5` |
| `Grid`'s `columns={2}` | `columns: .columns2` |
| `Button`'s `variant="outline"` with `tone="danger"` | `appearance: .outlineDanger`: `PMButtonAppearance` holds only the lawful pairs |
| A child, or a prop that holds an element (`control`, `trigger`, `actions`) | `PMContent`, SwiftUI's type-erased view: `AnyView(…)`, and several as `AnyView(Group { … })` |
| Words where an element goes, as `Text`'s children | `AnyView(Text("…"))` |
| A callback, `onClick` | A `@MainActor` closure without the DOM event: `onClick: actions.onSave`, `onChange: { value in … }` |
| A value the app controls that may be null, as `Select`'s `value` | `.some(model.frequency)`: given, `nil` included. Left out, the member holds the value itself. |
| A data type, such as `SelectOption` | `PM` and its name: `.option(PMSelectOption(value: "now", label: "As they happen"))` |

## A worked screen

This view compiles against the package at the release tag. It is the shape the screen contract
asks for, and the shape to write by hand.

```swift
import PolymorphUI
import SwiftUI

/// What `NotificationsView` shows. `loadStatus` says which of the four load states it is in.
struct NotificationsModel {
  var loadStatus: PMLoadStatus
  /// Whether the morning digest is on.
  var digest: Bool
  var frequency: String?
  var frequencyOptions: [PMSelectOptionEntry]
}

/// The code the app supplies to `NotificationsView`, one closure per action.
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
```

## The app around it

The store holds the model and supplies the actions, the route shows the view and starts the load,
and the root installs the pairing. These are the app's own code, so state and tasks live here.

```swift
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
  let theme = PMTheme.plain_neutral

  var body: some View {
    NotificationsRoute()
      .pmTheme(theme)
      .preferredColorScheme(theme.preferredColorScheme)
  }
}
```

A view under no `.pmTheme(_:)` draws under `PMTheme.default`. The words the members write by
default, such as a dialog's "Close" or a page's "Try again", are looked up in the app's string
catalog, so the app translates them there. A pairing names its font families: the app bundles the
files and registers them, and until it does each type step uses the system font.

## What no member draws

A `PMBespoke` zone declares it, with the reason a reviewer reads. Inside, the view
reads the pairing from the environment and draws with its tokens, and keeps every accessibility
rule.

```swift
import PolymorphUI
import SwiftUI

struct Flagged: View {
  @Environment(\.pmTheme) private var theme

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
```

## Check the view

Search the view's file for what a screen may not write, and replace each hit as the skill's table
says:

```sh
grep -nE 'Color[(.]|foregroundStyle|\.background\(|\.font\(|\.padding\(|\.frame\(|cornerRadius|withAnimation|\.animation\(|systemName|@State|@Environment|\.task|Task \{|NavigationLink|[HVZ]Stack|Spacer\(|(^|[^A-Za-z])(Button|Toggle|TextField|Picker)\(' NotificationsView.swift
```

`AnyView(Text("…"))` is lawful: it is words handed to a member. Then build: `swift build` in a
Swift package, or `xcodebuild -scheme <App> -destination 'generic/platform=iOS Simulator' build`
in an Xcode project.

## A tenant's theme

The device does not run the theme engine. A server admits the tenant's system and palette under
the same laws the catalogue meets, and sends the app a token document for iOS. The server, a Node
project, installs the engine under the name the code imports:

```sh
npm install @polymorph/engine@npm:@metamorph-labs/polymorph-engine@^1.0.18
```

```ts
import { admitTheme, emitTokenDocumentJSON } from '@polymorph/engine'

const admission = admitTheme({ system, palette })
if (!admission.lawful) throw new Error(admission.faults.map((fault) => fault.message).join('\n'))
const body = emitTokenDocumentJSON(admission.resolved, { platform: 'ios' })
// admission.fonts lists the families the app bundles
```

The app reads it into a pairing, and keeps the default while the document is unavailable:

```swift
import Foundation
import PolymorphTokens

func tenantTheme(_ data: Data) -> PMTheme {
  do {
    return try PMTheme(tokenDocument: data)
  } catch {
    return .default
  }
}
```

The initialiser throws a `PMTokenDocumentError` that names the problem: a
document of another format or platform, a value missing or of the wrong kind at its path, or a hit
target under 44 points. `admitTheme` and
`emitTokenDocumentJSON` run in Node, on the server, not in the app.
