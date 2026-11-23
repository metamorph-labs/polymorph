---
'@polymorph/elements-ui': patch
---

The elements draw a screen a model writes, a `polymorph-screen/1` document, at run time with no
build. `@polymorph/elements-ui` now depends on `@polymorph/screen`, the run-time core every renderer
shares. Nothing changes for a page that draws no screen.

- `<poly-screen>` draws its `spec` property, its `text` property (a model's answer so far) or the
  JSON in its `<script type="application/json">` child, with `data`, `streaming`, `members` and
  `faults` (`hidden` or `inline`). It dispatches `poly-action` (`{ name, args, values, changed }`,
  `changed` naming the controls the person changed; a listener hands the member a promise with
  `event.waitUntil`) and `poly-fault` (`{ path, message, component }`), and has `values`,
  `changed` and `check()`. It draws no box of its own. `streaming` is the page's to set, for `text` as for `spec`:
  set it while the answer arrives and clear it when the answer ends, so a truncated answer reports
  what it lacks. A `members` value that cannot be read (an attribute that is not JSON or names, a
  property that is not a list) allows no member and is a `poly-fault` at the path `members`. A
  document nested too deep to read draws nothing and is a `poly-fault`; setting `text` never throws.
  A swap of the element's children (a new script, a morph that keeps the script, `replaceChildren`)
  draws the document the children hold.
- `@polymorph/elements-ui/screen`, for an app with a bundler, defines `<poly-screen>` and every
  element, each loading its member's code when it first renders, and exports `drawScreen`,
  `parsePartial`, `checkScreen`, `runtimeCard` and `outputContract`, bound to the members the
  elements draw.
- `polymorph.js` and `polymorph-all.js` define `<poly-screen>` and export `loadScreen()`, which
  resolves to the same functions. `polymorph.js` holds only the element: the renderer and the
  vocabulary table are a chunk the first `<poly-screen>` fetches, the validator a chunk its
  `check()` fetches, and the card a chunk `loadScreen()` fetches with them. `polymorph init
  --framework elements` and `polymorph update` copy the new chunks with the others.
