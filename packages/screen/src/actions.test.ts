import { describe, expect, it } from 'vitest'

import { answerFor, returnTypeOf, sampleOf, stubFor, valueAt } from './actions'
import { allowedMembers, defaultMembers, memberNames, surfaceOf } from './members'
import { VOCABULARY } from './vocabulary'

/**
 * What a callback answers, what fills an input with no data, what a binding
 * reads, and what a name in a document resolves to.
 */

describe('a callback answers by its declared return type', () => {
  it('reads the return type after the last arrow', () => {
    expect(returnTypeOf('(row: Ticket) => string')).toBe('string')
    expect(returnTypeOf('(() => Promise<void>) | undefined')).toBe('Promise<void>')
    expect(returnTypeOf('() => void | Promise<void>')).toBe('void')
  })

  it('answers a key, false, 0, an empty list, nothing, or a promise of one', async () => {
    const row = {}
    const key = stubFor('(row: Row) => string').stub
    expect(key('a')).toBe('a')
    expect(key(3)).toBe('3')
    expect(key(null)).toBe('')
    expect(key({ id: 'r7' })).toBe('r7')
    // A row with no id keeps one serial for as long as it lives.
    expect(key(row)).toBe(key(row))
    expect(key(row)).not.toBe(key({}))
    expect(stubFor('() => boolean').stub()).toBe(false)
    expect(stubFor('() => number').stub()).toBe(0)
    expect(stubFor('() => string[]').stub()).toEqual([])
    expect(stubFor('() => void').stub()).toBeUndefined()
    await expect(stubFor('() => Promise<boolean>').stub()).resolves.toBe(false)
    expect(stubFor('() => Promise<boolean>').answers).toBe('a promise of false')
  })

  it('takes the host’s answer where the type allows it', async () => {
    const saving = Promise.resolve()
    expect(answerFor('() => void', saving, [])).toBe(saving)
    expect(answerFor('() => void', 'ignored', [])).toBeUndefined()
    expect(answerFor('() => Promise<string>', saving, [])).toBe(saving)
    await expect(answerFor('() => Promise<string>', 'x', []) as Promise<string>).resolves.toBe('x')
    await expect(
      answerFor('() => Promise<string[]>', undefined, []) as Promise<string[]>,
    ).resolves.toEqual([])
    expect(answerFor('(id: string) => boolean', true, ['a'])).toBe(true)
    expect(answerFor('(id: string) => boolean', saving, ['a'])).toBe(false)
  })
})

describe('an input with no data samples from its type', () => {
  it('samples what the composer has always drawn', () => {
    expect(sampleOf('done', 'boolean')).toBe(false)
    expect(sampleOf('count', 'number')).toBe(0)
    expect(sampleOf('rows', 'Row[]')).toEqual([])
    expect(sampleOf('rows', 'readonly Row[]')).toEqual([])
    expect(sampleOf('title', 'string')).toBe('⟨title⟩')
    expect(sampleOf('status', 'string | null')).toBeNull()
    expect(sampleOf('ticket', 'Ticket')).toBeUndefined()
  })
})

describe('a binding reads its path', () => {
  const values = new Map<string, unknown>([
    ['draft', { subject: 'Hi', to: null, tags: ['a'] }],
    ['count', 3],
  ])

  it('reads each name as a property of the value before it', () => {
    expect(valueAt('draft.subject', values)).toBe('Hi')
    expect(valueAt('draft.tags.length', values)).toBe(1)
    expect(valueAt('missing.x', values)).toBeUndefined()
  })

  it('reads nothing through an absent value, a number, or a property the value inherits', () => {
    expect(valueAt('draft.to.name', values)).toBeUndefined()
    expect(valueAt('count.toFixed', values)).toBeUndefined()
    expect(valueAt('draft.constructor', values)).toBeUndefined()
    expect(valueAt('draft.hasOwnProperty', values)).toBeUndefined()
  })
})

describe('the members a screen may use', () => {
  it('names every member and primitive, and each framework’s default', () => {
    const names = memberNames(VOCABULARY)
    expect(names).toContain('Button')
    expect(names).toContain('DensityScope')
    expect(names).toContain('ThirdParty')
    expect(defaultMembers(VOCABULARY)).not.toContain('Toast')
    expect(defaultMembers(VOCABULARY, 'elements')).toContain('Toast')
    expect(defaultMembers(VOCABULARY, 'vue')).not.toContain('ImageEditor')
    expect([...allowedMembers(VOCABULARY, { members: ['Card'] })]).toEqual(['Card'])
  })

  it('resolves a name by the validator’s rule', () => {
    expect(surfaceOf(VOCABULARY, 'Table.Row')).toMatchObject({ member: 'Table', part: 'Row' })
    expect(surfaceOf(VOCABULARY, 'DensityScope')).toMatchObject({
      member: 'DensityScope',
      part: null,
    })
    expect(surfaceOf(VOCABULARY, 'Input')?.controlled).toEqual({ value: 'onChange' })
    expect(surfaceOf(VOCABULARY, 'Table.Row.Cell')).toBeNull()
    expect(surfaceOf(VOCABULARY, 'Table.Rows')).toBeNull()
    expect(surfaceOf(VOCABULARY, 'Buton')).toBeNull()
  })
})
