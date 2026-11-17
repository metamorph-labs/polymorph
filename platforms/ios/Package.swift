// swift-tools-version: 5.9
// The pairings' tokens as Swift values, and the vocabulary's members rendered
// from them.
//
// `Sources/PolymorphTokens/PMTheme.swift` is written by hand;
// `Sources/PolymorphTokens/Generated/` is written by `pnpm emit:native` at the
// repository root and never edited by hand.
//
// `Sources/PolymorphUI` holds the members: the foundation (`PolymorphUI.swift`)
// and one file per member by hand, `Generated/` (the contracts every member
// satisfies) by `pnpm native:contracts`. `pnpm gate:ios` checks both targets.
//
// `Examples/` holds apps' own code around screens the Swift emitter wrote, as
// targets no product exports: `RelayExample` is Relay's inbox and new-ticket
// form, emitted from `Examples/Relay/Screens/` by `pnpm emit:examples`, with
// the stores that wire them, and `RelayExampleTests` renders each in its states.

import PackageDescription

let package = Package(
  name: "PolymorphTokens",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "PolymorphTokens", targets: ["PolymorphTokens"]),
    .library(name: "PolymorphUI", targets: ["PolymorphUI"]),
  ],
  targets: [
    .target(name: "PolymorphTokens"),
    .target(name: "PolymorphUI", dependencies: ["PolymorphTokens"]),
    .testTarget(name: "PolymorphTokensTests", dependencies: ["PolymorphTokens"]),
    .testTarget(name: "PolymorphUITests", dependencies: ["PolymorphUI", "PolymorphTokens"]),
    .target(
      name: "RelayExample",
      dependencies: ["PolymorphUI"],
      path: "Examples/Relay/Sources/RelayExample"
    ),
    .testTarget(
      name: "RelayExampleTests",
      dependencies: ["RelayExample", "PolymorphUI", "PolymorphTokens"],
      path: "Examples/Relay/Tests/RelayExampleTests"
    ),
  ]
)
