import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildRegistry, type Registry } from '@polymorph/registry'

import { rewrite } from './expr'
import { generateShells, staleness, TARGETS, typeOwners } from './generate'
import {
  describeMember,
  each,
  el,
  fx,
  held,
  hold,
  js,
  member,
  node,
  renders,
  slot,
  text,
  words,
  type MemberShell,
} from './dsl'
import { describedMembers } from './generate'
import { eventParameters, rewriteType } from './types'
import {
  checkAgent,
  checkHolding,
  checkSlots,
  FOUNDATION_TYPE_EXPORTS,
  fixtureName,
  partShell,
  unexported,
  UNEXPORTED_TYPES,
  type Location,
} from './common'
import { renderVueMember, renderVueStates } from './vue'
import { renderSolidMember, renderSolidStates } from './solid'
import { renderSvelteMember, renderSvelteStates, svelteContext, svelteInterface } from './svelte'
import { renderAngularMember, type AngularContext } from './angular'

/**
 * The shells' freshness law, and the generator's own checks.
 *
 * Every file `pnpm shells` writes is on disk as it would write it now: a
 * description, a renderer or a registry prop that changed without a
 * regeneration fails here, and so does a generated file no description
 * produces any more. The output is deterministic, so the comparison is exact.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

/** An Angular renderer's context for probes that compose no other member. */
const angularContext = (locations: ReadonlyMap<string, Location>): AngularContext => ({
  locations,
  owners: new Map(),
  source: 'probe.ts',
  lookup: () => undefined,
  generic: () => false,
  hostTag: () => undefined,
})

let registry: Registry
let generated: Map<string, string>
let members: MemberShell[]

/**
 * How long one generation of every target may take. Alone it takes under half
 * a minute. It formats every generated file, so beside the whole suite on a
 * machine in a low power mode it has taken more than two minutes.
 */
const GENERATION_TIMEOUT = 300_000

beforeAll(async () => {
  registry = buildRegistry(ROOT)
  members = await describedMembers(registry)
  generated = await generateShells(ROOT, registry, members)
}, GENERATION_TIMEOUT)

describe('the generated shells are fresh', () => {
  it('match what `pnpm shells` writes, with nothing missing, stale or orphaned', () => {
    const faults = staleness(ROOT, generated)
    expect(faults, 'run `pnpm shells`').toEqual([])
  })

  // Every target's files, formatted again: as long as the first generation, which `beforeAll` allows.
  it('come out the same twice', { timeout: GENERATION_TIMEOUT }, async () => {
    const again = await generateShells(ROOT, registry)
    expect([...again.entries()]).toEqual([...generated.entries()])
  })

  it('declare every type once, in the component that owns it', () => {
    const declarations = new Map<string, string[]>()
    for (const [path, text] of generated) {
      if (!path.endsWith('.vue')) continue
      for (const match of text.matchAll(/^export (?:interface|type) (\w+)/gm)) {
        const name = match[1] as string
        declarations.set(name, [...(declarations.get(name) ?? []), path])
      }
    }
    const twice = [...declarations].filter(([, paths]) => paths.length > 1)
    expect(twice).toEqual([])
  })

  it('find one description per file, each naming its own member', () => {
    const files = readdirSync(resolve(import.meta.dirname, 'members'))
      .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
      .map((name) => name.replace(/\.ts$/, ''))
      .sort()
    expect(members.map((shell) => fixtureName(shell)).sort()).toEqual(files)
    expect(new Set(members.map((shell) => shell.member)).size).toBe(members.length)
  })
})

describe('an expression is rewritten by its scope, not its spelling', () => {
  const props = (name: string) =>
    ['label', 'checked', 'loading'].includes(name) ? `props.${name}` : null

  it('maps free names and leaves property names, keys and bound names alone', () => {
    expect(rewrite("loading ? 'loading' : label", props)).toBe(
      "props.loading ? 'loading' : props.label",
    )
    expect(rewrite('api.label', props)).toBe('api.label')
    expect(rewrite('{ label: checked }', props)).toBe('{ label: props.checked }')
    expect(rewrite('(label) => label + loading', props)).toBe('(label) => label + props.loading')
  })

  it('keeps a shorthand property’s key', () => {
    expect(rewrite('{ checked }', props)).toBe('{ checked: props.checked }')
  })

  it('refuses what is not one expression', () => {
    expect(() => rewrite('a; b', props)).toThrow(/not one expression/)
  })
})

describe('a printed type is read back in the shared vocabulary of types', () => {
  it('names the roles union, the space steps and booleans', () => {
    const roles = registry.icons.roles.map((role) => `"${role.name}"`).join(' | ')
    expect(rewriteType(`${roles} | undefined`).text).toBe('IconRole')
    expect(rewriteType('0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "full"').text).toBe(
      "SpaceStep | 'full'".replace(/'/g, '"'),
    )
    expect(rewriteType('false | true | "indeterminate"').text).toBe('boolean | "indeterminate"')
  })

  it('reads a React event as the DOM event it wraps', () => {
    expect(
      eventParameters('((event: MouseEvent<HTMLButtonElement, MouseEvent>) => void) | undefined')
        .parameters,
    ).toEqual([{ name: 'event', type: 'MouseEvent' }])
    expect(
      eventParameters('((value: string, event: ChangeEvent<HTMLInputElement, Element>) => void)')
        .parameters,
    ).toEqual([
      { name: 'value', type: 'string' },
      { name: 'event', type: 'Event' },
    ])
    expect(
      eventParameters('CompositionEventHandler<HTMLInputElement> | undefined').parameters,
    ).toEqual([{ name: 'event', type: 'CompositionEvent' }])
  })

  it('reads a ref as the framework’s own', () => {
    expect(rewriteType('Ref<HTMLInputElement> | undefined').text).toBe(
      'Ref<HTMLInputElement | null>',
    )
  })
})

describe('the Vue renderer writes what a description says', () => {
  /** An owner of shared types, as another description would be. */
  const owner = describeMember({
    member: 'Owner',
    dir: 'feedback',
    recipe: null,
    types: { OwnerItem: '{ label: string }' },
    template: [],
    states: [],
  })
  const probe = (
    shell: Partial<MemberShell>,
    props: { name: string; type: string; optional: boolean }[] = [],
  ) =>
    renderVueMember(
      describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: null,
        template: [],
        states: [],
        ...shell,
      }),
      { name: 'Probe', purpose: 'A probe', spec: null, props, grid: null },
      {
        locations: new Map([
          ['Owner', { home: 'vocabulary', dir: 'feedback' }],
          ['Probe', { home: 'vocabulary', dir: 'structure' }],
        ]),
        owners: typeOwners([owner]),
        source: 'probe.ts',
      },
    )

  it('writes static text a template would change as a string literal', () => {
    const out = probe({
      template: el('span', {}, [words(' *'), words('a {{ b }}'), words('Plain')]),
    })
    expect(out).toContain("{{ ' *' }}")
    expect(out).toContain("{{ 'a \\x7b\\x7b b \\x7d\\x7d' }}")
    expect(out).toContain('Plain')
  })

  it('runs an effect on mount, on a watched change, or both, as it says', () => {
    const out = probe({
      template: el('span'),
      effects: [
        { run: 'first()' },
        { run: 'second()', watch: 'value', mount: false },
        { run: 'third()', watch: 'value' },
      ],
    })
    expect(out).toContain('onMounted(effect1)')
    expect(out).not.toMatch(/watch\(.*effect1/)
    expect(out).not.toContain('onMounted(effect2)')
    expect(out).toMatch(/watch\(\(\) => value, effect2/)
    expect(out).toContain('onMounted(effect3)')
    expect(out).toMatch(/watch\(\(\) => value, effect3/)
  })

  it('refuses an effect that would never run', () => {
    expect(() =>
      probe({ template: el('span'), effects: [{ run: 'never()', mount: false }] }),
    ).toThrow(/neither mounts nor watches/)
  })

  it('refuses a recipe named as another value is', () => {
    expect(() =>
      probe({
        template: el('span'),
        recipes: { sheet: 'overlays/sheet' },
        derived: { sheet: 'true' },
      }),
    ).toThrow(/names a recipe "sheet"/)
  })

  it('imports a type another description owns from its component, and declares none', () => {
    const out = probe({ template: el('span'), uses: ['OwnerItem', 'OwnerProps'] }, [
      { name: 'item', type: 'OwnerItem', optional: false },
      { name: 'empty', type: 'OwnerProps | undefined', optional: true },
    ])
    expect(out).toContain("import type { OwnerItem, OwnerProps } from '../feedback/Owner.vue'")
    expect(out).not.toMatch(/export (interface|type) Owner/)
  })

  it('imports a shared type in the line that imports its owner’s component', () => {
    const out = probe(
      {
        template: member('Owner'),
        types: { ProbeEntry: '{ owner: OwnerItem }' },
        uses: ['OwnerItem'],
      },
      [{ name: 'entry', type: 'ProbeEntry', optional: false }],
    )
    expect(out).toContain("import Owner, { type OwnerItem } from '../feedback/Owner.vue'")
  })

  it('refuses a shared type nobody owns, one it declares, and one nothing names', () => {
    const item = [{ name: 'item', type: 'OwnerItem', optional: false }]
    expect(() => probe({ template: el('span') }, item)).toThrow(/neither declares .* nor uses/)
    expect(() => probe({ template: el('span'), uses: ['Missing'] })).toThrow(
      /uses Missing, which no description declares/,
    )
    expect(() =>
      probe({ template: el('span'), types: { OwnerItem: 'string' }, uses: ['OwnerItem'] }, item),
    ).toThrow(/uses OwnerItem, which it declares itself/)
    expect(() => probe({ template: el('span'), uses: ['OwnerItem'] })).toThrow(
      /uses OwnerItem, which neither its props nor its types name/,
    )
  })

  it('refuses a type two descriptions declare', () => {
    const twin = describeMember({ ...owner, member: 'Twin' })
    expect(() => typeOwners([owner, twin])).toThrow(
      /Twin and Owner both declare the type OwnerItem/,
    )
  })

  it('makes an observing effect’s observers each run, and releases them on the next run and on unmount', () => {
    const out = probe({
      template: el('div', { ref: 'box' }, [el('span', { ref: 'inner' })]),
      state: { wide: 'false' },
      effects: [
        {
          run: 'wide = box !== null && box.scrollWidth > box.clientWidth',
          watch: 'wide',
          resize: ['box', 'inner'],
          mutation: ['box'],
        },
      ],
    })
    expect(out).toContain('let release1: (() => void) | undefined')
    expect(out).toContain('release1?.()')
    expect(out).toContain('new ResizeObserver(run)')
    expect(out).toMatch(
      /for \(const element of \[box\.value, inner\.value\]\) if \(element\) resize\?\.observe/,
    )
    expect(out).toContain(
      'mutation?.observe(element, { childList: true, characterData: true, subtree: true })',
    )
    expect(out).toContain('release1 = () => { resize?.disconnect(); mutation?.disconnect() }')
    expect(out).toContain('onBeforeUnmount(() => release1?.())')
  })

  it('makes a waiting effect set a timer, cleared when it is set again or the member unmounts', () => {
    const out = probe({
      template: el('span'),
      state: { copied: 'false', copies: '0' },
      effects: [{ run: 'copied = false', watch: 'copies', mount: false, delay: '2000' }],
    })
    expect(out).toContain('const timer = setTimeout(() => { copied.value = false }, 2000)')
    expect(out).toContain('release1 = () => clearTimeout(timer)')
    expect(out).toContain('onBeforeUnmount(() => release1?.())')
    expect(out).not.toContain('onMounted(effect1)')
    expect(() =>
      probe({ template: el('span'), effects: [{ run: 'a()', delay: '1', resize: ['b'] }] }),
    ).toThrow(/both waits and observes/)
  })

  it('refuses, in every renderer, an effect that observes attributes without a subtree', () => {
    expect(() => checkHolding('Table', { run: 'a()', attributes: ['disabled'] })).toThrow(
      /observes attributes without a mutation subtree/,
    )
    expect(() =>
      probe({ template: el('span'), effects: [{ run: 'a()', attributes: ['disabled'] }] }),
    ).toThrow(/observes attributes without a mutation subtree/)
  })

  it('passes a composed member’s slot only while its condition holds', () => {
    const out = probe({
      template: member(
        'Owner',
        {},
        {
          slots: { default: [words('Body')], trailing: [words('⌘K')] },
          slotWhen: { trailing: 'shown' },
        },
      ),
    })
    expect(out).toContain('<template #default>')
    expect(out).toContain('<template v-if="shown" #trailing>')
    expect(() =>
      probe({ template: member('Owner', {}, { slots: {}, slotWhen: { trailing: 'shown' } }) }),
    ).toThrow(/slot "trailing" has a condition and no content/)
  })

  it('reads a sheet edge a prop chooses each time the panel plays', () => {
    const out = probe(
      {
        template: el('div', { ref: 'panel' }),
        presence: {
          present: {
            open: 'true',
            ref: 'panel',
            binding: 'drawer.panel',
            sheetSide: { expr: 'side' },
          },
        },
      },
      [{ name: 'side', type: '"start" | "end"', optional: false }],
    )
    expect(out).toContain(
      "usePresence(() => true, panel, 'drawer.panel', { get sheetSide() { return props.side } })",
    )
  })

  it('lends a member’s identity to the members it composes, and reads one lent', () => {
    expect(probe({ template: el('span'), lends: true })).toContain(
      "provide('polymorph:identity', 'probe')",
    )
    const borrower = probe({ template: el('div', { attrs: { 'data-member': "lent ?? 'probe'" } }) })
    expect(borrower).toContain(
      "const lent = inject<string | undefined>('polymorph:identity', undefined)",
    )
    expect(borrower).toContain(':data-member="lent ?? \'probe\'"')
  })

  it('calls the caller’s handlers through invoke and returns what they return', () => {
    const out = probe({ template: el('button', { on: { click: { run: "invoke('confirm')" } } }) }, [
      { name: 'onConfirm', type: '() => void | Promise<void>', optional: false },
    ])
    expect(out).toContain('const instance = getCurrentInstance()')
    expect(out).toContain(
      'instance?.vnode.props?.[`on${event.charAt(0).toUpperCase()}${event.slice(1)}`]',
    )
    expect(out).toContain('@click="invoke(\'confirm\')"')
  })

  it('makes a member generic over its type parameters, with its props interface and types', () => {
    const out = probe(
      {
        generic: 'Row',
        types: { ProbeColumn: '<Row> { key: string; cell?: (row: Row) => VNode | string }' },
        template: el('span'),
      },
      [
        { name: 'columns', type: 'ProbeColumn<Row>[]', optional: false },
        { name: 'selection', type: 'ReadonlySet<string> | undefined', optional: true },
      ],
    )
    expect(out).toContain('<script setup lang="ts" generic="Row">')
    expect(out).toContain('export interface ProbeColumn<Row> { key: string;')
    expect(out).toContain('export interface ProbeProps<Row> {')
    expect(out).toContain('  selection?: ReadonlySet<string>')
    expect(out).toContain('defineProps<ProbeProps<Row>>()')
  })

  it('carries a node prop as a VNode in its props interface, and declares its props without it', () => {
    const props = [
      { name: 'title', type: 'string', optional: false },
      { name: 'action', type: 'ReactNode', optional: true },
    ]
    const out = probe({ template: el('span'), carries: ['action'] }, props)
    expect(out).toContain('  action?: VNode\n}')
    expect(out).toContain("defineProps<Omit<ProbeProps, 'action'>>()")
    expect(out).toContain('action?: (props: Record<string, never>) => unknown')
    expect(() => probe({ template: el('span'), carries: ['title'] }, props)).toThrow(
      /carries "title", which is not a node prop/,
    )
  })

  it('reads a slot’s text through a helper the component declares', () => {
    const out = probe(
      {
        template: el('p', {
          attrs: { 'data-empty': "slotText(slots.default) === '' ? '' : undefined" },
        }),
      },
      [{ name: 'children', type: 'string', optional: false }],
    )
    expect(out).toContain('const slotText = (slot')
    expect(out).toContain('isVNode(nodes) && nodes.type === TextVNode')
    expect(out).toContain('slotText($slots.default)')
  })

  it('keeps a removed item of a list presence at its place until it is done', () => {
    const out = probe(
      {
        listPresence: { chips: { of: 'values', key: '(tag: string) => tag' } },
        template: el('ul', {}, [
          each('chips', 'chip', 'chip.key', [
            el('li', { attrs: { 'data-open': 'chip.open' } }, [text('chip.item')]),
          ]),
        ]),
      },
      [{ name: 'values', type: 'string[]', optional: false }],
    )
    expect(out).toContain('const chipsOf = () => props.values')
    expect(out).toContain('watch(chipsOf, (now, before) =>')
    expect(out).toContain("{ flush: 'sync' }")
    expect(out).toContain('open: false, done: () =>')
    expect(out).toContain('v-for="chip in chips"')
  })

  it('reads a part’s props from the registry when it lists them under the member', () => {
    const shell = describeMember({
      member: 'Probe',
      dir: 'structure',
      recipe: null,
      parts: [{ name: 'Group', public: true, purpose: 'a group', template: slot() }],
      template: [],
      states: [],
    })
    const component = {
      name: 'Probe',
      purpose: 'A probe',
      spec: null,
      props: [
        { name: 'label', type: 'string', optional: false },
        { name: 'Group.title', type: 'string', optional: false },
        { name: 'Group.children', type: 'ReactNode', optional: false },
      ],
      grid: null,
    }
    const part = partShell(shell, shell.parts![0]!, component)
    expect(part.component.props.map((prop) => prop.name)).toEqual(['title', 'children'])
    const declared = describeMember({
      ...shell,
      parts: [{ ...shell.parts![0]!, props: { title: { type: 'string' } } }],
    })
    expect(() => partShell(declared, declared.parts![0]!, component)).toThrow(
      /declares props the registry lists/,
    )
  })
})

describe('the Vue fixture renderer writes what an entry says', () => {
  const context = {
    locations: new Map([
      ['Probe', { home: 'vocabulary' as const, dir: 'structure' }],
      ['Badge', { home: 'vocabulary' as const, dir: 'structure' }],
      ['Button', { home: 'vocabulary' as const, dir: 'controls' }],
    ]),
    owners: new Map<string, string>(),
    source: 'probe.ts',
  }
  const states = (shell: Partial<MemberShell>) =>
    renderVueStates(
      describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: 'structure/probe',
        template: [],
        states: [],
        ...shell,
      }),
      { name: 'Probe', purpose: 'A probe', spec: null, props: [], grid: null },
      context,
    )

  it('renders another member’s node inside a prop value', () => {
    const out = states({
      states: [
        {
          name: 'member',
          props: { items: [{ term: 'Status', detail: node(fx('Badge', { label: 'Open' })) }] },
        },
      ],
    })
    expect(out).toContain("detail: h(Badge, { label: 'Open' })")
    expect(out).toContain("import Badge from './Badge.vue'")
  })

  it('renders a function that returns another member’s node, reading its parameters', () => {
    const out = states({
      states: [
        {
          name: 'cells',
          props: {
            cell: renders(
              ['row: { status: string }'],
              fx(
                'Badge',
                { tone: js("row.status === 'solved' ? 'success' : 'info'") },
                { default: [js('row.status')] },
              ),
            ),
          },
        },
      ],
    })
    expect(out).toContain(
      "cell: (row: { status: string }) => h(Badge, { tone: row.status === 'solved' ? 'success' : 'info' }, { default: () => [row.status] })",
    )
    expect(out).toContain("import Badge from './Badge.vue'")
  })

  it('passes a function for the member’s own render prop as a scoped slot', () => {
    // A render prop is a scoped slot in Vue, so `h()` takes it with the slots, not the props.
    const out = renderVueStates(
      describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: 'structure/probe',
        template: [],
        states: [
          {
            name: 'detail',
            props: {
              label: 'Rows',
              detail: renders(
                ['row: { status: string }'],
                fx('Badge', {}, { default: [js('row.status')] }),
              ),
            },
          },
        ],
      }),
      {
        name: 'Probe',
        purpose: 'A probe',
        spec: null,
        props: [
          { name: 'label', type: 'string', optional: false },
          {
            name: 'detail',
            type: '((row: { status: string }) => ReactNode) | undefined',
            optional: true,
          },
        ],
        grid: null,
      },
      context,
    )
    expect(out).toContain(
      "h(Probe, { label: 'Rows', ...overrides }, { detail: (row: { status: string }) => [h(Badge, {}, { default: () => [row.status] })] })",
    )
  })

  it('gives a fixture element the recipe’s classes, importing the recipe', () => {
    const out = states({
      states: [
        {
          name: 'boxed',
          slots: {
            default: [{ element: 'div', class: ['harness', 'harnessNarrow'], children: ['x'] }],
          },
        },
      ],
    })
    expect(out).toContain("h('div', { class: [styles.harness, styles.harnessNarrow] }, ['x'])")
    expect(out).toContain("import styles from '@polymorph/recipes/structure/probe.module.css'")
    const boxed = states({
      states: [
        {
          name: 'in a box',
          many: {
            within: { element: 'div', class: ['harness'] },
            each: [{ props: { label: 'A' } }],
          },
        },
      ],
    })
    expect(boxed).toContain(
      "h('div', { class: styles.harness }, [h(Probe, { label: 'A', ...overrides })])",
    )
  })

  it('imports the machine’s module for a value constructed from it, and only then', () => {
    const out = states({
      machine: { of: 'date-picker', context: {} },
      states: [{ name: 'dated', props: { value: js("zag.parse('2026-07-15')") } }],
    })
    expect(out).toContain("import * as zag from '@zag-js/date-picker'")
    expect(out).toContain("value: zag.parse('2026-07-15')")
    expect(() => states({ states: [{ name: 'x', props: { value: js('zag.parse()') } }] })).toThrow(
      /reads `zag`, and it binds no machine/,
    )
    expect(states({ states: [{ name: 'x', props: { value: js('a.zag.b') } }] })).not.toContain(
      '@zag-js',
    )
  })

  it('makes an entry that holds state a component that holds it, types and renders what comes before', () => {
    const out = states({
      states: [
        {
          name: 'launcher',
          holds: { open: false },
          before: [fx('Button', { label: 'Open', onClick: hold('open', true) })],
          props: { open: held('open'), onOpenChange: hold('open') },
          types: { into: '[data-member="probe"] input', text: 'ticket' },
        },
      ],
    })
    expect(out).toContain("import { h, onBeforeUnmount, onMounted, reactive } from 'vue'")
    expect(out).toContain('const held = reactive({ open: false })')
    expect(out).toContain("h(Button, { label: 'Open', onClick: () => { held.open = true } })")
    expect(out).toContain(
      'h(Probe, { open: held.open, onOpenChange: (value: typeof held.open) => { held.open = value }, ...overrides })',
    )
    expect(out).toContain("field.dispatchEvent(new Event('input', { bubbles: true }))")
    expect(() => states({ states: [{ name: 'stray', props: { open: held('open') } }] })).toThrow(
      /reads a held value it does not hold/,
    )
    const laidOut = states({
      states: [
        {
          name: 'two launchers',
          holds: { small: false },
          before: [fx('Button', { label: 'Small', onClick: hold('small', true) })],
          many: {
            within: { member: 'Badge', props: {} },
            each: [{ props: { open: held('small'), onOpenChange: hold('small') } }],
          },
        },
      ],
    })
    expect(laidOut).toContain(
      "h({ setup() { const held = reactive({ small: false }); return () => [h(Badge, {}, { default: () => [h(Button, { label: 'Small', onClick: () => { held.small = true } }), h(Probe, {",
    )
  })

  it('reads a branded value only when it has no other key', () => {
    const out = states({ states: [{ name: 'data', props: { value: { js: 'x', other: 1 } } }] })
    expect(out).toContain("value: { js: 'x', other: 1 }")
  })
})

describe('the language’s effects that hold a listener or undo what they did', () => {
  const component = (props: { name: string; type: string; optional: boolean }[] = []) => ({
    name: 'Probe',
    purpose: 'A probe',
    spec: null,
    props,
    grid: null,
  })
  const probe = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    state: { count: '0' },
    template: el('span'),
    effects: [
      { listen: 'keydown', run: "$event.key === 'F8' && (count += 1)" },
      { run: 'subscribe(() => { count += 1 })', release: 'ran()' },
      { watch: 'count', run: 'raise()', release: 'lower()' },
    ],
    states: [],
  })
  const locations = new Map([['Probe', { home: 'vocabulary' as const, dir: 'structure' }]])
  const vueContext = { locations, owners: new Map<string, string>(), source: 'probe.ts' }

  it('adds a document listener, with the event as `$event`, removed on unmount', () => {
    const out = renderVueMember(probe, component(), vueContext)
    expect(out).toContain(
      "const listener = ($event: DocumentEventMap['keydown']) => { $event.key === 'F8' && (count.value += 1) }",
    )
    expect(out).toContain("document.addEventListener('keydown', listener)")
    expect(out).toContain("release1 = () => document.removeEventListener('keydown', listener)")
    expect(out).toContain('onBeforeUnmount(() => release1?.())')
  })

  it('keeps what `run` returned as `ran` when the release reads it, and runs the release first', () => {
    const out = renderVueMember(probe, component(), vueContext)
    expect(out).toContain('const ran = subscribe(() => { count.value += 1 })')
    expect(out).toContain('release2 = () => { ran() }')
    expect(out).toContain('  release3?.()\n  raise()\n  release3 = () => { lower() }')
    expect(out).not.toContain('const ran = raise')
  })

  it('writes both in Svelte and in Solid', () => {
    const svelte = renderSvelteMember(probe, component(), {
      ...svelteContext(registry, members),
      locations: new Map([...svelteContext(registry, members).locations, ...locations]),
      source: 'probe.ts',
    })
    expect(svelte).toContain("const listener = (event: DocumentEventMap['keydown'])")
    expect(svelte).toContain('const ran = subscribe(')
    const solid = renderSolidMember(probe, component(), vueContext)
    expect(solid).toContain("document.addEventListener('keydown', listener)")
    expect(solid).toContain('const ran = subscribe(')
  })

  it('refuses an effect that listens and observes, or releases and waits', () => {
    expect(() =>
      renderVueMember(
        { ...probe, effects: [{ listen: 'keydown', run: 'a()', resize: ['b'] }] },
        component(),
        vueContext,
      ),
    ).toThrow(/both listens and observes or waits/)
    expect(() =>
      renderVueMember(
        { ...probe, effects: [{ run: 'a()', release: 'b()', delay: '1' }] },
        component(),
        vueContext,
      ),
    ).toThrow(/both releases and observes, waits or listens/)
  })
})

describe('a fixture that names the foundation’s values, or renders a part on its own', () => {
  const owner = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    template: el('div'),
    parts: [
      {
        name: 'Item',
        public: true,
        purpose: 'one row',
        props: { label: { type: 'string' } },
        template: el('span', {}, [text('label')]),
      },
    ],
    states: [
      { name: 'dated', props: { value: js('new Time(9, 0)') } },
      { name: 'raised', props: { onClick: js("() => toast({ title: 'Saved' })") } },
      { name: 'typed', props: { value: js("zag.parse('2026-07-15') as zag.CalendarDate") } },
      { name: 'a row', part: 'Item', props: { label: 'Inbox' } },
    ],
  })
  const locations = new Map([
    ['Probe', { home: 'vocabulary' as const, dir: 'structure' }],
    ['ProbeItem', { home: 'vocabulary' as const, dir: 'structure' }],
  ])
  const component = {
    name: 'Probe',
    purpose: 'A probe',
    spec: null,
    props: [
      { name: 'value', type: 'unknown', optional: true },
      { name: 'onClick', type: '(() => void) | undefined', optional: true },
    ],
    grid: null,
  }
  const withMachine = { ...owner, machine: { of: 'date-picker', context: {} } }

  it('imports a value it names from the foundation, and not a name only a type holds', () => {
    const out = renderVueStates(withMachine, component, {
      locations,
      owners: new Map(),
      source: 'probe.ts',
    })
    expect(out).toContain("import { Time, toast, type ComponentStates } from '@polymorph/vue'")
    expect(out).toContain('value: new Time(9, 0)')
    expect(out).not.toMatch(/import \{[^}]*CalendarDate[^}]*\} from '@polymorph\/vue'/)
  })

  it('renders a part as the entry’s root, with the runner’s overrides', () => {
    const out = renderVueStates(withMachine, component, {
      locations,
      owners: new Map(),
      source: 'probe.ts',
    })
    expect(out).toContain("h(ProbeItem, { label: 'Inbox', ...overrides })")
    expect(out).toContain("import ProbeItem from './ProbeItem.vue'")
    expect(() =>
      renderVueStates({ ...owner, states: [{ name: 'stray', part: 'Missing' }] }, component, {
        locations,
        owners: new Map(),
        source: 'probe.ts',
      }),
    ).toThrow(/renders Missing, which is not one of its public parts/)
  })

  it('does both in Svelte and in Solid', () => {
    const shared = svelteContext(registry, members)
    const svelte = renderSvelteStates(withMachine, component, {
      ...shared,
      locations: new Map([...shared.locations, ...locations]),
      props: new Map([
        ...shared.props,
        ['Probe', svelteInterface(component).props],
        [
          'ProbeItem',
          svelteInterface({
            ...component,
            name: 'ProbeItem',
            props: [{ name: 'label', type: 'string', optional: false }],
          }).props,
        ],
      ]),
      source: 'probe.ts',
    })
    expect(svelte).toMatch(/import \{[^}]*Time[^}]*toast[^}]*\} from '@polymorph\/svelte'/)
    expect(svelte).toContain('<ProbeItem label="Inbox" {...overrides} />')
    const solid = renderSolidStates(withMachine, component, {
      locations,
      owners: new Map(),
      source: 'probe.ts',
    })
    expect(solid).toMatch(/import \{[^}]*Time[^}]*\} from '@polymorph\/solid'/)
    expect(solid).toContain('<ProbeItem label="Inbox" {...overrides} />')
  })
})

describe('a slot read as a node another component draws', () => {
  const shell = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    derived: { content: 'slotNode(slots.footer)' },
    template: el('span'),
    states: [],
  })
  const component = {
    name: 'Probe',
    purpose: 'A probe',
    spec: null,
    props: [{ name: 'footer', type: 'ReactNode', optional: true }],
    grid: null,
  }
  const locations = new Map([['Probe', { home: 'vocabulary' as const, dir: 'structure' }]])

  it('is the foundation’s `slotNode` in Vue, the snippet in Svelte and the read slot in Solid', () => {
    const vue = renderVueMember(shell, component, {
      locations,
      owners: new Map(),
      source: 'probe.ts',
    })
    expect(vue).toContain('const content = computed(() => (slotNode(slots.footer)))')
    expect(vue).toMatch(/import \{[^}]*slotNode[^}]*\} from '@polymorph\/vue'/)
    const shared = svelteContext(registry, members)
    const svelte = renderSvelteMember(shell, component, {
      ...shared,
      locations: new Map([...shared.locations, ...locations]),
      source: 'probe.ts',
    })
    expect(svelte).toContain('const content = $derived(footer)')
    const solid = renderSolidMember(shell, component, {
      locations,
      owners: new Map(),
      source: 'probe.ts',
    })
    expect(solid).toContain('footerSlot.filled() ? footerSlot() : undefined')
  })
})

describe('an expression’s qualified type names', () => {
  it('leave the right side of a qualified name alone', () => {
    expect(rewrite('value as zag.CalendarDate', (name) => `x.${name}`)).toBe(
      'x.value as x.zag.CalendarDate',
    )
  })
})

describe('a presence’s side and alignment, written or chosen by a prop', () => {
  const shell = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    presence: {
      present: {
        open: 'true',
        ref: 'panel',
        binding: 'tooltip.bubble',
        side: { expr: 'side' },
        align: 'start',
      },
    },
    template: el('div', { ref: 'panel' }),
    states: [],
  })
  const component = {
    name: 'Probe',
    purpose: 'A probe',
    spec: null,
    props: [{ name: 'side', type: '"top" | "bottom"', optional: false }],
    grid: null,
  }
  const locations = new Map([['Probe', { home: 'vocabulary' as const, dir: 'structure' }]])
  const context = { locations, owners: new Map<string, string>(), source: 'probe.ts' }

  it('reads a chosen one each time the element plays, in every renderer', () => {
    expect(renderVueMember(shell, component, context)).toContain(
      "usePresence(() => true, panel, 'tooltip.bubble', { get side() { return props.side }, align: 'start' })",
    )
    const shared = svelteContext(registry, members)
    expect(
      renderSvelteMember(shell, component, {
        ...shared,
        locations: new Map([...shared.locations, ...locations]),
        source: 'probe.ts',
      }),
    ).toContain("{ get side() { return side }, align: 'start' }")
    expect(renderSolidMember(shell, component, context)).toContain(
      "{ get side() { return props.side }, align: 'start' }",
    )
    expect(renderAngularMember(shell, component, angularContext(locations), new Set())).toContain(
      "() => ({ side: this.$p.side, align: 'start' })",
    )
  })
})

describe('whether a slot is filled', () => {
  /*
   * `slots.output` is rewritten to what each foundation holds for the slot: the
   * slot function in Vue, the snippet in Svelte, and a boolean in Solid and
   * Angular (`filled()`). Compared with `undefined`, the boolean is always
   * different, so the condition is true with an empty slot. `cond('slots.x', …)`
   * and `Boolean(slots.x)` read the same in all four.
   */
  it('is read as a condition, never compared with `undefined`, in every description', () => {
    const directory = resolve(import.meta.dirname, 'members')
    const compared = readdirSync(directory)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .filter((file) =>
        /\bslots\.\w+\s*[!=]==?\s*undefined/.test(readFileSync(resolve(directory, file), 'utf8')),
      )
    expect(compared).toEqual([])
  })
})

describe('a slot outlet every renderer writes the same way', () => {
  const component = {
    name: 'Probe',
    purpose: 'A probe',
    spec: null,
    props: [
      { name: 'children', type: 'ReactNode', optional: true },
      { name: 'max', type: 'number | undefined', optional: true },
    ],
    grid: null,
  }
  const locations = new Map([['Probe', { home: 'vocabulary' as const, dir: 'structure' }]])
  const context = { locations, owners: new Map<string, string>(), source: 'probe.ts' }
  const outlets = {
    'takes elements it passes nothing': slot('default', { take: 'max' }),
    'passes props and has slot props or a fallback': slot('default', {
      pass: { label: "'x'" },
      fallback: [text("'none'")],
    }),
  }

  for (const [refusal, outlet] of Object.entries(outlets)) {
    it(`is refused when it ${refusal}, by every renderer`, () => {
      const shell = describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: null,
        template: el('div', {}, [outlet]),
        states: [],
      })
      const shared = svelteContext(registry, members)
      const renders = [
        () => renderVueMember(shell, component, context),
        () =>
          renderSvelteMember(shell, component, {
            ...shared,
            locations: new Map([...shared.locations, ...locations]),
            source: 'probe.ts',
          }),
        () => renderSolidMember(shell, component, context),
        () => renderAngularMember(shell, component, angularContext(locations), new Set()),
      ]
      for (const render of renders) expect(render).toThrow(new RegExp(refusal))
    })
  }

  it('is refused when it passes props and gives slot props', () => {
    expect(() =>
      checkSlots('Probe', [slot('default', { pass: { label: "'x'" }, props: { item: 'x' } })]),
    ).toThrow(/passes props and has slot props or a fallback/)
  })

  it('gives a scoped slot its props as named values, in every renderer', () => {
    // DataTable's `rowDetail` takes `{ row, close }`: one object in React, the same names in each.
    const rows = {
      name: 'Probe',
      purpose: 'A probe',
      spec: null,
      props: [
        { name: 'rows', type: 'string[]', optional: false },
        {
          name: 'detail',
          type: '((detail: { row: string; count: number }) => ReactNode) | undefined',
          optional: true,
        },
      ],
      grid: null,
    }
    const shell = describeMember({
      member: 'Probe',
      dir: 'structure',
      recipe: null,
      template: el('ul', {}, [
        each('rows', 'row', 'row', [
          el('li', {}, [slot('detail', { props: { row: 'row', count: 'rows.length' } })]),
        ]),
      ]),
      states: [],
    })
    const shared = svelteContext(registry, members)
    // Named slot props. Binding the row as the props (`v-bind="row"`) would hand a copy of it.
    const vue = renderVueMember(shell, rows, context)
    expect(vue).toContain('<slot name="detail" :row="row" :count="rows.length" />')
    expect(vue).not.toContain('v-bind="row"')
    expect(
      renderSvelteMember(shell, rows, {
        ...shared,
        locations: new Map([...shared.locations, ...locations]),
        source: 'probe.ts',
      }),
    ).toContain('{@render detail?.({ row: row, count: rows.length })}')
    // A loop's item is handed on as the caller put it in the list.
    expect(renderSolidMember(shell, rows, context)).toContain(
      'props.detail?.({ row: itemOf(row), count: props.rows.length })',
    )
    // The template reads each prop by its name, which `bindSlot` gives it.
    expect(renderAngularMember(shell, rows, angularContext(locations), new Set())).toContain(
      'bindSlot(this.$p.detail, { row: row, count: this.$p.rows.length })',
    )
  })
})

describe('every generated vocabulary exports the React vocabulary’s types', () => {
  /** The names a module's export declarations export, each with the module it re-exports from. */
  const exportsOf = (path: string, text: string): Map<string, string | null> => {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true)
    const out = new Map<string, string | null>()
    for (const statement of source.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause)
      ) {
        const from =
          statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
            ? statement.moduleSpecifier.text
            : null
        for (const element of statement.exportClause.elements) out.set(element.name.text, from)
      } else if (
        (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        out.set(statement.name.text, null)
      }
    }
    return out
  }

  /** The type names `@polymorph/react-ui` exports, each with the module it re-exports from. */
  const reactTypes = (): Map<string, string> => {
    const path = resolve(ROOT, 'packages/react-ui/src/index.ts')
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ESNext)
    const out = new Map<string, string>()
    for (const statement of source.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        statement.exportClause === undefined ||
        !ts.isNamedExports(statement.exportClause) ||
        statement.moduleSpecifier === undefined ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue
      for (const element of statement.exportClause.elements) {
        if (statement.isTypeOnly || element.isTypeOnly)
          out.set(element.name.text, statement.moduleSpecifier.text)
      }
    }
    return out
  }

  for (const target of TARGETS) {
    it(`${target.name}: each one, under its name, or an exception says why not`, () => {
      const path = `packages/${target.name}-ui/src/index.ts`
      const index = exportsOf(path, generated.get(path) ?? '')
      const react = reactTypes()
      const foundation = `@polymorph/${target.name}`
      expect(
        [...react.keys()].filter((name) => !index.has(name) && !unexported(name, target.name)),
        'export it from the member that owns it (a description’s `types`), or name it in UNEXPORTED_TYPES',
      ).toEqual([])
      // The React foundation's types are this framework's foundation's.
      expect(
        [...react]
          .filter(([name, from]) => from === '@polymorph/react' && index.has(name))
          .filter(([name]) => index.get(name) !== foundation)
          .map(([name]) => name),
      ).toEqual([])
      // An exception names a type the React vocabulary exports and this vocabulary does not.
      expect(
        Object.keys(UNEXPORTED_TYPES).filter(
          (name) => unexported(name, target.name) && (!react.has(name) || index.has(name)),
        ),
      ).toEqual([])
    })
  }

  it('re-exports from a foundation only the types the React vocabulary exports', () => {
    const react = reactTypes()
    expect(FOUNDATION_TYPE_EXPORTS.filter((name) => !react.has(name))).toEqual([])
  })
})

describe('the agent block', () => {
  const component = {
    name: 'Probe',
    purpose: 'A probe',
    spec: null,
    props: [
      { name: 'label', type: 'string', optional: true },
      { name: 'tone', type: '"neutral" | "danger"', optional: true },
    ],
    grid: null,
  }
  const probe = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    state: { draft: "''" },
    agent: {
      on: 'field',
      state: { label: 'label', draft: 'draft' },
      actions: {
        clear: "draft = ''",
        'fill-in': { argument: 'text', run: 'draft = value' },
      },
      secret: ['draft'],
      destructive: "tone === 'danger'",
    },
    template: el('div', {}, [el('input', { ref: 'field' })]),
    states: [],
  })
  const locations = new Map([['Probe', { home: 'vocabulary' as const, dir: 'structure' }]])
  const context = { locations, owners: new Map<string, string>(), source: 'probe.ts' }
  const renders: Record<string, (shell: MemberShell) => string> = {
    vue: (shell) => renderVueMember(shell, component, context),
    svelte: (shell) => {
      const shared = svelteContext(registry, members)
      return renderSvelteMember(shell, component, {
        ...shared,
        locations: new Map([...shared.locations, ...locations]),
        source: 'probe.ts',
      })
    },
    solid: (shell) => renderSolidMember(shell, component, context),
    angular: (shell) => renderAngularMember(shell, component, angularContext(locations), new Set()),
  }

  /*
   * Each closure reads the scope through the framework's live spelling: a
   * cell's `.value`, a prop through `props` or the member's `$p`, or Svelte's
   * rune, which its compiler reads again on each call. A closure that held a
   * copy of the value would read what the member showed when it mounted.
   */
  const live: Record<string, string[]> = {
    vue: [
      'element: () => field.value',
      'label: (props.label)',
      'draft: (draft.value)',
      "draft.value = ''",
      'draft.value = value',
      "(props.tone === 'danger')",
    ],
    svelte: [
      'element: () => field',
      'label: (label)',
      'draft: (draft)',
      "draft = ''",
      'draft = value',
      "(tone === 'danger')",
    ],
    solid: [
      'element: () => field.value',
      'label: (props.label)',
      'draft: (draft.value)',
      "draft.value = ''",
      'draft.value = value',
      "(props.tone === 'danger')",
    ],
    angular: [
      'element: () => this.field.value',
      'label: (this.$p.label)',
      'draft: (this.draft.value)',
      "this.draft.value = ''",
      'this.draft.value = value',
      "(this.$p.tone === 'danger')",
    ],
  }

  for (const [framework, render] of Object.entries(renders)) {
    it(`${framework}: registers on mount with closures over the live scope, and removes it on unmount`, () => {
      const out = render(probe)
      expect(out).toContain("const ran = agentMember({ member: 'Probe'")
      expect(out).toMatch(/release\d+ = \(\) => \{\s*ran\(\)\s*\}/)
      expect(out).toMatch(/import \{[^}]*\bagentMember\b[^}]*\} from '@polymorph\//)
      for (const fragment of live[framework] ?? []) expect(out).toContain(fragment)
      // An action with an argument reads it as `value`; a name that is not an identifier is quoted.
      expect(out).toContain("'fill-in': { argument: 'text', run: (value) =>")
      expect(out).toContain("secret: ['draft']")
      expect(out).toContain('destructive: () => Boolean(')
    })
  }

  /** The element expression, as each renderer spells a read of the ref it starts from. */
  const drawn: Record<string, string> = {
    vue: "element: () => field.value?.querySelector('input')",
    svelte: "element: () => field?.querySelector('input')",
    solid: "element: () => field.value?.querySelector('input')",
    angular: "element: () => this.field.value?.querySelector('input')",
  }

  for (const [framework, render] of Object.entries(renders)) {
    it(`${framework}: reads the element from an expression when a member it renders draws it`, () => {
      const out = render({
        ...probe,
        agent: {
          ...(probe.agent as NonNullable<MemberShell['agent']>),
          element: "field?.querySelector('input')",
        },
      })
      expect(out).toContain(drawn[framework])
    })
  }

  type Block = NonNullable<MemberShell['agent']>
  const refusals: [string, Partial<Block>, RegExp][] = [
    [
      'an element the template does not name',
      { on: 'missing' },
      /no element of the template has as its ref/,
    ],
    [
      'a name that is not lower-case words joined by "-"',
      { state: { Label: 'label' } },
      /not lower-case words/,
    ],
    ['a name with an underscore', { actions: { fill_in: "draft = ''" } }, /not lower-case words/],
    [
      'an argument outside the list',
      { actions: { pick: { argument: 'date' as never, run: 'value' } } },
      /argument "date"/,
    ],
    ['a secret it declares no state for', { secret: ['value'] }, /declares no state for/],
    [
      'among on an action that takes no id',
      { actions: { 'fill-in': { argument: 'text', among: 'label', run: 'draft = value' } } },
      /gives "fill-in" `among`, which names the list an id or ids argument chooses from/,
    ],
    [
      'among naming a state it does not declare',
      { actions: { pick: { argument: 'id', among: 'series', run: 'draft = value' } } },
      /gives "pick" `among: 'series'`, which it declares no state for/,
    ],
  ]

  for (const [framework, render] of Object.entries(renders)) {
    it(`${framework}: hands the bridge the list an id action chooses among`, () => {
      const out = render({
        ...probe,
        agent: {
          ...(probe.agent as Block),
          actions: {
            ...(probe.agent as Block).actions,
            pick: { argument: 'id', among: 'label', run: 'draft = value' },
          },
        },
      })
      expect(out).toContain("pick: { argument: 'id', among: 'label', run: (value) =>")
      expect(out).toContain("'fill-in': { argument: 'text', run: (value) =>")
    })
  }

  for (const [what, change, refusal] of refusals) {
    it(`refuses ${what}, in every renderer`, () => {
      const shell = { ...probe, agent: { ...(probe.agent as Block), ...change } }
      expect(() => checkAgent(shell)).toThrow(refusal)
      for (const render of Object.values(renders)) expect(() => render(shell)).toThrow(refusal)
    })
  }

  it('lets a state and an action share a name, as the spec’s fence does, in every renderer', () => {
    // `state open boolean` and `action open sets open`: the handle keeps them in two objects.
    const shell = {
      ...probe,
      agent: { ...(probe.agent as Block), actions: { label: "draft = ''" } },
    }
    expect(() => checkAgent(shell)).not.toThrow()
    for (const render of Object.values(renders)) {
      const out = render(shell)
      expect(out).toContain('label: (')
      expect(out).toMatch(/actions: \{ label: \(\) =>/)
    }
  })

  it('registers a part’s block under its member’s name, in every renderer', () => {
    // Toast renders nothing, and its viewport, a part, registers as `Toast`.
    const owner = { ...probe, member: 'Holder' }
    const { shell } = partShell(owner, {
      name: 'Viewport',
      public: true,
      purpose: 'the holder’s viewport',
      props: { label: { type: 'string' } },
      template: probe.template,
      agent: probe.agent as Block,
    })
    expect(shell.member).toBe('HolderViewport')
    expect(shell.agent?.member).toBe('Holder')
    for (const render of Object.values(renders)) {
      expect(render({ ...probe, agent: shell.agent })).toContain(
        "const ran = agentMember({ member: 'Holder'",
      )
    }
  })

  it('refuses an element a loop renders once per item', () => {
    const shell = {
      ...probe,
      template: el('ul', {}, [each('items', 'item', 'item', [el('li', { ref: 'field' })])]),
    }
    expect(() => checkAgent(shell)).toThrow(/a loop renders once per item/)
  })

  it('refuses, in Svelte, a value named after a rune the component writes', () => {
    // The agent block reads the element ref, which Svelte holds in `$state`.
    const shell = { ...probe, derived: { state: "'open'" } }
    expect(() => renders['svelte']?.(shell)).toThrow(
      /names a derived value "state", which Svelte reads as a store of the \$state rune/,
    )
  })

  it('is checked for every description as the descriptions are read', () => {
    const described = members.filter((shell) => shell.agent !== undefined)
    expect(described.map((shell) => shell.member)).toContain('Checkbox')
    for (const shell of described) expect(() => checkAgent(shell)).not.toThrow()
  })
})
