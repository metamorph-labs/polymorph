import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import { browserNote, serverNote, type FrameworkApp, type Origin } from './init-app'
import { ESLINT_FRAGMENT, STYLELINT_FRAGMENT } from './patch'

/**
 * The files `polymorph init --framework vue` writes that differ from the React
 * app's: the manifest's packages and scripts, the entry, the Vite config, the
 * container and the agent notes (`VUE_INIT`). Everything else (the theme, the
 * stylesheet rules, the MCP config, the welcome spec) is written by `init.ts`.
 */

/** Vue, at the range this repository builds and tests the Vue tooling with. */
export const VUE_RANGE = '^3.5.43'

/**
 * The tools a new Vue app builds, typechecks and lints with. `init.test.ts`
 * holds the ones this repository also installs to the root `package.json`.
 */
export const VUE_TOOLING: Readonly<Record<string, string>> = {
  '@vitejs/plugin-vue': '^6.0.10',
  'vue-eslint-parser': '^10.4.1',
  'vue-tsc': '^3.3.13',
}

/** The runtime packages a new Vue app installs. `@polymorph/rules` is a dev dependency. */
export const VUE_RUNTIME_PACKAGES = [
  '@polymorph/engine',
  FRAMEWORK_FOUNDATION.vue,
  FRAMEWORK_VOCABULARY.vue,
]

export const VUE_WELCOME_VIEW = 'src/screens/Welcome.vue'

export const VUE_SCRIPTS = {
  dev: 'vite',
  build: 'vite build',
  // An app has no stylesheets of its own (`no-app-css`), so the CSS glob
  // usually matches nothing, which Stylelint otherwise reports as an error.
  lint: 'eslint src && stylelint "src/**/*.css" --allow-empty-input',
  // `tsc` cannot read a `.vue` file; `vue-tsc` checks the templates too.
  typecheck: 'vue-tsc --noEmit',
}

export function vueIndexHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
}

export const VUE_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
`

export const VUE_MAIN = `// The theme first: its stylesheet, its fonts and the stored choice, before Vue mounts.
import 'virtual:polymorph/theme'

import { createApp } from 'vue'

import App from './App.vue'

createApp(App).mount('#app')
`

export function vueViteConfig(systemPath: string, palettePath: string): string {
  return `import { polymorphTheme } from '@polymorph/engine/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    // The theme is data, compiled to CSS here under the same laws as the
    // catalogue's. Edit the JSON and the next build or dev reload recompiles it.
    polymorphTheme({
      systems: ['${systemPath}'],
      palettes: ['${palettePath}'],
    }),
  ],
  // One Vue, the app's.
  resolve: { dedupe: ['vue'] },
})
`
}

/**
 * The container. It owns the state and the behaviour and hands the emitted
 * screen its data and callbacks; `@start` is the screen's `onStart` input.
 */
export const VUE_APP = `<script setup lang="ts">
import { ref } from 'vue'

import Welcome from './screens/Welcome.vue'

// The container owns the state and the behaviour, and hands the emitted screen
// its data and callbacks. The screen itself only composes and binds.
const started = ref(false)
</script>

<template>
  <main>
    <Welcome
      :status="
        started
          ? 'Started. Write the next screen as a spec in src/screens and emit it.'
          : 'A polymorph app, themed, linted and ready for its first screen.'
      "
      @start="started = true"
    />
  </main>
</template>
`

export const VUE_AGENTS = (origin: Origin): string => `# Working in this app

This app is built with polymorph, a closed component vocabulary with lint rules that enforce it,
in Vue.

- The vocabulary is \`${FRAMEWORK_VOCABULARY.vue}\`. Screens compose its members and bind content to them.
- The contract is \`polymorph/system-card.md\`: every member, its props, the token families and the
  rules. A member or prop that is not in the card does not exist. A prop keeps its React name; a
  React \`onFoo\` is the event \`@foo\`, a node-typed prop is the slot \`#foo\`, and \`children\` is the
  default slot.
- The MCP server in \`.mcp.json\` is the tool for both: \`get_system_card\` with \`framework: "vue"\`
  returns the card, and \`validate\` checks code against the red rules and names the lawful fix for
  each violation.
${serverNote(origin)}
- Screens are written as specs under \`src/screens/*.json\` and emitted to single-file components
  (\`emit_screen\` with a \`.vue\` path). An emitted screen holds no state and no logic. A hand-written
  container, such as \`src/App.vue\`, renders it and owns both. To change an emitted screen, change
  its spec and emit it again.
- To see a screen, call \`render_screen\` with its spec. It draws the screen in a browser at a
  phone and a desktop width, and returns the pictures with the layout faults it measured.
  ${browserNote(origin)}
- Application code may not write styles or raw controls: no CSS files and no \`<style>\` blocks, no
  \`class\` or \`style\` on a member, no raw \`<button>\` or \`<input>\`. The red rules in
  \`${ESLINT_FRAGMENT}\` and \`${STYLELINT_FRAGMENT}\` read templates too, and \`pnpm lint\` runs them.
- Another library's component (a map, a rich-text editor, a data grid) goes inside
  \`<ThirdParty library="…" reason="…">\`, in the file that imports it. The card says what the
  boundary allows. \`useThemeValues()\` from \`@polymorph/vue\` gives the theme's values to a
  library that takes them in JavaScript.
- The theme is the two JSON files in \`src/theme/\`, compiled at build time by the Vite plugin.
`

/** The Vue app, as `planInit` writes it. */
export const VUE_INIT: FrameworkApp = {
  name: 'Vue',
  framework: { vue: VUE_RANGE },
  runtime: VUE_RUNTIME_PACKAGES,
  tooling: VUE_TOOLING,
  scripts: VUE_SCRIPTS,
  indexHtml: vueIndexHtml,
  tsconfig: VUE_TSCONFIG,
  main: { path: 'src/main.ts', contents: VUE_MAIN },
  viteConfig: vueViteConfig,
  welcome: VUE_WELCOME_VIEW,
  app: { path: 'src/App.vue', contents: VUE_APP },
  agents: VUE_AGENTS,
}
