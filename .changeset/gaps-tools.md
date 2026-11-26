---
'@polymorph/tools': patch
'@polymorph/mcp': patch
'@polymorph/cli': patch
'@polymorph/theme': patch
'@polymorph/engine': patch
---

`polymorph emit` and the MCP tool `emit_screen` write a native screen into a native repository. A
directory with no `package.json` or `polymorph.json` that holds a `Package.swift`, a `.xcodeproj`
or `.xcworkspace` bundle, or `settings.gradle(.kts)` or `build.gradle(.kts)` is a project for that
platform's screens: an iOS project takes a `.swift` emit and an Android project a `.kt` one. A web
screen, the other platform's screen, an install, a theme and a fix are refused there, each with a
sentence that says where it belongs. Such a repository used to refuse every write, so a native app
could emit its screens only from a checkout with `pnpm emit`. The `polymorph-native` skill now
gives the emit command first, and keeps writing a view by hand for what a spec cannot say.

`polymorph theme propose` and `propose_theme` read `<axis>=<value>`, such as `geometry=crisp`, and
set the axis to that value, from the axes and values `polymorph axes` lists. It combines with
ordinary words, and the later of two that name one axis wins. An axis or a value the catalogue
does not have moves nothing and is reported with the lawful ones. A word of degree (slightly,
somewhat, bit, little, very, much, less) is reported as not read instead of being skipped without
a trace: "slightly rounded" still sets the roundest geometry, and the answer now says that
"slightly" moved nothing. The answer gains `unread`, each word in `unmapped` that the table read
and could not apply with why; `unmapped` now holds those words too.

`polymorph theme hue <colour>` prints a colour written as a palette writes one (`#rrggbb`, or
`rgb(r g b / a)`) in OKLCH, and the `accentHue` a palette takes from it in whole degrees; `--json`
prints `{ color, l, c, h, accentHue }`. A grey has no hue, and the answer says so. The engine
exports the reading it uses, `oklchOf`, from `@polymorph/engine` and `@polymorph/theme`.
