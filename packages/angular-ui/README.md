# @polymorph/angular-ui

The polymorph vocabulary for Angular. Every member is a standalone Angular 22 component, with an
inline template and signal inputs, that `pnpm shells` generates from the member's framework-neutral
description in `packages/shells/src/members/`. A member renders the React member's DOM contract
(elements, roles, ARIA, `data-*` attributes and `data-member`), binds a Zag machine through the
foundation's adapter where one gives it behaviour, and is styled by the recipe the React member
imports. It is built on [`@polymorph/angular`](../angular/README.md), the Angular foundation.
[docs/shells.md](../../docs/shells.md#the-angular-renderer) says how the renderer
(`packages/shells/src/angular.ts`) writes each member.

## What it contains

- `src/<tier>/`, one directory per tier (`structure`, `controls`, `overlays`, `layout`, `charts`,
  `ai`, `archetypes`): each member's component (`Tabs.ts`, the class `Tabs`, selected as
  `<pm-tabs>`), each compound part as a component of its own (`TabsContent.ts`,
  `<pm-tabs-content>`) and the member's states fixture (`tabs.states.ts`).
- `src/exceptions/`: the ladder primitives `Bespoke`, `DensityScope` and `ToneScope`.
  `src/conventions/icon.states.ts` is Icon's fixture; `Icon` ships in `@polymorph/angular`, and
  this package re-exports it.
- `src/index.ts`, the entry: every member, every public part and their types. `src/galleries.ts`
  lists every states fixture for the laws.

The components, the fixtures, `src/index.ts` and `src/galleries.ts` are generated. Never edit them
by hand: change the description and run `pnpm shells` (`--target angular` for these files alone,
`--check` to check without writing). The tests, `src/conformance/`, `vitest.plugins.ts` and
`scripts/linker.mjs` (Angular's linker, for `pnpm size`) are written by hand.

`design/frameworks/angular.json` marks every entry native except `ImageEditor`, which is absent: no
description draws it, because its crop geometry (`image-editor.geometry.ts`) is the React
vocabulary's, not the engine's, so a description cannot share it.

## How a React prop reads in Angular

A member is listed in a component's `imports` and written by its selector (`<pm-button>`). A prop
`foo` is the input `foo` (`foo="text"`, `[foo]="value"`). An event prop `onFoo` is the output
`foo`, which emits the callback's first argument (`(foo)="handler($event)"`). `children` is the
content between a member's tags, and a `ReactNode`-typed prop `foo` is content marked `slot="foo"`.
A render prop is an input that takes an `ng-template`. A member's host element draws no box
(`display: contents`). An output returns nothing to the member, so ConfirmDialog closes when it is
confirmed; a caller that saves first holds `open` itself. The full mapping is in
[docs/frameworks.md](../../docs/frameworks.md#from-react-to-angular).

## Entry points

| Import                           | In-repo (`exports`) | Built (`publishConfig.exports`)                                               |
| -------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `@polymorph/angular-ui`          | `src/index.ts`      | `types`: `dist/index.d.ts`; `default`: `dist/fesm2022/polymorph-angular-ui.mjs` |
| `@polymorph/angular-ui/base.css` | —                   | `dist/base.css` (the base layer)                                              |

The package is one flat ES module under `dist/fesm2022/`, in the Angular package format, with
partial declarations the application's Angular links. The Angular CLI compiles no stylesheet a
module imports, so the base layer ships as `base.css`: an Angular CLI app lists it in
`angular.json`'s `styles`, and a Vite app imports it after the theme module.

## Build

`pnpm --filter @polymorph/angular-ui build` runs the foundation's script,
`node ../angular/scripts/package.mjs`. It compiles each recipe a member imports, and the recipes it
composes from, into the member's component `styles`, which Angular adds to the page once; compiles
with `ngc` in partial mode; bundles the flat module, every package import external; and copies
`@polymorph/recipes/base.css` to `dist/base.css`. Tests, fixtures, galleries and the conformance
adapter do not ship. The script reads `@polymorph/angular` from its built declarations
(`packages/angular/dist`), so the foundation is built first; `pnpm build:packages` runs the builds
in that order.

## Dependencies and peers

- **Peer:** `@angular/core` `^22.0.0`.
- **Runtime:** `@polymorph/angular` and `@polymorph/engine` (`workspace:*` here, published as
  `npm:` aliases of their `@metamorph-labs/polymorph-*` names); the Zag machines the manifest lists
  (`@zag-js/dialog`, `@zag-js/select`, …), each `^1.46.0`; `@internationalized/date` `^3.12.2`;
  `tslib` `^2.8.1`. `@polymorph/recipes` is a dev dependency, because the build compiles the
  recipes into the components.

The package is published as `@metamorph-labs/polymorph-angular-ui` and installed as
`@polymorph/angular-ui` through an npm alias
(`"@polymorph/angular-ui": "npm:@metamorph-labs/polymorph-angular-ui@^1.0.0"`).
[docs/consuming.md](../../docs/consuming.md#an-angular-app) has the application's side.

## Laws and tests

| File                      | Project   | What it checks |
| ------------------------- | --------- | -------------- |
| `laws.test.ts`            | `logic`   | completeness, spec staleness, the framework map, token-only |
| `src/laws.test.ts`        | `angular` | every fixture entry renders what it promises, carries `data-member` and passes axe |
| `src/conformance.test.ts` | `angular` | every contract statement holds through the Angular adapter (`src/conformance/angular.ts`), except the ledger's (`src/conformance/ledger.ts`) |
| `src/<tier>/*.test.ts`    | `angular` | Dialog's focus trap, a table row's click, a controlled MultiSelect's text |
| `packaging.test.ts`       | `logic`   | the flat module, partial declarations, each member's recipe rules in its styles, `base.css`, every import declared |

```sh
pnpm exec vitest run --project angular                                                      # the browser laws
pnpm exec vitest run packages/angular-ui/laws.test.ts packages/angular-ui/packaging.test.ts  # the node laws
```

The `angular` project compiles the members ahead of time (`vitest.plugins.ts`) and runs the
foundation's adapter test too. [docs/shells.md](../../docs/shells.md#the-angular-laws) has each law.
