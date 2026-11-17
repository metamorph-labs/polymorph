import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { compile } from 'svelte/compiler'
import { afterAll, describe, expect, it } from 'vitest'

import { EMITTED_MARKER, emitScreen } from './emit'
import { SVELTE_IMPORT_SOURCE } from './emit-svelte'
import { MissingRegistryError } from './emit-vue'
import { emitCheckedScreen, validateSpec } from './lawful'
import { SPEC_ID, type ScreenSpec } from './schema'

/**
 * The same spec, emitted for Svelte.
 *
 * The framework is an option of the emitter and the validator, never a field
 * of the spec. These tests hold the Svelte output to what the React and Vue
 * outputs are held to: it compiles (here, with Svelte's own compiler), it
 * passes every red rule as a `.svelte` file, and it is the same bytes every
 * time. Beyond that, no whitespace stands between two sibling nodes, because
 * Svelte would render it as a space where React renders nothing.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const SCREENS = ['inbox', 'new-ticket', 'settings']

const screen = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, `design/screens/${name}.json`), 'utf8')) as ScreenSpec

/** Where an emitted Svelte screen would live in this repository, for its Prettier config. */
const sveltePath = (name: string) => resolve(ROOT, `apps/workbench/src/relay/${name}.view.svelte`)

const emitSvelte = (spec: ScreenSpec, name = 'probe', using: Registry = registry) =>
  emitScreen(spec, { framework: 'svelte', registry: using, filepath: sveltePath(name) })

/** The registry with every member and primitive native in Svelte. */
const allNative: Registry = {
  ...registry,
  components: registry.components.map((component) => ({
    ...component,
    frameworks: { ...component.frameworks, svelte: { status: 'native' } },
  })),
  exceptions: {
    ...registry.exceptions,
    primitives: registry.exceptions.primitives.map((primitive) => ({
      ...primitive,
      frameworks: { ...primitive.frameworks, svelte: { status: 'native' } },
    })),
  },
}

/** Compiles a component with Svelte's compiler: its error, or its warnings and its client code. */
function compiled(
  code: string,
  id: string,
): { error: string | null; warnings: string[]; js: string } {
  try {
    const out = compile(code, { filename: `${id}.svelte`, generate: 'client' })
    return {
      error: null,
      warnings: out.warnings.map((warning) => `${warning.code}: ${warning.message}`),
      js: out.js.code,
    }
  } catch (error) {
    return { error: String(error), warnings: [], js: '' }
  }
}

/** The static markup templates the compiler writes, where every text node it keeps shows. */
const templates = (js: string): string[] =>
  [...js.matchAll(/\$\.from_html\(`([^`]*)`/g)].map((match) => match[1] as string)

describe('the Relay screens, emitted for Svelte', () => {
  for (const name of SCREENS) {
    it(`${name} compiles with Svelte's compiler, with no warning`, async () => {
      const { error, warnings } = compiled(await emitSvelte(screen(name), name), name)
      expect(error).toBeNull()
      expect(warnings).toEqual([])
    })

    it(`${name} leaves no whitespace between two nodes`, async () => {
      const { js } = compiled(await emitSvelte(screen(name), name), name)
      expect(templates(js).length).toBeGreaterThan(0)
      for (const template of templates(js)) expect(template).not.toMatch(/>\s+</)
    })

    it(`${name} passes every red rule as a .svelte file`, async () => {
      const result = await emitCheckedScreen(screen(name), {
        framework: 'svelte',
        registry,
        filepath: sveltePath(name),
      })
      expect(result.fatal, name).toBeNull()
      expect(result.violations, name).toEqual([])
    })

    it(`${name} is the same bytes as its snapshot`, async () => {
      await expect(await emitSvelte(screen(name), name)).toMatchFileSnapshot(
        `./__snapshots__/${name}.view.svelte.snap`,
      )
    })
  }

  it('carries the emitted marker and the spec name in its module script', async () => {
    const code = await emitSvelte(screen('inbox'), 'inbox')
    expect(code.startsWith('<script module lang="ts">\n/**\n')).toBe(true)
    expect(code).toContain(`${EMITTED_MARKER} (\`${SPEC_ID}\`)`)
  })

  it('declares the inputs as an exported interface and reads them with $props()', async () => {
    const spec = screen('inbox')
    const code = await emitSvelte(spec, 'inbox')
    expect(code).toContain('export interface InboxViewProps {')
    expect(code).toMatch(/let \{\n {2}tickets,[\s\S]*\}: InboxViewProps = \$props\(\)/)
    for (const input of spec.inputs) expect(code).toContain(`  ${input.name}: `)
  })

  it('imports members and the vocabulary’s types from the Svelte vocabulary, once', async () => {
    const code = await emitSvelte(screen('inbox'), 'inbox')
    expect(code.match(new RegExp(`from '${SVELTE_IMPORT_SOURCE}'`, 'g'))).toHaveLength(1)
    expect(code).toContain('type DataTableColumn')
    expect(code).not.toContain('@polymorph/react-ui')
    expect(code).toContain("import type { Ticket } from './tickets'")
  })

  it('passes callbacks as props, node props as snippets, children as content', async () => {
    const inbox = await emitSvelte(screen('inbox'), 'inbox')
    expect(inbox).toContain('onClick={onNewTicket}')
    expect(inbox).toContain('onSortChange={onSortChange}')
    expect(inbox).toContain('{#snippet actions()}')
    expect(inbox).toContain('{#snippet search()')
    expect(inbox).toContain('value={query}')
    const ticket = await emitSvelte(screen('new-ticket'), 'new-ticket')
    expect(ticket).toContain('{#snippet trigger()')
    expect(ticket).toContain('{#snippet actions()')
    // A compound part keeps its dotted name.
    expect(await emitSvelte(screen('settings'), 'settings')).toContain('<SettingsRow.Group')
  })

  it('declares a snippet whose name is an input’s at the top, and passes it by name', async () => {
    // ListPage's `summary` snippet would hide the input `summary` its own content reads.
    const code = await emitSvelte(screen('inbox'), 'inbox')
    expect(code).not.toContain('{#snippet summary()')
    expect(code).toContain('{#snippet summarySnippet()')
    expect(code).toContain('summary={summarySnippet}')
    expect(code).toContain('label={summary.open.label}')
  })

  it('writes an element inside a value as a snippet declared at the top', async () => {
    const code = await emitSvelte(screen('inbox'), 'inbox')
    expect(code).toContain('{#snippet secondaryActionSnippet()')
    expect(code).toContain('secondaryAction: secondaryActionSnippet,')
    expect(code).toContain('onClick={onClearFilters}')
  })

  it('carries the declared reason into the markup as a comment', async () => {
    const code = await emitSvelte(screen('inbox'), 'inbox')
    expect(code).toContain('<!-- Rung 2, declared: A queue is scanned rather than read')
    expect(code).toMatch(/--><DensityScope\n {4}value="compact"\n {4}as="section"/)
  })
})

describe('text, written so it reads back as typed', () => {
  const textSpec = (text: string, prop: string): ScreenSpec => ({
    spec: SPEC_ID,
    name: 'Probe',
    purpose: 'A probe.',
    inputs: [{ name: 'count', type: 'number' }],
    root: {
      component: 'Stack',
      props: { gap: 4 },
      children: [
        { component: 'Text', children: [text] },
        { component: 'Text', children: ['Total:', { $: 'count' }] },
        { component: 'Button', props: { label: prop } },
      ],
    },
  })

  it('writes plain words as text and a plain label as a static attribute', async () => {
    const code = await emitSvelte(textSpec('Plain words', 'Save'))
    expect(code).toContain('<Text>Plain words</Text>')
    expect(code).toContain('label="Save"')
    // Nothing between a text and the binding after it: Svelte would read a break as a space.
    expect(code).toContain('<Text>Total:{count}</Text>')
  })

  it('escapes what the markup or an attribute would read specially, and still compiles', async () => {
    const tricky = 'a "quote" & <b> {x} it\'s'
    const code = await emitSvelte(textSpec(tricky, tricky))
    expect(compiled(code, 'probe').error).toBeNull()

    // The expression and the attribute each hold a string literal that
    // evaluates to exactly what the spec says, and neither holds a character
    // the markup would read specially.
    const text = /<Text>\{('.+?')\}<\/Text/.exec(code)?.[1] ?? ''
    const attribute = /label=\{('[^']*(?:\\'[^']*)*')\}/.exec(code)?.[1] ?? ''
    for (const literal of [text, attribute]) {
      expect(literal).not.toMatch(/[&<>{}"]/)
      expect(new Function(`return ${literal}`)()).toBe(tricky)
    }
  })

  it('cannot close the comment a declared reason is written into', async () => {
    const spec: ScreenSpec = {
      ...textSpec('x', 'y'),
      root: {
        component: 'DensityScope',
        props: { value: 'compact' },
        exception: { rung: 2, because: 'a reason that tries --> to end the comment early' },
        children: [{ component: 'Text', children: ['x'] }],
      },
    }
    const code = await emitSvelte(spec)
    expect(code).toContain('tries --\\> to end')
    expect(compiled(code, 'probe').error).toBeNull()
  })

  it('writes a string given to a node prop as the snippet’s text', async () => {
    const spec: ScreenSpec = {
      ...textSpec('x', 'y'),
      inputs: [],
      root: {
        component: 'ListPage',
        props: { title: 'Probe', emptyState: { $object: { title: 'None' } }, actions: 'Later' },
      },
    }
    const code = await emitSvelte(spec)
    expect(code).toContain('{#snippet actions()}Later{/snippet')
    expect(code).not.toContain('<script lang="ts">')
    expect(compiled(code, 'probe').error).toBeNull()
  })
})

/**
 * A screen drawn from the parts no Relay screen composes: a shell's navigation,
 * a dashboard's panels, a table's sections, an avatar group and a tour target.
 */
const OVERVIEW = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/spec/fixtures/overview.json'), 'utf8'),
) as ScreenSpec

describe('a screen drawn from its members’ parts, emitted for Svelte', () => {
  it('is a lawful spec that compiles with no warning', async () => {
    expect(validateSpec(registry, OVERVIEW, { framework: 'svelte' }).faults).toEqual([])
    const code = await emitSvelte(OVERVIEW, 'usage-overview')
    const { error, warnings } = compiled(code, 'usage-overview')
    expect(error).toBeNull()
    expect(warnings).toEqual([])
    expect(code).toContain('<Dashboard.Panel title="Requests by key"')
  })
})

describe('the framework, checked before anything is emitted', () => {
  it('passes the Relay screens once every member they compose has a Svelte shell', () => {
    for (const name of SCREENS) {
      expect(validateSpec(allNative, screen(name), { framework: 'svelte' }), name).toEqual({
        ok: true,
        faults: [],
      })
    }
  })

  it('refuses a member the Svelte map marks absent, with the map’s reason', () => {
    const missing: Registry = {
      ...allNative,
      components: allNative.components.map((component) =>
        component.name === 'Button'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                svelte: { status: 'absent', reason: 'no Svelte shell yet' },
              },
            }
          : component,
      ),
    }
    const { ok, faults } = validateSpec(missing, screen('new-ticket'), { framework: 'svelte' })
    expect(ok).toBe(false)
    expect(faults).toEqual([
      {
        path: '$.root.props.actions[0].props.trigger',
        message: '`Button` is absent in svelte — no Svelte shell yet',
      },
      {
        path: '$.root.props.actions[1]',
        message: '`Button` is absent in svelte — no Svelte shell yet',
      },
    ])
    expect(validateSpec(missing, screen('new-ticket')).ok).toBe(true)
  })

  it('refuses a Svelte screen for a phone platform', () => {
    const spec = { ...screen('settings'), platform: 'ios' } as ScreenSpec
    const { faults } = validateSpec(allNative, spec, { framework: 'svelte' })
    expect(faults[0]).toEqual({
      path: '$.platform',
      message:
        'a svelte screen runs on the web, and this one names ios — remove `platform`, or validate it without a framework',
    })
  })

  it('needs the registry to emit for Svelte, and says so as a refusal', async () => {
    await expect(emitScreen(screen('settings'), { framework: 'svelte' })).rejects.toThrow(
      MissingRegistryError,
    )
    const result = await emitCheckedScreen(screen('settings'), { framework: 'svelte' })
    expect(result).toMatchObject({ code: '', violations: [] })
    expect(result.fatal).toContain('pass `registry` with `framework: "svelte"`')
  })
})

describe('pnpm emit, for Svelte', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-svelte-'))
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  const BIN = resolve(ROOT, 'packages/spec/bin/emit.js')
  const run = (args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' })

  it('emits for Svelte when the output is a .svelte file', () => {
    const input = resolve(scratch, 'settings.json')
    writeFileSync(input, JSON.stringify(screen('settings')))
    const output = resolve(scratch, 'Settings.svelte')
    const result = run([input, output])
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(output, 'utf8')).toMatch(new RegExp(`from ['"]${SVELTE_IMPORT_SOURCE}['"]`))
    // Each run builds the registry, which takes seconds under the suite's load.
  }, 120_000)

  it('refuses a --framework the output’s extension contradicts, and writes nothing', () => {
    const input = resolve(scratch, 'inbox.json')
    writeFileSync(input, JSON.stringify(screen('inbox')))
    for (const [output, framework] of [
      ['Inbox.tsx', 'svelte'],
      ['Inbox.svelte', 'react'],
      ['Inbox.svelte', 'solid'],
    ] as const) {
      const result = run([input, resolve(scratch, output), '--framework', framework])
      expect(result.status, output).toBe(1)
      expect(result.stderr).toContain(`--framework ${framework} writes a`)
      expect(result.stderr).toContain('usage: pnpm emit')
      expect(() => readFileSync(resolve(scratch, output))).toThrow()
    }
    // Each run loads the emitter's modules, which takes seconds under the suite's load.
  }, 120_000)
})
