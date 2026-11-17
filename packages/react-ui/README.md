# @polymorph/react-ui

The React rendering of the **vocabulary**: the closed set of components that polymorph
applications are built from. One component is a **member**. Every member has closed props (no
`className`, no `style`), ships every state it can be in, and is styled only with `--pm-*` tokens,
so an application composes members and binds content to them without making a single style
decision of its own. What a member is, and the contract it keeps, is in
[`docs/concepts.md`](../../docs/concepts.md).

This package is written by hand on React Aria and Radix. Vue, Svelte, Solid and Angular render the
same vocabulary in `@polymorph/vue-ui`, `@polymorph/svelte-ui`, `@polymorph/solid-ui` and
`@polymorph/angular-ui`, which `pnpm shells` generates from the member descriptions in
`packages/shells/src/members/` ([`docs/frameworks.md`](../../docs/frameworks.md)). SwiftUI and
Compose render it in `platforms/ios` and `platforms/android`
([`docs/native.md`](../../docs/native.md)).

In this repository the package is **source**: TypeScript, styled by the CSS Modules in
[`@polymorph/recipes`](../recipes/README.md) and compiled by the app's bundler. The published
package (`@metamorph-labs/polymorph-react-ui`, installed as `@polymorph/react-ui`) is a **build**
of it: `pnpm --filter @polymorph/react-ui build` (`vite.build.config.ts`) compiles each member's
recipe into the member's directory and writes one JavaScript module per source module, plus type
declarations, into `dist/`. A recipe's module imports the base layer and its own extracted CSS
through the package's `imports` map, which hands a bundler the stylesheet and Node an empty
module. `publishConfig.exports` points there.
Another repository uses it one of two ways ([`docs/consuming.md`](../../docs/consuming.md)):

- **Install** — depend on `@polymorph/react-ui` and import from its entry points. The React
  foundation (`@polymorph/react`) and the engine (`@polymorph/engine`) come with it as
  dependencies.
- **Vendor** — `polymorph add <member…>` (the CLI in [`packages/cli`](../cli/README.md)) copies a
  member's source, recipe and states fixture, plus everything they import, into the
  application's own tree (`src/polymorph` by default). The application then owns those files;
  `polymorph diff` and `polymorph update` reconcile them with this package.

Both ways rest on [`@polymorph/react`](../react/README.md), the React foundation the members
import, which a vendoring application installs rather than copies. It re-exports the engine
([`@polymorph/engine`](../engine/README.md): the theme engine, the motion engine and the shared
conventions) and adds the parts that exist only in React: the icon gateway, the motion presence
components and the hooks. A member imports `@polymorph/react` and nothing deeper.

## The tiers

Members are grouped into **tiers**, one directory each.

| Tier | Directory | What lives there |
| --- | --- | --- |
| `structure` | [`src/structure/`](src/structure) | display and content — `Card`, `Table`, `DataTable`, `Heading`, `Text`, `Stat`, `Hero` |
| `controls` | [`src/controls/`](src/controls) | inputs and actions — `Button`, `Input`, `Select`, `Combobox`, `DatePicker`, `FormField` |
| `overlays` | [`src/overlays/`](src/overlays) | things that float or interrupt — `Dialog`, `Drawer`, `Menu`, `Popover`, `Tooltip`, `Tabs`, `Toast` |
| `layout` | [`src/layout/`](src/layout) | spacing and arrangement — `Stack`, `Inline`, `Grid`, `SplitPane` |
| `charts` | [`src/charts/`](src/charts) | data visualisation — `BarChart`, `LineChart`, `DonutChart`, `Sparkline` ([`docs/charts.md`](../../docs/charts.md)) |
| `ai` | [`src/ai/`](src/ai) | conversation with a model — `ChatThread`, `ChatMessage`, `PromptInput`, `ToolCall`, `StreamingText`, `Citation` ([`docs/conversation.md`](../../docs/conversation.md)) |
| `archetypes` | [`src/archetypes/`](src/archetypes) | whole-page anatomies — `AppShell`, `ListPage`, `DetailPage`, `FormPage`, `SettingsPage`, `Dashboard`, `AuthPage`, `MasterDetailPage`, `SearchPage`, `ConversationPage` |

`Icon` is a member too: its component lives in `@polymorph/react` and is re-exported here, and its
states fixture is in [`src/conventions/`](src/conventions). `Toast` has no component of its
own; it is `<Toaster />` plus the `toast()` function.

Two more directories hold what the members share:

- [`src/conventions/`](src/conventions) — `PageTransitions`, `FixtureBox` and Icon's states
  fixture. The base layer (`base.css`: the reset that binds the page to the theme), the
  focus ring, state and press feedback and the accessibility helpers that recipes `composes:`
  from are recipes, in [`packages/recipes/src/`](../recipes/src).
- [`src/exceptions/`](src/exceptions) — the exception ladder's components: `Bespoke` (a
  declared zone where the red rules are suspended) and the contextual scopes `DensityScope`
  and `ToneScope` ([`docs/rules.md`](../../docs/rules.md)).

The generated catalogue lists every member with its props, states and tokens: run
`pnpm registry` and read `registry/system-card.md`.

## Entry points

From `exports` in [`package.json`](package.json):

| Import | File | For |
| --- | --- | --- |
| `@polymorph/react-ui` | `src/index.ts` | Every member, its props types, and the shared helpers (`dataAttrs`, `assertGoverned`, `gallerySlug`, the icon roles). In source, importing it also loads the base layer. In the build each member brings the base layer, and the entry only re-exports. |
| `@polymorph/react-ui/galleries` | `src/galleries.ts` | `GALLERIES` — every states fixture, in gallery order — and `FixtureBox`. For harnesses (the workbench, the docs site) and the laws; kept out of the root so an application never bundles fixtures. |
| `@polymorph/react-ui/identity` | `src/identity.ts` | The small set an authentication surface needs (`AuthPage`, `Button`, `Input`, `PasswordInput`, `FormField`, `Toaster`, …), so an auth bundle does not pull in the rest. |
| `@polymorph/react-ui/identity-signup` | `src/identity-signup.ts` | The heavier controls a signup flow adds (`ColorInput`, `ImageEditor`, `Select`). |

`publishConfig.exports` maps each subpath onto the build under two conditions: `types`
(`dist/types/<entry>.d.ts`) and `import` (`dist/<entry>.js`). Every toolchain therefore loads the
same modules. A framework that resolves a client component while it builds its server, as
Next.js's App Router does, would otherwise carry a server-only copy of a module to the browser.

What differs by condition is the stylesheet. A built module imports one as
`#stylesheet/<tier>/<file>.css`, and the `imports` map in `package.json` resolves it: to the
stylesheet under `react-server` and `default`, which a bundler matches, and to
`dist/no-stylesheet.js`, an empty module, under `node`. Node cannot import a `.css` file, and
Vitest and a server render hand `node_modules` to Node. In Node no member stylesheet loads, so a
test that reads a computed style needs a real browser. The published entry points have no side
effect, so a bundler that follows a name to its module loads that member and its stylesheet and
nothing else.

A compound member attaches its parts (`Tabs.Content`, `Table.Row`) in a module without
`'use client'`, beside the client module that holds its state (`overlays/Tabs.tsx` and
`overlays/tabs-parts.tsx`). A server component reads a client module's export as a reference,
and a property of a reference is `undefined`.

A focused entry point exports nothing the root does not, under the same names
(`consumption.test.ts` holds that). There are no deep imports: anything not in this table is
not part of the contract.

## Dependencies

- **Peer:** `react` and `react-dom` `^19.0.0`.
- **Runtime:** `@polymorph/react` (which brings `@polymorph/engine`); `@polymorph/recipes`, whose
  recipes the build compiles in and source imports by name; Radix primitives and
  React Aria / React Stately for behaviour (focus management, keyboard models, positioning);
  `@internationalized/date` for the date controls. The chart members' arithmetic is the
  engine's (`@polymorph/engine/charts`, through `@polymorph/react`), which alone imports
  `d3-array`, `d3-scale` and `d3-shape`.

Behaviour comes from those libraries. Everything a user perceives (markup, styling, motion and
the props) is polymorph's own.

## Anatomy of a member

A member is a handful of files with the same stem. `Timeline` is a small, complete example:

| File | What it is |
| --- | --- |
| `src/structure/Timeline.tsx` | The component. Closed props, a `data-member` attribute on its root, and `'use client'` only if it needs a browser. |
| [`packages/recipes/src/structure/timeline.module.css`](../recipes/src/structure/timeline.module.css) | The **recipe**: its styling, in `--pm-*` tokens only, imported as `@polymorph/recipes/structure/timeline.module.css`. Shared conventions arrive through `composes:`. It is in [`@polymorph/recipes`](../recipes/README.md), at the member's path, because it has no framework code. |
| `src/structure/timeline.states.tsx` | The **states fixture**: one entry per state the member promises, with the attributes each one must render. The laws render it; the workbench draws it. |
| `src/structure/timeline.test.tsx` | Claims that need a real browser — geometry against a token, focus order, keyboard behaviour. Some families share one file (`layout.test.tsx`, `text-tier.test.tsx`). |
| [`design/components/timeline.md`](../../design/components/timeline.md) | The **spec**: what it is and is not, anatomy, API, exact tokens, states, motion, accessibility. Archetypes keep theirs in [`design/archetypes/`](../../design/archetypes). |

A few members share a recipe (`Stack`, `Inline` and `Grid` use `layout.module.css`) or add no
CSS of their own (`ConfirmDialog` is a `Dialog`).

## Laws over this package

A **law** is a test that enforces a design claim. The ones that run over the vocabulary:

| Law | Where | What it checks |
| --- | --- | --- |
| Completeness | [`src/laws.test.tsx`](src/laws.test.tsx) | Every states-fixture entry renders, and carries exactly the attributes it promises. |
| Accessibility | [`src/laws.test.tsx`](src/laws.test.tsx) | axe finds no violation in any fixture entry. The axe rules switched off are listed there, each with its reason. |
| Identity | [`src/laws.test.tsx`](src/laws.test.tsx) | Every member's fixture renders its `data-member` attribute, which the theme engine's per-member exceptions use as an address. |
| Required selectors | [`src/selectors.test.ts`](src/selectors.test.ts) | States a prop cannot reach (hover, focus, substrate-set attributes) are styled in the member's stylesheet or what it composes. |
| Gallery registry | [`src/galleries.test.tsx`](src/galleries.test.tsx) | The exact list of members and the route slug each one answers on. |
| Wiring | [`src/wiring.test.ts`](src/wiring.test.ts) | Every states file on disk appears in all four hand-maintained lists (exports, `GALLERIES`, the gallery registry, the stylesheet map). |
| Reduced motion | [`src/conventions/reduced-motion.test.ts`](src/conventions/reduced-motion.test.ts) | Every CSS animation that moves an element has a `prefers-reduced-motion` projection. |
| Localization | [`src/localization.test.tsx`](src/localization.test.tsx) | A host's own words, passed as props, reach every name a member would otherwise default in English. |
| Behaviour conformance | [`src/conformance.test.tsx`](src/conformance.test.tsx) | Every statement in every spec's contract fence holds against the React member, in a real browser, from the states-fixture entry it names. A deliberate divergence is in [`src/conformance/ledger.ts`](src/conformance/ledger.ts) ([`docs/conformance.md`](../../docs/conformance.md)). |
| Consumption | [`consumption.test.ts`](consumption.test.ts) | Every entry point exists, focused entry points are subsets of the root, and every import the source makes is declared in `package.json`. |
| Published build | [`packaging.test.ts`](packaging.test.ts) | The real build (`vite.build.config.ts`): each member imports the base layer and its compiled stylesheet through the `imports` map, every recipe rule outweighs the base layer, the entry points import no stylesheet and have no side effect, each module is built once, `'use client'` directives survive, and the declarations name no unpublished package. |
| Server render | [`server-render.test.ts`](server-render.test.ts) | Every state of every states fixture renders from the published build with `react-dom/server`, in plain Node, without throwing or logging an error. |

Laws in [`packages/rules`](../rules/README.md) also read this package: spec staleness (every
spec's API section matches the props the code ships), token references (every `--pm-*` a
recipe reads exists), the `'use client'` law (in both directions), and the localization law
over source. The **red rules** (ESLint and Stylelint rules that fail the lint gate) keep recipes
to tokens, keep motion inside the engine, and keep every import resolvable after the
source is vendored; see [`docs/rules.md`](../../docs/rules.md). How all of this runs is in
[`docs/verification.md`](../../docs/verification.md).

## Testing

Tests under `src/` run in real Chromium through Vitest's browser mode (the `ui` project);
the ones at the package root (`consumption.test.ts`, `new-member.test.ts`, `packaging.test.ts`,
`server-render.test.ts`) are node tests in the `logic` project, because they are about files on
disk and the published build. `pnpm gate:next` builds a Next.js application from that build
([`docs/verification.md`](../../docs/verification.md#the-nextjs-gate)).

```sh
pnpm exec vitest run --project ui                         # the whole browser suite for this package
pnpm exec vitest run packages/react-ui/src/laws.test.tsx  # one file
pnpm exec vitest run packages/react-ui/consumption.test.ts packages/react-ui/new-member.test.ts
```

Browser tests install a theme with `installTestTheme` from `@polymorph/engine/testing`.

## Adding a member

First check that no existing member already does the job, because a closed vocabulary exists
to prevent duplicate members. Then run
`pnpm new:member <Name> --tier <tier>` ([`bin/new-member.mjs`](bin/new-member.mjs)): it writes
the component, recipe, states fixture, test, spec and framework-neutral description as stubs
with every design decision left as a `DECIDE` marker. It wires the new member into the four
lists the wiring law reads, gives it a `DECIDE` placeholder in each phone platform file and each
framework map, and adds it to the iOS and Android pending lists with their pinned counts raised.
The full process (what to read first, what to decide, which checks apply) is in
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Read more

- [`docs/concepts.md`](../../docs/concepts.md) — the decision system, tiers, and the member contract
- [`docs/consuming.md`](../../docs/consuming.md) — linking or vendoring from another repository
- [`docs/rules.md`](../../docs/rules.md) — the red rules and the exception ladder
- [`design/components/README.md`](../../design/components/README.md) — conventions every member's spec shares
