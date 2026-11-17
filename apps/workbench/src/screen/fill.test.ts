/**
 * @vitest-environment jsdom
 *
 * How the screen page fills a spec's inputs. The file asks for a DOM because `fill.ts` samples
 * with the composer's rule, and that module loads the vocabulary.
 */

import type { ScreenInput } from '@polymorph/spec/schema'
import { describe, expect, it } from 'vitest'

import { fillInputs, returnTypeOf, valueAt } from './fill'

const INPUTS: ScreenInput[] = [
  { name: 'tickets', type: 'Ticket[]' },
  { name: 'query', type: 'string' },
  { name: 'status', type: 'string | null' },
  { name: 'draft', type: 'Draft' },
  { name: 'isEmpty', type: 'boolean' },
  { name: 'total', type: 'number' },
  { name: 'onOpen', type: '(ticket: Ticket) => void' },
  { name: 'getRowId', type: '(ticket: Ticket) => string' },
  { name: 'canEdit', type: '(ticket: Ticket) => boolean' },
  { name: 'onSave', type: '(() => Promise<void>) | undefined' },
  { name: 'loadMore', type: '() => Promise<Ticket[]>' },
  { name: 'rank', type: '(ticket: Ticket) => number' },
]

const call = (value: unknown, ...args: unknown[]): unknown =>
  (value as (...given: unknown[]) => unknown)(...args)

describe('fillInputs', () => {
  it('uses the caller’s data for an input it names, and says so', () => {
    const tickets = [{ id: 'T-1', subject: 'Webhook retries stop' }]
    const { values, fills } = fillInputs(INPUTS, { tickets, query: 'retries' })

    expect(values.get('tickets')).toBe(tickets)
    expect(values.get('query')).toBe('retries')
    expect(fills.find((fill) => fill.name === 'tickets')).toEqual({
      name: 'tickets',
      type: 'Ticket[]',
      from: 'data',
    })
  })

  it('samples an input with no data from its type, and invents nothing', () => {
    const { values, fills } = fillInputs(INPUTS, {})

    expect(values.get('tickets')).toEqual([])
    expect(values.get('query')).toBe('⟨query⟩')
    expect(values.get('status')).toBeNull()
    expect(values.get('draft')).toBeUndefined()
    expect(values.get('isEmpty')).toBe(false)
    expect(values.get('total')).toBe(0)

    const shown = Object.fromEntries(
      fills.filter((fill) => fill.from === 'sample').map((fill) => [fill.name, fill.value]),
    )
    expect(shown).toEqual({
      tickets: '[]',
      query: '"⟨query⟩"',
      status: 'null',
      draft: 'absent',
      isEmpty: 'false',
      total: '0',
    })
  })

  it('keeps a falsy value the caller gave, which is data and not a missing input', () => {
    const { values, fills } = fillInputs(INPUTS, { tickets: [], query: '', status: null })

    expect(values.get('query')).toBe('')
    expect(fills.filter((fill) => fill.from === 'data').map((fill) => fill.name)).toEqual([
      'tickets',
      'query',
      'status',
    ])
  })

  it('stubs every callback by the return type it declares', async () => {
    const { values, fills } = fillInputs(INPUTS, {})

    expect(call(values.get('onOpen'), { id: 'T-1' })).toBeUndefined()
    expect(call(values.get('canEdit'), { id: 'T-1' })).toBe(false)
    expect(call(values.get('rank'), { id: 'T-1' })).toBe(0)
    await expect(call(values.get('onSave'))).resolves.toBeUndefined()
    await expect(call(values.get('loadMore'))).resolves.toEqual([])

    expect(fills.find((fill) => fill.name === 'onSave')).toEqual({
      name: 'onSave',
      type: '(() => Promise<void>) | undefined',
      from: 'stub',
      value: 'answers a promise of nothing',
    })
  })

  it('answers a key for a string callback: an id, the value itself, or a serial per object', () => {
    const { values } = fillInputs(INPUTS, {})
    const getRowId = values.get('getRowId')
    const first = { subject: 'No id' }
    const second = { subject: 'No id' }

    expect(call(getRowId, { id: 'T-1' })).toBe('T-1')
    expect(call(getRowId, { id: 7 })).toBe('7')
    expect(call(getRowId, 'plain')).toBe('plain')
    expect(call(getRowId, null)).toBe('')
    // Two rows with no id still get two keys, and a row keeps its key.
    expect(call(getRowId, first)).not.toBe(call(getRowId, second))
    expect(call(getRowId, first)).toBe(call(getRowId, first))
  })

  it('stubs a callback even when data names it, because JSON holds no function', () => {
    const { values, fills } = fillInputs(INPUTS, { onOpen: 'not a function' })

    expect(typeof values.get('onOpen')).toBe('function')
    expect(fills.find((fill) => fill.name === 'onOpen')?.from).toBe('stub')
  })
})

describe('returnTypeOf', () => {
  it.each([
    ['() => void', 'void'],
    ['(ticket: Ticket) => string', 'string'],
    ['(() => Promise<void>) | undefined', 'Promise<void>'],
    ['(a: (b: string) => void) => Map<string, number[]>', 'Map<string, number[]>'],
    ['(id: string) => Ticket[] | null', 'Ticket[]'],
  ])('%s returns %s', (type, returns) => {
    expect(returnTypeOf(type)).toBe(returns)
  })
})

describe('valueAt', () => {
  const values = new Map<string, unknown>([
    ['summary', { open: { label: 'Open', value: '128' } }],
    ['tickets', [{ id: 'T-1' }]],
    ['draft', undefined],
    ['status', null],
  ])

  it('reads a dotted path into an input', () => {
    expect(valueAt('summary.open.value', values)).toBe('128')
    expect(valueAt('tickets', values)).toEqual([{ id: 'T-1' }])
    expect(valueAt('tickets.length', values)).toBe(1)
  })

  it('reads a path through an absent value as absent', () => {
    expect(valueAt('draft.subject', values)).toBeUndefined()
    expect(valueAt('status.label', values)).toBeUndefined()
    expect(valueAt('summary.urgent.value', values)).toBeUndefined()
    expect(valueAt('missing', values)).toBeUndefined()
  })
})
