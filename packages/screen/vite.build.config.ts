import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/**
 * The published build of `@polymorph/screen`: `pnpm --filter @polymorph/screen
 * build`. One entry for each JavaScript entry in the package's `exports` map.
 *
 * Nothing is external. The modules of `@polymorph/spec` and
 * `@polymorph/registry` the source imports are their pure subpaths (the
 * validator, the schema, the framework and platform names, the table's
 * expander and the card's renderer), and the build inlines them, as the
 * engine's inlines `@polymorph/theme`. Neither package is published, so the
 * built package has no dependency at all.
 *
 * A module two entries share is a chunk of its own, so each entry loads only
 * what it reaches: `partial.js` imports nothing, and `walk.js` none of the
 * table, the card or the validator (`packaging.test.ts`).
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: path('./src/index.ts'),
        check: path('./src/check.ts'),
        partial: path('./src/partial.ts'),
        walk: path('./src/walk.ts'),
        vocabulary: path('./src/vocabulary.ts'),
        card: path('./src/card.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
