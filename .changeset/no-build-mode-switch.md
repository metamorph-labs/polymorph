---
'@polymorph/engine': patch
'@polymorph/elements-ui': patch
---

**On a page with no build, `<poly-mode-switch>` shows the mode the page wears.** On a first
visit to a page wearing `terminal`, which opens dark, it shows Dark where it showed System. On a
page wearing a system that follows the device it shows System, and after a reader's choice it
shows that choice, as before. A page whose preference is System now follows the device's mode
when it changes, where it kept the mode it loaded with until the next load. A page needs no
change: `polymorph update` copies the new `polymorph.js` and `polymorph-all.js`.

- `hydrateMode(modes)` in `@polymorph/engine/runtime` is the mode step of `hydrateTheme` alone.
  It takes each system's `defaultMode`, applies the stored choice or else the worn system's
  default, which it does not store, and follows the device while the preference is `system`. It
  reads no stored system or palette and judges none stale. `hydrateTheme` is unchanged.
- `polymorph.js` and `polymorph-all.js` call it as they run, with the house systems' default
  modes, the map `prepaint.js` carries. A system the house catalogue does not hold follows the
  device on such a page, in the pre-paint script and in the switch.
- A page that loads `polymorph.js` now fetches the theme runtime's mode code at load, about 1 kB
  gzipped, which only a page with a `<poly-mode-switch>` fetched before.
