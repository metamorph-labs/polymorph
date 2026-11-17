import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The dist build for `@polymorph/solid` (`pnpm build:packages`), as
 * `packages/vue/vite.config.ts` builds the Vue foundation, twice.
 *
 * Solid compiles JSX differently for the browser and for a server: the
 * browser's build creates elements, and a server's writes strings. So the
 * default mode writes the browser's build to `dist/` (the `browser` and
 * `import` conditions), and `--mode server` writes the server's to
 * `dist/server/` (the `node` condition), which plain Node and a server render
 * import. Neither is hydratable.
 *
 * Two entries, one per JS entry in the package's `exports` map: the root (the
 * engine re-exported, the icon gateway and `Icon`, the conventions) and
 * `motion`, for member internals. `solid-js` is a peer and `@polymorph/engine`,
 * `@solid-primitives/keyed`, `@zag-js/core` and `@zag-js/utils` dependencies,
 * so none is bundled: a consumer installs one copy of each.
 *
 * `cssCodeSplit: false` puts Icon's stylesheet in one `dist/solid.css`
 * (published as `@polymorph/solid/style.css`), and no module imports it, so
 * every entry imports in plain Node. The vocabulary's entry imports it for its
 * consumers (`packages/solid-ui/vite.build.config.ts`). `preserveModules`
 * keeps one module per source module, so an application that imports `Glyph`
 * carries no `Icon`.
 */
/** The server's build writes no stylesheet: the browser's build ships it, once. */
function withoutStylesheet(): Plugin {
  return {
    name: 'polymorph:server-without-stylesheet',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [name, output] of Object.entries(bundle)) {
        if (output.type === 'asset' && name.endsWith('.css')) delete bundle[name]
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const server = mode === 'server'
  return {
    plugins: server
      ? [solid({ solid: { generate: 'ssr', hydratable: false } }), withoutStylesheet()]
      : [solid()],
    build: {
      outDir: server ? 'dist/server' : 'dist',
      emptyOutDir: !server,
      cssCodeSplit: false,
      sourcemap: true,
      lib: {
        entry: {
          index: entry('./src/index.ts'),
          motion: entry('./src/motion/index.ts'),
        },
        formats: ['es'],
        cssFileName: 'solid',
      },
      rollupOptions: {
        external: [
          'solid-js',
          /^solid-js\//,
          '@polymorph/engine',
          /^@polymorph\/engine\//,
          '@solid-primitives/keyed',
          /^@zag-js\//,
        ],
        output: {
          preserveModules: true,
          preserveModulesRoot: entry('./src'),
          entryFileNames: '[name].js',
        },
      },
    },
  }
})
