import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Linter } from 'eslint'
import { allRules, parser, plugin, PLUGIN_NAME } from '@polymorph/rules/eslint'
import {
  buildRegistry,
  PUBLISHED_NAMES,
  renderSystemCard,
  type Registry,
} from '@polymorph/registry'
import { emitCheckedScreen } from '@polymorph/spec'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import vueParser from 'vue-eslint-parser'
import { afterAll, describe, expect, it } from 'vitest'

import { applyPlan } from './apply'
import { run } from './cli'
import { eslintFragment, installedEslintFragment } from './emit'
import { planInit, type InitPlan } from './init'
import { VUE_RANGE, VUE_TOOLING } from './init-vue'
import { readManifest } from './manifest'
import { planInstall } from './plan'
import { diffInstall } from './status'
import { FrameworkMismatchError, installFramework, UnshippedMemberError } from './vue'

/**
 * `polymorph init --framework vue` and `polymorph add --framework vue`.
 *
 * `init` is checked as data, by running the tools that read what it writes
 * (Vue's compiler, the red rules through the ESLint fragment the app gets),
 * and end to end against the real registry: the emitter runs and the app's
 * tree is on disk, or nothing is. `add` is checked against the registry's Vue
 * shells and this repository's Vue tree: the plan names files that exist, and
 * applying it writes them. Installing the packages a Vue app names needs the
 * published releases and a token, so `pnpm install` is not run here.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
/** The checkout's programs, as its bin names them. */
const programs = {
  mcp: { command: 'node', args: [resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')] },
  emit: { command: process.execPath, args: [resolve(ROOT, 'packages/spec/bin/emit.js')] },
}

/** The registry with one member marked absent in Vue, with a reason. */
const without = (name: string, reason = 'no Vue shell'): Registry => ({
  ...registry,
  components: registry.components.map((component) =>
    component.name === name
      ? {
          ...component,
          frameworks: { ...component.frameworks, vue: { status: 'absent', reason } },
        }
      : component,
  ),
})

const temporaries: string[] = []
const temporary = (prefix: string) => {
  const path = mkdtempSync(resolve(tmpdir(), `polymorph-vue-${prefix}-`))
  temporaries.push(path)
  return path
}
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** The ESLint config a fragment exports, with its two imports supplied here. */
function fragmentConfig(text: string): Linter.Config[] {
  const body = text
    .replace(
      /^import plugin, \{[^}]*\} from '@polymorph\/rules\/eslint'$/m,
      'const { plugin, allRules, parser, PLUGIN_NAME, fixableRawControls } = rules',
    )
    .replace(/^import vueParser from 'vue-eslint-parser'$/m, 'const vueParser = vue')
    .replace(/^export default /m, 'return ')
  const make = new Function('rules', 'vue', body) as (
    rules: unknown,
    vue: unknown,
  ) => Linter.Config[]
  return make({ plugin, allRules, parser, PLUGIN_NAME, fixableRawControls: {} }, vueParser)
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

function compileErrors(code: string, id: string): string[] {
  const { descriptor, errors } = parse(code, { filename: `${id}.vue` })
  if (errors.length > 0) return errors.map(String)
  const script = compileScript(descriptor, { id })
  return compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: `${id}.vue`,
    id,
    compilerOptions: { bindingMetadata: script.bindings, expressionPlugins: ['typescript'] },
  }).errors.map(String)
}

const written = (plan: InitPlan, path: string): string => {
  const step = plan.steps.find((entry) => entry.path === path)
  if (step?.kind !== 'write') throw new Error(`the plan writes no ${path}`)
  return step.contents
}

describe('polymorph init --framework vue', () => {
  const plan = planInit(registry, { dir: '/somewhere/vue-app', programs, framework: 'vue' })
  const manifest = JSON.parse(written(plan, 'package.json')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
    scripts: Record<string, string>
  }

  it('writes a Vite and Vue app, typechecked by vue-tsc', () => {
    const paths = plan.steps.map((step) => step.path)
    for (const path of ['index.html', 'src/main.ts', 'src/App.vue', 'vite.config.ts']) {
      expect(paths, path).toContain(path)
    }
    for (const path of ['src/main.tsx', 'src/App.tsx', 'src/screens/Welcome.tsx']) {
      expect(paths, path).not.toContain(path)
    }
    expect(manifest.scripts['typecheck']).toBe('vue-tsc --noEmit')
    expect(written(plan, 'vite.config.ts')).toContain("import vue from '@vitejs/plugin-vue'")
    expect(written(plan, 'vite.config.ts')).toContain('polymorphTheme({')
    expect(written(plan, 'index.html')).toContain('<script type="module" src="/src/main.ts">')
    expect(written(plan, 'src/main.ts')).toContain("import 'virtual:polymorph/theme'")
  })

  it('installs the engine, the Vue foundation and vocabulary, the rules and Vue, and no React', () => {
    const { dependencies, devDependencies } = manifest
    expect(dependencies['vue']).toBe(VUE_RANGE)
    expect(dependencies['@polymorph/engine']).toMatch(/^npm:@metamorph-labs\/polymorph-engine@/)
    for (const name of ['@polymorph/vue', '@polymorph/vue-ui']) {
      // Ranged by the registry with Vue, at the Vue packages' own version.
      const range = registry.vendor.frameworks.vue.packages[name]
      expect(range, name).toBe(
        `^${(JSON.parse(readFileSync(resolve(ROOT, name.replace('@polymorph/', 'packages/'), 'package.json'), 'utf8')) as { version: string }).version}`,
      )
      expect(dependencies[name], name).toBe(`npm:${PUBLISHED_NAMES[name]}@${range}`)
    }
    expect(devDependencies['@polymorph/rules']).toMatch(/^npm:@metamorph-labs\/polymorph-rules@/)
    for (const [tool, range] of Object.entries(VUE_TOOLING)) {
      expect(devDependencies[tool], tool).toBe(range)
    }
    const everything = Object.keys({ ...dependencies, ...devDependencies })
    expect(everything.filter((name) => /react/.test(name))).toEqual([])
  })

  it('takes Vue and its lint parser at the ranges this repository uses', () => {
    const root = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    expect(VUE_RANGE).toBe(root.devDependencies['vue'])
    expect(VUE_TOOLING['vue-eslint-parser']).toBe(root.devDependencies['vue-eslint-parser'])
  })

  it('writes the Vue ESLint fragment, the Vue system card and agent notes that say Vue', () => {
    expect(written(plan, 'polymorph.eslint.js')).toBe(
      installedEslintFragment(plan.system.tokenValues, { framework: 'vue' }),
    )
    expect(written(plan, 'polymorph/system-card.md')).toBe(
      renderSystemCard(registry, { framework: 'vue' }),
    )
    const agents = written(plan, 'AGENTS.md')
    expect(agents).toContain('`@polymorph/vue-ui`')
    expect(agents).toContain('`<style>` blocks')
    expect(agents).toContain('`render_screen`')
    expect(written(plan, '.mcp.json')).toContain('--project')
  })

  it('emits a welcome screen of members the Vue vocabulary ships, with the React inputs', () => {
    const react = planInit(registry, { dir: '/somewhere/vue-app', programs })
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
      expect(member?.frameworks.vue.status, name).toBe('native')
    }
    const emit = plan.steps.find((step) => step.kind === 'emit')
    expect(emit).toEqual({
      kind: 'emit',
      path: 'src/screens/Welcome.vue',
      spec: 'src/screens/welcome.json',
    })
  })

  it('writes a container and a welcome screen that compile and lint clean under the fragment', async () => {
    const spec = JSON.parse(written(plan, 'src/screens/welcome.json')) as Parameters<
      typeof emitCheckedScreen
    >[0]
    const welcome = await emitCheckedScreen(spec, { framework: 'vue', registry })
    expect(welcome.fatal).toBeNull()
    expect(welcome.violations).toEqual([])

    const app = written(plan, 'src/App.vue')
    expect(compileErrors(app, 'app')).toEqual([])
    expect(compileErrors(welcome.code, 'welcome')).toEqual([])

    const config = fragmentConfig(written(plan, 'polymorph.eslint.js'))
    expect(
      lint(config, {
        'src/App.vue': app,
        'src/screens/Welcome.vue': welcome.code,
        'src/main.ts': written(plan, 'src/main.ts'),
      }),
    ).toEqual({ 'src/App.vue': [], 'src/screens/Welcome.vue': [], 'src/main.ts': [] })
  })

  it('writes a fragment whose rules read a Vue template', () => {
    const config = fragmentConfig(written(plan, 'polymorph.eslint.js'))
    const broken = `<script setup lang="ts">\nimport { Button } from '@polymorph/vue-ui'\n</script>\n\n<template>\n  <Button class="wide" label="Go" />\n  <button>Go</button>\n</template>\n\n<style>\n.a { gap: 12px; }\n</style>\n`
    expect(lint(config, { 'src/Broken.vue': broken })).toEqual({
      'src/Broken.vue': [
        'polymorph/no-raw-styles',
        'polymorph/no-raw-interactive',
        'polymorph/no-app-css',
      ],
    })
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
    const outcome = run(cli, ['init', 'app', '--framework', 'vue', '--no-install'])
    expect(outcome.code, lines.join('\n')).toBe(0)
    const app = resolve(scratch, 'app')
    for (const step of plan.steps) expect(existsSync(resolve(app, step.path)), step.path).toBe(true)
    const welcome = readFileSync(resolve(app, 'src/screens/Welcome.vue'), 'utf8')
    expect(welcome).toContain("from '@polymorph/vue-ui'")
    expect(compileErrors(welcome, 'welcome')).toEqual([])
  }, 120_000)

  it('writes nothing when the welcome screen names a member absent in Vue', () => {
    const scratch = temporary('init')
    const lines: string[] = []
    const cli = {
      root: scratch,
      source: ROOT,
      registry: without('Heading', 'no Heading shell'),
      out: (line: string) => lines.push(line),
      programs,
    }
    expect(run(cli, ['init', 'app', '--framework', 'vue', '--no-install']).code).toBe(1)
    expect(lines.join('\n')).toContain('Heading: no Heading shell')
    expect(lines.join('\n')).toContain('nothing was written')
    expect(existsSync(resolve(scratch, 'app'))).toBe(false)
    expect(readdirSync(scratch)).toEqual([])
    // The React app's welcome screen does not name Heading, so React is unaffected.
    lines.length = 0
    expect(run(cli, ['init', 'react-app', '--dry-run', '--no-install']).code).toBe(0)
  })

  it('lists the Vue app on a dry run, and refuses a framework it does not know', () => {
    const scratch = temporary('init')
    const lines: string[] = []
    const cli = {
      root: scratch,
      source: ROOT,
      registry,
      out: (line: string) => lines.push(line),
      programs,
    }
    expect(run(cli, ['init', 'dry', '--framework', 'vue', '--dry-run']).code).toBe(0)
    expect(lines.join('\n')).toContain('dry (Vue)')
    expect(lines.join('\n')).toContain('src/screens/Welcome.vue')
    lines.length = 0
    expect(run(cli, ['init', 'nope', '--framework', 'imaginary']).code).toBe(1)
    expect(lines.join('\n')).toContain('no framework called "imaginary"')
  })
})

describe('polymorph add --framework vue', () => {
  const plan = planInstall(registry, ['tabs', 'avatar', 'menu', 'density-scope'], {
    framework: 'vue',
  })
  const from = plan.files.map((file) => file.from)
  const to = plan.files.map((file) => file.to)

  it('vendors each member’s component, the compound parts its index attaches, and its fixture', () => {
    expect(plan.framework).toBe('vue')
    expect(from).toEqual(
      expect.arrayContaining([
        'packages/vue-ui/src/overlays/Tabs.vue',
        'packages/vue-ui/src/overlays/TabsContent.vue',
        'packages/vue-ui/src/overlays/tabs.states.ts',
        'packages/vue-ui/src/structure/Avatar.vue',
        'packages/vue-ui/src/structure/AvatarGroup.vue',
        'packages/vue-ui/src/overlays/Menu.vue',
        'packages/vue-ui/src/overlays/MenuSubmenu.vue',
        'packages/vue-ui/src/exceptions/DensityScope.vue',
        'packages/recipes/src/overlays/tabs.module.css',
        'packages/vue-ui/src/css-modules.d.ts',
      ]),
    )
    // Each Vue member is its own file, so ToneScope does not come with DensityScope.
    expect(from).not.toContain('packages/vue-ui/src/exceptions/ToneScope.vue')
    // A member a Vue member composes comes along, read from the Vue tree.
    expect(plan.components).toEqual(expect.arrayContaining(['Badge', 'Kbd']))
    expect(from.filter((file) => file.startsWith('packages/react-ui/'))).toEqual([])
    // A recipe lands beside its member, as in a React install.
    expect(to).toContain('src/polymorph/overlays/Tabs.vue')
    expect(to).toContain('src/polymorph/overlays/tabs.module.css')
    expect(plan.base?.from).toBe(registry.vendor.base)
  })

  it('names only files this repository’s Vue tree has, for every member Vue ships', () => {
    const natives = [...registry.components, ...registry.exceptions.primitives]
      .filter((member) => member.frameworks.vue.status === 'native')
      .map((member) => member.name)
    const every = planInstall(registry, natives, { framework: 'vue' })
    expect(every.files.length).toBeGreaterThan(60)
    for (const file of every.files)
      expect(existsSync(resolve(ROOT, file.from)), file.from).toBe(true)
  })

  it('depends on the Vue foundation, the machines and the Vue parser, and no React package', () => {
    expect(Object.keys(plan.packages)).toEqual(
      expect.arrayContaining([
        '@polymorph/engine',
        '@polymorph/vue',
        '@zag-js/tabs',
        '@zag-js/vue',
      ]),
    )
    expect(Object.keys(plan.packages).filter((name) => /react/.test(name))).toEqual([])
    expect(plan.packages['@polymorph/vue-ui']).toBeUndefined()
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
      'vue-eslint-parser': VUE_TOOLING['vue-eslint-parser'],
    })
    // A React install is unchanged: no Vue package, no Vue parser.
    const react = planInstall(registry, ['tabs'])
    expect(Object.keys(react.packages).filter((name) => /vue/.test(name))).toEqual([])
    expect(Object.keys(react.devPackages)).toEqual(['@polymorph/rules'])
  })

  it('reads Icon as the Vue foundation’s, with nothing to vendor', () => {
    const icon = planInstall(registry, ['icon'], { framework: 'vue' })
    expect(icon.files).toEqual([])
    expect(icon.notes).toEqual([
      'Icon ships inside @polymorph/vue — import it, there is nothing to vendor',
    ])
    expect(icon.packages).toEqual({
      '@polymorph/vue': registry.vendor.frameworks.vue.packages['@polymorph/vue'],
    })
  })

  it('refuses a member with no Vue shell, with the map’s reason', () => {
    const pageHeader = registry.components.find((component) => component.name === 'PageHeader')
    if (pageHeader?.frameworks.vue.status === 'absent') {
      expect(() => planInstall(registry, ['page-header'], { framework: 'vue' })).toThrow(
        new UnshippedMemberError('PageHeader', 'vue', pageHeader.frameworks.vue.reason),
      )
    }
    const missing = without('Button', 'no Button shell')
    expect(() => planInstall(missing, ['button'], { framework: 'vue' })).toThrow(
      new UnshippedMemberError('Button', 'vue', 'no Button shell'),
    )
    expect(() => planInstall(missing, ['button'])).not.toThrow()
  })

  it('refuses a member whose Vue install would bring a member the map marks absent', () => {
    // Only a registry that broke the framework map's composition clause can: here
    // Badge is marked absent and still publishes the files that declare it.
    const broken: Registry = {
      ...registry,
      components: registry.components.map((component) =>
        component.name === 'Badge'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                vue: { ...component.frameworks.vue, status: 'absent', reason: 'no Vue shell' },
              },
            }
          : component,
      ),
    }
    expect(() => planInstall(broken, ['tabs'], { framework: 'vue' })).toThrow(
      new UnshippedMemberError('Badge', 'vue', 'no Vue shell'),
    )
  })

  it('writes the plan from this repository’s Vue tree, rewriting a recipe import', () => {
    const app = temporary('app')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const result = applyPlan(app, ROOT, registry, plan)
    expect(result.written).toEqual(
      expect.arrayContaining([
        'src/polymorph/overlays/Tabs.vue',
        'src/polymorph/overlays/TabsContent.vue',
        'src/polymorph/structure/AvatarGroup.vue',
        'src/polymorph/overlays/MenuSubmenu.vue',
      ]),
    )
    const tabs = readFileSync(resolve(app, 'src/polymorph/overlays/Tabs.vue'), 'utf8')
    expect(tabs).toContain("import styles from './tabs.module.css'")
    expect(tabs).not.toContain('@polymorph/recipes')

    expect(readManifest(app)?.framework).toBe('vue')
    const fragment = readFileSync(resolve(app, 'polymorph.eslint.js'), 'utf8')
    expect(fragment).toContain("import vueParser from 'vue-eslint-parser'")
    expect(fragment).toContain("const VENDORED = 'src/polymorph/**/*.{ts,tsx,vue}'")
    expect(fragment.replace(/const VALUES = [\s\S]*?\n\n/, '')).toBe(
      eslintFragment('src/polymorph', {}, { framework: 'vue' }).replace(
        /const VALUES = [\s\S]*?\n\n/,
        '',
      ),
    )
    const manifest = JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(manifest.dependencies['@zag-js/tabs']).toBe(
      registry.vendor.frameworks.vue.packages['@zag-js/tabs'],
    )
    expect(manifest.devDependencies['vue-eslint-parser']).toBe(VUE_TOOLING['vue-eslint-parser'])

    // `diff` re-plans from the manifest, so the Vue files read as unchanged.
    const report = diffInstall(app, ROOT, registry)
    expect(
      report.files.filter((file) => file.state !== 'clean' && file.state !== 'generated'),
    ).toEqual([])
  })
})

describe('an install stays in its framework', () => {
  it('reads the framework from the manifest, and refuses another', () => {
    expect(installFramework(null, undefined)).toBe('react')
    expect(installFramework(null, 'vue')).toBe('vue')
    expect(installFramework('vue', undefined)).toBe('vue')
    expect(installFramework(undefined, undefined)).toBe('react')
    expect(() => installFramework('vue', 'react')).toThrow(FrameworkMismatchError)
    expect(() => installFramework(undefined, 'vue')).toThrow(FrameworkMismatchError)
  })

  it('adds to a Vue install in Vue without the flag, and refuses React', () => {
    const app = temporary('stay')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const lines: string[] = []
    const cli = { root: app, source: ROOT, registry, out: (line: string) => lines.push(line) }
    expect(run(cli, ['add', 'button', '--framework', 'vue']).code).toBe(0)
    expect(run(cli, ['add', 'theme:pastel']).code).toBe(0)
    expect(readManifest(app)?.framework).toBe('vue')
    expect(readFileSync(resolve(app, 'polymorph.eslint.js'), 'utf8')).toContain('vue-eslint-parser')
    expect(run(cli, ['add', 'badge']).code).toBe(0)
    expect(existsSync(resolve(app, 'src/polymorph/structure/Badge.vue'))).toBe(true)
    lines.length = 0
    expect(run(cli, ['add', 'card', '--framework', 'react']).code).toBe(1)
    expect(lines.join('\n')).toContain('this install vendors vue members')
    expect(existsSync(resolve(app, 'src/polymorph/structure/Card.tsx'))).toBe(false)
  })

  it('refuses Vue in a React install, and leaves its manifest as it was', () => {
    const app = temporary('stay')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const lines: string[] = []
    const cli = { root: app, source: ROOT, registry, out: (line: string) => lines.push(line) }
    expect(run(cli, ['add', 'button']).code).toBe(0)
    const before = readFileSync(resolve(app, 'polymorph.json'), 'utf8')
    expect(run(cli, ['add', 'theme:pastel', '--framework', 'vue']).code).toBe(1)
    expect(lines.join('\n')).toContain('this install vendors react members')
    expect(readFileSync(resolve(app, 'polymorph.json'), 'utf8')).toBe(before)
    expect(run(cli, ['add', 'card', '--framework', 'imaginary']).code).toBe(1)
    expect(lines.join('\n')).toContain('no framework called "imaginary"')
  })
})
