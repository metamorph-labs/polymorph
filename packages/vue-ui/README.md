# @polymorph/vue-ui

The polymorph vocabulary for Vue. Every member is a single-file component
(`<script setup lang="ts">`) that `pnpm shells` generates from the member's framework-neutral
description in `packages/shells/src/members/`. A member renders the React member's DOM contract
(elements, roles, ARIA, `data-*` attributes and `data-member`), binds a Zag machine through
`@zag-js/vue` where one gives it behaviour, and is styled by the recipe the React member imports,
from [`@polymorph/recipes`](../recipes/README.md). It is built on [`@polymorph/vue`](../vue/README.md),
the Vue foundation. [docs/shells.md](../../docs/shells.md#the-vue-renderer) says how the renderer
(`packages/shells/src/vue.ts`) writes each member.

## What it contains

- `src/<tier>/`, one directory per tier (`structure`, `controls`, `overlays`, `layout`, `charts`,
  `ai`, `archetypes`): each member's component (`Tabs.vue`), each compound part (`TabsContent.vue`,
  attached as `Tabs.Content`) and the member's states fixture (`tabs.states.ts`).
- `src/exceptions/`: the ladder primitives `Bespoke`, `DensityScope` and `ToneScope`.
  `src/conventions/icon.states.ts` is Icon's fixture; `Icon` ships in `@polymorph/vue`, and this
  package re-exports it.
- `src/index.ts`, the entry: every member and its types, and the base layer
  (`@polymorph/recipes/base.css`), imported for its side effect. `src/galleries.ts` lists every
  states fixture for the laws.

The components, the fixtures, `src/index.ts` and `src/galleries.ts` are generated. Never edit them
by hand: change the description, or the React member whose props the registry reads, and run
`pnpm shells`. `pnpm shells --check` fails on a missing, stale or orphaned file. The tests,
`src/conformance/`, `src/mount.ts` and `src/test-setup.ts` are written by hand.

`design/frameworks/vue.json` marks every entry native except `ImageEditor`, which is absent: no
description draws it, because its crop geometry (`image-editor.geometry.ts`) is the React
vocabulary's, not the engine's, so a description cannot share it.

## How a React prop reads in Vue

| React                                   | Vue                                                    |
| --------------------------------------- | ------------------------------------------------------ |
| prop `foo`                              | prop `foo`, same name and type                         |
| event prop `onFoo: (payload) => void`   | emitted event `foo`, written `@foo="handler"`          |
| `children`                              | the default slot                                       |
| a `ReactNode`-typed prop `foo`          | the named slot `foo`                                   |
| a render prop `foo: (arg) => ReactNode` | the scoped slot `foo`, with `arg` as its slot props    |
| a compound part `<Tabs.Content>`        | the same dotted name                                   |
| no `className`/`style` on members       | no `class`/`style`: members declare `inheritAttrs: false` |

The full mapping is in [docs/frameworks.md](../../docs/frameworks.md#from-react-to-vue).

## Entry points

| Import              | In-repo (`exports`) | Built (`publishConfig.exports`)                                                       |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `@polymorph/vue-ui` | `src/index.ts`      | `types`: `dist/types/index.d.ts`; `node`: `dist/node/index.js`; `import`: `dist/index.js` |

## Build

`pnpm --filter @polymorph/vue-ui build` runs `vite build --config vite.build.config.ts`, then
`vue-tsc -p tsconfig.build.json` for the declarations in `dist/types/`. The build compiles each
recipe into its member's directory and writes one module per source module, each importing its
own extracted CSS. The entry imports the base layer and `@polymorph/vue/style.css`. A copy of every
module under `dist/node/` imports no stylesheet, for the `node` condition, so Node, Vitest and a
server render load the package. Fixtures, galleries, tests and the conformance adapter do not ship.

## Dependencies and peers

- **Peer:** `vue` `^3.5.0`.
- **Runtime:** `@polymorph/vue` and `@polymorph/recipes` (`workspace:*` here, published as `npm:`
  aliases of their `@metamorph-labs/polymorph-*` names); `@zag-js/vue` and the Zag machines the
  manifest lists (`@zag-js/dialog`, `@zag-js/select`, …), each `^1.46.0`.

The package is published as `@metamorph-labs/polymorph-vue-ui` and installed as
`@polymorph/vue-ui` through an npm alias
(`"@polymorph/vue-ui": "npm:@metamorph-labs/polymorph-vue-ui@^1.0.0"`).
[docs/consuming.md](../../docs/consuming.md#a-vue-app) has the application's side, which
`polymorph init --framework vue` writes.

## Laws and tests

| File                       | Project | What it checks                                                                                  |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `laws.test.ts`             | `logic` | completeness against the React fixtures and the lawful grid, spec staleness, the framework map, token-only |
| `src/laws.test.ts`         | `vue`   | every fixture entry renders what it promises, carries `data-member` and passes axe              |
| `src/conformance.test.ts`  | `vue`   | every contract statement holds through the Vue adapter (`src/conformance/vue.ts`), except the ledger's (`src/conformance/ledger.ts`) |
| `src/<tier>/*.test.ts`     | `vue`   | behaviour the contract grammar cannot state                                                     |
| `packaging.test.ts`        | `logic` | the build: every import declared, each recipe beside its member, `node` copies without stylesheets, every member declared |

```sh
pnpm exec vitest run --project vue                                                   # the browser laws
pnpm exec vitest run packages/vue-ui/laws.test.ts packages/vue-ui/packaging.test.ts  # the node laws
```

`packages/shells/src/shells.test.ts` holds the generated files to what `pnpm shells` writes.
[docs/shells.md](../../docs/shells.md#the-laws) describes each law.
