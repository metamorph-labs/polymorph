---
'@polymorph/engine': patch
'@polymorph/elements-ui': patch
'@polymorph/tools': patch
'@polymorph/native': patch
---

**A system's `defaultMode` now decides the mode of a reader who has not chosen one.** A guest
system whose document says `"defaultMode": "light"` or `"dark"` opens a first visit in that mode,
where it followed the device before. To keep following the device, write
`"defaultMode": "system"` in the system document. A reader's own choice (`setMode`, a
`ModeSwitch`) is stored and wins, as before.

- Every house system that said `light` now says `system`, so it follows the device on a first
  visit, as it did. `terminal` says `dark`, and a first visit to a page wearing it opens dark.
- `hydrateTheme(fallbackSystem, installed)` applies the worn system's default when no mode is
  stored, and no longer stores a mode on the first hydration. `InstalledCatalogue` takes an
  optional `modes`, each system's `defaultMode`; without it every system follows the device. A
  reader for whom an earlier release stored `system` on the first hydration keeps following the
  device. `setSystem` moves an unchosen mode to the new system's default. `getModePreference`,
  `readMode`, `useMode` and `ModeSwitch` show the default as the current preference.
- `prepaintScript({ modes, system })` in `@polymorph/engine/runtime` builds the pre-paint script
  for a page that knows its systems' default modes, so a system that opens dark does not paint
  light first. `PREPAINT_SCRIPT` stays the script that follows the device. The Vite plugin
  (`@polymorph/engine/vite`) inlines the built script, and `virtual:polymorph/theme`'s `catalogue`
  carries `modes`.
- `polymorph add theme:<system>` and `polymorph update` build the script from the installed
  systems' documents, patch it into `index.html`, and write it as `themes/prepaint.ts`, which a
  Next.js root layout imports in place of `PREPAINT_SCRIPT`. The theme module's catalogue carries
  `modes`. Run `polymorph update` to take both.
- `prepaint.js` for a page with no build, and the page `polymorph init --framework elements`
  writes, carry the house systems' default modes. Nothing on such a page calls `hydrateTheme`, so
  a `<poly-mode-switch>` there shows System until the reader chooses.
- On iOS and Android, `theme.preferredColorScheme` and `theme.preferredDark` read the same field,
  so they are `nil` and null for every house pairing but `terminal_petrol`. An app that passes the
  preferred mode for one of them follows the device where it was held light.
