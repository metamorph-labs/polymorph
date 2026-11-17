# @polymorph/solid-ui

The polymorph vocabulary for Solid. Every member is a Solid 1.9 component in TSX that
`pnpm shells` generates from the member's framework-neutral description in
`packages/shells/src/members/`. A member renders the React member's DOM contract (elements, roles,
ARIA, `data-*` attributes and `data-member`), binds a Zag machine through the foundation's
`useMachine` where one gives it behaviour, and imports the recipe the React member imports, from
[`@polymorph/recipes`](../recipes/README.md). It is built on [`@polymorph/solid`](../solid/README.md),
the Solid foundation. [docs/shells.md](../../docs/shells.md#the-solid-renderer) says how the
renderer (`packages/shells/src/solid.ts`) writes each member.

## What it contains

- `src/<tier>/`, one directory per tier (`structure`, `controls`, `overlays`, `layout`, `charts`,
  `ai`, `archetypes`): each member's component (`Tabs.tsx`, its default export), each compound part
  (`TabsContent.tsx`, attached as `Tabs.Content`) and the member's states fixture
  (`tabs.states.tsx`).
- `src/exceptions/`: the ladder primitives `Bespoke`, `DensityScope` and `ToneScope`.
  `src/conventions/icon.states.tsx` is Icon's fixture; `Icon` ships in `@polymorph/solid`, and this
  package re-exports it.
- `src/index.ts`, the entry: every member and its types, and the base layer
  (`@polymorph/recipes/base.css`), imported for its side effect. `src/galleries.ts` lists every
  states fixture for the laws.

The components, the fixtures, `src/index.ts` and `src/galleries.ts` are generated. Never edit them
by hand: change the description and run `pnpm shells` (`pnpm shells --target solid` for these
files alone, `--check` to check without writing). The tests, `src/conformance/`, `src/mount.ts`
and `src/test-setup.ts` are written by hand.

`design/frameworks/solid.json` marks every entry native except `ImageEditor`, which is absent: no
description draws it, because its crop geometry (`image-editor.geometry.ts`) is the React
vocabulary's, not the engine's, so a description cannot share it.

## How a React prop reads in Solid

A Solid component's props are an object, as a React component's are, so every prop keeps its React
name and type. An event prop `onFoo` is the callback prop `onFoo`. `children` and a
`ReactNode`-typed prop are a `JSX.Element`, and a render prop is a function that returns one. A ref
prop (`controlRef`) is a function the member calls with its element, and with `null` when the
element goes. A member reads its props as `props.foo` and never destructures them, so the caller's
JSX makes a value reactive. A member ignores a prop it does not declare, so `class` and `style` do
nothing. The full mapping is in [docs/frameworks.md](../../docs/frameworks.md#from-react-to-solid).

## Entry points

| Import                | In-repo (`exports`) | Built (`publishConfig.exports`)                                                                                          |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@polymorph/solid-ui` | `src/index.ts`      | `types`: `dist/types/index.d.ts`; `solid`: `dist/source/index.js`; `browser`, `import`: `dist/index.js`; `node`: `dist/server/index.js` |

## Build

`pnpm --filter @polymorph/solid-ui build` runs `vite build --config vite.build.config.ts` (the
browser's build, to `dist/`), the same with `--mode server` (to `dist/server/`),
`tsc -p tsconfig.build.json` (the declarations, to `dist/types/`), `tsc -p tsconfig.source.json`
(to `dist/source/`) and the foundation's `scripts/source.mjs`, which writes every relative
specifier in the source as the file it names (`./controls/Button.jsx`). The browser's build compiles each recipe beside its member, each module
importing its own stylesheet, and its entry imports the base layer and
`@polymorph/solid/style.css`. The server's build imports no stylesheet, so plain Node loads it and
renders a member to a string. The source form keeps its JSX and imports each recipe from
`@polymorph/recipes` by name, for the application's compiler and bundler. Neither build is
hydratable; an application that hydrates compiles the source.

## Dependencies and peers

- **Peer:** `solid-js` `^1.9.0`.
- **Runtime:** `@polymorph/solid` and `@polymorph/recipes` (`workspace:*` here, published as
  `npm:` aliases of their `@metamorph-labs/polymorph-*` names); `@zag-js/solid` and the Zag
  machines the manifest lists (`@zag-js/dialog`, `@zag-js/select`, …), each at exactly `1.46.0`,
  the version of the `@zag-js/core` the foundation's `useMachine` runs every machine on. The
  packaging law holds the two to one version.

The package is published as `@metamorph-labs/polymorph-solid-ui` and installed as
`@polymorph/solid-ui` through an npm alias
(`"@polymorph/solid-ui": "npm:@metamorph-labs/polymorph-solid-ui@^1.0.0"`).
[docs/consuming.md](../../docs/consuming.md#a-solid-app) has the application's side.

## Laws and tests

| File                      | Project | What it checks |
| ------------------------- | ------- | -------------- |
| `laws.test.ts`            | `logic` | completeness, spec staleness, the framework map, token-only |
| `src/laws.test.ts`        | `solid` | every fixture entry renders what it promises, carries `data-member` and passes axe |
| `src/conformance.test.ts` | `solid` | every contract statement holds through the Solid adapter (`src/conformance/solid.ts`), except the ledger's (`src/conformance/ledger.ts`) |
| `src/<tier>/*.test.tsx`   | `solid` | behaviour the contract grammar cannot state |
| `src/conventions/foundation.test.tsx` | `solid` | the foundation's `useMachine`, `watchEffect`, `itemOf` and slot attributes |
| `packaging.test.ts`       | `logic` | the three forms: imports declared, stylesheets where each form needs them, the server's build rendered in Node, every member declared |

```sh
pnpm exec vitest run --project solid                                                    # the browser laws
pnpm exec vitest run packages/solid-ui/laws.test.ts packages/solid-ui/packaging.test.ts  # the node laws
```

[docs/shells.md](../../docs/shells.md#the-solid-laws) describes each law.
