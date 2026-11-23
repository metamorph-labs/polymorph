import { describe, expect, it } from 'vitest'

import type { RegistryMemberLike } from './common'
import {
  describeMember,
  el,
  fx,
  held,
  hold,
  js,
  node,
  portal,
  renders,
  slot,
  type MemberShell,
} from './dsl'
import {
  codecOf,
  dataShape,
  elementMethods,
  elementShape,
  elementShapes,
  renderElementsDefinition,
  renderElementsIndex,
  renderElementsLoaders,
  renderElementsPending,
  renderElementsStates,
  typeNode,
  type DataTypes,
  type Declared,
  type ElementShape,
} from './elements'

/**
 * The elements renderer's own checks: how it reads a prop, what a definition
 * module holds, and what it writes for each construct of a states fixture. The
 * freshness law over every target is in `shells.test.ts`; the elements'
 * laws are in `packages/elements-ui`.
 */

type Prop = { name: string; type: string; optional: boolean }

const component = (name: string, props: Prop[]): RegistryMemberLike => ({
  name,
  purpose: `${name}, a probe`,
  spec: null,
  props,
  grid: null,
})

const shellOf = (shell: Partial<MemberShell> & { member: string }): MemberShell =>
  describeMember({ dir: 'structure', recipe: null, template: [], states: [], ...shell })

describe('a prop’s type is read into the codec its attribute reads through', () => {
  it('reads text, numbers and presence', () => {
    expect(codecOf('string | undefined')).toBe('string')
    expect(codecOf('number | undefined')).toBe('number')
    expect(codecOf('false | true')).toBe('boolean')
    expect(codecOf('string | null | undefined')).toBe('string')
  })

  it('reads a union of string or number literals as text or a number', () => {
    expect(codecOf('"sm" | "md" | "lg"')).toBe('string')
    expect(codecOf('0 | 1 | 2 | 3')).toBe('number')
  })

  it('keeps the literals of a union that mixes them, or holds a boolean or data', () => {
    expect(codecOf('false | true | "indeterminate"')).toEqual({
      union: ['indeterminate'],
      boolean: true,
    })
    expect(codecOf('"auto" | number')).toEqual({ union: ['auto'], number: true })
    expect(codecOf('"none" | 1 | 2')).toEqual({ union: ['none', 1, 2] })
    expect(codecOf('string | string[]')).toEqual({ union: [], string: true, json: true })
  })

  it('reads data as JSON, a date or a time as its ISO text, and a function or a ref as a property', () => {
    expect(codecOf('TabDescriptor[]')).toBe('json')
    expect(codecOf('{ label: string; onClick: () => void } | undefined')).toBe('json')
    expect(codecOf('Time | null | undefined')).toEqual({ temporal: 'time' })
    expect(codecOf('CalendarDate | null | CalendarDateTime')).toEqual({ temporal: 'date' })
    expect(codecOf('DateRange | null | undefined')).toEqual({ temporal: 'range' })
    expect(codecOf('((value: number) => string) | undefined')).toBe('property')
    expect(codecOf('Ref<HTMLInputElement> | undefined')).toBe('property')
  })

  it('reads a set from a JSON array of its members', () => {
    expect(codecOf('ReadonlySet<string> | undefined')).toBe('set')
  })

  it('refuses what an attribute cannot hold', () => {
    expect(() => codecOf('ReadonlySet<string> | string')).toThrow(/no set mixed/)
    expect(() => codecOf('Time | string')).toThrow(/no date mixed/)
  })
})

describe('a data prop’s type is read through the types it names', () => {
  const types: DataTypes = new Map<string, Declared>([
    ['PagerMessages', typeNode('{ next: string; page: (page: number) => string }')],
    ['LooseMessages', typeNode('{ next?: string; count?: (count: number) => string }')],
    ['Spoken', typeNode('(step: number) => string')],
    ['Leaf', typeNode("{ kind?: 'item'; label: string; onSelect: () => void }")],
    ['Entry', typeNode("Leaf | { kind: 'sub'; label: string; items: Leaf[] }")],
    ['Topbar', typeNode('{ leading?: VNode; trailing?: VNode }')],
    ['Tree', typeNode('{ id: string; children?: Tree[] }')],
    [
      'EmptyStateProps',
      [
        { name: 'title', type: 'string', optional: false },
        { name: 'action', type: 'ReactNode', optional: true },
      ],
    ],
  ])

  it('makes a prop whose value must hold a function a property only', () => {
    expect(dataShape('PagerMessages | undefined', types).functions).toBe(true)
    expect(dataShape('Spoken | undefined', types).functions).toBe(true)
    // A function the type leaves optional is one JSON can leave out.
    expect(dataShape('LooseMessages | undefined', types).functions).toBe(false)
  })

  it('finds the callbacks an item requires, at each depth of the value', () => {
    const where = [{ field: 'kind', is: ['item', null] }]
    expect(dataShape('Entry[]', types).callbacks).toEqual([
      { at: '', name: 'onSelect', where },
      { at: 'items', name: 'onSelect', where },
    ])
  })

  it('names the literal fields that tell an object that requires a callback from one that does not', () => {
    const toggles: DataTypes = new Map<string, Declared>([
      ['Item', typeNode("{ kind?: 'item'; label: string; onSelect: () => void }")],
      [
        'Check',
        typeNode("{ kind: 'checkbox'; checked: boolean; onCheckedChange: (on: boolean) => void }"),
      ],
    ])
    expect(dataShape('(Item | Check)[]', toggles).callbacks).toEqual([
      { at: '', name: 'onCheckedChange', where: [{ field: 'kind', is: ['checkbox'] }] },
      { at: '', name: 'onSelect', where: [{ field: 'kind', is: ['item', null] }] },
    ])
  })

  it('finds the node fields of the value’s own object, from a description’s type or a member’s props', () => {
    expect(dataShape('Topbar | undefined', types).nodes).toEqual(['leading', 'trailing'])
    expect(dataShape('EmptyStateProps', types).nodes).toEqual(['action'])
    expect(dataShape('{ items: Topbar[] }', types).nodes).toEqual([])
  })

  it('reads a type that holds itself once', () => {
    expect(dataShape('Tree[]', types)).toEqual({ functions: false, callbacks: [], nodes: [] })
  })

  it('writes what it found into the element’s definition', () => {
    const probe = component('Probe', [
      { name: 'messages', type: 'PagerMessages | undefined', optional: true },
      { name: 'items', type: 'Entry[]', optional: false },
      { name: 'topbar', type: 'Topbar | undefined', optional: true },
      { name: 'onChange', type: '((value: string) => void) | undefined', optional: true },
    ])
    const { definition } = elementShape(probe, {}, [], false, { types })
    expect(definition.props.messages).toBe('property')
    const where = [{ field: 'kind', is: ['item', null] }]
    expect(definition.callbacks).toEqual({
      items: [
        { at: '', name: 'onSelect', where, type: 'poly-select' },
        { at: 'items', name: 'onSelect', where, type: 'poly-select' },
      ],
    })
    expect(definition.fields).toEqual({ topbar: ['leading', 'trailing'] })
  })

  it('refuses an item callback whose event is also the member’s own', () => {
    const probe = component('Probe', [
      { name: 'items', type: 'Entry[]', optional: false },
      { name: 'onSelect', type: '((value: string) => void) | undefined', optional: true },
    ])
    expect(() => elementShape(probe, {}, [], false, { types })).toThrow(/also Probe.onSelect/)
  })
})

describe('an element’s shape is the registry’s props, as `vueBinding` reads them', () => {
  const probe = component('Probe', [
    { name: 'value', type: 'string | undefined', optional: true },
    { name: 'open', type: 'false | true', optional: true },
    { name: 'onChange', type: '((value: string) => void) | undefined', optional: true },
    { name: 'onOpenChange', type: '((open: boolean) => void) | undefined', optional: true },
    { name: 'onDismiss', type: '(() => void) | undefined', optional: true },
    { name: 'footer', type: 'ReactNode', optional: true },
    { name: 'children', type: 'ReactNode', optional: true },
    { name: 'rowDetail', type: '((row: Row) => ReactNode) | undefined', optional: true },
  ])
  const shape = elementShape(
    probe,
    { derived: { shown: 'listening.dismiss && open' } },
    [el('div', {}, [slot()]), portal(el('div', {}, [slot('footer')]))],
    false,
  )

  it('makes value props attributes, events `poly-*` events and node props slots', () => {
    expect(shape.definition.tag).toBe('poly-probe')
    expect(Object.keys(shape.definition.props).sort()).toEqual(['open', 'rowDetail', 'value'])
    expect(shape.definition.props.rowDetail).toBe('property')
    expect(shape.definition.events.onOpenChange?.type).toBe('poly-open-change')
    expect(shape.definition.slots).toEqual(['footer', 'children'])
  })

  it('pairs each controlled prop with the event that reports its change', () => {
    expect(shape.definition.controlled).toEqual({ value: 'onChange', open: 'onOpenChange' })
  })

  it('marks the events the description asks whether its caller handles', () => {
    expect(shape.definition.events.onDismiss?.listened).toBe(true)
    expect(shape.definition.events.onChange?.listened).toBeUndefined()
  })

  it('names the slots the anatomy renders only inside a portal', () => {
    expect(shape.definition.overlays).toEqual(['footer'])
  })

  it('marks a public part drawn as a table row structural', () => {
    const table = shellOf({
      member: 'Grid',
      parts: [
        {
          name: 'Row',
          public: true,
          purpose: 'a row',
          props: {},
          template: el('tr', {}, [slot()]),
        },
        {
          name: 'Box',
          public: true,
          purpose: 'a box',
          props: {},
          template: el('div', {}, [slot()]),
        },
        { name: 'Cell', public: false, purpose: 'internal', props: {}, template: el('td') },
      ],
    })
    const registry = {
      components: [component('Grid', [])],
      exceptions: { primitives: [] },
    } as unknown as Parameters<typeof elementShapes>[0]
    const shapes = elementShapes(registry, [table])
    expect(shapes.get('GridRow')?.definition.structural).toBe(true)
    expect(shapes.get('GridRow')?.definition.within).toBe('poly-grid')
    expect(shapes.get('GridBox')?.definition.structural).toBeUndefined()
    expect(shapes.has('GridCell')).toBe(false)
  })
})

/** The shapes a fixture probe composes: Probe, a Badge, a Stack and a Button. */
const SHAPES = new Map<string, ElementShape>(
  [
    component('Probe', [
      { name: 'label', type: 'string', optional: false },
      { name: 'count', type: 'number | undefined', optional: true },
      { name: 'span', type: '"auto" | number | undefined', optional: true },
      { name: 'items', type: 'ProbeItem[]', optional: true },
      { name: 'open', type: 'false | true', optional: true },
      { name: 'format', type: '((value: number) => string) | undefined', optional: true },
      { name: 'onOpenChange', type: '((open: boolean) => void) | undefined', optional: true },
      { name: 'onDismiss', type: '() => void', optional: false },
      { name: 'children', type: 'ReactNode', optional: true },
      { name: 'meta', type: 'ReactNode', optional: true },
    ]),
    component('Badge', [{ name: 'children', type: 'ReactNode', optional: true }]),
    component('Stack', [
      { name: 'gap', type: '0 | 1 | 2 | 3', optional: true },
      { name: 'children', type: 'ReactNode', optional: true },
    ]),
    component('Button', [
      { name: 'label', type: 'string', optional: false },
      { name: 'onClick', type: '((event: MouseEvent) => void) | undefined', optional: true },
    ]),
  ].map((entry) => [
    entry.name,
    elementShape(
      entry,
      entry.name === 'Probe' ? { derived: { x: 'listening.dismiss' } } : {},
      [],
      false,
    ),
  ]),
)

const SHELLS = ['Probe', 'Badge', 'Stack', 'Button'].map((member) =>
  shellOf({ member, dir: member === 'Stack' ? 'layout' : 'structure', recipe: 'structure/probe' }),
)

const statesOf = (states: MemberShell['states']) =>
  renderElementsStates(
    shellOf({ member: 'Probe', recipe: 'structure/probe', states }),
    component('Probe', []),
    SHAPES,
    SHELLS,
  )

describe('a states fixture in element form writes the markup a page writes', () => {
  it('writes props its attributes read back as attributes, and the rest from script', () => {
    const out = statesOf([
      {
        name: 'one',
        props: {
          label: 'Save',
          count: 3,
          items: [{ id: 'a' }],
          open: true,
          format: js('(value) => `${value}%`'),
        },
      },
    ])
    expect(out).toContain(
      `html: \`<poly-probe label="Save" count="3" items='[{"id":"a"}]' open></poly-probe>\``,
    )
    expect(out).toContain("const e0 = find('poly-probe', 0)")
    expect(out).toContain('e0.format = (value) => `${value}%`')
    expect(out).toContain("subject: 'poly-probe'")
  })

  it('writes a boolean that is off as "false", and text a number would read as from script', () => {
    const out = statesOf([{ name: 'off', props: { label: '12', open: false, span: '12' } }])
    expect(out).toContain('<poly-probe label="12" open="false">')
    expect(out).toContain("e0.span = '12'")
  })

  it('handles an event by a listener, and a required one the member asks about by a listener that does nothing', () => {
    const out = statesOf([
      { name: 'handled', props: { label: 'A', onOpenChange: js('() => undefined') } },
    ])
    expect(out).toContain("listen(e0, 'poly-open-change', () => undefined)")
    expect(out).toContain("listen(e0, 'poly-dismiss', () => {})")
    expect(out).toContain("import { listen, type ComponentStates } from '@polymorph/elements'")
  })

  it('holds a value as the page around a controlled member holds it', () => {
    const out = statesOf([
      {
        name: 'held',
        holds: { open: true },
        props: { label: 'A', open: held('open'), onOpenChange: hold('open') },
        before: [fx('Button', { label: 'Open', onClick: hold('open', true) })],
      },
    ])
    expect(out).toContain('const held = holding({ open: true })')
    expect(out).toContain("listen(e0, 'poly-click', () => held.set('open', true))")
    expect(out).toContain("held.bind('open', e1, 'open')")
    expect(out).toContain("listen(e1, 'poly-open-change', (value) => held.set('open', value))")
  })

  it('names a slot on its elements, and writes text in a named slot inside a template', () => {
    const out = statesOf([
      {
        name: 'slots',
        props: { label: 'A' },
        slots: {
          meta: ['2 hours ago'],
          default: [fx('Badge', {}, { default: ['New'] }), { element: 'p', children: ['Body'] }],
        },
      },
      { name: 'named', props: { label: 'A' }, slots: { meta: [fx('Badge')] } },
    ])
    expect(out).toContain('<template slot="meta">2 hours ago</template>')
    expect(out).toContain('<poly-badge>New</poly-badge>')
    expect(out).toContain('<p>Body</p>')
    expect(out).toContain('<poly-badge slot="meta"></poly-badge>')
  })

  it('writes text and elements beside it on one line, as JSX writes no whitespace between them', () => {
    const out = statesOf([
      {
        name: 'inline',
        many: {
          within: { member: 'Stack', props: { gap: 2 } },
          each: [{ props: { label: 'A' } }],
          also: [' and after'],
        },
      },
      {
        name: 'boxed',
        many: { within: { element: 'div', class: ['harness'] }, each: [{ props: { label: 'B' } }] },
      },
    ])
    expect(out).toContain(
      '<poly-stack gap="2"><poly-probe label="A"></poly-probe> and after</poly-stack>',
    )
    expect(out).toContain(
      '<div class="${styles.harness}"><poly-probe label="B"></poly-probe></div>',
    )
    expect(out).toContain("import styles from '@polymorph/recipes/structure/probe.module.css'")
  })

  it('imports the definition module of every element an entry writes', () => {
    const out = statesOf([
      { name: 'stacked', many: { within: { member: 'Stack' }, each: [{ props: { label: 'A' } }] } },
    ])
    expect(out).toContain("import '../layout/Stack'")
    expect(out).toContain("import './Probe'")
  })

  it('escapes what the markup and the template literal would read as their own', () => {
    const out = statesOf([{ name: 'quoted', props: { label: 'a "b" & `c` ${d}' } }])
    expect(out).toContain('label="a &quot;b&quot; &amp; \\`c\\` \\${d}"')
  })

  it('creates a node passed inside a value from script, and a function that returns one', () => {
    const out = statesOf([
      {
        name: 'nodes',
        props: {
          label: 'A',
          items: [{ detail: node(fx('Badge', {}, { default: ['New'] })) }],
          format: renders(
            ['row: Row'],
            fx('Badge', {}, { default: [js('row.name')], meta: [{ element: 'b' }] }),
          ),
        },
      },
    ])
    expect(out).toContain("e0.items = [{ detail: create('poly-badge', {  }, ['New']) }]")
    expect(out).toContain(
      "e0.format = (row: Row) => create('poly-badge', {  }, [row.name, create('b', { slot: 'meta' }, [])])",
    )
    expect(out).toMatch(/import \{ create, [^}]*\} from '@polymorph\/elements'/)
  })

  it('fills an object prop’s node fields with children whose slot names the prop and the field', () => {
    const shapes = new Map(SHAPES)
    const probe = SHAPES.get('Probe') as ElementShape
    shapes.set('Probe', {
      ...probe,
      definition: {
        ...probe.definition,
        props: { ...probe.definition.props, topbar: 'json' },
        fields: { topbar: ['leading', 'secondaryAction'] },
      },
    })
    const out = renderElementsStates(
      shellOf({
        member: 'Probe',
        recipe: 'structure/probe',
        states: [
          {
            name: 'fields',
            props: {
              label: 'A',
              topbar: { title: 'T', secondaryAction: node(fx('Button', { label: 'Go' })) },
            },
          },
        ],
      }),
      component('Probe', []),
      shapes,
      SHELLS,
    )
    expect(out).toContain(`topbar='{"title":"T"}'`)
    expect(out).toContain('<poly-button slot="topbar.secondary-action" label="Go"></poly-button>')
  })

  it('writes a date made in JavaScript as its ISO text', () => {
    const shapes = new Map(SHAPES)
    const probe = SHAPES.get('Probe') as ElementShape
    shapes.set('Probe', {
      ...probe,
      definition: {
        ...probe.definition,
        props: {
          ...probe.definition.props,
          day: { temporal: 'date' },
          at: { temporal: 'time' },
          range: { temporal: 'range' },
        },
      },
    })
    const out = renderElementsStates(
      shellOf({
        member: 'Probe',
        recipe: 'structure/probe',
        states: [
          {
            name: 'dates',
            props: {
              label: 'A',
              day: js("zag.parse('2026-07-15') as zag.CalendarDate"),
              at: js('new Time(9, 5)'),
              range: {
                start: js('new CalendarDate(2026, 6, 1)'),
                end: js('new CalendarDate(2026, 6, 14)'),
              },
            },
          },
        ],
      }),
      component('Probe', []),
      shapes,
      SHELLS,
    )
    expect(out).toContain('day="2026-07-15" at="09:05" range="2026-06-01/2026-06-14"')
    expect(out).not.toContain('zag')
  })

  it('imports the machine module as types when the fixture names only its types', () => {
    const write = (format: string) =>
      renderElementsStates(
        shellOf({
          member: 'Probe',
          recipe: 'structure/probe',
          machine: { of: 'date-picker', context: {} },
          states: [{ name: 'typed', props: { label: 'A', format: js(format) } }],
        }),
        component('Probe', []),
        SHAPES,
        SHELLS,
      )
    expect(write('(date: zag.CalendarDate) => String(date)')).toContain(
      "import type * as zag from '@zag-js/date-picker'",
    )
    expect(write('() => zag.parse("2026-07-15")')).toContain(
      "import * as zag from '@zag-js/date-picker'",
    )
  })

  it('names the field an entry types into and the control it presses, for the mount', () => {
    const out = statesOf([
      {
        name: 'typed',
        props: { label: 'A' },
        types: { into: 'input', text: 'ab' },
        presses: 'button',
      },
    ])
    expect(out).toContain("types: { into: 'input', text: 'ab' }")
    expect(out).toContain("presses: 'button'")
  })

  it('names the words an entry selects, for the mount', () => {
    const out = statesOf([
      { name: 'selected', props: { label: 'A' }, selects: { in: '[role="textbox"]', text: 'ab' } },
    ])
    expect(out).toContain(`selects: { in: '[role="textbox"]', text: 'ab' }`)
  })

  it('declares the types the fixture’s values name', () => {
    const out = renderElementsStates(
      shellOf({
        member: 'Probe',
        recipe: 'structure/probe',
        fixtureTypes: { Row: '{ name: string }' },
        states: [{ name: 'typed', props: { label: 'A' } }],
      }),
      component('Probe', []),
      SHAPES,
      SHELLS,
    )
    expect(out).toContain('type Row = { name: string }')
  })

  it('refuses an element the vocabulary does not ship, and the forms it does not write', () => {
    expect(() =>
      statesOf([{ name: 'x', props: { label: 'A' }, slots: { default: [fx('Tooltip')] } }]),
    ).toThrow(/does not ship/)
    expect(() =>
      statesOf([{ name: 'x', props: { label: 'A', items: [node(fx('Tooltip'))] } }]),
    ).toThrow(/does not ship/)
    expect(() => statesOf([{ name: 'x', props: { label: 'A', open: held('open') } }])).toThrow(
      /does not hold/,
    )
    expect(() =>
      statesOf([{ name: 'x', props: { label: 'A' }, slots: { default: [{ js: 'label' }] } }]),
    ).toThrow(/expression/)
  })
})

describe('a definition module', () => {
  it('defines the element over the Solid member, typed by its props, and names its tag', () => {
    const shape = SHAPES.get('Probe') as ElementShape
    const out = renderElementsDefinition(shellOf({ member: 'Probe' }), shape)
    // The Solid member's own module: the vocabulary's index would bring every compound's parts.
    expect(out).toContain(
      "import Probe, { type ProbeProps } from '@polymorph/solid-ui/structure/Probe'",
    )
    expect(out).not.toContain("from '@polymorph/solid-ui'")
    expect(out).toContain('export const PolyProbe = define(definition, Probe)')
    expect(out).toContain("'poly-probe': PolyProbeElement")
    expect(out).toContain(
      "MemberElement<ProbeProps, 'label' | 'count' | 'span' | 'items' | 'open' | 'format'>",
    )
  })

  it('gives define the temporal codecs only for a member with a date or a time prop', () => {
    const probe = SHAPES.get('Probe') as ElementShape
    const plain = renderElementsDefinition(shellOf({ member: 'Probe' }), probe)
    expect(plain).not.toContain('temporal')
    for (const kind of ['time', 'date', 'range'] as const) {
      const dated: ElementShape = {
        ...probe,
        definition: {
          ...probe.definition,
          props: { ...probe.definition.props, at: { temporal: kind } },
        },
      }
      const out = renderElementsDefinition(shellOf({ member: 'Probe' }), dated)
      expect(out, kind).toContain("import { temporal } from '@polymorph/elements/temporal'")
      expect(out, kind).toContain('export const PolyProbe = define(definition, Probe, temporal)')
    }
  })

  it('defines a part over its member’s part, and an element with no props as the base class', () => {
    const part = elementShape(component('ProbeItem', []), {}, el('li'), true)
    const out = renderElementsDefinition(shellOf({ member: 'Probe' }), part, { part: 'Item' })
    expect(out).toContain("import ProbeItem from '@polymorph/solid-ui/structure/ProbeItem'")
    expect(out).toContain('export const PolyProbeItem = define(definition, ProbeItem)')
    expect(out).toContain('export type PolyProbeItemElement = PolyElement')
    expect(out).toContain('structural: true')
    expect(out).not.toContain('ProbeItemProps')
  })

  it('gives a prop named as a method every element inherits no property, which its attribute sets', () => {
    for (const method of ['before', 'after', 'remove', 'focus', 'click', 'closest']) {
      expect(elementMethods().has(method), method).toBe(true)
    }
    // An accessor is not a method: its prop's property replaces it on the element.
    for (const accessor of ['id', 'title', 'role', 'ariaLabel', 'prefix', 'hidden']) {
      expect(elementMethods().has(accessor), accessor).toBe(false)
    }
    const diff = elementShape(
      component('Probe', [
        { name: 'before', type: 'string', optional: true },
        { name: 'title', type: 'string', optional: true },
      ]),
      {},
      [],
      false,
    )
    expect(diff.definition.props).toEqual({ before: 'string', title: 'string' })
    expect(diff.properties).toEqual(['title'])
    const out = renderElementsDefinition(shellOf({ member: 'Probe' }), diff)
    expect(out).toContain("MemberElement<ProbeProps, 'title'>")
    // A prop set from script only could not be set at all.
    expect(() =>
      elementShape(
        component('Probe', [{ name: 'remove', type: '() => void', optional: true }]),
        {},
        [],
        false,
      ),
    ).toThrow(/method every element inherits/)
  })

  it('names every element’s module in the loaders table, and the foundation’s for its own', () => {
    const icon = shellOf({ member: 'Icon', dir: 'icon', home: 'foundation' })
    const probe = shellOf({ member: 'Probe' })
    const shapes = new Map<string, ElementShape>([
      ['Icon', elementShape(component('Icon', []), {}, [], false)],
      ['Probe', elementShape(component('Probe', []), {}, [], false)],
    ])
    const out = renderElementsLoaders([icon, probe], shapes)
    expect(out).toContain("'poly-icon': () => import('@polymorph/elements/icon'),")
    expect(out).toContain("'poly-probe': () => import('./structure/Probe'),")
  })

  it('hides an overlay’s slots and lays out a structural part until its element renders', () => {
    const shapes = new Map<string, ElementShape>([
      [
        'Probe',
        {
          ...(SHAPES.get('Probe') as ElementShape),
          definition: {
            ...(SHAPES.get('Probe') as ElementShape).definition,
            overlays: ['children', 'footerAction'],
          },
        },
      ],
    ])
    const probe = shellOf({
      member: 'Probe',
      parts: [{ name: 'Item', public: true, purpose: 'A row.', template: el('tr') }],
    })
    const out = renderElementsPending([probe], shapes)
    expect(out).toContain('poly-probe:not(:state(poly-host)) > :not([slot])')
    expect(out).toContain("poly-probe:not(:state(poly-host)) > [slot='footer-action']")
    expect(out).toMatch(/poly-probe-item:not\(:state\(poly-host\)\) \{\n {2}display: table-row;/)
    expect(out).toMatch(/poly-probe:not\(:state\(poly-host\)\) \{\n {2}display: table;/)
  })

  it('exports from the index every element it ships and every member’s types', () => {
    const out = renderElementsIndex(SHELLS.slice(0, 1), SHELLS)
    expect(out).toContain("export { PolyProbe } from './structure/Probe'")
    expect(out).not.toContain('PolyBadge')
    expect(out).toContain('BadgeProps')
    expect(out).toMatch(/export type \{[^}]*IconRole[^}]*\} from '@polymorph\/elements'/)
  })
})
