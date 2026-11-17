import prettier from 'prettier'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildRegistry } from '@polymorph/registry'

import {
  cond,
  describeMember,
  each,
  el,
  fx,
  held,
  hold,
  member,
  run,
  slot,
  text,
  type MemberShell,
} from './dsl'
import { generateShells, SOLID_TARGET, typeOwners } from './generate'
import { statement } from './common'
import { renderSolidMember, renderSolidStates } from './solid'
import type { RegistryMemberLike } from './common'

/**
 * The Solid renderer's own checks: what it writes for each construct of the
 * description language. The freshness law over every target is in
 * `shells.test.ts`; the Solid vocabulary's laws are in `packages/solid-ui`.
 */

const ROOT = new URL('../../..', import.meta.url).pathname

/** An owner of shared types, as another description would be. */
const owner = describeMember({
  member: 'Owner',
  dir: 'feedback',
  recipe: null,
  types: { OwnerItem: '{ label: string }' },
  template: [],
  states: [],
})

type Prop = { name: string; type: string; optional: boolean }

const component = (props: Prop[] = []): RegistryMemberLike => ({
  name: 'Probe',
  purpose: 'A probe',
  spec: null,
  props,
  grid: null,
})

const context = {
  locations: new Map([
    ['Owner', { home: 'vocabulary' as const, dir: 'feedback' }],
    ['Probe', { home: 'vocabulary' as const, dir: 'structure' }],
    ['Badge', { home: 'vocabulary' as const, dir: 'structure' }],
    ['Icon', { home: 'foundation' as const, dir: 'icon' }],
  ]),
  owners: typeOwners([owner]),
  source: 'probe.ts',
}

/** Formatted as `pnpm shells` writes it, so a check reads the file a member is. */
let format: (text: string) => Promise<string>
beforeAll(async () => {
  const file = `${ROOT}packages/solid-ui/src/structure/Probe.tsx`
  const config = (await prettier.resolveConfig(file)) ?? {}
  format = (text) => prettier.format(text, { ...config, filepath: file })
})

const probe = (shell: Partial<MemberShell>, props: Prop[] = []) =>
  format(
    renderSolidMember(
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
    ),
  )

const LABEL: Prop = { name: 'label', type: 'string', optional: true }
const ARIA: Prop = { name: 'aria-label', type: 'string', optional: true }
const CHANGE: Prop = {
  name: 'onValueChange',
  type: '((value: string) => void) | undefined',
  optional: true,
}
const CHILDREN: Prop = { name: 'children', type: 'ReactNode', optional: true }
const FOOTER: Prop = { name: 'footer', type: 'ReactNode', optional: true }

describe('the Solid renderer writes the React member’s interface', () => {
  it('declares every prop by its React name, a node as an element and a callback as a prop', async () => {
    const out = await probe({ template: el('span') }, [LABEL, ARIA, CHANGE, CHILDREN, FOOTER])
    expect(out).toContain('export interface ProbeProps {')
    expect(out).toContain("  'aria-label'?: string")
    expect(out).toContain('  children?: JSX.Element')
    expect(out).toContain('  footer?: JSX.Element')
    expect(out).toContain('  onValueChange?: (value: string) => void')
    expect(out).toContain('export default function Probe(given: ProbeProps): JSX.Element {')
  })

  it('reads a prop through `props`, a dashed one by its key', async () => {
    const out = await probe({ template: el('span', { attrs: { title: 'ariaLabel ?? label' } }) }, [
      LABEL,
      ARIA,
    ])
    expect(out).toContain("title={props['aria-label'] ?? props.label}")
  })

  it('calls the caller’s callback for an emitted event, with the event’s arguments', async () => {
    const out = await probe(
      {
        template: el('button', {
          on: { click: { emit: 'valueChange', args: ["'next'"] } },
        }),
      },
      [CHANGE],
    )
    expect(out).toContain("onclick={() => props.onValueChange?.('next')}")
  })

  it('reads whether the caller listens without reading the callback', async () => {
    const out = await probe({ template: cond('listening.valueChange', [el('button')]) }, [CHANGE])
    expect(out).toContain('{props.onValueChange !== undefined ? <button /> : null}')
  })

  it('takes a default without `undefined` in its type, and calls a factory once', async () => {
    const out = await probe(
      {
        defaults: { label: "'Close'", items: '() => []', format: 'String' },
        template: el('span', {}, [text('label')]),
      },
      [
        LABEL,
        { name: 'items', type: 'string[]', optional: true },
        { name: 'format', type: '((value: number) => string) | undefined', optional: true },
      ],
    )
    expect(out).toContain("{ label: 'Close', items: (() => [])(), format: String } as Defaults<")
    expect(out).toContain("'label' | 'items' | 'format'")
  })
})

describe('the Solid renderer holds and derives values as cells', () => {
  it('derives a value lazily, holds one in a cell and names an element by a ref', async () => {
    const out = await probe({
      state: { copied: 'false' },
      derived: { shown: '!copied' },
      template: el('span', {
        ref: 'box',
        attrs: { hidden: 'shown' },
        on: { click: { run: 'copied = true' } },
      }),
    })
    expect(out).toContain('const copied = createCell(false)')
    expect(out).toContain('const shown = createDerived(() => !copied.value)')
    expect(out).toContain('const box = elementRef<HTMLElement>()')
    expect(out).toContain('hidden={shown.value}')
    expect(out).toContain('onclick={() => (copied.value = true)}')
    expect(out).toContain('ref={box.attach}')
  })

  it('runs an effect on mount, on a watched change, or both, as it says', async () => {
    const out = await probe({
      template: el('span'),
      state: { value: '0' },
      effects: [
        { run: 'first()' },
        { run: 'second()', watch: 'value', mount: false },
        { run: 'value > 0 && third()', watch: 'value' },
      ],
    })
    expect(out).toContain('onMount(effect1)')
    expect(out).toMatch(
      /watchEffect\(\s*createMemo\(\(\) => value\.value\),\s*effect2,\s*false,?\s*\)/,
    )
    expect(out).toMatch(
      /watchEffect\(\s*createMemo\(\(\) => value\.value\),\s*effect3,\s*true,?\s*\)/,
    )
    expect(out).not.toMatch(/watchEffect\([^)]*\), effect1/)
    // An expression that is not a call is a statement only as `void`.
    expect(out).toContain('void (value.value > 0 && third())')
  })

  it('listens on the document for an effect that listens, and undoes one that releases', async () => {
    const out = await probe(
      {
        template: el('span'),
        effects: [
          { run: "$event.key === 'F8' && jump()", listen: 'keydown' },
          { run: 'raise()', release: 'drop()', watch: 'label' },
        ],
      },
      [LABEL],
    )
    expect(out).toContain('const listener = ($event: KeyboardEvent) => {')
    expect(out).toContain("document.addEventListener('keydown', listener)")
    expect(out).toContain("release1 = () => document.removeEventListener('keydown', listener)")
    expect(out).toMatch(/release2 = \(\) => \{\s*drop\(\)\s*\}/)
    expect(out).toContain('onCleanup(() => release2?.())')
  })

  it('writes a statement as it is when it is a call or an assignment', () => {
    expect(statement('a()')).toBe('a()')
    expect(statement('a.value = 1')).toBe('a.value = 1')
    expect(statement('a && b()')).toBe('void (a && b())')
    expect(statement('(a(), b())')).toBe('void ((a(), b()))')
  })
})

describe('the Solid renderer writes the anatomy as JSX', () => {
  it('keeps a root that is an expression in a fragment, which Solid reads again', async () => {
    const out = await probe({ template: cond('label !== undefined', [el('span')]) }, [LABEL])
    expect(out).toContain('return <>{props.label !== undefined ? <span /> : null}</>')
  })

  it('writes a condition as a conditional expression, which narrows', async () => {
    const out = await probe(
      {
        template: el('span', {}, [
          cond('label !== undefined', [text('label.length')], [text("'none'")]),
        ]),
      },
      [LABEL],
    )
    expect(out).toContain("<span>{props.label !== undefined ? props.label.length : 'none'}</span>")
  })

  it('keys a loop by the description’s key, reads its item as a value and its index as an accessor', async () => {
    const out = await probe(
      {
        types: { Row: '{ id: string; label: string }' },
        template: el('ul', {}, [
          each(
            'rows',
            'row',
            'row.id',
            [el('li', { attrs: { 'data-at': 'at' } }, [text('row.label')])],
            'at',
          ),
        ]),
      },
      [{ name: 'rows', type: 'Row[]', optional: false }],
    )
    expect(out).toContain('<Each of={props.rows} by={(row) => row.id} renew>')
    expect(out).toContain('{(row, at) => <li data-at={at()}>{row.label}</li>}')
    expect(out).toContain('data-at={at()}')
    expect(out).toContain('{row.label}')
  })

  it('hands a call the item itself, except a built-in, a helper and a key function', async () => {
    const out = await probe(
      {
        types: { Row: '{ id: string; label: string }' },
        template: el('ul', {}, [
          each('rows', 'row', 'getRowId(row)', [
            el('li', { on: { click: { emit: 'rowClick', args: ['row'] } } }, [
              text('getRowLabel(row) + String(row) + formatBytes(row)'),
            ]),
          ]),
        ]),
      },
      [
        { name: 'rows', type: 'Row[]', optional: false },
        { name: 'getRowId', type: '(row: Row) => string', optional: false },
        { name: 'getRowLabel', type: '(row: Row) => string', optional: false },
        { name: 'onRowClick', type: '((row: Row) => void) | undefined', optional: true },
      ],
    )
    expect(out).toContain('by={(row) => props.getRowId(row)}')
    expect(out).toContain('onclick={() => props.onRowClick?.(itemOf(row))}')
    expect(out).toContain('props.getRowLabel(itemOf(row)) + String(row) + formatBytes(row)')
    expect(out).toMatch(/import \{[^}]*\bitemOf\b[^}]*\} from '@polymorph\/solid'/)
  })

  it('merges a machine’s prop getters with the element’s own attributes, its own winning', async () => {
    const out = await probe({
      machine: { of: 'dialog', context: {} },
      template: el('div', {
        spread: ['api.getContentProps()'],
        attrs: { hidden: 'undefined', 'data-size': "'md'" },
      }),
    })
    expect(out).toContain(
      "{...mergeParts(api.value.getContentProps(), { hidden: undefined, 'data-size': 'md' })}",
    )
    // Every machine is given the document's direction, which it would otherwise take to be left-to-right.
    expect(out).toContain('const documentDirection = useDirection()')
    // The formatter breaks the call across lines, so the match allows any spacing.
    expect(out).toMatch(
      /const service = useMachine\(\s*zag\.machine,\s*\(\) =>\s*\(\{\s*id: uid,\s*dir: documentDirection\(\),?\s*\}\) as Partial<zag\.Props>,?\s*\)/,
    )
    // The foundation's `useMachine`, which applies an event when it is sent; the adapter's normalizer.
    expect(out).toContain("import { normalizeProps } from '@zag-js/solid'")
    expect(out).toMatch(/import \{[^}]*\buseMachine\b[^}]*\} from '@polymorph\/solid'/)
    expect(out).toMatch(/import \{[^}]*\buseDirection\b[^}]*\} from '@polymorph\/solid'/)
  })

  it('listens in the capture phase through Solid’s `oncapture:` key, and refuses any other modifier', async () => {
    const out = await probe({
      machine: { of: 'dialog', context: {} },
      template: el('div', {}, [
        el('span', { on: { 'contextmenu.capture': run('go()') } }),
        el('span', {
          spread: ['api.getContentProps()'],
          on: { 'pointerdown.capture': run('go()') },
        }),
      ]),
    })
    expect(out).toContain("<span {...{ 'oncapture:contextmenu': () => go() }} />")
    expect(out).toContain(
      "{...mergeParts(api.value.getContentProps(), { 'oncapture:pointerdown': () => go() })}",
    )
    expect(out).not.toContain('.capture')
    expect(() =>
      renderSolidMember(
        describeMember({
          member: 'Probe',
          dir: 'structure',
          recipe: null,
          template: el('span', { on: { 'click.once': run('go()') } }),
          states: [],
        }),
        component(),
        context,
      ),
    ).toThrow('the event modifier "once" has no Solid spelling')
  })

  it('makes an element whose `key` changes again, through the foundation’s `Keyed`', async () => {
    const out = await probe(
      { template: el('div', {}, [el('table', { attrs: { key: 'label', role: "'grid'" } })]) },
      [LABEL],
    )
    expect(out).toContain('<Keyed by={props.label}>{() => <table role="grid" />}</Keyed>')
    expect(out).not.toContain('key=')
    expect(out).toMatch(/import \{[^}]*\bKeyed\b[^}]*\} from '@polymorph\/solid'/)
  })

  it('renders a slot it reads once, through the slot it resolved, and one it does not as the prop', async () => {
    const out = await probe(
      {
        template: el('div', {}, [
          slot(),
          cond('slots.footer', [el('footer', {}, [slot('footer')])]),
        ]),
      },
      [CHILDREN, FOOTER],
    )
    expect(out).toContain('const footerSlot = resolveSlot(() => props.footer)')
    expect(out).toContain('{footerSlot.filled() ? <footer>{footerSlot()}</footer> : null}')
    expect(out).toContain('{footerSlot()}')
    expect(out).toContain('{props.children}')
    expect(out).toContain('return scope(() => {')
  })

  it('resolves a slot read only inside a branch in that branch, which makes it again on each open', async () => {
    const out = await probe(
      {
        state: { open: 'false' },
        template: el('div', {}, [
          cond('open', [
            el('section', {}, [cond('slots.footer', [el('footer', {}, [slot('footer')])])]),
          ]),
        ]),
      },
      [FOOTER],
    )
    expect(out).not.toContain('resolveSlot(')
    expect(out).toMatch(
      /\{open\.value \? \(\s*<ResolvedSlot of=\{\(\) => props\.footer\}>\s*\{\(footerSlot\) => \(\s*<section>/,
    )
    expect(out).toContain('{footerSlot.filled() ? <footer>{footerSlot()}</footer> : null}')
    expect(out).toMatch(/import \{[^}]*\bResolvedSlot\b[^}]*\} from '@polymorph\/solid'/)
  })

  it('hands a slot’s members props as React’s `cloneElement` would', async () => {
    const out = await probe(
      {
        template: el('div', {}, [slot('default', { pass: { label: 'child.label ?? title' } })]),
      },
      [CHILDREN, { name: 'title', type: 'string', optional: false }],
    )
    expect(out).toContain('(child) => ({ label: child.label ?? props.title })')
  })

  it('composes a member by its React prop names, its handlers as callback props', async () => {
    const out = await probe(
      {
        template: member('Badge', { ariaLabel: 'label' }, { on: { click: { run: 'go()' } } }),
      },
      [LABEL],
    )
    expect(out).toContain("import Badge from './Badge'")
    expect(out).toContain('<Badge aria-label={props.label} onClick={() => go()} />')
  })
})

describe('the Solid fixture renderer writes what an entry says', () => {
  const shell = describeMember({
    member: 'Probe',
    dir: 'structure',
    recipe: null,
    template: el('span'),
    states: [
      { name: 'plain', props: { label: 'Hi' } },
      {
        name: 'held',
        holds: { open: false },
        props: { open: held('open'), onOpenChange: hold('open') },
        before: [fx('Badge', {}, { default: ['Launch'] })],
      },
    ],
  })
  let out = ''
  beforeAll(async () => {
    out = await format(
      renderSolidStates(
        shell,
        component([
          LABEL,
          { name: 'open', type: 'boolean', optional: true },
          { name: 'onOpenChange', type: '((open: boolean) => void) | undefined', optional: true },
          { name: 'onPress', type: '() => void', optional: false },
        ]),
        context,
      ),
    )
  })

  it('renders an entry as JSX with the runner’s overrides last', () => {
    expect(out).toContain('<Probe label="Hi" onPress={() => {}} {...overrides} />')
  })

  it('gives a required callback the entry does not handle one that does nothing', () => {
    expect(out).toContain('onPress={() => {}}')
  })

  it('holds an entry’s state in a store, and renders what comes before the member', () => {
    expect(out).toContain('const held = createMutable({ open: false })')
    expect(out).toContain('open={held.open}')
    expect(out).toContain('onOpenChange={(value: typeof held.open) => {')
    expect(out).toContain('<Badge>')
  })
})

describe('the Solid fixture renderer renders a part on its own', () => {
  it('renders the part in place of the member, with the runner’s overrides', async () => {
    const out = await format(
      renderSolidStates(
        describeMember({
          member: 'Probe',
          dir: 'structure',
          recipe: null,
          template: el('span'),
          parts: [
            {
              name: 'Item',
              public: true,
              purpose: 'an item',
              props: { label: { type: 'string' } },
              template: el('li'),
            },
          ],
          states: [{ name: 'item alone', part: 'Item', props: { label: 'One' } }],
        }),
        component([LABEL]),
        {
          ...context,
          locations: new Map([
            ...context.locations,
            ['ProbeItem', { home: 'vocabulary' as const, dir: 'structure' }],
          ]),
        },
      ),
    )
    expect(out).toContain("import ProbeItem from './ProbeItem'")
    expect(out).toContain('<ProbeItem label="One" {...overrides} />')
  })
})

describe('the Solid target', () => {
  it('declares every type once, in the component that owns it', async () => {
    const generated = await generateShells(ROOT, buildRegistry(ROOT), undefined, [SOLID_TARGET])
    const declarations = new Map<string, string[]>()
    for (const [path, text] of generated) {
      if (!path.endsWith('.tsx') || path.endsWith('.states.tsx')) continue
      for (const match of text.matchAll(/^export (?:interface|type) (\w+)/gm)) {
        const name = match[1] as string
        declarations.set(name, [...(declarations.get(name) ?? []), path])
      }
    }
    expect(declarations.size).toBeGreaterThan(100)
    expect([...declarations].filter(([, paths]) => paths.length > 1)).toEqual([])
  }, 120_000)
})
