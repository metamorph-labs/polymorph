// swift-tools-version: 5.9
// The Swift package an app adds by this repository's URL:
//
//   .package(url: "https://github.com/metamorph-labs/polymorph", from: "<version>")
//
// SwiftPM reads a package added by URL from the repository's root, and takes
// its version from the release tag. The sources live in `platforms/ios`, whose
// own `Package.swift` also holds the tests and the example app that
// `pnpm gate:ios` builds; this manifest names the same two libraries over the
// same sources and nothing else, so an app that resolves it compiles no test or
// example. The law in `packages/native/src/swift-package.test.ts` holds the two
// manifests' platforms, products and library targets to each other.

import PackageDescription

let package = Package(
  name: "Polymorph",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "PolymorphTokens", targets: ["PolymorphTokens"]),
    .library(name: "PolymorphUI", targets: ["PolymorphUI"]),
  ],
  targets: [
    .target(name: "PolymorphTokens", path: "platforms/ios/Sources/PolymorphTokens"),
    .target(
      name: "PolymorphUI",
      dependencies: ["PolymorphTokens"],
      path: "platforms/ios/Sources/PolymorphUI"
    ),
  ]
)
