import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'

import {
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  PUBLISHED_NAMES,
  PUBLISHED_REGISTRY,
  TOOLS_PACKAGE,
  type Framework,
  type MappedFramework,
  type Registry,
  type RegistrySystem,
} from '@polymorph/registry'

import {
  AGENT_RECORD,
  commandLine,
  DEFAULT_HARNESSES,
  freshRecord,
  planAgents,
  renderRecord,
  runScript,
  type AgentPlan,
} from './agents'
import { freshEslintConfig, freshStylelintConfig } from './apply'
import {
  ELEMENTS_STATIC_DIR,
  NoBuildFilesError,
  planElementsInit,
  UnshippedPageError,
} from './elements'
import { installedEslintFragment, stylelintFragment } from './emit'
import { ANGULAR_INIT } from './init-angular'
import {
  frameworkWelcomeSpec,
  mcpConfig,
  TOOLS_NAME,
  type FrameworkApp,
  type Origin,
  type Program,
} from './init-app'
import { SOLID_INIT } from './init-solid'
import { SVELTE_INIT } from './init-svelte'
import { VUE_INIT } from './init-vue'
import { ESLINT_FRAGMENT, STYLELINT_FRAGMENT } from './patch'
import { DEFAULT_DIR, DEFAULT_SYSTEM, escapes, EscapingDirError } from './plan'
import { frameworkRanges, isMapped, KNOWN_FRAMEWORKS } from './vue'

/**
 * `polymorph init`: a new app that builds, lints clean and is ready for an
 * agent, from one command.
 *
 * Without it a consumer makes eight separate decisions before the first screen:
 * a token, an `.npmrc`, the npm aliases, the Vite plugin, a theme, the lint
 * fragments, an MCP config and a first screen. Each is a place to go wrong. Init
 * makes all eight from the registry and writes the result.
 *
 * The work is split so another front can reuse it. `planInit` is a pure
 * function of a registry and a name, so `--dry-run` shows the plan without a
 * filesystem. `writeInit` carries it out against a source tree that holds the
 * files the registry names: this checkout, or an unpacked registry snapshot. `installApp` runs the package manager. The two
 * programs init wires in (the MCP server and the screen emitter) are passed in
 * by the entry point, because only the entry point knows where they live.
 *
 * `--framework vue` writes the same app in Vue (`init-vue.ts`): `@polymorph/vue`
 * and `@polymorph/vue-ui` instead of the React packages, `@vitejs/plugin-vue`
 * and a `vue-tsc` typecheck, the ESLint fragment that reads `.vue` files, and
 * a welcome screen written with the members the Vue vocabulary ships, emitted
 * as a single-file component. `--framework svelte` (`init-svelte.ts`) and
 * `--framework solid` (`init-solid.ts`) write it in Svelte and in Solid the
 * same way, with each framework's Vite plugin, typecheck, ESLint fragment and
 * emitted welcome screen, and `--framework angular` (`init-angular.ts`) in
 * Angular: Analog's Vite plugin, an `ngc` typecheck, the fragment that reads
 * templates and a welcome screen emitted as a standalone component.
 *
 * `--framework elements` writes a page with no build instead (`elements.ts`):
 * the files a page loads the elements from, copied into the app's static
 * directory, a theme sheet, an example page, the card and the MCP config, and
 * `polymorph.json`, which records the copies. It installs no package.
 */

/** A framework whose app is a Vite app with an emitted welcome screen: every one but the elements. */
type AppFramework = Exclude<MappedFramework, 'elements'>

/** Each framework's app but React's, which `planInit` writes inline. */
const FRAMEWORK_APPS: Readonly<Record<AppFramework, FrameworkApp>> = {
  vue: VUE_INIT,
  svelte: SVELTE_INIT,
  solid: SOLID_INIT,
  angular: ANGULAR_INIT,
}

/** The app `framework`'s init writes, or `null` for React's, which `planInit` writes inline. */
const appOf = (framework: Framework): FrameworkApp | null =>
  isMapped(framework) && framework !== 'elements' ? FRAMEWORK_APPS[framework] : null

export { mcpConfig, TOOLS_NAME }
export type { Origin, Program }

/**
 * The programs a new app is wired to. The entry point names them, because only
 * it knows where they live: a checkout's by their paths in it, the published
 * tools' by the command any machine runs.
 */
export interface InitPrograms {
  /** The MCP server. `.mcp.json` runs it with `--project .` after these arguments. */
  mcp: Program
  /** The screen emitter, run in the new app as `<command> <args> <spec.json> <out>`. */
  emit: Program
  /**
   * The CLI itself, as the agent files name it before a verb: the checkout's bin
   * by its path, or the published tools with `npx`. Omitted, the published
   * tools at the release (`publishedTools`).
   */
  polymorph?: Program
}

/** The published tools at the registry's release, as a command: `npx -y @metamorph-labs/polymorph@^<version>`. */
export function publishedTools(registry: Registry): Program {
  return { command: 'npx', args: ['-y', `${TOOLS_NAME}@^${registry.version}`] }
}

/** The CLI the agent files name: the entry point's, or the published tools. */
export const toolsOf = (programs: InitPrograms, registry: Registry): Program =>
  programs.polymorph ?? publishedTools(registry)

/**
 * The agent files of a new app, as written steps: every part of the plan
 * whole, then the record of what was written, so a later `polymorph agents`
 * knows the files as its own.
 */
export function agentSteps(registry: Registry, plan: AgentPlan): InitStep[] {
  return [
    ...plan.steps.map((step): InitStep => ({
      kind: 'write',
      path: step.path,
      contents: step.contents,
    })),
    { kind: 'write', path: AGENT_RECORD, contents: renderRecord(freshRecord(registry, plan)) },
  ]
}

/**
 * The npm registry a new app installs the packages from. Both hold every
 * release under the same names. `npmjs` needs no configuration and no token.
 * `github` is GitHub Packages, which the app's `.npmrc` points the scope at,
 * with a token that can read the packages.
 */
export const PACKAGE_REGISTRIES = ['npmjs', 'github'] as const
export type PackageRegistry = (typeof PACKAGE_REGISTRIES)[number]

/**
 * Each origin's registry when `--registry` names none. The published tools
 * install from npmjs.com, where the packages are public. A checkout installs
 * from GitHub Packages, the registry a release reaches first, so a checkout
 * gets a new release as soon as it exists.
 */
const DEFAULT_REGISTRY: Readonly<Record<Origin, PackageRegistry>> = {
  checkout: 'github',
  published: 'npmjs',
}

/**
 * The package managers `init` installs a new app with, each with the command
 * it installs with and the one it starts the app's dev server with.
 */
export const PACKAGE_MANAGERS = {
  npm: { install: ['install'], dev: 'npm run dev' },
  /**
   * Without `--ignore-workspace`, a `pnpm-workspace.yaml` in any directory
   * above the app makes pnpm install that workspace instead of the app.
   */
  pnpm: { install: ['install', '--ignore-workspace'], dev: 'pnpm dev' },
  yarn: { install: ['install'], dev: 'yarn dev' },
  bun: { install: ['install'], dev: 'bun run dev' },
} as const satisfies Record<string, { install: readonly string[]; dev: string }>
export type PackageManager = keyof typeof PACKAGE_MANAGERS

/** The command a person runs to install an app with `manager`. */
export const installCommand = (manager: PackageManager): string =>
  [manager, ...PACKAGE_MANAGERS[manager].install].join(' ')

/**
 * The package manager that ran this command, read from the user agent every
 * package manager sets for what it runs (`npm_config_user_agent`, such as
 * `pnpm/11.0.9 npm/? node/v24.11.0`), or the origin's when no known one ran
 * it. A checkout is a pnpm workspace, so pnpm is there; the published tools
 * may run where only npm is.
 */
export function packageManagerOf(env: NodeJS.ProcessEnv, origin: Origin): PackageManager {
  const agent = (env['npm_config_user_agent'] ?? '').split('/')[0] ?? ''
  if (Object.hasOwn(PACKAGE_MANAGERS, agent)) return agent as PackageManager
  return DEFAULT_MANAGER[origin]
}

/** Each origin's package manager when nothing says which: `packageManagerOf`'s fallback. */
const DEFAULT_MANAGER: Readonly<Record<Origin, PackageManager>> = {
  checkout: 'pnpm',
  published: 'npm',
}

/** One thing init does to the new directory, in the order it does them. */
export type InitStep =
  | { kind: 'write'; path: string; contents: string }
  /** A file the registry names, copied from the source tree. */
  | { kind: 'copy'; path: string; from: string }
  /**
   * A screen emitted from its spec, which an earlier step wrote. The emitter
   * reads the framework from the path's extension, and `framework` names the
   * one a `.tsx` path does not: Solid.
   */
  | { kind: 'emit'; path: string; spec: string; framework?: Framework }

export interface InitPlan {
  /** The package name, from the directory's name. */
  name: string
  /** The web framework the app is written in. */
  framework: Framework
  system: RegistrySystem
  palette: string
  steps: InitStep[]
}

export class InitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InitError'
  }
}

export { DEFAULT_SYSTEM }

/**
 * The tools a new app builds and lints with, at the ranges this repository
 * uses. They are the tools the vocabulary and the rules are tested against, so
 * a new app starts on the same ones. `init.test.ts` holds this table to the
 * root `package.json`, so a bump there fails until it is made here too.
 */
export const APP_TOOLING: Readonly<Record<string, string>> = {
  '@types/react': '^19.2.7',
  '@types/react-dom': '^19.2.3',
  '@vitejs/plugin-react': '^6.0.4',
  eslint: '^10.8.0',
  stylelint: '^17.14.1',
  typescript: '^5.9.3',
  vite: '^8.1.5',
}

/** The formatting of the files init writes, and so of the screen it emits. */
const PRETTIER = {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: 'all',
  arrowParens: 'always',
}

/** The vocabulary's peer range for React. `init.test.ts` holds it to `@polymorph/react-ui`. */
export const REACT_RANGE = '^19.0.0'

/** The runtime packages a new app installs. `@polymorph/rules` is a dev dependency. */
const RUNTIME_PACKAGES = ['@polymorph/engine', '@polymorph/react', '@polymorph/react-ui']
const RULES_PACKAGE = '@polymorph/rules'

/** The scope the packages are published under, which the `.npmrc` points at the registry. */
const SCOPE = (Object.values(PUBLISHED_NAMES)[0] ?? '').split('/')[0] as string

/** What init runs in the new app from a checkout, and tells a person to run when it could not. */
export const INSTALL_COMMAND = installCommand('pnpm')

/** Where the welcome screen's spec and its emitted view are written. */
const WELCOME_SPEC = 'src/screens/welcome.json'
const WELCOME_VIEW = 'src/screens/Welcome.tsx'

/** `my App!` -> `my-app`. npm names are lowercase and URL-safe. */
export function packageName(dir: string): string {
  const name = basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+|-+$/g, '')
  return name === '' ? 'app' : name
}

/**
 * `@polymorph/engine` -> `npm:@metamorph-labs/polymorph-engine@^1.0.3`.
 *
 * The app's framework's foundation and vocabulary are ranged with that
 * framework (`frameworkRanges`), and the engine and the rules, which every
 * framework shares, in `registry.packages`.
 */
function alias(registry: Registry, name: string, framework: Framework = 'react'): string {
  const published = PUBLISHED_NAMES[name]
  const own = name === FRAMEWORK_FOUNDATION[framework] || name === FRAMEWORK_VOCABULARY[framework]
  const range = (own ? frameworkRanges(registry, framework) : registry.packages)[name]
  if (published === undefined || range === undefined) {
    throw new InitError(
      `polymorph init: the registry does not publish ${name}, so it cannot be installed`,
    )
  }
  return `npm:${published}@${range}`
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

const sorted = (ranges: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(ranges).sort(([a], [b]) => a.localeCompare(b)))

/** The catalogue as one line per system, for the refusal of a name that is not in it. */
export function catalogueLines(registry: Registry): string[] {
  return registry.theme.systems.map(
    (system) => `  ${system.name.padEnd(14)}+ ${system.defaultPalette}`,
  )
}

/**
 * Why a directory cannot hold a new app, or `null` when it can.
 *
 * It must not exist yet, or be empty. Init writes a whole app and does not
 * merge one into an existing tree, so a directory with files in it is refused.
 * A directory holding only `.git` counts as empty: it is a freshly cloned or
 * created repository, and init writes nothing there.
 *
 * It must not be a checkout of polymorph or inside one (`checkoutHolding`).
 * An app written there would be linted by the checkout's configs, and
 * `pnpm install` would make it part of the checkout's workspace, where
 * `@polymorph/*` resolves to source.
 */
export function refuseDirectory(dir: string, source: string, registry: Registry): string | null {
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) return `polymorph init: ${dir} is a file, not a directory`
    const entries = readdirSync(dir).filter((entry) => entry !== '.git')
    if (entries.length > 0) {
      return (
        `polymorph init: ${dir} is not empty — init writes a new app and does not merge ` +
        'into an existing one. Name a new directory.'
      )
    }
  }

  const checkout = checkoutHolding(dir, source, registry)
  if (checkout === null) return null
  if (checkout === realpathSync(source)) {
    return (
      `polymorph init: ${dir} is inside the polymorph checkout the CLI runs from — ` +
      'create the app outside it, for example next to it'
    )
  }
  return `polymorph init: ${dir} is inside a checkout of polymorph (${checkout}) — create the app outside it`
}

/**
 * The checkout of polymorph a directory is, or is inside, as a real path, or
 * `null` when there is none.
 *
 * `init`, `add`, `update` and the MCP tool `install` each refuse a directory
 * this names, because each would write polymorph into its own source, so all
 * four recognise a checkout through this one function. `source` is the
 * checkout the CLI or the server reads from, recognised by real path, so a
 * link does not hide it. Any other copy, a second clone or a worktree, is
 * recognised by its contents: the nearest directory at or above `dir` that
 * holds the base layer at the path the registry copies it from.
 *
 * `dir` need not exist. The deepest part of it that does is resolved for
 * real, so a link anywhere along the way cannot hide where it is.
 */
export function checkoutHolding(dir: string, source: string, registry: Registry): string | null {
  let anchor = resolve(dir)
  while (!existsSync(anchor) && dirname(anchor) !== anchor) anchor = dirname(anchor)
  const real = realpathSync(anchor)

  const checkout = realpathSync(source)
  if (real === checkout || real.startsWith(`${checkout}${sep}`)) return checkout

  for (let at = real; ; at = dirname(at)) {
    if (existsSync(resolve(at, registry.vendor.base))) return at
    if (dirname(at) === at) return null
  }
}

/**
 * The welcome screen, as a spec. It is the smallest lawful screen that shows
 * the split every emitted screen has: the spec composes and binds, and the
 * container (`src/App.tsx`) owns the state behind `status` and the behaviour
 * behind `onStart`.
 */
function welcomeSpec(): unknown {
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
        {
          component: 'PageHeader',
          props: { title: 'Welcome', description: { $: 'status' } },
        },
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

/** Every member a spec's tree names, a compound part by its member, in the order it names them. */
function specMembers(spec: unknown): string[] {
  const found = new Set<string>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const component = record['component']
    if (typeof component === 'string') found.add(component.split('.')[0] as string)
    for (const value of Object.values(record)) visit(value)
  }
  visit((spec as { root?: unknown }).root)
  return [...found]
}

/**
 * Why the welcome screen cannot be emitted in `framework`: one line per member
 * the framework's vocabulary does not ship, or none. It is checked before
 * anything is written, because the emit step runs after the configs and the
 * theme are on disk, and a directory with files in it is refused on a re-run.
 */
function unshippedMembers(registry: Registry, spec: unknown, framework: Framework): string[] {
  const entries = new Map(
    [...registry.components, ...registry.exceptions.primitives].map((member) => [
      member.name,
      member.frameworks[framework],
    ]),
  )
  return specMembers(spec).flatMap((name) => {
    const entry = entries.get(name)
    if (entry?.status === 'native') return []
    return [`  ${name}: ${entry?.reason ?? 'the registry has no member by this name'}`]
  })
}

/**
 * The `.npmrc` of an app that installs from GitHub Packages: the scope, and the
 * token by the variable's name, never its value. The package manager reads the
 * token from the environment when it installs.
 */
const GITHUB_NPMRC: InitStep = {
  kind: 'write',
  path: '.npmrc',
  contents:
    `${SCOPE}:registry=${PUBLISHED_REGISTRY}\n` +
    `${PUBLISHED_REGISTRY.replace(/^https?:/, '')}/:_authToken=\${NODE_AUTH_TOKEN}\n`,
}

/**
 * The range a new app lists the published tools at: a caret on the release's
 * version, which every package carries (`install.test.ts`). The registry names
 * the package, so a registry that does not is refused.
 */
export function toolsRange(registry: Registry): string {
  if (PUBLISHED_NAMES[TOOLS_PACKAGE] === undefined) {
    throw new InitError(`polymorph init: the registry does not publish ${TOOLS_PACKAGE}`)
  }
  return `^${registry.version}`
}

/** The catalogue system `wanted` names, or the default, with the palette it declares. */
function pairingOf(
  registry: Registry,
  wanted: string = DEFAULT_SYSTEM,
): { system: RegistrySystem; palette: Registry['theme']['palettes'][number] } {
  const system = registry.theme.systems.find((entry) => entry.name === wanted)
  if (!system) {
    throw new InitError(
      `polymorph init: there is no system called "${wanted}". The catalogue:\n\n` +
        catalogueLines(registry).join('\n'),
    )
  }
  const palette = registry.theme.palettes.find((entry) => entry.name === system.defaultPalette)
  if (!palette) {
    throw new InitError(
      `polymorph init: ${system.name} declares the palette ${system.defaultPalette} and the ` +
        'registry does not ship one',
    )
  }
  return { system, palette }
}

/**
 * Everything init writes, in order, as data. Pure: it reads the registry and
 * nothing else, so `--dry-run` and a test can see the whole app without a
 * directory.
 */
export function planInit(
  registry: Registry,
  options: {
    dir: string
    system?: string
    programs: InitPrograms
    framework?: Framework
    /** Where the CLI runs from. A checkout when omitted. */
    origin?: Origin
    /** Where the app installs the packages from. The origin's default when omitted. */
    packageRegistry?: PackageRegistry
    /** The package manager the app is installed with, which its agent notes name. The origin's when omitted. */
    manager?: PackageManager
  },
): InitPlan {
  const framework = options.framework ?? 'react'
  const origin = options.origin ?? 'checkout'
  const packageRegistry = options.packageRegistry ?? DEFAULT_REGISTRY[origin]
  // From the published tools, the app lists them, so `npx` in `.mcp.json` runs the
  // installed copy. Every package carries the release's version.
  const tools: Record<string, string> =
    origin === 'published' ? { [TOOLS_NAME]: toolsRange(registry) } : {}
  if (framework === 'elements') {
    throw new InitError(
      'polymorph init: an elements app is a page with no build — `planElementsInit` writes it',
    )
  }
  const app = appOf(framework)
  const { system, palette } = pairingOf(registry, options.system)

  const welcome = app === null ? welcomeSpec() : frameworkWelcomeSpec()
  const unshipped = unshippedMembers(registry, welcome, framework)
  if (unshipped.length > 0) {
    throw new InitError(
      `polymorph init: the welcome screen names members ${FRAMEWORK_VOCABULARY[framework]} ` +
        `does not ship, so nothing was written:\n${unshipped.join('\n')}`,
    )
  }

  const name = packageName(options.dir)
  // The two documents share a directory. A system and a palette may share a
  // name, so a collision is told apart by suffix rather than overwritten.
  const collide = system.name === palette.name
  const systemPath = `src/theme/${system.name}${collide ? '.system' : ''}.json`
  const palettePath = `src/theme/${palette.name}${collide ? '.palette' : ''}.json`

  const range = (pkg: string): string => {
    const declared = registry.packages[pkg]
    if (declared === undefined) {
      throw new InitError(`polymorph init: the registry has no version range for ${pkg}`)
    }
    return declared
  }

  const fonts = Object.fromEntries(system.fonts.map((font) => [font.package, range(font.package)]))
  const manifest = app
    ? {
        name,
        private: true,
        type: 'module',
        scripts: app.scripts,
        dependencies: sorted({
          ...app.framework,
          ...Object.fromEntries(app.runtime.map((pkg) => [pkg, alias(registry, pkg, framework)])),
          ...fonts,
        }),
        devDependencies: sorted({
          [RULES_PACKAGE]: alias(registry, RULES_PACKAGE),
          // The tools that are not React's: eslint, stylelint, typescript and vite.
          ...Object.fromEntries(
            Object.entries(APP_TOOLING).filter(([tool]) => !/react/.test(tool)),
          ),
          ...app.tooling,
          ...tools,
        }),
      }
    : {
        name,
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          // An app has no stylesheets of its own (`no-app-css`), so the CSS glob
          // usually matches nothing, which Stylelint otherwise reports as an error.
          lint: 'eslint src && stylelint "src/**/*.css" --allow-empty-input',
          typecheck: 'tsc --noEmit',
        },
        dependencies: sorted({
          react: REACT_RANGE,
          'react-dom': REACT_RANGE,
          ...Object.fromEntries(RUNTIME_PACKAGES.map((pkg) => [pkg, alias(registry, pkg)])),
          ...fonts,
        }),
        devDependencies: sorted({
          [RULES_PACKAGE]: alias(registry, RULES_PACKAGE),
          ...APP_TOOLING,
          ...tools,
        }),
      }

  const steps: InitStep[] = [
    { kind: 'write', path: 'package.json', contents: json(manifest) },
    // npmjs.com needs no configuration: the packages are public there.
    ...(packageRegistry === 'github' ? [GITHUB_NPMRC] : []),
    { kind: 'write', path: '.gitignore', contents: 'node_modules\ndist\n' },
    {
      kind: 'write',
      path: 'index.html',
      contents: app
        ? app.indexHtml(name)
        : `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      kind: 'write',
      path: 'tsconfig.json',
      contents: app
        ? app.tsconfig
        : `{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"]
}
`,
    },
    // The style every file here is written in. The emitter formats the welcome
    // screen with the settings it finds in the app, so this comes first.
    { kind: 'write', path: '.prettierrc.json', contents: json(PRETTIER) },
    app
      ? { kind: 'write', path: app.main.path, contents: app.main.contents }
      : {
          kind: 'write',
          path: 'src/main.tsx',
          contents: `// The theme first: its stylesheet, its fonts and the stored choice, before React renders.
import 'virtual:polymorph/theme'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
        },
    {
      kind: 'write',
      path: 'src/vite-env.d.ts',
      contents: '/// <reference types="@polymorph/engine/vite-env" />\n',
    },
    {
      kind: 'write',
      path: 'vite.config.ts',
      contents: app
        ? app.viteConfig(systemPath, palettePath)
        : `import { polymorphTheme } from '@polymorph/engine/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    // The theme is data, compiled to CSS here under the same laws as the
    // catalogue's. Edit the JSON and the next build or dev reload recompiles it.
    polymorphTheme({
      systems: ['${systemPath}'],
      palettes: ['${palettePath}'],
    }),
  ],
  // One React, the app's.
  resolve: { dedupe: ['react', 'react-dom'] },
})
`,
    },
    { kind: 'copy', path: systemPath, from: system.file },
    { kind: 'copy', path: palettePath, from: palette.file },
    // The values the rules name the nearest token with. `polymorph add` reads
    // them from the sheet it compiles. Here the Vite plugin compiles the theme
    // at build time, after these files are written, so they come from the
    // registry, which resolves the same pairing. The ESLint half is the one for
    // an app that installs the vocabulary: `eslint --fix` rewrites a raw
    // `<button>` as `Button` from `@polymorph/react-ui`, and there is no
    // vendored tree to exempt.
    {
      kind: 'write',
      path: ESLINT_FRAGMENT,
      contents: installedEslintFragment(system.tokenValues, { framework }),
    },
    {
      kind: 'write',
      path: STYLELINT_FRAGMENT,
      contents: stylelintFragment(DEFAULT_DIR, registry.theme.customProperties, system.tokenValues),
    },
    { kind: 'write', path: 'eslint.config.js', contents: freshEslintConfig() },
    { kind: 'write', path: 'stylelint.config.js', contents: freshStylelintConfig() },
    // The agent files `polymorph agents` writes, for the harnesses it writes by default.
    ...agentSteps(
      registry,
      planAgents(registry, {
        harnesses: DEFAULT_HARNESSES,
        framework,
        origin,
        tools: toolsOf(options.programs, registry),
        mcp: options.programs.mcp,
        // The app's ESLint config spreads the fragment written above, so its lint runs the rules.
        lint: { command: runScript(options.manager ?? DEFAULT_MANAGER[origin], 'lint'), redRules: true },
      }),
    ),
    { kind: 'write', path: WELCOME_SPEC, contents: json(welcome) },
    // The emitter reads the framework from the extension, and from the step for Solid.
    {
      kind: 'emit',
      path: app ? app.welcome : WELCOME_VIEW,
      spec: WELCOME_SPEC,
      ...(framework === 'solid' ? { framework } : {}),
    },
    app
      ? { kind: 'write', path: app.app.path, contents: app.app.contents }
      : {
          kind: 'write',
          path: 'src/App.tsx',
          contents: `import { useState } from 'react'

import { Welcome } from './screens/Welcome'

/**
 * The container. It owns the state and the behaviour, and hands the emitted
 * screen its data and callbacks. The screen itself only composes and binds.
 */
export function App() {
  const [started, setStarted] = useState(false)

  return (
    <main>
      <Welcome
        status={
          started
            ? 'Started. Write the next screen as a spec in src/screens and emit it.'
            : 'A polymorph app, themed, linted and ready for its first screen.'
        }
        onStart={() => setStarted(true)}
      />
    </main>
  )
}
`,
        },
  ]

  return { name, framework, system, palette: palette.name, steps }
}

/**
 * Carries out a plan in `dir`, reporting each file as it lands.
 *
 * The emitter runs as a separate process with `cwd` at the new app, for two
 * reasons. The CLI does not depend on `@polymorph/spec` (`thin-front.test.ts`
 * pins its dependencies), and the emitter formats with the Prettier settings
 * of the directory it runs in, which must be the app's. The emitter validates
 * the spec against the registry first and writes nothing if it is unlawful.
 */
export function writeInit(
  dir: string,
  source: string,
  plan: InitPlan,
  programs: InitPrograms,
  out: (line: string) => void,
): void {
  for (const step of plan.steps) {
    const target = resolve(dir, step.path)
    mkdirSync(dirname(target), { recursive: true })

    if (step.kind === 'write') {
      writeFileSync(target, step.contents)
      out(row('wrote', step.path))
    } else if (step.kind === 'copy') {
      writeFileSync(target, readFileSync(resolve(source, step.from)))
      out(row('copied', `${step.path}  (${step.from})`))
    } else {
      try {
        const named = step.framework === undefined ? [] : ['--framework', step.framework]
        execFileSync(
          programs.emit.command,
          [...programs.emit.args, step.spec, step.path, ...named],
          {
            cwd: dir,
            stdio: 'pipe',
          },
        )
      } catch (error) {
        const failed = error as { stderr?: Buffer; message: string }
        throw new InitError(
          `polymorph init: the emitter refused ${step.spec}:\n${failed.stderr?.toString() ?? failed.message}`,
        )
      }
      out(row('emitted', `${step.path}  (from ${step.spec})`))
    }
  }
}

export type InstallOutcome =
  | 'installed'
  | 'no-token'
  /** The package manager is not on `PATH`. */
  | 'no-package-manager'
  /** The registry has no release of a published package at the range the app asks for. */
  | 'unpublished'
  /** The registry refused the token. */
  | 'unauthorized'
  | 'failed'

/** Where an install gets its packages from, and which package manager runs it. */
export interface InstallOptions {
  /** `github` (the default) asks for a token; `npmjs` installs with none. */
  packageRegistry?: PackageRegistry
  /** `pnpm` when omitted. */
  manager?: PackageManager
}

/**
 * The package manager's install in the new app: `pnpm install
 * --ignore-workspace` by default, `npm install` for npm.
 *
 * From npmjs.com the packages are public, and the install runs with no token.
 * From GitHub Packages it needs a token that can read them. The token comes
 * from `NODE_AUTH_TOKEN`, or from the GitHub CLI, as the publish script finds
 * its own. The variable is preferred because it can hold a token with only
 * `read:packages`, and the GitHub CLI's token has every scope its login has.
 * When the GitHub CLI's is used, `out` says so. The token goes into the
 * package manager's environment only. The `.npmrc` names the variable, so no
 * token is written to disk, and it is masked in the output `out` replays.
 *
 * The package manager's output is captured and then replayed through `out`,
 * because the outcome is read from it. pnpm prints its errors on stdout and
 * npm on stderr, so both are read. `env` is the environment the programs are
 * found and run in.
 */
export function installApp(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
  out: (line: string) => void = () => {},
  options: InstallOptions = {},
): InstallOutcome {
  const manager = options.manager ?? 'pnpm'
  const command = installCommand(manager)
  if (options.packageRegistry === 'npmjs') {
    out(row('installing', command))
    return finished(
      runProgram(manager, PACKAGE_MANAGERS[manager].install, { cwd: dir, env }),
      '',
      out,
    )
  }

  let token = env['NODE_AUTH_TOKEN'] ?? ''
  if (token === '') {
    // Absent or logged out, the GitHub CLI has no token to give the package manager.
    const gh = runProgram('gh', ['auth', 'token'], { env })
    token = gh.status === 0 ? (gh.stdout ?? '').trim() : ''
    if (token !== '') {
      out(
        row(
          'token',
          'from `gh auth token`, because NODE_AUTH_TOKEN is unset. Recommended: ' +
            'NODE_AUTH_TOKEN set to a token with only read:packages.',
        ),
      )
    }
  }
  if (token === '') return 'no-token'

  out(row('installing', command))
  const result = runProgram(manager, PACKAGE_MANAGERS[manager].install, {
    cwd: dir,
    env: { ...env, NODE_AUTH_TOKEN: token },
  })
  return finished(result, token, out)
}

/** The outcome of an install that ran, with what it printed replayed and `secret` masked. */
function finished(
  result: SpawnSyncReturns<string>,
  secret: string,
  out: (line: string) => void,
): InstallOutcome {
  if (notOnPath(result)) return 'no-package-manager'
  // A program that failed to start printed nothing, and its streams are null.
  const printed = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const masked = (secret === '' ? printed : printed.split(secret).join('[token]')).trimEnd()
  if (masked !== '') out(masked)
  return result.status === 0 ? 'installed' : installFailure(masked)
}

/**
 * A program on `PATH`, run with what it prints captured.
 *
 * On Windows `pnpm` is a `.cmd` shim, and Node runs one only through a shell.
 * The shell is given one command line, because Node deprecates an argument list
 * with `shell` set. The arguments here are fixed words that need no quoting.
 */
function runProgram(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv },
): SpawnSyncReturns<string> {
  const settings = {
    ...options,
    encoding: 'utf8' as const,
    stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }
  return process.platform === 'win32'
    ? spawnSync([command, ...args].join(' '), { ...settings, shell: true })
    : spawnSync(command, args, settings)
}

/** Whether the program was not found. Through a Windows shell that is an exit status, not an error. */
function notOnPath(result: SpawnSyncReturns<string>): boolean {
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return true
  return (
    process.platform === 'win32' &&
    (result.status === 9009 ||
      /is not recognized as an internal or external command/.test(result.stderr ?? ''))
  )
}

/**
 * Why `pnpm install` failed, from what it printed: pnpm's error codes
 * (`ERR_PNPM_FETCH_401`, `ERR_PNPM_FETCH_404`, `ERR_PNPM_NO_MATCHING_VERSION`)
 * and npm's (`E401`, `E404`, `ETARGET`). A refused token is checked first,
 * because it can also make the registry answer 404. A missing release counts
 * as unpublished only when the output names the published scope, so a font
 * with no release at its range is a plain failure.
 */
function installFailure(printed: string): InstallOutcome {
  if (/ERR_PNPM_FETCH_40[13]|\bE40[13]\b/.test(printed)) return 'unauthorized'
  const missing = /ERR_PNPM_FETCH_404|ERR_PNPM_NO_MATCHING_VERSION|\bE404\b|\bETARGET\b/.test(
    printed,
  )
  const ours = printed.includes(`${SCOPE}/`) || printed.toLowerCase().includes(`${SCOPE}%2f`)
  return missing && ours ? 'unpublished' : 'failed'
}

/** The published packages a new app installs, as the registry names them, at the app's ranges. */
function publishedReleases(registry: Registry, framework: Framework, origin: Origin): string[] {
  const runtime = appOf(framework)?.runtime ?? RUNTIME_PACKAGES
  return [
    ...[...runtime, RULES_PACKAGE].map((pkg) =>
      alias(registry, pkg, framework).replace(/^npm:/, ''),
    ),
    // The published tools' app lists them too.
    ...(origin === 'published' ? [`${TOOLS_NAME}@${toolsRange(registry)}`] : []),
  ]
}

/** How a new app is installed: from where, with what, and run from which origin. */
interface InstallSetup {
  packageRegistry: PackageRegistry
  manager: PackageManager
  origin: Origin
}

/** The command that installs the app in `given`, with the token GitHub Packages asks for. */
function installLine(given: string, plan: InstallSetup): string {
  const token = plan.packageRegistry === 'github' ? 'NODE_AUTH_TOKEN=$(gh auth token) ' : ''
  return `cd ${given} && ${token}${installCommand(plan.manager)}`
}

/** What to do after an install that did not complete. The app is written either way. */
function installAdvice(
  outcome: InstallOutcome,
  given: string,
  registry: Registry,
  framework: Framework,
  plan: InstallSetup,
): string[] {
  const install = `  ${installLine(given, plan)}`
  const command = installCommand(plan.manager)
  const tokenHint = [
    'The packages are on GitHub Packages and need a token that can read them:',
    '  gh auth refresh -s read:packages',
    install,
  ]
  switch (outcome) {
    case 'no-package-manager':
      return [
        `The app is written, and ${plan.manager} is not installed. Install ${plan.manager}, then run \`${command}\` in it.`,
      ]
    case 'no-token':
      return [
        'The app is written, and there is no token to install its packages with.',
        ...tokenHint,
      ]
    case 'unauthorized':
      return ['The app is written, and the registry refused the token.', ...tokenHint]
    case 'unpublished':
      return [
        'The app is written, and the registry has no release of its packages at the ranges it asks for:',
        ...publishedReleases(registry, framework, plan.origin).map((release) => `  ${release}`),
        ...(plan.origin === 'checkout'
          ? [
              'They are not published at those versions yet. The release steps in this checkout’s ' +
                'CONTRIBUTING.md publish them: `pnpm version-packages`, then `pnpm publish:packages`.',
            ]
          : plan.packageRegistry === 'npmjs'
            ? [
                'A release reaches npmjs.com after GitHub Packages. Install from GitHub Packages ' +
                  'instead (`--registry github`), or install again once npmjs.com has it.',
              ]
            : []),
        ...(plan.packageRegistry === 'github'
          ? [
              `If they are published, the token cannot see them: it needs read:packages for ${SCOPE}.`,
            ]
          : []),
        'Then install:',
        install,
      ]
    default:
      return [
        `The app is written, and \`${command}\` failed. Its output is above. To retry:`,
        install,
      ]
  }
}

/** What `init` says about the agent files it wrote. */
const AGENT_FILES_LINE =
  '  AGENTS.md, the skills and the MCP entries tell an agent how to work; `polymorph agents` ' +
  'writes them again after an upgrade.'

/** One aligned row, as the other commands print them. */
const row = (label: string, value: string) => `  ${label.padEnd(11)}${value}`

export interface InitFlags {
  system?: string
  /** `react` (the default), `vue`, `svelte`, `solid`, `angular` or `elements`. */
  framework?: string
  /** For `elements`, the app's static directory, relative to the app (default `public`). */
  dir?: string
  /** `npmjs` or `github`: where the app installs the packages from. The origin's when omitted. */
  registry?: string
  install: boolean
  dryRun: boolean
}

interface InitCli {
  root: string
  source: string
  registry: Registry
  out: (line: string) => void
  programs?: InitPrograms
  /** A checkout when omitted. */
  origin?: Origin
}

/** `polymorph init <dir>`, from arguments to exit code. */
export function initCommand(cli: InitCli, items: string[], flags: InitFlags): { code: number } {
  const [given, ...extra] = items
  if (given === undefined || extra.length > 0) {
    cli.out('polymorph init: name one directory for the new app — `polymorph init my-app`')
    return { code: 1 }
  }
  if (!cli.programs) {
    cli.out(
      'polymorph init: needs the checkout’s MCP server and screen emitter — run it through ' +
        '`bin/polymorph.js`',
    )
    return { code: 1 }
  }

  const framework = flags.framework ?? 'react'
  if (!(FRAMEWORKS as readonly string[]).includes(framework)) {
    cli.out(`polymorph init: there is no framework called "${framework}" — ${KNOWN_FRAMEWORKS}`)
    return { code: 1 }
  }
  const origin = cli.origin ?? 'checkout'
  const packageRegistry = flags.registry ?? DEFAULT_REGISTRY[origin]
  if (!(PACKAGE_REGISTRIES as readonly string[]).includes(packageRegistry)) {
    cli.out(
      `polymorph init: there is no registry called "${packageRegistry}" — ` +
        `${PACKAGE_REGISTRIES.join(' or ')}`,
    )
    return { code: 1 }
  }

  const dir = resolve(cli.root, given)
  const refusal = refuseDirectory(dir, cli.source, cli.registry)
  if (refusal !== null) {
    cli.out(refusal)
    return { code: 1 }
  }
  if (framework === 'elements') {
    return initElements(cli, given, dir, flags, { programs: cli.programs, origin })
  }

  const setup: InstallSetup = {
    packageRegistry: packageRegistry as PackageRegistry,
    manager: packageManagerOf(process.env, origin),
    origin,
  }
  const plan = planInit(cli.registry, {
    dir,
    programs: cli.programs,
    framework: framework as Framework,
    origin,
    packageRegistry: setup.packageRegistry,
    manager: setup.manager,
    ...(flags.system === undefined ? {} : { system: flags.system }),
  })
  const fonts = plan.system.fonts.map((font) => font.family).join(', ')

  cli.out(`polymorph ${cli.registry.version} → ${given}`)
  const app = appOf(plan.framework)
  const named = app === null ? '' : ` (${app.name})`
  cli.out(row('app', `${plan.name}${named}`))
  cli.out(row('system', `${plan.system.name} + ${plan.palette} (${fonts})`))

  if (flags.dryRun) {
    for (const step of plan.steps) cli.out(`    ${step.path}`)
    if (flags.install) cli.out(row('then', installCommand(setup.manager)))
    return { code: 0 }
  }

  cli.out('')
  writeInit(dir, cli.source, plan, cli.programs, cli.out)
  cli.out('')

  const dev = PACKAGE_MANAGERS[setup.manager].dev
  if (!flags.install) {
    cli.out('Next: install, then start it.')
    cli.out(`  ${installLine(given, setup)} && ${dev}`)
    cli.out(AGENT_FILES_LINE)
    return { code: 0 }
  }

  const outcome = installApp(dir, process.env, cli.out, setup)
  if (outcome !== 'installed') {
    cli.out('')
    for (const line of installAdvice(outcome, given, cli.registry, plan.framework, setup)) {
      cli.out(line)
    }
    return { code: 1 }
  }

  cli.out('')
  cli.out(`Next: cd ${given} && ${dev}`)
  cli.out(AGENT_FILES_LINE)
  return { code: 0 }
}

/**
 * `polymorph init <dir> --framework elements`: a page with no build. It copies
 * the files the page loads the elements from, so the checkout must have built
 * them; a checkout that has not is told the command that does. Nothing is
 * installed, so there is no `pnpm install` to run.
 */
function initElements(
  cli: InitCli,
  given: string,
  dir: string,
  flags: InitFlags,
  { programs, origin }: { programs: InitPrograms; origin: Origin },
): { code: number } {
  const staticDir = flags.dir ?? ELEMENTS_STATIC_DIR
  if (escapes(staticDir)) {
    cli.out(new EscapingDirError(staticDir).message)
    return { code: 1 }
  }
  const { system } = pairingOf(cli.registry, flags.system)
  let plan: ReturnType<typeof planElementsInit>
  try {
    plan = planElementsInit(cli.registry, cli.source, {
      name: packageName(dir),
      system,
      staticDir,
      mcp: programs.mcp,
      tools: toolsOf(programs, cli.registry),
      origin,
    })
  } catch (error) {
    if (error instanceof NoBuildFilesError || error instanceof UnshippedPageError) {
      cli.out(error.message)
      return { code: 1 }
    }
    throw error
  }
  const fonts = plan.system.fonts.map((font) => font.family).join(', ')

  cli.out(`polymorph ${cli.registry.version} → ${given}`)
  cli.out(row('app', `${packageName(dir)} (elements, no build)`))
  cli.out(row('system', `${plan.system.name} + ${plan.palette} (${fonts})`))

  if (flags.dryRun) {
    for (const step of plan.steps) cli.out(`    ${step.path}`)
    return { code: 0 }
  }

  cli.out('')
  writeInit(
    dir,
    cli.source,
    { name: packageName(dir), framework: 'elements', ...plan },
    programs,
    cli.out,
  )
  cli.out('')
  cli.out(`Next: serve ${given}/${staticDir} with any static file server and open index.html.`)
  cli.out('  A module script does not load from a file:// URL, so the page needs a server.')
  cli.out(
    `  ${plan.system.name} names ${fonts}: link their stylesheets, or the page uses the ` +
      'fallback fonts.',
  )
  cli.out(AGENT_FILES_LINE)
  if (origin === 'published') {
    // A page has no package.json, so `npx` downloads the tools the first time a client starts
    // the server, which can take longer than the client waits.
    cli.out(
      '  The page installs no tools, so the MCP server downloads them the first time it starts. ' +
        'To have them ready before a client starts it, run once:',
    )
    cli.out(`  ${commandLine(toolsOf(programs, cli.registry))} --help`)
  }
  return { code: 0 }
}
