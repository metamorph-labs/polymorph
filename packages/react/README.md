# @polymorph/react

The React foundation a consumer **installs**. It re-exports
[`@polymorph/engine`](../engine/README.md) whole and adds the parts that only exist in React: the
icon gateway, the motion presence components, the hooks, the conventions typed with React's
element types, and the renderer of a screen a model writes. Components render the UI, and a consumer either links them
([`@polymorph/react-ui`](../react-ui/README.md)) or vendors them as source it owns
([docs/consuming.md](../../docs/consuming.md)). This package stays a versioned dependency in both
cases and is never edited downstream: a vendored member imports it and nothing deeper.

It contains:

- **The engine, whole.** The root is `export * from '@polymorph/engine'`: the theme engine and its
  tokens, the runtime, the framework-free conventions (`dataAttrs`, `dataFlag`, `memberAttr`,
  `gallerySlug`, `CONTROL_SIZES`, `lawfulCells`, `controlKindOf`) and the icon roles, and with it
  the engine's `qr`, `charts` and `markdown` subpaths, which the root re-exports too. A member
  imports one package, and a consumer installs one copy of the engine, which this package names
  as a dependency rather than bundling.
- **The conventions typed with React's element types**: closed prop types (`Governed`,
  `NativeProps`, `assertGoverned`), the layout members' children (`LayoutChildren`; their spacing
  props, `LayoutPatch` and `spacingAttrs` are the engine's), the states fixture shape
  (`ComponentStates`, `StateEntry`), `useControlRef`, which hands a member and its caller one DOM
  node, and `useDevWarning`, for laws a type cannot express, with `useDevWarnings` for the list of
  warnings an engine model reports (a chart's `warnings`). `useSupplied` returns an element a
  member was passed, once React has loaded it. A member that reads or clones a child or a
  `trigger` calls it first, because a server component passes a client member an element as a
  reference that may still be loading. `useAgentMember` registers a member with the engine's
  agent registry while it is mounted, with the states and actions its spec's `agent` fence
  declares, and its functions always call the latest render's closures.
- **The icon gateway.** `Icon` takes a semantic role from the engine's closed enum and renders
  `GlyphSvg`. `src/icon/map.tsx` holds the role → glyph assignment and `GlyphSvg`, which draws a
  glyph's SVG elements from the data-only `lucide` package. That file and its test are the only
  files allowed to import the icon set, so no icon library runs in the application. `BrandMark`
  draws the few third-party marks (`google`, `microsoft`, `github`) from the engine's brand data
  (`BRAND_DRAWINGS`), which every other framework's foundation draws in its own `BrandMark`.
- **The motion presence components** (`@polymorph/react/motion`): `MotionSurface`,
  `MotionPresence` and `MotionIndicator`, on top of the engine's motion module. The subpath also
  re-exports that module by name, without `animateTo`, `animateProperty` and `setFrame`, which only
  the presence components call. A member names a binding from `design/motion/motion.json`; the
  engine resolves it and runs it on the browser's Web Animations API, with no animation library.
  The subpath is for member internals, so it is not a root export. Application code composes
  members and never sees a duration or a spring. See [docs/motion.md](../../docs/motion.md).
- **The run-time screen renderer** (`@polymorph/react/screen`): `ScreenView` draws a
  `polymorph-screen/1` document a model writes, or the model's answer as text while it streams,
  with the members the application passes, at run time and with no build. Everything a document
  may do is decided by [`@polymorph/screen`](../screen/README.md), the core every renderer shares:
  the walk, the fill of its inputs, its actions, the controls that follow the reader, its faults,
  when a streamed element is drawn (once the props it requires are written, from where the text
  ends: `parsePartial`'s `cut`) and how a member takes its children. This subpath draws what the
  core resolves: each node keyed by its path and memoized on it, so a longer document, new data or
  the reader's input mounts nothing twice, and each inside its own error boundary. A host that
  reads the stream itself passes `document` with `parsePartial`'s `cut` and `open`. `useScreen` and `ScreenDrawing` are its two halves, and `componentFor`
  is the rule a name resolves by among the members. The foundation knows no member, so the
  application passes them (`import * as members from '@polymorph/react-ui'`). The subpath is not a
  root export, so an application that imports the root loads none of it.

## Entry points

In this repository the `exports` map points at source. `pnpm build:packages` builds `dist/`
(`vite build`, then declarations via `tsc -p tsconfig.build.json`), and `publishConfig.exports`
maps the published subpaths onto it:

| Import                             | In-repo (`exports`)        | Built (`publishConfig.exports`)                            |
| ---------------------------------- | -------------------------- | ---------------------------------------------------------- |
| `@polymorph/react`                 | `src/index.ts`             | `dist/index.js`, `dist/types/index.d.ts`                   |
| `@polymorph/react/motion`          | `src/motion/index.ts`      | `dist/motion.js`, `dist/types/motion/index.d.ts`           |
| `@polymorph/react/screen`          | `src/screen/index.ts`      | `dist/screen.js`, `dist/types/screen/index.d.ts`           |
| `@polymorph/react/icon.module.css` | `src/icon/icon.module.css` | — (in-repo only)                                           |
| `@polymorph/react/style.css`       | —                          | `dist/react.css` (Icon's stylesheet, which `Icon` imports) |

It is published as `@metamorph-labs/polymorph-react` and installed as `@polymorph/react`
([docs/consuming.md](../../docs/consuming.md)). Icon's recipe module imports the stylesheet as
`#stylesheet/react.css`, and the `imports` map in `package.json` resolves it: to `dist/react.css`
for a bundler, and to `dist/no-stylesheet.js`, an empty module, under the `node` condition. Every
entry therefore stays importable by plain Node, and an application that renders `Icon` imports no
stylesheet by hand. The `./style.css` entry names the same file, for an application that imports
it already.

The build keeps `@polymorph/engine`, `@polymorph/screen`, `lucide` and React external, and
preserves modules so each keeps its own `'use client'` directive. The presence components, the
hooks and the screen renderer's drawing carry one; `Icon` and the entries do not, so `Icon` stays a
server component and the engine stays out of a consumer's client bundle. The declarations name
`@polymorph/engine` and `@polymorph/screen`, which the consumer resolves from their own install.

## Dependencies and peers

| Peer                 | Range     | Needed for                                             |
| -------------------- | --------- | ------------------------------------------------------ |
| `react`, `react-dom` | `^19.0.0` | everything that renders (members take `ref` as a prop) |

Dependencies: [`@polymorph/engine`](../engine/README.md),
[`@polymorph/screen`](../screen/README.md) (loaded only by `@polymorph/react/screen`) and `lucide`
(glyph data only, no components). There is no animation library. The motion engine uses the
browser's.

## Tests

```sh
pnpm exec vitest run packages/react/src                    # chromium via Playwright
pnpm exec vitest run packages/react/packaging.test.ts      # node: runs the real build
pnpm exec vitest run packages/react/screen-server.test.ts  # node: a screen rendered on a server
```

The browser tests, in the `core` vitest project, cover the icon gateway and `BrandMark`, the
presence components, the control hook, the development warnings and the screen renderer. The
screen renderer's tests draw with the real vocabulary, which they import by path, since the
foundation does not depend on it.
`packaging.test.ts` builds `dist/` and checks that every published export resolves, the engine and
the run-time core are imported rather than bundled, the screen renderer stays on its subpath,
`'use client'` directives survive, no undeclared package is imported, and the declarations
typecheck as a strict consumer reads them. It holds
`packages/react/.dist-lock` while it runs, so no other build of the same tree empties `dist/`
under its assertions.
