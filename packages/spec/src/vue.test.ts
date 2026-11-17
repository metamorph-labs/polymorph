import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, describe, expect, it } from 'vitest'

import { EMITTED_MARKER, emitScreen } from './emit'
import { MissingRegistryError, VUE_IMPORT_SOURCE } from './emit-vue'
import { emitCheckedScreen, validateSpec } from './lawful'
import { SPEC_ID, type ScreenSpec } from './schema'

/**
 * The same spec, emitted for Vue.
 *
 * The framework is an option of the emitter and the validator, never a field
 * of the spec. These tests hold the Vue output to what the React output is
 * held to: it compiles (here, with Vue's own compiler, script and template),
 * it passes every red rule as a `.vue` file, it is formatted the way the
 * repository formats code, and it is the same bytes every time. The React
 * output of the same specs is pinned beside it, so a change made for Vue that
 * moves React fails here.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const SCREENS = ['inbox', 'new-ticket', 'settings']

const screen = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, `design/screens/${name}.json`), 'utf8')) as ScreenSpec

/** Where an emitted Vue screen would live in this repository, for its Prettier config. */
const vuePath = (name: string) => resolve(ROOT, `apps/workbench/src/relay/${name}.view.vue`)
const reactPath = (name: string) => resolve(ROOT, `apps/workbench/src/relay/${name}.view.tsx`)

const emitVue = (spec: ScreenSpec, name = 'probe') =>
  emitScreen(spec, { framework: 'vue', registry, filepath: vuePath(name) })

/**
 * The registry with every member and primitive native in Vue, so a test about
 * what the validator does with a native member does not depend on which
 * members the live map marks native.
 */
const allNative: Registry = {
  ...registry,
  components: registry.components.map((component) => ({
    ...component,
    frameworks: { ...component.frameworks, vue: { status: 'native' } },
  })),
  exceptions: {
    ...registry.exceptions,
    primitives: registry.exceptions.primitives.map((primitive) => ({
      ...primitive,
      frameworks: { ...primitive.frameworks, vue: { status: 'native' } },
    })),
  },
}

/** Compiles a single-file component with Vue's compiler and returns every error it reports. */
function compileErrors(code: string, id: string): string[] {
  const { descriptor, errors } = parse(code, { filename: `${id}.vue` })
  if (errors.length > 0) return errors.map(String)
  const script = compileScript(descriptor, { id })
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: `${id}.vue`,
    id,
    compilerOptions: { bindingMetadata: script.bindings, expressionPlugins: ['typescript'] },
  })
  return template.errors.map(String)
}

describe('the Relay screens, emitted for Vue', () => {
  for (const name of SCREENS) {
    it(`${name} compiles with Vue's compiler, script and template`, async () => {
      expect(compileErrors(await emitVue(screen(name), name), name)).toEqual([])
    })

    it(`${name} passes every red rule as a .vue file`, async () => {
      const result = await emitCheckedScreen(screen(name), {
        framework: 'vue',
        registry,
        filepath: vuePath(name),
      })
      expect(result.fatal, name).toBeNull()
      expect(result.violations, name).toEqual([])
    })

    it(`${name} is the same bytes as its snapshot`, async () => {
      await expect(await emitVue(screen(name), name)).toMatchFileSnapshot(
        `./__snapshots__/${name}.view.vue.snap`,
      )
    })

    it(`${name} leaves the React emission as it was`, async () => {
      const code = await emitScreen(screen(name), { filepath: reactPath(name) })
      expect(
        await emitScreen(screen(name), { framework: 'react', filepath: reactPath(name) }),
      ).toBe(code)
      await expect(code).toMatchFileSnapshot(`./__snapshots__/${name}.view.tsx.snap`)
    })
  }

  it('is formatted the way this repository formats code', async () => {
    const { format, resolveConfig } = await import('prettier')
    for (const name of SCREENS) {
      const code = await emitVue(screen(name), name)
      const local = await resolveConfig(vuePath(name))
      expect(await format(code, { ...local, filepath: vuePath(name) }), name).toBe(code)
    }
  })

  it('carries the emitted marker and the spec name, as the React header does', async () => {
    const code = await emitVue(screen('inbox'), 'inbox')
    expect(code.startsWith('<script setup lang="ts">\n/**\n')).toBe(true)
    expect(code).toContain(`${EMITTED_MARKER} (\`${SPEC_ID}\`)`)
  })

  it('declares every input with defineProps, callbacks included', async () => {
    const spec = screen('inbox')
    const code = await emitVue(spec, 'inbox')
    expect(code).toContain('const props = defineProps<InboxViewProps>()')
    for (const input of spec.inputs) expect(code).toContain(`  ${input.name}: `)
  })

  it('imports members and the vocabulary’s types from the Vue vocabulary, once', async () => {
    const code = await emitVue(screen('inbox'), 'inbox')
    expect(code.match(new RegExp(`from '${VUE_IMPORT_SOURCE}'`, 'g'))).toHaveLength(1)
    expect(code).toContain('type DataTableColumn')
    expect(code).not.toContain('@polymorph/react-ui')
    expect(code).toContain("import type { Ticket } from './tickets'")
    expect(code).toContain("import { h } from 'vue'")
  })

  it('wires events with @, node props into named slots, children into the default slot', async () => {
    const inbox = await emitVue(screen('inbox'), 'inbox')
    expect(inbox).toContain('@click="props.onNewTicket"')
    expect(inbox).toContain('@sortChange="props.onSortChange"')
    expect(inbox).toContain('<template #summary>')
    expect(inbox).toContain('<template #search>')
    expect(inbox).toContain(':value="props.query"')
    const ticket = await emitVue(screen('new-ticket'), 'new-ticket')
    expect(ticket).toContain('<template #trigger>')
    expect(ticket).toContain('<template #actions>')
    // A compound part keeps its dotted name, which `<script setup>` resolves.
    expect(await emitVue(screen('settings'), 'settings')).toContain('<SettingsRow.Group')
  })

  it('writes an element inside a value as a render call', async () => {
    const code = await emitVue(screen('inbox'), 'inbox')
    expect(code).toMatch(/secondaryAction: h\(Button, \{/)
    expect(code).toContain('onClick: props.onClearFilters')
  })

  it('carries the declared reason into the template as a comment', async () => {
    const code = await emitVue(screen('inbox'), 'inbox')
    expect(code).toContain('<!-- Rung 2, declared: A queue is scanned rather than read')
    expect(code).toContain('<DensityScope value="compact" as="section">')
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
    const code = await emitVue(textSpec('Plain words', 'Save'))
    expect(code).toContain('<Text>Plain words</Text>')
    expect(code).toContain('label="Save"')
    // Nothing between a text and the binding after it: Vue would read a break as a space.
    expect(code).toContain('<Text>Total:{{ props.count }}</Text>')
  })

  it('escapes what a template or an attribute would read as markup, and still compiles', async () => {
    const tricky = 'a "quote" & <b> {{ x }} it\'s'
    const code = await emitVue(textSpec(tricky, tricky))
    expect(compileErrors(code, 'probe')).toEqual([])

    // The interpolation and the bound attribute each hold a string literal that
    // evaluates to exactly what the spec says, and neither holds a character
    // the template would read as markup.
    const interpolated = /<Text>\{\{ (.+) \}\}<\/Text>/.exec(code)?.[1] ?? ''
    const bound = /:label="([^"]+)"/.exec(code)?.[1] ?? ''
    for (const literal of [interpolated, bound]) {
      expect(literal).not.toMatch(/[&<>{}]/)
      expect(new Function(`return ${literal}`)()).toBe(tricky)
    }
    expect(bound).not.toContain('"')
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
    const code = await emitVue(spec)
    expect(code).toContain('tries --\\> to end')
    expect(compileErrors(code, 'probe')).toEqual([])
  })
})

describe('render calls, inside a value', () => {
  /** A list page whose empty state holds `element` as its secondary action. */
  const emptyWith = (element: unknown, inputs: ScreenSpec['inputs'] = []): ScreenSpec =>
    ({
      spec: SPEC_ID,
      name: 'Probe',
      purpose: 'A probe.',
      inputs,
      root: {
        component: 'ListPage',
        props: {
          title: 'Probe',
          emptyState: { $object: { title: 'Nothing here', secondaryAction: element } },
        },
      },
    }) as ScreenSpec

  it('writes a declared reason with a quote or an ampersand as entities the attribute decodes', async () => {
    const code = await emitVue(
      emptyWith({
        component: 'Button',
        props: { label: 'Clear' },
        exception: { rung: 3, because: 'a "quoted" reason & another' },
      }),
    )
    expect(code).toContain('a &quot;quoted&quot; reason &amp; another')
    expect(compileErrors(code, 'probe')).toEqual([])
  })

  it('passes a render prop bound to an input as a scoped slot that calls it', async () => {
    // No member takes a render prop, so one is given to Stack here.
    const withRenderProp: Registry = {
      ...registry,
      components: registry.components.map((component) =>
        component.name === 'Stack'
          ? {
              ...component,
              props: [
                ...component.props,
                { name: 'renderItem', type: '(item: string) => ReactNode', optional: true },
              ],
            }
          : component,
      ),
    }
    const spec = emptyWith({ component: 'Stack', props: { renderItem: { $: 'renderRow' } } }, [
      { name: 'renderRow', type: '(item: string) => VNode' },
    ])
    const code = await emitScreen(spec, {
      framework: 'vue',
      registry: withRenderProp,
      filepath: vuePath('probe'),
    })
    expect(code).toContain('h(Stack, null, { renderItem: (slot) => props.renderRow(slot) })')
    expect(code).not.toContain('renderItem: props.renderRow')
  })
})

/**
 * A screen drawn from the parts no Relay screen composes: a shell's navigation,
 * a dashboard's panels, a table's sections, an avatar group and a tour target.
 */
const OVERVIEW = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/spec/fixtures/overview.json'), 'utf8'),
) as ScreenSpec

describe('a screen drawn from its members’ parts, emitted for Vue', () => {
  it('is a lawful spec that compiles, with each part’s props read from the part', async () => {
    expect(validateSpec(registry, OVERVIEW, { framework: 'vue' }).faults).toEqual([])
    const code = await emitVue(OVERVIEW, 'usage-overview')
    expect(compileErrors(code, 'usage-overview')).toEqual([])
    // `onSelect` is the part's event and `sidebar` the shell's slot.
    expect(code).toContain('<AppShell.NavItem label="Billing" @select="props.onOpenBilling" />')
    expect(code).toContain('<template #sidebar>')
    expect(code).toContain('<Dashboard.Panel title="Requests by key">')
  })
})

describe('the framework, checked before anything is emitted', () => {
  it('passes the Relay screens once every member they compose has a Vue shell', () => {
    for (const name of SCREENS) {
      expect(validateSpec(allNative, screen(name), { framework: 'vue' }), name).toEqual({
        ok: true,
        faults: [],
      })
    }
  })

  it('refuses a member the Vue map marks absent, with the map’s reason', () => {
    const missing: Registry = {
      ...allNative,
      components: allNative.components.map((component) =>
        component.name === 'Button'
          ? {
              ...component,
              frameworks: {
                ...component.frameworks,
                vue: { status: 'absent', reason: 'no Vue shell yet' },
              },
            }
          : component,
      ),
    }
    const { ok, faults } = validateSpec(missing, screen('new-ticket'), { framework: 'vue' })
    expect(ok).toBe(false)
    expect(faults).toEqual([
      {
        path: '$.root.props.actions[0].props.trigger',
        message: '`Button` is absent in vue — no Vue shell yet',
      },
      { path: '$.root.props.actions[1]', message: '`Button` is absent in vue — no Vue shell yet' },
    ])
    // The same spec is lawful for React, where every member is native.
    expect(validateSpec(missing, screen('new-ticket')).ok).toBe(true)
  })

  it('checks a ladder primitive as it checks a member', () => {
    const reason = 'design/frameworks/vue.json has no entry for it'
    const unscoped: Registry = {
      ...allNative,
      exceptions: {
        ...allNative.exceptions,
        primitives: allNative.exceptions.primitives.map((primitive) =>
          primitive.name === 'DensityScope'
            ? {
                ...primitive,
                frameworks: { ...primitive.frameworks, vue: { status: 'absent', reason } },
              }
            : primitive,
        ),
      },
    }
    const { faults } = validateSpec(unscoped, screen('inbox'), { framework: 'vue' })
    expect(faults).toEqual([
      { path: '$.root.children[0]', message: `\`DensityScope\` is absent in vue — ${reason}` },
    ])
  })

  it('refuses a Vue screen for a phone platform', () => {
    const spec = { ...screen('settings'), platform: 'ios' } as ScreenSpec
    const { faults } = validateSpec(allNative, spec, { framework: 'vue' })
    expect(faults[0]).toEqual({
      path: '$.platform',
      message:
        'a vue screen runs on the web, and this one names ios — remove `platform`, or validate it without a framework',
    })
  })

  it('needs the registry to emit for Vue, and says so as a refusal', async () => {
    await expect(emitScreen(screen('settings'), { framework: 'vue' })).rejects.toThrow(
      MissingRegistryError,
    )
    const result = await emitCheckedScreen(screen('settings'), { framework: 'vue' })
    expect(result).toMatchObject({ code: '', violations: [] })
    expect(result.fatal).toContain('pass `registry`')
  })
})

describe('pnpm emit, for Vue', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'polymorph-emit-vue-'))
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  const BIN = resolve(ROOT, 'packages/spec/bin/emit.js')
  const run = (args: string[]) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8' })

  it('emits for Vue when the output is a .vue file, validating against the Vue map first', () => {
    const absent = registry.components.find((c) => c.frameworks.vue.status === 'absent')
    const input = resolve(scratch, 'settings.json')
    writeFileSync(input, JSON.stringify(screen('settings')))
    const output = resolve(scratch, 'Settings.vue')
    const result = run([input, output])
    const composed = ['SettingsPage', 'SettingsRow', 'Select', 'Switch', 'Checkbox']
    const missing = registry.components.filter(
      (c) => composed.includes(c.name) && c.frameworks.vue.status === 'absent',
    )
    if (missing.length > 0) {
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(`is absent in vue`)
    } else {
      expect(result.status, result.stderr).toBe(0)
      // Formatted with the Prettier config where the file lands, so either quote.
      expect(readFileSync(output, 'utf8')).toMatch(new RegExp(`from ['"]${VUE_IMPORT_SOURCE}['"]`))
    }
    // An absent member is named with its reason whenever there is one.
    if (absent !== undefined) {
      const probe = resolve(scratch, 'probe.json')
      writeFileSync(
        probe,
        JSON.stringify({
          spec: SPEC_ID,
          name: 'Probe',
          purpose: 'A probe.',
          inputs: [],
          root: { component: absent.name, props: {} },
        }),
      )
      const refused = run([probe, '--framework', 'vue'])
      expect(refused.status).toBe(1)
      expect(refused.stderr).toContain(`\`${absent.name}\` is absent in vue`)
    }
    // Each run builds the registry, which takes seconds under the suite's load.
  }, 120_000)

  it('refuses a --framework the output’s extension contradicts, and writes nothing', () => {
    const input = resolve(scratch, 'inbox.json')
    writeFileSync(input, JSON.stringify(screen('inbox')))
    for (const [output, framework] of [
      ['Inbox.tsx', 'vue'],
      ['Inbox.vue', 'react'],
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
