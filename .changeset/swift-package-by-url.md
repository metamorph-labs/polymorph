---
'@polymorph/native': patch
---

An iOS app can add the Swift package by the repository's URL, at a release tag, instead of
through a checkout or a git submodule:
`.package(url: "https://github.com/metamorph-labs/polymorph", from: "1.0.18")`, with the products
`PolymorphTokens` and `PolymorphUI` from the package `polymorph`. A dependency by path on
`platforms/ios` still works and offers the same libraries.

The Android builds (`dev.polymorph:tokens`, `dev.polymorph:ui`) and the Dart package
(`polymorph_tokens`) now declare the release's version instead of `1.0.0`.
