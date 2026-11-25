import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import { indexHtml, STATUS, viteConfig, type FrameworkApp } from './init-app'

/**
 * The files `polymorph init --framework svelte` writes that differ from the
 * React app's (`init-app.ts` says which). The app is Svelte 5: its components
 * are runes and snippets, as `@polymorph/svelte-ui`'s members are.
 */

/** Svelte, at the range this repository builds and tests the Svelte tooling with. */
export const SVELTE_RANGE = '^5.57.2'

/**
 * The tools a new Svelte app builds, typechecks and lints with.
 * `init.test.ts` holds the ones this repository also installs to the root
 * `package.json`; `svelte-check` is at the Svelte packages' range.
 */
export const SVELTE_TOOLING: Readonly<Record<string, string>> = {
  '@sveltejs/vite-plugin-svelte': '^7.3.1',
  'svelte-check': '^4.7.6',
  'svelte-eslint-parser': '^1.9.0',
}

/** The runtime packages a new Svelte app installs. `@polymorph/rules` is a dev dependency. */
export const SVELTE_RUNTIME_PACKAGES = [
  '@polymorph/engine',
  FRAMEWORK_FOUNDATION.svelte,
  FRAMEWORK_VOCABULARY.svelte,
]

export const SVELTE_SCRIPTS = {
  dev: 'vite',
  build: 'vite build',
  // An app has no stylesheets of its own (`no-app-css`), so the CSS glob
  // usually matches nothing, which Stylelint otherwise reports as an error.
  lint: 'eslint src && stylelint "src/**/*.css" --allow-empty-input',
  // `tsc` cannot read a `.svelte` file; `svelte-check` checks the markup too.
  typecheck: 'svelte-check --tsconfig ./tsconfig.json',
}

export const SVELTE_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
`

export const SVELTE_MAIN = `// The theme first: its stylesheet, its fonts and the stored choice, before Svelte mounts.
import 'virtual:polymorph/theme'

import { mount } from 'svelte'

import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
`

/**
 * The container. It owns the state and the behaviour and hands the emitted
 * screen its data and callbacks; `onStart` is the screen's input.
 */
export const SVELTE_APP = `<script lang="ts">
import Welcome from './screens/Welcome.svelte'

// The container owns the state and the behaviour, and hands the emitted screen
// its data and callbacks. The screen itself only composes and binds.
let started = $state(false)
</script>

<main>
  <Welcome
    status={started
      ? '${STATUS.after}'
      : '${STATUS.before}'}
    onStart={() => (started = true)}
  />
</main>
`

/** The Svelte app, as `planInit` writes it. */
export const SVELTE_INIT: FrameworkApp = {
  name: 'Svelte',
  framework: { svelte: SVELTE_RANGE },
  runtime: SVELTE_RUNTIME_PACKAGES,
  tooling: SVELTE_TOOLING,
  scripts: SVELTE_SCRIPTS,
  indexHtml: (name) => indexHtml(name, 'app', 'src/main.ts'),
  tsconfig: SVELTE_TSCONFIG,
  main: { path: 'src/main.ts', contents: SVELTE_MAIN },
  viteConfig: (systemPath, palettePath) =>
    viteConfig(
      { importLine: "import { svelte } from '@sveltejs/vite-plugin-svelte'", call: 'svelte()' },
      { name: 'Svelte', dedupe: ['svelte'] },
      systemPath,
      palettePath,
    ),
  welcome: 'src/screens/Welcome.svelte',
  app: { path: 'src/App.svelte', contents: SVELTE_APP },
}
