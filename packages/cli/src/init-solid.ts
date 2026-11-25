import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import { indexHtml, STATUS, viteConfig, type FrameworkApp } from './init-app'

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
}
