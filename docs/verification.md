# Verification

Every claim polymorph makes should be checkable by running a command. This page describes the
checks: the gates (`pnpm gate` for the web, `pnpm gate:engines` for the web on Firefox and WebKit,
`pnpm gate:ios`, `pnpm gate:android`), the test projects, the laws, the lint gate, the type check,
the exception inventory, the layout scan, the size budgets, `pnpm proof`, which runs the ten product guarantees
against this repository and takes screenshots of the result, and `pnpm eval`, which measures how a
real model gets on when it builds screens with the system, through the system's tools or in a
coding harness working in an app the tools set up.

Terms used on this page:

- **Law**: a test that enforces a design claim, such as "every text/surface pairing passes the
  contrast law" or "every states fixture renders what it promises".
- **Red rule**: an ESLint or Stylelint rule that fails the gate. [rules.md](rules.md) lists them.
- **Vocabulary**: the closed set of components polymorph ships. A **member** is one of them.
- **States fixture**: a member's list of the states it promises, which the completeness law
  renders: `*.states.tsx` in React, a generated fixture in Vue, Svelte, Solid and Angular, the
  same fixture as a page's markup for the elements, and `<Member>States` in a SwiftUI or Compose
  member's file.
- **Relay**: the demo product inside the workbench (`apps/workbench/src/relay/`). It has an inbox, a
  ticket form and a settings screen, built only from the vocabulary.

## The gates at a glance

| Command | What it checks | In `pnpm gate` |
| --- | --- | --- |
| `pnpm typecheck` | every workspace TypeScript project, `tsc --noEmit` (`vue-tsc` for the Vue packages, `svelte-check` for the Svelte packages, `ngc` for the Angular packages, templates included, with the TypeScript 6.0 they install; the Solid packages are TSX that `tsc` reads with Solid's JSX types) | yes |
| `pnpm lint` | ESLint (including the red rules), Stylelint, Prettier | yes |
| `pnpm inventory` | no red rule turned off outside a declared `<Bespoke>` zone | yes |
| `pnpm test` | the `logic`, `core`, `ui`, `vue`, `solid`, `svelte`, `angular`, `elements` and `hosted` test projects | yes |
| `pnpm test:coverage` | the `logic` project again, held to coverage thresholds | yes |
| `pnpm build` | the workbench and docs apps build | yes |
| `pnpm site` | every page of the built docs site renders in Chromium without an error and links only to pages the site has; the step writes each page as static HTML ([The site check](#the-site-check)) | yes, on the build `pnpm build` made |
| `pnpm layout` | no page of the built workbench has a layout fault: every member's gallery, the Relay screens and the sample pages, at a phone's width and a desktop's ([The layout scan](#the-layout-scan)) | yes |
| `pnpm build:packages` | the published builds of `@polymorph/engine`, `@polymorph/rules`, `@polymorph/screen`, `@polymorph/react`, `@polymorph/react-ui`, `@polymorph/vue`, `@polymorph/vue-ui`, `@polymorph/svelte`, `@polymorph/svelte-ui`, `@polymorph/solid`, `@polymorph/solid-ui`, `@polymorph/elements`, `@polymorph/elements-ui` (with the files a page with no build loads, `dist/cdn/`), `@polymorph/angular`, `@polymorph/angular-ui` and `@polymorph/tools` (the CLI and the MCP server, with the registry, the source tree and the screen page they ship) | yes |
| `pnpm size` | what a consumer ships stays under its budget | yes |
| `pnpm gate:no-build` | a page with no build, served as plain files, loads the elements' no-build files and works: before and after the tags are defined, from markup, in a form, through an overlay, through htmx-style and morphing swaps and page snapshots, and drawing a run-time screen ([The static-page check](#the-static-page-check)) | yes, on Chromium, on the builds `pnpm build:packages` made; `pnpm gate:engines` runs it on Firefox and WebKit |
| `pnpm gate:next` | a Next.js App Router application built from the published builds, on Turbopack, on webpack and on the development server: the members' stylesheets reach each page, the pages hydrate, the theme installs, and the red rules run ([The Next.js gate](#the-nextjs-gate)) | yes, last, on the builds `pnpm build:packages` made |
| `pnpm gate:ios` | the SwiftUI members: contracts, example screens, native laws, `swift build`, the package added by URL, `swift test`, the simulator type check, and the accessibility audit on an iPhone simulator ([The iOS gate](#the-ios-gate)) | no: its own gate, which needs Xcode, and an iOS simulator runtime for the audit |
| `pnpm gate:android` | the Compose members: contracts, example screens, Kotlin laws, the JVM build and harness, the Android library, and the accessibility audit under Robolectric ([The Android gate](#the-android-gate)) | no: its own gate, which needs a JDK, and an Android SDK for the Android library and the audit |
| `pnpm gate:engines` | the browser projects again, on Firefox and on WebKit ([The engines gate](#the-engines-gate)) | no: its own gate, which needs Playwright's builds of Firefox and WebKit |
| `pnpm proof` | the ten guarantees, run and captured as screenshots | no, run by hand |
| `pnpm eval` | how often a model given a brief and the system's tools produces a lawful screen, how often a coding harness in an app the tools set up leaves a lawful project that builds and meets the brief, and at what cost | no, run by hand before a release |

## Test projects

`vitest.config.ts` defines the projects. `pnpm test` runs every one the browser matrix does not add.

| Project | Environment | Root | Picks up |
| --- | --- | --- | --- |
| `logic` | node | repository root | `packages/{theme,rules,registry,cli,mcp,spec,screen}/src/**/*.test.ts`, `packages/{engine,react,rules,cli,mcp,spec,screen,tools,conformance,react-ui,vue,vue-ui,solid,solid-ui,svelte,svelte-ui,angular,angular-ui,elements,elements-ui}/*.test.ts`, `packages/shells/src/**/*.test.ts`, `packages/native/src/**/*.test.ts`, `apps/workbench/src/**/*.test.{ts,tsx}`, `apps/docs/src/**/*.test.{ts,tsx}`, `eval/*.test.ts` |
| `core` | Chromium, through Playwright | `packages/react` | `packages/{engine,react}/src/**/*.test.{ts,tsx}`, the run-time renderer's tests (`packages/react/src/screen/`) among them |
| `ui` | Chromium, through Playwright | `packages/react-ui` | `src/**/*.test.{ts,tsx}`, with `src/test-setup.ts`. Includes the behaviour conformance law (`src/conformance.test.tsx`), which runs every statement in every spec's `contract` fence against the React shell; [conformance.md](conformance.md) has the grammar, the runner, each shell's adapter and the ledgers |
| `vue` | Chromium, through Playwright | `packages/vue-ui` | `src/**/*.test.ts`, with `src/test-setup.ts`: the Vue shell's laws over the generated members (completeness, identity, axe), its behaviour conformance law (`src/conformance.test.ts`), which runs every contract statement of every member the Vue shell ships through the Vue adapter, with the React law's runner and locators, and is shown a false statement of every kind, and the members' behaviour tests beside them (`src/<tier>/<member>.test.ts`) for what the contract grammar cannot state ([shells.md](shells.md)) |
| `svelte` | Chromium, through Playwright | `packages/svelte-ui` | `src/**/*.test.ts`, with `src/test-setup.ts`: the Svelte shell's laws over the generated members (completeness, identity, axe), its behaviour conformance law (`src/conformance.test.ts`) through the Svelte adapter, the foundation's presences and slot conventions (`src/conventions/*.test.ts`), and the members' behaviour tests, which mount with `src/mount.ts` and the helpers and harness components in `src/testing/` ([shells.md](shells.md#the-svelte-laws)) |
| `solid` | Chromium, through Playwright | `packages/solid-ui` | `src/**/*.test.{ts,tsx}`, with `src/test-setup.ts`, compiled by Solid's plugin: the Solid shell's laws over the generated members (completeness, identity, axe), its behaviour conformance law (`src/conformance.test.ts`) through the Solid adapter, the foundation's machine service, effects and slot conventions (`src/conventions/foundation.test.tsx`), and the members' behaviour tests beside them (`src/<tier>/<member>.test.tsx`) ([shells.md](shells.md#the-solid-laws)) |
| `angular` | Chromium, through Playwright | `packages/angular-ui` | `{angular,angular-ui}/src/**/*.test.ts` under `packages/`, with `packages/angular-ui/src/test-setup.ts`, compiled ahead of time by Angular's compiler (`packages/angular-ui/vitest.plugins.ts`): the foundation's Zag adapter against three machines (`packages/angular/src/zag/zag.test.ts`), the Angular shell's laws over the generated members (completeness, identity, axe), its behaviour conformance law (`src/conformance.test.ts`) through the Angular adapter, and the members' behaviour tests beside them ([shells.md](shells.md#the-angular-laws)) |
| `elements` | Chromium, through Playwright | `packages/elements-ui` | `src/**/*.test.{ts,tsx}`, with `src/test-setup.ts`: the elements' laws over each fixture entry mounted as a page's markup (completeness, identity, axe), the parity law (`src/parity/`), which compares each entry's document with the Solid member's, the behaviour conformance law (`src/conformance.test.ts`) through the elements adapter, the shared behaviour laws through the elements mount or adapter (`src/<tier>/<member>.test.ts`, and `src/direction.test.ts` for the reading direction), and the bridge's tests (`src/bridge/*.test.ts`), the base class's among them: a slot that keeps the elements it still holds, `fillSlot` and a member that throws ([shells.md](shells.md#the-elements-laws)), and the run-time renderer's tests (`src/screen/`). A change to `packages/solid` or `packages/solid-ui` reaches every element, so it runs this project with the `solid` one |
| `core-firefox`, `ui-firefox`, `vue-firefox`, `solid-firefox`, `svelte-firefox`, `angular-firefox`, `elements-firefox`, `core-webkit`, `ui-webkit`, `vue-webkit`, `solid-webkit`, `svelte-webkit`, `angular-webkit`, `elements-webkit` | Firefox or WebKit | as above | as above; only defined when `PM_BROWSER_MATRIX=1`, which `pnpm gate:engines` sets |

**`logic`** is pure logic: schema validation, colour derivation, the lint rules under `RuleTester`,
the registry generator, the run-time screen core, the CLI and MCP server as subprocesses, the shells' freshness and the Vue,
Svelte, Solid and Angular vocabularies' and the elements' laws that read files and the registry
([shells.md](shells.md)),
the native contracts and the laws over the Swift and Kotlin sources, the eval's harness, and the
apps' own logic. On a machine with the toolchains it also compiles the native token packages
(`swift build`, `kotlinc`, `dart analyze`), and skips each check, saying why in its title, on a
machine without one. It runs in node, not jsdom. A file that needs a DOM requests one with a `@vitest-environment jsdom` docblock
(`packages/theme/src/runtime.test.ts` is the example). The project reuses one module registry across
files (`isolate: false`) for speed, so a test must not depend on module state left by another file.

The package-root `*.test.ts` files in `logic` (`packages/cli/scratch.test.ts`,
`packages/spec/agent-loop.test.ts`, `packages/mcp/transcript.test.ts`,
`packages/react-ui/consumption.test.ts`, `packages/engine/packaging.test.ts`,
`packages/vue/packaging.test.ts` and others) test files
on disk and subprocesses. That is why they sit outside the browser projects' `src/`.
`packages/svelte-ui/server-render.test.ts` is one of them, with a jsdom docblock: it starts two Vite
servers, one that renders every Svelte fixture entry with `svelte/server` and one that compiles the
same sources for the browser and mounts them in jsdom, and compares the two
([shells.md](shells.md#the-svelte-laws)). Their caches are in
`packages/svelte-ui/node_modules/.cache/server-render`.
`packages/{vue,solid,angular}-ui/server-render.test.ts` are three more. Each starts a Vite server
that renders every fixture entry as a server does, in Node with no document, so an entry that reads
`window`, `document` or a frame fails. It then installs a document (jsdom, through `lawProcess` in
`@polymorph/conformance/server-render`), starts a second server that compiles the same sources for
the browser, and hydrates each entry's markup. The `logic` project does not isolate its files, so
`lawProcess` also undoes what the file set up: it closes the servers, removes the document and the
globals that came with it, and releases the clock, which it holds at one instant so both halves
give a member the same props. The Solid law also mounts each entry and compares the hydrated
document with the mounted one, because a Solid hydration that reports nothing can still leave the
server's text or an element that is not the member's. It renders the entries of
`packages/solid-ui/server-render.cases.tsx` beside the fixtures: they pass an element a caller
wrote where a fixture passes a member. The laws' caches are in each package's
`node_modules/.cache/server-render`.

**`core`, `ui`, `vue`, `svelte`, `solid` and `angular`** run in a real browser because Radix and Zag overlays,
focus and motion are unreliable in jsdom. Each is rooted at the package that installs its
framework, so the framework resolves from that package: `core` at `packages/react`, from where it
also collects the engine's tests (the engine installs no React), `ui` at `packages/react-ui`, `vue`
at `packages/vue-ui`, which installs Vue and Zag, `svelte` at `packages/svelte-ui`, which installs
Svelte and Zag and compiles with the vocabulary's own compiler options (`svelte.config.js`), and
`solid` at `packages/solid-ui`, which installs Solid and Zag, `angular` at `packages/angular-ui`,
which installs Angular, its compiler, TypeScript 6.0 for it, and Zag, and `elements` at
`packages/elements-ui`, which installs the Solid vocabulary the elements render. The viewport is 1280×800. A test that
needs the narrow layout sets it with `page.viewport(...)`, so every breakpoint change is an
explicit line in the test.

**`hosted`** runs the workbench's two components from other libraries
(`apps/workbench/src/hosted/**/*.test.tsx`) in the same browser, rooted at the app, which is the
only package that installs those libraries. `logic` leaves that directory alone.

**The browser matrix.** `PM_BROWSER_MATRIX=1` adds Firefox and WebKit copies of every browser
project, and `pnpm gate:engines` runs them ([The engines gate](#the-engines-gate)). They are built
from the same factories, so their configuration cannot diverge from the Chromium projects. On
those engines files run one at a time (`fileParallelism: false`). Only Chromium gives each test
iframe its own emulated focus. On the other engines, parallel files take the single real focus
from each other. The suite can read the engine as `__PM_ENGINE__`. A test may not branch on it to
pass. It may only declare a skip on a limit of the test tooling, and
`packages/conformance/src/engines.ts` names each limit once, with its reason:

| Limit | Engine | What skips |
| --- | --- | --- |
| `TAB_PASSES_BUTTONS` | WebKit | A test that presses Tab to reach a button or a link, and every `key Tab` statement of the conformance law. WebKit on macOS follows Safari's default, in which Tab visits text fields only. |
| `PASTE_IS_UNREADABLE` | Firefox | A test that dispatches a paste. Gecko hides the data of a paste a script creates. |
| `SCROLLBARS_ARE_HIDDEN` | Firefox | A test that reads the computed scrollbar. Playwright's headless Firefox hides every scrollbar. |
| `NO_MEDIA_EMULATION` | Firefox, WebKit | A test that turns on `prefers-reduced-motion` through a DevTools session, which only Chromium has. |

A limit belongs to the tooling or to a setting of the engine. A member that behaves differently on
an engine is fixed, or the difference is recorded in its spec. A test that states words in a
language names its locale: Chromium's default locale under the test runner is en-US, and Firefox
and WebKit take the machine's.

Workers are capped at half the cores (`maxWorkers: '50%'`), because more browser workers cost more
in contention than they save.

### Running a subset

```sh
pnpm exec vitest run --project logic                       # one project
pnpm exec vitest run packages/rules/src/inventory.test.ts   # one file
pnpm exec vitest run --project ui overlays/dialog          # files whose path contains the filter
pnpm exec vitest run --project logic -t "contrast law"     # tests whose name matches
pnpm test:watch                                            # watch mode, default projects
```

The elements render the Solid members, so a change to `packages/solid` or `packages/solid-ui` also
runs the `elements` project: a Solid change reaches every page that uses the elements, and the
parity law shows one that reaches it differently from the Solid member.

```sh
pnpm exec vitest run --project solid --project elements    # a change to the Solid shell or its foundation
```

## The laws

Every law, by what it holds, with the file that states it. Each runs in `pnpm test`, in the
project its path falls under in the table above, unless its row names another gate.

### The theme

| Law | File | What it refuses |
| --- | --- | --- |
| Contrast, glass, gradients, the ink budget | `packages/theme/src/laws.test.ts` | a text/surface pair under the contrast law in any system × palette, in either mode, or on glass over its worst backdrop |
| Coherence and the catalogue | `packages/theme/src/laws.test.ts` | a system whose axes are not a complete, consistent set, a tenant that changes more than its brand, a recipe that reads an axis it is not given |
| Platform floors and parity | `packages/theme/src/laws.test.ts` | a hit target under its platform's floor, or a token document that lacks a token the stylesheet emits |
| The seed sweep | `packages/theme/src/color/resolve.test.ts` | a seed the engine resolves to an unlawful pairing |
| The chart palette | `packages/theme/src/chart-laws.test.ts` | a pairing whose chart colours a colour-blind reader cannot tell apart, or a reference whose inputs do not give its chart colours |
| Native freshness | `packages/theme/src/native.test.ts` | a committed native token source that differs from what `pnpm emit:native` writes |
| Native builds | `packages/theme/src/swift-build.test.ts`, `emit-kotlin.test.ts`, `emit-dart.test.ts` | a token source that `swift build`, `kotlinc` or `dart analyze` rejects (each skipped, with the reason in its title, without the toolchain) |
| Motion agreement | `packages/engine/src/motion/conformance.test.ts` | motion tokens and `design/motion/motion.json` that disagree |

### The red rules and the repository

| Law | File | What it refuses |
| --- | --- | --- |
| Each rule | `packages/rules/src/rules/*.test.ts`, `packages/rules/src/stylelint/*.test.ts` | a rule that misses its violation, reports a lawful file, or fixes one wrongly, in TSX, Vue, Svelte, Solid and Angular |
| The rules in their configs | `packages/rules/src/fixtures.test.ts` | a rule that stops reporting the seeded violations in `packages/rules/fixtures/` under the real configs |
| The rules where they apply | `packages/rules/src/repo-laws.test.ts` | a rule configured but not applied to a tree, and a stylesheet under `apps/` that nothing imports |
| Token existence | `packages/rules/src/token-references.test.ts` | a recipe that reads a `--pm-*` token no pairing emits |
| Spec staleness | `packages/rules/src/spec-api.test.ts` | a prop the React member ships and its spec does not declare, or the reverse |
| `'use client'` | `packages/rules/src/client-directive.test.ts` | a React module that needs the directive and lacks it, or has one it does not need, and a compound member that attaches its parts in a client module, where a server component reads each part as `undefined` |
| Localization | `packages/rules/src/localization.test.ts`, `packages/react-ui/src/localization.test.tsx` | text a member renders that its host cannot replace |
| The inventory | `packages/rules/src/inventory.test.ts` | an undeclared exception, and any change to the exceptions this repository declares |
| The rich-text boundary | `packages/engine/rich-text-boundary.test.ts` | a file outside `packages/engine/src/rich-text-editor/` that imports a ProseMirror package, a document model that imports the editor or any package, or a type either rich-text entry exports that names a ProseMirror type |
| No plan references | `packages/rules/src/plan-references.test.ts` | a ticket or plan identifier, a retired planning document or a phase name in any file |

### The React vocabulary

| Law | File | What it refuses |
| --- | --- | --- |
| Completeness and axe | `packages/react-ui/src/laws.test.tsx` | a states-fixture entry that renders nothing it promised, or has an accessibility violation |
| The galleries | `packages/react-ui/src/galleries.test.tsx` | a fixture missing, misnamed, or routed twice |
| Required selectors | `packages/react-ui/src/selectors.test.ts` | a state no prop can reach that the member's stylesheet never styles |
| Wiring | `packages/react-ui/src/wiring.test.ts` | a member missing from any of the four hand-written lists, named with the list |
| The CSS contract | `packages/react-ui/src/theme-css.test.ts` | custom properties that do not resolve, cascade or re-scope as the emitter intends |
| The exception ladder | `packages/react-ui/src/exceptions/exceptions.test.tsx` | a scope that does not re-scope, or a Bespoke zone that styles its contents |
| Behaviour conformance | `packages/react-ui/src/conformance.test.tsx` | a statement in a spec's `contract` fence that does not hold for the React member ([conformance.md](conformance.md)) |
| Agent conformance | `packages/react-ui/src/conformance.test.tsx`, through `agentConformanceLaw` | a statement in a spec's `agent` fence that does not hold for the React member with a bridge installed, an undeclared action that is not refused with the allowed list, or a disabled entry that lists an action ([agents.md](agents.md)) |
| Consumption and packaging | `packages/react-ui/consumption.test.ts`, `packages/*/packaging.test.ts` | an entry point that does not resolve, a deep import that does, or a published build that drops a directive, imports an undeclared package or bundles what it should not. For the React packages also: a stylesheet imported any other way than through the package's `imports` map, a second copy of a module, and an entry point with a side effect |
| Server render | `packages/react-ui/server-render.test.ts` | a state of a states fixture that throws, or logs an error, when `react-dom/server` renders it from the published build in plain Node |
| Elements from a server component | `packages/react/src/conventions/supplied.test.tsx`, and the tests of FormField, Dialog and SettingsRow | a member that reads an element it was passed before React has loaded it. `serverPassed` in `@polymorph/conformance/server-passed` builds the reference React hands a client component |

### The registry and the maps

| Law | File | What it refuses |
| --- | --- | --- |
| The registry | `packages/registry/src/registry.test.ts` | a registry that fails its own schema, differs on a rebuild, or misses a member; a member that takes keys or focus, dismisses or announces with no behaviour contract |
| The platform map | `packages/registry/src/platforms.test.ts` | a member with no entry in a platform file, a `DECIDE` placeholder, an adapted entry that does not say how it renders, an absent entry without a reason or an existing substitute, a native entry composing an absent member without a reason, or an absent member on the web |
| The framework map | `packages/registry/src/frameworks.test.ts` | a member with no entry in a framework map, a `DECIDE` placeholder, an absent entry without a reason, or a native entry that composes an absent member |
| The contract grammar | `packages/registry/src/behaviour.test.ts` | a `contract` fence that does not parse |
| The agent grammar | `packages/registry/src/agent.test.ts` | an `agent` fence that does not parse, or names a state, prop, handler or fixture entry its member does not have ([agents.md](agents.md)) |
| Agent coverage | `packages/registry/src/registry.test.ts` | a control or an overlay whose spec has no `## Agent` section, one with no prose, or one that still holds the scaffolder's placeholder ([agents.md](agents.md)) |
| Agent staleness | `packages/registry/src/agent-staleness.test.ts` | a state or action a spec's `agent` fence declares that the React member or its description does not register, or the reverse, and a member that registers with no fence |
| Member exceptions | `packages/registry/src/exceptions.test.ts` | a system file's exception for a member that does not exist or does not read the token it re-points |
| Package ranges | `packages/registry/src/install.test.ts` | a range for a published package other than a caret on its own version |
| The named files | `packages/registry/src/files.test.ts` | a file the registry names that this tree does not have, a member's or a primitive's file, a support file, the base layer or a theme document left out of the list the published tools ship |
| The release version | `packages/registry/src/install.test.ts` | a package at a version other than the release's, a registry that reports another, or a changeset config that does not hold every package in one fixed group |
| The system card | `packages/registry/src/card.test.ts` | a card over its character budget, or one that leaves out a member, a law, a rung, a framework, a platform or the packages a consumer installs |

### The generated vocabularies

| Law | File | What it refuses |
| --- | --- | --- |
| Freshness | `packages/shells/src/shells.test.ts` | a generated member, fixture, index, gallery or icon file that differs from what `pnpm shells` writes |
| Completeness, staleness, the map, token-only | `packages/{vue,svelte,solid,angular}-ui/laws.test.ts` | a fixture missing an entry the React fixture or the lawful grid names; a member whose props, events or slots are not the registry's, or a part the registry lists under a member that no description renders; a member native in the framework map without a description, or the reverse; a shell that writes a style or imports outside its allowed set |
| Completeness, identity and axe | `packages/{vue,svelte,solid,angular}-ui/src/laws.test.ts` | an entry that does not render what it promises, a member whose `data-member` no entry shows, or an accessibility violation |
| Hosts | `packages/angular-ui/src/hosts/*.test.ts` | an Angular member whose box differs from its box with the hosts removed: a recipe selector with a child, sibling or structural step that does not reach through a member's host |
| Behaviour conformance | `packages/{vue,svelte,solid,angular}-ui/src/conformance.test.ts` | a contract statement that does not hold for the generated member, or a ledger entry that no longer diverges |
| Agent conformance | `packages/{vue,svelte,solid,angular,elements}-ui/src/conformance.test.ts`, through `conformanceLaw` | an agent fence statement that does not hold for the generated member or for the element over its Solid member, an undeclared action that is not refused, or a disabled entry that lists an action |
| Completeness, staleness, the map, imports | `packages/elements-ui/laws.test.ts` | an element fixture missing an entry the React fixture or the lawful grid names; a definition that does not read the registry's props as `vueBinding` reads them; a member native in the elements map without a description, or the reverse; a definition module that imports anything but the foundation and its own Solid member's module |
| Completeness, identity, axe, conformance | `packages/elements-ui/src/laws.test.ts`, `packages/elements-ui/src/conformance.test.ts` | an entry's markup that does not render what it promises or has an accessibility violation, a member whose `data-member` no entry shows, a contract statement that does not hold through the elements adapter |
| Parity | `packages/elements-ui/src/parity/` | an entry whose document as an element differs from the Solid member's (each element replaced by its children), or a `[data-member]` box of another size: a slot read differently from JSX, an attribute read into another prop, a recipe rule a host breaks |
| Server render | `packages/svelte-ui/server-render.test.ts` | a Svelte member whose server render differs from its browser render |
| Server render and hydration | `packages/{vue,solid,angular}-ui/server-render.test.ts` | a states fixture entry that throws, warns, or reads `window`, `document` or a frame when a server renders it; an entry whose server markup a browser does not hydrate (a mismatch Vue reports, a key Solid does not find, an Angular host rendered afresh); a Solid entry whose hydrated document differs from a mount's |
| Packaging | `packages/{vue,svelte,solid,angular,elements}{,-ui}/packaging.test.ts` | a published entry the build did not write, a dependency the shipped code imports and the manifest does not declare, a stylesheet a bundler could drop; for the elements, a loader that carries a member, a Button page that loads another member, and a `polymorph.css` without the base layer, a recipe, the reach-through forms, the host rule or the rules for an element that has not rendered |

### The native members

| Law | File | Gate | What it refuses |
| --- | --- | --- | --- |
| Contract freshness, mapping, shapes | `packages/native/src/contracts.test.ts`, `kotlin.test.ts` | `pnpm test`, both native gates | a committed contract that differs from what `pnpm native:contracts` writes, a shape that drifts from the web's declaration, or growth in the unsupported or opaque counts |
| Spec strings | `packages/native/src/strings.test.ts` | `pnpm test`, both native gates | a default string that differs from the spec that names it |
| The SwiftUI laws | `packages/native/src/laws.test.ts` | `pnpm test`, `pnpm gate:ios` | a raw value, a hand-typed measure, a literal string, an import outside containment, a member file that is no member's or does not conform, a shadowed token type, a pending list whose length is not its pinned count, or a contract field no rendering reads, or reads only into its identifier, that `undrawn.ts` does not name ([The iOS gate](#the-ios-gate)) |
| The Compose laws | `packages/native/src/kotlin-laws.test.ts` | `pnpm test`, `pnpm gate:android` | the same, in Kotlin, with Material outside its bridge ([The Android gate](#the-android-gate)) |
| The screen emitters | `packages/spec/src/emit-swift.test.ts`, `emit-kotlin.test.ts` | `pnpm test` | an emitted native screen that breaks the screen contract: state, asynchronous work, navigation, a theme or a token in the file |
| The rendering harness | `platforms/ios/Tests/PolymorphUITests`, `platforms/android/ui/src/test/kotlin/dev/polymorph/ui` | `pnpm gate:ios`, `pnpm gate:android` | a fixture entry that renders an empty canvas, or whose identity, label or value is not what its `expect` says |
| The accessibility audits | `scripts/ios-audit.mjs` (`AccessibilityAuditTests` on an iPhone simulator), `scripts/android-audit.mjs` (`AccessibilityAuditTest` under Robolectric) | `pnpm gate:ios`, `pnpm gate:android` | more defects than `scripts/native-audits/thresholds.json` allows ([The audit thresholds](#the-audit-thresholds)). On iOS a defect is an element with no label, a target under 44 points (a text field by the box its member takes its tap in), or an element outside the window that no scroll view holds, at the default and the largest text size, and a control UIKit hosts that takes its taps over less than 44 points is recorded against a number of its own; on Android it is an entry that breaks the harness's semantics rules, a node a person acts on that takes touches over less than 48dp or says nothing, two such nodes with the same bounds, or a node a person types into that carries a content description |

### The tools and the eval

| Law | File | What it refuses |
| --- | --- | --- |
| The agent loop | `packages/spec/agent-loop.test.ts` | a validator whose faults do not lead a scripted agent from a first attempt to a lawful screen |
| The round trip | `packages/spec/roundtrip.test.ts` | a Relay screen spec that does not emit code the real vocabulary typechecks |
| Install and init | `packages/cli/scratch.test.ts`, `packages/cli/init.test.ts` | a vendored install, or a new app, that does not build and lint clean against the packages' builds |
| The MCP server | `packages/mcp/transcript.test.ts` | a tool that fails over a real stdio session |
| The CLI's verbs | `packages/mcp/src/verbs.test.ts`, `packages/cli/src/verbs.test.ts` | a tool with no CLI verb, or a verb that names a tool the server does not register; a one-shot call that answers differently from the server; a verb whose `--json` is not the tool's answer, whose exit code does not say whether the answer was clean, or that reads a command line it should refuse; `polymorph mcp` that drops an answer or does not exit when its client closes stdin |
| The published tools | `packages/tools/packaging.test.ts` | a tarball, cut as the publish step cuts it and installed outside the repository with no workspace above it, whose bins do not run there: `--help` (which lists every verb, `mcp` among them), `init` (whose `.mcp.json` runs `npx` and names no path, and whose app is the checkout bin's apart from `package.json`, the agent files that name the tools and their record), `init` in every other framework and for a page with no build, `agents` in a project (its files name the tools with `npx` and no path, and a rerun changes nothing), `add`, `diff`, `update`, `check` over every framework's files, `theme validate`, every verb that asks a tool (`card`, `search`, `component`, `validate` on code and on a spec, `fix --dry-run`, `emit`, `render` where Playwright's Chromium starts, `theme propose`), and the MCP server over stdio through `polymorph mcp` and `polymorph-mcp` (`get_system_card`, `get_component` with its source, `validate` on code, a stylesheet and a spec, `emit_screen`, `install`, `render_screen` drawing in the shipped page where Chromium starts, and the command that downloads it where it does not); a published bin whose verbs and the server's tools are not each other's; a tarball that holds a file outside the declared set or a path of this machine, misses a file the registry names, or imports a package it does not declare. It builds the elements vocabulary and the tools under their locks first |
| The agent files | `packages/cli/src/agents.test.ts` | a command an agent text or the plugin names that the CLI does not run as written: a verb it lacks, a flag the verb does not take or that lacks its value, too few arguments, or a system, palette, framework, harness or member the registry does not have; a rule or an MCP tool a text names that the registry and the verbs do not; a bare `npx polymorph`; a skill outside the Agent Skills format (its name, its directory, a description over 1024 characters or not a plain YAML scalar, a field the format does not define, a body of 500 lines or more, a reference not linked or not one level deep); a rules skill missing a rung of the registry's ladder or an application rule; an always-loaded block over 45 lines; and `polymorph agents` that writes again on a rerun, loses text outside its block or another server, overwrites an edited file, drops a harness written before, keeps a file a release no longer writes, writes through a link out of the project, writes in a checkout, or writes other files than `init` writes for the same project |
| The plugin for coding agents | `packages/cli/src/plugin.test.ts` | a file `pnpm agents` writes that differs on disk, is missing or is no longer written, or a drawn icon that is missing or the wrong size; a launcher in the plugin that runs a range rather than the release; a manifest past a directory's limits or missing what it requires (Claude Code's: kebab-case name, version, description, author, licence, icon, https links, a README of 40 words, no hooks, one read-only server; the portable one: only the schema's keys, the lengths and counts OpenAI's submission sets, https links, square icons of at least 48 pixels, no hooks or apps, five positive and three negative review cases; each marketplace's required fields); skills the `skills` CLI cannot find through the marketplace; a `server.json` whose name, version, package or description differ from the published tools' `mcpName`, version and command |
| The plugin's tools | `packages/mcp/src/plugin.test.ts` | a review case that names a tool the read-only server does not register, or a skill that names a tool the server does not have |
| The tools add no decision | `packages/tools/entries.test.ts` | a module in the tools' `src/` other than the entry points, an import other than Node, the fronts and the emitter, a registry built at run time, or a polymorph package as a dependency instead of bundled |
| The docs site | `apps/docs/src/llms.test.ts` | an `/llms.txt` that does not point an agent at the card, the tools, every guide's markdown file and every application rule; a guide's markdown file with a link the site does not serve |
| The docs site | `apps/docs/src/page-head.test.ts` | a page title that does not name the pages above it; structured data with an address that is not written in full |
| The eval's harness | `eval/eval.test.ts` | a harness that counts a run the model did not earn, a brief's requirement that names something the vocabulary lacks or that a screen without the part still meets, a run-time request that is not the card, the brief and no tool, or a run-time answer judged before its document is whole, a Codex run that records a count Codex did not report as zero, starts Codex with the owner's configuration or goes on past a total it cannot know, a signal that leaves a harness running or a scratch directory behind, or a report that differs from what `pnpm eval:report` renders ([The agent eval](#the-agent-eval)) |
| The eval's project lane | `eval/project.test.ts` | a project run that gives the harness a prompt or a tool of the eval's or runs its commands unsandboxed, judges a project other than the one the harness left, misses a lawful or an unlawful screen, an empty project, a broken `package.json` or a budget that stops the harness, counts a call, a verb, a skill or a cache the stream and the project do not show, or leaves a harness running after a signal ([The project lane](#the-project-lane)) |

### The run-time screens

| Law | File | What it refuses |
| --- | --- | --- |
| Parity with the registry | `packages/screen/src/parity.test.ts` | a vocabulary table that gives a screen in `design/screens/` or a faulty document other faults than the full registry gives, in any framework; a table that differs from what `pnpm registry` writes from the tree; controlled pairs other than the elements' definitions; a text prop named or documented as an address that is not an address key; a member that takes markup, a script's address or an embed; a default that allows `ThirdParty`; a card other than the registry's |
| What each entry reaches | `packages/screen/src/browser-surface.test.ts` | an import of anything but the package's own modules and the spec's and the registry's pure subpaths; `parsePartial` reaching another module; the walk reaching the vocabulary table, the card or the validator; `checkScreen` reaching the card |
| The run-time contract | `packages/screen/src/walk.test.ts`, `actions.test.ts`, `check.test.ts` | a data input filled with anything but the host's value; a callback input handed by anything but what receives it: a question told to the host, an action not told, a stub passed where an optional question leaves the member to answer, or a callback passed where no callback receives it; a function in the host's data handed to a member; an element drawn below a structured object's field that takes no node, at any depth; an element drawn once whole whose required text or data was never written or was refused; a page not drawn around a slot whose element is a fault or was never written; a member that reads one element it requires (a FormField's control, a SettingsRow's `control`) drawn without it, or an optional one-element prop handed anything but a drawn element; what a key over `MAX_KEY_LENGTH` holds that is read; a control that drops what the reader chose while the document and the host hold the same value; `values` that differ from what the reader sees, or a name two controls share, or every object has, that is not a fault; `changed` naming a control the person did not change; a member the host does not allow, or an address a screen may not hold, that is drawn or not reported; a fault told twice in one drawing, or not told again in a whole document that differs |
| A document that streams | `packages/screen/src/partial.test.ts`, `streaming.test.ts` | a cut of a screen in `design/screens/` that holds a half-written name, number or binding, drawn text that shrinks, or a whole text that reads other than `JSON.parse` reads it; an element drawn without a prop it requires or with a half-written value, or drawn and then left out |
| A hostile document | `packages/screen/src/hostile.test.ts` | an address a screen may not hold that reaches a member in any shape; a value of the document passed where a member calls a function; a plain object passed where the format writes `$object`; a document deeper than the limit that is read past it; an input type over `MAX_TYPE_LENGTH` that is read; one of the test's hostile texts and values that makes the core throw; a kind of input whose cost grows twenty times or more from one size to the larger |
| The card | `packages/screen/src/card.test.ts` | a card over its ceiling, for the default members or for a few dozen; a card that lists a member the host did not allow; a screen written from the card alone that is not lawful, or whose objects do not fit the data types the card describes |
| The renderers | `packages/react/src/screen/*.test.tsx`, `packages/elements-ui/src/screen/*.test.ts` | an element mounted twice while a document streams or its data changes; a field that loses its text or its focus, or shows other than its `values`; a member the host does not allow, an address a screen may not hold in any shape, or a prop its element's definition does not name, that is drawn or set; a ConfirmDialog that does not wait on the host's promise; an action told while a document streams, when it ends or when the data changes, with no one acting; a function in the host's data that a member calls; a document too deep, a swap of `<poly-screen>`'s children or a `members` value it cannot read that is not handled |
| Server render | `packages/react/screen-server.test.ts` | a screen whose server render differs from what the client draws, or tells the host anything, and a member that throws on the server and fails the page around the screen |
| No markup | `packages/elements-ui/screen.test.ts` | an elements renderer module that names an API that reads or writes markup, or holds a tag in a string; an event of `<poly-screen>` that a member dispatches; a member, part or exception primitive with no element |

## Coverage ratchet

```sh
pnpm test:coverage    # vitest run --project logic --coverage
```

Coverage is V8 coverage over `packages/{theme,rules,registry,cli,mcp,spec,screen}/src/**`, reported as text
and as HTML in `coverage/` (gitignored). The thresholds in `vitest.config.ts` (statements 89%,
branches 81%, functions 94%, lines 91%) are set at the tree's measured coverage, rounded down. They
only go up. Raise them when real coverage rises, and never lower one to admit a regression.

Coverage is measured only for `logic`, on purpose. V8 collects coverage from a browser only over the
Chrome DevTools Protocol, which Firefox and WebKit do not support. A threshold over the browser
projects would therefore mean something different on each engine. The browser projects are gated by
the law suite instead.

## Lint, types and the inventory

**`pnpm lint`** (`scripts/lint.mjs`) runs three tools concurrently and reports all three even when
one fails. The exit code is that of the first failing tool.

| Tool | Command it runs | Alias |
| --- | --- | --- |
| ESLint | `eslint . --cache` (cache in `node_modules/.cache/eslint/`) | `pnpm lint:js` |
| Stylelint | `stylelint '{packages,apps}/**/*.css'` | `pnpm lint:css` |
| Prettier | `prettier --check . --cache` | `pnpm lint:format` |

ESLint's cache invalidates on config and version changes, not on an edit to a rule's implementation
in `packages/rules/src`. After changing a rule, run `rm -rf node_modules/.cache/eslint`. Markdown is
excluded from Prettier (`.prettierignore`).

The red rules themselves are tested separately. `packages/rules/src/fixtures.test.ts` lints the
deliberately unlawful screens and stylesheets in `packages/rules/fixtures/` under the real configs.
It requires every rule to report its violation and to stay quiet on the lawful version.
`packages/rules/src/repo-laws.test.ts` asks ESLint and Stylelint which rules actually apply to a
sample file in each tree, so a rule that is configured but not applied fails.

**`pnpm typecheck`** (`scripts/typecheck.mjs`) runs `tsc --noEmit -p` concurrently over every
project (the root, each package and its node config where it has one, both apps and the eval),
with incremental caches in `node_modules/.cache/tsbuildinfo/`.
A node config (`tsconfig.node.json`) checks the node files at a package's root, such as its
packaging test, so the package's own source keeps `"types": []`. Every package's `exports` point
at its source, so no project depends on another's build output.

**`pnpm inventory`** lists every declared exception and exits non-zero on an undeclared one. An
undeclared exception is a `polymorph/` rule disabled by a comment outside any `<Bespoke>` zone.
[rules.md](rules.md#the-inventory) describes what it reports.

## Size budgets

```sh
pnpm build:packages && pnpm size   # size measures the builds, so build them first
pnpm size --why                    # also attribute each fixture's JavaScript to its packages
pnpm size button dialog            # only the named fixtures
```

`pnpm size` (`scripts/size.mjs`) builds each fixture app in `scripts/size/` the way a consumer's
Vite would: against the published builds in each package's `dist/`, minified for production, with
the theme compiled at build time by `@polymorph/engine/vite`. It reports the gzipped JavaScript and
CSS of each, and fails when one is over its ceiling in `scripts/size/budgets.json`. It also fails
when a fixture ships the agent bridge without importing `@polymorph/engine/agent`. An elements
fixture (`elements-*.html`) is a page with no build, so nothing builds it: it is measured from
`packages/elements-ui/dist/cdn/` as a browser fetches it, each file gzipped on its own: the scripts
it names and every module they import, the chunk of each `poly-*` tag it writes, and the
stylesheets it links. Its `--why` lists those files, then attributes them to packages from the same
build written again without minifying.

| Fixture | What it measures |
| --- | --- |
| `react-floor` | React alone: the minimum every React application ships |
| `button` | one member, with the icon gateway and the compiled theme |
| `list-page` | an archetype with a table: the motion engine, presence and the layout members |
| `dialog` | an overlay: the motion engine plus Radix's dialog behaviour |
| `runtime-engine` | the theme engine admitted in the browser: the cost of runtime theming, paid only by an application that uses it |
| `vue-button` | Vue's runtime and one member of `@polymorph/vue-ui`, with the Vue icon gateway and the compiled theme |
| `svelte-button` | Svelte's runtime and one member of `@polymorph/svelte-ui`, compiled by the fixture's own Svelte, with the Svelte icon gateway and the compiled theme |
| `solid-button` | Solid's runtime and one member of `@polymorph/solid-ui`, compiled by Solid's Vite plugin from the source its `solid` export condition resolves to (`dist/source/`), with the Solid icon gateway and the compiled theme |
| `angular-button` | Angular's runtime, zoneless, and one member of `@polymorph/angular-ui`, linked from the partial declarations the packages ship, with the Angular icon gateway and the compiled theme |
| `agent-bridge` | a React page with a Checkbox and a Button that creates an agent bridge and registers its tools: the cost of `@polymorph/engine/agent`, paid only by an application that imports it |
| `elements-button` | a page with no build that writes one `<poly-button>`: `prepaint.js`, `polymorph.js` and what it imports (Solid's runtime, the bridge and the definitions table), the chunks of Button and what it composes, `polymorph.css` and the plain theme sheet |
| `elements-all` | the same page loading `polymorph-all.js`, every element in one file |
| `elements-agent` | the `elements-button` page with `<html data-agent="on-call">`: what it fetches before any tool is called |
| `elements-screen` | a page with no build that writes one `<poly-screen>` holding a document in its script child: what `elements-button` fetches, the run-time renderer's chunk and the vocabulary table, and the chunk of each member the document names ([run-time-screens.md](run-time-screens.md#what-it-costs)) |

The ceilings catch machinery that should not reach production code. A ceiling is raised only with
its reason in the same commit. [`scripts/size/README.md`](../scripts/size/README.md) describes the
fixtures.

## The layout scan

```sh
pnpm build && pnpm layout            # the scan measures the built workbench, so build it first
pnpm layout breadcrumbs '^/pages/'   # only the routes a pattern matches
```

`pnpm layout` (`scripts/layout.mjs`) opens the workbench's own pages in Chromium and runs the
layout measure on each. The measure is the one `render_screen` answers with
(`apps/workbench/src/screen/measure.ts`). The pages are every member's gallery, the Relay screens
and the sample pages under `/pages`. A gallery draws every entry of its member's states fixture,
so the scan reads every state the vocabulary declares. Each page is measured twice, in a 375×812
window and in a 1440×900 one, with reduced motion, so every state is at rest.

A fault on any page fails the run:

| Fault | What it is |
| --- | --- |
| `sideways-scroll` | the page scrolls sideways, or a region does that was not built to pan |
| `clipped-text` | text its own box cuts with no ellipsis, or a word wider than its box |
| `cut-off` | a control or text that a box hides, or that is past the page's edge, with nothing that scrolls to it |
| `small-target` | a control whose hit area is under 24px, with another control inside the 24px circle centred on it (WCAG 2.5.8) |
| `no-gap` | a member that touches another member with nothing between them in a box that lays its children out in flow, as a field touches a table in a Card, or whose border lies against the inside of a box's border with no inset |
| `unseen-focus` | a control that, with keyboard focus, draws no mark, draws only an outline under 2px, or draws an outline under 3:1 against what it is drawn on or cut by a box that cannot scroll to it (WCAG 2.4.13, 1.4.11) |

A page that throws fails the run too, and so does a gallery that does not draw.

**`no-gap`** measures a member whose root (`data-member`) is a control or paints a border, a fill
or a shadow. A member that paints nothing, such as a Table, a Stack or an Image's frame, has no
edge to keep apart, so a table edge to edge in ListPage's bordered body and a full-bleed image in
a Card are not reported. A member's parts carry no `data-member`, so a field and its clear button,
SplitButton's two halves, a segmented group and the rows of a List, Menu, Tree or Table are one
member. Two members touch only where their box lays its children out in flow: a flex or grid
container's gap is the decision of the member or layout that owns it, and a block such as Card's
has no gap, so members in it touch unless something spaces them. An edge is followed out through
the boxes that end where it ends, so a field in a FormField touches what follows the FormField.
Against a box's border, a member is reported only where it draws a border of its own, so that two
borders run together: a search field's frame against a panel's border is reported, and a
borderless button that a member places flush in its own frame, as DatePicker does, is not. While a
member has keyboard focus its border is left out, because the focus convention recolours it. A bar
is never reported: a member square at every corner and as long as its box along one axis runs edge
to edge by design, as Banner does. A member that is positioned is placed by its member's recipe and
is not reported either.

**`unseen-focus`** gives each control keyboard focus with `focus({ focusVisible: true })`, which
makes `:focus-visible` match whatever the last input was, so `render_screen` and the scan get the
same state from inside the page and neither presses a key. It runs last, because it moves focus,
and it waits a task after each focus for the page to commit what the focus queued, such as a
menu row's highlight. What the control, its pseudo-elements, its descendants, its siblings and the
boxes around it draw is compared with what they drew without focus: a mark on the field's frame
(`:has(> input:focus-visible)`), on an interactive Card (`:has(:focus-visible)`) or on OTPInput's
caret cell counts. A change of fill, border or shadow is a mark, and only an outline's colour is
measured. Inside the control's edge the outline is measured against the fill of the box that
carries it, or of the nearest box around it with a fill, and outside the edge against what is
around that box, with a translucent outline composited first. Where an image is painted under it,
it is not measured. A control a modal dialog keeps focus from is skipped. So is a text field that
is the only control taking focus in a modal dialog, such as Command's search field: focus is
nowhere else while the dialog is open, and the caret shows it. A focus trap can give focus back to
a control as soon as it leaves, so the control is never drawn without focus. Its outline is then
measured as drawn, and a control with no outline is not reported. Transitions are switched
off while it runs, and focus, scroll positions and transitions are put back after it. State a
member keeps from a focus is not put back: Tabs selects the tab it focuses.

A component test checks the widths its author thought of. The scan checks every state at both
widths, which is where a member that fits a desktop and not a phone is found. The scan keeps no
list of accepted faults. A fault is fixed where it is decided:

- **In the member**, when a screen would have it too: the recipe or the component, with a test in
  the member's own test file that fails without the fix.
- **In the fixture**, when the fixture draws the member as no screen does: a stacked `SplitPane` in
  a box with no height, a wordmark in `AppShell`'s collapsed rail. A generated fixture changes
  through its description.
- **In the measure**, when the report is false. `packages/mcp/src/measure.test.ts` gets a page that
  looks like the fault and is lawful.

The scan serves `apps/workbench/dist` itself, on a port the system picks, so it needs the build
and no free port. It runs on Chromium only: the measure asks the page what a touch lands on, and
the engines gate does not repeat it.

## The site check

`pnpm site` (`scripts/site.mjs`) is the step that turns the docs site into the files a host
serves. It is also a check, because it opens every page. It serves `apps/docs/dist`, starts at
`/`, and follows each link to a page of the site until it has opened them all, in Chromium.

It fails on:

- a page that throws or logs an error while it renders, which includes a request for a script,
  picture or font the build lacks;
- a link to an address of the site that has no page. A link inside a state that a component's page
  draws live is not followed, because it is the fixture's sample content: the page marks the box
  each state is drawn in;
- two pages with one title, which a search result would list as the same line twice;
- a crawl in which no page held the themes' stylesheet, which would leave every saved page
  unthemed;
- a `dist` the step has already written, which no longer holds the application's own document.

It then writes what each page rendered as `dist/<route>.html`, with `404.html`, the sharing
picture, `robots.txt` and, when `VITE_SITE_URL` names the site's address, `sitemap.xml`.
`pnpm gate` runs it with `--no-build`, on the build `pnpm build` has just made.
[apps/docs/README.md](../apps/docs/README.md) says what a host must serve.

## The full gate

There is no hosted CI that checks a change. A change is checked on the machine where it is made,
and a release cannot skip the check: `pnpm publish:packages` runs the gate before it uploads, and
the publish workflow uploads to npmjs.com only a tag whose message records that the gate passed on
its commit (CONTRIBUTING.md).
Each platform has its own gate, and a change runs the gate for what it touches. `pnpm gate` is the
web gate. It runs every step in order and stops at the first failure:

```sh
pnpm gate   # typecheck, lint, inventory, test, test:coverage, build, site, layout, build:packages, size, gate:no-build (Chromium), gate:next
```

`pnpm gate:ios` ([The iOS gate](#the-ios-gate)) and `pnpm gate:android`
([The Android gate](#the-android-gate)) are separate, because each needs a native toolchain the
web loop does not. `pnpm test` already runs their file-reading laws in the `logic` project, so a
web change that would break a native contract fails `pnpm gate` too.

`pnpm gate:engines` ([The engines gate](#the-engines-gate)) is separate too. `pnpm gate` runs the
browser projects on Chromium, and that gate repeats them on Firefox and WebKit.

`pnpm gate:no-build` ([The static-page check](#the-static-page-check)) runs after the size
budgets, on Chromium, against the files `pnpm build:packages` has just written; `pnpm gate:engines`
runs it on Firefox and WebKit.

`pnpm gate:next` ([The Next.js gate](#the-nextjs-gate)) is the gate's last step. It is a script of
its own, not a test in a vitest project, because it runs two production builds and a development
server, which use every core. A vitest project runs beside the browser projects, whose tests
wait on timers. As the last step it runs alone, on the builds `pnpm build:packages` has just
made.

The gates run on the Node version in `.node-version` (24), which is also the `engines` floor in
`package.json`.

### Browser installs

```sh
pnpm exec playwright install chromium          # every browser project, pnpm gate:no-build, pnpm gate:next and pnpm proof
pnpm exec playwright install firefox webkit    # pnpm gate:engines, and pnpm gate:no-build on those engines
```

On a fresh Linux machine add `--with-deps`, which installs the browsers' system libraries.

## The engines gate

`pnpm gate:engines` runs every browser project on Firefox and on WebKit, the `elements` project
included. `pnpm gate` runs them on
Chromium only, so this gate is what holds a member's behaviour on the other two engines. Run it
when a change touches a member, a recipe, a foundation or a browser test, and before a release:

```sh
pnpm gate:engines                                        # both engines, one after the other
pnpm gate:engines webkit                                 # one engine
pnpm gate:engines firefox packages/vue-ui/src/overlays   # one engine, and a path for vitest to filter by
```

`scripts/gate-engines.mjs` starts one `vitest run` for each engine with `PM_BROWSER_MATRIX=1`. Both
engines always run, so a failure on Firefox does not hide one on WebKit, and the script ends with a
line for each. With no path or other vitest argument it then builds the two elements packages and
runs the static-page check ([The static-page check](#the-static-page-check)) on the same engines. It runs only the browser projects, because the `logic` suite never opens a browser
and another engine would show nothing new about it.

It is its own gate for two reasons. It needs Playwright's builds of the two engines, and an engine
that is not installed fails the gate with the command that installs it. It also runs the browser
suite twice more, with each project's files one at a time, which is too slow for the loop
`pnpm gate` serves.

A test that fails on one engine only is one of three things:

- **The member behaves differently there.** Fix the member. Safari leaves a pressed button
  unfocused and takes focus off it on `mousedown`, so a member that returns focus to "where it was"
  returns it nowhere.
- **The test reads the engine.** Its default locale is the machine's on Firefox and WebKit, and
  each engine writes a computed or inline style its own way. Make the test say what it means.
- **The test tooling cannot do it on that engine.** Declare a skip on a limit that
  `packages/conformance/src/engines.ts` names (the browser matrix, above).

A test that passes on Chromium and fails here has often acted before the member settled. A Zag
machine focuses its panel or field a frame after it opens, and a key sent before that frame can
arrive before the machine listens for it. Wait for the state the next step depends on, such as
focus inside the panel.

## The static-page check

`pnpm gate:no-build` (`scripts/gate-no-build.mjs`) checks the files a page with no build loads, as
such a page loads them: `packages/elements-ui/dist/cdn/` and the pages in `scripts/no-build-page/`,
served as plain files by a server in the script, with no bundler and no dev server. It is a script
and not a test in the `elements` project because it reads the published build, which `pnpm gate`
writes after the test projects have run. On each engine it checks:

- the prepaint script, a classic script first in `<head>`, applies a stored mode;
- while `polymorph.js` is held back, and again once it has defined the tags while Dialog's chunk is
  held back, a closed Dialog's content is hidden, its trigger shows, and a table's row and the
  table lay out as a row and a table (`pending.css`); every other element waits for the held code;
- the members render from markup: attributes, a slot's content, a table's parts, and an element
  added to a slot later whose code nothing had loaded; no chunk of a member the page does not use
  is fetched;
- a `<form>` around an Input, a Checkbox and a Select posts what the reader entered;
- a Dialog opens from its trigger, shows its content and footer, closes on Escape and returns focus,
  three times;
- an htmx-style `innerHTML` swap of an element's children and an `outerHTML` swap render the new
  markup once, and a morphing swap that leaves out `disabled` enables the button and keeps the host
  state;
- a page snapshot (`innerHTML` saved and written back) renders as the page did when `restore`
  ran before it was saved, and renders a Card inside itself when it did not;
- a bridge the page loads with `loadAgentBridge` lists the Input, the Checkbox, the Select and the
  Buttons with what they hold and no closed Dialog, fills, checks and chooses, is refused by a
  disabled Button, and posts the form by pressing its submit Button; the bridge's chunk is
  fetched when the page asks for it;
- with a stand-in for the browser's WebMCP API installed before the page loads: a page without
  `data-agent` registers nothing and fetches neither the tools' definitions nor the bridge; with
  `data-agent="on-call"` it registers the three tools with the definitions `agentTools` gives,
  fetches the definitions' chunk and not the bridge's, fetches the bridge's on the first call, which
  lists the page's members, runs later calls against the same bridge, and refuses the page's own
  `registerWebMCP` with a warning; with `data-agent="eager"` it fetches the bridge and registers at
  load; an unknown value warns and registers nothing; and without the API `on-call` fetches nothing;
- `polymorph-all.js` renders a Dialog with no chunk, its bridge lists and closes that Dialog, and
  both scripts export `restore`, `toast` and `loadAgentBridge`; with `on-call` and with `eager` it
  registers the three tools at load, a call lists the page's members, and no chunk is fetched;
- a `<poly-screen>` draws the document in its `<script type="application/json">` child and draws no
  box of its own, a press of its Button dispatches `poly-action` with the named Input's text in
  `values` and its name in `changed`, and `loadScreen` resolves to `drawScreen`, `parsePartial`, `checkScreen`,
  `runtimeCard` and `outputContract`; a page with no `<poly-screen>` fetches none of the screen's
  code, a page that draws one fetches its renderer and the vocabulary table and not the validator
  or the card, and `loadScreen` fetches those two;
- an attribute an element cannot read is reported in the console by `polymorph.js` and by
  `polymorph-all.js`, and the element renders without that prop;
- no page logs an error or fails a request.

```sh
pnpm gate:no-build                          # builds the two elements packages, then all three engines
pnpm gate:no-build webkit                   # one engine
pnpm gate:no-build chromium --no-build      # on the files already in dist/cdn/, as pnpm gate runs it
```

## The Next.js gate

`pnpm gate:next` builds a Next.js App Router application from the published builds of
`@polymorph/engine`, `@polymorph/rules`, `@polymorph/react` and `@polymorph/react-ui`, and checks
what only a framework that renders on a server decides. `pnpm gate` runs it last. Run it by
itself when a change touches the React packages' builds, a member's `'use client'` directive, the
theme runtime or the CLI's theme install:

```sh
pnpm gate:next                       # builds the four packages, then every stage
pnpm gate:next dev                   # one stage: turbopack, webpack or dev
pnpm gate:next webpack --no-build    # on the builds already in each package's dist/
```

`scripts/gate-next.mjs` assembles the application from the fixture in `scripts/next-app/`. It
copies the fixture to a temporary directory, installs the theme there with
`polymorph add theme:plain`, copies the result to `scripts/next-app/dist/app`, and assembles
`node_modules` the way the CLI's acceptance tests do (`packages/cli/consumer-app.ts`): each of our
packages as npm would publish it, from its `dist`, and every other dependency linked from this
repository's install. The gate therefore needs no network. `next` is a dev dependency of this
repository for this gate alone. The application is assembled inside the repository because
Turbopack reads no file outside its root, and it is left in place after a run, for reading a
failure.

It then runs the red rules and three stages:

| Stage | What runs | What it checks |
| --- | --- | --- |
| lint | the application's own ESLint, with the config `polymorph add` linked | the application as written passes, ESLint read its files, and seeded unlawful code is reported by each rule it breaks |
| `turbopack` | `next build`, then `next start` | the files the build wrote, then the application in Chromium |
| `webpack` | `next build --webpack`, then `next start` | the same |
| `dev` | `next dev` | the application in Chromium. React's development build hands a client component an element from a server component as a reference that is still loading, and reports a hydration mismatch in full |

From the files a production build wrote, the gate checks that every member class in each
prerendered page has its rule in a stylesheet that page links, and that a page with one Button
links Button's stylesheet and loads neither Table's stylesheet nor DataTable's module. It prints
what that page weighs.

In Chromium it opens each route and fails on any console error, console warning or uncaught
error, which is where React reports a hydration mismatch. It also checks:

- the pre-paint script, with the page's own scripts blocked: a stored dark mode is applied, and
  so is the system's setting when nothing is stored;
- the theme after hydration: a stored mode survives, a ModeSwitch the server rendered with
  System checked shows the stored mode, a stale stored system and palette are replaced and their
  keys cleared, the mode follows a change of the system's setting, a token resolves, and the base
  layer applies;
- the members a server component renders: a Dialog opens from the trigger it was passed and
  closes on Escape, a FormField labels an Input, a Switch and a RadioGroup, a SettingsRow names
  its control, and Tooltip, Popover and HoverCard open from their triggers;
- a compound member's parts read in a server component: Table's, Tabs' and `Avatar.Group`;
- the same page reached through the router, with `onNavigate` and `router.push`, where the
  elements arrive in a response the client reads while the page's modules load;
- the members that take functions, in a client component: DataTable selects a row, and a Tooltip
  there finds the provider the server layout rendered. Two copies of a member's module would be
  two contexts, and the Tooltip would find none.

[`scripts/next-app/README.md`](../scripts/next-app/README.md) says what each route is for.
`packages/react-ui/server-render.test.ts` holds the part of this that needs no framework: every
state of every member renders in plain Node.

The gate holds the versions of Next.js and React this repository installs. A consumer on another
major version of Next.js is not covered by it.

## `pnpm proof`

`pnpm proof` (`proof/run.mjs`, with screenshot capture in `proof/shoot.mjs`) runs the guarantees
instead of describing them. On each run, either every claim holds or the script names the one that
failed.

What one run does:

1. **Clears `proof/shots/`** and records the commit.
2. **Builds and serves the real app.** Each "studio" runs `pnpm build`, serves the built workbench
   with `vite preview --strictPort` on port 4173, and drives Chromium through Playwright at a device
   scale factor of 2. It refuses to start if something already serves port 4173, because the shots
   would then show that server. It shoots the built app, not the dev server, because the claims are
   about what ships.
3. **Shoots the baseline scenes** at 1440×900 (`BASELINE_SCENES`): Relay's inbox under a set of
   house systems, each in its own default palette and in light, dark or both; the form, settings,
   command palette and glass overlays; two page exemplars; the chart members; the two motion
   extremes; and a density scope. A scene sets `data-system`, `data-palette`, `data-mode`,
   `data-motion` or `data-density` directly on `<html>`, because the claim is that the attribute
   alone re-themes everything. Using a picker would test the picker instead.
4. **Runs the two motion probes**: legibility at `none`, and rapid interruption (guarantees 7 and 8
   below).
5. **Runs the phone lane** in a second studio at 375×812 (below).
6. **Performs each churn** (guarantee 1). It hashes the zone that the churn claims stays unchanged,
   applies the edit, runs the checks, hashes again, rebuilds and shoots, then restores every file
   the churn declared, byte for byte.
7. **Runs `pnpm inventory`** and the red-rule fixtures (`packages/rules/src/fixtures.test.ts`) and
   prints both.

It exits non-zero if a churn changes its zone or fails its checks, if either motion probe or the
phone lane reports a fault, if the product logs a page error, a console error or an HTTP response of
400 or above while the baseline or phone scenes are shot, or if the inventory fails.

**Evidence** is written to `proof/shots/` as PNGs: `inbox-<system>-<mode>.png`, `churn-<id>-*.png`,
`phone-*.png`, `charts-*.png` and the rest, one per scene. The directory is gitignored, so the shots
are regenerated rather than committed. Every run deletes and rewrites the directory, so the shots
are the run's full output, not a selection.

**Running it:** Chromium must be installed and port 4173 free. It builds once per studio and runs
the full suite for three of the churns, so it is slow. Churn edits are applied to real files and
restored afterwards. It works on a dirty tree, but do not edit the decision files a churn touches
while it runs. No gate runs it.

### The phone lane

The phone lane checks the narrow-viewport law ([layout.md](layout.md)) at 375×812: no horizontal
page scroll and no clipped control at the narrowest device the system supports. `PHONE_SCENES`
shoots a selection of members and page archetypes from the galleries, overlays as sheets (dialog,
menu, select, date picker), a toast, and two Relay screens. The Relay screens are needed because the
shell-scoped part of the layout exists only inside AppShell, so the archetypes cannot test it in a
bare gallery.

The screenshots matter less than the measurements. Each scene is also measured in the page, to 1px:

- the document does not scroll sideways, measured against `documentElement.clientWidth`;
- no visible element's box crosses **either** edge of the window (a right-aligned row that is too
  wide pushes its first control off the left edge, where nothing scrolls);
- no scroll container pans sideways, except a `Table` marked `data-overflowing`, the one member
  allowed to pan.

A fault in any scene fails the run. `packages/cli/scratch.test.ts` makes the same measurement on a
consumer's built page ("the built page fits a phone").

The lane is a selection of scenes, and no gate runs it. `pnpm layout`
([The layout scan](#the-layout-scan)) measures every gallery and sample page at this width and at
a desktop's, in `pnpm gate`. The lane adds what a gallery cannot show: an overlay open over a real
screen, and the screenshots.

## The ten guarantees

Each guarantee below is a product acceptance test, written as a promise, with the checks that prove
it.

### 1. A redesign touches only the decision layer

A re-theme (a different default system, an amended pattern token, a remapped icon, a re-painted
system, a rotated palette) is made by editing decision-layer files only. Nothing under `apps/`
changes.

**Proved by** the churns in `pnpm proof` (ids as `proof/run.mjs` names them):

| Churn | The edit | Must not move | Checks | Evidence (`proof/shots/`) |
| --- | --- | --- | --- | --- |
| a | `design/defaults.json`: `"system": "plain"` → `"terminal"` | `apps/` | typecheck + `pnpm test` | `churn-a-default-terminal.png` |
| b | a taller `--pm-shell-topbar-height` in `app-shell.module.css`, roomier `--pm-page-padding-*` in `list-page.module.css` | `apps/` | typecheck + `pnpm test` | `churn-b-pattern-amendment.png` against `inbox-plain-light.png` |
| e | the `settings` icon role points at a wrench (`design/icons.json`, `packages/react/src/icon/map.tsx`); a wider stroke spread in `packages/theme/src/derive.ts` | `apps/` | typecheck + `pnpm test` | `churn-e-icons.png` against `inbox-terminal-dark.png` |
| f | `design/systems/pastel.json`: `defaultPalette` `amethyst` → `petrol` | `apps/` and every `.css` under `packages/{react-ui,react}/src` | typecheck | `churn-f-palette-swap.png` against `inbox-pastel-light.png` |
| g | `design/palettes/ember.json`: `accentHue` 31 → 150, which rotates every chart colour | `apps/` and the recipes | typecheck | `churn-g-chart-repalette.png` against `charts-donut-ember.png` |

The zone is measured by content: a SHA-256 of every tracked and untracked file in it (respecting
`.gitignore`), before and after the edit. The measurement therefore reflects the churn alone, not
whether the tree differs from `HEAD`, and it works on a dirty tree.

Churns f and g run typecheck instead of the suite, on purpose. The suite pins the shipped catalogue
by name. The CLI's install plan knows which palette `pastel` uses, the MCP catalogue reports it, and
the chart laws hold each palette to the colour caps it declares. Those pins fail under the churn.
This supports the claim: only assertions about the catalogue detect the re-paint, and no line of
`apps/` or of a recipe changes. Guarantee 4 proves that the new pairing is lawful on the unchanged
tree, because it covers every system × every palette.

Churn b stays local because of `scoped-token-owners`. Only the files listed in
`packages/rules/scoped-token-owners.json` may reference `--pm-shell-*` or `--pm-page-*`, so no other
file can use the amended value.

### 2. A new screen needs no visual decision

A screen, whether a person or an agent writes it, composes the vocabulary and binds content. It has
no way to add a colour, a length or a control of its own.

**Proved by:**

- The red rules over all of `apps/**` ([rules.md](rules.md)). Relay
  (`apps/workbench/src/relay/`) and the page exemplars (`apps/workbench/src/pages/`) contain no
  stylesheet, no `className`, no `style` outside the one declared zone, no raw control, no icon
  import or inline `<svg>`. Spacing is a typed token step chosen through a prop
  (`<Stack gap={6}>`), so an off-scale value is a type error.
- `packages/rules/src/repo-laws.test.ts` asks ESLint which rules govern `apps/workbench/src/App.tsx`
  and requires every application rule to be among them. It also catches a stylesheet under `apps/`
  that nobody imports, which ESLint would never visit.
- The screen-spec format: `packages/spec/src/spec.test.ts` ("has no field for a style or for
  logic") and `packages/spec/roundtrip.test.ts`, which emits every spec in `design/screens/` to
  TSX that the vocabulary's own types accept.

### 3. One screen, many themes: same structure, no style values, each coherent

One screen rendered under different house systems has identical structure and zero style values,
and each result is internally coherent.

**Proved by:**

- The baseline shots: `inbox-<system>-<mode>.png` is the same DOM from the same file under each
  system in its own palette. `inbox-pebble-light.png` and `inbox-desktop-light.png` share their
  colours (both systems declare `azure`), so every difference between those two frames is
  structural: geometry, density, motion.
- `packages/theme/src/laws.test.ts`, coherence. Every system validates against the schema and
  resolves both modes with no warnings. Designed systems differ on at least three of eight axes
  (one, for the reference-calibrated systems). `pastel` and `terminal` differ on at least five and
  have different default palettes. Every combination of axis values in the whole space derives a
  coherent system, not only the ones that ship.
- Systems and palettes are found by glob (`apps/workbench/src/themes.ts`), so a new file in
  `design/systems/` or `design/palettes/` appears in the menu, the emitted stylesheet and every law
  with no edit to `apps/`.

### 4. Every expressible theme passes the contrast law

**Proved by:**

- `packages/theme/src/laws.test.ts`, "contrast law: every system × every palette, both modes":
  every lawful pairing in `packages/theme/src/pairings.ts` is measured with APCA over every system
  in `design/systems/` × every palette in `design/palettes/` × light and dark, from the strings the
  emitter actually writes. The test reads the directories, so a new system or palette is covered as
  soon as its file exists. This matters because the product's palette picker offers every palette on
  every system.
- `packages/theme/src/color/resolve.test.ts`, "property: any valid seed resolves lawfully": a sweep
  of hues × every chroma budget × every temperament, strategy and depth. It shows that the engine
  keeps the law for themes that no file in the catalogue holds.
- The WCAG 2.1 ledger in the same `laws.test.ts`. APCA is the law, but auditors use WCAG. Everything
  outside a declared class passes both standards. The declared class (`text.secondary`,
  `text.muted`, tonal `*.text` roles, on-solid `*.contrast` labels) may fall between AA-large and
  AA, never below AA-large. `text.primary` and `text.inverse` pass both everywhere. Because of that
  ledger, axe's `color-contrast` rule is switched off in `packages/react-ui/src/laws.test.tsx`.

### 5. An agent can produce a lawful screen from the registry alone

An agent given only the registry and a screen brief produces a spec that passes every red rule,
either on the first attempt or after correcting itself using the system's own feedback.

**Proved by:**

- `packages/spec/agent-loop.test.ts` over `design/screens/agent-loop/`: `brief.md` names no
  component. `attempt-1.json` makes the mistakes agents typically make and is rejected with specific
  faults and paths: a style prop, a variant × tone cell that does not exist, a hallucinated icon
  role, a binding to nothing, an omitted empty state, a component that is not in the vocabulary
  (with "did you mean" suggestions). `attempt-2.json` uses only what the system card mentions,
  answers the brief, and emits TSX that passes every red rule and typechecks against the real
  `@polymorph/react-ui`.
- `packages/mcp/transcript.test.ts`: a scripted session against a real `polymorph-mcp` process over
  stdio, exercising every tool. Its `validate` output is compared with `eslint` under this
  repository's config, rule by rule and column by column. Each violation carries the ladder rungs
  that answer it. The write tools write a screen, an install and a theme into a scratch directory
  outside the workspace. A `--read-only` server offers none of the write tools. `render_screen`
  returns its pictures over the transport, and a server started where Playwright has downloaded no
  browser answers that tool with the install command and every other tool as before.
- `packages/mcp/src/verbs.test.ts`: every CLI verb that asks a tool, run through `main` with the
  real one-shot caller in a scratch project outside the workspace. `--json` prints exactly what the
  tool answers for the same call; `validate` prints one line for each violation; `emit` writes the
  bytes `emit_screen` writes; `render` writes its pictures beside the spec, and is skipped, saying
  why, on a machine where Playwright has no Chromium. The caller's answers are compared with the
  server's over an in-memory transport, refusals and schema errors included. `polymorph mcp` is
  spoken to by hand over stdio and exits 0 once it has answered everything sent before stdin
  closed.
- `packages/mcp/src/render.test.ts`: `render_screen` as a function, in a real Chromium over the
  page the workbench's builder builds in memory. A lawful spec comes back as one PNG for each width,
  of the window's size. A row told not to wrap is reported at the phone's width and not the
  desktop's. The populated and the empty drawing are different pictures. Every request that cannot
  be drawn (an unlawful spec, an unknown system, data for an input the spec does not declare) is
  refused before a browser starts.
- `packages/mcp/src/measure.test.ts`: the layout measure `render_screen` answers with
  (`apps/workbench/src/screen/measure.ts`), in a real Chromium over pages written for it. Each fault kind has a page that has the fault and a page that looks like it and is
  lawful: text a box cuts and text a member shortens with an ellipsis, a region that pans because
  its content is too wide and a region built to pan, a small control with a neighbour and one
  alone.
- `packages/rules/src/rules/*.test.ts` and `packages/rules/src/fix.test.ts`: every fix a red rule
  has, checked by its exact output, and every case it must leave alone. The fixes then run together
  until none is left, on a screen written as it would be without the system. What is still reported
  afterwards matches what linting the output reports.
- `packages/mcp/src/write.test.ts`: each write tool against temporary projects. An emitted screen
  passes every red rule. An install matches the plan `get_install_plan` returns and keeps an edited
  file. A saved theme loads through the engine's parsers. Every refusal (an unlawful spec or pair, a
  path outside the project, a file somebody else wrote) leaves the project unchanged.
- `packages/cli/scratch.test.ts`: `polymorph add` into a real Vite app outside the workspace. The
  app typechecks, builds with the theme's webfonts, passes axe, fits a phone, and fails lint on a
  seeded style decision. The vendored vocabulary stays lawful under the rules installed with it.

**Measured by** the agent eval (below): a real model, eight briefs, and the rates at which its
screens come out lawful, first time and in the end, and with every part the brief requires.
`eval/README.md` holds the number once a real run is committed.

### 6. A request the vocabulary cannot express routes to a rung, never a silent override

**Proved by:**

- Every application rule has an entry in `RULE_CLIMB` (`packages/rules/src/ladder.ts`, enforced
  by `packages/rules/src/fixtures.test.ts`) naming the rungs that would allow the change, and the
  MCP `validate` tool returns those rungs with each violation. `scoped-token-owners` names none,
  because it is about ownership, not deviation: the answer is to own the pattern or to read a
  theme-scoped token.
- A silent override cannot pass the gate. A `polymorph/` rule disabled outside a `<Bespoke>` zone
  fails `pnpm inventory`, which `pnpm gate` runs.
- In this repository, Relay's promo illustration is a declared zone
  (`apps/workbench/src/relay/WhatsNew.tsx`), and `Select`'s `emptyOption` is a promotion. An open
  gap is recorded in `apps/workbench/src/relay/NewTicketPage.tsx` instead of being worked around:
  `Combobox` cannot match on text it does not display.

### 7. Motion re-themes with no application diff, and stays legible at `none`

Switching motion temperament, including to `none`, changes every transition in the system with no
application-code changes. Every state remains legible at `none`.

**Proved by:**

- The mechanism. Temperament is the `data-motion` attribute, and every duration, easing and spring
  is a `--pm-motion-*` token, so switching temperament needs no code edit.
  `packages/engine/src/motion/patterns.test.ts` ("temperament scaling", "reduced motion") and
  `packages/react/src/motion/presence.test.tsx` ("temperament switching rescales the engine") cover
  the CSS and engine halves.
  `conformance.test.ts` checks the emitted tokens against `design/motion/motion.json`.
- The shots `overlay-motion-expressive.png` and `overlay-motion-none.png` show the same dialog with
  one attribute changed.
- The legibility probe in `pnpm proof`. A screenshot cannot distinguish a panel that has arrived
  from one that is 40% of the way there. So at `none` the probe opens Relay's discard confirm with
  no settle time and asserts three things: the panel is an `alertdialog`, the panel and its scrim
  are at full opacity and untransformed, and no element in the document has a non-zero
  `transition-duration`.

### 8. Interrupting a transition never janks, teleports or drops input

**Proved by:**

- The interruption probe in `pnpm proof`. It types a draft into Relay's new-ticket form, then opens
  and dismisses the discard confirm eight times as fast as Playwright can dispatch. It asserts that
  no dialog remains after its dismissal, the draft is still in the field, and the page did not
  navigate.
- `packages/react/src/motion/presence.test.tsx`: "law 1 — a reversal continues from the current
  value" and "law 3 — motion never blocks input". `packages/react-ui/src/overlays/dialog.test.tsx`
  covers the focus trap.

This holds because of how motion is built. Always-on transitions are CSS, which is interruptible.
The motion engine is used only for what CSS cannot do: exit choreography and unmount coordination
([motion.md](motion.md)).

### 9. Arbitrary brand seeds produce a lawful theme with no human in the loop

**Proved by:**

- The shipped tenant. `design/systems/harbor.json` copies `terminal`'s eight axes, and
  `design/palettes/ember.json` contains seeds nobody tuned. Together they pass every law in
  `laws.test.ts` with no adjustment. The test "the tenant reuses its base system and adds only its
  brand" asserts that harbor's axes equal terminal's while its palette differs. Evidence:
  `inbox-harbor-light.png`, `inbox-harbor-dark.png`.
- `packages/theme/src/admit.test.ts`, "the engine holds for arbitrary in-schema seeds": edge-case
  seeds (the hue seam at 0/360, the tint ceiling, the achromatic budget, glass) go through
  `admitTheme`, the same entry point `polymorph theme validate` uses for a consumer's own system and
  palette.
- The seed sweep in `color/resolve.test.ts` (guarantee 4).

Fonts are the limit of this guarantee, because they are assets, not derived values. A system that
names a family the app has not installed would render in its fallback stack. `pnpm registry`
therefore refuses to generate an app's font-loader map (`apps/*/src/fonts.gen.ts`) until the package
is added.

### 10. Every deviation is declared, and the full list is one command

Every deviation from the vocabulary is traceable to a declared scope, patch or zone, and the whole
inventory is queryable in one command.

**Proved by:**

- `pnpm inventory`, which runs in `pnpm gate` and in every `pnpm proof` run. It lists declared
  exceptions and exits 1 on an undeclared one. [rules.md](rules.md#the-inventory) has the details.
- `packages/rules/src/inventory.test.ts`: fixtures for every rung and for the undeclared case
  (including a disable beside a childless `<Bespoke />`, which covers nothing, and a disable quoted
  inside a string, which is not a comment). It also asserts the exact exceptions this repository
  declares, by rung, kind and file, and that nothing in the product is undeclared.
- Guarantee 2's red rules. Outside a declared zone, a deviation cannot be written without a lint
  failure.

## The agent eval

`pnpm eval` (`eval/run.mjs`) measures how easy the system is for an agent to use. It gives a model
one screen brief at a time and the system's own tools, and records how the model gets on: whether
the screen it hands back is lawful, whether that screen has every part the brief requires, and
what it took. The agent-loop test (`packages/spec/agent-loop.test.ts`) proves the loop with a scripted agent: the
faults are specific, and a corrected spec passes every law. The eval measures what a real model
does inside that loop.

It reaches the model through one of three runners. The API runner (`--runner api`, the default)
sends each request to the Messages API itself and needs `ANTHROPIC_API_KEY`. The CLI runner
(`--runner cli`) runs each brief through `claude -p`, the owner's own Claude Code, and needs no
key, because the CLI signs in the way it does for the owner. The Codex runner (`--runner codex`)
runs each brief through `codex exec`, the owner's own Codex, signed in the same way. Every runner
gives the model the same prompt and the same tools, stops it at the same points, and judges and
records it the same way, so their numbers compare, apart from what Codex does not report.

The project lane ([The project lane](#the-project-lane)) measures something else: a coding
harness, Claude Code or Codex, started in an app the tools set up, with only what the tools wrote
there to help it, and judged on the project it leaves.

### What a run does

The briefs are in `eval/briefs/`: a list with filters and a destructive action, a settings page with
a danger zone, a sign-in and sign-up pair, a dashboard with stats and one chart, a form with
validation and a date, a detail page with a timeline and comments, a chat screen with a composer and
tool calls, and an onboarding step. Each has the shape of the agent-loop brief: who the screen is
for, what it has to do and what it must not do. None names a member, and `eval/eval.test.ts`
checks that, so the eval measures whether an agent finds its way to the vocabulary rather than
whether it can transcribe a list of components.

For each brief, the harness:

1. Sends a system prompt holding the brief, the output contract for the mode (`eval/contracts/`),
   and one instruction: call `validate` before you answer, fix every violation, and stop when it is
   lawful. Nothing else about the vocabulary is in the prompt.
2. Offers four tools, each one the repository's own function loaded through `jiti`
   (`eval/toolbox.mjs`). `get_system_card`, `search_components` and `get_component` answer as the
   MCP tools of the same names do, and `get_component` adds the opening and the API section of the
   member's design spec. `validate` checks what the agent wrote. A second `get_system_card` call
   in a run gets the same text from the run's own copy, and is still counted.
3. Loops until the model answers, the iteration cap is reached (by default five `validate` calls,
   the last of them not lawful), or the run has made 40 requests.
4. Judges the final document itself, with the same check `validate` runs, whatever the model
   claimed about it. A response that ended in a refusal or at `max_tokens` is never lawful,
   whatever document it carried.
5. Checks the final document against the brief's requirements
   ([Whether the screen meets its brief](#whether-the-screen-meets-its-brief)). The model is never
   shown them.

There are two modes. In `spec` mode, the default, the agent hands back a `polymorph-screen/1`
document. `validate` checks it against the registry, emits it as TSX and runs the red rules over the
TSX, as `pnpm emit` does before it writes anything. In `tsx` mode the agent hands back a module that
imports from `@polymorph/react-ui`. `validate` runs `@polymorph/rules/verify` over it, and adds one
check: the module must import from the vocabulary at all. `tsx` mode does not typecheck, so a
variant × tone cell that does not exist passes it. `spec` mode catches that cell. A third mode,
`runtime`, offers no tool and sends one request, as a product that draws a model's screen at run
time does ([The run-time lane](#the-run-time-lane)).

What goes wrong is kept apart from what the model did:

- **A transient failure is retried**. The API runner retries up to six times: an HTTP 408, 409,
  429 or 5xx, a dropped connection, and an `overloaded_error`, `api_error` or `rate_limit_error`
  that arrives mid-stream. The CLI retries for itself, and the CLI runner counts the retries it
  reports. Each record counts its retries and the time spent waiting for them (`retries`,
  `backoffMs`), and `wallMs` leaves that wait out. An attempt that broke off had already been
  billed for what it read; those tokens are recorded as `discardedTokens`, never in the input or
  output counts.
- **A tool that throws** answers the model with an error result carrying the message, and the run
  goes on. In the API runner, a tool input that is not a JSON object is never run: the call is
  answered as an `INVALID_JSON` error holding the raw text and the parser's reason, and the model's turn goes back with an
  empty input for that call, because the API refuses any other kind. Where the call was
  `validate`, it counts as a submission that is not lawful, as a document that is not JSON does
  when it is submitted as text. The CLI reads tool inputs itself.
- **`validate` failing inside its check** (the validator or the emitter throwing on a document) is
  the harness's failure, not the model's. The run ends as `harness`, with the message in
  `harnessFault` and the document kept as submitted, and is left out of every rate and mean.
- **A request the API refuses, a failure that outlasts the retries, a CLI that fails or reports
  an error, a usage limit, or a token ceiling** stops the whole eval. The results file is
  rewritten after every run, so the runs that finished are kept; the file is marked `partial`,
  and `stopped` says why and what the unfinished run had spent.

### Whether the screen meets its brief

`lawful` says the document breaks no rule. It does not say the screen does what the brief asked: a
list page with no way to delete an incident is still lawful. Each brief therefore has requirements
in `eval/requirements/<brief>.json`, and the harness checks the final document against them. A
record's `meetsBrief` is true when every one holds, and `failedRequirements` names the ones that do
not.

A requirement is a check on the document, never a model's opinion of it. The harness reads the
document into its elements: which member each one is, what each prop is given and what is inside
it. A spec is read as the JSON it is and a TSX module through the TypeScript parser, so one
requirement reads both modes (`eval/requirements.mjs`). A check is one of these statements:

| Check | Holds when |
| --- | --- |
| `element` | at least one element matches the pattern |
| `count` with `min` | at least `min` elements match the pattern, or any pattern of a list |
| `any` | at least one of the checks inside it holds |
| `all` | every check inside it holds |

A pattern names a member or a list of members, the props the element has to be given, and an
element that has to be inside it. A prop is tested in one of these ways:

| Test | Passes when the prop is |
| --- | --- |
| `given` | present, and not literally `false`, `null` or an empty string |
| `dynamic` | bound to an input or computed, or a list, object or element that holds such a value, so it changes with the data |
| `{ "is": … }` | literally that value |
| `{ "matches": … }` | fixed words the regular expression matches, ignoring case |
| `{ "items": … }` | a list of at least `min` items, each of which passes the tests on its fields; or bound or computed whole, because its items are then the container's and cannot be read |

The prop `children` is also what the document writes inside the element, so a requirement can read
the words of a link. `eval/requirements/kinds.json` names lists of members that do one job, such
as `filter` and `choice`, and a pattern may name a kind in place of a member.
`eval/requirements-shape.ts` describes both files.

A TSX module can say the same thing in more ways than a spec, and the reader follows these:

- A name the module declares as a `const` with a fixed value is read as that value, in the scope
  that declares it. `title={TITLE}` is as fixed as the string.
- A member is read under the name the module's import gives it, so a renamed import and a
  namespace import are the member they import.
- An element inside a `map` or `flatMap` call stands for as many as the data holds, and meets any
  `count`.
- A prop the element does not write, when the element is given props by a spread, is taken as
  bound. The spread may carry it, and the reader cannot see which props a spread carries.

The brief for the list of incidents asks for filters for severity and for open or resolved, and
for a deletion that asks first and names the incident. Its requirements read those sentences as
follows. `two-filters` holds when the document has two elements of the `filter` kind.
`delete-asks-first` holds when it has a `ConfirmDialog`, a `Dialog` given `alert`, or a `Dialog`
with a footer and a danger `Button` inside it. `confirmation-names-the-incident` holds when the
dialog's title, description or typed confirmation is `dynamic`, or its body holds text that is,
because a sentence that names one incident cannot be fixed text.

The requirements follow these rules:

- **The model is not told.** A requirement names members and the brief may not, so the
  requirements are never in a request. `eval/eval.test.ts` reads the requests an eval sends over
  HTTP and finds no requirement's sentence or id in them.
- **A requirement accepts every lawful way to meet it that its author knew.** A search is a
  `SearchInput` or an `Input` of type `search`; a confirmation is a `ConfirmDialog` or an alert
  `Dialog`. Literal text is only ever one of several ways to meet a requirement, because a screen
  may bind its words to an input.
- **A requirement that cannot be read from the document is left out.** A spec has no loop, so it
  hands its rows and its chat turns to an input. What each row shows, and how a tool call or an
  approval request inside a turn is drawn, have no requirement for that reason. A sentence a
  screen can meet by leaving something out has none either: the first onboarding step may show
  no way back at all.
- **What is bound is taken as what the brief asked for.** A button whose label is an input may
  be the download or may not, and the document does not say. The requirement passes it, and
  fails a button whose fixed label says something else.
- **The requirements are held to the vocabulary.** When the eval starts, every member, compound
  part and prop a requirement names has to exist in the registry, or the eval refuses to start
  and lists each fault. A brief with no requirements file, or with an empty one, is refused the
  same way. A renamed prop therefore stops the eval; it cannot turn into a requirement no screen
  meets.

A requirement is evidence that a part is in the document. It does not run the screen, so it does
not show that the filter filters. A screen can also meet its brief in a way no requirement
accepts, and it then counts as not meeting it. The report prints each unmet requirement with its
sentence, so that case can be seen and the requirement widened.

Each results file records, for every brief it ran, the requirements' ids and sentences and a
digest of the ids and checks (`requirements`). Two results files with different digests for a
brief were judged by different requirements, and the report does not compare their `meetsBrief`
rates. Rewording a requirement's sentence changes no verdict and no digest.

### The API runner

The request uses adaptive thinking and caches the conversation's prefix. Effort is the model's
default unless `--effort` names a level, which is sent as `output_config.effort`; the results record
the setting either way (`default` when none was sent). The request asks for no refusal fallback,
because a fallback would answer with a different model from the one being measured.

### The CLI runner

`--runner cli` starts `claude -p` once per run, in an empty directory outside the repository, so
the CLI reads no CLAUDE.md. It passes:

- the API runner's system prompt (`--system-prompt`), and its opening message on stdin;
- one MCP server and no other (`--mcp-config`, `--strict-mcp-config`): `eval/mcp.mjs`, which
  serves the four tools under the same names, descriptions and schemas, answered by the same
  functions. It serves the eval's tools rather than `polymorph-mcp`'s because the two differ where
  the eval measures: the eval's `validate` also emits a spec and holds the TSX to the red rules,
  and its `get_component` adds the design spec. A model offered `polymorph-mcp` could stop on a
  verdict the API runner's model is never shown;
- no built-in tool (`--tools ""`), the four MCP tools allowed and anything else refused
  (`--allowedTools`, `--permission-mode dontAsk`);
- none of the owner's settings, plugins, hooks or skills (`--setting-sources ""`,
  `--disable-slash-commands`), and no saved session (`--no-session-persistence`);
- `--model`, and `--effort` unless it is `default`;
- the API runner's `max_tokens`, as `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, and the eval's environment
  without the `CLAUDE*` variables a Claude Code session sets for the processes it starts. Among
  those are the session's effort and a switch that renames MCP tools. The variables that choose
  how the CLI signs in are kept.

The CLI drives the loop, and the runner reads it. The CLI's `stream-json` output, with the raw
stream events (`--include-partial-messages`), carries each response's usage as the API reported
it. The MCP server writes a journal line for every call before it answers, which carries each
`validate` verdict, and one when it lists its tools. The runner reads a journal line only once it
ends in a newline, and the server marks no tool read-only, so the CLI runs a turn's calls one at a
time and the journal holds the verdicts in the order the model asked for them. An exception while
the runner reads the stream stops the CLI before it stops the eval. The runner stops the CLI where the API runner
would stop sending requests: when the last tool result of a turn goes back and the iteration cap,
the request limit or a ceiling is reached, at a harness fault, and after a response that ended in
a refusal or at `max_tokens`. The CLI may have sent its next request by then; that request is
abandoned, and it is not in the record. The scripted model gives the same records through both
runners, wall time aside, and `eval/eval.test.ts` holds them equal.

The CLI adds text of its own to the conversation. Claude Code 2.1.299 puts one line before the system prompt,
saying the model is a Claude agent built on the Agent SDK, and a note after the opening message
with the working directory, the platform, the model's name and the date. It also chooses its own
effort when none is passed: 2.1.299 sends `medium` for Claude Sonnet 5.5, whose default through
the API is `high`. A CLI run meant to sit beside an API run at the default effort passes
`--effort high`. Each results file records the runner and the CLI's version (`runner`,
`cliVersion`), and the number names both.

The CLI has to wait for its MCP servers before its first request, and has to send a thinking
setting the model accepts. A CLI whose first request goes out before the server has listed its
tools stops the eval with that reason. Claude Code 2.1.92 does that, and it also asks for a fixed
thinking budget, which the API refuses for Claude Sonnet 5.5. `--claude <path>` runs a CLI other
than the `claude` on the `PATH`.

A usage or rate limit the CLI reports stops the eval with `stopped.reason` `usage-limit`. The runs
that finished are kept, marked partial, and a partial file is never the number.

### The Codex runner

`--runner codex` starts `codex exec` once per run, the owner's own Codex. It needs `--model`,
because Codex names no model in what it reports and the results must name the model they
measured. `--codex <path>` runs a Codex other than the `codex` on the `PATH`. No eval has
been run through a real Codex. Two smaller checks have met one (Codex CLI 0.146). Each lane's
arguments were given to a Codex that was not signed in, which reads them, starts its MCP servers
and stops at the first request. One turn was run signed in, with the project lane's arguments, in
a project `polymorph agents` had set up, asked to read a skill and to call the project's server.
The rest of what the runner does with a run rests on Codex's documentation and source, and the
list at the end of this section says what a first eval has to confirm.

It gives Codex what the CLI runner gives Claude Code, in Codex's terms (`eval/run.mjs` names the
page each one rests on beside it):

- a Codex home of the run's own (`CODEX_HOME`), empty but for a link to the owner's saved sign-in
  (`auth.json` in their Codex home), so none of their configuration, global `AGENTS.md`, plugins,
  MCP servers, hooks or memories reach the run. `CODEX_API_KEY` is kept and every other `CODEX*`
  variable is dropped;
- an empty directory outside the repository to work in, which is not a Git repository
  (`--skip-git-repo-check`), and no saved session (`--ephemeral`);
- the API runner's system prompt as `model_instructions_file`, which replaces Codex's built-in
  instructions, and its opening message on stdin;
- the eval's MCP server and no other (`-c mcp_servers=…`), marked `required` so a server that does
  not start fails the run, with every tool approved (`default_tools_approval_mode = "approve"`).
  With no person to ask (`approval_policy = "never"`), Codex denies an MCP call that needs
  approval, and a tool the server does not mark read-only needs one. Each tool's output limit is
  raised so every answer comes back whole;
- none of its own tools: the shell, images, subagents, connectors, web search, skills and the
  skills catalogue are turned off, and the sandbox is read-only;
- `--model`, and `model_reasoning_effort` unless `--effort` is `default`.

Codex reports less than Claude Code, and the record says so rather than filling it in:

- It reports its tokens once, in `turn.completed`, when it finishes. A run the runner stops before
  then (at the iteration cap, the request limit or a harness fault) records its tokens as `null`,
  never zero, and the mean of a count is over the runs that report it. Its `input_tokens` counts
  the cached input too. The runner records `cached_input_tokens` as the cache read and
  `cache_write_input_tokens`, where Codex reports it, as the cache write.
- It reports no request, so `turns` is `null`, and the request limit is counted in tool calls.
- It reports no request it sent again, so `retries`, `backoffMs` and `discardedTokens` are `null`.
- It reports no stop reason and no cost, so no run of it ends `refusal` or `max_tokens`, and no
  cost is printed.
- The token ceilings hold only as far as its reports allow
  ([The token ceilings](#the-token-ceilings)): `--max-tokens-per-run` is refused, and a run whose
  tokens are unknown stops the eval before its next run.

The runner reads each MCP call as Codex reports it started and completed, and checks the
iteration cap when the last call in flight completes. A command, a file change, a web search, a
subagent or a call to another MCP server in the stream means a tool other than the four was
offered and used. Every run would go the same way, so the eval stops and says so. Codex also
offers the model its plan tool, which no setting turns off. A plan writes nothing and calls
nothing, so a run that plans goes on, and its record counts each plan Codex started or updated
(`planUpdates`, its `todo_list` items). `--effort` passes every level the eval
takes, `max` included, which Codex's documentation lists among its levels; a model that lacks a
level refuses it, and the eval stops with Codex's error. It also stops when Codex finishes
without having listed the eval's tools, reports `turn.failed` (with `stopped.reason` `usage-limit`
when it words a usage limit), or exits before its turn ends.

What the Codex that was not signed in settled:

- `codex exec` takes every flag both lanes pass, and `codex --version` prints a number the runner
  reads.
- With `--strict-config`, which refuses a key Codex does not know, it takes each `-c` override as
  written, the inline tables for `mcp_servers` and `skills.config` included, but two. It does not
  know `features.view_image`, so that version keeps its image tool. It does not know the output
  limit written for each tool of a server, so the runner also passes `tool_output_token_limit`,
  which it does know. Without `--strict-config`, as the runner starts it, it passes over both.
- A `required` server that does not start fails the run before any request.
- A project's `.codex/config.toml` loads only when the home's `config.toml` trusts the project by
  its path with every link resolved. `codex exec` refuses `--trust`, and a `-c` override trusts
  nothing.
- The stream opens with `thread.started` and `turn.started`. A request that fails is an `error`
  event with a `message`, worded `Reconnecting...` while Codex sends it again.

What the turn that was signed in settled:

- A linked `auth.json` signs Codex in from a home of the run's own.
- With `approval_policy = "never"`, a call to a server whose tools are approved
  (`default_tools_approval_mode = "approve"`, laid over the server the project's
  `.codex/config.toml` defines) goes through.
- The stream is the one the readers expect. An item is reported in `item.started` and
  `item.completed`. A `command_execution` item carries `command`, `aggregated_output`,
  `exit_code` and `status`. An `mcp_tool_call` item carries `server`, `tool`, `arguments`,
  `result`, `error` and `status`. An `agent_message` item carries `text`, and the last one is the
  answer. `turn.completed` carries `usage` with `input_tokens`, `cached_input_tokens`,
  `cache_write_input_tokens`, `output_tokens` and `reasoning_output_tokens`.
- Codex runs a command through a shell (`/bin/zsh -lc "…"`), and reads a skill with a command
  that names its `SKILL.md`, which the project lane's reader counts as the skill loaded.

What only an eval through Codex can confirm:

1. That each override of the tools lane does what its name says once a model runs, beyond being
   read: that the feature switches take Codex's own tools away, so the four tools are all the
   model is offered (the runner stops the eval if one is still used), and that
   `model_instructions_file` replaces the built-in instructions, with what Codex adds to the
   prompt besides, as the CLI runner's section lists what Claude Code adds.
2. `turn.failed`, which the turn did not meet, and the words Codex uses for a usage limit.
3. That `usage` is the whole run's when a run takes several requests, and that its
   `input_tokens` includes the cache-written tokens. In the turn it included the cached ones.

The stand-in (`eval/fake/codex.mjs`) speaks the event format as Codex's source defines it, checks
every argument the runner passes and the environment it gets, and calls the eval's MCP server for
real. The item shapes it writes are the ones the signed-in turn reported.

### The token ceilings

Two ceilings guard what an eval can cost. Each counts tokens the way a record does: every input
token, cached or not, every output token, and `discardedTokens`.

| Flag | Default | Reached |
| --- | --- | --- |
| `--max-tokens-per-run` | 1,000,000 | by one run; a run of the default model reads about 150,000 |
| `--max-tokens-total` | 10,000,000 | by the whole eval; eight briefs at five runs each fit |

They are checked before every request, so no request starts once either is reached. The CLI
runner checks them before it starts the CLI and when the last tool result of a turn goes back. A
run that finishes on the request that crossed one is kept, and the per-run ceiling starts again
with the next run. A run that needs another request past either ceiling stops the eval, with a
partial results file.

A ceiling holds only over tokens a harness reports, so what holds differs by harness:

| Runner | Per-run ceiling | Total ceiling |
| --- | --- | --- |
| `api` | before every request | before every request |
| `cli`, and Claude Code in the project lane | when the last tool result of a turn goes back | the same, and before each run |
| `codex`, and Codex in the project lane | refused: Codex reports its tokens only when its turn completes, so no run can be stopped part-way; the results record `maxTokensPerRun` as `null` | before each run, over the tokens the finished runs reported |

A run whose tokens are unknown is a Codex run stopped at the iteration cap, the request limit or
its budget, or a Claude Code run in the project lane stopped before its first response ended. Its
record holds `null` tokens. What happens next depends on whether `--max-tokens-total` was given:

- **Not given**: the run is recorded and the eval goes on. The default total ceiling counts only
  the tokens the runs reported, so it no longer bounds what the eval spends.
- **Given**: what the eval has spent is no longer known, so the ceiling the owner asked for can no
  longer be held. The eval stops before its next run with `stopped.reason` `tokens-unknown`, and
  the report says that a run's tokens went unreported, not that the ceiling was reached. When the
  run is the eval's last, nothing more is stopped.

Codex writes a count of its tokens to its session store as it goes, which `--ephemeral` turns off
and the runner does not read: its format is Codex's own and not documented.

### What it measures

Per run, as `eval/results.schema.json` describes:

| Field | Meaning |
| --- | --- |
| `firstShotLawful` | the first `validate` call reported no faults, no violations and nothing fatal |
| `iterations` | `validate` calls up to and including the first lawful one; null when none came back lawful |
| `lawful` | the final document passes the check; never for a run that ended in `refusal`, `max_tokens` or `harness` |
| `meetsBrief` | the final document meets every requirement of its brief; never for a run that ended in `refusal`, `max_tokens` or `harness`. It is judged apart from `lawful`: a screen can be either without the other |
| `failedRequirements` | the ids of the requirements the final document does not meet; every id when the document cannot be read; empty for a run that ended in `refusal`, `max_tokens` or `harness`, which is not judged |
| `ended` | `answered`, `cap`, `turns`, `max_tokens`, `refusal`, or `harness` for a harness fault |
| `inputTokens`, `outputTokens` | from the API's `usage`, summed over the run; the CLI runner reads the same `usage` from the stream events the CLI passes on, and the Codex runner from the `usage` Codex reports when it finishes, and records `null` for a run it stopped before then. Input counts cached and uncached tokens; `cacheReadTokens` and `cacheWriteTokens` say how much of it was which |
| `discardedTokens` | tokens of attempts that broke off and were sent again |
| `wallMs` | wall-clock time for the run, tool calls included, retry waits left out; for the CLI and Codex runners, from the harness's start-up report to the end of the run |
| `turns` | requests the run made; `null` for the Codex runner, which reports none |
| `retries`, `backoffMs` | requests sent again, and the time spent waiting before them |
| `violationsSeen` | everything `validate` reported, counted: red-rule violations by rule, spec faults by kind with names and values elided |
| `misses` | each `validate` call that came back unlawful, in the validator's words: its number, what was fatal, the faults, the violations and the contract messages, so a miss can be acted on; the report lists each run's first-shot miss under its table. Absent in a results file written before the field was kept |

Per brief and overall, the summary gives how the runs ended, four rates, the mean `validate` calls
of the runs that ended lawful after a lawful call, and the mean tokens and time per run, with
harness faults left out of each. The rates are the first-shot rate, the lawful rate, the rate of
runs that meet their brief (`meetsBriefRate`), and the rate of runs that are lawful and meet their
brief (`lawfulAndMeetsBriefRate`). `measured` is the number of runs each rate is over, and each
rate has its interval beside it ([How far a rate can be trusted](#how-far-a-rate-can-be-trusted)).
`failedRequirements` counts, for each requirement some run did not meet, the runs that did not
meet it. A run that ended lawful without any lawful `validate` call has no call count, so it is
counted on its own (`lawfulWithoutValidate`) and never in the mean. The summary also sums the
retries, their wait and the discarded tokens. The documents the agent handed back are kept in a
file beside the results, not in them.

A results file written before a field existed does not have it. The schema accepts such a file,
and the report says its screens were not judged against their briefs.

### The run-time lane

`pnpm eval --mode runtime` measures what a product that draws a model's screen at run time gets
from one request with no tools ([run-time-screens.md](run-time-screens.md)). The system prompt is
the run-time card alone (`runtimeCard` from `@polymorph/screen`, the output contract at its end),
for the framework and members the run names, as one block marked for the prompt cache. The message
is the brief, followed by the instruction to build the screen it describes. Every run of an eval
sends the same card, so after the first request the card is read from the cache, as it is for a
product that caches its card. The request offers no tools.

The answer is read as a product reads it, with `parsePartial`, and judged only when its document
is whole: with `checkScreen` for the card's framework and members, and against the brief's
requirements, which read a run-time document as they read a `spec` one. An answer with no whole
document (none, one cut short, or one that stops being JSON) is not lawful and meets no
requirement, and `fatal` says which. A response that was refused or cut off at `max_tokens` is not
judged, as in the other modes. One request is its own first shot, so a record has `lawful` and no
`firstShotLawful`, and no `iterations`, `violationsSeen` or `misses`.

| Flag | What it does |
| --- | --- |
| `--framework <name>` | the card's and the check's framework; the registry's default (`react`) when absent |
| `--members default\|<subset>\|<A,B,…>` | the members the card lists and the check allows: the framework's default, a subset in `eval/members/<subset>.json` (a lowercase name), or a list joined by commas. A name the vocabulary does not have stops the eval before any run |
| `--thinking adaptive\|disabled\|between_tools` | sent as `thinking.type`; `adaptive` when absent. Which value a model accepts is the model's, and a refused value stops the eval with the API's error |

`--max-iterations` is refused in this mode, which makes no `validate` call, and `--thinking` with
the CLI runner, which chooses its own thinking, and with `--fake`. The three flags belong to this
mode, and another mode refuses them.

Besides the fields every record has, a run-time record keeps the input tokens apart:
`uncachedInputTokens`, `cacheWriteTokens` and `cacheReadTokens` beside their sum, `inputTokens`.
`firstTokenMs` is the time from sending the request that was answered to the first text of the
answer, thinking left out: the moment a product could start to draw. The summary gives the lawful
rate, the rate that meets its brief and the rate that does both, each with its interval, the
answers with no whole document (`unreadable`), the mean tokens of each kind, and the mean time to
the first text and to the end, each with the fastest and the slowest run beside it. The results
record the card: its framework, how its members were chosen, every member it lists, and its length
in characters (`card`).

The CLI runner runs the lane through `claude -p` with no tool at all: an MCP configuration that
names no server, `--tools ""`, the card as the system prompt and the brief on stdin. It stops the
CLI at the end of the first response, and stops the eval when the CLI starts with any tool or MCP
server. It cannot measure the time to the first text, which it records as `null`, and the CLI adds
text of its own to the prompt and sets its own cache breakpoints, so its cache split is the CLI's.

The Codex runner runs the lane through `codex exec` with an MCP configuration that names no
server, its own tools off, and the card as `model_instructions_file`. A run that uses a tool stops
the eval. It has no time to the first text either, and its cache split is Codex's.

A run writes `eval/results/<date>-<model>-runtime.json` (`-runtime-cli.json` through the CLI
runner, `-runtime-codex.json` through the Codex runner). `eval/README.md` prints the lane after the
loop modes, in a section of its own, with its own number for each model, runner, thinking setting,
effort, framework and members. A run is compared only with an earlier one that has the same
settings. `eval/fake/<brief>.runtime.json` scripts each brief's answer for `--fake`, and
`eval/eval.test.ts` runs the lane through every runner with it.

### The project lane

`pnpm eval --mode project --runner cli|codex` measures what the other modes cannot: how a person's
coding harness gets on in a real app, where the only help is what the tools wrote into it (an
`AGENTS.md`, an MCP entry, the system card, the skills `polymorph agents` writes, and the CLI).
The harness is Claude Code (`--runner cli`) or Codex (`--runner codex`). The API runner starts no
harness, so the lane refuses it (`eval/project.mjs`).

Once per eval, the lane sets up a template with the tools:

1. `polymorph init template --framework <framework>` (`--framework`, `react` when absent), which
   writes the app and installs its packages as `init` does for a person. A scripted harness
   (`--fake`) and `--no-install` install nothing.
2. `polymorph agents --harness claude|codex`, when the tools have that verb, so the harness finds
   its skills and its MCP entry. Tools that answer that there is no such command leave the harness
   with what `init` wrote, and the results say so (`project.agents`).

Each run copies the template into a scratch directory outside the repository. The copy keeps
symbolic links as they are, so the relative links of pnpm's `node_modules` resolve inside it, and
clones files where the file system can, so an installed app costs little to copy. npm's cache,
pnpm's store, pnpm's metadata cache and pnpm's state are in the eval's scratch directory too, for
the install of a `--tools` tarball, the template's install, every harness and the judge's scripts
(`npm_config_cache`, `npm_config_store_dir`, `npm_config_cache_dir`, `npm_config_state_dir`, and
pnpm's own `pnpm_config_` names for the last three). Both sandboxes below let a command write
there, so a harness can install a package into its own copy, and the owner's own caches, store and
state are never written. The template is installed into that store, so an eval fetches the app's
packages once, and a copy's `node_modules` and the store a harness's pnpm finds agree.

The harness starts in the copy with the brief on stdin, followed by one sentence asking for the
screen, and nothing else from the eval: no system prompt and no tool. The owner's own
configuration is kept out, as in the other runners, and the project's is left in:

- **Claude Code**: `--setting-sources project`, so the project's settings, `CLAUDE.md` and skills
  load and the owner's do not; the project's `.mcp.json` with `--strict-mcp-config`;
  `--permission-mode acceptEdits` with `Skill` and each of the project's MCP servers allowed; and
  `--permission-prompts none`, so whatever would wait on a person is refused
  ([cli-reference](https://code.claude.com/docs/en/cli-reference.md)). Where Claude Code keeps its
  own state depends on how it signs in. Signed in from its environment (`CLAUDE_CODE_OAUTH_TOKEN`
  from `claude setup-token`, an API key or bearer token, or a cloud provider), it gets a
  configuration directory of the run's own (`CLAUDE_CONFIG_DIR`). Signed in with `/login`, it
  keeps the owner's: Claude Code keys that sign-in to its configuration directory, in the macOS
  Keychain or in `.credentials.json`, so another directory would not be signed in
  ([authentication](https://code.claude.com/docs/en/authentication.md)). The results say which
  (`project.harnessHome`).
- **Codex**: a home of the run's own, as in the Codex runner, whose `config.toml` trusts the
  project, so the project's `.codex/` configuration and MCP servers load (`codex exec` takes no
  flag that trusts a project); `approval_policy = "never"` with every tool of
  each server the project configures approved, as a person at the prompt would approve it; and
  the owner's own skills (`~/.agents/skills`, `/etc/codex/skills`) turned off by path.

Each harness's commands run in a sandbox:

| | Claude Code | Codex |
| --- | --- | --- |
| How | `--settings` with `sandbox.enabled`, `failIfUnavailable` (it refuses to start rather than run unsandboxed), `allowUnsandboxedCommands: false` (a blocked command is not retried outside it) and `autoAllowBashIfSandboxed`, so no `Bash` permission is given ([sandboxing](https://code.claude.com/docs/en/sandboxing.md), [settings](https://code.claude.com/docs/en/settings.md)) | `--sandbox workspace-write` ([config reference](https://learn.chatgpt.com/docs/config-file/config-reference)) |
| Commands write | the project, the per-user temporary directory, and the eval's cache and store (`sandbox.filesystem.allowWrite`); never the template (`denyWrite`) | the project, `/tmp` and `$TMPDIR`, which holds the eval's cache and store |
| File tools write | the project only (`permissions.blockWritesOutsideWorkingDirectories`) | through the same sandbox |
| Network | npm's registry and GitHub Packages only (`sandbox.network.allowedDomains`) | any host (`sandbox_workspace_write.network_access`) |
| Its own state | a configuration directory of the run's own when it signs in from its environment; signed in with `/login`, the owner's `~/.claude.json` and `~/.claude/`, which Claude Code itself writes, outside the sandbox | a Codex home of the run's own, always |
| Not confined | reads anywhere the owner can read, the home directory included; MCP servers, which run outside the sandbox; Claude Code's own writes to its state, above | reads anywhere; MCP servers; the template, which sits in `$TMPDIR` |

Neither sandbox keeps a harness from reading the owner's files, and both leave the temporary
directory writable. So after every run the lane checks that the template every run copies is
unchanged, and stops the eval when a harness wrote into it, because the runs after it would not
start from the same app.

A budget stops each run: `--max-turns` (80 when absent), counted in responses for Claude Code and
in tool calls for Codex, which reports no response, and `--max-minutes` (20 when absent). Stopping
a harness stops its process group, its MCP servers and any command it left running included. A
command that leaves that group (one started with `setsid`, or a daemon) is not stopped: the lane
knows a harness's processes only by its group, and the operating system offers no other handle on
everything a process started. A run the budget stopped is judged all the same, on what it left.

When the harness ends, the lane judges the project:

| Field | Holds when |
| --- | --- |
| `lawful` | the tools' `polymorph check --json` reads every file and reports no violation, and every spec the harness wrote under `src/screens/` passes the check `validate` runs. The red rules read code, so a spec the harness never emitted is held to the spec check |
| `builds` | the app's `typecheck` and `build` scripts pass, run with pnpm; `null` when the app was not installed |
| `meetsBrief` | the screen meets every requirement of its brief ([Whether the screen meets its brief](#whether-the-screen-meets-its-brief)); `null` when the screen is in a form the requirements cannot read |

What the harness wrote is found by comparing every file of the copy before and after the run
(`written`), leaving out installed packages, a build's output (`dist`, `build`, `out`,
`coverage`), the caches the frameworks' tools write (`.vite`, `.angular`, `.svelte-kit`, `.cache`,
`.turbo`, `*.tsbuildinfo`, `.eslintcache`) and `.git`. The screen is the specs it wrote under
`src/screens/`, read together. When it wrote none, the screen is the React or Solid modules it
wrote under `src/`, read together as TSX. When it wrote neither, a Vue or Svelte single-file
component, an Angular component (a module that declares `@Component`) or a page that uses the
elements is a screen the requirements cannot read: `screen.kind` is `unread`, and the run is left
out of the rate that meets its brief. A harness that wrote no screen, or only modules that hold
none (a helper, a store), meets no requirement: `meetsBrief` is `false`.

A `package.json` the harness left unreadable is the harness's work: the project is not lawful,
and an installed one does not build, with the reason in `violations` and `buildFault`. The judge
does not run `polymorph check` on it, because the red rules read it to tell which vocabulary a
file uses. A `package.json` the harness deleted, or a `typecheck` or `build` script it took out of
one, leaves an installed app that does not build, so the run counts in the rate that builds.

A record also keeps which MCP tools the harness called (`mcpCalls`), the `polymorph` verbs its
shell commands ran (`verbs`: through `npx -y @metamorph-labs/polymorph@<range>`, through pnpm, by
the bin's path or as `polymorph` on the `PATH`), how many shell commands it ran, the skills it
loaded (a Claude Code `Skill` call, or a `SKILL.md` Codex read, counted when loading it
succeeded), the tool calls it refused (`denied`: `null` when Claude Code was stopped before its
result, where it reports them), its tokens (`null` where it reported none), its requests sent
again (`retries`, `null` for Codex), its responses (`turns`, `null` for Codex), its wall time from
its start-up report, and how it ended
(`answered`, `turns`, `time`, or `harness` when judging the project failed). The outputs file
beside the results keeps the harness's last message and the text of every file it wrote.

"First shot lawful" has no meaning here, because no eval tool sees the first attempt. The headline
is four rates: the projects that end lawful, the ones that build, the ones whose screen meets its
brief, and the ones that do all three. Each rate is over the runs judged for it (`buildsMeasured`,
`meetsBriefMeasured`, `allThreeMeasured`), with its interval. A harness that fails (an error it
reports, a usage limit, an exit before it finishes) stops the eval as in the other runners, and so
does a token ceiling, held as [The token ceilings](#the-token-ceilings) says for each harness.

`--tools <path>` names the tools: a directory holding the bin (its `package.json`'s
`bin.polymorph`, a `bin/polymorph.js`, or a `polymorph` file), such as `packages/tools`, or a
packed tarball of the tools package, which npm installs once into the eval's scratch directory.
Without it, the lane uses this checkout's bin (`packages/cli/bin/polymorph.js`). The tools judge
the project as well as set it up: their `check` is the one that decides `lawful`. A published
build's `init` writes an `.mcp.json` that starts the server with
`npx -y @metamorph-labs/polymorph@^<version> mcp`, so the harness's MCP server comes from the
registry at that range. A tarball of a version that is not published is therefore measured with
the published server.

A run writes `eval/results/<date>-<model>-project-cli.json`, or `-project-codex.json`.
`eval/README.md` prints the lane last, with its own number for each model, runner, effort and
framework. `eval/fake/<brief>.project.json` scripts each brief's harness for `--fake`. Its turns
hold actions (`write`, `shell`, `mcp`, `skill` and `text`), which each stand-in plays as its
harness's own tools: a file is written, an MCP call goes to the project's server for real, and a
shell command reports the output the script gives it and runs nothing.

What only a real run can confirm, besides the Codex runner's list:

1. That `--setting-sources project` keeps the owner's skills and `CLAUDE.md` out and the
   project's in. A record lists the skills the harness loaded, so an owner's skill in it shows
   that it did not.
2. That `acceptEdits` with the allowed tools and `--permission-prompts none` lets Claude Code do
   its work in `-p` with no person, and how many calls it refuses (`denied`).
3. That Claude Code's sandbox applies in `-p`, that `failIfUnavailable` makes it refuse to start
   where the sandbox cannot, that the registries it is allowed are all an install needs, and that
   `permissions.blockWritesOutsideWorkingDirectories` and `--permission-prompts` are in the
   version run (the documentation names the first in 2.1.314 and the second in 2.1.259).
4. That pnpm takes its store from `npm_config_store_dir`, so an install inside either sandbox
   writes the eval's store and not the owner's.
5. That `skills.config` turns the owner's skills off.
6. How long a real app's copy, `polymorph check`, typecheck and build take, against which the
   budget's defaults are set.

### How far a rate can be trusted

A run either is lawful or is not, so a rate is a count out of a number of runs, and a few runs fix
it only loosely. Six lawful runs out of eight are what a model that is lawful 60% of the time
often produces, and so does one that is lawful 90% of the time. Eight runs cannot tell those two
models apart, or either from the 75% they measured.

Each rate is therefore recorded and printed with its 95% interval: the rates the count is
consistent with (`eval/spread.mjs`). It is Wilson's score interval. The interval built on the
measured rate's own standard error collapses to a single point at 0% and at 100%, which is where a
small sample most often lands, and Wilson's does not: eight lawful runs out of eight give 68% to
100%.

| Runs | A measured 75% is consistent with |
| --- | --- |
| 8 | 41% to 93% |
| 24 | 55% to 88% |
| 40 | 60% to 86% |
| 80 | 65% to 83% |

Two rates are told apart when the 95% interval of their difference leaves out zero. That interval
is Newcombe's, built from the two Wilson intervals. Two rates whose printed intervals do not
overlap are always told apart. Two whose intervals overlap a little can be as well: 6 of 8 (41%
to 93%) and 2 of 8 (7% to 59%) are. The report uses it under each results file:

- **What the sample cannot tell apart.** For each rate, the range another eval of the same size
  could measure without being told apart from this one. Eight runs at 75% are not told apart from
  anything between 38% and 100%. A sample of one run can tell no two rates apart, and the report
  says so.
- **Against the run before it.** The latest earlier results file of the same model, mode, runner
  and effort over the same briefs, rate by rate, each marked told apart or not told apart.
- **Brief against brief.** How many runs two briefs' counts have to differ by before any two of
  them are told apart. With three runs a brief, that is all three.

`--runs n` gives each brief `n` runs, and is the only way to narrow an interval. The runs of one
brief are treated as independent trials of one rate. An overall rate pools briefs whose rates
differ; with the same number of runs for each brief, its interval is no narrower than those briefs
call for. No interval says anything about a screen that is not among the briefs.

### Running it

```sh
ANTHROPIC_API_KEY=… pnpm eval                     # every brief, spec mode, claude-sonnet-5-5, one run each
pnpm eval --runner cli --effort high              # the same through Claude Code as you are signed in, no key
pnpm eval --runner cli --claude /path/to/claude   # through another installed CLI than the one on the PATH
pnpm eval --runner codex --model <id>             # the same through Codex as you are signed in; Codex needs a model named
pnpm eval --runner codex --model <id> --codex /path/to/codex   # through another installed Codex
pnpm eval --runs 5                                # five runs per brief, for narrower intervals
pnpm eval --mode tsx --runs 3                     # TSX modules instead of specs, three runs per brief
pnpm eval --mode runtime --members small          # the run-time lane: one request, no tools, the card for a subset
pnpm eval --mode project --runner cli             # the project lane: Claude Code in an app this checkout sets up
pnpm eval --mode project --runner codex --model <id> --tools packages/tools   # Codex, in an app the tools package sets up
pnpm eval --mode project --runner cli --framework vue --max-minutes 10   # a Vue app, ten minutes a run
pnpm eval --model claude-opus-5-5 --effort high   # another model, at a chosen effort
pnpm eval --briefs 'eval/briefs/list*.md' --max-iterations 3   # a smoke run over a subset
pnpm eval --max-tokens-per-run 300000 --max-tokens-total 2000000   # tighter ceilings
pnpm eval:report                                  # re-render eval/README.md from eval/results/
pnpm eval --fake --briefs 'eval/briefs/list*.md'  # the scripted model, into a temporary directory
pnpm eval --fake --runner cli --briefs 'eval/briefs/list*.md'   # the scripted model, through the CLI runner
pnpm eval --fake --runner codex --briefs 'eval/briefs/list*.md' # the scripted model, through the Codex runner
pnpm eval --fake --mode project --runner codex --briefs 'eval/briefs/list*.md'   # a scripted harness in an app
```

The API runner refuses to start without `ANTHROPIC_API_KEY`, the CLI runner refuses to start when
`claude --version` does not run, and the Codex runner when `codex --version` does not run or no
`--model` is named. The project lane refuses to start when the tools cannot set the app up, with
what they printed. A run writes `eval/results/<date>-<model>-<mode>.json`, with `-cli` or `-codex`
before `.json` for the runners that start a harness, and the outputs file beside it. It rewrites both after
every run (marked `partial` until the last), and re-renders `eval/README.md`. Each results file
records `briefs`, every brief in `eval/briefs/` when it ran. `--fake` replays the turns in
`eval/fake/` instead of calling a model and writes to a temporary directory: in place of the
Messages API for the API runner, and in place of the harness for the others, through
`eval/fake/cli.mjs`, a stand-in for `claude -p`, and `eval/fake/codex.mjs`, a stand-in for
`codex exec`, each of which starts the MCP servers it is given for real. A brief's
script is `eval/fake/<brief>.<mode>.json`, and `eval/fake/<brief>.<mode>.<run>.json` replaces it
for that run of the brief, so a scripted eval with `--runs` can hold runs that differ. `--fake`
refuses an `--out` that is `eval/results` or inside it, through any runner, so the committed
results only ever hold real runs.

Ctrl-C, or SIGTERM, stops the eval at once: it stops every harness still running (the project
lane's in its own process group, with its MCP servers and any command it left running in that
group), removes
its scratch directories, the project lane's template among them, and exits with 130 or 143. The
results file holds the runs that finished, marked partial. A signal that arrives while the eval
waits on a command it runs to the end (`polymorph init`, the judge's check and build) is acted on
when that command returns.

`eval/README.md` has one table per model and mode, latest run first, and above them the number:
for each model, mode and runner, its latest run that can be one, most recent first. Only a
complete real run over every brief that existed when it ran can be the number. A smoke run over
fewer briefs, a partial file and a scripted run are listed in the tables, marked for what they
are, and are never the number. Every rate on the page has its interval beside it. Under each table
row's results file the page has a section with what the sample can tell apart, the comparison with
the run before it, each brief's counts, the requirements a screen did not meet and the first-shot
misses. The report computes every interval from the counts, so a results file that recorded none
is printed with them all the same.

### What it costs

An estimate for the default model, from the sizes of what a run sends: the system prompt and tool
definitions are about 2,500 tokens, the system card about 7,000, each member lookup 1,000 to 4,000,
and each spec the agent writes about 1,500. A run of eight to ten requests therefore reads about
150,000 input tokens in total, most of them from the prompt cache, and writes 10,000 to 20,000
output tokens, thinking included. At Claude Sonnet 5.5's list prices ($2 per million input tokens,
$2.50 per million cache writes, $0.20 per million cache reads and $10 per million output tokens),
that is about $0.20 to $0.35 per brief, or $2 to $3 for the eight briefs at one run each. `--runs n`
multiplies that by `n`. A recorded run's results hold the real token counts, which take the place
of this estimate. Judging a screen against its requirements sends no request and costs nothing.

Through the CLI runner the tokens count against the plan the CLI is signed in to, or the key it
uses. The runner prints, for each run the CLI finishes, what the CLI reports that run would cost
at API prices. Through the Codex runner the tokens count against the plan or key Codex signs in
with, and Codex reports no cost.

The project lane has no estimate until a real run is recorded: the harness reads its own prompt
and whatever it chooses of the project, and the results hold what it reported. Besides the
tokens, an eval sets up one app (`polymorph init` and its install, which needs the network, and a
token when the packages come from GitHub Packages), and each run copies the app and runs
`polymorph check`, the typecheck and the build, which take seconds to minutes and cost nothing.

### When it runs

By hand, by the owner, before a release, with its results committed in the same change. It is not
part of any gate: it needs a key, or a signed-in Claude Code or Codex, it costs money or plan
usage, and it
depends on a model that changes outside this repository. When `eval/results/` holds no complete
real run, `eval/README.md` reports no number. Producing the number is the owner's step in the
release ([CONTRIBUTING.md](../CONTRIBUTING.md#releasing)).

The harness itself is tested without a model, in `eval/eval.test.ts` (`logic` project). A scripted
model plays a first attempt that is rejected and then corrected, one that is lawful at once, a run
that reaches the cap, a TSX run, and runs stopped by each token ceiling. The tools, the validator,
the emitter and the red rules run for real. Two more evals go over HTTP to local servers that speak
the API's streaming protocol. The first covers the request and its effort, a retry after an HTTP
529 and one after a rate limit mid-stream, a tool input that is not JSON, a repeated card call, the
streamed tool inputs and the thinking blocks a real model returns. The second covers the runs that
must not count for the model: a harness fault, a refusal, a lawful answer that was never validated
and a response cut off at `max_tokens`. The CLI runner plays the same scripts through
`eval/fake/cli.mjs` and the eval's MCP server, and its records come out equal to the API runner's,
wall time aside. One more eval starts that stand-in as `--claude`, with no key, as it would start
the owner's CLI. It checks the flags and the environment the CLI is given, the four endings that
must not count for the model, and a usage limit that stops the eval. Two more give the stand-in a
journal line half written, which is not read, and one that is not JSON, which stops the CLI. The
Codex runner plays the same scripts through `eval/fake/codex.mjs`, and its records come out equal
to the API runner's, apart from the wall time and the request count Codex does not report; a run
stopped at the cap records no tokens rather than zero. One more eval starts that stand-in as
`--codex`, with an owner's Codex home and a variable a Codex session sets, and checks that the run
gets a home of its own with only the owner's sign-in in it, the eval's prompt as its instructions,
the four tools and none of Codex's own, and that a usage limit stops the eval. Runs stopped at the
cap leave their tokens unknown: with no total ceiling given the eval goes on, and with one given it
stops before the next run with `tokens-unknown`, which the report words as such. A model that uses
Codex's plan tool goes on, with its plans counted, and `--max-tokens-per-run` is refused for
Codex. One more eval starts a CLI
that sleeps, sends the eval SIGTERM, and checks that the CLI is stopped, the scratch directories
are gone and the eval exits with 143. The same file
checks that `--fake` refuses `eval/results` through the API and CLI runners, holds the results schema to
`eval/results-shape.ts`, and holds `eval/README.md` to what `pnpm eval:report` renders, the
headline rule included.

The same file holds the requirements to laws of their own. Every brief has requirements, and no
requirement's sentence names a member. The answer the scripted model gives for each brief meets
every requirement of that brief, so each brief can be met lawfully. Each requirement fails once the
members it names are taken out of that answer, so none holds for every screen. No brief's answer
meets another brief's requirements, and a screen that composes nothing meets none. A spec and the
TSX emitted from it are read as the same elements and judged alike. Screens written for the test
leave out one part a brief asks for, or supply it another lawful way, and each is judged as it
should be. One scripted eval gives every
brief three runs, one of them a lawful screen that leaves out part of its brief, and the records,
the summary's rates and intervals, and the report's sentences are checked against it. The interval
and the told-apart test are checked against values worked by hand.

The project lane is tested in `eval/project.test.ts` (`logic` project), with no model and no
package install. Each eval there sets its app up with `polymorph init` for real, uninstalled, and
judges each project with `polymorph check` and the brief's requirements for real. Four runs of one
brief through each stand-in leave a lawful screen that meets its brief, an unlawful module, an
untouched project and a run the turn budget stops, and each is judged as it should be. One eval
sets the app up with a tools directory whose `agents` verb writes Codex's MCP entry and a skill, and
Codex then finds both. One starts the Claude Code stand-in as `--claude` with `--no-install`, checks
that it gets the brief as its request, its sandbox and nothing of the eval's, and stops it at its
time budget. The stand-ins refuse to start without the sandbox settings and the arguments the lane
depends on, and the stand-in for the time budget, signed in from its environment, gets a
configuration directory of the run's own. The judge's typecheck and build run against a fixture
project whose scripts are stubs, so the test needs no installed app; a fixture whose
`package.json` is broken counts as unlawful and unbuilt, and one whose `package.json` or `build`
script was taken away as unbuilt. A tarball of tools with no dependencies is installed into the
eval's own npm cache, and a tools directory whose declared bin is not built is refused with that
reason. One eval starts a harness that sleeps and leaves a command of its own running, sends
the eval SIGINT, and checks that both are gone, the eval's scratch directories with them, and that
the eval exits with 130. The same file checks the choice of the screen, the caches left out of
what a harness wrote, the reading of verbs, skills and MCP servers, the refusals, the results
schema and the report's section.

Both files start their evals a few at a time (`eval/running.ts`), half as many at once as the
machine has cores, and each section of evals has a setup of its own, so no setup waits on all of
them. When a file ends, an eval still running (a setup that timed out leaves some) is sent
SIGTERM, which stops the harnesses it started; an eval still waiting for its turn is refused, and
so is one asked for afterwards, so none starts once the file has ended. `eval/running.test.ts`
checks that with a script that waits in place of the eval.

## What this does not prove

- **The agent-loop test uses a scripted agent, and the eval is the evidence that replaces it.**
  The two attempts in `design/screens/agent-loop/` are committed files. The test proves the loop: a
  brief that names no component, checking against the real vocabulary, specific faults, a corrected
  spec, lawful TSX. It does not prove that any model writes the second attempt from the first. That
  is the agent eval's job, and it runs a real model only by hand: a release without a committed
  results file has no measured number, and eight briefs are a sample of screens, not all of them.
  A rate from one run a brief is known only within a wide interval, which the report prints. A
  screen that meets its brief holds the parts the brief requires; nothing has run it, and no
  person has used it. The eval measures the system alone: it does not compare it with another
  way of building the same screens.
  The workbench composer authors, validates and emits the same spec documents
  ([tooling.md](tooling.md)), but no designer other than the authors has used it for real work.
- **For novel needs, only the routing is proven, not the tooling.** The ladder, the promotion path
  and the inventory make it impossible to keep a silent override. A person still decides whether a
  recurring exception should be promoted into the vocabulary.
- **Coherence is a judgement.** The laws keep a theme legible and internally consistent. They cannot
  make it good. Whether a theme looks as if one opinionated person designed it is left to human
  review.
- **Scale.** Relay is three screens, beside the workbench's page exemplars. The claims are tested
  only on that surface.
- **The WCAG divergence is an open decision.** The tonal text class sits between AA-large and AA by
  design. The decision is recorded in `laws.test.ts`, where it can be challenged.
- **Screenshots are evidence, not assertions.** Apart from the phone lane and the two motion probes,
  nothing compares the frames, and a changed frame is not a failure. The shot list is written by
  hand. A system added to `design/systems/` is covered by every law as soon as it exists, but
  appears in `proof/shots/` only when a scene names it.
- **Inside a Bespoke zone, the inventory points at the zone, not at each value.** Whether a zone
  reads theme tokens for what it shares with the system is reviewed, not linted.
- **Coverage is measured for the `logic` project only.** The browser projects are gated by their
  laws, not by a coverage number.
- **The engines gate does not press Tab onto a button in WebKit.** WebKit on macOS follows Safari's
  default, in which Tab passes over buttons and links, so those tests are declared skips there
  (the browser matrix). Tab order onto a button is held on Chromium and Firefox.
- **The behaviour contracts run on the web only.** The conformance law runs every statement of a
  member against every web renderer that ships it (ImageEditor is React's alone, so its statements
  run once). A SwiftUI or Compose member is held to its contract's props, its states
  and its accessibility identity, and is not run against the statements.
- **A native gate covers what its machine can run.** The iOS accessibility audit runs only where an
  iOS simulator runtime is installed, and the Android library and its audit only where an Android
  SDK is. Without them each gate covers the rest, says what it skipped, and passes.
- **The native audits are not a device's audit.** Neither runs Apple's or Google's own audit: the
  iOS audit reads the tree SwiftUI publishes in a test process, without the label of a hosted
  UIKit control, which `IdentityTests` holds on macOS, or the elements of a scroll view drawn as
  one, and the Android audit reads the nodes Compose publishes under Robolectric. Neither
  measures colour contrast.

## The iOS gate

`pnpm gate:ios` checks the SwiftUI members in `platforms/ios/Sources/PolymorphUI`. Native members
are written by hand, by people and by agents, and are held to the same kinds of laws as the web's:
the spec is a contract the code must satisfy, every promised state renders, every value is a
token, no text is written into a member, imports are contained, and the result is audited for
accessibility. It is separate from `pnpm gate` because it needs Xcode.

| Step | What it checks |
| --- | --- |
| `pnpm native:contracts --check` | the generated contracts in `Sources/PolymorphUI/Generated/` are what the registry gives |
| `pnpm emit:examples --check` | each platform's example holds the screen the emitter writes from its spec (`platforms/ios/Examples/Relay`, `platforms/android/examples/relay`) |
| `vitest run --project logic packages/native` | the contracts' tests, the laws over the Swift sources, the law that holds the root `Package.swift` to `platforms/ios/Package.swift` (`swift-package.test.ts`) and the native manifests' version law (`version.test.ts`) |
| `swift build` (in `platforms/ios`) | the libraries and the Relay example compile on macOS |
| `node scripts/ios-by-url.mjs` | an app that adds the package by a git URL at the release's tag resolves the root `Package.swift` and builds both libraries; the check copies the working tree into a repository of its own and tags it, so it runs before a commit |
| `swift test` (in `platforms/ios`) | the rendering harness, the example's renders and focus test, and every other Swift test pass |
| `node scripts/ios-audit.mjs` | every target `xcodebuild test` builds type-checks for the iOS Simulator; where a simulator runtime is installed, `PolymorphUITests` runs on an iPhone simulator and the accessibility audit finds no more defects, and records no more system controls, than `scripts/native-audits/thresholds.json` allows |

### The contracts

`pnpm native:contracts` (`packages/native/src/contracts.ts`) reads the registry and writes eight
files into `Sources/PolymorphUI/Generated/`. They are committed, so a Swift build needs no Node,
and never edited by hand. The same run writes the Kotlin contracts for Android ("The Android
gate"): what each prop becomes is resolved once for both platforms, in
`packages/native/src/mapping.ts`, and each generator writes the result in its own language.

- `Contracts.swift`: for every member the iOS platform map marks `native` or `adapted`,
  `PM<Member>Props` (one field per prop), an enum for each literal-union prop, and
  `PM<Member>Rendering`, the protocol a rendering conforms to: a `View` with
  `init(props: PM<Member>Props)`. A member with a lawful variant × tone grid gets one
  `PM<Member>Appearance` enum of its lawful cells, with a `lawful` list, in place of separate
  `variant` and `tone` fields, so an unlawful pair cannot be written, as `LawfulVariants` does on
  the web. A compound part's props are a struct of their own (`PMTableHeaderProps`).
- `Catalogue.swift`: every member, with its iOS status and how it renders (`PMCatalogue.members`).
- `Unsupported.swift`: every prop whose TypeScript type the mapping cannot express, as an opaque
  `PMUnsupported<Member><Prop>` type with the TypeScript type and the reason. The field keeps
  its place in the props, so the gap shows where a renderer would use it.
- `Fixtures.swift`: every `<Member>States` fixture the member files declare (`PMFixtures.all`),
  for the harness.
- `Strings.swift`: `PMStrings`, every default a spec names for text a member speaks, from
  `packages/native/src/strings.ts`, each looked up through `String(localized:comment:)` in the
  app's main bundle. `packages/native/src/strings.test.ts` holds each default to the spec that
  names it.
- `Recipes.swift`: `PMRecipe`, the numbers the recipes write that the members read (a measure in
  `space.10` steps, a breakpoint in points, a sheet's height as a fraction of the window), read
  from the recipes' CSS by `packages/native/src/recipes.ts`.
- `Brands.swift`: each provider's mark, the engine's `BRAND_DRAWINGS` path for path, which the
  foundation's `PMBrandMark` draws.
- `Phones.swift`: PhoneInput's calling codes, the engine's table (`phone.ts`) read through its own
  lookups by `packages/native/src/phones.ts`: each code and the regions that dial it, its main
  region first, and the regions that dial a trunk zero, which the foundation's `PMPhones` reads.

The mapping, from the type the registry prints:

| TypeScript | Swift |
| --- | --- |
| `string`, `number`, `boolean` | `String`, `Double`, `Bool` |
| a union of string literals | an enum `PM<Member><Prop>: String` |
| a union of integer literals (`Grid`'s `columns`) | an enum `PM<Member><Prop>: Int`, cases named `columns1`… |
| `"sm" \| "md" \| "lg"` (`ControlSize`) | `PMControlSize`, declared in the foundation |
| every icon role (`IconRole`) | `PMIconRole`, generated from the registry's roles, each with its SF Symbol (`systemName`) from its `ios` in `design/icons.json` |
| `ReactNode`, an element type | `PMContent` (`AnyView`) |
| `T[]`, `readonly T[]`; `[A, B]` | `[T]`; `(A, B)` |
| `(a: A) => R` | `(A) -> R`, by the same mapping |
| `void \| Promise<void>`, as a closure's result | `Void`: the member calls the closure and does not wait for it, because the app owns every task. `ConfirmDialog`'s `onConfirm` is `@MainActor () -> Void` |
| a DOM event parameter (`MouseEvent<…>`, `ChangeEvent<…>`, `FocusEvent<…>` and the like) | left out, the other parameters kept: `Button`'s `onClick` is `() -> Void` |
| a name without type arguments | `PM<Name>`, an opaque struct, counted; `<Member>Props` is that member's props |
| a name with a shape in `SHAPES` (`mapping.ts`) | `PM<Name>`, a struct of the web's fields, generic where the web's is: `PMStatDelta`, `PMDataTableColumn<Row>`, `PMToastAction` |
| a union of unlike types in `UNIONS` (`mapping.ts`), by its name or its branches | `PM<Name>`, an enum of one case per branch: `CheckedState` (`boolean \| 'indeterminate'`) is `PMCheckedState`, and `Select`'s `(SelectOption \| SelectOptionGroup)[]` is `[PMSelectOptionEntry]` |
| a literal union the web names (`SpaceStep`, `RadiusStep`, `SortDirection`, `DeltaDirection`), by its name or by its values | `PM<Name>`, one enum every use shares; a space step is `.s4`. The registry prints a named scale expanded, so its values say which it is: `Stack`'s `gap`, printed `0 \| 1 \| … \| 10`, is `PMSpaceStep`, and `Table.Header`'s `sortDirection` is `PMSortDirection`. A union in `NAMED_ONLY` is recognised by its name alone, because another union has its values: `TimelineTone` holds Badge's tones, and Badge's `tone` stays `PMBadgeTone` |
| `ReadonlySet<T>`, `Set<T>` | `Set<T>` |
| `Readonly<T>` | `T`: a chart's row, `Readonly<Record<string, string \| number \| null>>`, is `[String: PMChartValue?]` |
| `Record<K, V>` | `[K: V]`: ToolCall's `messages.status` is `[PMToolCallStatus: String]` |
| `File` | `PMFile`, declared in the foundation: the file's URL, name, size in bytes and media type |
| `Blob` | `Data`: ImageEditor's `onConfirm` hands over the framed image's bytes |
| `unknown`, a JSON value a member shows without interpreting it (JsonTree's `data`) | `PMJSONValue`, declared in the foundation: null, a boolean, a number, a string, an array, or an object whose keys keep their order |
| a name in `JSON_TYPES` (`mapping.ts`): part of a document an app stores and a tolerant reader reads, which keeps the nodes and marks of a later version (RichTextContent's `RichTextDocument`, and `RichTextMark`, which an entity's `marks` hold) | `PMJSONValue`, the JSON the app stored, which the member reads itself: `value: PMJSONValue`, and `PMRichTextEntity`'s `marks: [PMJSONValue]?` |
| a function type the web names, which the registry prints by name (`StepperSpoken`), in `FUNCTION_ALIASES` | its definition, by this table: `(@MainActor (PMStepperSpokenStep) -> String)?` |
| an object type the web writes inline, whose fields a shape in `SHAPES` with a `native` reason names (`ApprovalCard`'s `messages`) | `PM<Name>`, that shape's struct: `PMApprovalCardMessages`; BarChart's `onSelect` payload is `PMChartSeriesSelection` |
| a union whose branches are objects the web writes inline, told apart by a literal field the shapes name as their `discriminant` (`ChartAnnotation`'s `kind`) | an enum of one case per branch, each holding its shape's struct less that field: `PMChartAnnotation.line(PMChartLineAnnotation)` |
| a class from a package outside the vocabulary with a shape in `SHAPES` that names its `library` (`@internationalized/date`'s `CalendarDate`, `Time`) | `PM<Name>`, a struct of the class's fields less those the shape says why it leaves out: `PMCalendarDate` (year, month, day), `PMTime` |
| a name in `SHAPE_ALIASES` (`CalendarDateTime`) | the shape it names: a `CalendarDateTime` is a `PMCalendarDate` whose `hour` and `minute` are set |
| a union whose branches are one type once each is named by its shape (DatePicker's `CalendarDate \| null \| CalendarDateTime`) | that type: `PMCalendarDate??` |
| closures alike but for a parameter whose branches are a union in `UNIONS` (the `(value: string) => void` and `(value: string[]) => void` a `type` or `mode` prop chooses between) | one closure of that union: Accordion's `onValueChange` is `(@MainActor (PMChoiceValue) -> Void)?`, Slider's `onCommit` takes a `PMSliderValue` |
| a branch of a union whose shape has no field but the union's `discriminant` (`MenuSeparatorEntry`, whose `kind` the case says) | a case without a value: `PMMenuEntry.separator` |
| a member's type parameter (`DataTable`'s `Row`) | a generic parameter of its props, `PMDataTableProps<Row>`, and an associated type of its rendering |
| a union of string and integer literals (`Skeleton`'s `width`) | an enum `PM<Member><Prop>: String`, each literal as written: `width4 = "4"`, `full` |
| `T \| null` | `T?` |
| an optional prop | an optional field, defaulted to `nil`; a required prop stays required |

Anything else is unsupported: a union of unlike types `UNIONS` does not name, another generic
type (`Ref<…>`), an inline object type no shape names, a lone boolean literal, and a type
parameter a compound part uses.
`contracts.test.ts` counts them, so a change that grows the list is seen; lower the count when
the mapping learns a type.

The registry prints a named object type by name, not by shape, so a field of that type could be
held but never read. `SHAPES` in `mapping.ts` gives the types the native members read their
shape: each is the web's interface, field for field, as the web writes it. `contracts.test.ts`
reads the web's source (`readWebDeclarations` in `disk.ts`, which reads an interface's inherited
fields first, less those an `Omit` leaves out) and holds every shape to the declaration it stands
for, so a shape cannot drift; a field the web lacks (`DataTableColumn`'s `value`, the cell as
text, which Swift cannot read from a row by key) says why, and a field spelled in a way the reader
does not parse (`NumberFormat`'s `Exclude<…>` style) keeps the web's spelling in `web`. A shape
of a library class is held to that class's declaration in the installed package
(`readLibraryClass`), each field it leaves out with its reason. A named type
with no shape stays opaque: a field of it can be passed along but holds nothing a member can
read. The opaque types are counted as the unsupported props are, and no member with a file in
`Sources/PolymorphUI` may take one: a member that cannot read a prop it is handed stays in
`pending.ts`. `UNIONS` is held to the web the same way: a union the web names is its alias's
branches, and one the web leaves unnamed says why it has a name here. So is a shape the web
leaves unnamed (`native`): it says why, and no web interface may have its name. A function type
in `FUNCTION_ALIASES` is held to the web's alias, read whole across its lines.

The generator refuses a type name a hand-written source declares (`declaredTypesIn`, over the
hand-written `PolymorphUI` sources and the whole of `PolymorphTokens`), because a generated type
of that name would not compile.

Two fields do not come from the spec. Every page archetype but `AppShell` takes `loadStatus:
PMLoadStatus` first: loading, ready, empty, or failed with a message, which the archetype draws
itself ([design/native/screen-contract.md](../design/native/screen-contract.md)). Then an
optional `onRetry`: set, the failed state's Alert offers it.

The tests in `packages/native/src/contracts.test.ts` hold the files to the registry (the freshness
law, which fails with "run `pnpm native:contracts`"), to determinism, to snapshots of Button's,
Dialog's and DataTable's contracts, to the mapping table above, to the two counts, and every
shape and union to the web.

### The laws

`packages/native/src/laws.test.ts` runs in the `logic` project and reads files only. It applies
these laws to every Swift file under `Sources/PolymorphUI` except `Generated/`, and proves each
one on a sample that breaks it. The foundation, `PolymorphUI.swift`, is exempt from the token and
literal laws: it is where the platform meets the tokens. The defaults a spec names for text are
generated (`PMStrings` in `Generated/Strings.swift`, from `packages/native/src/strings.ts`, each
looked up through `String(localized:comment:)`), and so are the numbers the recipes write
(`PMRecipe` in `Generated/Recipes.swift`). Its further files, `PolymorphUI+<Topic>.swift`, hold
the drawing parts several members share (the field box, the page column, the shared layout);
they are held to every law but conformance and the measures law, because they belong to no
member and hold the geometry and the fixtures' device sizes.

| Law | A member fails when it |
| --- | --- |
| Token-only | builds a colour (`Color(red:)`, `UIColor(…)`, a hex literal or `"#rrggbb"`), names a system colour (`Color.blue`, `.tint(.red)`), uses a system type style (`.font(.headline)`, `.font(.system(size:))`), or writes a number other than `0` into `.padding`, `.frame`, `.cornerRadius`, `.shadow`, `.offset`, a `spacing:` or another length, or multiplies a theme length by a number (`space.s10 * 4`, `2 * space.s1`), which is a recipe's multiple and `PMRecipe`'s. A label's expression is read to its end: a comma or a closing parenthesis, a brace, or a line end the next line does not continue, so `let size: PMControlSize` reads as its type alone. |
| No hand-typed measures | initialises a `static let` or `static var` typed `CGFloat`, `Double` or `Float` with a number, or an untyped one with a decimal literal (`static let ratio = 0.58`): a recipe's number is `PMRecipe`'s, a spec's default value `PMSpecDefault`'s, and geometry or a fixture's device size the foundation's (`staticNumberViolations`, over member files only) |
| No literal strings | writes text a person reads into `Text`, `Label`, `Button`, `Toggle`, `Link`, `TextField`, `SecureField`, `Picker`, `DatePicker`, `ColorPicker`, `.navigationTitle`, `.accessibilityLabel`, `.accessibilityHint`, `.accessibilityValue`, `.accessibilityAction(named:)`, `.help`, an `AccessibilityNotification.Announcement`, `String(localized:)` or `LocalizedStringResource`. Interpolations of props and punctuation are allowed; text comes from props, through the app's localisation, and a default a spec names is `PMStrings`'s. |
| Containment | imports anything but SwiftUI, Foundation and PolymorphTokens; Charts outside a chart member and the charts' foundation file, `PolymorphUI+Charts.swift`; a module `MEMBER_IMPORTS` (`laws.ts`) names outside its member or foundation file (CoreImage in QRCode, UniformTypeIdentifiers in the file gate's `PolymorphUI+Files.swift`, ImageIO, PhotosUI and UniformTypeIdentifiers in ImageEditor, AVFoundation in AudioPlayer); UIKit or AppKit outside `#if canImport(…)`; or draws an icon or image directly instead of through `PMIconView` |
| Conformance | is named for no member the platform map marks native or adapted (a foundation file, `PolymorphUI+<Topic>.swift`, is no member's), or does not declare `PM<Member>` conforming to `PM<Member>Rendering` and `<Member>States` conforming to `PMStates` for its member |
| No shadowing | declares a type with the name of one in `PolymorphTokens`, which makes the name ambiguous in an app that imports both |
| Drawn props | never reads a field of its contract that `packages/native/src/undrawn.ts` does not name, or reads it only into its identifier, or is named there for a field it reads for anything else ([Undrawn props](#undrawn-props)) |

### The pending list

Every member the iOS platform map marks native or adapted either has a member file or is listed
in `packages/native/src/pending.ts`. The list's length is pinned in `laws.test.ts`
(`PENDING_COUNT`). `pnpm new:member` adds a new member to the list and raises the number;
implementing a member, or marking it absent on iOS, removes it and lowers the number in the same
change, so a member cannot leave the list unimplemented.

### Undrawn props

A member keeps its props on every platform, so its contract carries fields that have nothing to
do in a native app. A rendering that ignores one drops a value the app passed, and nothing on
the screen says so. `packages/native/src/undrawn.ts` is the one list of those fields, for both
platforms: each entry names the props, the members whose SwiftUI rendering and whose Compose
rendering do not draw them, and the reason. The law of drawn props
(`packages/native/src/drawn.ts`) runs in `laws.test.ts` for SwiftUI and in `kotlin-laws.test.ts`
for Compose, and fails on:

- a contract field of a member with a rendering that no entry names and that the rendering never
  reads, or reads only to write into its identifier;
- an entry that names a field the rendering reads for anything but its identifier, a member
  without a rendering, a prop none of its members has, a member with none of its props, a field
  a second time, or no reason.

The list is therefore exactly what is not drawn. The law reads source text, as the other native
laws do, and holds two kinds of field by two rules.

| Field | It is read when |
| --- | --- |
| a field of `PM<Member>Props`, or of a part's `PM<Member><Part>Props` | `props.<field>` is written where `props` is bound to that struct: a stored property or a parameter `props: PM<Member>Props`, in a member file or a foundation file, and in a Swift extension of the type that stores it. A read that only hands the value to a field of another member's props counts when that member reads that field, so a prop passed on to a member that drops it is not drawn |
| a field of any other struct of the contract, a shape a prop holds (`PMDataTableMessages`) | a field of that name is read, `.<field>`, in the file of the member the shape is named for or in a foundation file, and in any file when the shape is named for no member. This rule goes by the name alone: it does not tell one shape's `label` from another's. A shape the hand-written sources build is not held, because the member writes it for the app to read |

A field the contract types `PMUnsupported…` is declared by its type. Nothing in a states fixture
is a read, and neither is a comment.

A read that only builds the member's identifier is not a drawing, because no person sees or
hears the identifier. Those reads are the ones in the arguments of a `pmMember` call; in what
builds the attributes the call names (a function's or a computed property's body, a variable's
value and each later write to it, and the condition of an `if` that only decides such a write);
and in the value of a local that nothing outside those places uses, where an argument's label of
the same name is not a use. A field with no other read needs an entry, and its entry is not
stale. The rule errs towards a drawing: a use it cannot place counts.

The law finds a field that is not read. It does not prove that a field is drawn. A presence
check (`props.rowDetail != nil`) is a read, and so is a value read into a property nothing draws.

A new prop on the web reaches both contracts with the next `pnpm native:contracts`. The law then
fails on each platform until the rendering reads the field or `undrawn.ts` names it.

### The harness

`platforms/ios/Tests/PolymorphUITests` renders every entry of every fixture in
`PMFixtures.all`:

- `RenderingTests` renders each entry with `ImageRenderer` on macOS, 360 points wide and as tall as
  the entry is at that width, from 120 points up to a phone's 844 (`Harness.size`), under the
  default pairing in light mode and under the first pairing whose system defaults to dark, in dark
  mode. Each render must differ from the empty canvas, except an entry whose `expect` sets
  `renders` to `nothing` (a Sparkline of fewer than two points, the web's `rendersNothing`),
  which must match it. The PNGs are written to
  `platforms/ios/.snapshots/<Member>/` (gitignored) for a person to look at. `ImageRenderer`
  draws no scroll view's content, no `NavigationSplitView` and no sheet, so a page archetype's
  fixture turns its scroll view off (`\.pmPageScrolls`) and AppShell's draws its compact
  container.
- `IdentityTests` hosts each entry in a window and reads the accessibility tree AppKit publishes, as
  an assistive client would. The root must carry the identifier `member:<Name>`, set by
  `.pmMember(_:_:)`, the counterpart of the web's `data-member`. Identifier values
  percent-encode spaces and `%` (`%20`, `%25`), because some are the app's own, and `parse`
  decodes them. Each key in the entry's `expect` must hold: an attribute the identifier carries
  (`member:Badge tone=neutral variant=soft`), or `label` and `value` for what an assistive client
  reads. An empty expected value means the attribute is absent, as the web's `null` does. An
  entry whose `expect` sets `hidden` to `true` is a decorative state (a plain Separator, an
  unlabelled Skeleton, an Avatar beside a name) and must expose nothing; the simulator audit
  holds it to the same. An entry whose
  `expect` sets `contains` (`"Alert,Input"`) names members each of which must be the member of
  some element inside the root: each page archetype's load states name the affordance the screen
  contract's table gives (Skeleton, EmptyState, Alert), and FormPage's failed state names the
  Input it keeps. A name may carry attributes in brackets, `Menu[part=panel]`, which the
  element's identifier must carry too, so an open overlay's entry proves its panel rather than
  the trigger its closed entry shares. Every text field, date picker, menu picker and colour well
  inside the root must have a name, a label or a title: the simulator audit cannot read a hosted
  control's label (below), so the rule is held here.
- `BehaviourTests` hosts members in a window, presses them through the accessibility tree, types
  into them, sends them clicks and keys, and reads back what they report and expose. A button
  takes keyboard focus only while the system's keyboard navigation is on, so a test that sends
  keys to a tab strip focuses the trigger through its element, as an assistive client does.
- `ContractTests` checks the catalogue, the lawful grid, the identifier format, and that every
  icon role's SF Symbol exists.

### Adding a member: the Badge

`Badge.swift` is the template:

1. Run `pnpm registry` and read the member's entry, its spec in `design/components/`, and its
   generated `PM<Member>Props` in `Generated/Contracts.swift`.
2. Create `Sources/PolymorphUI/<Member>.swift` and declare `PM<Member>`, a view conforming to
   `PM<Member>Rendering`. It reads its tokens from `@Environment(\.pmTheme)`: colours from
   `theme.colors`, type from `theme.text` through `.pmTextStyle`, lengths from
   `theme.defaultDensity` and `theme.radius`. Badge's eighteen colour cells are written out beside
   the spec's recipe tables. Its root is one accessibility element, labelled with its text as
   written, and carries `.pmMember("Badge", ["tone": …, "variant": …])`. A drawing part another
   member already uses (the field box, the page column) is in a foundation file,
   `PolymorphUI+<Topic>.swift`; a default the spec names for a string prop is a `PMStrings`
   default, added to `packages/native/src/strings.ts` with the spec that names it, and a measure
   or breakpoint the recipe writes is a `PMRecipe` number from `packages/native/src/recipes.ts`.
3. In the same file, declare `<Member>States: PMStates`, the counterpart of the web's states
   fixture: one entry per promised state, with what each exposes in `expect`. Badge's entries are
   every variant × tone cell and the leading icon.
4. Remove the member from `pending.ts` and lower `PENDING_COUNT`.
5. Run `pnpm native:contracts`, which registers the fixture in `Generated/Fixtures.swift`, then
   `pnpm gate:ios`, and look at the PNGs in `platforms/ios/.snapshots/<Member>/`.

### The simulator audit

`scripts/ios-audit.mjs` first type-checks every target `xcodebuild test` builds against the iOS
Simulator SDK with `swiftc`: `PolymorphTokens`, `PolymorphUI`, the Relay example and the three
test targets. That needs only Xcode, and it is the only step that compiles the code behind
`#if os(iOS)` and `canImport(UIKit)`.

It then runs `PolymorphUITests` with `xcodebuild test` on an iPhone simulator of the device type
and the iOS runtime the thresholds were measured on (`scripts/native-audits/thresholds.json`).
UIKit sizes its own controls by release and device, so the counts are comparable only on them.
Where that
runtime is not installed, the run is on the newest one `xcrun simctl list runtimes` lists, and on
the recorded device type if it supports it, else the iPhone type its devices use, and the script
says that the run differs from the measurement. The script creates the simulator for the run and
deletes it on exit, because a second `xcodebuild test` on the same device, from another run on the
Mac, stops the first one's test process. The run writes a result bundle, and the script prints
each failure and runtime warning it records. `AccessibilityAuditTests` exists only there. A Swift
package cannot host a UI test, so Apple's `performAccessibilityAudit` is out of reach, and the test
makes the same kind of pass over the tree UIKit publishes instead.

Each entry is audited at the default text size and at the largest accessibility size, and must
hold five rules:

- the entry exposes an element, unless its `expect` sets `hidden`, and then it exposes none;
- the first node that carries a member's identifier is the fixture's member;
- every element has a label;
- everything a person can act on (a button, a link, an adjustable element, a UIKit control or an
  editable text view) offers a 44-point hit region, measured by what it is: a text entry view by
  the box its member takes its tap in, a system control by the area UIKit hit-tests to it, and
  every other element by the frame SwiftUI publishes ("Hosted UIKit views", below). A system
  control under 44 points is recorded rather than counted as a defect;
- every element lies inside the window where a device places it, unless a scroll view holds it.

How the audit hosts and reads an entry decides what those rules measure:

- **The canvas.** The entry is laid out 360 points wide, centred in a window as wide as the
  simulator's screen (402 points on an iPhone 17 Pro), as a page's margins place a member. A hit
  region's outset at the canvas's edge therefore stays on screen.
- **The height.** The entry is as tall as a `UIHostingController` lays it out at that text size,
  measured at the screen's scale, because text lays out to the pixel grid and a height measured
  at another scale differs. The controller measures as the root of the window the entry is then
  hosted in, because outside a window it has no size class: a member whose form follows the width
  class (Table, DataTable, SplitPane) is measured in the form the window hosts it in. The window is
  at least a phone's 844 points tall, so an open panel has the room a screen gives it.
- **No safe area.** The hosting controller keeps no safe area (`safeAreaRegions` is empty), so the
  entry sits where the canvas puts it and not below the simulator's status bar.
- **No animation.** Animations are off in the hosting, so a transition is read where it ends. A
  view the clock moves (a `TimelineView`) is read where it is at that moment, so an element whose
  frame such a view widens can lie inside the window in one run and outside it in the next.
- **Identity.** SwiftUI puts a member's identifier on the group it makes of a container, which is
  not an element itself, so the audit reads identifiers from groups and elements alike.
- **Hit regions in pixels.** A width or height is compared in whole pixels of the screen, so a
  44-point frame that floating point reports as 43.99999 points passes.
- **Hosted UIKit views.** UIKit's accessibility runtime publishes a hosted control's label, traits
  and frame (a text field, a text view, the compact date picker, a menu picker's button), and that
  runtime runs in an app and not in a package's test process. The audit reads such a view's frame
  from the view itself and does not read its label. `IdentityTests` holds the label on macOS
  instead, where AppKit publishes the same control's name in the test's process: every text
  field, date picker, menu picker and colour well an entry hosts must have one. A hosted view's
  hit region is measured by what the view is, which the audit reads from its class:
  - A text entry view, a `UITextField` or an editable `UITextView`, is the editable line, as
    in any SwiftUI app, while the member's box takes the tap. The foundation's `pmOpensOnTap`,
    which every text-entry member applies to its box, makes the whole box hit-testable and
    publishes its frame as a SwiftUI preference (`PMTapBoxKey`), which adds no view and no
    accessibility element and draws nothing. The audit reads the boxes at the root of the
    hosting, in the window's coordinates. A text entry view passes when the smallest box that
    contains its frame is 44 points on each axis. One that no box contains, or whose box is under
    44 points, is a defect. A text entry view is not hit-tested, because a tap beside its line
    goes to the member's gesture, which `hitTest` returns as the hosting view.
  - A system control is any other hosted `UIControl`: the compact date picker, a menu picker's
    button, a navigation bar's button. It takes its own taps over the area UIKit hit-tests to it,
    which can be larger than its bounds (a bar button takes the taps on its whole platter), and it
    publishes no accessibility frame in the test process. The audit probes that area: from the
    centre of the control's bounds it calls `window.hitTest` one pixel at a time outward along
    the horizontal and the vertical line through the centre, as far as the view returned is the
    control or a view inside it, and takes the run on each line as the area's width and height.
    A control whose area is 44 points on each axis passes. One whose area is shorter is UIKit's
    control at UIKit's size, which no member's area can widen, so the audit records it with the
    area it measured ("is UIKit's control at UIKit's size, hit-tested over 34 points of height")
    and `scripts/ios-audit.mjs` counts it against `ios.system`, not as a defect. A disabled
    control takes no taps, so UIKit hit-tests nothing to it, and the audit measures it by its
    bounds, the least area it takes its taps in once enabled. An enabled control whose centre
    hit-tests to another view takes no tap at all, which is a defect.
- **Scroll views.** The same runtime publishes a scroll view's elements, so the audit reads each
  entry with its scroll views drawn at rest (`Harness.scene` with `scrolls` off), where SwiftUI
  publishes every element, and hosts it again with its scroll views drawn, as a device lays it out.
  An element published at rest and missing from the second hosting is one a scroll view holds, which
  a person reaches by scrolling; every other element is held to the window where the second
  hosting places it. A fixture therefore leaves scrolling to the harness and never turns it off
  itself.
- **No contrast.** The audit measures no colour contrast; the theme's contrast law covers the
  pairings' colours.

`PM_MEMBERS=Input,Toast node scripts/ios-audit.mjs` audits only the members it names. With no
runtime installed, the script prints why the audit was skipped and exits 0, and the audit is
type-checked but not run on that machine. `xcodebuild -downloadPlatform iOS` installs a runtime
(8.5 GB for iOS 26.5).

### The audit thresholds

Each audit prints what it finds, one per line, and its gate fails when it finds more than
`scripts/native-audits/thresholds.json` allows. The simulator audit has two numbers, beside the
`device` and `runtime` they were measured on. `ios.count` counts defects, and it is zero.
`ios.system` counts the system controls the audit records (a control UIKit hosts that takes its
taps over less than 44 points, above), and `scripts/ios-audit.mjs` prints them in a list of their
own. `android` counts the Android audit's defects. Any other failure fails the gate whatever the
count: a test other than the audit, a crash, or an Android audit that stops on an exception. A
defect is fixed in its member or in the foundation, never by changing the audit's rules. The
thresholds go down: a change that clears findings lowers its number in the same change, and each
script says when a count is under its number. A threshold counts findings and does not name
them, so a change that clears one and adds another keeps the count; the printed list shows which.
A run that `PM_MEMBERS` limits to some members fails on any defect and prints the system controls
without failing on them, because the thresholds count whole runs. `ios.system` is not a backlog:
each control it records is UIKit's own at UIKit's size, kept so by decision, because a control
sized otherwise would differ from the same control in every other SwiftUI app;
`platforms/ios/README.md` names the fixture states that host them under "What is not here". It
falls when UIKit takes such a control's taps over 44 points. It rises only for a new fixture state
that hosts such a control, by what the whole audit then records, and the same change names the
state in that list. It never rises for a defect a member could clear, and `ios.count` does not
rise.

## The Android gate

`pnpm gate:android` checks the Compose members in `platforms/android/ui`, a Compose
Multiplatform module with two targets: `jvm` (Compose for desktop) and `android`. It holds them to
the iOS gate's kinds of laws: the spec is a contract the code must satisfy, every promised state
renders, every value is a token, no text is written into a member, imports are contained, and the
result is audited for accessibility. It is separate from `pnpm gate` because it needs a JDK, and an
Android SDK for its last step. It runs Gradle through the project's wrapper,
`platforms/android/gradlew`, which fetches Gradle once.

| Step | What it checks |
| --- | --- |
| `pnpm native:contracts --check` | the generated contracts are what the registry gives, the Kotlin ones in `ui/src/generated/kotlin/` and the Swift ones |
| `pnpm native:version --check` | the Android builds and the Dart package declare the release's version |
| `pnpm emit:examples --check` | each platform's example holds the screen the emitter writes from its spec (`platforms/android/examples/relay`, `platforms/ios/Examples/Relay`) |
| `vitest run --project logic packages/native/src/kotlin` | the Kotlin contracts' tests (`kotlin.test.ts`) and the laws over the Kotlin sources (`kotlin-laws.test.ts`) |
| `platforms/android/gradlew -p platforms/android :tokens:build :ui:jvmTest :examples:relay:jvmTest` | the token module compiles and its tests pass; the member module's JVM target compiles and the rendering harness passes; the example's emitted inbox compiles against the member module and renders in its four load states |
| `node scripts/android-publish.mjs` | with an Android SDK, the two modules publish as JitPack builds them (`jitpack.yml`'s tasks, with JitPack's variables, into a Maven repository of the script's own): `tokens`, and `ui` with its `jvm` and Android variants, each with a POM and Gradle module metadata, and `ui` depending on `tokens` at JitPack's coordinates; without one, it says it did not run, and exits 0 |
| `node scripts/android-audit.mjs` | with an Android SDK, the Android library builds (`:ui:assembleAndroidMain`), and in the host tests (`:ui:testAndroidHostTest`) AppShell's and MasterDetailPage's Back tests and the page keyboard test pass and the accessibility audit finds no more defects than `scripts/native-audits/thresholds.json` allows; without one, it says that neither ran, and exits 0 |

The JVM target needs no Android SDK: Compose for desktop compiles the same source set and draws
it with Skia, offscreen, so the harness renders on any machine with a JDK. The Android target's
tasks need an SDK (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `sdk.dir` in
`platforms/android/local.properties`, which git ignores) with the platform the module's
`compileSdk` names, API 37, because the Compose 1.12 libraries require it. Without one, the target
is declared and configured but not compiled, and the gate covers the JVM target only.

### The Kotlin contracts

`packages/native/src/kotlin.ts` writes ten files into
`platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/`, committed and never edited by
hand, for every member the Android platform map marks `native` or `adapted`:

- `Contracts.kt`: `data class PM<Member>Props`, one property per prop (an optional one defaulted
  to `null`), an `enum class` for each literal-union prop, the lawful grid as one
  `PM<Member>Appearance`, a compound part's props as a class of their own, and
  `PM<Member>Rendering`, a `fun interface` with one `@Composable fun Render(props)`. The member's
  file declares `object PM<Member> : PM<Member>Rendering`, so the compiler holds the member to its
  props. A generic member's rendering is a plain `interface`, because a `fun interface` cannot
  declare a generic function: `fun <Row> Render(props: PMDataTableProps<Row>)`. So is the
  rendering of a member with compound parts, which declares one function per part:
  `RenderGroup(props: PMSettingsRowGroupProps)`. A member with a rendering therefore draws its
  parts too, as a SwiftUI member nests its parts' views.
- `Members.kt`: for every member with a rendering, a composable of the member's name that takes
  the props as arguments and draws them, `children` last so it can trail:
  `PMListPage(loadStatus = model.loadStatus, title = "Inbox") { … }`, as the screen contract
  writes a Kotlin screen. Each compound part has one of the joined name the screen emitter calls,
  which draws through the member's rendering: `PMSettingsRowGroup(title = "Appearance") { … }`
  calls `PMSettingsRow.RenderGroup`.
- `Catalogue.kt`, `Unsupported.kt` and `Fixtures.kt`: Android's statuses
  (`PMCatalogue.members`), the props the mapping cannot express (`PMUnsupported.props`), and the
  states fixtures the member files declare (`PMFixtures.all`).
- `Icons.kt`: the vector that draws each icon role. `PMIconRole` carries each role's Material
  Symbols name (`symbolName`, the role's `android` in `design/icons.json`), and the vector is that
  name in the outlined set of Compose's Material icons, under `AutoMirrored` for the glyphs a
  right-to-left layout mirrors (`MIRRORED_SYMBOLS` in `kotlin.ts`). A name the icon library does
  not hold does not compile.
- `Strings.kt`: `PMStrings`, the defaults the specs name, in English, from
  `packages/native/src/strings.ts`, which an app replaces through `LocalPMStrings`.
- `Recipes.kt`: `PMRecipe`, the numbers the recipes write that the members read, from
  `RECIPE_NUMBERS` in `packages/native/src/recipes.ts`.
- `Brands.kt`: each provider's mark, path for path in its published colours, from the engine's
  `BRAND_DRAWINGS`.
- `Phones.kt`: PhoneInput's calling codes and the regions that dial a trunk zero, from the
  engine's table, as `Phones.swift` holds them.

The mapping is the Swift one's, from the same resolution, written in Kotlin:

| TypeScript | Kotlin |
| --- | --- |
| `string`, `number`, `boolean` | `String`, `Double`, `Boolean` |
| a union of string literals | `enum class PM<Member><Prop>(val value: String)`, its entries PascalCased: `Neutral("neutral")` |
| a union of integer literals | `enum class PM<Member><Prop>(val value: Int)`: `Columns1(1)` |
| `ControlSize`, `IconRole`, `SpaceStep`, `SortDirection` and the other shared scales | `PMControlSize`, `PMIconRole`, `PMSpaceStep` (`PMSpaceStep.S4`), `PMSortDirection` |
| `ReactNode`, an element type | `PMContent`, `@Composable () -> Unit` |
| `T[]`, `readonly T[]`; `[A, B]`, `[A, B, C]` | `List<T>`; `Pair<A, B>`, `Triple<A, B, C>` |
| `(a: A) => R`, a DOM event parameter left out | `(A) -> R`: `Button`'s `onClick` is `(() -> Unit)?` |
| `(a: A) => ReactNode` | `@Composable (A) -> Unit`: `DataTableColumn`'s `cell` |
| `void \| Promise<void>`, as a result | `Unit` |
| a shape in `SHAPES` | `data class PM<Name>`, generic where the web's is |
| a union in `UNIONS` | an `enum class` when every branch is a literal (`PMCheckedState`), else a `sealed interface` of one `data class` per branch (`PMSelectOptionEntry.Option`) |
| `File` | `PMFile`, declared in the foundation: the URI, name, size and media type |
| `Blob` | `ByteArray`: ImageEditor's `onConfirm` hands over the framed image's bytes |
| `unknown` | `PMJSONValue`, any JSON value, declared in the foundation: JsonTree's `data`, ToolCall's `input` |
| a name in `JSON_TYPES` (RichTextContent's `RichTextDocument`, `RichTextMark`) | `PMJSONValue`, as on iOS: `PMRichTextEntity`'s `marks` is `List<PMJSONValue>?` |
| `T \| null` | `T?` |
| an optional prop that also takes `null` | `PMSome<T?>?`: `null` is absent, and `PMSome(null)` is the value `null`, as Swift's `T??` is |

`kotlin.test.ts` holds the files to the registry (the freshness law), to determinism, to snapshots
of Button's, Dialog's and DataTable's contracts, to the mapping above, and to two counts of its
own, because Android renders fewer members than iOS: the unsupported props and the opaque types.
No member with a rendering may take an opaque type. The generator refuses a name the hand-written
sources or the token module declare (`kotlinDeclaredTypesIn`).

### The Kotlin laws

`packages/native/src/kotlin-laws.test.ts` reads the Kotlin files under
`ui/src/main/kotlin/dev/polymorph/ui` and proves each law on a sample that breaks it. The
foundation, `PolymorphUI.kt`, is exempt from the token and literal laws: it is where the platform
meets the tokens and where Material 3 is given the pairing. The defaults a spec names are
generated (`PMStrings` in `Strings.kt`, from `packages/native/src/strings.ts`). Its further files,
`PolymorphUI<Topic>.kt`, are held to every law but conformance.

| Law | A member fails when it |
| --- | --- |
| Token-only | builds a colour (`Color(0x…)`, `Color(red = …)`, a hex literal or `"#rrggbb"`), names one (`Color.Red`), writes a length as a number (`12.dp`, `13.sp`, `Dp(4f)`, a number inside `(…).dp`), a value holding a number that becomes a length (`GAP.dp`), makes a type decision of Compose's (`FontWeight.Bold`, `FontWeight(600)`, `FontFamily.Serif`), writes motion as a number (`tween(300)`, `delay(5000)`, `dampingRatio = 0.8f`, `Spring.StiffnessMedium`), leaves motion to Compose (`spring()`, an `AnimatedVisibility` without `enter` and `exit`, a `Crossfade` or `animate…AsState` without its spec), writes a radius as a number (`RoundedCornerShape(8)`) or as `CircleShape`, an alpha other than 0 or 1 anywhere in an `.alpha(…)` or `alpha = …`, or draws Compose's elevation shadow (`.shadow(…)`) instead of the pairing's (`pmShadow`) |
| No literal strings | writes text a person reads into `Text`, `BasicText`, `AnnotatedString`, `append`, a `CustomAccessibilityAction`, a semantics `error`, `dismiss` or `onClick`, a `label =` argument (an animation's label excepted), a `contentDescription`, `stateDescription`, `onClickLabel` or `paneTitle`, or a member's props outside its states fixture, a string inside a template included. Templates of props and punctuation are allowed, and so is a string resource and the member's own name; a default a spec names is `PMStrings`'s |
| Containment | imports anything but Compose (`androidx.compose.*`), Kotlin (`kotlin.*`, `kotlinx.*`), the token module and `dev.polymorph.ui`, or a class `KOTLIN_MEMBER_IMPORTS` (`kotlin-laws.ts`) admits in its file (`java.text.Collator` in `PolymorphUIPhones.kt`, the collator PhoneInput's country list is ordered by); imports Material 2 or Material's icons; builds or reads a Material theme (`MaterialTheme`, a colour scheme, `Typography(…)`, `Shapes(…)`); uses a Material 3 component outside the bridge, `PMMaterialTheme { … }`, or a private function every call of which is inside it; or draws an icon or image directly instead of through `PMIconView` (an icon) or `PMRemoteImage` (a picture from a URL), both in the foundation |
| Conformance | is named for no member the Android platform map marks native or adapted, or does not declare `object PM<Member> : PM<Member>Rendering` and `object <Member>States : PMStates` naming its member |
| No shadowing | declares a `PM…` type or function the token module declares, which an app importing both packages could not use |
| Drawn props | never reads a field of its contract that `packages/native/src/undrawn.ts` does not name under `android`, or reads it only into its identifier, or is named there for a field it reads for anything else ([Undrawn props](#undrawn-props)) |

### The Android pending list

Every member the Android platform map marks native or adapted has a member file or is listed in
`packages/native/src/kotlin-pending.ts`. Its length is pinned in `kotlin-laws.test.ts`
(`KOTLIN_PENDING_COUNT`), and it changes as the iOS list does: `pnpm new:member` adds a new
member and raises the number, and a rendering, or an `absent` decision, removes one and lowers
it.

### The Android harness

`platforms/android/ui/src/test/kotlin/dev/polymorph/ui` renders every entry of every fixture in
`PMFixtures.all` with `ImageComposeScene`, at two pixels per dp. `./gradlew :ui:jvmTest
-Ppm.members=Menu,Popover` renders only the members it names (`Harness.fixtures`), for work on
one member; the gate renders every fixture.

- `RenderingTest` renders each entry 360dp wide and as tall as the entry is at that width, from
  120dp up to a phone's 844 (`Harness.height`), under the default pairing in light mode, under
  the first pairing whose system defaults to dark, in dark mode, and under the default pairing
  right to left (`Harness.rightToLeft`), which `IdentityTest` reads too. `RightToLeftTest` holds
  what that pass must draw where a member places its parts itself: TimeInput's hour left of its
  minute, ColorInput's picker mirrored with its thumbs where their colour is, an open JsonTree
  chevron pointing down, an inline link underlined under right-to-left words. A scene is drawn four frames a
  frame apart and then twice more, two seconds apart (`Harness.settle`), so the effects of the
  first frame run, work that waits a frame for a layout takes its steps (a bottom sheet measures
  where it rests before it rises), and what they start, an overlay's enter transition, finishes.
  Each render must differ from the empty canvas. The PNGs are written to
  `platforms/android/.snapshots/<Member>/<entry>.<pass>.png` (gitignored). A dialog, a bottom
  sheet, a menu and a drawer are drawn in their own windows over the canvas, as on a device.
- `IdentityTest` reads the merged semantics tree, as an accessibility service does. The first
  node carrying a member (`PMMemberKey`, set by `Modifier.pmMember`, which also sets the node's
  test tag to the identifier `member:<Name> key=value…`, its values percent-encoding spaces and
  `%` as the Swift identifier's do) must be the fixture's member, and each key in the entry's
  `expect` must hold: an attribute the identifier carries, `label` for the root's
  content description or text, `value` for its state description, `hidden` for a decorative
  state whose root hides itself from accessibility and exposes nothing, and `contains` for members
  that must each be the member of a node inside the root. In every window, a node a person can act
  on (a click or a toggle) must have a name. An empty expected value means the attribute is
  absent. The rules are `SemanticsAudit`'s, in
  `ui/src/commonTest/kotlin`, which the Android audit applies to the same entries on Android's
  Compose runtime. A second test, on the JVM alone, holds each text field's name to a node inside
  the field (`pmFieldName`) that has no action and no role and is inside no control of the field's
  own, never the field's own content description.
- `ContractTest` checks the catalogue, the lawful grid, that every icon role has a vector, and that
  the fixtures name their members once.

### The Android audit

`scripts/android-audit.mjs` builds the Android library with `:ui:assembleAndroidMain`: the check
that every Android library the module depends on accepts its `compileSdk`, the Kotlin compile of
every member for Android with warnings as errors, and the AAR. It then runs
`:ui:testAndroidHostTest`, which runs `AccessibilityAuditTest`, `AppShellBackTest`,
`MasterDetailPageBackTest`, `PageKeyboardTest` and `MultiSelectKeyboardTest` in
`ui/src/androidHostTest/kotlin`, host tests of
the Android target that run on the JVM under Robolectric. They need the SDK and no device or emulator.

The test composes every states fixture entry with Android's own Compose runtime, in an activity in
a window 360dp wide and 844dp tall at two pixels per dp, under the default pairing in light mode,
with Android's accessibility manager reporting a service on, as TalkBack does. A dialog, a popup
and a bottom sheet are windows of their own. Each entry must hold:

- the rules `IdentityTest` holds it to on the JVM, which both tests take from `SemanticsAudit` in
  `ui/src/commonTest/kotlin`: its identity and the promises of its `expect`, a name on everything
  a person can act on, and each control's action and state;
- the rules of the Accessibility Test Framework's error-level checks, over the
  `AccessibilityNodeInfo` each window's Compose view publishes for each node, which is what
  TalkBack reads. The nodes are walked as the provider publishes them, each node's children by the
  ids its node info lists, so the node Compose adds to carry a merged node's content description
  is read. A node a person can act on (a click or a long click) takes touches over at least 48dp
  each way (`PMTheme.floor.hitTarget`) and says something: its own text, description or hint, or
  that of a child that is visible to the user and not a control. A child that is not visible (a
  part hidden from accessibility or drawn transparent) says nothing, nor does anything under it,
  and a child that is not important for accessibility is a layout read through. No two such nodes
  share their bounds. A node a person types into carries no content description, which TalkBack
  would read in place of the text. A second test, `theAuditHearsWhatTalkBackHears`, holds the audit
  to these readings on three controls drawn for it. Reading the child ids needs Robolectric's real
  `AccessibilityNodeInfo`, which the test task turns on (`robolectric.useRealAni`).

A fixture that lays out a tablet's form and draws it scaled down into the canvas (`PMFixtureWidth`)
is measured at the size it is laid out at. Each touch-target failure names the area that takes
touches and the size the node is laid out at. The framework itself does not run: Compose's bridge
to it declines to run under Robolectric, and the framework's hierarchy cannot reach Compose's nodes
there. Its contrast checks need a screenshot and are not reproduced; the theme's contrast law
covers the pairings' colours. `PM_MEMBERS=TimeInput,Carousel node scripts/android-audit.mjs`, or
`platforms/android/gradlew -p platforms/android :ui:testAndroidHostTest
-Ppm.members=TimeInput,Carousel`, audits only the members it names, and the report is in
`platforms/android/ui/build/test-results/testAndroidHostTest/`. The first run
downloads Robolectric's Android runtime (about 200 MB) into `~/.m2/repository/org/robolectric/`.

The same task runs `AppShellBackTest`, a behaviour of the Android target the JVM harness
cannot reach, because Compose for desktop has no Back. It composes AppShell at a phone's width,
opens the drawer from the menu button, dispatches Back through the activity's
`OnBackPressedDispatcher`, and checks that the drawer closes and the activity stays.
`MasterDetailPageBackTest` composes MasterDetailPage at a phone's width with a detail, dispatches
Back the same way, and checks that it calls `onBack` once and the activity stays, and that Back
with the list drawn is the activity's. `PageKeyboardTest` dispatches a keyboard's insets to the window's Compose view under a FormPage and
checks that the page's column scrolls further by them, because Compose for desktop has no
keyboard insets either. `MultiSelectKeyboardTest` reads the list's window's insets controller:
focusing the search field requests the keyboard, and Done with nothing typed hides it, which the
desktop host cannot see because the list's window brings its own keyboard controller. The script
fails on any failure of the four, whatever the audit's count.

### Adding a member on Android: the Badge

`Badge.kt` is the template:

1. Read the member's spec, its recipe, its generated `PMBadgeProps` in `Contracts.kt`, and its
   entry in `design/platforms/android.json`.
2. Create `ui/src/main/kotlin/dev/polymorph/ui/<Member>.kt` and declare `object PM<Member> :
   PM<Member>Rendering`. It reads its tokens from `PM.theme`: colours as `theme.colors.x.color`,
   type as `theme.text.x.textStyle`, lengths from `theme.defaultDensity.spacing` and
   `theme.radius`, motion from `theme.defaultMotion`. Its root carries `Modifier.pmMember("Badge",
   …)`. A Material component is drawn inside `PMMaterialTheme`; a part another member uses is in a
   foundation file, `PolymorphUI<Topic>.kt`; a default the spec names is a `PMStrings` field.
3. In the same file, declare `object <Member>States : PMStates`, one entry per promised state,
   with what each exposes in `expect`.
4. Remove the member from `kotlin-pending.ts` and lower `KOTLIN_PENDING_COUNT`.
5. Run `pnpm native:contracts`, which adds the member's composable to `Members.kt` and its fixture
   to `Fixtures.kt`, then `pnpm gate:android`, and look at the PNGs in
   `platforms/android/.snapshots/<Member>/`.
