# @polymorph/svelte-ui

The polymorph vocabulary for Svelte. Every member is a Svelte 5 component, written with runes and
snippets, that `pnpm shells` generates from the member's framework-neutral description in
`packages/shells/src/members/`. A member renders the React member's DOM contract (elements, roles,
ARIA, `data-*` attributes and `data-member`), binds a Zag machine through `@zag-js/svelte` where one
gives it behaviour, and imports the recipe the React member imports, from
[`@polymorph/recipes`](../recipes/README.md). It is built on
[`@polymorph/svelte`](../svelte/README.md), the Svelte foundation.
[docs/shells.md](../../docs/shells.md#the-svelte-renderer) says how the renderer
(`packages/shells/src/svelte.ts`) writes each member.

## What it contains

- `src/<tier>/`, one directory per tier (`structure`, `controls`, `overlays`, `layout`, `charts`,
  `ai`, `archetypes`): each member's component (`Tabs.svelte`), each compound part
  (`TabsContent.svelte`, attached as `Tabs.Content`) and the member's states fixture
  (`tabs.states.svelte`).
- `src/exceptions/`: the ladder primitives `Bespoke`, `DensityScope` and `ToneScope`.
  `src/conventions/icon.states.svelte` is Icon's fixture; `Icon` ships in `@polymorph/svelte`, and
  this package re-exports it.
- `src/index.ts`, the entry: every member and its types, and the base layer
  (`@polymorph/recipes/base.css`), imported for its side effect. `src/galleries.ts` lists every
  states fixture for the laws.

The components, the fixtures, `src/index.ts` and `src/galleries.ts` are generated. Never edit them
by hand: change the description and run `pnpm shells` (`pnpm shells --target svelte` for these
files alone, `--check` to check without writing). The tests, the harnesses in `src/testing/`,
`src/conformance/`, `src/mount.ts`, `src/MountedEntry.svelte` and `src/test-setup.ts` are written by
hand. `svelte.config.js` holds the compiler options `svelte-check` and the browser project read.

`design/frameworks/svelte.json` marks every entry native except `ImageEditor`, which is absent: no
description draws it, because its crop geometry (`image-editor.geometry.ts`) is the React
vocabulary's, not the engine's, so a description cannot share it.

## How a React prop reads in Svelte

Every React prop stays a prop of its React name and type, because a callback and a snippet are
props in Svelte. An event prop `onFoo` is the callback prop `onFoo`. `children` is the snippet
between a member's tags, a `ReactNode`-typed prop `foo` is the snippet prop `foo`, and a render prop
is a snippet with its argument (`Snippet<[Arg]>`). A compound part keeps its dotted name
(`<Tabs.Content>`). A member ignores a prop it does not declare, so `class` and `style` do nothing.
The full mapping is in [docs/frameworks.md](../../docs/frameworks.md#from-react-to-svelte).

## Entry points

| Import                 | In-repo (`exports`): `types`, `svelte`, `default` | Built (`publishConfig.exports`)                                  |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `@polymorph/svelte-ui` | `src/index.ts`                                    | `types`: `dist/index.d.ts`; `svelte`, `default`: `dist/index.js` |

## Build

`pnpm --filter @polymorph/svelte-ui build` runs the foundation's script,
`node ../svelte/scripts/package.mjs .`. It writes `dist/` as the source the consumer's Svelte
compiles for the browser and for a server render: every component as it is, each TypeScript module
as JavaScript, every relative import fully specified, and the declarations from `svelte2tsx`. Each
member imports its recipe from `@polymorph/recipes`, which publishes its CSS Modules as source, so
the consumer's bundler compiles a member's stylesheet beside it. Tests, fixtures, galleries,
harnesses and the conformance adapter do not ship.

On a server render under Vite, a member that reads its slot renders the slot first with
`svelte/server`. Under another bundler, FormField, ChatThread, CodeBlock, Markdown, StreamingText
and the members built on them render on the server as if their slots were empty. A slot is probed
by a mount as its member is made, and a mount inside a hydration reads the server's markup as its
own, so a server-rendered application mounts its root on the client rather than hydrating it
([docs/shells.md](../../docs/shells.md#the-svelte-renderer)).

## Dependencies and peers

- **Peer:** `svelte` `^5.46.4`.
- **Runtime:** `@polymorph/svelte` and `@polymorph/recipes` (`workspace:*` here, published as
  `npm:` aliases of their `@metamorph-labs/polymorph-*` names); `@zag-js/svelte` and the Zag
  machines the manifest lists (`@zag-js/dialog`, `@zag-js/select`, …), each `^1.46.0`.

The package is published as `@metamorph-labs/polymorph-svelte-ui` and installed as
`@polymorph/svelte-ui` through an npm alias
(`"@polymorph/svelte-ui": "npm:@metamorph-labs/polymorph-svelte-ui@^1.0.0"`).
[docs/consuming.md](../../docs/consuming.md#a-svelte-app) has the application's side.

## Laws and tests

| File                      | Project  | What it checks |
| ------------------------- | -------- | -------------- |
| `laws.test.ts`            | `logic`  | completeness, spec staleness, the framework map, token-only, and no whitespace between nodes |
| `src/laws.test.ts`        | `svelte` | every fixture entry renders what it promises, carries `data-member` and passes axe |
| `src/conformance.test.ts` | `svelte` | every contract statement holds through the Svelte adapter (`src/conformance/svelte.ts`), except the ledger's (`src/conformance/ledger.ts`) |
| `src/<tier>/*.test.ts`, `src/conventions/*.test.ts` | `svelte` | behaviour the contract grammar cannot state, and the foundation's presences and slot conventions |
| `packaging.test.ts`       | `logic`  | the build: every import declared, every relative import shipped, every component compiled for the browser and a server render |
| `server-render.test.ts`   | `logic`  | each fixture entry's server markup has the text and `data-*` attributes of its first render in a mount |

```sh
pnpm exec vitest run --project svelte                                                     # the browser laws
pnpm exec vitest run packages/svelte-ui/laws.test.ts packages/svelte-ui/packaging.test.ts  # the node laws
```

[docs/shells.md](../../docs/shells.md#the-svelte-laws) describes each law.
