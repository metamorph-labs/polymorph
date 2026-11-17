import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildRegistry, type Registry } from '@polymorph/registry'
import { ELEMENTS_UNEMITTED } from '@polymorph/spec'
import { afterAll, describe, expect, it } from 'vitest'

import { createServer } from './server'
import {
  emitScreen,
  fix,
  fixFile,
  getInstallPlan,
  getSystemCard,
  install,
  RefusedWriteError,
  searchComponents,
  validate,
  type ToolContext,
} from './tools'

/**
 * The tools, asked about the elements.
 *
 * Every read tool takes `framework: "elements"` and answers from the
 * registry's `frameworks.elements` entries. The red rules do not read an HTML
 * page, so `validate`, `fix` and `fix_file` say so instead of reading one, in
 * a project whose manifest records the elements and in one that names them.
 * `emit_screen` refuses the elements with the reason, and `install` vendors no
 * member: a page loads every element, and a theme joins its theme sheet.
 *
 * The answers about what exists are checked against a copy of the registry in
 * which every member is native in elements and `Badge` is absent, so they do
 * not depend on which members the live map marks native.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const live: Registry = buildRegistry(ROOT)

/** An installed shell: what every element's entry carries. */
const SHELL = {
  origin: 'installed' as const,
  sources: [],
  states: null,
  dependencies: { components: [], packages: [], files: [] },
}

const registry: Registry = {
  ...live,
  components: live.components.map((component) => ({
    ...component,
    frameworks: {
      ...component.frameworks,
      elements:
        component.name === 'Badge'
          ? { status: 'absent' as const, reason: 'no element yet' }
          : { status: 'native' as const, shell: SHELL },
    },
  })),
}

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})

/** A page with no build: a manifest that records the elements, and no `package.json`. */
function page(): ToolContext & { project: string } {
  const path = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-elements-'))
  temporaries.push(path)
  writeFileSync(
    resolve(path, 'polymorph.json'),
    JSON.stringify({
      version: registry.version,
      dir: 'public/polymorph',
      components: [],
      systems: ['plain'],
      palettes: ['neutral'],
      files: {},
      framework: 'elements',
    }),
  )
  return { registry, root: ROOT, project: path }
}

const write = (root: string, path: string, text: string): void => {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), text)
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

const MARKUP = '<poly-button label="Go" style="padding: 12px"></poly-button>\n'
const UNREAD = 'an elements page is HTML, and the red rules do not read HTML pages'

describe('the read tools, for elements', () => {
  const context: ToolContext = { registry, root: ROOT }

  it('search leaves out a member with no element, and only that one', () => {
    const named = searchComponents(context, { framework: 'elements', limit: 200 })
    const react = searchComponents(context, { limit: 200 })
    expect(named.map((hit) => hit.name)).not.toContain('Badge')
    expect(named).toHaveLength(react.length - 1)
  })

  it('renders the elements card', () => {
    const card = getSystemCard(context, { framework: 'elements' })
    expect(card).toContain('imports members from `@polymorph/elements-ui`')
    expect(card).toContain('`<poly-button>`')
    expect(card).not.toContain('- **Badge** ')
  })

  it('checks a spec against the elements vocabulary, naming the reason a member is absent', async () => {
    const answer = await validate(context, { spec: BADGE, framework: 'elements' })
    expect(answer.faults).toEqual([
      { path: '$.root', message: '`Badge` is absent in elements — no element yet' },
    ])
    expect((await validate(context, { spec: SPEC, framework: 'elements' })).ok).toBe(true)
  })

  it('says a page is not read, rather than reading it or passing it', async () => {
    const answer = await validate(context, { code: MARKUP, framework: 'elements' })
    expect(answer).toMatchObject({ ok: false, violations: [], fatal: UNREAD })
    expect(answer.filename).toMatch(/\.html$/)
    const fixed = await fix(context, { code: MARKUP, framework: 'elements' })
    expect(fixed).toMatchObject({ ok: false, changed: false, code: MARKUP, fatal: UNREAD })
  })

  it('lints a script beside a page as TypeScript, with no module to import a member from', async () => {
    const script = await validate(context, {
      code: "import { motion } from 'framer-motion'\nexport const fade = motion.div\n",
      framework: 'elements',
    })
    expect(script.violations?.map((violation) => violation.rule)).toContain(
      'polymorph/no-external-motion',
    )
  })
})

describe('the tools in a page’s project, without `framework`', () => {
  it('read a .html file as an elements page from the manifest, with no package.json', async () => {
    const context = page()
    write(context.project, 'public/index.html', MARKUP)
    const answer = await fixFile(context, { path: 'public/index.html' })
    expect(answer.fatal).toBe(UNREAD)
    expect(readFileSync(resolve(context.project, 'public/index.html'), 'utf8')).toBe(MARKUP)
  })

  it('refuse to emit a screen for the page, with the reason, and write nothing', async () => {
    const context = page()
    await expect(emitScreen(context, { spec: SPEC, path: 'public/probe.html' })).rejects.toThrow(
      `polymorph: ${ELEMENTS_UNEMITTED}`,
    )
    await expect(
      emitScreen(context, { spec: SPEC, path: 'src/Probe.tsx', framework: 'elements' }),
    ).rejects.toThrow(RefusedWriteError)
    expect(existsSync(resolve(context.project, 'public/probe.html'))).toBe(false)
    expect(existsSync(resolve(context.project, 'src/Probe.tsx'))).toBe(false)
  })

  it('plan and install no member, and write a theme into the page’s sheet', () => {
    const context = page()
    const plan = getInstallPlan(context, { items: ['button'] })
    expect(plan).toMatchObject({ framework: 'elements', files: [], packages: {} })
    expect(plan.notes[0]).toContain('there is nothing to install per member')

    const members = install(context, { items: ['button'] })
    expect(members.written).toEqual([])
    expect(members.notes[0]).toContain('there is nothing to install per member')

    const themed = install(context, { items: ['theme:pastel'] })
    expect(themed.written).toEqual(['public/polymorph/theme.css'])
    const sheet = readFileSync(resolve(context.project, 'public/polymorph/theme.css'), 'utf8')
    expect(sheet).toContain('[data-system="pastel"][data-palette="amethyst"]')
    expect(sheet).toContain('[data-system="plain"][data-palette="neutral"]')
    expect(themed).toMatchObject({ systems: ['pastel'], packages: {}, devPackages: {} })
  })
})

describe('the wiring', () => {
  it('accepts elements wherever `framework` is declared', async () => {
    const [near, far] = InMemoryTransport.createLinkedPair()
    const server = createServer({ registry: live, root: ROOT, project: page().project })
    const client = new Client({ name: 'elements', version: '0' })
    await Promise.all([server.connect(far), client.connect(near)])
    const { tools } = await client.listTools()
    const taking = tools.filter((tool) =>
      Object.hasOwn(tool.inputSchema.properties ?? {}, 'framework'),
    )
    expect(taking.length).toBeGreaterThan(5)
    for (const tool of taking) {
      const schema = (tool.inputSchema.properties as Record<string, { enum?: string[] }>)[
        'framework'
      ]
      expect(schema?.enum, tool.name).toContain('elements')
    }
    const card = await client.callTool({
      name: 'get_system_card',
      arguments: { framework: 'elements' },
    })
    expect(JSON.stringify(card.content)).toContain('@polymorph/elements-ui')
    await client.close()
  })
})
