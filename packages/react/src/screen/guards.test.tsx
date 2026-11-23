import { cleanup, render, within } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

// The vocabulary by path: the foundation does not depend on it, and its tests draw with it.
import * as vocabulary from '../../../react-ui/src/index'

import { ScreenView, type ScreenAction, type ScreenFault, type ScreenMembers } from './index'

/**
 * What a document cannot do to the page that draws it, with the real
 * vocabulary in a real browser: reach an address a screen may not hold, in
 * any shape a document or the host's data can give it; take the page down by
 * nesting deep; tell the host of one fault again and again while it streams;
 * or tell the host of an action no one took. The walk's rules are pinned in `packages/screen/src/hostile.test.ts`
 * and `walk.test.ts`; these tests hold what React draws from them.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const members: ScreenMembers = vocabulary

const doc = (root: object, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen that tries what it may not do.',
  inputs,
  root,
})

/** Faults a drawing told its host, in the order it told them. */
function faults() {
  const told: ScreenFault[] = []
  return { told, onFault: (fault: ScreenFault) => told.push(fault) }
}

/** The address a script would run from, if one were followed. */
const HOSTILE = 'javascript:window.__screenRan=true'

declare global {
  interface Window {
    __screenRan?: boolean
  }
}

/** Every address in the page, the menus a member opens in a portal among them. */
const addresses = () =>
  [...document.querySelectorAll('[href], [src]')].map(
    (node) => node.getAttribute('href') ?? node.getAttribute('src') ?? '',
  )

describe('an address a screen may not hold is never drawn or followed', () => {
  it('passes no address written as a list of lists, from the document or from the host', async () => {
    const told = faults()
    const { container } = render(
      <ScreenView
        document={doc(
          {
            component: 'Stack',
            children: [
              { component: 'Link', props: { href: [[HOSTILE]] }, children: ['Nested'] },
              { component: 'Link', props: { href: { $: 'site' } }, children: ['Given'] },
              { component: 'Link', props: { href: { $: 'deep' } }, children: ['Given deep'] },
            ],
          },
          [
            { name: 'site', type: 'string' },
            { name: 'deep', type: 'string' },
          ],
        )}
        data={{ site: HOSTILE, deep: [[HOSTILE]] }}
        members={members}
        onFault={told.onFault}
      />,
    )
    const links = container.querySelectorAll('a')
    expect([...links].map((link) => link.textContent)).toEqual(['Nested', 'Given', 'Given deep'])
    expect([...links].map((link) => link.hasAttribute('href'))).toEqual([false, false, false])
    for (const link of links) await userEvent.click(link)
    expect(window.__screenRan).toBeUndefined()
    expect(addresses().filter((address) => /javascript:/i.test(address))).toEqual([])
    // A list's fault is at the item that is not text.
    expect(told.told.map(({ path }) => path)).toEqual([
      '$.root.children[0].props.href[0]',
      '$.root.children[1].props.href',
      '$.root.children[2].props.href[0]',
    ])
  })

  /** A trail whose second crumb is collapsed into the overflow menu (`maxItems`). */
  const trail = (second: unknown) =>
    doc({
      component: 'Breadcrumbs',
      props: {
        maxItems: 3,
        items: [
          { $object: { label: 'Home', href: '#home' } },
          second,
          { $object: { label: 'Section' } },
          { $object: { label: 'Page', href: '#page' } },
          { $object: { label: 'Here' } },
        ],
      },
    })

  /**
   * The hidden crumb in each shape. A plain object is no structured object, so
   * the walk drops the crumb; a structured object keeps its label and loses
   * the address. Unguarded, choosing the crumb runs the script: the menu
   * navigates with `window.location.assign`, which React's own guard on `href`
   * does not cover.
   */
  const SECONDS: [shape: string, crumb: unknown, drawn: boolean][] = [
    ['as a plain object', { label: 'Hidden', href: HOSTILE }, false],
    [
      'as a structured object with a list of lists',
      { $object: { label: 'Hidden', href: [[HOSTILE]] } },
      true,
    ],
    ['as a structured object', { $object: { label: 'Hidden', href: HOSTILE } }, true],
  ]

  for (const [shape, crumb, drawn] of SECONDS) {
    it(`follows no address in a crumb of the overflow menu written ${shape}`, async () => {
      const told = faults()
      const at = window.location.href
      const { container } = render(
        <ScreenView document={trail(crumb)} members={members} onFault={told.onFault} />,
      )
      await userEvent.click(within(container).getByRole('button'))
      const menu = await vi.waitFor(() => within(document.body).getByRole('menu'))
      const items = within(menu).getAllByRole('menuitem')
      expect(addresses().filter((address) => /javascript:/i.test(address))).toEqual([])
      const hidden = items.find((item) => item.textContent?.includes('Hidden'))
      expect(hidden !== undefined).toBe(drawn)
      // Choose the hidden crumb where it is drawn, and the crumb in its place where it is not.
      await userEvent.click(hidden ?? (items[0] as HTMLElement))
      expect(window.__screenRan).toBeUndefined()
      expect(window.location.href).toBe(at)
      expect(told.told.length).toBe(1)
    })
  }
})

/** A value nested `depth` lists deep, built without recursion. */
function nested(depth: number): unknown {
  let value: unknown = []
  for (let level = 1; level < depth; level += 1) value = [value]
  return value
}

describe('a document of any depth', () => {
  const DEEP = 5000

  it('draws text nested thousands of levels deep without throwing, and tells the host once', () => {
    const told = faults()
    const text =
      '{"spec":"polymorph-screen/1","name":"Deep","purpose":"Deep.","inputs":[],' +
      `"root":{"component":"Stack","children":[{"component":"Text","children":["Shallow"]},${'['.repeat(DEEP)}${']'.repeat(DEEP)}]}}`
    // No boundary above the screen: a throw would fail the render itself.
    const { container, rerender } = render(
      <ScreenView text={text} members={members} onFault={told.onFault} />,
    )
    expect(told.told.length).toBeGreaterThan(0)
    const first = [...told.told]
    rerender(<ScreenView text={text} members={members} onFault={told.onFault} />)
    expect(told.told).toEqual(first)
    expect(new Set(first.map(({ path, message }) => `${path} ${message}`)).size).toBe(first.length)
    expect(container.textContent).not.toContain('[object Object]')
  })

  it('draws a document nested thousands of levels deep without throwing, and tells the host once', () => {
    const told = faults()
    const page = doc({
      component: 'Stack',
      children: [{ component: 'Text', children: ['Shallow'] }, nested(DEEP)],
    })
    const { container, rerender } = render(
      <ScreenView document={page} members={members} onFault={told.onFault} />,
    )
    expect(container.textContent).toContain('Shallow')
    expect(told.told.length).toBeGreaterThan(0)
    const first = [...told.told]
    rerender(<ScreenView document={page} members={members} onFault={told.onFault} />)
    expect(told.told).toEqual(first)
    expect(new Set(first.map(({ path, message }) => `${path} ${message}`)).size).toBe(first.length)
  })
})

describe('a fault is told once while a document streams', () => {
  it('tells the host once of an unknown component, a missing one and a field the host lacks', () => {
    const told = faults()
    const text = JSON.stringify(
      doc({
        component: 'Stack',
        children: [
          { component: 'Buton', props: { label: 'Save' } },
          { component: 'Badge', children: ['Lost'] },
          { component: 'Text', children: ['Kept'] },
        ],
      }),
    )
    // The host's members lack Badge, which the vocabulary has.
    const drawWith = { Stack: vocabulary.Stack, Text: vocabulary.Text }
    const view = (length: number) => (
      <ScreenView text={text.slice(0, length)} members={drawWith} onFault={told.onFault} />
    )
    const { container, rerender } = render(view(0))
    for (let length = 1; length <= text.length; length += 1) rerender(view(length))
    expect(container.textContent).toBe('Kept')
    const counts = new Map<string, number>()
    for (const { path, message } of told.told) {
      counts.set(`${path} ${message}`, (counts.get(`${path} ${message}`) ?? 0) + 1)
    }
    expect([...counts]).toEqual([
      ['$.root.children[0] no component called `Buton`', 1],
      [
        '$.root.children[1] `Badge` has no component among the members this screen is drawn with',
        1,
      ],
    ])
  })
})

/**
 * A document drawn as a model writes it, then whole, then with the host's data
 * replaced: the three times a member calls what it was handed while no one
 * acts. Each prefix of its text is drawn, the last with the stream ended.
 */
function drawThrough(
  spec: object,
  data: Record<string, unknown>,
  later: Record<string, unknown>,
  onAction: (action: ScreenAction) => unknown,
) {
  const told = faults()
  const text = JSON.stringify(spec)
  const view = (length: number, given: Record<string, unknown>) => (
    <ScreenView
      text={text.slice(0, length)}
      data={given}
      members={members}
      onAction={onAction}
      onFault={told.onFault}
    />
  )
  const drawn = render(view(0, data))
  for (let length = 1; length <= text.length; length += 1) drawn.rerender(view(length, data))
  drawn.rerender(view(text.length, later))
  return { ...drawn, told: told.told }
}

describe('no action is told that no one took', () => {
  it('answers a row key bound to an action, and tells the host nothing', () => {
    const onAction = vi.fn()
    const { container, told } = drawThrough(
      {
        spec: 'polymorph-screen/1',
        name: 'Rows',
        purpose: 'A table whose row key is bound to an action.',
        inputs: [
          { name: 'tickets', type: 'Ticket[]' },
          { name: 'onRemove', type: '(row: Ticket) => void' },
        ],
        root: {
          component: 'DataTable',
          props: {
            label: 'Tickets',
            data: { $: 'tickets' },
            columns: [{ $object: { key: 'id', header: 'Id' } }],
            getRowId: { $: 'onRemove' },
            emptyState: { $object: { title: 'None' } },
          },
        },
      },
      { tickets: [{ id: 'a' }, { id: 'b' }] },
      { tickets: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      onAction,
    )
    expect(within(container).getAllByRole('row')).toHaveLength(4)
    expect(onAction).not.toHaveBeenCalled()
    expect(told).toEqual([])
  })

  it('answers a page label bound to an action, and tells the host only of the page it was asked for', async () => {
    const onAction = vi.fn()
    const spec = {
      spec: 'polymorph-screen/1',
      name: 'Pages',
      purpose: 'Pages whose label is bound to an action.',
      inputs: [
        { name: 'onPay', type: '(page: number) => void' },
        { name: 'go', type: '(page: number) => void' },
      ],
      root: {
        component: 'Pagination',
        props: {
          page: 1,
          pageCount: 3,
          onPageChange: { $: 'go' },
          messages: { $object: { page: { $: 'onPay' }, next: 'Next', previous: 'Back' } },
        },
      },
    }
    const { container } = drawThrough(spec, {}, { more: 1 }, onAction)
    const pages = ['1', '2', '3'].map((page) =>
      within(container).getByRole('button', { name: page }),
    )
    expect(pages.map((page) => page.textContent)).toEqual(['1', '2', '3'])
    expect(onAction).not.toHaveBeenCalled()
    await userEvent.click(pages[1] as HTMLElement)
    expect(onAction.mock.calls.map(([action]) => action as ScreenAction)).toEqual([
      { name: 'go', args: [2], values: {}, changed: [] },
    ])
  })

  it('draws a label or a child bound to an action as nothing, and tells the host only the faults', () => {
    const onAction = vi.fn()
    const { container, told } = drawThrough(
      {
        spec: 'polymorph-screen/1',
        name: 'Approve',
        purpose: 'A label and a child bound to an action.',
        inputs: [{ name: 'onApprove', type: '() => void' }],
        root: {
          component: 'Stack',
          children: [
            { component: 'Button', props: { label: { $: 'onApprove' } } },
            { component: 'Text', children: [{ $: 'onApprove' }] },
          ],
        },
      },
      {},
      { more: 1 },
      onAction,
    )
    const button = within(container).getByRole('button')
    // No function's source is drawn as text.
    expect(container.textContent).not.toMatch(/=>|function|\{/)
    expect(button.textContent).toBe('')
    expect(onAction).not.toHaveBeenCalled()
    expect(told.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['$.root.children[0].props.label', '$.root.children[1].children[0]']),
    )
  })

  it('never calls a function in the host’s data that a document binds', async () => {
    const onAction = vi.fn()
    const logout = vi.fn()
    const { container, told } = drawThrough(
      {
        spec: 'polymorph-screen/1',
        name: 'Session',
        purpose: 'A button bound to the host’s own function.',
        inputs: [{ name: 'session', type: 'Session' }],
        root: {
          component: 'Button',
          props: { label: 'View details', onClick: { $: 'session.logout' } },
        },
      },
      { session: { logout } },
      { session: { logout } },
      onAction,
    )
    await userEvent.click(within(container).getByRole('button', { name: 'View details' }))
    expect(logout).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
    expect(told.map(({ path }) => path)).toEqual(['$.root.props.onClick'])
  })

  it('holds no value for a control in a field no member draws', async () => {
    const onAction = vi.fn()
    const { container } = drawThrough(
      {
        spec: 'polymorph-screen/1',
        name: 'Requests',
        purpose: 'An empty state with a field no member draws.',
        inputs: [{ name: 'onSend', type: '() => void' }],
        root: {
          component: 'Stack',
          children: [
            {
              component: 'ListPage',
              props: {
                title: 'Requests',
                emptyState: {
                  $object: {
                    title: 'None',
                    x: { component: 'Input', props: { name: 'approved', defaultValue: 'yes' } },
                  },
                },
              },
            },
            { component: 'Button', props: { label: 'Send', onClick: { $: 'onSend' } } },
          ],
        },
      },
      {},
      { more: 1 },
      onAction,
    )
    expect(container.querySelector('input, textarea')).toBeNull()
    expect(onAction).not.toHaveBeenCalled()
    await userEvent.click(within(container).getByRole('button', { name: 'Send' }))
    expect(onAction.mock.calls.map(([action]) => action as ScreenAction)).toEqual([
      { name: 'onSend', args: [], values: {}, changed: [] },
    ])
  })
})
