import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { checkScreen } from './check'
import { argumentsToJson, toJson } from './json'
import { keyTooLong, MAX_KEY_LENGTH, surfaceOf } from './members'
import { takesElement } from './receivers'
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
  // The host's handler, where a test gives one, is called after the action is recorded.
  const screen = createScreen({
    vocabulary: VOCABULARY,
    ...options,
    onAction: (action) => {
      actions.push(action)
      return options.onAction?.(action)
    },
    onFault: (fault) => faults.push(fault),
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
    expect(actions).toEqual([
      { name: 'onSave', args: [], values: { email: 'a@example.com' }, changed: [] },
    ])
  })

  it('hands the member the host’s promise, so a member that waits on its callback waits', async () => {
    const saving = Promise.resolve('saved')
    const { screen } = open({ document: form, onAction: () => saving })
    const result = call(at(screen, '$.root.children[1]'), 'onClick')
    expect(result).toBe(saving)
    await expect(result).resolves.toBe('saved')
  })

  it('hands a callback input by what receives it: the action, or a question’s stub', async () => {
    const table = (props: object) => ({
      component: 'DataTable',
      props: {
        label: 'Tickets',
        data: { $: 'tickets' },
        columns: [{ $object: { key: 'id', header: 'Id' } }],
        emptyState: { $object: { title: 'None' } },
        ...props,
      },
    })
    const document = doc(
      {
        component: 'Stack',
        children: [
          // An action input where the table asks a question of each row: the table's question.
          table({
            getRowId: { $: 'onRemove' },
            isRowExpandable: { $: 'onRemove' },
            getRowName: { $: 'rowKey' },
          }),
          // A question input where a button is pressed: the button's action.
          { component: 'Button', props: { label: 'Key', onClick: { $: 'rowKey' } } },
          { component: 'Button', props: { label: 'Save', onClick: { $: 'save' } } },
        ],
      },
      [
        { name: 'tickets', type: 'Ticket[]' },
        { name: 'onRemove', type: '(row: Ticket) => void' },
        { name: 'rowKey', type: '(row: Ticket) => string' },
        { name: 'save', type: '() => Promise<void>' },
      ],
    )
    // A host that would answer every call is asked nothing by a question: it is the member's.
    const { screen, actions } = open({
      document,
      data: { tickets: [{ id: 7 }] },
      onAction: () => true,
    })
    const rows = at(screen, '$.root.children[0]')
    expect(call(rows, 'getRowId', { id: 7 })).toBe('7')
    // A question the member may be left without is left unset, so it answers as it does by
    // default; one it requires is answered by a stub. Neither declaration is a fault.
    expect(rows.props['isRowExpandable']).toBeUndefined()
    expect(rows.props['getRowName']).toBeUndefined()
    expect(screen.faults).toEqual([])
    screen.update({ data: { tickets: [{ id: 8 }] } })
    expect(call(at(screen, '$.root.children[0]'), 'getRowId', { id: 8 })).toBe('8')
    expect(actions).toEqual([])
    call(at(screen, '$.root.children[1]'), 'onClick', { id: 7 })
    expect(actions.map(({ name, args }) => [name, args])).toEqual([['rowKey', [{ id: 7 }]]])
    // An action declared to return a promise is told, and with no promise from the host the
    // member waits on a promise of nothing.
    await expect(call(at(screen, '$.root.children[2]'), 'onClick')).resolves.toBeUndefined()
    expect(actions.map(({ name }) => name)).toEqual(['rowKey', 'save'])
    // The words say what each input declares, and read for a running screen and a picture alike.
    expect(screen.fills.map(({ name, value }) => [name, value])).toEqual([
      ['tickets', undefined],
      ['onRemove', 'an action; answers nothing'],
      ['rowKey', 'answers the key of its first argument'],
      ['save', 'an action; answers a promise'],
    ])
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

describe('a required prop with nothing behind it', () => {
  const document = doc(
    {
      component: 'Stack',
      children: [
        {
          component: 'ConfirmDialog',
          props: {
            title: 'Delete?',
            description: 'It goes.',
            confirmLabel: 'Delete',
            onConfirm: { $: 'undeclared' },
          },
        },
        { component: 'Stat', props: { label: 'Open', value: { $: 'open' } } },
      ],
    },
    [{ name: 'open', type: 'Count' }],
  )

  it('is stubbed when it is a callback bound to nothing', () => {
    const { screen } = open({ document })
    expect(call(at(screen, '$.root.children[0]'), 'onConfirm')).toBeUndefined()
  })

  it('is a fault when it is data the host has not given, and none in a picture, which samples it', () => {
    expect(open({ document }).faults.map(({ message }) => message)).toEqual([
      "`Stat` requires `value`, and the host's data holds nothing at `open`",
    ])
    expect(open({ document, fill: 'sample' }).faults).toEqual([])
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
    // A field nothing gives a value is empty, as the reader sees it.
    expect(screen.values).toEqual({ email: 'a@example.com', note: '', agree: false })
    call(at(screen, '$.root.children[2]'), 'onCheckedChange', true)
    call(at(screen, '$.root.children[4]'), 'onClick')
    expect(actions.at(-1)?.values).toEqual({ email: 'a@example.com', note: '', agree: true })
    // An unnamed control with no value and no binding is handed no handler.
    expect(at(screen, '$.root.children[3]').props['onChange']).toBeUndefined()
  })

  it('holds what the reader sees in a control nothing has changed: its default, else its empty value', () => {
    const { screen, actions } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Input', props: { name: 'displayName', defaultValue: 'Ada' } },
            { component: 'Checkbox', props: { name: 'subscribe', label: 'Subscribe' } },
            {
              component: 'Checkbox',
              props: { name: 'terms', label: 'Terms', defaultChecked: true },
            },
            {
              component: 'Select',
              props: { name: 'plan', options: [{ $object: { value: 'a', label: 'A' } }] },
            },
            {
              component: 'MultiSelect',
              props: {
                name: 'tags',
                label: 'Tags',
                options: [{ $object: { value: 'a', label: 'A' } }],
              },
            },
            { component: 'NumberInput', props: { name: 'seats', label: 'Seats' } },
            { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
          ],
        },
        [{ name: 'onSave', type: '() => void' }],
      ),
    })
    call(at(screen, '$.root.children[6]'), 'onClick')
    expect(actions[0]?.values).toEqual({
      displayName: 'Ada',
      subscribe: false,
      terms: true,
      plan: null,
      tags: [],
      seats: null,
    })
  })

  it('passes the reader’s choice back as the default of a control the document gives no value', () => {
    // A dialog's field: the member is drawn again when the dialog opens again, and starts from
    // its default, which is what the reader typed and what `values` holds.
    const { screen } = open({
      document: doc({ component: 'Input', props: { name: 'reason', defaultValue: '' } }),
    })
    call(screen.root as ScreenNode, 'onChange', 'spam')
    expect(screen.root?.props['value']).toBeUndefined()
    expect(screen.root?.props['defaultValue']).toEqual({
      kind: 'value',
      value: 'spam',
      from: 'screen',
    })
    expect(screen.values).toEqual({ reason: 'spam' })
  })

  it('lets a choice go when its control is named another name, and keys the control by its name', () => {
    const { screen } = open({
      document: doc({
        component: 'Stack',
        children: [{ component: 'Input', props: { name: 'email' } }],
      }),
    })
    const email = at(screen, '$.root.children[0]')
    expect(email.key).toBe('$.root.children[0]#email')
    call(email, 'onChange', 'a@b.c')
    expect(screen.values).toEqual({ email: 'a@b.c' })
    screen.update({
      document: doc({
        component: 'Stack',
        children: [
          { component: 'Input', props: { name: 'phone' } },
          { component: 'Input', props: { name: 'email' } },
        ],
      }),
    })
    // The phone field is a new control, which a renderer draws afresh under its new key.
    expect(at(screen, '$.root.children[0]').key).toBe('$.root.children[0]#phone')
    expect(at(screen, '$.root.children[0]').props['defaultValue']).toBeUndefined()
    expect(screen.values).toEqual({ phone: '', email: '' })
  })

  it('faults a name two controls share, and holds the last; and a name every object has, which it leaves out', () => {
    const { screen, faults } = open({
      document: doc({
        component: 'Stack',
        children: [
          { component: 'Input', props: { name: 'q', defaultValue: 'first' } },
          { component: 'Input', props: { name: 'q', defaultValue: 'second' } },
          { component: 'Input', props: { name: '__proto__', defaultValue: 'x' } },
          { component: 'Input', props: { name: 'constructor', defaultValue: 'y' } },
        ],
      }),
    })
    expect(screen.values).toEqual({ q: 'second' })
    expect(Object.getPrototypeOf(screen.values)).toBe(Object.prototype)
    expect(Object.keys(screen.values)).toEqual(['q'])
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.children[1].props.name',
      '$.root.children[2].props.name',
      '$.root.children[3].props.name',
    ])
  })

  it('tells the host of a change the document binds, after the screen holds it', () => {
    const { screen, actions } = open({
      document: doc(
        { component: 'Input', props: { name: 'q', value: '', onChange: { $: 'onQuery' } } },
        [{ name: 'onQuery', type: '(value: string) => void' }],
      ),
    })
    call(screen.root as ScreenNode, 'onChange', 'x')
    expect(actions).toEqual([{ name: 'onQuery', args: ['x'], values: { q: 'x' }, changed: ['q'] }])
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

describe('a function reaches a member only where a callback receives it', () => {
  const approve = [{ name: 'onApprove', type: '() => void' }]

  it('never tells the host of a drawing: a question’s stub where a member asks, by its type', () => {
    // Pagination asks `messages.page(n)` for every page's label.
    const { screen, actions } = open({
      document: doc(
        {
          component: 'Pagination',
          props: {
            page: 1,
            pageCount: 3,
            onPageChange: { $: 'go' },
            messages: { $object: { page: { $: 'onPay' }, next: 'Next', previous: 'Back' } },
          },
        },
        [
          { name: 'onPay', type: '(page: number) => void' },
          { name: 'go', type: '(page: number) => void' },
        ],
      ),
    })
    const messages = screen.root?.props['messages'] as {
      kind: 'value'
      value: Record<string, unknown>
    }
    // `page` is a field `PaginationMessages` requires, so a stub answers it.
    const page = messages.value['page'] as (page: number) => unknown
    expect(page(3)).toBe('3')
    screen.update({ data: {} })
    expect(actions).toEqual([])
    // Where a person acts, the same kind of input is the action.
    call(screen.root as ScreenNode, 'onPageChange', 2)
    expect(actions.map(({ name }) => name)).toEqual(['go'])
  })

  it('leaves a question unset where its field may be left out, so the member answers it', () => {
    // A column's `cell` is optional: a table draws the row's value at the column's key.
    const { screen, faults } = open({
      document: doc(
        {
          component: 'DataTable',
          props: {
            label: 'Rows',
            data: { $: 'rows' },
            columns: [{ $object: { key: 'id', header: 'Id', cell: { $: 'renderCell' } } }],
            getRowId: { $: 'rowId' },
            emptyState: { $object: { title: 'None' } },
          },
        },
        [
          { name: 'rows', type: 'Row[]' },
          { name: 'renderCell', type: '(row: Row) => string' },
          { name: 'rowId', type: '(row: Row) => string' },
        ],
      ),
      data: { rows: [] },
    })
    expect(screen.root?.props['columns']).toEqual({
      kind: 'value',
      value: [{ key: 'id', header: 'Id' }],
      from: 'document',
    })
    expect(faults).toEqual([])
  })

  it('is a fault, and nothing is passed, where text, a node or data receives a callback input', () => {
    const { screen, actions, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Button', props: { label: { $: 'onApprove' } } },
            { component: 'Text', children: [{ $: 'onApprove' }] },
            {
              component: 'Breadcrumbs',
              props: { items: [{ $object: { label: 'A', x: { $: 'onApprove' } } }] },
            },
          ],
        },
        approve,
      ),
    })
    // A button whose label is refused has no name, so it is not drawn.
    expect(at(screen, '$.root.children[0]').fault?.message).toBe(
      '`Button` is not drawn, as its required prop `label` has no value',
    )
    expect(at(screen, '$.root.children[1]').children.map(({ kind }) => kind)).toEqual(['fault'])
    expect(at(screen, '$.root.children[2]').props['items']).toEqual({
      kind: 'value',
      value: [{ label: 'A' }],
      from: 'document',
    })
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.children[0].props.label',
      '$.root.children[0]',
      '$.root.children[1].children[0]',
      '$.root.children[2].props.items[0].x',
    ])
    expect(faults[0]?.message).toContain(
      '`onApprove` is a callback input, and no callback receives it',
    )
    expect(actions).toEqual([])
  })

  it('passes nothing where the vocabulary does not know the object’s type, as a row of the host’s', () => {
    const { screen, faults } = open({
      document: doc(
        {
          component: 'DataTable',
          props: {
            label: 'Rows',
            data: [{ $object: { id: 'a', open: { $: 'onApprove' } } }],
            columns: [{ $object: { key: 'id', header: 'Id' } }],
            getRowId: { $: 'rowId' },
            emptyState: { $object: { title: 'None' } },
          },
        },
        [...approve, { name: 'rowId', type: '(row: Row) => string' }],
      ),
    })
    expect(screen.root?.props['data']).toEqual({
      kind: 'value',
      value: [{ id: 'a' }],
      from: 'document',
    })
    expect(faults.map(({ path }) => path)).toEqual(['$.root.props.data[0].open'])
  })

  it('never hands on a function the host’s data holds, though a function inside data is the host’s', () => {
    const logout = () => 'logged out'
    const cell = () => 'cell'
    const { screen, actions, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            {
              component: 'Button',
              props: { label: 'View details', onClick: { $: 'session.logout' } },
            },
            { component: 'Button', props: { label: { $: 'session.logout' } } },
            {
              component: 'DataTable',
              props: {
                label: 'Rows',
                data: { $: 'rows' },
                columns: { $: 'columns' },
                getRowId: { $: 'rowId' },
                emptyState: { $object: { title: 'None' } },
              },
            },
          ],
        },
        [
          { name: 'session', type: 'Session' },
          { name: 'rows', type: 'Row[]' },
          { name: 'columns', type: 'DataTableColumn<Row>[]' },
          { name: 'rowId', type: '(row: Row) => string' },
        ],
      ),
      data: { session: { logout }, rows: [], columns: [{ key: 'id', header: 'Id', cell }] },
    })
    expect(at(screen, '$.root.children[0]').props['onClick']).toBeUndefined()
    expect(at(screen, '$.root.children[1]').fault).not.toBeNull()
    expect(at(screen, '$.root.children[2]').props['columns']).toEqual({
      kind: 'value',
      value: [{ key: 'id', header: 'Id', cell }],
      from: 'data',
    })
    expect(faults.map(({ path, message }) => [path, message.slice(0, 54)])).toEqual([
      [
        '$.root.children[0].props.onClick',
        "the host's data holds a function at `session.logout`, ",
      ],
      ['$.root.children[1].props.label', "the host's data holds a function at `session.logout`, "],
      ['$.root.children[1]', '`Button` is not drawn, as its required prop `label` ha'],
    ])
    expect(actions).toEqual([])
  })
})

describe('an element in a structured object is drawn only where its field takes a node', () => {
  const approved = { component: 'Input', props: { name: 'approved', defaultValue: 'yes' } }
  const page = (emptyState: object) =>
    doc({
      component: 'ListPage',
      props: { title: 'Requests', emptyState: { $object: emptyState } },
    })

  it('is a fault, and is not drawn, in a field the type does not declare or declares as data', () => {
    const { screen, faults } = open({
      document: page({ title: 'None', x: approved, description: [approved] }),
    })
    expect(screen.values).toEqual({})
    // A field that takes data keeps its data, and loses its elements.
    expect(screen.root?.props['emptyState']).toEqual({
      kind: 'value',
      value: { title: 'None', description: [] },
      from: 'document',
    })
    expect(faults.map(({ path, message }) => [path, message])).toEqual([
      [
        '$.root.props.emptyState.x',
        '`EmptyStateProps` has no field `x`, so no member draws an element there; it is left out',
      ],
      [
        '$.root.props.emptyState.description',
        '`description` of `EmptyStateProps` is data, not a node, so no member draws an element there; it is left out',
      ],
    ])
  })

  it('reads a list of a union of data types, as a select’s options', () => {
    const { screen, faults } = open({
      document: doc({
        component: 'Select',
        props: {
          name: 'plan',
          options: [
            { $object: { value: 'a', label: approved } },
            { $object: { value: 'b', label: 'B' } },
          ],
        },
      }),
    })
    expect(screen.values).toEqual({ plan: null })
    expect(faults.map(({ path, message }) => [path, message.slice(0, 40)])).toEqual([
      ['$.root.props.options[0].label', '`label` of `SelectOption` or `SelectOpti'],
    ])
  })

  it('is drawn, and holds a value, in a field that takes a node', () => {
    const { screen, faults } = open({ document: page({ title: 'None', action: approved }) })
    expect(faults).toEqual([])
    expect(screen.values).toEqual({ approved: 'yes' })
  })
})

describe('what the person changed', () => {
  it('names the controls whose value the person chose, apart from what the document wrote', () => {
    const { screen, actions } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Input', props: { name: 'approved', defaultValue: 'yes' } },
            { component: 'Input', props: { name: 'reason' } },
            { component: 'Button', props: { label: 'Send', onClick: { $: 'onSend' } } },
          ],
        },
        [{ name: 'onSend', type: '() => void' }],
      ),
    })
    expect(screen.changed).toEqual([])
    call(at(screen, '$.root.children[1]'), 'onChange', 'too slow')
    call(at(screen, '$.root.children[2]'), 'onClick')
    expect(actions[0]).toEqual({
      name: 'onSend',
      args: [],
      values: { approved: 'yes', reason: 'too slow' },
      changed: ['reason'],
    })
  })

  it('holds a name two controls share as the last in document order, an element before its props', () => {
    // The outer field comes first in the text, so the field its `trailing` prop holds is the last.
    const { screen, faults } = open({
      document: doc({
        component: 'Input',
        props: {
          name: 'q',
          defaultValue: 'outer',
          trailing: { component: 'Input', props: { name: 'q', defaultValue: 'inner' } },
        },
      }),
    })
    expect(screen.values).toEqual({ q: 'inner' })
    expect(faults.map(({ path }) => path)).toEqual(['$.root.props.trailing.props.name'])
  })
})

describe('an element is drawn once every prop it requires has a value', () => {
  const approve = [{ name: 'onApprove', type: '() => void' }]
  const named = { component: 'Input', props: { name: 'nickname', defaultValue: 'Ada' } }

  it('is not drawn where a required prop was never written or was refused, and a fault says which', () => {
    const { screen, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Button', props: {} },
            { component: 'Button', props: { label: { $: 'onApprove' } } },
            { component: 'Button', props: { label: { text: 'Save' } } },
            // A row whose control is no member, and whose named field is then drawn nowhere.
            { component: 'SettingsRow', props: { label: { $: 'onApprove' }, control: named } },
            {
              component: 'SettingsRow',
              props: { label: 'Theme', control: { component: 'Buton' } },
            },
          ],
        },
        approve,
      ),
    })
    const notDrawn = [0, 1, 2, 3, 4].map(
      (index) => at(screen, `$.root.children[${index}]`).fault?.message,
    )
    expect(notDrawn).toEqual([
      '`Button` is missing its required prop `label`',
      '`Button` is not drawn, as its required prop `label` has no value',
      '`Button` is not drawn, as its required prop `label` has no value',
      '`SettingsRow` is not drawn, as its required prop `label` has no value',
      // A row reads its one control, so it is not drawn without one it can draw.
      '`SettingsRow` is not drawn, as its required prop `control` has no value',
    ])
    expect(at(screen, '$.root.children[3]').props).toEqual({})
    // The field the row held is drawn nowhere, so it holds no value.
    expect(screen.values).toEqual({})
    // Each cause is told at its prop, and each element left undrawn at its own path.
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.children[0]',
      '$.root.children[1].props.label',
      '$.root.children[1]',
      '$.root.children[2].props.label',
      '$.root.children[2]',
      '$.root.children[3].props.label',
      '$.root.children[3]',
      '$.root.children[4].props.control',
      '$.root.children[4]',
    ])
  })

  it('is drawn without an address refused, without data the host has not given, and with a stub for a callback', () => {
    const { screen, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            { component: 'Link', props: { href: 'javascript:alert(1)' }, children: ['Open'] },
            { component: 'Image', props: { src: 'data:text/html,x', alt: 'A cat' } },
            { component: 'Button', props: { label: { $: 'title' } } },
            {
              component: 'ConfirmDialog',
              props: { title: 'Delete?', description: 'It goes.', confirmLabel: 'Delete' },
            },
          ],
        },
        [{ name: 'title', type: 'string' }],
      ),
    })
    for (const index of [0, 1, 2, 3]) {
      expect(at(screen, `$.root.children[${index}]`).fault).toBeNull()
    }
    expect(at(screen, '$.root.children[0]').children).toEqual([
      { kind: 'value', value: 'Open', from: 'document' },
    ])
    expect(at(screen, '$.root.children[1]').props['alt']).toBeDefined()
    expect(
      typeof (at(screen, '$.root.children[3]').props['onConfirm'] as { value: unknown }).value,
    ).toBe('function')
    expect(faults.map(({ path, message }) => [path, message.slice(0, 30)])).toEqual([
      ['$.root.children[0].props.href', '"javascript:alert(1)" is not a'],
      ['$.root.children[1].props.src', '"data:text/html,x" is not an a'],
      ['$.root.children[2].props.label', '`Button` requires `label`, and'],
      ['$.root.children[3]', '`ConfirmDialog` is missing its'],
    ])
  })

  it('is not drawn, once whole, where a member that reads its one child has none it can draw', () => {
    const field = (children?: unknown[]) => ({
      component: 'FormField',
      props: { label: 'Name' },
      ...(children === undefined ? {} : { children }),
    })
    const { screen, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            field(),
            field([{ component: 'Buton' }]),
            field([{ $: 'onApprove' }]),
            field(['Ada']),
            field([{ component: 'Input', props: { name: 'name' } }]),
          ],
        },
        approve,
      ),
    })
    const drawn = [0, 1, 2, 3, 4].map(
      (index) => at(screen, `$.root.children[${index}]`).fault?.message ?? 'drawn',
    )
    expect(drawn).toEqual([
      '`FormField` is missing its required child, one element',
      '`FormField` is not drawn, as it takes one element as its child, and has none it can draw',
      '`FormField` is not drawn, as it takes one element as its child, and has none it can draw',
      '`FormField` is not drawn, as it takes one element as its child, and has none it can draw',
      'drawn',
    ])
    expect(screen.values).toEqual({ name: '' })
    expect(faults.filter(({ message }) => message.startsWith('`FormField`'))).toHaveLength(4)
  })

  it('is left out while the document streams, and is a fault once it is whole', () => {
    const document = doc(
      {
        component: 'Stack',
        children: [
          { component: 'Text', children: ['Kept'] },
          { component: 'Button', props: { label: { $: 'onApprove' } } },
        ],
      },
      approve,
    )
    const { screen, faults } = open({ document, streaming: true })
    expect(screen.root?.children.map(({ kind }) => kind)).toEqual(['node'])
    expect(faults.map(({ path }) => path)).toEqual(['$.root.children[1].props.label'])
    screen.update({ streaming: false })
    expect(
      screen.root?.children.map((child) => child.kind === 'node' && child.node.fault !== null),
    ).toEqual([false, true])
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.children[1].props.label',
      '$.root.children[1]',
    ])
  })
})

describe('a prop that takes one element, which its member reads', () => {
  const row = (control?: unknown) => ({
    component: 'SettingsRow',
    props: { label: 'Theme', ...(control === undefined ? {} : { control }) },
  })
  const page = (rows: unknown[]) =>
    doc({
      component: 'SettingsPage',
      props: { title: 'Settings' },
      children: [{ component: 'SettingsRow.Group', props: { title: 'Look' }, children: rows }],
    })

  it('leaves out a row whose control is missing or no member, and draws everything above it', () => {
    const { screen, faults } = open({
      document: page([
        row(),
        row({ component: 'Buton' }),
        row({ component: 'Switch', props: { label: 'Dark', name: 'dark' } }),
      ]),
    })
    const group = '$.root.children[0]'
    expect(screen.root?.fault).toBeNull()
    expect(at(screen, group).fault).toBeNull()
    expect(
      [0, 1, 2].map((index) => at(screen, `${group}.children[${index}]`).fault?.message),
    ).toEqual([
      '`SettingsRow` is missing its required prop `control`',
      '`SettingsRow` is not drawn, as its required prop `control` has no value',
      undefined,
    ])
    expect(faults.map(({ path }) => path)).toEqual([
      `${group}.children[0]`,
      `${group}.children[1].props.control`,
      `${group}.children[1]`,
    ])
  })

  it('waits while it streams for a row’s control to be drawn, and never hands the row without one', () => {
    const text = JSON.stringify(
      page([row({ component: 'Buton' }), row({ component: 'Switch', props: { label: 'Dark' } })]),
    )
    const screen = createScreen({ document: undefined, vocabulary: VOCABULARY, streaming: true })
    const rows = (node: ScreenNode | null): ScreenNode[] =>
      node === null
        ? []
        : [
            ...(node.component === 'SettingsRow' && node.fault === null ? [node] : []),
            ...node.children.flatMap((child) => (child.kind === 'node' ? rows(child.node) : [])),
          ]
    let drew = false
    for (let end = 1; end <= text.length; end += 1) {
      const read = parsePartial(text.slice(0, end))
      screen.update({
        document: read.document,
        open: read.open,
        cut: read.cut,
        streaming: !read.complete,
      })
      for (const drawn of rows(screen.root)) {
        const control = drawn.props['control']
        expect(control?.kind === 'node' && control.node.fault === null, `character ${end}`).toBe(
          true,
        )
        drew = true
      }
    }
    expect(drew).toBe(true)
  })

  it('leaves an optional one unset where its element is no member, or it is no element', () => {
    const { screen, faults } = open({
      document: doc(
        {
          component: 'Stack',
          children: [
            {
              component: 'Dialog',
              props: { title: 'Hi', trigger: { component: 'Buton' } },
              children: ['x'],
            },
            { component: 'Dialog', props: { title: 'Hi', trigger: 'Open' }, children: ['x'] },
            { component: 'PageHeader', props: { title: 'A', titleEdit: { $: 'edit' } } },
          ],
        },
        [{ name: 'edit', type: 'Edit' }],
      ),
      data: { edit: { component: 'InlineEdit' } },
    })
    for (const [index, prop] of [
      [0, 'trigger'],
      [1, 'trigger'],
      [2, 'titleEdit'],
    ] as const) {
      expect(at(screen, `$.root.children[${index}]`).fault).toBeNull()
      expect(at(screen, `$.root.children[${index}]`).props[prop], prop).toBeUndefined()
    }
    expect(faults.map(({ path, message }) => [path, message.slice(0, 30)])).toEqual([
      ['$.root.children[0].props.trigger', 'no component called `Buton`'],
      ['$.root.children[1].props.trigger', '`trigger` takes one element, w'],
      ['$.root.children[2].props.titleEdit', '`titleEdit` takes one element,'],
    ])
  })
})

describe('a fault in a slot leaves its page drawn', () => {
  const form = (actions: object) =>
    doc({
      component: 'FormPage',
      props: { title: 'Book a room', actions },
      children: [{ component: 'Text', children: ['Fields'] }],
    })

  it('draws a page whose required slot holds a member no one has, or one the host leaves out', () => {
    const misspelt = open({ document: form({ component: 'Buton', props: { label: 'Save' } }) })
    expect(misspelt.screen.root?.fault).toBeNull()
    expect(draw(misspelt.screen.root)).toContain('Text()[Fields]')
    expect(misspelt.faults.map(({ path }) => path)).toEqual(['$.root.props.actions'])
    const left = open({
      document: form({ component: 'Button', props: { label: 'Save' } }),
      members: ['FormPage', 'Text'],
    })
    expect(left.screen.root?.fault).toBeNull()
    expect(left.faults.map(({ path }) => path)).toEqual(['$.root.props.actions'])
  })

  it('draws a page while it streams once its slot’s element is whole, a fault or not', () => {
    const text = JSON.stringify(form({ component: 'Buton', props: { label: 'Save' } }))
    const screen = createScreen({ document: undefined, vocabulary: VOCABULARY, streaming: true })
    const drawnAt: boolean[] = []
    for (let end = 1; end <= text.length; end += 1) {
      const read = parsePartial(text.slice(0, end))
      screen.update({
        document: read.document,
        open: read.open,
        cut: read.cut,
        streaming: !read.complete,
      })
      drawnAt.push(screen.root !== null && screen.root.fault === null)
    }
    // Drawn from some cut on, and never taken away again.
    const first = drawnAt.indexOf(true)
    expect(first).toBeGreaterThan(0)
    expect(drawnAt.slice(first).every(Boolean)).toBe(true)
  })

  it('draws a page whose required slot is never written, and says so', () => {
    const { screen, faults } = open({
      document: doc({ component: 'FormPage', props: { title: 'Book a room' }, children: ['x'] }),
    })
    expect(screen.root?.fault).toBeNull()
    expect(faults.map(({ message }) => message)).toEqual([
      '`FormPage` is missing its required prop `actions`',
    ])
  })

  it('leaves every element that holds an element drawn when that element is no member', () => {
    // Each element of every lawful screen and fixture in turn named a component no one has.
    const SCREENS = [
      'design/screens/inbox.json',
      'design/screens/new-ticket.json',
      'design/screens/settings.json',
      'design/screens/agent-loop/attempt-1.json',
      'design/screens/agent-loop/attempt-2.json',
      ...[
        'book-room',
        'order-detail',
        'revenue-stats',
        'ticket-queue',
        'usage-overview',
        'workspace-settings',
      ].map((name) => `packages/screen/fixtures/${name}.json`),
    ]
    /** Every element's path in a document, with the paths of the elements that hold it. */
    const elements = (value: unknown, path: string, above: string[], out: [string, string[]][]) => {
      if (Array.isArray(value)) {
        value.forEach((item, at) => elements(item, `${path}[${at}]`, above, out))
        return
      }
      if (typeof value !== 'object' || value === null) return
      const record = value as Record<string, unknown>
      if (typeof record['component'] === 'string') {
        out.push([path, above])
        const props = (record['props'] ?? {}) as Record<string, unknown>
        for (const [key, item] of Object.entries(props)) {
          elements(item, `${path}.props.${key}`, [...above, path], out)
        }
        elements(record['children'], `${path}.children`, [...above, path], out)
        return
      }
      const fields = record['$object']
      if (typeof fields === 'object' && fields !== null) {
        for (const [key, item] of Object.entries(fields))
          elements(item, `${path}.${key}`, above, out)
      }
    }
    const drawnAt = (screen: Screen) => {
      const found = new Map<string, ScreenNode>()
      const visit = (drawn: Drawn) => {
        if (drawn.kind === 'node') walk(drawn.node)
        else if (drawn.kind === 'list') drawn.items.forEach(visit)
        else if (drawn.kind === 'record') Object.values(drawn.fields).forEach(visit)
      }
      const walk = (node: ScreenNode) => {
        if (node.fault !== null) return
        found.set(node.path, node)
        Object.values(node.props).forEach(visit)
        node.children.forEach(visit)
      }
      if (screen.root !== null) walk(screen.root)
      return found
    }
    let replaced = 0
    for (const file of SCREENS) {
      const document = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as {
        root: unknown
      }
      const before = drawnAt(createScreen({ document, vocabulary: VOCABULARY, fill: 'sample' }))
      const found: [string, string[]][] = []
      elements(document.root, '$.root', [], found)
      for (const [path, above] of found) {
        const copy = JSON.parse(JSON.stringify(document)) as { root: unknown }
        // The element at `path`, renamed in the copy.
        const steps = path.slice('$.root'.length).match(/\.[^.[]+|\[\d+\]/g) ?? []
        let at: Record<string, unknown> = copy as unknown as Record<string, unknown>
        let key: string | number = 'root'
        for (const step of steps) {
          let next = at[key] as Record<string, unknown>
          if (
            typeof next === 'object' &&
            next !== null &&
            '$object' in next &&
            !step.startsWith('[')
          ) {
            next = next['$object'] as Record<string, unknown>
          }
          at = next
          key = step.startsWith('[') ? Number(step.slice(1, -1)) : step.slice(1)
        }
        ;(at[key] as Record<string, unknown>)['component'] = 'Zzz'
        replaced += 1
        const after = drawnAt(
          createScreen({ document: copy, vocabulary: VOCABULARY, fill: 'sample' }),
        )
        for (const ancestor of above) {
          // A member that reads its one child (FormField) or one element in a prop (a SettingsRow's
          // control) is not drawn without it; the elements above it are.
          const holder = before.get(ancestor)
          const prop = path.slice(ancestor.length).match(/^\.props\.([^.[]+)$/)?.[1]
          const type = surfaceOf(VOCABULARY, holder?.component ?? '')?.props.find(
            ({ name }) => name === prop,
          )?.type
          if (
            ancestor === above.at(-1) &&
            (holder?.childrenKind === 'element' || takesElement(VOCABULARY, type ?? null))
          ) {
            continue
          }
          if (holder !== undefined) {
            expect(after.has(ancestor), `${file} ${path}: ${ancestor}`).toBe(true)
          }
        }
      }
    }
    expect(replaced).toBeGreaterThan(100)
  })
})

describe('an element below a field that takes no node is drawn nowhere', () => {
  const approved = { component: 'Input', props: { name: 'approved', defaultValue: 'yes' } }
  const page = (zz: unknown) =>
    doc({
      component: 'ListPage',
      props: { title: 'Requests', emptyState: { $object: { title: 'None', zz } } },
    })

  it('is dropped, with one fault at the field, through structured objects and lists', () => {
    for (const zz of [
      { $object: { a: approved, count: 3 } },
      [{ $object: { a: [approved], note: 'kept' } }],
    ]) {
      const document = page(zz)
      const { screen, faults } = open({ document })
      expect(screen.values).toEqual({})
      expect(faults.map(({ path }) => path)).toEqual(['$.root.props.emptyState.zz'])
      expect(checkScreen(document).faults.map(({ path }) => path)).toContain(
        '$.root.props.emptyState.zz',
      )
    }
    // The field's own data is kept.
    const { screen } = open({ document: page({ $object: { a: approved, count: 3 } }) })
    expect(screen.root?.props['emptyState']).toEqual({
      kind: 'value',
      value: { title: 'None', zz: { count: 3 } },
      from: 'document',
    })
  })
})

describe('a key a document writes', () => {
  it('is a fault at its parent when it is longer than any a member reads, and what it holds is not walked', () => {
    const key = 'k'.repeat(MAX_KEY_LENGTH + 1)
    const { screen, faults } = open({
      document: doc(
        {
          // A table's rows are of the host's own type, so an element in them would be drawn.
          component: 'DataTable',
          props: {
            label: 'Rows',
            data: [
              {
                $object: {
                  id: 'a',
                  [key]: [{ component: 'Input', props: { name: 'hidden', defaultValue: 'x' } }],
                },
              },
            ],
            columns: [],
            getRowId: { $: 'rowId' },
            emptyState: { $object: { title: 'None' } },
            [key]: 'x',
          },
        },
        [{ name: 'rowId', type: '(row: Row) => string' }],
      ),
    })
    expect(screen.values).toEqual({})
    expect(faults.map(({ path, message }) => [path, message])).toEqual([
      ['$.root.props.data[0]', keyTooLong(key.length)],
      ['$.root', keyTooLong(key.length)],
    ])
    expect(screen.root?.props['data']).toEqual({
      kind: 'value',
      value: [{ id: 'a' }],
      from: 'document',
    })
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
    const { screen, faults } = open({
      document: doc({ component: 'Text', children: [{ $: 'word' }] }, [
        { name: 'word', type: 'string' },
      ]),
      data: { word: 'a' },
    })
    const fault = { path: '$.root', component: 'Text', message: 'Text threw' }
    screen.fail(fault)
    screen.fail(fault)
    expect(faults).toEqual([fault])
    expect(screen.faults).toEqual([fault])
    // New data is the same drawing: the node changes, and its fault goes with it.
    screen.update({ data: { word: 'b' } })
    expect(screen.faults).toEqual([])
    // The renderer reports it again for the new node: it is a fault again, told once already.
    screen.fail(fault)
    expect(screen.faults).toEqual([fault])
    expect(faults).toEqual([fault])
  })

  it('tells each fault once in a drawing, and again in a new stream or a new whole document', () => {
    const buton = doc({ component: 'Stack', children: [{ component: 'Buton' }] })
    const { screen, faults } = open({ document: buton })
    const told = () => faults.map(({ message }) => message)
    // A stream's chunks are one drawing: a fault that goes and comes back is told once.
    screen.update({ streaming: true })
    expect(told()).toEqual(['no component called `Buton`', 'no component called `Buton`'])
    screen.update({ document: doc({ component: 'Stack', children: [] }) })
    screen.update({ document: buton, streaming: false })
    expect(told()).toHaveLength(2)
    // The same whole document again, as a renderer gives it after new data, is the same drawing.
    screen.update({ document: JSON.parse(JSON.stringify(buton)) as unknown, data: { x: 1 } })
    expect(told()).toHaveLength(2)
    // A whole document that differs is a new screen, whose fault is told though the last had it.
    const other = doc({ component: 'Stack', props: { gap: 2 }, children: [{ component: 'Buton' }] })
    screen.update({ document: other })
    expect(told()).toHaveLength(3)
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

describe('what a renderer passes', () => {
  const document = doc(
    {
      component: 'Stack',
      children: [
        {
          component: 'ListPage',
          props: {
            title: 'Orders',
            emptyState: {
              $object: {
                title: 'None',
                secondaryAction: { component: 'Button', props: { label: 'Add' } },
              },
            },
            actions: [{ component: 'Button', props: { label: 'A' } }, 'and text', { $: 'title' }],
          },
          children: [{ component: 'Text', children: [{ $: 'title' }, { $object: { a: 1 } }] }],
        },
      ],
    },
    [{ name: 'title', type: 'string' }],
  )

  it('turns each kind of drawn value into what a renderer passes', () => {
    const { screen } = open({ document, data: { title: 'Mine' } })
    const page = at(screen, '$.root.children[0]')
    const materials = {
      node: (node: ScreenNode) => `<${node.component}>`,
      binding: (path: string) => `⟨${path}⟩`,
      fault: () => '!',
    }
    expect(materialize(page.props['emptyState'] as Drawn, materials)).toEqual({
      title: 'None',
      secondaryAction: '<Button>',
    })
    expect(materialize(page.props['actions'] as Drawn, materials)).toEqual([
      '<Button>',
      'and text',
      '⟨title⟩',
    ])
    const text = at(screen, '$.root.children[0].children[0]')
    expect(text.children.map((child) => materialize(child, materials))).toEqual(['⟨title⟩', '!'])
    // Without a way to draw them, a binding is its value and a fault nothing.
    expect(text.children.map((child) => materialize(child, { node: () => null }))).toEqual([
      'Mine',
      null,
    ])
  })

  it('keeps every node’s object when nothing it draws changed', () => {
    const { screen } = open({ document, data: { title: 'Mine' } })
    const root = screen.root
    screen.update({ document: JSON.parse(JSON.stringify(document)) as unknown })
    expect(screen.root).toBe(root)
    screen.update({ data: { title: 'Yours' } })
    expect(screen.root).not.toBe(root)
    expect(at(screen, '$.root.children[0].props.emptyState.secondaryAction')).toBe(
      at({ root } as Screen, '$.root.children[0].props.emptyState.secondaryAction'),
    )
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
