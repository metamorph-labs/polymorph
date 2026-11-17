import { describe, expect, it } from 'vitest'

import {
  CalendarDate,
  CalendarDateTime,
  coerce,
  decode,
  encode,
  Time,
  Unreadable,
} from '@polymorph/elements'

/**
 * How an attribute's text reads into a prop (`@polymorph/elements/codecs`):
 * an absent attribute is `undefined`, so the member's default applies; a
 * boolean is present unless it says `"false"`; data is JSON; a date or a time
 * is its ISO 8601 text; and text a codec cannot read is refused.
 */

describe('an attribute’s text, read through its codec', () => {
  it('reads an absent attribute as unset, whatever its codec', () => {
    for (const codec of ['string', 'number', 'boolean', 'json'] as const) {
      expect(decode(codec, null)).toBeUndefined()
    }
  })

  it('reads a boolean as present unless it says "false"', () => {
    expect(decode('boolean', '')).toBe(true)
    expect(decode('boolean', 'disabled')).toBe(true)
    expect(decode('boolean', 'false')).toBe(false)
  })

  it('reads numbers and JSON, and refuses text that is neither', () => {
    expect(decode('number', '12')).toBe(12)
    expect(decode('number', 'Infinity')).toBe(Number.POSITIVE_INFINITY)
    expect(() => decode('number', 'twelve')).toThrow(Unreadable)
    expect(decode('json', '[{"value":"open"}]')).toEqual([{ value: 'open' }])
    expect(() => decode('json', '[{value}]')).toThrow(Unreadable)
  })

  it('reads a union as the literal it names, then by its open members', () => {
    const checked = { union: ['indeterminate'], boolean: true } as const
    expect(decode(checked, 'indeterminate')).toBe('indeterminate')
    expect(decode(checked, '')).toBe(true)
    expect(decode(checked, 'false')).toBe(false)
    const span = { union: ['auto'], number: true } as const
    expect(decode(span, 'auto')).toBe('auto')
    expect(decode(span, '3')).toBe(3)
    expect(() => decode(span, 'wide')).toThrow(Unreadable)
    const value = { union: [], string: true, json: true } as const
    expect(decode(value, 'faq-1')).toBe('faq-1')
    expect(decode(value, '["faq-1","faq-2"]')).toEqual(['faq-1', 'faq-2'])
  })

  it('reads a date or a time as its ISO 8601 text', () => {
    expect(decode({ temporal: 'time' }, '09:30')).toEqual(new Time(9, 30))
    expect(decode({ temporal: 'date' }, '2026-07-15')).toEqual(new CalendarDate(2026, 7, 15))
    expect(decode({ temporal: 'date' }, '2026-07-15T09:30')).toEqual(
      new CalendarDateTime(2026, 7, 15, 9, 30),
    )
    expect(decode({ temporal: 'range' }, '2026-07-01/2026-07-15')).toEqual({
      start: new CalendarDate(2026, 7, 1),
      end: new CalendarDate(2026, 7, 15),
    })
    expect(() => decode({ temporal: 'date' }, 'July 15')).toThrow(Unreadable)
  })

  it('reads a set from a JSON array of its members, and refuses any other JSON', () => {
    expect(decode('set', '["a","b"]')).toEqual(new Set(['a', 'b']))
    expect(() => decode('set', '{"a":1}')).toThrow(Unreadable)
    expect(coerce('set', ['a'])).toEqual(new Set(['a']))
    const set = new Set(['a'])
    expect(coerce('set', set)).toBe(set)
  })

  it('reads a date set through a property as its text, and any other value as it is', () => {
    expect(coerce({ temporal: 'date' }, '2026-07-15')).toEqual(new CalendarDate(2026, 7, 15))
    const day = new CalendarDate(2026, 7, 15)
    expect(coerce({ temporal: 'date' }, day)).toBe(day)
    expect(coerce('number', '12')).toBe('12')
  })
})

describe('a value as the attribute text that reads back as it', () => {
  it('writes each codec’s text, and no attribute for a value left out', () => {
    const values: [Parameters<typeof encode>[0], unknown][] = [
      ['string', 'Draft'],
      ['number', 12],
      ['boolean', true],
      ['boolean', false],
      ['json', [{ value: 'open' }]],
      ['set', new Set(['a', 'b'])],
      [{ temporal: 'date' }, new CalendarDate(2026, 7, 15)],
      [{ temporal: 'date' }, new CalendarDateTime(2026, 7, 15, 9, 30)],
      [{ temporal: 'time' }, new Time(9, 30)],
      [{ union: ['indeterminate'], boolean: true }, 'indeterminate'],
      [{ union: ['indeterminate'], boolean: true }, false],
    ]
    for (const [codec, value] of values) {
      expect(decode(codec, encode(codec, value)), JSON.stringify(codec)).toEqual(value)
    }
    expect(encode('string', null)).toBeNull()
    expect(encode('json', undefined)).toBeNull()
    expect(() => encode('property', () => {})).toThrow(Unreadable)
  })
})
