import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ERROR_EVENT, fillSlot, PolyElement } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import '../controls/Input'
import '../layout/Stack'
import '../structure/Badge'
import '../structure/ErrorSummary'
import '../structure/Table'
import '../structure/TableBody'
import '../structure/TableCell'
import '../structure/TableRow'
import { mount, mountNodes } from '../mount'

/**
 * What stays rendered when what an element's slots hold changes.
 *
 * A slot is read again each time what one of the element's slots holds
 * changes. Each `poly-*` element the slot still holds keeps its rendering: it
 * is not disposed and rendered again, and it is not taken out of the document
 * and put back, so a field inside it keeps its text and its focus. Only the
 * nodes that arrived render, and only the ones that left are disposed.
 *
 * `fillSlot` sets what one slot holds from script, before or after the
 * member renders, on any element, a structural part included. A member that
 * throws renders nothing and dispatches `poly-error`, and the members around
 * it render.
 */

beforeAll(installTestTheme)

/** Each render and dispose of a member's element while `act` runs. */
async function events(act: () => Promise<void>): Promise<string[]> {
  const seen: string[] = []
  const stop = PolyElement.observe((element, event) => seen.push(`${element.localName} ${event}`))
  try {
    await act()
  } finally {
    stop()
  }
  return seen
}

const text = (value: string) => document.createTextNode(value)

const made = (tag: string, slots: Record<string, readonly Node[]> = {}): PolyElement => {
  const element = document.createElement(tag)
  for (const [slot, nodes] of Object.entries(slots)) fillSlot(element, slot, nodes)
  return element as PolyElement
}

/** A rendered field, typed into and focused. */
async function typedField(host: HTMLElement): Promise<HTMLInputElement> {
  const input = await vi.waitFor(() => {
    const found = host.querySelector('input')
    if (found === null) throw new Error('the field has not rendered')
    return found
  })
  await userEvent.click(input)
  await userEvent.keyboard('Typed')
  expect(document.activeElement).toBe(input)
  return input
}

describe('a node the page adds to a rendered element', () => {
  it('leaves the one element already in the slot rendered, with its text and its focus', async () => {
    // One node, then two: the slot that held one element now holds a list.
    const { host } = await mount({
      name: 'one, then two',
      html: '<poly-stack gap="2"><poly-input name="a" aria-label="A"></poly-input></poly-stack>',
    })
    const input = await typedField(host)
    const seen = await events(async () => {
      const badge = document.createElement('poly-badge')
      badge.textContent = 'New'
      host.querySelector('poly-stack')?.append(badge)
      await vi.waitFor(() => expect(host.querySelector('[data-member="badge"]')).not.toBeNull())
    })
    expect(seen).toEqual(['poly-badge render'])
    expect(host.querySelector('input')).toBe(input)
    expect(input.value).toBe('Typed')
    expect(document.activeElement).toBe(input)
  })

  it('leaves the elements already in the slot rendered when one leaves through the element', async () => {
    const { host } = await mount({
      name: 'one leaves',
      html: '<poly-stack gap="2"><poly-input name="a" aria-label="A"></poly-input><poly-badge>Old</poly-badge></poly-stack>',
    })
    const input = await typedField(host)
    const badge = host.querySelector('poly-badge') as Element
    const seen = await events(async () => {
      host.querySelector('poly-stack')?.removeChild(badge)
      await vi.waitFor(() => expect(host.querySelector('[data-member="badge"]')).toBeNull())
    })
    expect(seen).toEqual(['poly-badge dispose'])
    expect(input.value).toBe('Typed')
    expect(document.activeElement).toBe(input)
  })
})

describe('fillSlot', () => {
  it('places nodes before the member renders, and the member renders them', async () => {
    const stack = made('poly-stack', {
      '': [made('poly-badge', { '': [text('One')] }), text('and text')],
    })
    const { host } = await mountNodes(stack)
    await vi.waitFor(() => expect(host.textContent).toBe('Oneand text'))
    // A placed node is not a child of the element.
    expect([...stack.children].some((child) => child.localName === 'poly-badge')).toBe(false)
  })

  it('inserts, replaces and removes nodes in place, and keeps each element that stays', async () => {
    const field = made('poly-input')
    field.setAttribute('aria-label', 'Field')
    const last = made('poly-badge', { '': [text('Last')] })
    const stack = made('poly-stack', { '': [field, last] })
    const { host } = await mountNodes(stack)
    const input = await typedField(host)
    const badges = () =>
      [...host.querySelectorAll('[data-member="badge"]')].map((badge) => badge.textContent)
    const seen = await events(async () => {
      const first = made('poly-badge', { '': [text('First')] })
      fillSlot(stack, '', [first, field, last])
      await vi.waitFor(() => expect(badges()).toEqual(['First', 'Last']))
      fillSlot(last, '', [text('Changed')])
      await vi.waitFor(() => expect(badges()).toEqual(['First', 'Changed']))
      fillSlot(stack, '', [field, last])
      await vi.waitFor(() => expect(badges()).toEqual(['Changed']))
    })
    expect(seen).toEqual(['poly-badge render', 'poly-badge dispose'])
    expect(host.querySelector('input')).toBe(input)
    expect(input.value).toBe('Typed')
    expect(document.activeElement).toBe(input)
    fillSlot(stack, '', [])
    await vi.waitFor(() => expect(host.querySelector('input')).toBeNull())
  })

  it('adds a cell to a table row its table already renders, and a row beside it', async () => {
    const cell = (value: string) => made('poly-table-cell', { '': [text(value)] })
    const a = cell('a')
    const row = made('poly-table-row', { '': [a] })
    const body = made('poly-table-body', { '': [row] })
    const table = made('poly-table', { '': [body] })
    ;(table as unknown as { label: string }).label = 'Letters'
    const { host } = await mountNodes(table)
    const rows = () => [...host.querySelectorAll('tbody tr')].map((tr) => tr.textContent)
    await vi.waitFor(() => expect(rows()).toEqual(['a']))
    const tr = host.querySelector('tbody tr')
    fillSlot(row, '', [a, cell('b')])
    await vi.waitFor(() => expect(rows()).toEqual(['ab']))
    fillSlot(body, '', [row, made('poly-table-row', { '': [cell('c')] })])
    await vi.waitFor(() => expect(rows()).toEqual(['ab', 'c']))
    expect(host.querySelector('tbody tr')).toBe(tr)
  })

  it('fills only a poly-* element', () => {
    expect(() => fillSlot(document.createElement('div'), '', [])).toThrow(TypeError)
  })
})

describe('a member that throws', () => {
  it('renders nothing, dispatches poly-error, and leaves the members beside it rendered', async () => {
    // ErrorSummary reads its required `errors`, which this one is not given.
    const summary = made('poly-error-summary')
    ;(summary as unknown as { title: string }).title = 'Check these'
    const heard: unknown[] = []
    summary.addEventListener(ERROR_EVENT, (event) => {
      heard.push((event as CustomEvent<unknown>).detail)
      event.preventDefault()
    })
    const errors = vi.spyOn(console, 'error')
    const stack = made('poly-stack', {
      '': [summary, made('poly-badge', { '': [text('Beside')] })],
    })
    const { host } = await mountNodes(stack)
    await vi.waitFor(() =>
      expect(host.querySelector('[data-member="badge"]')?.textContent).toBe('Beside'),
    )
    // Each computation of the member that throws reports its error.
    expect(heard.length).toBeGreaterThan(0)
    for (const error of heard) expect(error).toBeInstanceOf(Error)
    expect(host.querySelector('[data-member="error-summary"]')).toBeNull()
    // A listener that cancels the event keeps the error out of the console.
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
