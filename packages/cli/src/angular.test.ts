import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import * as angularTemplate from '@angular-eslint/eslint-plugin-template'
import * as templateParser from '@angular-eslint/template-parser'
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
import { afterAll, describe, expect, it } from 'vitest'

import { applyPlan } from './apply'
import { run } from './cli'
import { eslintFragment, installedEslintFragment } from './emit'
import { planInit, type InitPlan } from './init'
import { ANGULAR_FRAMEWORK, ANGULAR_INIT, ANGULAR_RANGE, ANGULAR_TOOLING } from './init-angular'
import { readManifest } from './manifest'
import { planInstall } from './plan'
import { diffInstall } from './status'
import { installFramework, UnshippedMemberError } from './vue'

/**
 * `polymorph init --framework angular` and `polymorph add --framework
 * angular`, as `frameworks.test.ts` checks them for Svelte and Solid.
 *
 * `init` is checked as data, by running the tools that read what it writes
 * (Angular's compiler on the container, the entry and the emitted welcome
 * screen, and the red rules through the ESLint fragment the app gets), and end
 * to end against the real registry: the emitter runs and the app's tree is on
 * disk, or nothing is. `add` is checked against the registry's Angular shells
 * and this repository's Angular tree. Installing the packages an app names
 * needs the published releases and a token, so `pnpm install` is not run here.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const VOCABULARY = resolve(ROOT, 'packages/angular-ui')
const registry: Registry = buildRegistry(ROOT)
/** The checkout's programs, as its bin names them. */
const programs = {
  mcp: { command: 'node', args: [resolve(ROOT, 'packages/mcp/bin/polymorph-mcp.js')] },
  emit: { command: process.execPath, args: [resolve(ROOT, 'packages/spec/bin/emit.js')] },
}

/** The registry with one member marked absent in Angular, with a reason. */
const without = (name: string, reason: string): Registry => ({
  ...registry,
  components: registry.components.map((component) =>
    component.name === name
      ? {
          ...component,
          frameworks: { ...component.frameworks, angular: { status: 'absent', reason } },
        }
      : component,
  ),
})

const temporaries: string[] = []
const temporary = (prefix: string) => {
  const path = mkdtempSync(resolve(tmpdir(), `polymorph-ng-${prefix}-`))
  temporaries.push(path)
  return path
}
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/**
 * The ESLint config a fragment exports, its imports supplied here: the rules'
 * entry, the template processor and the template parser, as an app's
 * `node_modules` would.
 */
function fragmentConfig(text: string): Linter.Config[] {
  const modules: Record<string, unknown> = {
    '@polymorph/rules/eslint': rulesEntry,
    '@angular-eslint/eslint-plugin-template': angularTemplate,
    '@angular-eslint/template-parser': templateParser,
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

/**
 * The rules each file breaks under a config, by rule name. `Linter` lints the
 * blocks a processor extracts only when it is told which: here, the templates.
 * ESLint itself, which an app runs, lints every block a config matches.
 */
function lint(config: Linter.Config[], files: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(files).map(([path, code]) => {
      const messages = new Linter().verify(code, config, {
        filename: path,
        filterCodeBlock: (name) => name.endsWith('.html'),
      })
      return [path, messages.map((message) => message.ruleId ?? `fatal: ${message.message}`)]
    }),
  )
}

/**
 * Angular's compiler on an app's files, with the compiler options of the
 * tsconfig `init` writes: every error, by file. The files are written to a
 * temporary project whose `node_modules` is the Angular vocabulary's install,
 * which holds Angular, Vite and the TypeScript the compiler needs, and
 * `@polymorph/angular-ui` resolves to the vocabulary's source.
 */
function angularErrors(files: Record<string, string>): string[] {
  const project = temporary('ngc')
  symlinkSync(resolve(VOCABULARY, 'node_modules'), resolve(project, 'node_modules'), 'dir')
  for (const [path, code] of Object.entries(files)) {
    mkdirSync(dirname(resolve(project, path)), { recursive: true })
    writeFileSync(resolve(project, path), code)
  }
  const written = JSON.parse(ANGULAR_INIT.tsconfig) as {
    compilerOptions: Record<string, unknown>
    angularCompilerOptions: Record<string, unknown>
  }
  writeFileSync(
    resolve(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        ...written.compilerOptions,
        // The vocabulary is read from its source here, outside the project,
        // which an emitting program's `rootDir` refuses. An app reads its
        // declaration files, which the `rootDir` does not cover.
        outDir: undefined,
        noEmit: true,
        paths: { [FRAMEWORK_VOCABULARY.angular]: [resolve(VOCABULARY, 'src/index.ts')] },
      },
      angularCompilerOptions: written.angularCompilerOptions,
      files: [...Object.keys(files), resolve(VOCABULARY, 'src/css-modules.d.ts')],
    }),
  )
  const result = spawnSync(
    resolve(VOCABULARY, 'node_modules/.bin/ngc'),
    ['-p', resolve(project, 'tsconfig.json'), '--noEmit'],
    { cwd: project, encoding: 'utf8' },
  )
  // The compiler colours its report whether or not it writes to a terminal.
  const output = stripVTControlCharacters(`${result.stdout}${result.stderr}`)
  const errors = output
    .split('\n')
    .filter((line) => / - error TS-?\d+: /.test(line))
    .map((line) => line.replace(`${project}/`, ''))
  if (result.status !== 0 && errors.length === 0) {
    throw new Error(`ngc failed without a diagnostic this test reads:\n${output}`)
  }
  return errors
}

const written = (plan: InitPlan, path: string): string => {
  const step = plan.steps.find((entry) => entry.path === path)
  if (step?.kind !== 'write') throw new Error(`the plan writes no ${path}`)
  return step.contents
}

/** A package's manifest in this repository, its ranges by name. */
const manifestOf = (path: string) =>
  JSON.parse(readFileSync(resolve(ROOT, path, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

describe('polymorph init --framework angular', () => {
  const app = ANGULAR_INIT
  const plan = planInit(registry, { dir: '/somewhere/angular-app', programs, framework: 'angular' })
  const manifest = JSON.parse(written(plan, 'package.json')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
    scripts: Record<string, string>
  }

  it('writes a Vite app with Analog’s Angular plugin, a zoneless entry and an ngc typecheck', () => {
    const paths = plan.steps.map((step) => step.path)
    for (const path of ['index.html', 'src/main.ts', 'src/app.ts', 'vite.config.ts']) {
      expect(paths, path).toContain(path)
    }
    expect(manifest.scripts['typecheck']).toBe('ngc -p tsconfig.json --noEmit')
    const vite = written(plan, 'vite.config.ts')
    expect(vite).toContain("import angular from '@analogjs/vite-plugin-angular'")
    expect(vite).toContain("angular({ tsconfig: './tsconfig.json', jit: false })")
    expect(vite).toContain('polymorphTheme({')
    const html = written(plan, 'index.html')
    expect(html).toContain('<app-root></app-root>')
    expect(html).toContain('<script type="module" src="/src/main.ts">')
    const main = written(plan, 'src/main.ts')
    expect(main).toMatch(
      /^\/\/ The theme first[^\n]*\nimport 'virtual:polymorph\/theme'\n[^\n]*\nimport '@polymorph\/angular-ui\/base\.css'/,
    )
    expect(main).toContain(
      'bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] })',
    )
    const tsconfig = JSON.parse(written(plan, 'tsconfig.json')) as {
      angularCompilerOptions: Record<string, unknown>
    }
    expect(tsconfig.angularCompilerOptions['strictTemplates']).toBe(true)
  })

  it('installs Angular, the engine, the foundation and vocabulary, the rules, and no other framework', () => {
    const { dependencies, devDependencies } = manifest
    for (const [name, range] of Object.entries(ANGULAR_FRAMEWORK)) {
      expect(dependencies[name], name).toBe(range)
    }
    expect(dependencies['@polymorph/engine']).toMatch(/^npm:@metamorph-labs\/polymorph-engine@/)
    for (const name of [FRAMEWORK_FOUNDATION.angular, FRAMEWORK_VOCABULARY.angular]) {
      const range = registry.vendor.frameworks.angular.packages[name]
      expect(range, name).toBe(
        `^${(JSON.parse(readFileSync(resolve(ROOT, name.replace('@polymorph/', 'packages/'), 'package.json'), 'utf8')) as { version: string }).version}`,
      )
      expect(dependencies[name], name).toBe(`npm:${PUBLISHED_NAMES[name]}@${range}`)
    }
    expect(devDependencies['@polymorph/rules']).toMatch(/^npm:@metamorph-labs\/polymorph-rules@/)
    for (const [tool, range] of Object.entries(ANGULAR_TOOLING)) {
      expect(devDependencies[tool], tool).toBe(range)
    }
    // Angular's compiler requires TypeScript 6.0, which replaces every other app's range.
    expect(devDependencies['typescript']).toBe('~6.0.3')
    const everything = Object.keys({ ...dependencies, ...devDependencies })
    expect(everything.filter((name) => /react|vue|svelte|solid/.test(name))).toEqual([])
  })

  it('takes Angular and its tools at the ranges this repository uses', () => {
    const vocabulary = manifestOf('packages/angular-ui')
    const declared = (name: string) =>
      vocabulary.devDependencies?.[name] ??
      vocabulary.dependencies?.[name] ??
      manifestOf('.').devDependencies?.[name]
    // The vocabulary pins the release it is built and tested with; an app takes its patches.
    expect(ANGULAR_RANGE).toBe(`~${declared('@angular/core')}`)
    for (const [name, range] of Object.entries({ ...ANGULAR_FRAMEWORK, ...ANGULAR_TOOLING })) {
      const repository = declared(name)
      expect(repository, name).toBeDefined()
      expect(range, name).toBe(range === ANGULAR_RANGE ? `~${repository}` : repository)
    }
  })

  it('writes the Angular ESLint fragment, system card and agent notes', () => {
    expect(written(plan, 'polymorph.eslint.js')).toBe(
      installedEslintFragment(plan.system.tokenValues, { framework: 'angular' }),
    )
    expect(written(plan, 'polymorph/system-card.md')).toBe(
      renderSystemCard(registry, { framework: 'angular' }),
    )
    const agents = written(plan, 'AGENTS.md')
    expect(agents).toContain(`\`${FRAMEWORK_VOCABULARY.angular}\``)
    expect(agents).toContain('framework: "angular"')
    expect(agents).toContain('`render_screen`')
    expect(written(plan, '.mcp.json')).toContain('--project')
  })

  it('emits a welcome screen of members Angular ships, with the React inputs', () => {
    const react = planInit(registry, { dir: '/somewhere/angular-app', programs })
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
      expect(member?.frameworks.angular.status, name).toBe('native')
    }
    // A `.ts` path names Angular, so the step needs no framework of its own.
    expect(plan.steps.find((step) => step.kind === 'emit')).toEqual({
      kind: 'emit',
      path: app.welcome,
      spec: 'src/screens/welcome.json',
    })
  })

  it('writes a container, an entry and a welcome screen that compile and lint clean', async () => {
    const spec = JSON.parse(written(plan, 'src/screens/welcome.json')) as Parameters<
      typeof emitCheckedScreen
    >[0]
    const welcome = await emitCheckedScreen(spec, { framework: 'angular', registry })
    expect(welcome.fatal).toBeNull()
    expect(welcome.violations).toEqual([])

    const files = {
      'src/main.ts': written(plan, 'src/main.ts'),
      'src/app.ts': written(plan, app.app.path),
      'src/screens/welcome.ts': welcome.code,
      'src/vite-env.d.ts': written(plan, 'src/vite-env.d.ts'),
    }
    expect(angularErrors(files)).toEqual([])

    const config = fragmentConfig(written(plan, 'polymorph.eslint.js'))
    expect(
      lint(config, {
        'src/app.ts': files['src/app.ts'],
        'src/screens/welcome.ts': files['src/screens/welcome.ts'],
        'src/main.ts': files['src/main.ts'],
      }),
    ).toEqual({ 'src/app.ts': [], 'src/screens/welcome.ts': [], 'src/main.ts': [] })
  }, 120_000)

  it('writes a fragment whose rules read a component’s template, inline or in its own file', () => {
    const config = fragmentConfig(written(plan, 'polymorph.eslint.js'))
    const component = [
      "import { Component } from '@angular/core'",
      `import { Button } from '${FRAMEWORK_VOCABULARY.angular}'`,
      '',
      '@Component({',
      "  selector: 'app-broken',",
      '  imports: [Button],',
      '  template: `',
      '    <pm-button class="wide" label="Go" />',
      '    <button (click)="go()">Go</button>',
      '  `,',
      '})',
      'export class Broken {',
      '  go(): void {}',
      '}',
      '',
    ].join('\n')
    const result = lint(config, {
      'src/broken.ts': component,
      'src/broken.html': '<div style="padding: 12px"></div>\n',
    })
    expect(result['src/broken.ts']?.sort()).toEqual([
      'polymorph/no-raw-interactive',
      'polymorph/no-raw-styles',
    ])
    expect(result['src/broken.html']).toEqual(['polymorph/no-raw-styles'])
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
    const outcome = run(cli, ['init', 'app', '--framework', 'angular', '--no-install'])
    expect(outcome.code, lines.join('\n')).toBe(0)
    const root = resolve(scratch, 'app')
    for (const step of plan.steps)
      expect(existsSync(resolve(root, step.path)), step.path).toBe(true)
    const welcome = readFileSync(resolve(root, app.welcome), 'utf8')
    expect(welcome).toContain(`from '${FRAMEWORK_VOCABULARY.angular}'`)
    expect(welcome).toContain("selector: 'app-welcome'")
    expect(welcome).toContain('export class Welcome {')
    expect(welcome).toContain('(click)="onStart()()"')
  }, 120_000)

  it('writes nothing when the welcome screen names a member absent in Angular', () => {
    const scratch = temporary('init')
    const lines: string[] = []
    const cli = {
      root: scratch,
      source: ROOT,
      registry: without('Heading', 'no Heading shell'),
      out: (line: string) => lines.push(line),
      programs,
    }
    expect(run(cli, ['init', 'app', '--framework', 'angular', '--no-install']).code).toBe(1)
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
    expect(run(cli, ['init', 'dry', '--framework', 'angular', '--dry-run']).code).toBe(0)
    expect(lines.join('\n')).toContain('dry (Angular)')
    expect(lines.join('\n')).toContain(app.welcome)
  })
})

describe('polymorph add --framework angular', () => {
  const plan = planInstall(registry, ['tabs', 'avatar', 'menu', 'density-scope'], {
    framework: 'angular',
  })
  const tree = registry.vendor.frameworks.angular.root
  const file = (dir: string, name: string) => `${tree}/${dir}/${name}.ts`
  const from = plan.files.map((entry) => entry.from)
  const to = plan.files.map((entry) => entry.to)

  it('vendors each member’s component, the compound parts its index attaches, and its fixture', () => {
    expect(plan.framework).toBe('angular')
    expect(from).toEqual(
      expect.arrayContaining([
        file('overlays', 'Tabs'),
        file('overlays', 'TabsContent'),
        `${tree}/overlays/tabs.states.ts`,
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
    expect(to).toContain('src/polymorph/overlays/Tabs.ts')
    expect(to).toContain('src/polymorph/overlays/tabs.module.css')
    expect(plan.base?.from).toBe(registry.vendor.base)
  })

  it('names only files this repository’s tree has, for every member Angular ships', () => {
    const natives = [...registry.components, ...registry.exceptions.primitives]
      .filter((member) => member.frameworks.angular.status === 'native')
      .map((member) => member.name)
    const every = planInstall(registry, natives, { framework: 'angular' })
    expect(every.files.length).toBeGreaterThan(60)
    for (const entry of every.files)
      expect(existsSync(resolve(ROOT, entry.from)), entry.from).toBe(true)
  })

  it('depends on the foundation, the machines and the template readers, and no other framework', () => {
    expect(Object.keys(plan.packages)).toEqual(
      expect.arrayContaining(['@polymorph/engine', FRAMEWORK_FOUNDATION.angular, '@zag-js/tabs']),
    )
    expect(
      Object.keys(plan.packages).filter((name) => /react|vue|svelte|solid/.test(name)),
    ).toEqual([])
    expect(plan.packages[FRAMEWORK_VOCABULARY.angular]).toBeUndefined()
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
      '@angular-eslint/eslint-plugin-template':
        ANGULAR_TOOLING['@angular-eslint/eslint-plugin-template'],
      '@angular-eslint/template-parser': ANGULAR_TOOLING['@angular-eslint/template-parser'],
    })
  })

  it('reads Icon as the foundation’s, with nothing to vendor', () => {
    const icon = planInstall(registry, ['icon'], { framework: 'angular' })
    expect(icon.files).toEqual([])
    expect(icon.notes).toEqual([
      `Icon ships inside ${FRAMEWORK_FOUNDATION.angular} — import it, there is nothing to vendor`,
    ])
  })

  it('refuses ImageEditor, and any member the map marks absent, with its reason', () => {
    const editor = registry.components.find((component) => component.name === 'ImageEditor')
    expect(() => planInstall(registry, ['image-editor'], { framework: 'angular' })).toThrow(
      new UnshippedMemberError('ImageEditor', 'angular', editor?.frameworks.angular.reason),
    )
    const missing = without('Button', 'no Button shell')
    expect(() => planInstall(missing, ['button'], { framework: 'angular' })).toThrow(
      new UnshippedMemberError('Button', 'angular', 'no Button shell'),
    )
    expect(() => planInstall(missing, ['button'])).not.toThrow()
  })

  it('writes the plan from this repository’s tree, rewriting a recipe import', () => {
    const app = temporary('app')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const result = applyPlan(app, ROOT, registry, plan)
    expect(result.written).toEqual(
      expect.arrayContaining([
        'src/polymorph/overlays/Tabs.ts',
        'src/polymorph/overlays/TabsContent.ts',
        'src/polymorph/structure/AvatarGroup.ts',
      ]),
    )
    const tabs = readFileSync(resolve(app, 'src/polymorph/overlays/Tabs.ts'), 'utf8')
    expect(tabs).toContain("import styles from './tabs.module.css'")
    expect(tabs).not.toContain('@polymorph/recipes')

    expect(readManifest(app)?.framework).toBe('angular')
    const fragment = readFileSync(resolve(app, 'polymorph.eslint.js'), 'utf8')
    expect(fragment.replace(/const VALUES = [\s\S]*?\n\n/, '')).toBe(
      eslintFragment('src/polymorph', {}, { framework: 'angular' }).replace(
        /const VALUES = [\s\S]*?\n\n/,
        '',
      ),
    )

    // The vendored members are the vocabulary: the application rules leave them alone.
    const config = fragmentConfig(fragment)
    expect(lint(config, { 'src/polymorph/overlays/Tabs.ts': tabs })).toEqual({
      'src/polymorph/overlays/Tabs.ts': [],
    })

    // `diff` re-plans from the manifest, so the files read as unchanged.
    const report = diffInstall(app, ROOT, registry)
    expect(
      report.files.filter((entry) => entry.state !== 'clean' && entry.state !== 'generated'),
    ).toEqual([])
  })

  it('stays in the framework its manifest records', () => {
    expect(installFramework('angular', undefined)).toBe('angular')
    const app = temporary('stay')
    writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', dependencies: {} }))
    const lines: string[] = []
    const cli = { root: app, source: ROOT, registry, out: (line: string) => lines.push(line) }
    expect(run(cli, ['add', 'button', '--framework', 'angular']).code).toBe(0)
    expect(run(cli, ['add', 'badge']).code).toBe(0)
    expect(readManifest(app)?.framework).toBe('angular')
    expect(existsSync(resolve(app, 'src/polymorph/structure/Badge.ts'))).toBe(true)
    lines.length = 0
    expect(run(cli, ['add', 'card', '--framework', 'vue']).code).toBe(1)
    expect(lines.join('\n')).toContain('this install vendors angular members')
  })
})
