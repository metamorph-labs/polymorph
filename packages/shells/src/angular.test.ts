import { beforeAll, describe, expect, it } from 'vitest'

import { buildRegistry } from '@polymorph/registry'

import {
  angularInterface,
  angularSelector,
  angularType,
  hostElement,
  renderAngularMember,
  renderAngularStates,
  valueParameterType,
  VALUE_PARAMETERS,
  type AngularContext,
} from './angular'
import type { RegistryMemberLike } from './common'
import {
  cond,
  describeMember,
  each,
  el,
  emit,
  fx,
  held,
  hold,
  js,
  member,
  renders,
  run,
  slot,
  text,
  type MemberShell,
} from './dsl'
import { ANGULAR_TARGET, generateShells, typeOwners } from './generate'

/**
 * The Angular renderer's own checks: what it writes for each construct of the
 * description language. The freshness law over every target is in
 * `shells.test.ts`; the Angular vocabulary's laws are in `packages/angular-ui`.
 */

const ROOT = new URL('../../..', import.meta.url).pathname

type Prop = { name: string; type: string; optional: boolean }

const component = (props: Prop[] = [], name = 'Probe'): RegistryMemberLike => ({
  name,
  purpose: 'A probe',
  spec: null,
  props,
  grid: null,
})

const BADGE = component(
  [
    { name: 'tone', type: '"neutral" | "accent" | undefined', optional: true },
    { name: 'children', type: 'ReactNode', optional: true },
  ],
  'Badge',
)
const BUTTON = component(
  [
    { name: 'label', type: 'string', optional: false },
    {
      name: 'onClick',
      type: '((event: MouseEvent<HTMLButtonElement>) => void) | undefined',
      optional: true,
    },
  ],
  'Button',
)
const ROW = component(
  [
    { name: 'children', type: 'ReactNode', optional: true },
    { name: 'title', type: 'string | undefined', optional: true },
    { name: 'onClick', type: '(() => void) | undefined', optional: true },
  ],
  'ProbeRow',
)

const context: AngularContext = {
  locations: new Map([
    ['Probe', { home: 'vocabulary' as const, dir: 'structure' }],
    ['ProbeRow', { home: 'vocabulary' as const, dir: 'structure' }],
    ['Badge', { home: 'vocabulary' as const, dir: 'structure' }],
    ['Button', { home: 'vocabulary' as const, dir: 'controls' }],
    ['Icon', { home: 'foundation' as const, dir: 'icon' }],
  ]),
  owners: typeOwners([]),
  source: 'probe.ts',
  lookup: (name) => ({ Badge: BADGE, Button: BUTTON, ProbeRow: ROW })[name],
  generic: () => false,
  hostTag: (name) => (name === 'ProbeRow' ? 'li' : undefined),
}

const probe = (shell: Partial<MemberShell>, props: Prop[] = []) =>
  renderAngularMember(
    describeMember({
      member: 'Probe',
      dir: 'structure',
      recipe: null,
      template: [],
      states: [],
      ...shell,
    }),
    component(props),
    context,
    new Set(),
  )

describe('the Angular renderer writes the React member’s interface', () => {
  const props: Prop[] = [
    { name: 'label', type: 'string', optional: false },
    { name: 'aria-label', type: 'string | undefined', optional: true },
    { name: 'size', type: '"sm" | "md" | undefined', optional: true },
    { name: 'onOpenChange', type: '((open: boolean) => void) | undefined', optional: true },
    { name: 'footer', type: 'ReactNode', optional: true },
    { name: 'renderItem', type: '((item: string) => ReactNode) | undefined', optional: true },
  ]

  it('reads value props as inputs, events as outputs, nodes as slots and render props as templates', () => {
    const face = angularInterface(component(props))
    expect(face.props.map((prop) => [prop.name, prop.kind, prop.binding, prop.type])).toEqual([
      ['label', 'input', 'label', 'string'],
      ['aria-label', 'input', 'ariaLabel', 'string'],
      ['size', 'input', 'size', '"sm" | "md"'],
      ['onOpenChange', 'output', 'openChange', 'boolean'],
      ['footer', 'slot', 'footer', 'NodeTemplate'],
      ['renderItem', 'template', 'renderItem', 'NodeTemplate<[string]>'],
    ])
  })

  it('declares inputs by their React names, a default through a transform, and outputs by their event', () => {
    const source = probe({ defaults: { size: "'md'" } }, props)
    expect(source).toContain("readonly label = input.required<ProbeProps['label']>()")
    expect(source).toContain(
      "readonly ariaLabel = input<ProbeProps['aria-label']>(undefined, { alias: 'aria-label' })",
    )
    expect(source).toContain(
      "readonly size = input<Exclude<ProbeProps['size'], undefined>, ProbeProps['size']>('md', { transform: (value: ProbeProps['size']) => (value === undefined ? 'md' : value) })",
    )
    expect(source).toContain("readonly onOpenChange = output<boolean>({ alias: 'openChange' })")
    expect(source).toContain("selector: 'pm-probe'")
  })

  it('writes a node as a template, and a function that returns one as a template of its arguments', () => {
    expect(angularType('{ cell?: (row: Row) => VNode | string; action?: VNode }')).toBe(
      '{ cell?: NodeTemplate<[Row]>; action?: NodeTemplate }',
    )
    expect(angularType('Ref<HTMLInputElement | null>')).toBe('ControlRef<HTMLInputElement>')
    expect(angularSelector('TableRow')).toBe('pm-table-row')
  })

  it('emits through the member’s context, which runs the slot’s handler after the caller’s', () => {
    const source = probe(
      { template: el('button', { on: { click: { emit: 'openChange', args: ['true'] } } }) },
      props,
    )
    expect(source).toContain("this.$.emit(this.onOpenChange, 'onOpenChange', true)")
    expect(source).toContain('(click)="h1()"')
  })
})

describe('the Angular renderer writes the anatomy as a template over the class’s methods', () => {
  it('writes every expression as a method, repeating the branches’ conditions so they narrow', () => {
    const source = probe(
      {
        template: cond('label !== undefined', [el('span', {}, [text('label.length')])]),
      },
      [{ name: 'label', type: 'string | undefined', optional: true }],
    )
    expect(source).toContain('@if (e1()) {<span>{{ e2() }}</span>}')
    expect(source).toMatch(
      /protected e2\(\) \{\n\s*if \(!\(this\.\$p\.label !== undefined\)\) return undefined as never\n\s*return this\.\$p\.label\.length/,
    )
  })

  it('loops with a track over the row’s own item, and types the row’s methods by the list’s', () => {
    const source = probe(
      {
        template: each('items', 'item', 'item', [el('i', {}, [text('item.toUpperCase()')])], 'at'),
      },
      [{ name: 'items', type: 'string[]', optional: false }],
    )
    expect(source).toContain('@for (item of e1(); track e2(item); let at = $index)')
    expect(source).toContain("protected e3(item: Each<ReturnType<Probe['e1']>>)")
  })

  it('binds a range input’s bounds as properties before its value, which Angular sets first', () => {
    // Angular sets property bindings before attribute bindings, and a range input clamps a value
    // to the bounds it has when the value is set: a hue of 255 before `max` reads 100.
    const source = probe(
      {
        template: el('input', {
          attrs: { type: "'range'", value: 'hue', min: '0', max: 'top', step: '1' },
        }),
      },
      [
        { name: 'hue', type: 'number', optional: false },
        { name: 'top', type: 'number', optional: false },
      ],
    )
    expect(source).toMatch(
      /<input\n\[min\]="e1\(\)"\n\[max\]="e2\(\)"\n\[step\]="e3\(\)"\ntype="range"\n\[value\]="e4\(\)"/,
    )
    expect(source).toContain('return fieldValue(this.$p.top)')
    // Another input keeps its bounds as attributes, which a value outside them does not move.
    const field = probe(
      { template: el('input', { attrs: { type: 'kind', value: 'hue', max: 'top' } }) },
      [
        { name: 'kind', type: 'string', optional: false },
        { name: 'hue', type: 'number', optional: false },
        { name: 'top', type: 'number', optional: false },
      ],
    )
    expect(field).toContain('[attr.max]=')
  })

  it('writes a machine’s prop getters and the element’s own attributes as one object for `Spread`', () => {
    const source = probe({
      template: el('div', {
        spread: ['{ role: "group" }'],
        attrs: { 'aria-label': "'Group'" },
        on: { 'contextmenu.capture': { run: 'void 0' } },
      }),
    })
    expect(source).toContain('[pmSpread]="e1()"')
    expect(source).toMatch(
      /mergeParts\(\{ role: "group" \}, \{ 'aria-label': 'Group', onContextmenuCapture: \(\) => this\.h1\(\) \}\)/,
    )
  })

  it('projects a slot through a template the member names, and an outlet that forwards into a composed member', () => {
    const source = probe(
      {
        template: [
          cond('slots.footer', [el('footer', {}, [slot('footer')])]),
          member('Badge', {}, { slots: { default: [slot('footer')] } }),
        ],
      },
      [{ name: 'footer', type: 'ReactNode', optional: true }],
    )
    expect(source).toContain(
      '<ng-template pmSlot="footer" [pmSlotOf]="$"><ng-content select="[slot=footer]" /></ng-template>',
    )
    expect(source).toContain(`<ng-container [pmSlotOutlet]="'footer'" [pmSlotOf]="$" />`)
    expect(source).toContain(
      `<pm-badge><ng-container [pmSlotOutlet]="'footer'" [pmSlotOf]="$" pmSlotInto="default" /></pm-badge>`,
    )
    expect(source).toContain("return this.$.filled('footer')")
  })

  it('binds a composed member’s outputs with handlers typed by what they emit', () => {
    const source = probe({
      template: member('Button', { label: "'Go'" }, { on: { click: { run: 'void $event' } } }),
    })
    expect(source).toContain('<pm-button\nlabel="Go"\n(click)="h1($event)"\n></pm-button>')
    expect(source).toContain("protected h1($event: Emitted<Button['onClick']>): void")
  })

  it('draws a part that is a list’s item as the item itself', () => {
    expect(hostElement(el('li', {}, [text('label')]))?.element.tag).toBe('li')
    expect(hostElement(cond('a', [el('li')], [el('li')]))?.element.tag).toBe('li')
    expect(hostElement(cond('a', [el('li')], [el('div')]))).toBeNull()
    const source = probe({
      template: el('ul', {}, [member('ProbeRow', {}, { slots: { default: [text('label')] } })]),
    })
    expect(source).toContain('<ul><li\npmProbeRow\n>{{ e1() }}</li></ul>')
  })

  it('listens on a part’s host for its own event of an output’s name, which a host binding misses', () => {
    const source = renderAngularMember(
      describeMember({
        member: 'ProbeRow',
        dir: 'structure',
        recipe: null,
        template: el('li', { on: { click: emit('click'), keydown: run('void 0') } }, [slot()]),
        states: [],
      }),
      ROW,
      context,
      new Set(),
      undefined,
      'li',
    )
    expect(source).toContain("this.$.listen('click', () => this.h1())")
    expect(source).not.toContain("'(click)'")
    // An event no output is named for stays a host binding.
    expect(source).toContain("'(keydown)': 'h2()'")
  })

  it('writes a tag a prop chooses as one branch per tag it can be', () => {
    const source = probe({ template: el({ expr: 'as' }, {}, []), defaults: { as: "'div'" } }, [
      { name: 'as', type: '"div" | "section" | undefined', optional: true },
    ])
    expect(source).toContain(
      "@switch (e1()) {\n@case ('section') {<section></section>}\n@default {<div></div>}\n}",
    )
  })
})

describe('the Angular renderer writes a member whose React variants differ in their value', () => {
  it('makes it generic over the value, which a template infers from what it binds', async () => {
    const values = VALUE_PARAMETERS['DatePicker'] as (typeof VALUE_PARAMETERS)[string]
    expect(valueParameterType('CalendarDate | null | CalendarDateTime | null', values)).toBe(
      'Value | null',
    )
    expect(valueParameterType('CalendarDate', values)).toBe('CalendarDate')
    const registry = buildRegistry(ROOT)
    const files = await generateShells(ROOT, registry, undefined, [ANGULAR_TARGET])
    const source = [...files].find(([path]) => path.endsWith('/controls/DatePicker.ts'))?.[1] ?? ''
    expect(source).toContain(
      'export class DatePicker<\n  Value extends CalendarDate | CalendarDateTime = CalendarDate | CalendarDateTime,\n>',
    )
    expect(source).toContain('value?: Value | null')
    expect(source).toContain("readonly onChange = output<Value | null>({ alias: 'change' })")
  }, 120_000)
})

describe('the Angular renderer writes presence and observers as the description asks', () => {
  const props: Prop[] = [
    { name: 'open', type: 'boolean', optional: false },
    { name: 'appear', type: 'boolean | undefined', optional: true },
    { name: 'side', type: '"left" | "right" | undefined', optional: true },
  ]

  it('passes an anchored side and alignment as a fixed object, and options that read inputs as a function', () => {
    const anchored = probe(
      {
        template: el('div', { ref: 'panel' }, []),
        presence: {
          present: {
            open: 'open',
            ref: 'panel',
            binding: 'popover.panel',
            side: 'bottom',
            align: 'center',
          },
        },
      },
      props,
    )
    expect(anchored).toContain("'popover.panel', { side: 'bottom', align: 'center' }")
    const read = probe(
      {
        template: el('div', { ref: 'panel' }, []),
        presence: {
          present: {
            open: 'open',
            ref: 'panel',
            binding: 'sheet.panel',
            sheetSide: { expr: 'side' },
            appear: 'appear',
            reflow: 'taginput.reflow',
          },
        },
      },
      props,
    )
    expect(read).toMatch(
      /'sheet\.panel',\s*\(\) => \(\{ sheetSide: this\.\$p\.side, appear: this\.\$p\.appear, reflow: 'taginput\.reflow' \}\)/,
    )
  })

  it('filters a mutation observer by the attributes an effect names, and refuses them without a subtree', () => {
    const observed = probe(
      {
        template: el('div', { ref: 'grid' }, []),
        effects: [{ run: 'open', mutation: ['grid'], attributes: ['disabled'] }],
      },
      props,
    )
    expect(observed).toContain("subtree: true, attributeFilter: ['disabled']")
    expect(() =>
      probe(
        {
          template: el('div', { ref: 'grid' }, []),
          effects: [{ run: 'open', attributes: ['disabled'] }],
        },
        props,
      ),
    ).toThrow(/observes attributes without a mutation subtree/)
  })
})

describe('the Angular fixture renderer writes what an entry says', () => {
  const shell = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    template: [],
    states: [
      { name: 'plain', props: { label: 'Save' } },
      {
        name: 'held',
        holds: { open: false },
        props: { label: 'Open', open: held('open'), onOpenChange: hold('open') },
        before: [fx('Badge', { tone: 'accent' })],
      },
    ],
  })
  const props: Prop[] = [
    { name: 'label', type: 'string', optional: false },
    { name: 'open', type: 'boolean | undefined', optional: true },
    { name: 'onOpenChange', type: '((open: boolean) => void) | undefined', optional: true },
  ]
  let source: string
  beforeAll(() => {
    source = renderAngularStates(shell, component(props), {
      ...context,
      lookup: (name) => (name === 'Probe' ? component(props) : context.lookup(name)),
    })
  })

  it('renders each entry in a case of one fixture component, the runner’s overrides on its member', () => {
    expect(source).toContain('@switch (entry()) {')
    expect(source).toContain(
      '@case (0) {<pm-probe\nlabel="Save"\n[pmOverrides]="overrides()"\n></pm-probe>}',
    )
    expect(source).toContain("entries: [{ name: 'plain' }, { name: 'held' }]")
  })

  it('declares the types the fixture’s values name before its entries', () => {
    const typed = renderAngularStates(
      describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: null,
        template: [],
        fixtureTypes: { ProbeRow: '{ id: string }' },
        states: [{ name: 'plain', props: { label: 'Save' } }],
      }),
      component(props),
      {
        ...context,
        lookup: (name) => (name === 'Probe' ? component(props) : context.lookup(name)),
      },
    )
    expect(typed).toContain('type ProbeRow = { id: string }\n')
    expect(typed.indexOf('type ProbeRow')).toBeLessThan(typed.indexOf('@Component'))
  })

  it('binds a part drawn on its host by every value, a quote in its text escaped', () => {
    const quoted = renderAngularStates(
      describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: null,
        template: [],
        states: [
          {
            name: 'quoted',
            props: { label: 'Save' },
            slots: { default: [fx('ProbeRow', { title: "Ticket's row" })] },
          },
        ],
      }),
      component([...props, { name: 'children', type: 'ReactNode', optional: true }]),
      {
        ...context,
        lookup: (name) =>
          name === 'Probe'
            ? component([...props, { name: 'children', type: 'ReactNode', optional: true }])
            : context.lookup(name),
      },
    )
    // The template sits in a template literal, which doubles the backslash.
    expect(quoted).toContain(`<li\npmProbeRow\n[title]="'Ticket\\\\'s row'"`)
  })

  it('declares a template’s variables by name for a destructured parameter', () => {
    // `{ row }: { … }` reads a scoped slot's props, so the template binds `let-row="row"`.
    const detailed: Prop[] = [
      ...props,
      {
        name: 'detail',
        type: '((detail: { row: { status: string } }) => ReactNode) | undefined',
        optional: true,
      },
      {
        name: 'cell',
        type: '((row: { status: string }) => ReactNode) | undefined',
        optional: true,
      },
    ]
    const out = renderAngularStates(
      describeMember({
        member: 'Probe',
        dir: 'structure',
        recipe: null,
        template: [],
        states: [
          {
            name: 'detail',
            props: {
              label: 'Rows',
              detail: renders(['{ row }: { row: { status: string } }'], js('row.status')),
              cell: renders(['row: { status: string }'], js('row.status')),
            },
          },
        ],
      }),
      component(detailed),
      {
        ...context,
        lookup: (name) => (name === 'Probe' ? component(detailed) : context.lookup(name)),
      },
    )
    expect(out).toContain('<ng-template #t1 let-row="row">')
    expect(out).toContain("(row: ({ row: { status: string } })['row'])")
    // One name is the template's argument.
    expect(out).toContain('<ng-template #t2 let-row>')
  })

  it('holds an entry’s values in signals, and renders what comes before the member', () => {
    expect(source).toContain('protected readonly held1_open = signal(false)')
    expect(source).toMatch(/\[open\]="e\d+\(\)"/)
    expect(source).toMatch(/\(openChange\)="e\d+\(\)\(\$event\)"/)
    expect(source).toContain('<pm-badge\ntone="accent"\n></pm-badge>')
  })
})

describe('the Angular target', () => {
  it('declares every type once, in the component that owns it', { timeout: 120_000 }, async () => {
    const registry = buildRegistry(ROOT)
    const files = await generateShells(ROOT, registry, undefined, [ANGULAR_TARGET])
    const declarations = new Map<string, string[]>()
    for (const [path, source] of files) {
      if (path.endsWith('.states.ts')) continue
      for (const match of source.matchAll(/^export (?:interface|type) (\w+)/gm)) {
        const name = match[1] as string
        declarations.set(name, [...(declarations.get(name) ?? []), path])
      }
    }
    expect([...declarations].filter(([, paths]) => paths.length > 1)).toEqual([])
  })
})
