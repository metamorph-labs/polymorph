import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import {
  browserNote,
  indexHtml,
  serverNote,
  STATUS,
  viteConfig,
  type FrameworkApp,
  type Origin,
} from './init-app'
import { ESLINT_FRAGMENT, STYLELINT_FRAGMENT } from './patch'

/**
 * The files `polymorph init --framework solid` writes that differ from the
 * React app's (`init-app.ts` says which). A Solid app is TSX, checked by
 * `tsc` with Solid's JSX types.
 */

/** Solid, at the range this repository builds and tests the Solid tooling with. */
export const SOLID_RANGE = '^1.9.17'

/**
 * The tools a new Solid app builds and typechecks with. `init.test.ts` holds
 * them to the root `package.json`. The rules read TSX with their own parser,
 * so a Solid app needs no other.
 */
export const SOLID_TOOLING: Readonly<Record<string, string>> = {
  'vite-plugin-solid': '^2.11.14',
}

/** The runtime packages a new Solid app installs. `@polymorph/rules` is a dev dependency. */
export const SOLID_RUNTIME_PACKAGES = [
  '@polymorph/engine',
  FRAMEWORK_FOUNDATION.solid,
  FRAMEWORK_VOCABULARY.solid,
]

export const SOLID_SCRIPTS = {
  dev: 'vite',
  build: 'vite build',
  // An app has no stylesheets of its own (`no-app-css`), so the CSS glob
  // usually matches nothing, which Stylelint otherwise reports as an error.
  lint: 'eslint src && stylelint "src/**/*.css" --allow-empty-input',
  typecheck: 'tsc --noEmit',
}

export const SOLID_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
`

export const SOLID_MAIN = `// The theme first: its stylesheet, its fonts and the stored choice, before Solid renders.
import 'virtual:polymorph/theme'

import { render } from 'solid-js/web'

import { App } from './App'

render(() => <App />, document.getElementById('root')!)
`

/**
 * The container. It owns the state and the behaviour and hands the emitted
 * screen its data and callbacks. It reads the signal in the JSX, so the screen
 * follows it.
 */
export const SOLID_APP = `import { createSignal } from 'solid-js'

import { Welcome } from './screens/Welcome'

/**
 * The container. It owns the state and the behaviour, and hands the emitted
 * screen its data and callbacks. The screen itself only composes and binds.
 */
export function App() {
  const [started, setStarted] = createSignal(false)

  return (
    <main>
      <Welcome
        status={
          started()
            ? '${STATUS.after}'
            : '${STATUS.before}'
        }
        onStart={() => setStarted(true)}
      />
    </main>
  )
}
`

export const SOLID_AGENTS = (origin: Origin): string => `# Working in this app

This app is built with polymorph, a closed component vocabulary with lint rules that enforce it,
in Solid.

- The vocabulary is \`${FRAMEWORK_VOCABULARY.solid}\`. Screens compose its members and bind content to them.
- The contract is \`polymorph/system-card.md\`: every member, its props, the token families and the
  rules. A member or prop that is not in the card does not exist. A prop keeps its React name and
  type, and a node-typed prop takes a \`JSX.Element\`. A component reads its props as
  \`props.foo\` and never destructures them, so a value stays reactive.
- The MCP server in \`.mcp.json\` is the tool for both: \`get_system_card\` with \`framework: "solid"\`
  returns the card, and \`validate\` with \`framework: "solid"\` checks code against the red rules and
  names the lawful fix for each violation.
${serverNote(origin)}
- Screens are written as specs under \`src/screens/*.json\` and emitted to TSX (\`emit_screen\` with
  \`framework: "solid"\`). An emitted screen holds no state and no logic. A hand-written container,
  such as \`src/App.tsx\`, renders it and owns both. To change an emitted screen, change its spec and
  emit it again.
- To see a screen, call \`render_screen\` with its spec. It draws the screen in a browser at a
  phone and a desktop width, and returns the pictures with the layout faults it measured.
  ${browserNote(origin)}
- Application code may not write styles or raw controls: no CSS files, no \`class\`, \`classList\` or
  \`style\`, no raw \`<button>\` or \`<input>\`. The red rules in \`${ESLINT_FRAGMENT}\` and
  \`${STYLELINT_FRAGMENT}\` say the rest, and \`pnpm lint\` runs them.
- Another library's component (a map, a rich-text editor, a data grid) goes inside
  \`<ThirdParty library="…" reason="…">\`, in the file that imports it. The card says what the
  boundary allows. \`useThemeValues()\` from \`@polymorph/solid\` gives the theme's values to a
  library that takes them in JavaScript.
- The theme is the two JSON files in \`src/theme/\`, compiled at build time by the Vite plugin.
`

/** The Solid app, as `planInit` writes it. */
export const SOLID_INIT: FrameworkApp = {
  name: 'Solid',
  framework: { 'solid-js': SOLID_RANGE },
  runtime: SOLID_RUNTIME_PACKAGES,
  tooling: SOLID_TOOLING,
  scripts: SOLID_SCRIPTS,
  indexHtml: (name) => indexHtml(name, 'root', 'src/main.tsx'),
  tsconfig: SOLID_TSCONFIG,
  main: { path: 'src/main.tsx', contents: SOLID_MAIN },
  viteConfig: (systemPath, palettePath) =>
    viteConfig(
      { importLine: "import solid from 'vite-plugin-solid'", call: 'solid()' },
      { name: 'Solid', dedupe: ['solid-js'] },
      systemPath,
      palettePath,
    ),
  welcome: 'src/screens/Welcome.tsx',
  app: { path: 'src/App.tsx', contents: SOLID_APP },
  agents: SOLID_AGENTS,
}
