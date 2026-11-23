---
'@polymorph/elements-ui': patch
---

The elements draw a screen a model writes, a `polymorph-screen/1` document, at run time with no
build. `@polymorph/elements-ui` now depends on `@polymorph/screen`, the run-time core every renderer
shares. Nothing changes for a page that draws no screen.

- `<poly-screen>` draws its `spec` property, its `text` property (a model's answer so far) or the
  JSON in its `<script type="application/json">` child, with `data`, `streaming`, `members` and
  `faults` (`hidden` or `inline`). It dispatches `poly-action` (`{ name, args, values }`; a listener
  hands the member a promise with `event.waitUntil`) and `poly-fault` (`{ path, message, component
  }`), and has `values` and `check()`. It draws no box of its own.
- `@polymorph/elements-ui/screen`, for an app with a bundler, defines `<poly-screen>` and every
  element, each loading its member's code when it first renders, and exports `drawScreen`,
  `parsePartial`, `checkScreen`, `runtimeCard` and `outputContract`, bound to the members the
  elements draw.
- `polymorph.js` and `polymorph-all.js` define `<poly-screen>` and export `loadScreen()`, which
  resolves to the same functions. `polymorph.js` holds only the element: the renderer and the
  vocabulary table are a chunk the first `<poly-screen>` fetches, the validator a chunk its
  `check()` fetches, and the card a chunk `loadScreen()` fetches with them. `polymorph init
  --framework elements` and `polymorph update` copy the new chunks with the others.
