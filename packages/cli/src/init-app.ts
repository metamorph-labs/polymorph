/**
 * What `polymorph init --framework <name>` writes for an app in Vue, Svelte,
 * Solid or Angular, where it differs from the React app: the framework and its
 * tools in the manifest, the scripts, the entry, the Vite config, the
 * container and the agent notes, and where the welcome screen is emitted.
 * Everything else (the theme, the stylesheet rules, the MCP config, the card
 * and the lint fragment for the framework) is written by `init.ts` from the
 * registry for every framework alike. Each framework's values are in its own module
 * (`init-vue.ts`, `init-svelte.ts`, `init-solid.ts`, `init-angular.ts`).
 */
export interface FrameworkApp {
  /** How a sentence names the framework: `Vue`. */
  name: string
  /** The framework's own packages, at the ranges this repository builds and tests with. */
  framework: Readonly<Record<string, string>>
  /**
   * The runtime packages the app installs by their published names: the
   * engine, the framework's foundation and its vocabulary.
   */
  runtime: readonly string[]
  /**
   * The tools the app builds, typechecks and lints with beyond `eslint`,
   * `stylelint`, `typescript` and `vite`, which every app takes.
   */
  tooling: Readonly<Record<string, string>>
  scripts: Readonly<Record<string, string>>
  indexHtml: (name: string) => string
  tsconfig: string
  /** The entry: the theme module first, then the framework mounts the container. */
  main: { path: string; contents: string }
  viteConfig: (systemPath: string, palettePath: string) => string
  /** Where the welcome screen is emitted. */
  welcome: string
  /** The container that owns the state and renders the welcome screen. */
  app: { path: string; contents: string }
  agents: string
}

/**
 * The welcome screen of an app in Vue, Svelte, Solid or Angular, as a spec:
 * the React app's inputs and layout, with the title and the status line
 * written as `Heading` and `Text`. `planInit` refuses a welcome spec that
 * names a member absent in the app's framework, so a member its map does not
 * mark native cannot reach this spec unnoticed.
 */
export function frameworkWelcomeSpec(): unknown {
  return {
    spec: 'polymorph-screen/1',
    name: 'Welcome',
    purpose: 'The first screen of a new polymorph app: a title, a status line and one action.',
    inputs: [
      { name: 'status', type: 'string', doc: 'The line under the title.' },
      { name: 'onStart', type: '() => void', doc: 'Called when the person presses Start.' },
    ],
    root: {
      component: 'Stack',
      props: { gap: 5, p: 6 },
      children: [
        { component: 'Heading', children: ['Welcome'] },
        { component: 'Text', props: { tone: 'secondary' }, children: [{ $: 'status' }] },
        {
          component: 'Button',
          props: {
            variant: 'solid',
            tone: 'accent',
            label: 'Start',
            onClick: { $: 'onStart' },
          },
        },
      ],
    },
  }
}

/** The line the container hands the welcome screen before and after Start. */
export const STATUS = {
  before: 'A polymorph app, themed, linted and ready for its first screen.',
  after: 'Started. Write the next screen as a spec in src/screens and emit it.',
}

/**
 * The `index.html` of a Vue, Svelte or Solid app: one mount point and the
 * entry module. Angular renders into its root component's element instead.
 */
export function indexHtml(name: string, mount: string, entry: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="${mount}"></div>
    <script type="module" src="/${entry}"></script>
  </body>
</html>
`
}

/**
 * The Vite config an app writes, with the framework's plugin first and one
 * copy of the framework (`dedupe`), which `name` says in words.
 */
export function viteConfig(
  plugin: { importLine: string; call: string },
  framework: { name: string; dedupe: readonly string[] },
  systemPath: string,
  palettePath: string,
): string {
  const { name, dedupe } = framework
  return `import { polymorphTheme } from '@polymorph/engine/vite'
${plugin.importLine}
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    ${plugin.call},
    // The theme is data, compiled to CSS here under the same laws as the
    // catalogue's. Edit the JSON and the next build or dev reload recompiles it.
    polymorphTheme({
      systems: ['${systemPath}'],
      palettes: ['${palettePath}'],
    }),
  ],
  // One ${name}, the app's.
  resolve: { dedupe: [${dedupe.map((name) => `'${name}'`).join(', ')}] },
})
`
}
