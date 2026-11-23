# @polymorph/workbench

The designer's app, a React app. Designers use it to make systems and palettes, compose screens,
and inspect the whole vocabulary under any pairing, in its React rendering `@polymorph/react-ui`.
The vocabulary is the closed set of components, and each one is a _member_. A pairing is a system
plus a palette. The app also hosts Relay, the demo product.

## Running it

From the repository root:

```sh
pnpm dev          # this app
pnpm dev:docs     # the docs site, apps/docs, if you want both
```

`predev` first runs the registry generator (`packages/registry/bin/registry.js`, which
`pnpm registry` also runs). It regenerates `registry/registry.json` and `src/fonts.gen.ts` (both
gitignored). Vite prints the local URL.

A toolbar at the top of every page selects the system, palette, mode, density and motion
temperament, and persists them in `localStorage`. Every page renders under that selection. The
toolbar can also apply an unsaved studio draft like any shipped pairing.

## Areas

| Route | Area | Code |
| --- | --- | --- |
| `/` (also `/studio`) | Theme studio | `src/studio/` |
| `/composer` | Screen composer | `src/composer/` |
| `/components`, `/components/<slug>` | Component browser | `src/harness/ComponentsPage.tsx`, `ComponentDetailPage.tsx` |
| `/gallery/<slug>` | One member's states, bare | `src/harness/GalleryPage.tsx`, `gallery.ts`, `galleries.ts` |
| `/pages`, `/pages/<slug>` | Sample products, one for each page archetype except `AppShell` | `src/harness/PagesIndex.tsx`, `src/pages/` |
| `/moodboard` | The current system at a glance | `src/harness/MoodboardPage.tsx` |
| `/tokens` | Everything the engine derives | `src/harness/TokensPage.tsx` |
| `/overview` | Overview and gallery index | `src/harness/HomePage.tsx` |
| `/relay/…` | Relay, the demo product | `src/relay/` |

Routing is in `src/App.tsx`. Every area is a lazy chunk. Relay and the sample pages replace the
workbench chrome and fill the window, as a real product would.

`screen.html` is a second document, beside `index.html`. It has no toolbar and no route. It draws
one screen spec for the MCP tool `render_screen` and measures its layout faults
(`src/screen/main.tsx`, `measure.ts`). The composer and this page draw a spec as a product draws a
screen a model writes, with `@polymorph/react/screen` and the run-time core `@polymorph/screen`;
`src/composer/draw.tsx` holds the options both draw with. The tool has the page built in memory by
`screen.build.mjs`, and every build of the workbench compiles it too. [docs/tooling.md](../../docs/tooling.md#seeing-a-screen-render_screen)
describes the tool.

## What it reads and writes

It reads, from the repository:

- `design/systems/*.json`, `design/palettes/*.json` and `design/defaults.json`: the pairing
  catalogue. `src/themes.ts` finds these files by glob, so a new file needs no code change.
- `design/systems/*.md`: each system's direction paragraph, which the mood board quotes.
- `design/screens/*.json`: the screen specs the composer opens.
- `registry/registry.json`: the generated registry, used by the component browser, the
  composer's palette and the studio's exception audit.
- `packages/screen/src/vocabulary.gen.ts`: the run-time core's vocabulary table, which
  `pnpm registry` writes beside the registry. The composer and the screen page draw with it.

It writes through two dev-server endpoints, registered in `vite.config.ts`. Both exist only under
`vite dev` (`apply: 'serve'` plus `configureServer`). Both accept same-origin requests only,
validate before writing, and ask before overwriting an existing file:

| Endpoint | Code | Writes |
| --- | --- | --- |
| `POST /__studio/save` | `src/studio/save-endpoint.ts` | `design/systems/<name>.json` and `design/palettes/<name>.json` |
| `POST /__composer/save` | `src/composer/save-endpoint.ts` | `design/screens/<name>.json` |

The app writes nothing else. It runs no git commands and no build. Run `pnpm registry` (or
restart `pnpm dev`) to see a newly saved pair in the registry.

## Red rules and the harness exemption

The red rules are the ESLint and Stylelint rules that fail `pnpm lint`. They treat this app as
application code: no stylesheets, no `style` or `className`, no raw interactive elements. They
apply to the studio, composer, sample pages and Relay. `src/harness/` is the only declared
exemption (the `HARNESS` glob in the root `eslint.config.ts`). Harness chrome such as the toolbar
and the token swatches may use CSS, but it still reads only `--pm-*` tokens.
[src/harness/README.md](src/harness/README.md) explains why, and
[docs/rules.md](../../docs/rules.md) lists the rules.

## Tests

`src/**/*.test.{ts,tsx}` run in the `logic` Vitest project, under node. Files that need a DOM
request jsdom in their docblock. Run them with `pnpm exec vitest run apps/workbench`.

The full reference for the workbench and the rest of the tooling is
[docs/tooling.md](../../docs/tooling.md).
