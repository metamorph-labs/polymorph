import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The dist build for `@polymorph/vue` (`pnpm build:packages`), as
 * `packages/react/vite.config.ts` builds the React foundation.
 *
 * Two entries, one per JS entry in the package's `exports` map: the root (the
 * engine re-exported, the icon gateway and `Icon`, the composables) and
 * `motion`, for member internals. `vue` is a peer and `@polymorph/engine` a
 * dependency, so neither is bundled: a consumer installs one copy of each.
 *
 * `cssCodeSplit: false` puts Icon's stylesheet in one `dist/vue.css`
 * (published as `@polymorph/vue/style.css`), and no module imports it, so
 * every entry imports in plain Node. The vocabulary's entry imports it for its
 * consumers (`packages/vue-ui/vite.build.config.ts`). `preserveModules` keeps
 * one module per source module, so an application that imports `Glyph`
 * carries no `Icon`.
 */
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
    lib: {
      entry: {
        index: entry('./src/index.ts'),
        motion: entry('./src/motion/index.ts'),
      },
      formats: ['es'],
      cssFileName: 'vue',
    },
    rollupOptions: {
      external: ['vue', /^vue\//, '@polymorph/engine', /^@polymorph\/engine\//],
      output: {
        preserveModules: true,
        preserveModulesRoot: entry('./src'),
        entryFileNames: '[name].js',
      },
    },
  },
})
