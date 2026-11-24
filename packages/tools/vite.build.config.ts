import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))
const ROOT = path('../..')

/** The entries whose output is a bin, run by the shell, so each starts with a shebang. */
const BINS = new Set(['polymorph', 'polymorph-mcp'])

/**
 * The modules of the published tools (`pnpm --filter @polymorph/tools build`,
 * which `scripts/build.mjs` runs first). Three entries, each written at the
 * top of `dist/`: the two bins and the screen emitter `polymorph init` runs.
 *
 * **Every polymorph package is bundled, and no other package is.** The bins
 * run the CLI (`@polymorph/cli`), the MCP server (`@polymorph/mcp`) and the
 * screen emitter (`@polymorph/spec`), over the registry's reading half
 * (`@polymorph/registry`), the theme engine (`@polymorph/theme`) and the red
 * rules (`@polymorph/rules`). None of the six but the rules is published, and
 * bundling the rules too means the package installs with no other polymorph
 * package and answers for exactly the release it was built from. A third-party
 * package stays an import and is a dependency of the package: ESLint and the
 * parsers the rules read each framework with, Stylelint, Prettier, TypeScript
 * (the rules and the emitter parse with it), the MCP SDK, zod and culori, and
 * Playwright as an optional one.
 *
 * **`@polymorph/engine` is the theme engine.** The rules import the theme's
 * exports through the engine, which re-exports `@polymorph/theme` whole. The
 * rest of the engine is the browser half a product installs, which no tool
 * runs, so the engine is resolved to the theme. A rule that came to import
 * anything else from the engine fails this build.
 *
 * **The output keeps the repository's paths.** Every other module is written
 * at its source path below `dist/` (`dist/packages/cli/src/cli.js`), and
 * `scripts/build.mjs` copies the files an install reads beside them at theirs.
 * A module that finds a file by its own location therefore finds it where it
 * does in a checkout: the rules' `verify` reads the catalogue's systems at
 * `../../../design` from its own directory.
 *
 * Nothing is minified, so a stack trace from a consumer's machine names the
 * source file and the function.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@polymorph\/engine$/, replacement: path('../theme/src/index.ts') }],
  },
  build: {
    ssr: true,
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        polymorph: path('./src/polymorph.ts'),
        'polymorph-mcp': path('./src/polymorph-mcp.ts'),
        emit: path('./src/emit.ts'),
      },
      // A bare specifier outside the workspace's scope is a package the consumer installs.
      external: (id) =>
        !id.startsWith('\0') &&
        !id.startsWith('.') &&
        !isAbsolute(id) &&
        !id.startsWith('@polymorph/'),
      // No module of the six is imported for its effect alone, so a module none of whose
      // exports a bin reaches is left out: the registry's builder among them.
      treeshake: { moduleSideEffects: false },
      output: {
        format: 'es',
        preserveModules: true,
        preserveModulesRoot: ROOT,
        entryFileNames: '[name].js',
        banner: (chunk) => (BINS.has(chunk.name) ? '#!/usr/bin/env node' : ''),
      },
    },
  },
})
