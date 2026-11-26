# SwiftUI: members, two worked screens and the app around them

## Add the package

SwiftPM reads the package by the repository's URL, takes its version from the release tag, and
names it `polymorph`. A Swift package that holds an app's screens before the app exists is this
whole `Package.swift`, with its sources in `Sources/AppScreens/`:

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "AppScreens",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "AppScreens", targets: ["AppScreens"])],
  dependencies: [
    .package(url: "https://github.com/metamorph-labs/polymorph", from: "1.0.18"),
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
```

The `platforms` line is required: the libraries need iOS 17 or macOS 14, and SwiftPM refuses a
target that supports less. `swift build` compiles the package for the Mac. An existing package
adds the `.package` line and the two products to its own manifest.

An Xcode project with no `Package.swift` adds the package in Xcode: File › Add Package
Dependencies…, the URL above, Up to Next Major Version from 1.0.18, and both libraries on the
app's target. A package of screens is added with Add Local… in the same dialog. Xcode writes the
project file, so ask the person to take this step rather than editing `project.pbxproj`.

## How a member is written

A file imports PolymorphUI, and also PolymorphTokens where it names a
`PMTheme`. A member is a view built from one value of its
props, `PM<Member>(props: .init(…))`. The initialiser takes the props as labelled arguments, in
the order it declares them: the order `component` lists the props in, with
`appearance` where `tone` would be, and `loadStatus` and `onRetry` first on a page
archetype. When the order is wrong, the compiler names the argument that must come first.

| On the web | In SwiftUI |
| --- | --- |
| A member, `Button` | `PMButton(props: .init(label: "Save"))`, whose props are `PMButtonProps` |
| A part, `SettingsRow.Group` | Nested in the member: `PMSettingsRow.Group(props: .init(…))`, whose props are `PMSettingsRowGroupProps`, as `PMTable.Row(props: .init(…))` takes `PMTableRowProps` |
| A string or a boolean | Itself: `label: "Save"`, `disabled: true` |
| A number | A Swift Double: `lines: 2`. A `PMCalendarDate`'s `year`, `month` and `day` are Doubles too. |
| A prop that takes one of a few words | A case of the enum `PM<Member><Prop>`: `tone: .accent` is a `PMBadgeTone`. A hyphenated word is camelCased: `.codeBlock`. |
| A size, an icon role, a spacing step, a sort direction | One enum every member shares: `size: .sm` is a `PMControlSize`, `icon: .add` a `PMIconRole`, `gap: .s5` a `PMSpaceStep`, `.desc` a `PMSortDirection` |
| `Grid`'s `columns={2}` | `columns: .columns2` |
| `Button`'s `variant="outline"` with `tone="danger"` | `appearance: .outlineDanger`: `PMButtonAppearance` holds only the lawful pairs |
| A child, or a prop that holds an element (`control`, `trigger`, `actions`) | `PMContent`, SwiftUI's type-erased view: `AnyView(…)`, and several as `AnyView(Group { … })` |
| Words where an element goes, as `Text`'s children or a table cell's | SwiftUI's `AnyView(Text("…"))`, which takes the member's type step and colour. `PMText` is for words with a size or tone of their own. |
| A callback, `onClick` | A `@MainActor` closure without the DOM event: `onClick: actions.onSave`, `onChange: { value in … }` |
| A value the app controls that may be null, as `Select`'s `value` | `T??`, written `.some(model.frequency)`: given, `nil` included. Left out, the member holds the value itself. A value that cannot be null is passed as itself: `value: model.query`. |
| A data type, such as `SelectOption` or `DateRange` | `PM` and its name: `.option(PMSelectOption(value: "now", label: "As they happen"))`, `PMDateRange(start:end:)` of two `PMCalendarDate(year:month:day:)` |
| A member's props passed as a value, as `ListPage`'s `emptyState` | That member's props struct: `PMEmptyStateProps(icon: .search, title: "No orders match")` |

## Where the declarations are

`Generated/Contracts.swift` in PolymorphUI declares every props struct with its initialiser,
every enum and every data type. `PolymorphUI.swift` beside it declares `PMLoadStatus`,
`PMControlSize` and `PMContent`. A Swift package has them under
`.build/checkouts/polymorph/platforms/ios/Sources/PolymorphUI/` once it has resolved, and an
Xcode project under `SourcePackages/checkouts/polymorph/` in its DerivedData folder. Find the
file, then print a declaration whole, up to its closing brace:

```sh
C=$(find . ~/Library/Developer/Xcode/DerivedData -path '*/checkouts/polymorph/platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift' 2>/dev/null | head -n 1)
sed -n '/^public struct PMListPageProps/,/^}/p' "$C"
sed -n '/^public enum PMBadgeTone/,/^}/p' "$C"
```

## A worked screen: settings

This view compiles against the package at the release tag. It is the shape `emit` writes from a
spec, and the shape a view written by hand keeps.

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

## A worked screen: a list

A records screen is a `ListPage`. Its `filters` hold a
`FilterBar` with the search field in `search` and the other filters as
its children, and its body is a `DataTable`. On iOS `DateRangePicker` is
adapted: two date fields, one range calendar; a sheet on iPhone, anchored on iPad. `DataTable` is adapted too: a list on iPhone, a table on iPad, a row's
cells stacked in the list. A tap on a row calls `onRowClick` with the row.
`emit` writes this view, apart from its comments, from the spec in the skill's step 6 with
`onRetry` bound as well.

```swift
import PolymorphUI
import SwiftUI

/// What `OrdersView` shows. `loadStatus` says which of the four load states it is in.
struct OrdersModel {
  var loadStatus: PMLoadStatus
  /// Already searched and filtered.
  var orders: [Order]
  var columns: [PMDataTableColumn<Order>]
  var query: String
  var placed: PMDateRange?
  var isFiltered: Bool
}

/// The code the app supplies to `OrdersView`, one closure per action.
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
```

## The app around it

The store holds the model and supplies the actions, the root's navigation stack reads the router,
and the root starts the load. These are the app's own code, so state, tasks and
navigation live here.

```swift
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
  /// The columns. A column's `value` is its cell's text, and `cell` draws a member in its place.
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

/// The app's router: the path its root `NavigationStack` reads.
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

  /// Keeps the orders the query and the dates allow. Once loaded, the status is `.empty` only
  /// while a filter hides every order; with no orders at all it is `.ready`, and the table
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
  let theme = PMTheme.plain_neutral

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
```

An app framed by `AppShell` has no `NavigationStack(path:) { … }` of its own: the
shell draws its content in a navigation stack that takes no path, so the root adds
`.navigationDestination(item:)` to that content, bound to the order the router holds.

The store formats money and dates before they reach the model, with Foundation's formatters in the
person's locale: a column's `value`, a `Badge`'s words and a `Stat`'s value are
text. A column with `numeric: true` draws its figures as the system draws numbers, at the side of
the column it decides. A `PMCalendarDate` holds Doubles, so the store converts it to
and from a Foundation date itself. A view under no `.pmTheme(_:)` draws under
`PMTheme.default`. The words the members write by default, such as a dialog's "Close" or a
page's "Try again", are looked up in the app's string catalog, so the app translates them there.

A pairing's fonts are drawn when they are installed: the app adds the font files to its target and
lists each under `<key>UIAppFonts</key>` in its Info.plist. The family a file declares must equal
the pairing's `theme.fonts.body.family` (and `.display`, `.mono`). Until then each type step
uses the system font in its slot's design.

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

Build: `swift build` in a Swift package, or
`xcodebuild -scheme <App> -destination 'generic/platform=iOS Simulator' build` in an Xcode
project. Then search each view's file, and not the store's or the route's, for what a screen may
not write, and replace each hit as the skill's table says:

```sh
grep -nE 'Color[(.]|foregroundStyle|\.background\(|\.font\(|\.padding\(|\.frame\(|cornerRadius|withAnimation|\.animation\(|systemName|@State|@Environment|\.task|Task \{|NavigationLink|NavigationStack|navigationDestination|[HVZ]Stack|Spacer\(|(^|[^A-Za-z])(Button|Toggle|TextField|Picker)\(' OrdersView.swift
```

`AnyView(Text("…"))` is lawful: it is words handed to a member.

## A theme outside the catalogue

The device does not run the theme engine. A server admits the system and palette under the same
laws the catalogue meets, and sends the app a token document for iOS. The server, a Node project,
installs the engine under the name the code imports:

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

func documentTheme(_ data: Data) -> PMTheme {
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
