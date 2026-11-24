import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Linter } from 'eslint'
import * as rulesEntry from '@polymorph/rules/eslint'
import {
  buildRegistry,
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_VOCABULARY,
  PUBLISHED_NAMES,
  renderSystemCard,
  type Registry,
} from '@polymorph/registry'
import { emitCheckedScreen } from '@polymorph/spec'
import * as svelteParser from 'svelte-eslint-parser'
import { compile } from 'svelte/compiler'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import { applyPlan } from './apply'
import { run } from './cli'
import { eslintFragment, installedEslintFragment } from './emit'
import { planInit, type InitPlan } from './init'
import { SOLID_INIT, SOLID_RANGE, SOLID_TOOLING } from './init-solid'
import { SVELTE_INIT, SVELTE_RANGE, SVELTE_TOOLING } from './init-svelte'
import { readManifest } from './manifest'
import { planInstall } from './plan'
import { diffInstall } from './status'
import { installFramework, UnshippedMemberError } from './vue'

/**
 * `polymorph init --framework svelte|solid` and `polymorph add --framework
 * svelte|solid`, as `vue.test.ts` checks them for Vue.
 *
 * `init` is checked as data, by running the tools that read what it writes
 * (Svelte's compiler, TypeScript with Solid's JSX types, and the red rules
 * through the ESLint fragment the app gets), and end to end against the real
 * registry: the emitter runs and the app's tree is on disk, or nothing is.
 * `add` is checked against the registry's shells and this repository's trees:
 * the plan names files that exist, and applying it writes them. Installing
 * the packages an app names needs the published releases and a token, so
 * `pnpm install` is not run here.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
/** The checkout's programs, as its bin names them. */
const programs = {
  mcp: { command: 'node', args: [resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')] },
  emit: { command: process.execPath, args: [resolve(ROOT, 'packages/spec/bin/emit.js')] },
}

const FRAMEWORKS = ['svelte', 'solid'] as const
type Framework = (typeof FRAMEWORKS)[number]

const APPS = { svelte: SVELTE_INIT, solid: SOLID_INIT }
const RANGES = { svelte: { svelte: SVELTE_RANGE }, solid: { 'solid-js': SOLID_RANGE } }
const TOOLING = { svelte: SVELTE_TOOLING, solid: SOLID_TOOLING }
/** A member's file in each framework's tree. */
const EXTENSION = { svelte: '.svelte', solid: '.tsx' }
/** Each framework's fixture, beside its member. */
const FIXTURE = { svelte: '.states.svelte', solid: '.states.tsx' }

/** The registry with one member marked absent in a framework, with a reason. */
const without = (framework: Framework, name: string, reason: string): Registry => ({
  ...registry,
  components: registry.components.map((component) =>
    component.name === name
      ? {
          ...component,
          frameworks: { ...component.frameworks, [framework]: { status: 'absent', reason } },
        }
      : component,
  ),
})

const temporaries: string[] = []
const temporary = (prefix: string) => {
  const path = mkdtempSync(resolve(tmpdir(), `polymorph-fw-${prefix}-`))
  temporaries.push(path)
  return path
}
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/**
 * The ESLint config a fragment exports, its imports supplied here: the rules'
 * entry and the Svelte parser, as an app's `node_modules` would.
 */
function fragmentConfig(text: string): Linter.Config[] {
  const modules: Record<string, unknown> = {
    '@polymorph/rules/eslint': rulesEntry,
    'svelte-eslint-parser': svelteParser,
  }
  const body = text
    .replace(
      /^import (\w+)(?:, \{([^}]*)\})? from '([^']+)'$/gm,
      (_, name: string, named: string | undefined, from: string) =>
        `const ${name} = modules[${JSON.stringify(from)}].default ?? modules[${JSON.stringify(from)}]` +
        (named === undefined ? '' : `\nconst {${named}} = modules[${JSON.stringify(from)}]`),
    )
    .replace(/^export default /m, 'return ')
  return (new Function('modules', body) as (modules: unknown) => Linter.Config[])(modules)
}

/** The rules each file breaks under a config, by rule name. */
function lint(config: Linter.Config[], files: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(files).map(([path, code]) => {
      const messages = new Linter().verify(code, config, path)
      return [path, messages.map((message) => message.ruleId ?? `fatal: ${message.message}`)]
    }),
  )
}

/** Svelte's compiler, on a component: its error, or `null`. */
function svelteError(code: string, id: string): string | null {
  try {
    compile(code, { filename: `${id}.svelte`, generate: 'client' })
    return null
  } catch (error) {
    return String(error)
  }
}

/**
 * TypeScript on a Solid app's files, with the compiler options of the
 * tsconfig `init` writes and `@polymorph/solid-ui` read from this
 * repository's source: every error, by file.
 */
function solidTypeErrors(files: Record<string, string>): string[] {
  const base = resolve(import.meta.dirname, '__solid-app__')
  const virtual = new Map(Object.entries(files).map(([path, code]) => [resolve(base, path), code]))
  const written = JSON.parse(SOLID_INIT.tsconfig) as { compilerOptions: Record<string, unknown> }
  const { options } = ts.convertCompilerOptionsFromJson(written.compilerOptions, base)
  options.types = []
  options.paths = {
    [FRAMEWORK_VOCABULARY.solid]: [resolve(ROOT, 'packages/solid-ui/src/index.ts')],
  }
  const host = ts.createCompilerHost(options)
  const read = host.readFile.bind(host)
  const exists = host.fileExists.bind(host)
  const directory = host.directoryExists?.bind(host)
  const source = host.getSourceFile.bind(host)
  host.readFile = (file) => virtual.get(file) ?? read(file)
  host.fileExists = (file) => virtual.has(file) || exists(file)
  host.directoryExists = (path) => path.startsWith(base) || (directory?.(path) ?? true)
  host.getSourceFile = (file, language, ...rest) => {
    const text = virtual.get(file)
    return text === undefined
      ? source(file, language, ...rest)
      : ts.createSourceFile(file, text, language, true, ts.ScriptKind.TSX)
  }
  const program = ts.createProgram(
    [...virtual.keys(), resolve(ROOT, 'packages/solid-ui/src/css-modules.d.ts')],
    options,
    host,
  )
  return [...virtual.keys()].flatMap((file) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(file))
      .map(
        (diagnostic) =>
          `${file.slice(base.length + 1)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      ),
  )
}

const written = (plan: InitPlan, path: string): string => {
  const step = plan.steps.find((entry) => entry.path === path)
  if (step?.kind !== 'write') throw new Error(`the plan writes no ${path}`)
  return step.contents
}

describe.each(FRAMEWORKS)('polymorph init --framework %s', (framework) => {
  const app = APPS[framework]
  const plan = planInit(registry, { dir: `/somewhere/${framework}-app`, programs, framework })
  const manifest = JSON.parse(written(plan, 'package.json')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
    scripts: Record<string, string>
  }

  it('writes a Vite app with the framework’s plugin, entry and typecheck', () => {
    const paths = plan.steps.map((step) => step.path)
    for (const path of ['index.html', app.main.path, app.app.path, 'vite.config.ts']) {
      expect(paths, path).toContain(path)
    }
    expect(manifest.scripts['typecheck']).toBe(
      framework === 'svelte' ? 'svelte-check --tsconfig ./tsconfig.json' : 'tsc --noEmit',
    )
    const vite = written(plan, 'vite.config.ts')
    expect(vite).toContain(
      framework === 'svelte'
        ? "import { svelte } from '@sveltejs/vite-plugin-svelte'"
        : "import solid from 'vite-plugin-solid'",
    )
    expect(vite).toContain('polymorphTheme({')
    expect(written(plan, 'index.html')).toContain(`<script type="module" src="/${app.main.path}">`)
    expect(written(plan, app.main.path)).toMatch(
      /^\/\/ The theme first[^\n]*\nimport 'virtual:polymorph\/theme'/,
    )
  })

  it('installs the engine, the foundation and vocabulary, the rules and the framework, and no React', () => {
    const { dependencies, devDependencies } = manifest
    for (const [name, range] of Object.entries(RANGES[framework])) {
      expect(dependencies[name], name).toBe(range)
    }
    expect(dependencies['@polymorph/engine']).toMatch(/^npm:@metamorph-labs\/polymorph-engine@/)
    for (const name of [FRAMEWORK_FOUNDATION[framework], FRAMEWORK_VOCABULARY[framework]]) {
      // Ranged by the registry with the framework, at the packages' own version.
      const range = registry.vendor.frameworks[framework].packages[name]
      expect(range, name).toBe(
        `^${(JSON.parse(readFileSync(resolve(ROOT, name.replace('@polymorph/', 'packages/'), 'package.json'), 'utf8')) as { version: string }).version}`,
      )
      expect(dependencies[name], name).toBe(`npm:${PUBLISHED_NAMES[name]}@${range}`)
    }
    expect(devDependencies['@polymorph/rules']).toMatch(/^npm:@metamorph-labs\/polymorph-rules@/)
    for (const [tool, range] of Object.entries(TOOLING[framework])) {
      expect(devDependencies[tool], tool).toBe(range)
    }
    const everything = Object.keys({ ...dependencies, ...devDependencies })
    expect(everything.filter((name) => /react|vue/.test(name))).toEqual([])
  })

  it('takes the framework and its tools at the ranges this repository uses', () => {
    const root = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    for (const [name, range] of Object.entries({ ...RANGES[framework], ...TOOLING[framework] })) {
      const declared =
        root.devDependencies[name] ??
        (
          JSON.parse(
            readFileSync(resolve(ROOT, `packages/${framework}-ui/package.json`), 'utf8'),
          ) as {
            devDependencies: Record<string, string>
          }
        ).devDependencies[name]
      expect(range, name).toBe(declared)
    }
  })

  it('writes the framework’s ESLint fragment, system card and agent notes', () => {
    expect(written(plan, 'polymorph.eslint.js')).toBe(
      installedEslintFragment(plan.system.tokenValues, { framework }),
    )
    expect(written(plan, 'polymorph/system-card.md')).toBe(
      renderSystemCard(registry, { framework }),
    )
    const agents = written(plan, 'AGENTS.md')
    expect(agents).toContain(`\`${FRAMEWORK_VOCABULARY[framework]}\``)
    expect(agents).toContain(`framework: "${framework}"`)
    expect(agents).toContain('`render_screen`')
    expect(written(plan, '.mcp.json')).toContain('--project')
  })

  it('emits a welcome screen of members the framework ships, with the React inputs', () => {
    const react = planInit(registry, { dir: `/somewhere/${framework}-app`, programs })
    const spec = JSON.parse(written(plan, 'src/screens/welcome.json')) as {
      inputs: unknown
      root: { children: { component: string }[] }
    }
    expect(spec.inputs).toEqual(
      (JSON.parse(written(react, 'src/screens/welcome.json')) as { inputs: unknown }).inputs,
    )
    const components = spec.root.children.map((child) => child.component)
    expect(components).toEqual(['Heading', 'Text', 'Button'])
    for (const name of ['Stack', ...components]) {
      const member = registry.components.find((component) => component.name === name)
      expect(member?.frameworks[framework].status, name).toBe('native')
    }
    expect(plan.steps.find((step) => step.kind === 'emit')).toEqual({
      kind: 'emit',
      path: app.welcome,
      spec: 'src/screens/welcome.json',
      // A `.tsx` path is React's unless the step names Solid.
      ...(framework === 'solid' ? { framework } : {}),
    })
  })

  it('writes a container and a welcome screen that build and lint clean under the fragment', async () => {
    const spec = JSON.parse(written(plan, 'src/screens/welcome.json')) as Parameters<
      typeof emitCheckedScreen
    >[0]
    const welcome = await emitCheckedScreen(spec, { framework, registry })
    expect(welcome.fatal).toBeNull()
    expect(welcome.violations).toEqual([])

    const container = written(plan, app.app.path)
    if (framework === 'svelte') {
      expect(svelteError(container, 'app')).toBeNull()
      expect(svelteError(welcome.code, 'welcome')).toBeNull()
    } else {
      expect(
        solidTypeErrors({
          'src/main.tsx': written(plan, 'src/main.tsx'),
          'src/App.tsx': container,
          'src/screens/Welcome.tsx': welcome.code,
        }),
      ).toEqual([])
    }

    const config = fragmentConfig(written(plan, 'polymorph.eslint.js'))
    expect(
      lint(config, {
        [app.app.path]: container,
        [app.welcome]: welcome.code,
        [app.main.path]: written(plan, app.main.path),
      }),
    ).toEqual({ [app.app.path]: [], [app.welcome]: [], [app.main.path]: [] })
  })

  it('writes a fragment whose rules read the framework’s code', () => {
    const config = fragmentConfig(written(plan, 'polymorph.eslint.js'))
    const [path, broken] =
      framework === 'svelte'
        ? [
            'src/Broken.svelte',
            `<script lang="ts">\nimport { Button } from '${FRAMEWORK_VOCABULARY.svelte}'\n</script>\n\n<Button class="wide" label="Go" />\n<button>Go</button>\n\n<style>\n.a { gap: 12px; }\n</style>\n`,
          ]
        : [
            'src/Broken.tsx',
            `import { Button } from '${FRAMEWORK_VOCABULARY.solid}'\n\nexport const Broken = () => (\n  <>\n    <Button class="wide" label="Go" />\n    <div class="row" onclick={() => undefined} />\n  </>\n)\n`,
          ]
    expect(lint(config, { [path]: broken })[path]?.sort()).toEqual(
      framework === 'svelte'
        ? ['polymorph/no-app-css', 'polymorph/no-raw-interactive', 'polymorph/no-raw-styles']
        : ['polymorph/no-raw-interactive', 'polymorph/no-raw-styles', 'polymorph/no-raw-styles'],
    )
  })

  it('writes the whole app, its emitted welcome screen included', () => {
    const scratch = temporary('init')
    const lines: string[] = []
    const cli = {
      root: scratch,
      source: ROOT,
      registry,
      out: (line: string) => lines.push(line),
      programs,
    }
    const outcome = run(cli, ['init', 'app', '--framework', framework, '--no-install'])
    expect(outcome.code, lines.join('\n')).toBe(0)
    const root = resolve(scratch, 'app')
    for (const step of plan.steps)
      expect(existsSync(resolve(root, step.path)), step.path).toBe(true)
    const welcome = readFileSync(resolve(root, app.welcome), 'utf8')
    expect(welcome).toContain(`from '${FRAMEWORK_VOCABULARY[framework]}'`)
    if (framework === 'svelte') expect(svelteError(welcome, 'welcome')).toBeNull()
    else expect(welcome).toContain('export function Welcome(props: WelcomeProps)')
  }, 120_000)

  it('writes nothing when the welcome screen names a member absent in the framework', () => {
    const scratch = temporary('init')
    const lines: string[] = []
    const cli = {
      root: scratch,
      source: ROOT,
      registry: without(framework, 'Heading', 'no Heading shell'),
      out: (line: string) => lines.push(line),
      programs,
    }
    expect(run(cli, ['init', 'app', '--framework', framework, '--no-install']).code).toBe(1)
    expect(lines.join('\n')).toContain('Heading: no Heading shell')
    expect(lines.join('\n')).toContain('nothing was written')
    expect(readdirSync(scratch)).toEqual([])
  })

  it('lists the app on a dry run', () => {
    const scratch = temporary('init')
    const lines: string[] = []
    const cli = {
      root: scratch,
      source: ROOT,
      registry,
      out: (line: string) => lines.push(line),
      programs,
    }
    expect(run(cli, ['init', 'dry', '--framework', framework, '--dry-run']).code).toBe(0)
    expect(lines.join('\n')).toContain(`dry (${app.name})`)
    expect(lines.join('\n')).toContain(app.welcome)
  })
})

describe.each(FRAMEWORKS)('polymorph add --framework %s', (framework) => {
  const plan = planInstall(registry, ['tabs', 'avatar', 'menu', 'density-scope'], { framework })
  const tree = registry.vendor.frameworks[framework].root
  const file = (dir: string, name: string) => `${tree}/${dir}/${name}${EXTENSION[framework]}`
  const from = plan.files.map((entry) => entry.from)
  const to = plan.files.map((entry) => entry.to)

  it('vendors each member’s component, the compound parts its index attaches, and its fixture', () => {
    expect(plan.framework).toBe(framework)
    expect(from).toEqual(
      expect.arrayContaining([
        file('overlays', 'Tabs'),
        file('overlays', 'TabsContent'),
        `${tree}/overlays/tabs${FIXTURE[framework]}`,
        file('structure', 'Avatar'),
        file('structure', 'AvatarGroup'),
        file('overlays', 'Menu'),
        file('overlays', 'MenuSubmenu'),
        file('exceptions', 'DensityScope'),
        'packages/recipes/src/overlays/tabs.module.css',
        `${tree}/css-modules.d.ts`,
      ]),
    )
    expect(plan.components).toEqual(expect.arrayContaining(['Badge']))
    expect(
      from.filter(
        (entry) => !entry.startsWith(`${tree}/`) && !entry.startsWith('packages/recipes/'),
      ),
    ).toEqual([])
    // A recipe lands beside its member, as in a React install.
    expect(to).toContain(`src/polymorph/overlays/Tabs${EXTENSION[framework]}`)
    expect(to).toContain('src/polymorph/overlays/tabs.module.css')
    expect(plan.base?.from).toBe(registry.vendor.base)
  })

  it('names only files this repository’s tree has, for every member the framework ships', () => {
    const natives = [...registry.components, ...registry.exceptions.primitives]
      .filter((member) => member.frameworks[framework].status === 'native')
      .map((member) => member.name)
    const every = planInstall(registry, natives, { framework })
    expect(every.files.length).toBeGreaterThan(60)
    for (const entry of every.files)
      expect(existsSync(resolve(ROOT, entry.from)), entry.from).toBe(true)
  })

  it('depends on the foundation, the machines and the parser it lints with, and no React package', () => {
    expect(Object.keys(plan.packages)).toEqual(
      expect.arrayContaining([
        '@polymorph/engine',
        FRAMEWORK_FOUNDATION[framework],
        '@zag-js/tabs',
        `@zag-js/${framework}`,
      ]),
    )
    expect(Object.keys(plan.packages).filter((name) => /react|vue/.test(name))).toEqual([])
    expect(plan.packages[FRAMEWORK_VOCABULARY[framework]]).toBeUndefined()
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
      ...(framework === 'svelte'
        ? { 'svelte-eslint-parser': SVELTE_TOOLING['svelte-eslint-parser'] }
        : {}),
    })
  })

  it('reads Icon as the foundation’s, with nothing to vendor', () => {
    const icon = planInstall(registry, ['icon'], { framework })
    expect(icon.files).toEqual([])
    expect(icon.notes).toEqual([
      `Icon ships inside ${FRAMEWORK_FOUNDATION[framework]} — import it, there is nothing to vendor`,
    ])
  })

  it('refuses a member the map marks absent, with its reason', () => {
    const missing = without(framework, 'Button', 'no Button shell')
    expect(() => planInstall(missing, ['button'], { framework })).toThrow(
      new UnshippedMemberError('Button', framework, 'no Button shell'),
    )
    expect(() => planInstall(missing, ['button'])).not.toThrow()
  })

  it('writes the plan from this repository’s tree, rewriting a recipe import', () => {
    const app = temporary('app')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const result = applyPlan(app, ROOT, registry, plan)
    expect(result.written).toEqual(
      expect.arrayContaining([
        `src/polymorph/overlays/Tabs${EXTENSION[framework]}`,
        `src/polymorph/overlays/TabsContent${EXTENSION[framework]}`,
        `src/polymorph/structure/AvatarGroup${EXTENSION[framework]}`,
      ]),
    )
    const tabs = readFileSync(
      resolve(app, `src/polymorph/overlays/Tabs${EXTENSION[framework]}`),
      'utf8',
    )
    expect(tabs).toContain("import styles from './tabs.module.css'")
    expect(tabs).not.toContain('@polymorph/recipes')

    expect(readManifest(app)?.framework).toBe(framework)
    const fragment = readFileSync(resolve(app, 'polymorph.eslint.js'), 'utf8')
    expect(fragment.replace(/const VALUES = [\s\S]*?\n\n/, '')).toBe(
      eslintFragment('src/polymorph', {}, { framework }).replace(/const VALUES = [\s\S]*?\n\n/, ''),
    )

    // `diff` re-plans from the manifest, so the files read as unchanged.
    const report = diffInstall(app, ROOT, registry)
    expect(
      report.files.filter((entry) => entry.state !== 'clean' && entry.state !== 'generated'),
    ).toEqual([])
  })

  it('stays in the framework its manifest records', () => {
    expect(installFramework(framework, undefined)).toBe(framework)
    const app = temporary('stay')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const lines: string[] = []
    const cli = { root: app, source: ROOT, registry, out: (line: string) => lines.push(line) }
    expect(run(cli, ['add', 'button', '--framework', framework]).code).toBe(0)
    expect(run(cli, ['add', 'badge']).code).toBe(0)
    expect(readManifest(app)?.framework).toBe(framework)
    expect(existsSync(resolve(app, `src/polymorph/structure/Badge${EXTENSION[framework]}`))).toBe(
      true,
    )
    lines.length = 0
    expect(run(cli, ['add', 'card', '--framework', 'vue']).code).toBe(1)
    expect(lines.join('\n')).toContain(`this install vendors ${framework} members`)
  })
})

describe('an install writes the ranges of its own framework', () => {
  /** The dependencies `polymorph add tabs --framework <framework>` writes into a new app. */
  const added = (framework: 'solid' | 'vue', from: Registry = registry): Record<string, string> => {
    const app = temporary(`ranges-${framework}`)
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const lines: string[] = []
    const cli = { root: app, source: ROOT, registry: from, out: (line: string) => lines.push(line) }
    expect(run(cli, ['add', 'tabs', '--framework', framework]).code, lines.join('\n')).toBe(0)
    return (
      JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }
    ).dependencies
  }

  it('pins a Solid install’s Zag machines to the foundation’s core, and gives a Vue one the caret range', () => {
    // Every vocabulary but React's imports `@zag-js/tabs`. The Solid foundation interprets each
    // machine with its own `@zag-js/core`, pinned exactly, so a Solid install takes the machine
    // at that version, while the Vue vocabulary declares a caret range.
    const foundation = JSON.parse(
      readFileSync(resolve(ROOT, 'packages/solid/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const core = foundation.dependencies['@zag-js/core'] ?? ''
    expect(core).toMatch(/^\d+\.\d+\.\d+$/)

    const solid = added('solid')
    expect(solid['@zag-js/tabs']).toBe(core)
    expect(solid['@zag-js/solid']).toBe(core)

    const vue = added('vue')
    expect(vue['@zag-js/tabs']).toMatch(/^\^\d/)
    expect(vue['@zag-js/tabs']).toBe(registry.vendor.frameworks.vue.packages['@zag-js/tabs'])
    expect(vue['@zag-js/vue']).toMatch(/^\^\d/)
  })

  it('refuses a package its framework does not range, instead of taking another framework’s range', () => {
    const { ['@zag-js/tabs']: _tabs, ...rest } = registry.vendor.frameworks.solid.packages
    const lacking: Registry = {
      ...registry,
      packages: { ...registry.packages, '@zag-js/tabs': '^1.46.0' },
      vendor: {
        ...registry.vendor,
        frameworks: {
          ...registry.vendor.frameworks,
          solid: { ...registry.vendor.frameworks.solid, packages: rest },
        },
      },
    }
    expect(() => planInstall(lacking, ['tabs'], { framework: 'solid' })).toThrow(
      'polymorph: the registry has no version range for @zag-js/tabs in solid — it cannot be ' +
        'installed',
    )
    expect(planInstall(lacking, ['tabs'], { framework: 'vue' }).packages['@zag-js/tabs']).toBe(
      registry.vendor.frameworks.vue.packages['@zag-js/tabs'],
    )
  })
})
