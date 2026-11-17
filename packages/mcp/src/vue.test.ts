import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildRegistry, type Registry } from '@polymorph/registry'
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
 * The tools, asked about Vue.
 *
 * The framework is an argument of the tools that answer about what exists, of
 * the two that check and write a screen, of the two that plan and apply an
 * install, and of the two that fix code: `search_components`,
 * `get_system_card`, `validate`, `emit_screen`, `get_install_plan`, `install`,
 * `fix` and `fix_file`. Each answer comes from the registry's
 * `frameworks` entries, so a member with no Vue shell is left out of a search
 * and a card, and refused, with its reason, by a spec check and an install.
 *
 * The answers about what exists are checked against a copy of the registry in
 * which every member is native and one is absent, so they do not depend on
 * which members the live map marks native. The install tools read the live
 * registry, whose native members publish the files an install copies.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

/** Every member native in Vue, except `Badge`, marked absent. */
const mapped: Registry = {
  ...registry,
  components: registry.components.map((component) => ({
    ...component,
    frameworks: {
      ...component.frameworks,
      vue:
        component.name === 'Badge'
          ? { status: 'absent', reason: 'no Vue shell yet' }
          : { status: 'native' },
    },
  })),
  exceptions: {
    ...registry.exceptions,
    primitives: registry.exceptions.primitives.map((primitive) => ({
      ...primitive,
      frameworks: { ...primitive.frameworks, vue: { status: 'native' } },
    })),
  },
}

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

function project(dependencies: Record<string, string> = {}): ToolContext & { project: string } {
  const path = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-vue-'))
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

describe('the read tools, for Vue', () => {
  const context: ToolContext = { registry: mapped, root: ROOT }

  it('search leaves out a member with no Vue shell, and only for Vue', () => {
    const vue = searchComponents(context, { framework: 'vue', limit: 200 }).map((hit) => hit.name)
    const react = searchComponents(context, { limit: 200 }).map((hit) => hit.name)
    expect(react).toContain('Badge')
    expect(vue).not.toContain('Badge')
    expect(vue).toHaveLength(react.length - 1)
  })

  it('renders the card for Vue', () => {
    const card = getSystemCard(context, { framework: 'vue' })
    expect(card).toContain('imports members from `@polymorph/vue-ui`')
    expect(card).not.toContain('- **Badge** ')
    expect(getSystemCard(context)).toContain('- **Badge** ')
  })

  it('checks a spec against the Vue vocabulary, naming the reason a member is absent', async () => {
    const badge = JSON.stringify({
      ...JSON.parse(SPEC),
      root: { component: 'Badge', children: ['New'] },
    })
    expect(await validate(context, { spec: badge })).toMatchObject({ ok: true, kind: 'spec' })
    const answer = await validate(context, { spec: badge, framework: 'vue' })
    expect(answer.ok).toBe(false)
    expect(answer.faults).toEqual([
      { path: '$.root', message: '`Badge` is absent in vue — no Vue shell yet' },
    ])
  })

  it('lints TypeScript and CSS as themselves for Vue, so the rules still read them', async () => {
    const script = await validate(context, {
      code: "import { motion } from 'framer-motion'\nexport const fade = motion.div\n",
      framework: 'vue',
    })
    expect(script.filename).toMatch(/\.tsx$/)
    expect(script.ok).toBe(false)
    expect(script.violations?.map((violation) => violation.rule)).toContain(
      'polymorph/no-external-motion',
    )
    const css = await validate(context, {
      code: '.hero {\n  transition: opacity 200ms;\n}\n',
      framework: 'vue',
    })
    expect(css.filename).toMatch(/\.css$/)
    expect(css.ok).toBe(false)
  })

  it('lints a template fragment for Vue inside a template, at the place it was given', async () => {
    const answer = await validate(context, {
      code: '<div style="padding: 12px" />',
      framework: 'vue',
    })
    expect(answer.filename).toMatch(/\.vue$/)
    expect(answer.ok).toBe(false)
    expect(answer.violations?.[0]).toMatchObject({
      rule: 'polymorph/no-raw-styles',
      line: 1,
      column: 6,
    })
  })

  it('lints code as a single-file component for Vue', async () => {
    const code = `<script setup lang="ts">\nimport { Button } from '@polymorph/vue-ui'\n</script>\n\n<template>\n  <Button class="wide" label="Go" />\n</template>\n`
    for (const answer of [
      await validate(context, { code, framework: 'vue' }),
      // A component is recognised by its blocks when no framework is named.
      await validate(context, { code }),
    ]) {
      expect(answer.filename).toMatch(/\.vue$/)
      expect(answer.violations?.map((violation) => violation.rule)).toEqual([
        'polymorph/no-raw-styles',
      ])
    }
  })
})

describe('fix and fix_file, for Vue', () => {
  const COMPONENT = `<script setup lang="ts">\nimport { Button } from '@polymorph/vue-ui'\n</script>\n\n<template>\n  <Button class="wide" label="Go" />\n</template>\n`

  it('reads a template fragment inside a template, and returns it without one', async () => {
    // Linted as a `.vue` file with no block, nothing would be read, and a
    // `style` on a plain element would pass.
    const context: ToolContext = { registry: mapped, root: ROOT }
    const code = '<div style="padding: 12px" />'
    const answer = await fix(context, { code, framework: 'vue' })
    expect(answer).toMatchObject({ ok: false, changed: false, code, fatal: null })
    expect(answer.filename).toMatch(/\.vue$/)
    expect(answer.violations).toEqual(
      (await validate(context, { code, framework: 'vue' })).violations,
    )
  })

  it('fixes a single-file component in the project', async () => {
    const context = project({ '@polymorph/vue-ui': '^1.0.0' })
    writeFileSync(resolve(context.project, 'Probe.vue'), COMPONENT)
    const answer = await fixFile(context, { path: 'Probe.vue' })
    expect(answer).toMatchObject({
      ok: true,
      changed: true,
      fixed: { 'polymorph/no-raw-styles': 1 },
    })
    expect(readFileSync(resolve(context.project, 'Probe.vue'), 'utf8')).toBe(
      COMPONENT.replace(' class="wide"', ''),
    )
  })
})

describe('emit_screen, for Vue', () => {
  it('writes a single-file component that validated against the Vue vocabulary', async () => {
    const context = project({ '@polymorph/vue-ui': '^1.0.0' })
    const answer = await emitScreen(context, { spec: SPEC, path: 'src/Probe.vue' })
    expect(answer).toMatchObject({ ok: true, outcome: 'written', notes: [] })
    const code = readFileSync(resolve(context.project, 'src/Probe.vue'), 'utf8')
    expect(code).toContain('<script setup lang="ts">')
    expect(code).toContain(EMITTED_MARKER)
    expect(code).toContain('@click="props.onSave"')
    expect(answer.next).toContain('`@foo`')
  })

  it('says when the project does not depend on the Vue vocabulary', async () => {
    const context = project()
    const answer = await emitScreen(context, { spec: SPEC, path: 'Probe.vue', framework: 'vue' })
    expect(answer.notes?.[0]).toContain('@polymorph/vue-ui is not a dependency')
  })

  it('refuses a member with no Vue shell, and writes nothing', async () => {
    const context = project()
    const badge = JSON.stringify({
      ...JSON.parse(SPEC),
      root: { component: 'Badge', children: ['New'] },
    })
    const answer = await emitScreen(context, { spec: badge, path: 'Probe.vue' })
    expect(answer.ok).toBe(false)
    expect(answer.faults[0]?.message).toBe('`Badge` is absent in vue — no Vue shell yet')
    expect(readdirSync(context.project)).toEqual(['package.json'])
  })

  it('wants the extension the framework writes', async () => {
    const context = project()
    await expect(
      emitScreen(context, { spec: SPEC, path: 'Probe.tsx', framework: 'vue' }),
    ).rejects.toThrow(RefusedWriteError)
    await expect(
      emitScreen(context, { spec: SPEC, path: 'Probe.vue', framework: 'react' }),
    ).rejects.toThrow(/React screen is a \.tsx file/)
  })
})

describe('installing Vue members', () => {
  const installing = (manifest?: object): ToolContext & { project: string } => {
    const context = { ...project(), registry }
    if (manifest !== undefined) {
      writeFileSync(resolve(context.project, 'polymorph.json'), JSON.stringify(manifest))
    }
    return context
  }

  it('plans and writes the Vue member when asked for Vue', () => {
    const context = installing()
    const plan = getInstallPlan(context, { items: ['tabs'], framework: 'vue' })
    expect(plan.framework).toBe('vue')
    expect(plan.files.map((file) => file.to)).toEqual(
      expect.arrayContaining([
        'src/polymorph/overlays/Tabs.vue',
        'src/polymorph/overlays/TabsContent.vue',
      ]),
    )
    const answer = install(context, { items: ['tabs'], framework: 'vue' })
    expect(answer.written).toContain('src/polymorph/overlays/TabsContent.vue')
    expect(answer.devPackages).toHaveProperty('vue-eslint-parser')
  })

  it('stays in the framework the manifest records, and refuses another', () => {
    const vue = installing({
      version: registry.version,
      dir: 'src/polymorph',
      components: [],
      systems: [],
      palettes: [],
      files: {},
      framework: 'vue',
    })
    expect(getInstallPlan(vue, { items: ['button'] }).framework).toBe('vue')
    expect(() => getInstallPlan(vue, { items: ['button'], framework: 'react' })).toThrow(
      FrameworkMismatchError,
    )
    const react = installing({
      version: registry.version,
      dir: 'src/polymorph',
      components: [],
      systems: [],
      palettes: [],
      files: {},
    })
    expect(getInstallPlan(react, { items: ['button'] }).framework).toBeUndefined()
    expect(() => install(react, { items: ['theme:pastel'], framework: 'vue' })).toThrow(
      FrameworkMismatchError,
    )
  })
})

describe('the wiring', () => {
  it('declares `framework` on the eight tools that take it', async () => {
    const [near, far] = InMemoryTransport.createLinkedPair()
    const server = createServer({ registry, root: ROOT, project: project().project })
    const client = new Client({ name: 'vue', version: '0' })
    await Promise.all([server.connect(far), client.connect(near)])
    const { tools } = await client.listTools()
    const taking = tools
      .filter((tool) => Object.hasOwn(tool.inputSchema.properties ?? {}, 'framework'))
      .map((tool) => tool.name)
      .sort()
    expect(taking).toEqual([
      'emit_screen',
      'fix',
      'fix_file',
      'get_install_plan',
      'get_system_card',
      'install',
      'search_components',
      'validate',
    ])
    await client.close()
  })
})
