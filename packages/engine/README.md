# @polymorph/engine

The part of polymorph a consumer **installs**, on any web framework. It holds the theme engine,
the framework-free conventions, the icon roles, the motion engine, the theme runtime and the
build-time theme compiler. Components render the UI, and a consumer either links them or vendors
them as source it owns ([docs/consuming.md](../../docs/consuming.md)). The engine stays a
versioned dependency in both cases and is never edited downstream.

It contains no framework. Each web framework's foundation ([`@polymorph/react`](../react),
`@polymorph/vue`, `@polymorph/svelte`, `@polymorph/solid`, `@polymorph/angular`) re-exports this
package whole and adds the parts that exist only in that framework. The React foundation adds `Icon`,
`BrandMark`, the motion presence components, `useControlRef`, `useDevWarning` and the conventions
typed with React's element types. The ESLint and Stylelint rules are
[`@polymorph/rules`](../rules/README.md).

Framework-free is not DOM-free. The theme runtime, the test helpers and the motion engine's
environment reader and animator touch the document by design. They touch it only when called,
so every entry imports in plain Node.

It contains:

- **The theme engine, whole.** The root re-exports [`@polymorph/theme`](../theme/README.md):
  the axes and schemas, `resolveTheme`, the emitters (`emitThemeCSS` for the web; `emitSwift`,
  `emitKotlin` and `emitDart` for the SwiftUI, Compose and Dart token packages;
  `emitTokenDocument`, the same decisions as JSON), `admitTheme`, the runtime
  (`installThemeCSS`, `setSystem`, `setPalette`, `setMode`, `hydrateTheme`, `PREPAINT_SCRIPT`)
  and the `--pm-*` token contract. See [docs/theming.md](../../docs/theming.md).
- **Build-time theming.** `@polymorph/engine/vite` exports `polymorphTheme`, a Vite plugin that
  runs the theme engine when the application builds, fails the build on a law fault, and
  provides `virtual:polymorph/theme`: the compiled stylesheet, the fonts, hydration, and
  `ensurePairing(system, palette)` for the pairings compiled to their own sheets. It also writes
  the default pairing onto `<html>` and inlines the pre-paint script. `@polymorph/engine/runtime`
  is the theme runtime without the theme engine: the setters an application uses to switch
  themes. `@polymorph/engine/vite-env` types the virtual module. An application on this path
  ships no `zod`, no `culori` and no derivation code. The root's `admitTheme` +
  `installThemeCSS` are for themes known only at run time, and ship the theme engine to the
  browser. The `runtime-engine` size fixture holds that cost under 52 kB of gzipped JavaScript
  (`scripts/size/budgets.json`). See [docs/consuming.md](../../docs/consuming.md).
- **The conventions** every component is written against, in any framework: the attribute
  contract (`dataAttrs`, `dataFlag`, `memberAttr`, `gallerySlug`), the size scale
  (`CONTROL_SIZES`), lawful variant × tone grids (`LawfulVariants`, `lawfulCells`),
  `controlKindOf`, and the helpers every foundation shares: `spacingAttrs` and `LayoutPatch`,
  `fitTextarea`, `revealInline`, the section a TableOfContents marks (`watchSections`,
  `jumpToSection`), `modalFocusTarget`, `avatarTone` and `initialsOf`,
  `paginationWindow`, the tooltip delays, the file gate and size format (`gateFiles`,
  `formatBytes`), RelativeTime's phrase (`relativeTimePhrase`), Diff's rows and collapsed runs
  (`diffLines`, `diffRuns`), PromptInput's trigger token and pick (`promptToken`,
  `promptPick`), Highlight's marked runs (`highlightRuns`), AudioPlayer's clock, spoken length
  and one player at a time (`clockTime`, `spokenDuration`, `pauseOtherPlayers`), Tour's target
  and placement (`tourTarget`, `tourTargetRect`, `revealTourTarget`, `tourPlacement`,
  `tourViewport`), ColorInput's rest value (`COLOR_INPUT_REST`), PhoneInput's calling codes and
  E.164 rules (`splitPhone`, `phoneValue`, `readPhone`, `commitPhone`, `phoneCountryOptions`),
  the segmented
  date and time field's model (`fieldSegments`, `stepSegment`, `typeIntoSegment`,
  `eraseSegment`, `timeDraft`, `timeOfDraft`, and MonthInput's `monthDraft`, `monthFieldValue`,
  `monthOutOfBounds` and `segmentValueText`), DurationInput's arithmetic (`durationKey`,
  `durationSegments`, `durationDraft`, `typeIntoDuration`, `commitDuration`), and the toast
  store each foundation creates
  (`createToastStore`).
- **The helpers one member family needs**, each on its own subpath so an application that
  imports the root for its theme does not load them: the QR encoder (`@polymorph/engine/qr`:
  `qrSymbol`, `qrPath`, `encodeQr`), the chart engine (`@polymorph/engine/charts`: the chart
  grammar's types, the scales over `d3-scale` and `d3-array`, the mark paths over
  `d3-shape`, formatting, the cartesian, grid and polar geometry, the readout's text, each
  chart member's model (`barChartModel`, `barChartReadout`, `barChartSelection`, …),
  Sparkline's drawing, and the state machines of the frame's interaction: `observeBox` and
  `measureBox`, `createReading`, `createBrush`, `createSyncMember`, `readChartCap`), and the
  Markdown parser (`@polymorph/engine/markdown`: `parseMarkdown`, `parseInlines`, `safeHref`,
  `inlineText`). Each foundation re-exports them, so a member reaches them where it reaches
  the rest of the engine.
- **The agent registry and the agent bridge.** The root keeps the list of mounted members an
  agent may read and operate: each member whose spec has an `## Agent` section registers a
  handle while it is mounted (`agentMember`), and its actions write through `agentFill` and
  `agentPress`, as a person's typing and pressing do. The bridge that reads the list is a
  subpath (`@polymorph/engine/agent`: `createAgentBridge`, `agentTools`, `registerWebMCP`), so
  a page that creates no bridge carries the list and nothing else. It reports the states and
  runs the actions each spec's `agent` fence declares, never returns a secret value, and runs a
  destructive action only after a person confirms it. Another subpath registers the bridge's
  tools with WebMCP before the bridge is loaded, and holds none of it
  (`@polymorph/engine/webmcp`: `registerWebMCPOnCall`, `applyAgentSetting`, `AGENT_ATTRIBUTE`).
- **The icon roles.** The closed enum of semantic roles (`ICON_ROLES`, `isIconRole`,
  `ICON_ROLE_META`, `ICON_SET`), read from `design/icons.json`, and the brand marks' data
  (`BRAND_MARKS`, `BRAND_DRAWINGS`), which each foundation's `BrandMark` draws. A component
  names a meaning, and an invented icon name is a type error. Which glyph draws each role, and the
  component that draws it, belong to the framework package, so the engine carries no icon set.
- **The motion engine** (`@polymorph/engine/motion`). `resolveBinding` turns a binding from
  `design/motion/motion.json` into keyframes and transitions for the current environment
  (`readMotionEnvironment`), and `animateTo` runs them on the browser's Web Animations API
  (`src/motion/animate.ts`) with no animation library. Springs are sampled into `linear()`
  easings, and each animation starts from the value on screen. The engine is for component
  internals, so it is a subpath rather than a root export. Application code composes components
  and never sees a duration or a spring. Each foundation's `motion` subpath builds its presence
  components on it. React's (`MotionSurface`, `MotionPresence`, `MotionIndicator`) are
  `@polymorph/react/motion`. See
  [docs/motion.md](../../docs/motion.md).
- **Test helpers** (`@polymorph/engine/testing`): `installTestTheme()` installs a real pairing
  so a test can read a computed token; `fixedWidthHost()` gives layout something to divide.

## Entry points

In this repository the `exports` map points at source. `pnpm build:packages` builds `dist/`
(`vite build`, then declarations via `tsc -p tsconfig.build.json` and
`scripts/emit-types.mjs`), and `publishConfig.exports` maps the same subpaths onto it:

| Import | In-repo (`exports`) | Built (`publishConfig.exports`) |
| --- | --- | --- |
| `@polymorph/engine` | `src/index.ts` | `dist/index.js`, `dist/types/index.d.ts` |
| `@polymorph/engine/motion` | `src/motion/index.ts` | `dist/motion.js` |
| `@polymorph/engine/qr` | `src/qr/index.ts` | `dist/qr.js` |
| `@polymorph/engine/charts` | `src/charts/index.ts` | `dist/charts.js` |
| `@polymorph/engine/markdown` | `src/markdown/index.ts` | `dist/markdown.js` |
| `@polymorph/engine/agent` | `src/agent/index.ts` | `dist/agent.js` |
| `@polymorph/engine/testing` | `src/testing.ts` | `dist/testing.js` |
| `@polymorph/engine/runtime` | `src/runtime.ts` | `dist/runtime.js` |
| `@polymorph/engine/vite` | `src/vite.ts` | `dist/vite.js` |
| `@polymorph/engine/vite-env` | `src/vite-env.d.ts` (types only) | `dist/types/vite-env.d.ts` |

It is published as `@metamorph-labs/polymorph-engine` and installed as `@polymorph/engine`
([docs/consuming.md](../../docs/consuming.md)). No module imports a stylesheet, so every entry
stays importable by plain Node. The theme engine and the Vite plugin run in scripts and build
configs.

The build bundles `@polymorph/theme` and the `design/*.json` data the engine reads, with the
theme's type declarations under `dist/types/_internal/theme/`. It keeps every other dependency
external, and preserves modules so each keeps its own `'use client'` directive. The Vite and
motion entries are subpaths rather than root exports. A runtime bundler should never follow the
build plugin, and application code should never see the motion engine. `runtime` is its own
subpath so an application can import the theme setters without the root, which also exports the
theme engine.

## Dependencies and peers

| Peer | Range | Needed for |
| --- | --- | --- |
| `vite` | `>=6` (optional) | `@polymorph/engine/vite` |

Dependencies: the workspace's `@polymorph/theme` (bundled into `dist/`), plus `culori`
and `zod`, `@internationalized/date` (calendar dates for RelativeTime and the charts' date
axes), and `d3-scale`, `d3-array` and `d3-shape` (the chart engine's scales and paths,
imported only under `src/charts/`, its containment boundary). There is no
framework and no animation library. The motion engine uses the browser's.

## Tests

```sh
pnpm exec vitest run packages/engine/src                # chromium via Playwright
pnpm exec vitest run packages/engine/packaging.test.ts  # node: runs the real build
```

The browser tests under `src/` cover the motion engine, the conventions, the date segments, the
toast store, the QR encoder, the chart models, paths and interaction machines, and the Markdown
parser. `packaging.test.ts`
builds `dist/` and checks that every published export resolves, the built entries import in
node, `'use client'` directives survive, no stylesheet, framework or undeclared package is in
the build, and the declarations typecheck as a strict consumer reads them. It holds
`packages/engine/.dist-lock` while it runs, because `packages/cli/scratch.test.ts` and
`packages/cli/init.test.ts` install an app from the same tree.
