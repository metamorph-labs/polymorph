import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import { indexHtml, STATUS, viteConfig, type FrameworkApp } from './init-app'
import { ESLINT_FRAGMENT, STYLELINT_FRAGMENT } from './patch'

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

export const SVELTE_AGENTS = `# Working in this app

This app is built with polymorph, a closed component vocabulary with lint rules that enforce it,
in Svelte 5.

- The vocabulary is \`${FRAMEWORK_VOCABULARY.svelte}\`. Screens compose its members and bind content to them.
- The contract is \`polymorph/system-card.md\`: every member, its props, the token families and the
  rules. A member or prop that is not in the card does not exist. A prop keeps its React name and
  type: a callback is the prop \`onFoo\`, a node-typed prop is the snippet \`foo\`, and \`children\` is
  the content between the member's tags.
- The MCP server in \`.mcp.json\` is the tool for both: \`get_system_card\` with \`framework: "svelte"\`
  returns the card, and \`validate\` checks code against the red rules and names the lawful fix for
  each violation.
- \`.mcp.json\` starts the server from the polymorph checkout that created this app, by its absolute
  path on that machine. The path is machine-specific. On another machine, change it to that
  machine's checkout. A team can instead add \`.mcp.json\` to \`.gitignore\` and keep one per person.
- Screens are written as specs under \`src/screens/*.json\` and emitted to Svelte components
  (\`emit_screen\` with a \`.svelte\` path). An emitted screen holds no state and no logic. A
  hand-written container, such as \`src/App.svelte\`, renders it and owns both. To change an emitted
  screen, change its spec and emit it again.
- To see a screen, call \`render_screen\` with its spec. It draws the screen in a browser at a
  phone and a desktop width, and returns the pictures with the layout faults it measured. It needs
  a browser, downloaded once in the polymorph checkout: \`pnpm exec playwright install chromium\`.
- Application code may not write styles or raw controls: no CSS files and no \`<style>\` blocks, no
  \`class\` or \`style\` on a member, no raw \`<button>\` or \`<input>\`, no \`transition:\` directives.
  The red rules in \`${ESLINT_FRAGMENT}\` and \`${STYLELINT_FRAGMENT}\` read the markup too, and
  \`pnpm lint\` runs them.
- Another library's component (a map, a rich-text editor, a data grid) goes inside
  \`<ThirdParty library="…" reason="…">\`, in the file that imports it. The card says what the
  boundary allows. \`useThemeValues()\` from \`@polymorph/svelte\` gives the theme's values to a
  library that takes them in JavaScript.
- The theme is the two JSON files in \`src/theme/\`, compiled at build time by the Vite plugin.
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
  agents: SVELTE_AGENTS,
}
