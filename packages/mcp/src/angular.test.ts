import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildRegistry, FRAMEWORK_VOCABULARY, type Registry } from '@polymorph/registry'
import { EMITTED_MARKER } from '@polymorph/spec'
import { afterAll, describe, expect, it } from 'vitest'

import { createServer } from './server'
import {
  emitScreen,
  fix,
  fixFile,
  FrameworkMismatchError,
  getInstallPlan,
  getSystemCard,
  install,
  RefusedWriteError,
  searchComponents,
  validate,
  type ToolContext,
} from './tools'

/**
 * The tools, asked about Angular, as `frameworks.test.ts` asks them about
 * Svelte and Solid: every tool that reads `framework` takes `angular`, answers
 * from the registry's `frameworks` entries, and checks, writes and installs in
 * Angular's terms. `emit_screen` reads Angular from a `.ts` path, and
 * `fix_file` from a `.ts` module in a package that uses the Angular vocabulary.
 *
 * The answers about what exists are checked against a copy of the registry in
 * which every member is native and `Badge` is absent, so they do not depend on
 * which members the live map marks native. The install tools read the live
 * registry, whose native members publish the files an install copies.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

/** Every member native in Angular, except `Badge`, marked absent. */
const mapped: Registry = {
  ...registry,
  components: registry.components.map((component) => ({
    ...component,
    frameworks: {
      ...component.frameworks,
      angular:
        component.name === 'Badge'
          ? { status: 'absent', reason: 'no angular shell yet' }
          : { status: 'native' },
    },
  })),
  exceptions: {
    ...registry.exceptions,
    primitives: registry.exceptions.primitives.map((primitive) => ({
      ...primitive,
      frameworks: { ...primitive.frameworks, angular: { status: 'native' } },
    })),
  },
}

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

function project(dependencies: Record<string, string> = {}): ToolContext & { project: string } {
  const path = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-angular-'))
  temporaries.push(path)
  writeFileSync(resolve(path, 'package.json'), JSON.stringify({ name: 'app', dependencies }))
  return { registry: mapped, root: ROOT, project: path }
}

const SPEC = JSON.stringify({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A probe.',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'Stack',
    props: { gap: 4 },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
})

const BADGE = JSON.stringify({
  ...(JSON.parse(SPEC) as object),
  root: { component: 'Badge', children: ['New'] },
})

describe('the read tools, for angular', () => {
  const context: ToolContext = { registry: mapped, root: ROOT }

  it('search leaves out a member with no Angular shell, and only there', () => {
    const named = searchComponents(context, { framework: 'angular', limit: 200 }).map(
      (hit) => hit.name,
    )
    const react = searchComponents(context, { limit: 200 }).map((hit) => hit.name)
    expect(named).not.toContain('Badge')
    expect(named).toHaveLength(react.length - 1)
  })

  it('renders the card for Angular', () => {
    const card = getSystemCard(context, { framework: 'angular' })
    expect(card).toContain(`imports members from \`${FRAMEWORK_VOCABULARY.angular}\``)
    expect(card).not.toContain('- **Badge** ')
  })

  it('checks a spec against the Angular vocabulary, naming the reason a member is absent', async () => {
    const answer = await validate(context, { spec: BADGE, framework: 'angular' })
    expect(answer.ok).toBe(false)
    expect(answer.faults).toEqual([
      { path: '$.root', message: '`Badge` is absent in angular — no angular shell yet' },
    ])
  })
})

describe('validate, reading Angular code', () => {
  const context: ToolContext = { registry: mapped, root: ROOT }

  it('lints a component module with its inline template', async () => {
    const code = [
      "import { Component } from '@angular/core'",
      "import { Button } from '@polymorph/angular-ui'",
      '',
      '@Component({',
      "  selector: 'app-probe',",
      '  imports: [Button],',
      '  template: `<pm-button class="wide" label="Go" />`,',
      '})',
      'export class Probe {}',
      '',
    ].join('\n')
    const answer = await validate(context, { code, framework: 'angular' })
    expect(answer.filename).toMatch(/\.ts$/)
    expect(answer.violations?.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
  })

  it('lints markup as a component’s template, at the place it was given', async () => {
    const answer = await validate(context, {
      code: '<div style="padding: 12px"></div>',
      framework: 'angular',
    })
    expect(answer.filename).toMatch(/\.html$/)
    expect(answer.ok).toBe(false)
    expect(answer.violations?.[0]).toMatchObject({ rule: 'polymorph/no-raw-styles', line: 1 })
  })

  it('lints TypeScript as a module and CSS as CSS', async () => {
    const script = await validate(context, {
      code: "import { motion } from 'framer-motion'\nexport const fade = motion.div\n",
      framework: 'angular',
    })
    expect(script.filename).toMatch(/\.ts$/)
    expect(script.violations?.map((violation) => violation.rule)).toContain(
      'polymorph/no-external-motion',
    )
    const css = await validate(context, {
      code: '.hero {\n  transition: opacity 200ms;\n}\n',
      framework: 'angular',
    })
    expect(css.filename).toMatch(/\.css$/)
    expect(css.ok).toBe(false)
  })
})

describe('fix and fix_file, reading Angular code', () => {
  const MODULE = [
    "import { Component } from '@angular/core'",
    "import { Button } from '@polymorph/angular-ui'",
    '',
    '@Component({',
    "  selector: 'app-probe',",
    '  imports: [Button],',
    '  template: `<pm-button class="wide" label="Go" /><button type="button">Stop</button>`,',
    '})',
    'export class Probe {}',
    '',
  ].join('\n')
  const FIXED = MODULE.replace(' class="wide"', '')

  /** A project whose package has these dependencies, with one file in it. */
  function withFile(path: string, contents: string, dependencies: Record<string, string>) {
    const context = project(dependencies)
    writeFileSync(resolve(context.project, path), contents)
    return context
  }

  it('reads a module’s inline template in a package that uses the Angular vocabulary', async () => {
    // Read as plain TypeScript, the template is a string and every rule
    // passes it, so the answer would be `ok` with a raw control in it.
    const context = withFile('probe.ts', MODULE, { '@polymorph/angular-ui': '^1.0.0' })
    const answer = await fixFile(context, { path: 'probe.ts' })
    expect(answer).toMatchObject({ ok: false, changed: true, fatal: null })
    expect(answer.fixed).toEqual({ 'polymorph/no-raw-styles': 1 })
    expect(answer.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-interactive',
    ])
    expect(readFileSync(resolve(context.project, 'probe.ts'), 'utf8')).toBe(FIXED)
  })

  it('reads a module as Angular when asked, whatever the package declares', async () => {
    const context = withFile('probe.ts', MODULE, {})
    const answer = await fixFile(context, { path: 'probe.ts', framework: 'angular' })
    expect(answer.fixed).toEqual({ 'polymorph/no-raw-styles': 1 })
    expect(readFileSync(resolve(context.project, 'probe.ts'), 'utf8')).toBe(FIXED)
  })

  it('fixes a template file', async () => {
    const context = withFile('probe.html', '<pm-button class="wide" label="Go" />\n', {})
    const answer = await fixFile(context, { path: 'probe.html' })
    expect(answer).toMatchObject({ ok: true, changed: true, fatal: null })
    expect(readFileSync(resolve(context.project, 'probe.html'), 'utf8')).toBe(
      '<pm-button label="Go" />\n',
    )
  })

  it('fixes a submitted module with `framework: "angular"`, as `validate` reads it', async () => {
    const context: ToolContext = { registry: mapped, root: ROOT }
    const answer = await fix(context, { code: MODULE, framework: 'angular' })
    expect(answer.filename).toMatch(/\.ts$/)
    expect(answer.code).toBe(FIXED)
    const checked = await validate(context, { code: answer.code, framework: 'angular' })
    expect(answer.violations).toEqual(checked.violations)
  })
})

describe('emit_screen, for Angular', () => {
  it('writes a standalone component to a .ts path, read as Angular from the path', async () => {
    const context = project({ '@polymorph/angular-ui': '^1.0.0' })
    const answer = await emitScreen(context, { spec: SPEC, path: 'src/probe.ts' })
    expect(answer).toMatchObject({ ok: true, outcome: 'written', notes: [], language: 'angular' })
    expect(answer.next).toContain('<app-probe>')
    expect(answer.next).toContain('`imports`')
    const code = readFileSync(resolve(context.project, 'src/probe.ts'), 'utf8')
    expect(code).toContain(EMITTED_MARKER)
    expect(code).toMatch(/from ['"]@polymorph\/angular-ui['"]/)
    // Formatted by the project's Prettier config, which this one does not have.
    expect(code).toMatch(/selector: ['"]app-probe['"]/)
    expect(code).toContain('(click)="onSave()()"')
  })

  it('says when the project does not depend on the Angular vocabulary', async () => {
    const answer = await emitScreen(project(), { spec: SPEC, path: 'probe.ts' })
    expect(answer.notes?.[0]).toContain('@polymorph/angular-ui is not a dependency')
  })

  it('refuses a member with no Angular shell, and writes nothing', async () => {
    const context = project()
    const answer = await emitScreen(context, { spec: BADGE, path: 'probe.ts' })
    expect(answer.ok).toBe(false)
    expect(answer.faults[0]?.message).toBe('`Badge` is absent in angular — no angular shell yet')
    expect(readdirSync(context.project)).toEqual(['package.json'])
  })

  it('wants the extension the framework writes', async () => {
    const context = project()
    await expect(
      emitScreen(context, { spec: SPEC, path: 'Probe.tsx', framework: 'angular' }),
    ).rejects.toThrow(/Angular screen is a \.ts file/)
    await expect(
      emitScreen(context, { spec: SPEC, path: 'probe.ts', framework: 'react' }),
    ).rejects.toThrow(RefusedWriteError)
    expect(readdirSync(context.project)).toEqual(['package.json'])
  })
})

describe('installing Angular members', () => {
  const installing = (manifest?: object): ToolContext & { project: string } => {
    const context = { ...project(), registry }
    if (manifest !== undefined) {
      writeFileSync(resolve(context.project, 'polymorph.json'), JSON.stringify(manifest))
    }
    return context
  }

  it('plans and writes the member when asked for Angular', () => {
    const context = installing()
    const plan = getInstallPlan(context, { items: ['tabs'], framework: 'angular' })
    expect(plan.framework).toBe('angular')
    expect(plan.files.map((file) => file.to)).toEqual(
      expect.arrayContaining([
        'src/polymorph/overlays/Tabs.ts',
        'src/polymorph/overlays/TabsContent.ts',
      ]),
    )
    const answer = install(context, { items: ['tabs'], framework: 'angular' })
    expect(answer.written).toContain('src/polymorph/overlays/TabsContent.ts')
    expect(Object.keys(answer.devPackages)).toEqual(
      expect.arrayContaining([
        '@angular-eslint/eslint-plugin-template',
        '@angular-eslint/template-parser',
      ]),
    )
  })

  it('stays in the framework the manifest records, and refuses another', () => {
    const recorded = installing({
      version: registry.version,
      dir: 'src/polymorph',
      components: [],
      systems: [],
      palettes: [],
      files: {},
      framework: 'angular',
    })
    expect(getInstallPlan(recorded, { items: ['button'] }).framework).toBe('angular')
    expect(() => getInstallPlan(recorded, { items: ['button'], framework: 'vue' })).toThrow(
      FrameworkMismatchError,
    )
  })
})

describe('the wiring', () => {
  it('accepts angular wherever `framework` is declared', async () => {
    const [near, far] = InMemoryTransport.createLinkedPair()
    const server = createServer({ registry, root: ROOT, project: project().project })
    const client = new Client({ name: 'angular', version: '0' })
    await Promise.all([server.connect(far), client.connect(near)])
    const { tools } = await client.listTools()
    const taking = tools.filter((tool) =>
      Object.hasOwn(tool.inputSchema.properties ?? {}, 'framework'),
    )
    expect(taking).toHaveLength(8)
    for (const tool of taking) {
      const schema = (tool.inputSchema.properties as Record<string, { enum?: string[] }>)[
        'framework'
      ]
      expect(schema?.enum, tool.name).toContain('angular')
    }
    const card = await client.callTool({
      name: 'get_system_card',
      arguments: { framework: 'angular' },
    })
    expect(JSON.stringify(card.content)).toContain('@polymorph/angular-ui')
    await client.close()
  })
})
