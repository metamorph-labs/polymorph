# @polymorph/docs

The website, a React app. Every page renders with the real vocabulary (the closed set of
components; each one is a _member_), in its React rendering `@polymorph/react-ui`, under the
pairing (a system plus a palette) a visitor chooses. Its facts come from the generated registry
and from `docs/`, so the site cannot drift from the code.

## Running it

From the repository root:

```sh
pnpm dev:docs     # this site, served by Vite
pnpm site         # build it and write every page as static HTML into apps/docs/dist
pnpm dev          # the workbench, apps/workbench, if you want both
```

`predev` first runs the registry generator (`packages/registry/bin/registry.js`, which
`pnpm registry` also runs). It regenerates `registry/registry.json` and `src/fonts.gen.ts` (both
gitignored). Vite prints the local URL. `pnpm build` at the root builds the workbench and this
site.

## The shell

`src/App.tsx` is the shell: an `AppShell` with its navigation in the top bar, the route table, and
the footer. The top bar holds the search button, the theme control (`src/shell/ThemeControl.tsx`:
system, palette and mode, which write attributes on `<html>` and persist in `localStorage`) and a
link to the repository. `src/site.ts` holds the site's name, description and addresses.

`src/pages.ts` names each page as a lazy chunk that can be loaded ahead of the first render.
`src/main.tsx` loads the chunk for the address before it renders, so a page that arrived as
static HTML is replaced by the same page and never by an empty frame. `src/meta.ts` sets the
title, the description and the sharing tags of each page.

## Pages

| Route | Page | Code |
| --- | --- | --- |
| `/` | The landing page: a sample screen a visitor re-themes, one spec emitted for each web framework, and what an agent reads | `src/pages/HomePage.tsx`, `src/home/` |
| `/install` | Getting started: the CLI, each framework and platform, vendoring, a theme of your own, the MCP server | `src/pages/InstallPage.tsx` |
| `/guides` | The guides, grouped | `src/pages/GuidesPage.tsx`, `src/guides.ts` |
| `/guides/<slug>` | One guide, which is a file in `docs/`, with its table of contents | `src/pages/GuidePage.tsx` |
| `/components` | Every member, by tier | `src/pages/ComponentsPage.tsx` |
| `/components/<slug>` | One member: its states rendered live, how to write it, its props, tokens and contract | `src/pages/ComponentDetailPage.tsx`, `src/components/` |
| `/systems` | Every house system in its own pairing: axes, fonts, palette, specimen | `src/pages/SystemsPage.tsx` |
| `/tokens` | Colour roles, the type ramp and the scales, painted with the live pairing | `src/pages/TokensPage.tsx` |
| `/motion` | Every motion pattern, re-triggerable, at each temperament | `src/pages/MotionPage.tsx` |
| `/principles` | The exception ladder and the red rules, from the registry | `src/pages/PrinciplesPage.tsx` |
| any other address | A page that says the address has no page | `src/pages/NotFoundPage.tsx` |

`src/router.ts` is the router: it reads the address, and it turns a click on a link to a page of
the site into a navigation. A link to a file the site serves (`/llms.txt`) is left to the browser.

The guides are the files in `docs/`. `src/guides.ts` puts every file there in a group and an
order, and rewrites each file's links: a link to another guide becomes its route, a link to a
member's spec becomes the member's page, and a link to any other file in the repository becomes
its address on GitHub. A guide keeps the
plain register its file is written in. The page copy around it speaks to the visitor.

The search (`src/SiteSearch.tsx`, `src/search.ts`) opens from the top bar, with `/`, and with
Cmd+K or Ctrl+K. It finds pages, members, guides and the headings inside each guide.

The landing page's code sample is real output. A plugin in `vite.config.ts` runs
`scripts/emit-screens.mjs` over `src/home/inbox.screen.json` and serves the spec and what the
emitter writes for each web framework as the module `virtual:polymorph-docs/emitted-screen`.

A component page renders the member's states fixture (`*.states.tsx`) live. When an entry opens a
modal overlay, the page moves every entry into its own iframe so the overlay's modality cannot
make the page inert. `frame.html` is a second Vite entry, booted by `src/frame.tsx`.
`src/FixtureFrame.tsx` is the iframe, and it mirrors the page's theme attributes into the frame.

## The static site

`pnpm site` (`scripts/site.mjs`) builds the app, serves `dist/`, and opens every page in Chromium,
starting at `/` and following each link to a page of the site. It saves what each page rendered
as `dist/<route>.html`, so a visitor and a search engine receive the page's words before any
script runs. It also writes `404.html`, `og.png` (the picture a shared link shows) and
`robots.txt`. The themes' stylesheet, which the engine computes when the app starts, is written
once as a hashed file that every page links.

The step fails when a page logs an error, or when a page links to an address of the site that has
no page. A component page is exempt from the second check, because its fixtures hold sample links.

`dist/` is then a folder of plain files that any static host serves. The host must serve
`<route>.html` for `/<route>` and `404.html` for an address with no file, which static hosts do.
Set `VITE_SITE_URL` to the site's public address when building: the canonical links, the absolute
address of the sharing picture and `sitemap.xml` are written only when it is set.

## What it reads and writes

It reads:

- `registry/registry.json`: every fact about the members, tokens, systems and rules
  (`src/registry.ts`).
- `design/systems/*.json`, `design/palettes/*.json` and `design/defaults.json`: the pairing
  catalogue, discovered by glob in `src/themes.ts`.
- `registry/system-card.md` and `docs/rules.md`: the text of the files for agents, below.
- `docs/*.md`: the guides.

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
`eslint.config.ts` that exempts the workbench's harness. It holds what no member draws: the site's
mark, the framed stage a nested pairing renders in, and the swatches, the type ramp and the scales
on the tokens page. Each has its own CSS module, reads only `--pm-*` tokens, and sets `--pm-*`
custom properties from a `style` prop where it needs a value per instance. Everything else here
uses only the vocabulary. [docs/rules.md](../../docs/rules.md) has the rules.

## Tests

`src/**/*.test.{ts,tsx}` run in the `logic` Vitest project: `pnpm exec vitest run apps/docs`.
`src/llms.test.ts` checks the files for agents against the generated registry.
`src/guides.test.ts` checks that every file in `docs/` is a guide and that each guide's links
resolve. `src/reference/facts.test.ts` and `src/reference/install.test.ts` check the names,
commands and files the install page states against their sources.

The full reference for the site and the rest of the tooling is
[docs/tooling.md](../../docs/tooling.md).
