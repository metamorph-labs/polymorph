import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The dist build for `@polymorph/engine` (`pnpm build:packages`).
 *
 * Ten entries, one per JS entry in the package's `exports` map. The root is
 * the theme engine, the framework-free conventions, the agent registry and the
 * icon roles, and any web framework can import it. `motion` is the motion engine, for component
 * internals, and application code must not import it. `qr`, `charts` and
 * `markdown` are the helpers only one member family needs (the QR encoder, the
 * chart engine over `d3-scale`, `d3-array` and `d3-shape`, the Markdown
 * parser), kept off the root so an application that imports it for its theme
 * does not load them. `agent` is the agent bridge, which reads the registry
 * the root keeps, so a page that creates no bridge does not ship it.
 * `webmcp` registers the bridge's tools before the bridge is loaded, and
 * imports none of it, so a page that registers that way loads the bridge on
 * the first call.
 * `runtime` is the theme's attribute setters without the engine. `vite` is the
 * build-time theme compiler, which a runtime bundler should never follow.
 * `testing` is for a consumer's test setup.
 *
 * Which dependencies are external and which are bundled:
 *
 *  - `culori`, `zod`, the three d3 packages and
 *    `@internationalized/date` stay external. They are declared dependencies, so the consumer's package
 *    manager installs one copy of each.
 *  - `vite` stays external because it is the host the build plugin runs inside.
 *  - `@polymorph/theme` is **bundled**. It implements the engine and is not a
 *    separate product, so a consumer installs one package with one version.
 *  - `design/*.json` is bundled too. The motion registry and the icon roles are
 *    part of the engine, and a published package that read them from a sibling
 *    directory would be broken.
 *
 * No module in the package imports a stylesheet, so every entry is importable by
 * plain Node. The theme engine and the Vite plugin run in scripts and build
 * configs, where a `.css` import throws.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: entry('./src/index.ts'),
        motion: entry('./src/motion/index.ts'),
        qr: entry('./src/qr/index.ts'),
        charts: entry('./src/charts/index.ts'),
        markdown: entry('./src/markdown/index.ts'),
        agent: entry('./src/agent/index.ts'),
        webmcp: entry('./src/webmcp.ts'),
        testing: entry('./src/testing.ts'),
        runtime: entry('./src/runtime.ts'),
        vite: entry('./src/vite.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        // The build plugin's host. The source imports only its types.
        'vite',
        'culori',
        /^culori\//,
        'zod',
        'd3-array',
        'd3-scale',
        'd3-shape',
        '@internationalized/date',
        /^node:/,
      ],
      /*
       * `preserveModules` is required for server rendering.
       *
       * A bundled chunk drops `'use client'`, with no warning. Rollup hoists a
       * directive only when it applies to the whole chunk, and the motion entry
       * mixes the binding resolver (pure data, server-safe) with
       * `motion/environment.ts`, which reads the document and carries the
       * directive. Hoisting the directive anyway would put the resolver in every
       * consumer's client bundle, and dropping it lets a server component import
       * a module that needs a browser. Mirroring the source graph keeps each
       * module's own directive.
       */
      output: {
        preserveModules: true,
        preserveModulesRoot: entry('./src'),
        entryFileNames: '[name].js',
      },
    },
  },
})
