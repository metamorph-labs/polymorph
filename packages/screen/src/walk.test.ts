import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { argumentsToJson, toJson } from './json'
import { parsePartial } from './partial'
import { VOCABULARY } from './vocabulary'
import {
  createScreen,
  materialize,
  type Drawn,
  type Screen,
  type ScreenAction,
  type ScreenFault,
  type ScreenNode,
  type ScreenOptions,
} from './walk'

/**
 * The walk's contract, pinned against a renderer of ten lines.
 *
 * `draw` below is what a renderer is: it draws each node by its component
 * with its props and children, turning every node inside a prop into a
 * drawing of its own (`materialize`). A React renderer creates elements where
 * this writes text, and a DOM renderer sets properties. Everything the
 * renderers share is the walk's, so every rule a document is drawn by is
 * held here, with no framework.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const inbox = JSON.parse(
  readFileSync(resolve(ROOT, 'design/screens/inbox.json'), 'utf8'),
) as unknown

/** A drawing as text: `Component(prop=value, …)[children]`. */
function draw(node: ScreenNode | null): string {
  if (node === null) return ''
  if (node.fault !== null) return ''
  const value = (drawn: Drawn) =>
    materialize(drawn, { node: (inner) => `<${draw(inner)}>`, binding: (_, bound) => bound })
  const props = Object.entries(node.props)
    .filter(([, drawn]) => !(drawn.kind === 'value' && typeof drawn.value === 'function'))
    .map(([name, drawn]) => `${name}=${JSON.stringify(value(drawn))}`)
  const children = node.children.map((child) => {
    const drawn = value(child)
    return typeof drawn === 'string' ? drawn : JSON.stringify(drawn)
  })
  return `${node.component}(${props.join(', ')})${children.length === 0 ? '' : `[${children.join(', ')}]`}`
}

/** The node at a path, wherever it is in the drawing. */
function at(screen: Screen, path: string): ScreenNode {
  const found: ScreenNode[] = []
  const visit = (drawn: Drawn) => {
    if (drawn.kind === 'node') walk(drawn.node)
    else if (drawn.kind === 'list') drawn.items.forEach(visit)
    else if (drawn.kind === 'record') Object.values(drawn.fields).forEach(visit)
  }
  const walk = (node: ScreenNode) => {
    if (node.path === path) found.push(node)
    Object.values(node.props).forEach(visit)
    node.children.forEach(visit)
  }
  if (screen.root !== null) walk(screen.root)
  const node = found[0]
  if (node === undefined) throw new Error(`no node at ${path}`)
  return node
}

/** A member calling one of its props, as a framework would. */
function call(node: ScreenNode, prop: string, ...args: unknown[]): unknown {
  const drawn = node.props[prop]
  if (drawn?.kind !== 'value' || typeof drawn.value !== 'function') {
    throw new Error(`${node.component} has no function at ${prop}`)
  }
  return (drawn.value as (...args: unknown[]) => unknown)(...args)
}

const doc = <Root extends object>(root: Root, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen the walk draws.',
  inputs,
  root,
})

const open = (options: Partial<ScreenOptions> & { document: unknown }) => {
  const actions: ScreenAction[] = []
  const faults: ScreenFault[] = []
  const screen = createScreen({
    vocabulary: VOCABULARY,
    onAction: (action) => {
      actions.push(action)
      return options.onAction?.(action)
    },
    onFault: (fault) => faults.push(fault),
    ...options,
  })
  return { screen, actions, faults }
}

describe('a screen is drawn from its document, its data and the vocabulary', () => {
  it('draws a real screen with the host’s data', () => {
    const { screen } = open({
      document: inbox,
      data: { query: 'late', isEmpty: false, tickets: [], statusOptions: [], priorityOptions: [] },
    })
    expect(screen.root?.component).toBe('ListPage')
    expect(screen.root?.path).toBe('$.root')
    const search = at(screen, '$.root.props.filters.props.search')
    expect(search.component).toBe('SearchInput')
    expect(search.props['value']).toEqual({ kind: 'value', value: 'late', from: 'data' })
    // A node in a prop is a node to draw, with its own path.
    expect(screen.root?.props['actions']?.kind).toBe('node')
    expect(draw(screen.root)).toContain(
      'actions="<Button(icon=\\"add\\", label=\\"New ticket\\")>"',
    )
    // The structured object that holds an element is a record, its data drawn as data.
    const emptyState = screen.root?.props['emptyState']
    expect(emptyState?.kind).toBe('record')
    expect(screen.fills.find((fill) => fill.name === 'query')).toEqual({
      name: 'query',
      type: 'string',
      from: 'data',
    })
  })

  it('leaves a data input with no value absent, or samples it from its type when asked', () => {
    const document = doc({ component: 'Heading', children: [{ $: 'title' }] }, [
      { name: 'title', type: 'string' },
      { name: 'rows', type: 'Row[]' },
    ])
    const absent = open({ document }).screen
    expect(absent.root?.children).toEqual([{ kind: 'binding', path: 'title', value: undefined }])
    expect(absent.fills).toEqual([
      { name: 'title', type: 'string', from: 'absent' },
      { name: 'rows', type: 'Row[]', from: 'absent' },
    ])
    const sampled = open({ document, fill: 'sample' }).screen
    expect(draw(sampled.root)).toBe('Heading()[⟨title⟩]')
    expect(sampled.fills).toEqual([
      { name: 'title', type: 'string', from: 'sample', value: '"⟨title⟩"' },
      { name: 'rows', type: 'Row[]', from: 'sample', value: '[]' },
    ])
  })

  it('passes only the props a member has, and says so of the others', () => {
    const { screen, faults } = open({
      document: doc({
        component: 'Button',
        props: { label: 'Save', className: 'big', style: { color: 'red' }, key: 'k' },
      }),
    })
    expect(Object.keys(screen.root?.props ?? {})).toEqual(['label'])
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.props.className',
      '$.root.props.style',
      '$.root.props.key',
    ])
    expect(faults[0]?.message).toBe('`Button` has no prop `className`')
  })

  it('draws a node it cannot draw as nothing, with its fault, and the rest of the screen', () => {
    const { screen, faults } = open({
      document: doc({
        component: 'Stack',
        children: [
          { component: 'Buton', props: { label: 'Save' } },
          { component: 'ThirdParty', props: { library: 'leaflet', reason: 'map' } },
          { component: 'Text', children: ['Still here'] },
        ],
      }),
    })
    expect(draw(screen.root)).toBe('Stack()[<>, <>, <Text()[Still here]>]')
    expect(at(screen, '$.root.children[0]').fault?.message).toBe('no component called `Buton`')
    expect(at(screen, '$.root.children[1]').fault?.message).toContain(
      'hosts another library’s code, which this host does not allow',
    )
    expect(faults.map(({ path }) => path)).toEqual(['$.root.children[0]', '$.root.children[1]'])
  })

  it('draws only the members the host allows', () => {
    const document = doc({ component: 'Card', children: [{ component: 'Text', children: ['a'] }] })
    const narrowed = open({ document, members: ['Card'] }).screen
    expect(at(narrowed, '$.root.children[0]').fault?.message).toBe(
      '`Text` is not one of the members this host draws — compose the screen from the members the card lists',
    )
    const hosted = open({
      document: doc({ component: 'ThirdParty', props: { library: 'leaflet', reason: 'map' } }),
      members: ['ThirdParty'],
    }).screen
    expect(hosted.root?.fault).toBeNull()
  })

  it('draws a structured object where a child goes as a fault', () => {
    const { screen } = open({
      document: doc({ component: 'Stack', children: [{ $object: { a: 1 } }] }),
    })
    expect(screen.root?.children[0]?.kind).toBe('fault')
  })

  it('reads a `children` prop as the children', () => {
    const { screen } = open({ document: doc({ component: 'Text', props: { children: 'Hello' } }) })
    expect(draw(screen.root)).toBe('Text()[Hello]')
  })

  it('refuses the children of a member that takes none', () => {
    const { screen, faults } = open({ document: doc({ component: 'Separator', children: ['x'] }) })
    expect(screen.root?.children).toEqual([])
    expect(faults[0]?.message).toBe('`Separator` takes no children')
  })
})

describe('callback inputs are actions', () => {
  const form = doc(
    {
      component: 'Stack',
      children: [
        {
          component: 'Input',
          props: { name: 'email', value: { $: 'email' }, onChange: { $: 'onEmail' } },
        },
        { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
      ],
    },
    [
      { name: 'email', type: 'string' },
      { name: 'onEmail', type: '(value: string) => void' },
      { name: 'onSave', type: '() => void | Promise<void>' },
    ],
  )

  it('tells the host the input’s name, the arguments as JSON and the named controls’ values', () => {
    const { screen, actions } = open({ document: form, data: { email: 'a@example.com' } })
    const event = { type: 'click', target: {}, preventDefault: () => {} }
    call(at(screen, '$.root.children[1]'), 'onClick', event)
    expect(actions).toEqual([{ name: 'onSave', args: [], values: { email: 'a@example.com' } }])
  })

  it('hands the member the host’s promise, so a member that waits on its callback waits', async () => {
    const saving = Promise.resolve('saved')
    const { screen } = open({ document: form, onAction: () => saving })
    const result = call(at(screen, '$.root.children[1]'), 'onClick')
    expect(result).toBe(saving)
    await expect(result).resolves.toBe('saved')
  })

  it('answers by the declared return type when the host gives no answer, and with the host’s when it does', async () => {
    const document = doc(
      {
        component: 'Stack',
        children: ['getRowId', 'isOpen', 'load'].map((name) => ({
          component: 'Button',
          props: { label: name, onClick: { $: name } },
        })),
      },
      [
        { name: 'getRowId', type: '(row: Row) => string' },
        { name: 'isOpen', type: '(id: string) => boolean' },
        { name: 'load', type: '() => Promise<Row[]>' },
      ],
    )
    const quiet = open({ document }).screen
    expect(call(at(quiet, '$.root.children[0]'), 'onClick', { id: 7 })).toBe('7')
    expect(call(at(quiet, '$.root.children[1]'), 'onClick', 'a')).toBe(false)
    await expect(call(at(quiet, '$.root.children[2]'), 'onClick')).resolves.toEqual([])
    const answering = open({
      document,
      onAction: (action) => (action.name === 'isOpen' ? true : undefined),
    }).screen
    expect(call(at(answering, '$.root.children[1]'), 'onClick', 'a')).toBe(true)
  })

  it('stubs a required callback the document leaves unbound, and says so once it is whole', () => {
    const document = doc({
      component: 'ConfirmDialog',
      props: { title: 'Delete?', description: 'It goes.', confirmLabel: 'Delete', open: true },
    })
    const whole = open({ document })
    expect(typeof (whole.screen.root?.props['onConfirm'] as { value: unknown }).value).toBe(
      'function',
    )
    expect(call(whole.screen.root as ScreenNode, 'onConfirm')).toBeUndefined()
    expect(whole.faults.map(({ message }) => message)).toEqual([
      '`ConfirmDialog` is missing its required prop `onConfirm`',
    ])
    const streaming = open({ document, streaming: true })
    expect(streaming.faults).toEqual([])
    expect(streaming.screen.root?.props['onConfirm']).toBeDefined()
  })
})

describe('controls follow the reader', () => {
  const document = doc(
    {
      component: 'Stack',
      children: [
        { component: 'Input', props: { name: 'email', value: { $: 'email' } } },
        { component: 'Input', props: { name: 'note' } },
        { component: 'Checkbox', props: { name: 'agree', label: 'I agree', checked: false } },
        { component: 'Input', props: { placeholder: 'unnamed' } },
      ],
    },
    [{ name: 'email', type: 'string' }],
  )

  it('keeps what the reader chose for a value the host holds, until the host gives another', () => {
    const { screen } = open({ document, data: { email: 'a@example.com' } })
    call(at(screen, '$.root.children[0]'), 'onChange', 'b@example.com', {
      target: {},
      preventDefault() {},
    })
    expect(at(screen, '$.root.children[0]').props['value']).toEqual({
      kind: 'value',
      value: 'b@example.com',
      from: 'screen',
    })
    // New data for another input keeps the choice; new data for this one replaces it.
    screen.update({ data: { email: 'a@example.com', other: 1 } })
    expect((at(screen, '$.root.children[0]').props['value'] as { value: unknown }).value).toBe(
      'b@example.com',
    )
    screen.update({ data: { email: 'c@example.com' } })
    expect((at(screen, '$.root.children[0]').props['value'] as { value: unknown }).value).toBe(
      'c@example.com',
    )
  })

  it('leaves a control the document gives no value its own, and still knows what the reader chose', () => {
    const { screen } = open({ document })
    const note = at(screen, '$.root.children[1]')
    expect(note.props['value']).toBeUndefined()
    call(note, 'onChange', 'hello')
    expect(at(screen, '$.root.children[1]').props['value']).toBeUndefined()
    expect(screen.values['note']).toBe('hello')
  })

  it('holds every named control’s value as JSON, a checkbox’s `checked` among them', () => {
    const { screen, actions } = open({
      document: {
        ...document,
        inputs: [...document.inputs, { name: 'onSave', type: '() => void' }],
        root: {
          ...document.root,
          children: [
            ...document.root.children,
            { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
          ],
        },
      },
      data: { email: 'a@example.com' },
    })
    expect(screen.values).toEqual({ email: 'a@example.com', agree: false })
    call(at(screen, '$.root.children[2]'), 'onCheckedChange', true)
    call(at(screen, '$.root.children[4]'), 'onClick')
    expect(actions.at(-1)?.values).toEqual({ email: 'a@example.com', agree: true })
    // An unnamed control with no value and no binding is handed no handler.
    expect(at(screen, '$.root.children[3]').props['onChange']).toBeUndefined()
  })

  it('tells the host of a change the document binds, after the screen holds it', () => {
    const { screen, actions } = open({
      document: doc(
        { component: 'Input', props: { name: 'q', value: '', onChange: { $: 'onQuery' } } },
        [{ name: 'onQuery', type: '(value: string) => void' }],
      ),
    })
    call(screen.root as ScreenNode, 'onChange', 'x')
    expect(actions).toEqual([{ name: 'onQuery', args: ['x'], values: { q: 'x' } }])
  })
})

describe('addresses', () => {
  it('refuses one a screen may not hold, from the document or from the host’s data', () => {
    const { screen, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Link', props: { href: 'javascript:alert(1)' }, children: ['a'] },
            { component: 'Link', props: { href: { $: 'site' } }, children: ['b'] },
            { component: 'Link', props: { href: '/orders/7' }, children: ['c'] },
            {
              component: 'Breadcrumbs',
              props: { items: [{ $object: { label: 'Home', href: 'data:text/html,x' } }] },
            },
          ],
        },
        [{ name: 'site', type: 'string' }],
      ),
      data: { site: ' JavaScript:alert(1)' },
    })
    expect(at(screen, '$.root.children[0]').props['href']).toBeUndefined()
    expect(at(screen, '$.root.children[1]').props['href']).toBeUndefined()
    expect(at(screen, '$.root.children[2]').props['href']).toEqual({
      kind: 'value',
      value: '/orders/7',
      from: 'document',
    })
    expect(at(screen, '$.root.children[3]').props['items']).toEqual({
      kind: 'value',
      value: [{ label: 'Home' }],
      from: 'document',
    })
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.children[0].props.href',
      '$.root.children[1].props.href',
      '$.root.children[3].props.items[0].href',
    ])
  })
})

describe('streaming', () => {
  const text = JSON.stringify({
    spec: 'polymorph-screen/1',
    name: 'Probe',
    purpose: 'A screen that streams.',
    inputs: [{ name: 'onSave', type: '() => void' }],
    root: {
      component: 'Stack',
      children: [
        { component: 'Heading', children: ['Your order'] },
        { component: 'Input', props: { name: 'note', placeholder: 'A note' } },
        {
          component: 'Button',
          props: {
            variant: 'solid',
            tone: 'accent',
            label: 'Place the order',
            onClick: { $: 'onSave' },
          },
        },
      ],
    },
  })

  it('draws each cut, holds back a half-written word where it means something else, and reports nothing that has not arrived', () => {
    const faults: ScreenFault[] = []
    const screen = createScreen({
      document: undefined,
      vocabulary: VOCABULARY,
      streaming: true,
      onFault: (fault) => faults.push(fault),
    })
    const heading: ScreenNode[] = []
    for (let end = 1; end <= text.length; end += 1) {
      const cut = parsePartial(text.slice(0, end))
      screen.update({ document: cut.document, open: cut.open, streaming: !cut.complete })
      const button = screen.root?.children[2]
      if (button?.kind === 'node') {
        const variant = button.node.props['variant']
        if (variant !== undefined) expect((variant as { value: unknown }).value).toBe('solid')
      }
      const first = screen.root?.children[0]
      if (first?.kind === 'node' && first.node.children.length > 0) heading.push(first.node)
    }
    expect(faults).toEqual([])
    expect(draw(screen.root)).toBe(
      'Stack()[<Heading()[Your order]>, <Input(name="note", placeholder="A note")>, <Button(variant="solid", tone="accent", label="Place the order")>]',
    )
    // Once the heading was whole, every later cut kept its node: nothing redraws it.
    const whole = heading.findIndex((node) => draw(node) === 'Heading()[Your order]')
    expect(whole).toBeGreaterThan(-1)
    expect(new Set(heading.slice(whole)).size).toBe(1)
  })

  it('keeps a control’s state while the document grows', () => {
    const half = parsePartial(text.slice(0, text.indexOf('"Button"')))
    const screen = createScreen({
      document: half.document,
      vocabulary: VOCABULARY,
      streaming: true,
    })
    call(at(screen, '$.root.children[1]'), 'onChange', 'leave it at the door')
    screen.update({ document: JSON.parse(text), streaming: false })
    expect(screen.values).toEqual({ note: 'leave it at the door' })
  })
})

describe('what a renderer reports, and what it is told', () => {
  it('collects a fault a renderer reports, tells the host once, and lets it go when the node changes', () => {
    const { screen, faults } = open({ document: doc({ component: 'Text', children: ['a'] }) })
    const fault = { path: '$.root', component: 'Text', message: 'Text threw' }
    screen.fail(fault)
    screen.fail(fault)
    expect(faults).toEqual([fault])
    expect(screen.faults).toEqual([fault])
    screen.update({ document: doc({ component: 'Text', children: ['b'] }) })
    expect(screen.faults).toEqual([])
  })

  it('tells subscribers of each change, and keeps the nodes the change did not reach', () => {
    const { screen } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Text', children: [{ $: 'a' }] },
            { component: 'Text', children: ['fixed'] },
          ],
        },
        [{ name: 'a', type: 'string' }],
      ),
      data: { a: 'one' },
    })
    let told = 0
    const stop = screen.subscribe(() => {
      told += 1
    })
    const fixed = at(screen, '$.root.children[1]')
    screen.update({ data: { a: 'two' } })
    expect(told).toBe(1)
    expect(at(screen, '$.root.children[1]')).toBe(fixed)
    expect(draw(screen.root)).toBe('Stack()[<Text()[two]>, <Text()[fixed]>]')
    stop()
    screen.update({ data: { a: 'three' } })
    expect(told).toBe(1)
  })
})

describe('a value as JSON', () => {
  it('drops what JSON cannot say and keeps every argument at its position', () => {
    const event = { type: 'click', target: {}, preventDefault: () => {} }
    const node = { nodeType: 1, nodeName: 'DIV' }
    expect(argumentsToJson([event])).toEqual([])
    expect(argumentsToJson([{ id: 1 }, event, 2])).toEqual([{ id: 1 }, null, 2])
    expect(toJson({ a: () => {}, b: node, c: undefined, d: 1 })).toEqual({ d: 1 })
  })

  it('writes a date as its ISO text, a set as a list and a file as what it is', () => {
    const calendarDate = {
      year: 2026,
      compare: () => 0,
      copy: () => calendarDate,
      toString: () => '2026-07-15',
    }
    expect(toJson(new Date('2026-07-15T09:30:00Z'))).toBe('2026-07-15T09:30:00.000Z')
    expect(toJson(calendarDate)).toBe('2026-07-15')
    expect(toJson({ start: calendarDate, end: calendarDate })).toEqual({
      start: '2026-07-15',
      end: '2026-07-15',
    })
    expect(toJson(new Set(['a', 'b']))).toEqual(['a', 'b'])
    expect(toJson(new Map([['k', 1]]))).toEqual({ k: 1 })
    expect(
      toJson({ name: 'a.pdf', size: 3, type: 'application/pdf', arrayBuffer: () => {} }),
    ).toEqual({
      size: 3,
      name: 'a.pdf',
      type: 'application/pdf',
    })
    expect(toJson([Number.NaN, Infinity, 2n])).toEqual([null, null, '2'])
  })

  it('cuts a value that holds itself', () => {
    const loop: Record<string, unknown> = { a: 1 }
    loop['self'] = loop
    expect(toJson(loop)).toEqual({ a: 1 })
  })
})
