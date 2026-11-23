import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PolyElement, type PolymorphEvent } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import newTicket from '../../../../design/screens/new-ticket.json'
import bookRoom from '../../../screen/fixtures/book-room.json'
import orderDetail from '../../../screen/fixtures/order-detail.json'
import usageOverview from '../../../screen/fixtures/usage-overview.json'
import workspaceSettings from '../../../screen/fixtures/workspace-settings.json'
import {
  ACTION_EVENT,
  drawScreen,
  FAULT_EVENT,
  parsePartial,
  PolyScreen,
  type ScreenAction,
  type ScreenDrawing,
  type ScreenFault,
} from './index'

/**
 * A run-time screen drawn as `poly-*` elements, by `drawScreen` and by
 * `<poly-screen>`, in a real browser: what a document draws, what a member's
 * callback tells the host, how a control follows the reader, and how a
 * drawing changes in place as its data changes and its document streams in.
 *
 * Every element renders a microtask after it is placed, and a member's code
 * loads the first time one of its elements renders, so every read of the
 * drawing waits for it.
 */

beforeAll(installTestTheme)

const WAIT = { timeout: 15_000, interval: 20 }

/** A frame for the browser to paint, so the elements placed so far render. */
const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

const hosts: HTMLElement[] = []
const drawings: ScreenDrawing[] = []

afterEach(() => {
  for (const drawing of drawings.splice(0)) drawing.dispose()
  for (const host of hosts.splice(0)) host.remove()
})

/** An element of the test's own at the end of the body. */
function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  hosts.push(element)
  return element
}

function draw(options: Parameters<typeof drawScreen>[1]): {
  host: HTMLElement
  drawing: ScreenDrawing
} {
  const into = host()
  const drawing = drawScreen(into, options)
  drawings.push(drawing)
  return { host: into, drawing }
}

/** A `<poly-screen>` in an element of the test's own, with its properties set before it connects. */
function screen(
  properties: Partial<
    Pick<PolyScreen, 'spec' | 'text' | 'data' | 'streaming' | 'members' | 'faults'>
  > = {},
): {
  host: HTMLElement
  element: PolyScreen
  actions: ScreenAction[]
  faults: ScreenFault[]
} {
  const into = host()
  const element = document.createElement('poly-screen')
  Object.assign(element, properties)
  const actions: ScreenAction[] = []
  const faults: ScreenFault[] = []
  element.addEventListener(ACTION_EVENT, (event) =>
    actions.push((event as CustomEvent<ScreenAction>).detail),
  )
  element.addEventListener(FAULT_EVENT, (event) =>
    faults.push((event as CustomEvent<ScreenFault>).detail),
  )
  into.append(element)
  return { host: into, element, actions, faults }
}

/** A document with one root. */
const doc = (root: object, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen a test draws.',
  inputs,
  root,
})

/** What happens to every member's element while `act` runs: which rendered and which were disposed. */
async function watching(
  act: () => Promise<void>,
): Promise<{ rendered: Map<Element, number>; disposed: string[] }> {
  const rendered = new Map<Element, number>()
  const disposed: string[] = []
  const stop = PolyElement.observe((element, event) => {
    if (event === 'dispose') disposed.push(element.localName)
    else rendered.set(element, (rendered.get(element) ?? 0) + 1)
  })
  try {
    await act()
  } finally {
    stop()
  }
  return { rendered, disposed }
}

const buttonNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(name),
  )

describe('a document', () => {
  it('draws as the members it names, with the host’s data', async () => {
    const { host: into } = draw({
      document: newTicket,
      data: {
        subject: 'Webhooks stop',
        requester: '',
        priority: 'high',
        priorityOptions: [
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' },
        ],
        assigneeOptions: [],
        notify: true,
      },
    })
    await vi.waitFor(() => {
      expect(into.querySelector('h1, h2')?.textContent).toBe('New ticket')
      expect(into.querySelector<HTMLInputElement>('input')?.value).toBe('Webhooks stop')
      expect(buttonNamed(into, 'Create ticket')).toBeDefined()
      expect(into.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    }, WAIT)
    // Each element draws no box of its own, so the members lay out as the document says.
    expect(into.firstElementChild?.localName).toBe('poly-form-page')
    expect(getComputedStyle(into.firstElementChild as Element).display).toBe('contents')
  })

  it('draws a part inside its member, and a structural part where its member puts it', async () => {
    const { host: into } = draw({
      document: usageOverview,
      data: {
        stats: [{ label: 'Requests', value: '1.2M' }],
        requests: [{ day: 'Mon', requests: 3 }],
        requestSeries: [{ key: 'requests', label: 'Requests' }],
        requestAxis: { key: 'day' },
        range: '7d',
      },
    })
    await vi.waitFor(() => {
      expect(into.querySelector('[data-member="list"] li')?.textContent).toContain('Atlas')
      expect(into.textContent).toContain('Requests by day')
    }, WAIT)
    // A dashboard's panel renders inside the dashboard, which draws it in its region.
    const panels = [...into.querySelectorAll('poly-dashboard-panel')]
    expect(panels).toHaveLength(2)
    for (const panel of panels) {
      expect(panel.matches(':state(poly-host)')).toBe(true)
      expect(panel.closest('[data-member="dashboard"]')).not.toBeNull()
    }
    // A list's item renders its own root, and its element leaves the document.
    expect(into.querySelector('poly-list-item')).toBeNull()
    expect(into.querySelectorAll('[data-member="list"] li')).toHaveLength(2)
  })
})

describe('a callback input is an action', () => {
  const form = doc(
    {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        {
          component: 'FormField',
          props: { label: 'Email' },
          children: [{ component: 'Input', props: { name: 'email' } }],
        },
        { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
      ],
    },
    [{ name: 'onSave', type: '() => void' }],
  )

  it('dispatches poly-action with the input’s name, the arguments and the named controls’ values', async () => {
    const { host: into, element, actions } = screen({ spec: form })
    // The field and the button, once both are laid out.
    const [input, save] = await vi.waitFor(() => {
      const field = into.querySelector('input')
      const button = buttonNamed(into, 'Save')
      if (field === null || button === undefined || button.getClientRects().length === 0) {
        throw new Error('not drawn yet')
      }
      return [field, button] as const
    }, WAIT)
    // One fill, rather than a key press per character, each a round trip to the browser.
    await userEvent.fill(input, 'ada@example.com')
    await vi.waitFor(() => expect(element.values).toEqual({ email: 'ada@example.com' }), WAIT)
    await userEvent.click(save)
    await vi.waitFor(() => expect(actions).toHaveLength(1), WAIT)
    expect(actions).toEqual([
      { name: 'onSave', args: [], values: { email: 'ada@example.com' }, changed: ['email'] },
    ])
  })

  it('keeps a ConfirmDialog busy and open until the promise a listener hands waitUntil settles', async () => {
    const {
      host: into,
      element,
      actions,
    } = screen({
      spec: doc(
        {
          component: 'ConfirmDialog',
          props: {
            open: true,
            title: 'Delete 3 tickets?',
            description: 'They go for good.',
            confirmLabel: 'Delete 3 tickets',
            onConfirm: { $: 'onDelete' },
          },
        },
        [{ name: 'onDelete', type: '() => void' }],
      ),
    })
    let finish: () => void = () => {}
    element.addEventListener(ACTION_EVENT, (event) => {
      ;(event as PolymorphEvent).waitUntil(new Promise<void>((settle) => (finish = settle)))
    })
    const panel = () => document.querySelector('[role="alertdialog"], [role="dialog"]')
    const confirm = () =>
      panel() === null ? undefined : buttonNamed(panel() as Element, 'Delete 3 tickets')
    await vi.waitFor(() => expect(confirm()).toBeDefined(), WAIT)
    expect(into.querySelector('poly-confirm-dialog')).not.toBeNull()
    await userEvent.click(confirm() as HTMLButtonElement)
    await vi.waitFor(() => expect(confirm()?.getAttribute('aria-busy')).toBe('true'), WAIT)
    expect(actions.map(({ name }) => name)).toEqual(['onDelete'])
    await userEvent.keyboard('{Escape}')
    await new Promise((settle) => setTimeout(settle, 50))
    expect(panel()).not.toBeNull()
    finish()
    await vi.waitFor(() => expect(panel()).toBeNull(), WAIT)
  })
})

describe('a control follows the reader', () => {
  const fields = doc(
    {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        {
          component: 'FormField',
          props: { label: 'Email' },
          children: [{ component: 'Input', props: { name: 'email', value: { $: 'email' } } }],
        },
        { component: 'Checkbox', props: { name: 'agree', label: 'I agree', checked: false } },
      ],
    },
    [{ name: 'email', type: 'string' }],
  )

  it('keeps what the reader chose until the host gives the control another value', async () => {
    const { host: into, drawing } = draw({ document: fields, data: { email: 'a@example.com' } })
    const input = await vi.waitFor(() => {
      const found = into.querySelector('input:not([type="checkbox"])') as HTMLInputElement | null
      if (found?.value !== 'a@example.com') throw new Error('not drawn yet')
      return found
    }, WAIT)
    await userEvent.tripleClick(input)
    await userEvent.keyboard('b@example.com')
    expect(input.value).toBe('b@example.com')
    await userEvent.click(into.querySelector('[role="checkbox"]') as HTMLElement)
    await vi.waitFor(
      () => expect(drawing.values).toEqual({ email: 'b@example.com', agree: true }),
      WAIT,
    )
    expect(into.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('true')
    // Other data keeps the choice; new data for this input replaces it.
    drawing.update({ data: { email: 'a@example.com', unrelated: 1 } })
    expect(input.value).toBe('b@example.com')
    drawing.update({ data: { email: 'c@example.com' } })
    await vi.waitFor(() => expect(input.value).toBe('c@example.com'), WAIT)
    expect(input.isConnected).toBe(true)
  })
})

describe('a drawing changes in place', () => {
  const card = doc(
    {
      component: 'Stack',
      props: { gap: 3 },
      children: [
        { component: 'Heading', children: [{ $: 'title' }] },
        { component: 'Stat', props: { label: 'Open', value: { $: 'open' } } },
        {
          component: 'FormField',
          props: { label: 'Note' },
          children: [{ component: 'Input', props: { name: 'note' } }],
        },
      ],
    },
    [
      { name: 'title', type: 'string' },
      { name: 'open', type: 'string' },
    ],
  )

  it('takes new data with no element made again, and a field keeps its text and focus', async () => {
    const { host: into, drawing } = draw({ document: card, data: { title: 'Orders', open: '3' } })
    const input = await vi.waitFor(() => {
      const found = into.querySelector('input')
      if (found === null || into.querySelector('h1, h2, h3')?.textContent !== 'Orders') {
        throw new Error('not drawn yet')
      }
      return found
    }, WAIT)
    await userEvent.click(input)
    await userEvent.keyboard('Call back')
    const before = [...into.querySelectorAll('*')]
    const { rendered, disposed } = await watching(async () => {
      drawing.update({ data: { title: 'Returns', open: '5' } })
      await vi.waitFor(() => {
        expect(into.querySelector('h1, h2, h3')?.textContent).toBe('Returns')
        expect(into.textContent).toContain('5')
      }, WAIT)
    })
    expect(disposed).toEqual([])
    expect(rendered.size).toBe(0)
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('Call back')
    expect(document.activeElement).toBe(input)
    expect(drawing.values).toEqual({ note: 'Call back' })
    // Every member's element is the one drawn first.
    const members = (nodes: Element[]) => nodes.filter((node) => node instanceof PolyElement)
    expect(members([...into.querySelectorAll('*')])).toEqual(members(before))
  })

  it('adds, moves and removes the rows of a table in place, and keeps the rows that stay', async () => {
    const row = (id: string, total: { $: string } | string) => ({
      component: 'Table.Row',
      children: [
        { component: 'Table.Cell', children: [id] },
        { component: 'Table.Cell', children: [total] },
      ],
    })
    const table = (rows: object[]) =>
      doc(
        {
          component: 'Table',
          props: { label: 'Orders' },
          children: [
            {
              component: 'Table.Head',
              children: [
                {
                  component: 'Table.Row',
                  children: [
                    { component: 'Table.Header', children: ['Order'] },
                    { component: 'Table.Header', children: ['Total'] },
                  ],
                },
              ],
            },
            { component: 'Table.Body', children: rows },
          ],
        },
        [{ name: 'total', type: 'string' }],
      )
    const { host: into, drawing } = draw({
      document: table([row('A-1', { $: 'total' }), row('A-2', '7')]),
      data: { total: '12' },
    })
    const bodyRows = () => [...into.querySelectorAll('tbody tr')]
    const texts = () => bodyRows().map((tr) => tr.textContent)
    await vi.waitFor(() => expect(texts()).toEqual(['A-112', 'A-27']), WAIT)
    const [first] = bodyRows()
    drawing.update({ data: { total: '13' } })
    await vi.waitFor(() => expect(texts()).toEqual(['A-113', 'A-27']), WAIT)
    expect(bodyRows()[0]).toBe(first)
    // A cell added to a row the table already drew, and a row added after it.
    drawing.update({
      document: table([row('A-1', { $: 'total' }), row('A-2', '7'), row('A-3', '9')]),
    })
    await vi.waitFor(() => expect(texts()).toEqual(['A-113', 'A-27', 'A-39']), WAIT)
    expect(bodyRows()[0]).toBe(first)
    // The second row's document says another thing: its cells change, the rows around it stay.
    const third = bodyRows()[2]
    drawing.update({
      document: table([row('A-1', { $: 'total' }), row('A-3', '9')]),
    })
    await vi.waitFor(() => expect(texts()).toEqual(['A-113', 'A-39']), WAIT)
    expect(bodyRows()[0]).toBe(first)
    expect(third?.isConnected).toBe(false)
  })
})

describe('a document that streams in', () => {
  /** A document's text, written as a model writes it: indented JSON. */
  const textOf = (document: unknown) => JSON.stringify(document, null, 2)

  it('draws each cut, makes no element twice, and leaves a field the reader typed in as it was', async () => {
    const data = {
      subject: '',
      requester: '',
      priority: 'normal',
      priorityOptions: [{ value: 'normal', label: 'Normal' }],
      assigneeOptions: [],
      notify: false,
    }
    // The members' code loads before the document streams, so each element renders as it arrives.
    const warm = draw({ document: newTicket, data })
    await vi.waitFor(() => expect(warm.host.querySelector('[role="switch"]')).not.toBeNull(), WAIT)
    const text = textOf(newTicket)
    // The host says more is to come while the answer arrives, and that nothing is once it has.
    const { host: into, element } = screen({ data, streaming: true })
    let input: HTMLInputElement | null = null
    const { rendered, disposed } = await watching(async () => {
      for (let end = 1; end <= text.length; end += 3) {
        element.text = text.slice(0, end)
        if (end % 90 === 1) await frame()
        // The subject's field, once its value and its placeholder have arrived.
        const found = into.querySelector<HTMLInputElement>('input[placeholder^="Webhook"]')
        if (input === null && found !== null && found.getClientRects().length > 0) {
          input = found
          await userEvent.click(found)
          await userEvent.keyboard('Hello')
        }
      }
      element.text = text
      element.streaming = false
      await vi.waitFor(() => expect(buttonNamed(into, 'Create ticket')).toBeDefined(), WAIT)
      await vi.waitFor(() => expect(into.querySelector('[role="switch"]')).not.toBeNull(), WAIT)
    })
    expect(input).not.toBeNull()
    const field = input as unknown as HTMLInputElement
    expect(field.isConnected).toBe(true)
    expect(field.value).toBe('Hello')
    expect(document.activeElement).toBe(field)
    expect(disposed).toEqual([])
    expect([...rendered.values()].filter((count) => count > 1)).toEqual([])
    expect(into.querySelector('h1, h2')?.textContent).toBe('New ticket')
  })

  for (const [name, document, data] of [
    ['a form page with fields', bookRoom, { rooms: [], lengths: [], errors: [] }],
    [
      'a detail page with a timeline and a dialog',
      orderDetail,
      {
        order: { number: 'A-1', status: 'Open', total: '$12' },
        facts: [],
        history: [],
        confirming: false,
      },
    ],
    [
      'a dashboard with panels and a list',
      usageOverview,
      {
        stats: [],
        requests: [],
        requestSeries: [],
        requestAxis: { key: 'day' },
        range: '7d',
      },
    ],
    ['a form page with tabs', workspaceSettings, { tab: 'general' }],
  ] as const) {
    it(`draws ${name} cut by cut, as the whole document draws it`, async () => {
      const text = textOf(document)
      const { host: into, drawing } = draw({ streaming: true, data })
      const { rendered, disposed } = await watching(async () => {
        for (let end = 1; end <= text.length; end += 5) {
          const read = parsePartial(text.slice(0, end))
          drawing.update({
            document: read.document,
            open: read.open,
            cut: read.cut,
            streaming: !read.complete,
          })
          if (end % 200 === 1) await frame()
        }
        drawing.update({ document, open: null, cut: null, streaming: false })
      })
      expect(disposed).toEqual([])
      expect([...rendered.values()].filter((count) => count > 1)).toEqual([])
      const whole = draw({ document, data })
      await vi.waitFor(() => {
        expect(into.textContent?.length).toBeGreaterThan(0)
        expect(into.textContent).toBe(whole.host.textContent)
      }, WAIT)
      expect(drawing.faults).toEqual(whole.drawing.faults)
    })
  }
})

describe('what cannot be drawn', () => {
  const mixed = doc({
    component: 'Stack',
    children: [
      { component: 'Buton', props: { label: 'Save' } },
      { component: 'Button', props: { label: 'Send' } },
      { component: 'Text', children: ['Still here'] },
      { component: 'Link', props: { href: 'javascript:alert(1)' }, children: ['Run'] },
    ],
  })

  it('draws nothing for an unknown or disallowed member, and dispatches poly-fault for each', async () => {
    const { host: into, faults } = screen({ spec: mixed, members: ['Stack', 'Text', 'Link'] })
    await vi.waitFor(() => expect(into.textContent).toContain('Still here'), WAIT)
    expect(into.querySelector('poly-button')).toBeNull()
    expect(buttonNamed(into, 'Send')).toBeUndefined()
    expect(faults.map(({ path }) => path)).toEqual([
      '$.root.children[0]',
      '$.root.children[1]',
      '$.root.children[3].props.href',
    ])
    expect(faults[0]).toMatchObject({ component: 'Buton', message: 'no component called `Buton`' })
    expect(faults[1]?.message).toContain('is not one of the members this host draws')
  })

  it('sets no address a screen may not hold', async () => {
    const { host: into } = screen({ spec: mixed })
    await vi.waitFor(() => expect(into.textContent).toContain('Run'), WAIT)
    const link = into.querySelector('poly-link') as unknown as { href?: string }
    expect(link.href).toBeUndefined()
    expect(into.querySelector('a[href^="javascript"]')).toBeNull()
  })

  it('draws a fault in its place when the host asks', async () => {
    const { host: into } = screen({ spec: mixed, faults: 'inline' })
    await vi.waitFor(
      () => expect(into.querySelector('[role="alert"], [data-member="alert"]')).not.toBeNull(),
      WAIT,
    )
    expect(into.textContent).toContain('no component called `Buton`')
  })
})

describe('<poly-screen>', () => {
  const hello = doc({ component: 'Heading', children: ['Hello'] })

  it('draws the JSON in its script child, and follows a change to it', async () => {
    const into = host()
    const element = document.createElement('poly-screen')
    const script = document.createElement('script')
    script.type = 'application/json'
    script.text = JSON.stringify(hello)
    element.append(script)
    into.append(element)
    await vi.waitFor(() => expect(into.querySelector('h1, h2')?.textContent).toBe('Hello'), WAIT)
    expect(getComputedStyle(element).display).toBe('contents')
    script.text = JSON.stringify(doc({ component: 'Heading', children: ['Again'] }))
    await vi.waitFor(() => expect(into.querySelector('h1, h2')?.textContent).toBe('Again'), WAIT)
  })

  it('draws a document set before the element is defined', async () => {
    const into = host()
    const element = document.createElement('poly-screen-before') as HTMLElement & { spec?: unknown }
    element.spec = hello
    into.append(element)
    customElements.define('poly-screen-before', class extends PolyScreen {})
    await vi.waitFor(() => expect(into.querySelector('h1, h2')?.textContent).toBe('Hello'), WAIT)
    expect((element as PolyScreen).spec).toBe(hello)
  })

  it('takes its drawing out when it leaves the page, and draws again when it comes back', async () => {
    const { host: into, element } = screen({ spec: hello })
    await vi.waitFor(() => expect(into.querySelector('h1, h2')?.textContent).toBe('Hello'), WAIT)
    const { disposed } = await watching(async () => {
      element.remove()
      await new Promise((settle) => setTimeout(settle, 0))
    })
    expect(disposed).toContain('poly-heading')
    expect(element.querySelector('poly-heading')).toBeNull()
    expect(element.matches(':state(poly-host)')).toBe(false)
    into.append(element)
    await vi.waitFor(() => expect(into.querySelector('h1, h2')?.textContent).toBe('Hello'), WAIT)
  })

  it('checks the document it draws, with its members', async () => {
    const { element } = screen({
      spec: doc({
        component: 'Stack',
        children: [{ component: 'Button', props: { label: 'Go' } }],
      }),
      members: ['Stack'],
    })
    const result = await element.check()
    expect(result.ok).toBe(false)
    expect(result.faults.map(({ path }) => path)).toEqual(['$.root.children[0]'])
  })
})
