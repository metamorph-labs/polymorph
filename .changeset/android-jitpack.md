---
'@polymorph/native': patch
---

The Android library can be added as a dependency. JitPack builds `platforms/android` from a
release tag of this repository (`jitpack.yml`) and serves `com.github.metamorph-labs.polymorph:tokens`
and `com.github.metamorph-labs.polymorph:ui` at that tag, with Gradle module metadata, so an
Android app resolves the Android library and a desktop app the `jvm` one. An app adds
`maven("https://jitpack.io")` to its repositories. Including the build from a checkout still works,
with the modules' own `dev.polymorph` coordinates. The 1.0.18 tag predates `jitpack.yml`, so the
first tag JitPack builds is the next release's; until then a commit on `main` that holds it can be
named by its short id. `pnpm gate:android` builds the modules as JitPack does
(`scripts/android-publish.mjs`).
