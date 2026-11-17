import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The dist build for `@polymorph/rules` (`pnpm --filter @polymorph/rules build`).
 *
 * One entry per JS entry in the package's `exports` map. The root and `eslint`
 * are the ESLint plugin, `stylelint` and `stylelint-emitted` the Stylelint side,
 * and the rest are the tools built on the rules: the ladder, the containment
 * paths, the inventory, the spec audit and `verify`. Every one of them runs in
 * node, inside a linter, a script or a server, and none in a browser.
 *
 * Which dependencies are external and which are bundled:
 *
 *  - `eslint`, `stylelint` and the TSX parser stay external because they are
 *    the host the rules run inside. Bundling the parser would also pull its
 *    CommonJS dependencies into an ESM build that throws
 *    `Calling require for "node:fs"` on a consumer's first lint.
 *  - `typescript` and `postcss-value-parser` stay external. They are declared
 *    dependencies, so the consumer's package manager installs one copy of each.
 *  - `@polymorph/engine` stays external. It is a peer: `emittedTokens` composes
 *    a theme with the engine the consumer already has, so the token list it
 *    returns is the one that consumer's stylesheets resolve against.
 *  - `design/icons.json` is **bundled**. The icon fix reads the role map, and a
 *    published package that read it from a sibling directory would be broken.
 *    The package's own `package.json` and `scoped-token-owners.json` are
 *    bundled for the same reason.
 *
 * No module imports a stylesheet, so every entry is importable by plain Node.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: entry('./src/index.ts'),
        eslint: entry('./src/eslint.ts'),
        stylelint: entry('./src/stylelint/index.js'),
        'stylelint-emitted': entry('./src/stylelint/emitted.ts'),
        ladder: entry('./src/ladder.ts'),
        containment: entry('./src/containment.ts'),
        inventory: entry('./src/inventory.js'),
        'spec-api': entry('./src/spec-api.ts'),
        verify: entry('./src/verify.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'eslint',
        /^eslint\//,
        'stylelint',
        /^stylelint\//,
        'typescript',
        /^@typescript-eslint\//,
        'postcss-value-parser',
        '@polymorph/engine',
        /^@polymorph\/engine\//,
        /^node:/,
      ],
      /*
       * One output module per source module. The entries share most of their
       * graph (`verify` runs the plugin, the ladder reads the Stylelint rule
       * names), and mirroring the source keeps each shared module in one file
       * rather than in a chunk named by the bundler. A consumer's stack trace
       * then names the rule file it came from.
       */
      output: {
        preserveModules: true,
        preserveModulesRoot: entry('./src'),
        entryFileNames: '[name].js',
      },
    },
  },
})
