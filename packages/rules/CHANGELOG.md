# @polymorph/rules

## 1.0.17

### Patch Changes

- b33e18c: Each package's registry listing has `keywords`, which it had none of, and a description that
  names the Polymorph design system. A vocabulary's description says it holds the system's
  components for its framework. A search of the registry for a design system or for components in
  a framework matches the packages by those words. No file a consumer imports changes.
- Updated dependencies [b33e18c]
- Updated dependencies [f525c25]
- Updated dependencies [0619f1f]
- Updated dependencies [5dc8255]
  - @polymorph/engine@1.0.17

## 1.0.16

### Patch Changes

- 3ce48d6: **The rules' engine peer no longer reports as unmet in pnpm.** `@polymorph/rules` published its
  optional peer as `"@polymorph/engine": "npm:@metamorph-labs/polymorph-engine@^<version>"`. pnpm
  compares a peer's range as written with the version installed under that name, so `pnpm install`
  warned of an unmet peer and `pnpm peers check` listed it, whatever version of the engine was
  installed. The peer is now published as `"@polymorph/engine": "^<version>"`, which the engine
  installed under its `@polymorph/engine` alias satisfies. Dependencies keep the alias form, which
  tells the package manager where to install them from. Nothing changes in a consumer's manifest.
- Updated dependencies [2f0ddd2]
  - @polymorph/engine@1.0.16

## 1.0.15

### Patch Changes

- @polymorph/engine@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [9b60a94]
  - @polymorph/engine@1.0.14

## 1.0.13

### Patch Changes

- 73837b5: `polymorph/one-opener` knows `MasterDetailPage` as a page archetype that renders the page's
  PageHeader, so a page that composes a MasterDetailPage beside its own PageHeader or Hero is
  reported, as one beside a ListPage is.
- 56e7665: `verify` and `fix` from `@polymorph/rules/verify` take `framework: 'elements'`. The red rules do
  not read an HTML page, so a `.html` file in elements is a fatal result that says so, where it was
  read as an Angular template before; a `.html` file without `framework`, or with `'angular'`, is
  read as it was. A script beside an elements page is read as any TypeScript is, and a rewritten
  `<button>` imports nothing, because an element is not imported by name.
- 2da1598: `SearchPage` is a new page archetype in every web vocabulary: the page whose subject is a query,
  with the field, the filters under it, and what the query found. It takes `title`,
  `description` and `actions` as PageHeader does, the `search` slot for the field, `searchLabel`
  to name its search landmark, `filters`, `empty` with the required `emptyState`, `pending`, and
  the results as `children`. A page that searches as the reader types passes no `onSubmit`. A page
  that submits passes `onSubmit`, and the landmark is then a real form: Enter in the field calls
  it once and the browser does not navigate.

  The results flow down the page with no panel, one group under each Heading. While `pending` the
  results region is `aria-busy` and keeps the last results; while `empty` it holds the EmptyState
  drawn from `emptyState`. The swap moves no focus and plays no motion. The page's measure is nine
  of `--pm-space-10`, between FormPage's and ListPage's.

  `one-opener` knows SearchPage, so a module that renders one and also composes a PageHeader and a
  Hero is told to keep the archetype's title.

  The elements vocabulary has it as `<poly-search-page>`.

  On iOS and Android `SearchPage` is native, drawn in SwiftUI and Compose: the header, the field
  with its filters under it, and the results, with `loadStatus` and `onRetry` as every native page
  takes them.

- Updated dependencies [d84171d]
- Updated dependencies [508275a]
- Updated dependencies [73837b5]
- Updated dependencies [709d7b3]
  - @polymorph/engine@1.0.13

## 1.0.12

### Patch Changes

- 9f8c97f: `rating` is a new icon role: one mark of a score. It draws lucide's `star`, and on Apple and
  Android platforms the `star` symbol. It shares the glyph with `favorite`, as `close` and
  `clear` share theirs: marking a thing to keep is not scoring it, and either can change glyph
  without the other. `IconRole` includes it and every foundation's `Icon` draws it. The icon
  rule no longer rewrites an import of the star glyph, because two roles draw it: it reports the
  import and names both. Rating draws it.
- 96daa65: `record` is a new icon role: start a recording of the reader's voice. It draws lucide's `mic`,
  and on Apple and Android platforms the `mic` symbol. `IconRole` includes it, every foundation's
  `Icon` draws it, and the icon rule's fix names it for an import of the microphone glyph.
  RecordButton draws it at rest.
- 6119b46: Another library's component has a declared boundary. `ThirdParty` is a rung-4 primitive beside
  `Bespoke`, in every web vocabulary (`<pm-third-party>` in an Angular template): it wraps a map, a
  rich-text editor, a data grid or any component the vocabulary does not draw, and takes the
  package's name as `library` and a `reason`. It draws nothing.

  The red rules read it. A boundary hosts its library only in a file that imports a binding from the
  package it names: a default, a name or a namespace, from that specifier or a path inside it, an
  `import()` of one, or `import L = require('…')`. A side-effect import, a type import and a
  stylesheet import bring no binding. `no-raw-styles` reports a boundary that hosts nothing, on its
  own tag: one with no `library` written out, one whose `library` is not spelled as a package, one
  whose `library` is a polymorph package or a framework's own runtime (`react`, `vue`, `svelte`,
  `solid-js`, `@angular/core` and the other packages each framework ships as its runtime), and one
  whose package the file imports no binding from.

  Inside a boundary that hosts, a plain element and the library's own component take `style` and a
  class, and a raw length is allowed. The file may import that library's stylesheet, which
  `no-app-css` banned with no rung to answer it. It may import a package `no-external-dataviz` or
  `no-external-motion` bans when `library` is that package's name as the rule lists it. Another
  package of the same npm scope is not lifted. Everything else stays red: a raw control, an inline
  `<svg>`, and a class or a `style` on a member or on a part of one (`<Table.Row>`). A colour stays
  red in every syntax. In a `style` the boundary lifts, a property that takes a colour takes a
  custom property read (`var(--pm-…)`), a keyword that names no colour, or a value computed where
  it is written, and a named colour or `color-mix()` is reported. The `style` is read through a
  cast, a conditional, a spread of an object, Vue's array of styles and CSS text with values
  computed inside it, and one whose property names are not written out (`style={styles}`) is
  reported, because its colours cannot be read. A disable comment inside the boundary is still
  undeclared.

  `pnpm inventory` lists each boundary at rung 4 with its library, and `hostedLibraries` in
  `@polymorph/rules/inventory` returns the libraries an application hosts. `Exception` gains an
  optional `library`. A boundary that writes no `library` out is listed with no rung, with the kind
  `NAMELESS_BOUNDARY` exports, and `pnpm inventory` exits 1 on it. In a Vue template the inventory
  reads a tag by the name Vue resolves it to, as lint does, so `<third-party>`, `<bespoke>` and
  `<density-scope>` are listed and a disable inside a `<bespoke>` zone is accounted for.

  Reports change in these cases. A stylesheet imported from a package names the boundary that hosts
  it where the file imports a binding from that package, and says why no boundary lifts it where
  the file does not. A chart library no chart member replaces names the boundary. A file that hosts
  a library is told to read a colour from `useThemeValues()`. No lawful code becomes a violation,
  and nothing is renamed or removed.

- Updated dependencies [6d714a7]
- Updated dependencies [28aeda0]
- Updated dependencies [f918ed3]
- Updated dependencies [b209e98]
- Updated dependencies [51e8566]
- Updated dependencies [e708348]
- Updated dependencies [f69f55e]
- Updated dependencies [766b5fd]
- Updated dependencies [982e684]
- Updated dependencies [2ffb66b]
- Updated dependencies [d9713d4]
- Updated dependencies [49ab024]
- Updated dependencies [b9e5208]
- Updated dependencies [3dc5f0f]
- Updated dependencies [9f8c97f]
- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [3b0b47f]
- Updated dependencies [0936316]
- Updated dependencies [b88e331]
- Updated dependencies [00bce31]
- Updated dependencies [59658db]
- Updated dependencies [4902f58]
  - @polymorph/engine@1.0.12

## 1.0.10

### Patch Changes

- Updated dependencies [7019d6f]
- Updated dependencies [cb0d0a3]
  - @polymorph/engine@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/engine@1.0.9

## 1.0.8

### Patch Changes

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

- Updated dependencies [820c836]
- Updated dependencies [e1c80b3]
  - @polymorph/engine@1.0.8

## 1.0.3

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/engine@1.0.6

## 1.0.2

### Patch Changes

- 1b900d8: Application CSS can no longer re-make the theme's decisions, and `polymorph check` runs the red rules with no lint config.

  **Breaking: four Stylelint rules for application CSS.** A stylesheet that passed before can fail here. `token-values-only` does not read custom properties, and the vocabulary's selector rules do not run on application CSS, so an application stylesheet could override the theme without one raw value the rules saw. These rules close that:

  - `polymorph/no-token-declarations`: a `--pm-*` custom property declared in application CSS. Reading a token stays lawful. Set a colour in your palette and every other value in your system ([docs/theming.md](../docs/theming.md)); a local need is a member's `tone` or `variant`, `<DensityScope>` or `<ToneScope>`, or a `patch`.
  - `polymorph/no-app-theme-selectors`: a selector on `data-system`, `data-palette`, `data-mode`, `data-density`, `data-tone` or `data-motion`. Every token already follows the pairing, the mode and the density; a value one theme needs goes in that theme's document.
  - `polymorph/no-app-member-selectors`: a selector on `data-member`, which restyles a member from outside. Use the member's props, a per-member exception in the system file (`overrides.exceptions`), or ask for a variant.
  - `polymorph/no-root-font-size`: a `font-size`, or a `font` shorthand with a size, on `:root` or `html`, which rescales every rem token and the 16px text-entry floor. Type size is the system's; a denser screen takes `<DensityScope value="compact">`.

  Each report names the theme document that owns the decision and the rung of the exception ladder that answers a local need. `@polymorph/rules/stylelint` exports them, with `no-motion-outside-vocabulary`, as `applicationRules`, to spread into the rules for your own stylesheets. **To upgrade**, run `polymorph update` (or `polymorph add`) so `polymorph.stylelint.js` applies them to your stylesheets and lifts them for the vendored directory, where the compiled theme declares every token under pairing selectors. A hand-written config adds `...applicationRules` to its application block. `@polymorph/rules/verify` applies them to application CSS, so the MCP server's `validate` reports them too, and it now holds a vocabulary stylesheet to `no-member-selectors` as this repository's Stylelint config does.

  **`polymorph check [dir]`** runs `verify` over every `.ts`, `.tsx`, `.vue`, `.svelte`, `.html` and `.css` file below a directory as application code, with no ESLint or Stylelint config, and prints each violation by file and rule with the rungs that answer it. It leaves out dot-directories, `node_modules`, `dist`, `build`, `coverage`, `out` and the vendored directory `polymorph.json` records, and reads a `.html` file only in a project that uses the Angular vocabulary. Each file's framework is inferred as the MCP server's `fix_file` infers it, and `--framework` sets it for every file. `--json` prints the report as data. It exits 1 on any violation. Run it from your app's root: `node ../polymorph/packages/cli/bin/polymorph.js check src`.

  The registry's law catalogue lists the four rules with their rungs, so the system card and `validate` name them.

- 1b900d8: A toast tells its owner when it leaves, its tone sets how long it stays, a success notice leaves on its own, and the registry publishes Toast as each framework ships it.

  **`onDismiss` on a toast.** `toast()` takes `onDismiss`, called once when the toast leaves for a reason other than its owner's: the reader dismissed it, its time ran out, `toast.dismiss` closed it, or newer toasts evicted it. Removing a toast and updating it in place do not call it. Every framework's `toast()` takes it, because every foundation's store is the engine's. A declared Toast in Vue, Svelte, Solid and Angular emits `dismiss` (`@dismiss`, `onDismiss`, `(dismiss)`), and `PMToast` on iOS and Android calls `onDismiss` when its card leaves by its close button, a swipe, the escape gesture or its time.

  **A toast takes its lifetime from its tone.** The store every web framework shares gives a toast whose call sets neither `retained` nor `durationMs` its tone's lifetime. A `danger` or `warning` toast is retained and pinned: it stays until it is dismissed or removed, and newer toasts do not evict it. A `success`, `info` or `neutral` toast leaves after `TOAST_DEFAULT_DURATION_MS` and may be evicted, as every toast did before. So `toast.danger(…)`, `toast.warning(…)` and `toast.promise`'s error face now stay until the reader dismisses them; a call that wants the old five seconds passes `durationMs: TOAST_DEFAULT_DURATION_MS`. A call that sets either option keeps what it sets. `ToastNotice` and a declared `Toast` in Vue, Svelte, Solid and Angular follow the same rule, so a `danger` or `warning` notice stays until it is resolved or dismissed, as every notice did before, and a `success`, `info` or `neutral` notice now leaves on its own. A screen that kept a success notice on screen with a button whose only job was to dismiss it can delete the button. `ToastNotice` also takes `onDismiss`, so a screen can clear the state that renders a notice once the notice has left; unmounting a notice does not call it. A notice that must stay whatever its tone takes `dismissible={false}`. `PMToast` on iOS and Android takes the same lifetime from its tone when its props set neither `retained` nor `durationMs`: a native danger or warning toast now stays until it is dismissed, and one that should leave passes `durationMs: 5000`.

  **A notice with nowhere to show warns in development.** A `ToastNotice` rendered while no `ToastHost` or `Toaster` is mounted logs a warning naming it, because nothing draws its toast. A declared `Toast` in Vue, Svelte, Solid and Angular logs the same warning when no `Toast.Viewport` is in the document once it has mounted. The usual cause is an error boundary whose fallback renders outside the viewport: mount `ToastHost`, or `Toast.Viewport`, outside the boundary.

  **The registry and the system card publish Toast's real API and every compound part.** Each component carries `parts`, every compound part its export carries with the part's props (`AppShell.NavItem`, `AppShell.NavGroup`, `AppShell.UserCard`, `Dashboard.Panel`, `Avatar.Group`, `Table.Head`, `Table.Body` and `Table.Foot` among them, which the card left out), and `exports`, the member's other callable exports (Toast's `toast`, `ToastHost`, `ToastNotice` and `ToastViewportTarget`; Tooltip's `TooltipProvider`; FormField's `ToastFormField`). The React card lists Toast as `toast()` with its options and shorthands beside the components a screen mounts, rather than as a `<Toast>` with props; another framework's card lists the parts its shell ships, `Toast.Viewport` included. Toast's purpose reads "Notifications that report the outcome of an action" in place of "The toast viewport". A card rendered for `ios` or `android` lists a member's props and the parts its native contract carries, and none of React's exports: SwiftUI's and Compose's Toast is a member whose props are the options.

  **The spec-staleness law reads every compound part.** `@polymorph/rules/spec-api` compares each part a member's export carries with its spec, reading the parts with `compoundParts`, the function the registry's `parts` come from, in place of the hand list `COMPOUND_PARTS`, which is removed. A part's props table goes in `## API` under a `Component` column, or under a heading with the part's name (`## AppShell.NavItem`).

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/engine@1.0.5

## 1.0.1

### Patch Changes

- 700e130: The red rules are published on their own, as `@polymorph/rules` (`@metamorph-labs/polymorph-rules`). They used to ship inside `@polymorph/core`.

  **To upgrade**, install `@polymorph/rules` as a dev dependency and change two imports: `@polymorph/core/eslint` is `@polymorph/rules/eslint`, and `@polymorph/core/stylelint` is `@polymorph/rules/stylelint`. The package has `@polymorph/engine`, `eslint` and `stylelint` as optional peer dependencies; only `@polymorph/rules/stylelint/emitted` and `@polymorph/rules/verify` import the engine. The rules keep their names and options. Where a rule's default names a package, it names the new one: `no-raw-styles` and `fixableRawControls` look for members imported from `@polymorph/react-ui`, and `vendorable-imports` reports a vendored file that imports `@polymorph/rules`, `@polymorph/react-ui`, `@polymorph/spec`, `@polymorph/cli` or `@polymorph/mcp`, and names `@polymorph/react` as the import to use.

  **Every report carries its answer**: the rule's own fix when there is exactly one rewrite, or the lawful alternatives for what you wrote, named as the member, prop and token to use. Each message is under 200 characters.

  - `no-raw-styles` names the nearest colour role by value for a raw colour, and the nearest space step with the layout prop that carries it for a raw length. A `style` object is read into the primitive that replaces it (`display: flex; gap: 12px` is `<Inline gap={4}>`). A styled `<span>` is inline content of the enclosing `Text`, or a `Badge` when its classes say so, and a class on `<html>` or `<body>` is the theme's to set.
  - **Breaking: `no-raw-styles` reports a `className` on a plain element**, such as `<div className="flex gap-2">`, with what its classes read as. Code that passed before can fail here: compose the member the report names, or move the styling into a `<Bespoke>` zone, where a class on a plain element is allowed.
  - `no-raw-interactive` names the member for each `<input>` by its `type`, `Select` or `Combobox` for a `<select>`, and `Link` or a ghost `Button` for a handler on a plain element. `month` and `week` have no member, so they are sent to a zone.
  - `no-external-icons` names the role nearest by name for a glyph the map does not draw (Font Awesome's `fa` prefix included). `no-external-motion` and `no-external-dataviz` name the member that already does what the library call does. `no-app-css` says what the imported stylesheet's rules become. `one-opener` names the opener to keep. `token-values-only` names the nearest token by value, and `no-motion-outside-vocabulary` names the member whose state a `[data-member]` selector animates.
  - The nearest token comes from a `values` option on `no-raw-styles`, `no-app-css` and `token-values-only`. `polymorph add` and `polymorph init` write the values into the lint fragments they generate, so an installed config needs nothing more; without them the reports name the token family instead of the step. `tokenValues(root)` in `@polymorph/rules/stylelint/emitted` reads a repository laid out like this one.
  - `@polymorph/rules/verify` diagnostics carry `fix` (the rule's edit, or `null`) and `alternatives` (`{ member?, prop?, token?, rung }`), and `RULE_CLIMB` gives each application rule the rungs that answer it.

  **Fixes.** The violations with exactly one lawful rewrite are fixed by `eslint --fix` and by an editor that fixes on save, and a fix carries everything on an element across or does not run:

  - `no-raw-styles` removes a `className`, `style` or `css` from a vocabulary component, where it was already doing nothing.
  - `no-external-icons` rewrites an import from `lucide-react` to the gateway where the icon map names the role a glyph draws: `<Trash2 />` becomes `<Icon name="delete" />`.
  - `no-raw-interactive` rewrites a `<button>` whose whole content is its text as `Button`, an `<input type="checkbox">` with its label as `Checkbox`, and a `<textarea>` as `Textarea`. These are off until you switch them on: spread the `fixableRawControls` export after the rule groups in a config whose application code imports members from `@polymorph/react-ui`.

  `@polymorph/rules/eslint` exports `fixableRawControls`; `@polymorph/rules/verify` exports `fix`, `fixCode` and `fixCss`.

  **Every web framework.** The rules read Vue single-file components, Svelte components, Solid TSX and Angular templates as they read React's TSX, and write each answer in that framework's syntax (`<Inline :gap="4">`, `<pm-inline [gap]="4">`).

  - **Vue**, under `vue-eslint-parser` (an optional peer, `^10.4.1`): `<script setup>` is linted as TSX, and the template by the rules that read JSX. A tag resolves as Vue's compiler resolves it.
  - **Svelte**, under `svelte-eslint-parser` (an optional peer, `>=1`): scripts and markup, with `class:` and `style:` directives, `onclick` and `on:click`, and `transition:`, `in:`, `out:` and `animate:` directives, each naming the member that already does the work.
  - **Solid**: a TSX file is Solid when the config sets `solidSettings` or when it imports `solid-js`, `@polymorph/solid` or `@polymorph/solid-ui`. `class`, `classList`, a lowercase handler and a listener directive read as Solid's only there, so a React file fails nothing it passed before. `fixableSolidControls` switches on the `<button>` and checkbox fixes, importing from `@polymorph/solid-ui`, and an import from `lucide-solid` is rewritten to `<Icon>` from `@polymorph/solid`.
  - **Angular**, under `@angular-eslint/template-parser` and `@angular-eslint/eslint-plugin-template` (optional peers, `>=22`): a component's inline or external template, by the members' `pm-` selectors, with `<pm-bespoke>` lifting the rules inside it. A static `class` or `style` on a member is removed by the fix; anything else is reported. `angularSettings` marks a config's modules as Angular.
  - The import bans name each framework's icon, motion and chart libraries (`lucide-vue-next`, `lucide-svelte`, `lucide-solid`, `lucide-angular`, `motion-v`, `svelte/transition`, `solid-motionone`, `@angular/animations`, `vue-chartjs`, `layerchart`, `ng2-charts` and the others the rules' docs list). A file that imports none of them reads as it did.
  - In any TSX file a `style` string is read declaration by declaration, and reported once with what it reads as.

  `@polymorph/rules` exports `VUE_VOCABULARY_MODULE`, `SVELTE_VOCABULARY_MODULE`, `SOLID_VOCABULARY_MODULE` and `ANGULAR_VOCABULARY_MODULE`; `@polymorph/rules/eslint` exports `solidSettings`, `fixableSolidControls` and `angularSettings`; and `@polymorph/rules/verify` reads `.vue`, `.svelte` and `.html` files and takes `framework: 'solid'` or `'angular'`, loading each parser only when it reads that framework. The inventory reads Vue, Svelte and Angular markup for the ladder's primitives and for a disable, and its default files include `apps/**/*.html`.

- Updated dependencies [700e130]
  - @polymorph/engine@1.0.4

## 1.0.0

The first versioned release. Earlier history is in git.
