import { PUBLISHED_NAMES, TOOLS_PACKAGE } from '@polymorph/registry'

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
  /** `AGENTS.md`, which says where the MCP server runs from, and so depends on the origin. */
  agents: (origin: Origin) => string
}

/**
 * Where the CLI that writes the app runs from: a checkout of this repository,
 * or the published tools (`@metamorph-labs/polymorph`). What `init` writes for
 * an agent depends on it. From a checkout, `.mcp.json` runs that checkout's
 * server by a path that belongs to one machine. From the published tools, it
 * runs the server with `npx`, which works on any machine.
 */
export type Origin = 'checkout' | 'published'

/** A program a new app runs: a command, and the arguments that come before its own. */
export interface Program {
  command: string
  args: readonly string[]
}

/** `.mcp.json`: the MCP server, run against the app it is in. */
export function mcpConfig(mcp: Program): string {
  const config = {
    mcpServers: { polymorph: { command: mcp.command, args: [...mcp.args, '--project', '.'] } },
  }
  return `${JSON.stringify(config, null, 2)}\n`
}

/** The published tools, by the name `npx` runs them with. */
export const TOOLS_NAME = PUBLISHED_NAMES[TOOLS_PACKAGE] as string

/**
 * The bullet of `AGENTS.md` that says where the MCP server in `.mcp.json`
 * runs from. An app with a manifest lists the published tools as a dev
 * dependency, so `npx` runs that copy; a page with no build has no manifest,
 * and `npx` fetches the release that wrote the page.
 */
export function serverNote(origin: Origin, manifest = true): string {
  if (origin === 'checkout') {
    return `- \`.mcp.json\` starts the server from the polymorph checkout that created this app, by its absolute
  path on that machine. The path is machine-specific. On another machine, change it to that
  machine's checkout. A team can instead add \`.mcp.json\` to \`.gitignore\` and keep one per person.`
  }
  return manifest
    ? `- \`.mcp.json\` starts the server with \`npx\` from \`${TOOLS_NAME}\`, which \`package.json\` lists
  as a dev dependency at the release that created this app. It names no path, so it works on any
  machine that installs the app.`
    : `- \`.mcp.json\` starts the server with \`npx\` from \`${TOOLS_NAME}\`, at the release that created
  this page. It names no path, so it works on any machine with Node.`
}

/** The sentence of `AGENTS.md` that says what `render_screen` needs. */
export function browserNote(origin: Origin): string {
  return origin === 'checkout'
    ? `It needs a browser, downloaded once in the polymorph checkout:
  \`pnpm exec playwright install chromium\`.`
    : `It needs a browser, downloaded once. When the browser is missing,
  \`render_screen\` answers with the command that downloads it.`
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
