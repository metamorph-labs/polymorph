import { cleanup, render, within } from '@testing-library/react'
import { lazy, useLayoutEffect, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import inbox from '../../../../design/screens/inbox.json'
import newTicket from '../../../../design/screens/new-ticket.json'
import settings from '../../../../design/screens/settings.json'
import attemptOne from '../../../../design/screens/agent-loop/attempt-1.json'
import attemptTwo from '../../../../design/screens/agent-loop/attempt-2.json'
import bookRoom from '../../../screen/fixtures/book-room.json'
import orderDetail from '../../../screen/fixtures/order-detail.json'
import revenueStats from '../../../screen/fixtures/revenue-stats.json'
import ticketQueue from '../../../screen/fixtures/ticket-queue.json'
import usageOverview from '../../../screen/fixtures/usage-overview.json'
import workspaceSettings from '../../../screen/fixtures/workspace-settings.json'
// The vocabulary by path: the foundation does not depend on it, and its tests draw with it.
import * as vocabulary from '../../../react-ui/src/index'

import {
  componentFor,
  parsePartial,
  ScreenDrawing,
  ScreenView,
  useScreen,
  type Screen,
  type ScreenAction,
  type ScreenFault,
  type ScreenMembers,
  type ScreenNode,
  type ScreenSource,
} from './index'

/**
 * The React renderer of a run-time screen, in a real browser, with the real
 * vocabulary. The walk's own rules (what a document may do) are pinned by
 * `packages/screen/src/walk.test.ts`; these tests pin what React adds: the
 * members drawn, an element kept while the document grows, a reader's input
 * reaching the host, and a node that cannot be drawn kept to itself.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const members: ScreenMembers = vocabulary

const doc = (root: object, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen the renderer draws.',
  inputs,
  root,
})

/** Faults and actions a drawing told its host. */
function host() {
  const faults: ScreenFault[] = []
  const actions: ScreenAction[] = []
  return {
    faults,
    actions,
    onFault: (fault: ScreenFault) => faults.push(fault),
    onAction: (action: ScreenAction) => {
      actions.push(action)
    },
  }
}

/** The control a FormField labels, found through its label as a reader finds it. */
function labelled(container: HTMLElement, text: string): HTMLInputElement {
  // A required field's label ends with a mark the field hides from a screen reader.
  const label = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.replace(/\s*\*$/, '').trim() === text,
  )
  const control = label?.htmlFor ? document.getElementById(label.htmlFor) : null
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    throw new Error(`no field is labelled “${text}”`)
  }
  return control as HTMLInputElement
}

/** Each path's mounts, counted by a `decorate` that draws nothing of its own. */
const mounts = new Map<string, number>()

function Mounted({ path, children }: { path: string; children: ReactNode }) {
  useLayoutEffect(() => {
    mounts.set(path, (mounts.get(path) ?? 0) + 1)
  }, [path])
  return children
}

const counted = (drawn: ReactNode, node: ScreenNode) => <Mounted path={node.path}>{drawn}</Mounted>

describe('a document is drawn with the host’s members', () => {
  /**
   * Every lawful screen spec in `design/screens/` and every screen the core's
   * card was checked with, drawn as a picture is: each input with no data
   * sampled from its type. A chart's axis is a domain object, which samples as
   * nothing, so the host gives that one.
   */
  const LAWFUL: [file: string, spec: unknown, data?: Record<string, unknown>][] = [
    ['inbox.json', inbox],
    ['new-ticket.json', newTicket],
    ['settings.json', settings],
    ['agent-loop/attempt-2.json', attemptTwo],
    ['fixtures/book-room.json', bookRoom],
    ['fixtures/order-detail.json', orderDetail],
    ['fixtures/revenue-stats.json', revenueStats],
    ['fixtures/ticket-queue.json', ticketQueue],
    [
      'fixtures/usage-overview.json',
      usageOverview,
      {
        requests: [{ day: 'Mon', count: 120 }],
        requestSeries: [{ key: 'count', label: 'Requests' }],
        requestAxis: { key: 'day' },
      },
    ],
    ['fixtures/workspace-settings.json', workspaceSettings],
  ]

  for (const [file, spec, data] of LAWFUL) {
    it(`draws ${file} with no fault`, () => {
      const told = host()
      const { container } = render(
        <ScreenView
          document={spec}
          data={data}
          members={members}
          fill="sample"
          onFault={told.onFault}
        />,
      )
      expect(told.faults).toEqual([])
      const root = (spec as { root: { component: string } }).root.component
      expect(container.querySelector(`[data-member]`), `${file} drew nothing`).not.toBeNull()
      expect(container.textContent).not.toContain('[object Object]')
      expect(root).not.toBe('')
    })
  }

  it('draws an unlawful attempt as far as it can, and tells the host each fault', () => {
    // The agent loop's first attempt: a prop no member takes, a missing required prop and a
    // component the vocabulary does not have.
    const told = host()
    const { container } = render(
      <ScreenView document={attemptOne} members={members} fill="sample" onFault={told.onFault} />,
    )
    expect(told.faults.map(({ message }) => message)).toEqual([
      '`ListPage` has no prop `className`',
      '`DataTable` is missing its required prop `emptyState`',
      'no component called `Modal`',
    ])
    expect(container.querySelector('[data-member="list-page"]')).not.toBeNull()
  })

  it('draws the host’s data where the document binds it', () => {
    const { container } = render(
      <ScreenView
        document={doc(
          {
            component: 'Stack',
            children: [
              { component: 'Heading', children: [{ $: 'title' }] },
              { component: 'Badge', props: { tone: 'success' }, children: ['Paid'] },
            ],
          },
          [{ name: 'title', type: 'string' }],
        )}
        members={members}
        data={{ title: 'Order 1042' }}
      />,
    )
    expect(container.querySelector('h2, h1, h3')?.textContent).toBe('Order 1042')
    expect(container.querySelector('[data-member="badge"]')?.textContent).toBe('Paid')
  })

  it('gives a FormField’s control the field’s id and label, as JSX would', () => {
    const { container } = render(
      <ScreenView
        document={doc({
          component: 'Stack',
          children: [
            {
              component: 'FormField',
              props: { label: 'Email', description: 'Where the receipt goes.' },
              children: [{ component: 'Input', props: { name: 'email' } }],
            },
            {
              component: 'FormField',
              props: { label: 'Send me the news' },
              children: [{ component: 'Switch', props: { name: 'news' } }],
            },
          ],
        })}
        members={members}
      />,
    )
    const email = labelled(container, 'Email')
    expect(email.name).toBe('email')
    expect(email.getAttribute('aria-describedby')).not.toBeNull()
    // A Switch labels itself in its own row: the field hands it the label (`controlKind`).
    expect(within(container).getByRole('switch', { name: 'Send me the news' })).toBeTruthy()
  })
})

describe('what the person does reaches the host', () => {
  const form = doc(
    {
      component: 'Stack',
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

  it('tells the host a press as `{ name, args, values }`, with the text typed in a named field', async () => {
    const told = host()
    const { container } = render(
      <ScreenView document={form} members={members} onAction={told.onAction} />,
    )
    await userEvent.fill(labelled(container, 'Email'), 'ada@example.com')
    await userEvent.click(within(container).getByRole('button', { name: 'Save' }))
    expect(told.actions).toEqual([
      { name: 'onSave', args: [], values: { email: 'ada@example.com' } },
    ])
  })

  it('keeps a reader’s choice over the value the document gave, until the document gives another', async () => {
    const field = (value: string) =>
      doc({
        component: 'FormField',
        props: { label: 'Query' },
        children: [{ component: 'Input', props: { name: 'q', value } }],
      })
    const { container, rerender } = render(
      <ScreenView document={field('start')} members={members} />,
    )
    const input = labelled(container, 'Query')
    expect(input.value).toBe('start')
    await userEvent.fill(input, 'chosen')
    expect(input.value).toBe('chosen')
    // The same document again, as a new object, changes nothing the reader chose.
    rerender(<ScreenView document={field('start')} members={members} />)
    expect(input.value).toBe('chosen')
    rerender(<ScreenView document={field('given')} members={members} />)
    expect(labelled(container, 'Query')).toBe(input)
    expect(input.value).toBe('given')
  })

  it('keeps a reader’s choice over the host’s value until the host gives another, and keeps the field', async () => {
    const field = doc(
      {
        component: 'FormField',
        props: { label: 'Email' },
        children: [{ component: 'Input', props: { name: 'email', value: { $: 'email' } } }],
      },
      [{ name: 'email', type: 'string' }],
    )
    const { container, rerender } = render(
      <ScreenView document={field} members={members} data={{ email: 'one@example.com' }} />,
    )
    const input = labelled(container, 'Email')
    await userEvent.fill(input, 'mine@example.com')
    rerender(<ScreenView document={field} members={members} data={{ email: 'one@example.com' }} />)
    expect(input.value).toBe('mine@example.com')
    rerender(<ScreenView document={field} members={members} data={{ email: 'two@example.com' }} />)
    expect(input.value).toBe('two@example.com')
    expect(labelled(container, 'Email')).toBe(input)
  })

  it('knows what the reader typed in a field the document gave no value', async () => {
    const seen: { current: Screen | null } = { current: null }
    function Probe(props: ScreenSource) {
      const screen = useScreen(props)
      useLayoutEffect(() => {
        seen.current = screen
      })
      return <ScreenDrawing screen={screen} members={members} />
    }
    const { container } = render(
      <Probe
        document={doc({
          component: 'FormField',
          props: { label: 'Note' },
          children: [{ component: 'Textarea', props: { name: 'note' } }],
        })}
      />,
    )
    const note = labelled(container, 'Note')
    await userEvent.fill(note, 'Leave it at the door')
    expect(note.value).toBe('Leave it at the door')
    expect(seen.current?.values).toEqual({ note: 'Leave it at the door' })
  })

  it('makes a ConfirmDialog wait on the promise the host’s handler returns', async () => {
    let finish = () => {}
    const saving = new Promise<void>((resolve) => {
      finish = resolve
    })
    const told: ScreenAction[] = []
    render(
      <ScreenView
        document={doc(
          {
            component: 'ConfirmDialog',
            props: {
              open: true,
              title: 'Delete the export?',
              description: 'The file goes, and its link stops working.',
              confirmLabel: 'Delete',
              onConfirm: { $: 'onDelete' },
            },
          },
          [{ name: 'onDelete', type: '() => Promise<void>' }],
        )}
        members={members}
        onAction={(action) => {
          told.push(action)
          return saving
        }}
      />,
    )
    const dialog = await vi.waitFor(() => within(document.body).getByRole('alertdialog'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(told).toEqual([{ name: 'onDelete', args: [], values: {} }])
    // While the host saves, the dialog stays, its confirm busy and its cancel disabled.
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete' }).getAttribute('aria-busy')).toBe(
        'true',
      ),
    )
    expect(
      (within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    finish()
    await vi.waitFor(() => expect(within(document.body).queryByRole('alertdialog')).toBeNull())
  })
})

describe('an element stays mounted while what it draws from changes', () => {
  it('keeps every element when the host replaces its data', () => {
    mounts.clear()
    const page = doc(
      {
        component: 'Stack',
        children: [
          { component: 'Heading', children: [{ $: 'title' }] },
          {
            component: 'FormField',
            props: { label: 'Reply' },
            children: [{ component: 'Textarea', props: { name: 'reply' } }],
          },
        ],
      },
      [{ name: 'title', type: 'string' }],
    )
    const { container, rerender } = render(
      <ScreenView document={page} members={members} data={{ title: 'One' }} decorate={counted} />,
    )
    const heading = container.querySelector('[data-member="heading"]')
    const reply = labelled(container, 'Reply')
    rerender(
      <ScreenView document={page} members={members} data={{ title: 'Two' }} decorate={counted} />,
    )
    expect(container.querySelector('[data-member="heading"]')).toBe(heading)
    expect(heading?.textContent).toBe('Two')
    expect(labelled(container, 'Reply')).toBe(reply)
    expect([...mounts.values()].every((count) => count === 1)).toBe(true)
    expect(mounts.size).toBe(4)
  })

  /**
   * Feeds a document's text one character at a time, as a model writes it,
   * and holds every element to one mount: none is drawn twice, so none loses
   * its state. Returns the drawing at the end.
   */
  async function stream(
    spec: unknown,
    during?: (container: HTMLElement, length: number) => Promise<void> | void,
  ) {
    // The elements the whole document draws, drawn at once.
    mounts.clear()
    render(<ScreenView document={spec} members={members} fill="sample" decorate={counted} />)
    const whole = [...mounts.keys()].sort()
    cleanup()
    mounts.clear()
    const text = JSON.stringify(spec)
    const told = host()
    const view = (length: number) => (
      <ScreenView
        text={text.slice(0, length)}
        members={members}
        fill="sample"
        decorate={counted}
        onFault={told.onFault}
      />
    )
    // A member that throws is logged by React with the error. None should: a node waits for the
    // props it requires before it is drawn.
    const logged = vi.spyOn(console, 'error')
    const { container, rerender } = render(view(0))
    try {
      for (let length = 1; length <= text.length; length += 1) {
        rerender(view(length))
        await during?.(container, length)
      }
    } finally {
      logged.mockRestore()
    }
    const thrown = logged.mock.calls.filter((call) => call.some((arg) => arg instanceof Error))
    expect(thrown.map((call) => String(call.find((arg) => arg instanceof Error)))).toEqual([])
    const remounted = [...mounts].filter(([, count]) => count !== 1)
    expect(remounted, 'drawn more than once while the document streamed').toEqual([])
    // The stream ends with what the whole document draws.
    expect([...mounts.keys()].sort()).toEqual(whole)
    expect(whole.length).toBeGreaterThan(3)
    // Nothing that had not arrived was a fault, and the whole document has none.
    expect(told.faults).toEqual([])
    return { container, text }
  }

  it('draws a screen spec as it streams in, and mounts each element once', async () => {
    await stream(inbox)
  }, 120_000)

  it('draws a model’s screen as it streams in, and mounts each element once', async () => {
    for (const spec of [bookRoom, orderDetail, workspaceSettings]) await stream(spec)
  }, 120_000)

  it('keeps the text and the focus of a field the reader typed in while more of the document arrives', async () => {
    const typed = 'Retries stop after a 502'
    let field: HTMLInputElement | null = null
    // The subject field is whole once the Grid after it starts.
    const at = JSON.stringify(newTicket).indexOf('"Grid"')
    const { container, text } = await stream(newTicket, async (drawn, length) => {
      if (length !== at) return
      field = labelled(drawn, 'Subject')
      await userEvent.fill(field, typed)
      expect(document.activeElement).toBe(field)
    })
    expect(at).toBeLessThan(text.length - 1000)
    expect(labelled(container, 'Subject')).toBe(field)
    expect((field as HTMLInputElement | null)?.value).toBe(typed)
    expect(document.activeElement).toBe(field)
  }, 120_000)

  it('reads a document out of a model’s answer, prose and fence included', () => {
    const answer = `Here is the screen.\n\n\`\`\`json\n${JSON.stringify(
      doc({ component: 'Text', children: ['From the answer'] }),
    )}\n\`\`\`\n`
    expect(parsePartial(answer).complete).toBe(true)
    const { container } = render(<ScreenView text={answer} members={members} />)
    expect(container.textContent).toBe('From the answer')
  })

  it('tells the host when the answer stops being JSON', () => {
    const told = host()
    render(
      <ScreenView
        text={'{"spec": "polymorph-screen/1", ]'}
        members={members}
        onFault={told.onFault}
      />,
    )
    expect(told.faults).toHaveLength(1)
    expect(told.faults[0]?.path).toBe('$')
    expect(told.faults[0]?.message).toMatch(/^the answer stops being JSON at character \d+/)
  })
})

describe('what cannot be drawn is drawn as nothing, and told', () => {
  const mixed = doc({
    component: 'Stack',
    children: [
      { component: 'Buton', props: { label: 'Save' } },
      { component: 'ThirdParty', props: { library: 'leaflet', reason: 'a map' } },
      { component: 'Text', children: ['Still here'] },
    ],
  })

  it('draws nothing for an unknown or a disallowed component, and tells the host of each', () => {
    const told = host()
    const { container } = render(
      <ScreenView document={mixed} members={members} onFault={told.onFault} />,
    )
    expect(container.textContent).toBe('Still here')
    expect(told.faults.map(({ path }) => path)).toEqual([
      '$.root.children[0]',
      '$.root.children[1]',
    ])
    expect(told.faults[0]?.message).toBe('no component called `Buton`')
  })

  it('draws only the members the host allows', () => {
    const told = host()
    const { container } = render(
      <ScreenView
        document={doc({
          component: 'Stack',
          children: [
            { component: 'Text', children: ['Allowed'] },
            { component: 'Button', props: { label: 'Not allowed' } },
          ],
        })}
        members={members}
        allow={['Stack', 'Text']}
        onFault={told.onFault}
      />,
    )
    expect(container.textContent).toBe('Allowed')
    expect(told.faults.map(({ path }) => path)).toEqual(['$.root.children[1]'])
  })

  it('shows each fault in place when the host asks, with a drawing of its own', () => {
    const { container } = render(
      <ScreenView
        document={mixed}
        members={members}
        faults="inline"
        renderFault={(fault, cause) => <em>{`${cause}: ${fault.message}`}</em>}
      />,
    )
    const shown = [...container.querySelectorAll('em')].map((node) => node.textContent)
    expect(shown).toHaveLength(2)
    expect(shown[0]).toBe('unknown: no component called `Buton`')
    expect(shown[1]).toMatch(/^refused: `ThirdParty` hosts another library’s code/)
    expect(container.textContent).toContain('Still here')
  })

  it('tells the host of a member its components lack, and draws the rest', () => {
    const told = host()
    const { container } = render(
      <ScreenView
        document={doc({
          component: 'Stack',
          children: [
            { component: 'Badge', children: ['Lost'] },
            { component: 'Text', children: ['Kept'] },
          ],
        })}
        members={{ Stack: vocabulary.Stack, Text: vocabulary.Text }}
        onFault={told.onFault}
      />,
    )
    expect(container.textContent).toBe('Kept')
    expect(told.faults).toEqual([
      {
        path: '$.root.children[0]',
        component: 'Badge',
        message: '`Badge` has no component among the members this screen is drawn with',
      },
    ])
  })

  it('keeps a member that throws to its own node, and tries again when the node changes', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Fragile(props: { children?: string }) {
      if (props.children === 'bad') throw new Error('Badge broke')
      return <vocabulary.Badge>{props.children}</vocabulary.Badge>
    }
    const page = (badge: string) =>
      doc({
        component: 'Stack',
        children: [
          { component: 'Badge', children: [badge] },
          { component: 'Text', children: ['Still here'] },
        ],
      })
    const drawWith = { ...members, Badge: Fragile }
    const told = host()
    const { container, rerender } = render(
      <ScreenView document={page('bad')} members={drawWith} onFault={told.onFault} />,
    )
    expect(container.textContent).toBe('Still here')
    expect(told.faults).toEqual([
      { path: '$.root.children[0]', component: 'Badge', message: 'Badge broke' },
    ])
    rerender(<ScreenView document={page('good')} members={drawWith} onFault={told.onFault} />)
    expect(container.textContent).toBe('goodStill here')
    errors.mockRestore()
  })

  it('reports no throw while the document streams, and tries the node again once it is whole', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const attempt = vi.fn()
    function Fragile(props: { tone?: string; children?: string }) {
      attempt()
      if (props.tone === undefined) throw new Error('Badge needs a tone')
      return <vocabulary.Badge tone="neutral">{props.children}</vocabulary.Badge>
    }
    const page = doc({ component: 'Badge', children: ['Half'] })
    const drawWith = { ...members, Badge: Fragile }
    const told = host()
    const { rerender } = render(
      <ScreenView document={page} streaming members={drawWith} onFault={told.onFault} />,
    )
    expect(told.faults).toEqual([])
    const before = attempt.mock.calls.length
    rerender(
      <ScreenView document={page} streaming={false} members={drawWith} onFault={told.onFault} />,
    )
    expect(attempt.mock.calls.length).toBeGreaterThan(before)
    expect(told.faults).toEqual([
      { path: '$.root', component: 'Badge', message: 'Badge needs a tone' },
    ])
    errors.mockRestore()
  })

  it('passes no address a screen may not hold', () => {
    const told = host()
    const { container } = render(
      <ScreenView
        document={doc({
          component: 'Stack',
          children: [
            { component: 'Link', props: { href: 'javascript:alert(1)' }, children: ['Run'] },
            { component: 'Link', props: { href: '/orders/1042' }, children: ['Open'] },
          ],
        })}
        members={members}
        onFault={told.onFault}
      />,
    )
    const [refused, kept] = container.querySelectorAll('a')
    expect(refused?.textContent).toBe('Run')
    expect(refused?.hasAttribute('href')).toBe(false)
    expect(kept?.getAttribute('href')).toBe('/orders/1042')
    expect(told.faults.map(({ path }) => path)).toEqual(['$.root.children[0].props.href'])
    expect(container.innerHTML).not.toContain('javascript:')
  })
})

describe('the host’s members', () => {
  it('reads a part from its member, or from a key of its own', () => {
    expect(componentFor(members, 'Table.Row')).toBe(vocabulary.Table.Row)
    expect(componentFor({ 'Table.Row': vocabulary.Stack }, 'Table.Row')).toBe(vocabulary.Stack)
    expect(componentFor(members, 'Table.Ghost')).toBeNull()
    expect(componentFor(members, 'Table.Row.Cell')).toBeNull()
    // A name the members inherit is none of theirs.
    expect(componentFor(members, 'constructor')).toBeNull()
    expect(componentFor({ Toast: { title: 'not a component' } }, 'Toast')).toBeNull()
  })

  it('draws a lazy member when it has loaded, and everything beside it at once', async () => {
    let load = () => {}
    const loaded = new Promise<void>((resolve) => {
      load = resolve
    })
    const Card = lazy(async () => {
      await loaded
      return { default: vocabulary.Card }
    })
    const { container } = render(
      <ScreenView
        document={doc({
          component: 'Stack',
          children: [
            { component: 'Card', children: [{ component: 'Text', children: ['Inside'] }] },
            { component: 'Text', children: ['Beside'] },
          ],
        })}
        members={{ ...members, Card }}
      />,
    )
    expect(container.textContent).toBe('Beside')
    load()
    await vi.waitFor(() => expect(container.textContent).toBe('InsideBeside'))
  })
})

describe('a server renders the screen', () => {
  it('writes the markup the client draws, with no handler run', () => {
    const told = host()
    const html = renderToString(
      <ScreenView
        document={doc({
          component: 'Stack',
          children: [{ component: 'Buton' }, { component: 'Text', children: ['Served'] }],
        })}
        members={members}
        onFault={told.onFault}
      />,
    )
    expect(html).toContain('Served')
    // A server runs no effect, so the host is told nothing there; the client tells it.
    expect(told.faults).toEqual([])
  })
})
