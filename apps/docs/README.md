# @polymorph/docs

The docs site, a React app. Every page renders with the real vocabulary (the closed set of
components; each one is a _member_), in its React rendering `@polymorph/react-ui`, under the
pairing (a system plus a palette) chosen in its top bar. Every fact on it comes from the
generated registry, so the site cannot drift from the code.

## Running it

From the repository root:

```sh
pnpm dev:docs     # this site
pnpm dev          # the workbench, apps/workbench, if you want both
```

`predev` first runs the registry generator (`packages/registry/bin/registry.js`, which
`pnpm registry` also runs). It regenerates `registry/registry.json` and `src/fonts.gen.ts` (both
gitignored). Vite prints the local URL. `pnpm build` at the root builds the workbench and this
site.

The top bar has three selects (system, palette and mode), which write attributes on `<html>`.
The theme runtime persists them in `localStorage`.

## Pages

| Route | Page | Code |
| --- | --- | --- |
| `/` | Overview, with a live specimen per house system | `src/pages/HomePage.tsx` |
| `/components` | Every member, by tier | `src/pages/ComponentsPage.tsx` |
| `/components/<slug>` | One member: anatomy, tokens, states, props, selectors | `src/pages/ComponentDetailPage.tsx` |
| `/tokens` | Colour roles, the type ramp and the scales, painted with the live pairing | `src/pages/TokensPage.tsx` |
| `/systems` | Every house system: axes, fonts, palette, specimen | `src/pages/SystemsPage.tsx` |
| `/motion` | Every motion pattern, re-triggerable, at each temperament | `src/pages/MotionPage.tsx` |
| `/principles` | The exception ladder and the laws, from the registry | `src/pages/PrinciplesPage.tsx` |
| `/install` | Quickstarts: the CLI, linking, your own theme, the MCP server | `src/pages/InstallPage.tsx` |

The shell and routing are in `src/App.tsx` and `src/router.ts`; each page is a lazy chunk.

A component page renders the member's states fixture (`*.states.tsx`) live. When an entry opens a
modal overlay, the page moves every entry into its own iframe so the overlay's modality cannot
make the page inert. `frame.html` is a second Vite entry, booted by `src/frame.tsx`.
`src/FixtureFrame.tsx` is the iframe, and it mirrors the page's theme attributes into the frame.

## What it reads and writes

It reads:

- `registry/registry.json`: the site's only content source (`src/registry.ts`).
- `design/systems/*.json`, `design/palettes/*.json` and `design/defaults.json`: the pairing
  catalogue, discovered by glob in `src/themes.ts`.
- `registry/system-card.md` and `docs/rules.md`: the text of the files for agents, below.

It writes nothing to the repository. There are no save endpoints here. `design/` is edited in the
workbench.

## Files for agents

The site serves three plain-text files, in the [llms.txt](https://llmstxt.org) convention, so an
agent finds the contract in one fetch:

| Path | What it is |
| --- | --- |
| `/llms.txt` | What the system is, links to the two files below, the MCP server and `init` commands, the rules on application code and the exception ladder |
| `/llms-full.txt` | The system card, then `docs/rules.md` |
| `/system-card.md` | `registry/system-card.md` as the registry generator wrote it |

`src/llms.ts` builds them, and a plugin in `vite.config.ts` serves them. The dev server builds each
one when it is requested, and the build writes them into `dist/`. They are never written to the
source tree, so they cannot go stale.

## Red rules and the harness exemption

The red rules (the ESLint and Stylelint rules that fail `pnpm lint`) treat this app as
application code: no stylesheets, no `style` or `className`, no raw interactive elements.
`src/harness/` is the one declared exemption, through the same `HARNESS` glob in the root
`eslint.config.ts` that exempts the workbench's harness. The swatches and the type ramp on the
tokens page have their own CSS modules and set `--pm-*` custom properties from a `style` prop.
Everything else here uses only the vocabulary. [docs/rules.md](../../docs/rules.md) has the rules.

## Tests

`src/**/*.test.{ts,tsx}` run in the `logic` Vitest project: `pnpm exec vitest run apps/docs`.
`src/llms.test.ts` checks the files for agents against the generated registry.

The full reference for the docs site and the rest of the tooling is
[docs/tooling.md](../../docs/tooling.md).
