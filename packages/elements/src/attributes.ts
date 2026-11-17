import type { CalendarDate, CalendarDateTime, Time } from '@polymorph/engine'

import type { Codec } from './definition'

/**
 * How an attribute's text becomes a prop's value (`Codec`, `definition.ts`),
 * as the element reads it.
 *
 * An absent attribute is `undefined`, so the member's default applies. A
 * boolean is true when the attribute is present with any value but `"false"`,
 * which is how HTML turns off a boolean whose default is true
 * (`dismissible="false"`). Text a codec cannot read throws `Unreadable`,
 * which the element reports and reads as `undefined`.
 *
 * A date or a time is read through the temporal codecs (`temporal.ts`), which
 * the caller passes in. This module imports no date type at run time, so the
 * date library loads only with a member that takes a date or a time: that
 * member's definition module gives the temporal codecs to `define`.
 * `codecs.ts` passes them on every call, for a script that reads values itself.
 */

/** Text an attribute's codec cannot read. */
export class Unreadable extends Error {
  override name = 'Unreadable'
}

/** How the temporal codecs read ISO 8601 text, by the kind each reads (`temporal.ts`). */
export interface TemporalCodecs {
  /** `09:30`, `09:30:15` as a `Time`. */
  readonly time: (text: string) => Time
  /** `2026-07-15` as a `CalendarDate`, and `2026-07-15T09:30` as a `CalendarDateTime`. */
  readonly date: (text: string) => CalendarDate | CalendarDateTime
  /** `2026-07-01/2026-07-15` as the range a range picker takes: two days, start first. */
  readonly range: (text: string) => { start: CalendarDate; end: CalendarDate }
}

/** Whether a codec reads a date or a time. */
export const readsTemporal = (
  codec: Codec,
): codec is Extract<Codec, { readonly temporal: unknown }> =>
  typeof codec === 'object' && 'temporal' in codec

/** A number written as text: a decimal, an exponent, or `Infinity`. */
function number(text: string): number {
  const value = Number(text)
  if (text.trim() === '' || Number.isNaN(value)) throw new Unreadable(`"${text}" is not a number`)
  return value
}

/**
 * An attribute's text as the prop's value. A date or a time is read through
 * `temporal`; without it, a temporal codec's text is `Unreadable`.
 */
export function decode(codec: Codec, text: string | null, temporal?: TemporalCodecs): unknown {
  if (text === null) return undefined
  if (codec === 'string') return text
  if (codec === 'boolean') return text !== 'false'
  if (codec === 'number') return number(text)
  if (codec === 'property') return undefined
  if (codec === 'json') {
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Unreadable(`"${text.length > 60 ? `${text.slice(0, 60)}…` : text}" is not JSON`)
    }
  }
  if (codec === 'set') {
    const members = decode('json', text)
    if (!Array.isArray(members)) {
      throw new Unreadable(`"${text}" is not a JSON array of a set's members`)
    }
    return new Set(members)
  }
  if (readsTemporal(codec)) {
    if (temporal === undefined) {
      throw new Unreadable(
        `"${text}" is read through the temporal codecs, which were not given (@polymorph/elements/temporal)`,
      )
    }
    return temporal[codec.temporal](text)
  }
  for (const literal of codec.union) if (String(literal) === text) return literal
  if (codec.boolean === true && (text === '' || text === 'true' || text === 'false')) {
    return text !== 'false'
  }
  if (codec.json === true && /^\s*[[{]/.test(text)) return decode('json', text)
  if (codec.number === true && text.trim() !== '' && !Number.isNaN(Number(text))) {
    return Number(text)
  }
  if (codec.string === true) return text
  if (codec.boolean === true) return true
  if (codec.json === true) return decode('json', text)
  throw new Unreadable(
    `"${text}" is none of ${codec.union.map((value) => String(value)).join(', ')}`,
  )
}

/**
 * A value set through a property, as the member takes it: a temporal prop
 * set to its ISO text reads it as its attribute would, through `temporal`,
 * and a set prop set to an array is the set of its items. Any other value is
 * the member's as it is.
 */
export function coerce(codec: Codec, value: unknown, temporal?: TemporalCodecs): unknown {
  if (typeof value === 'string' && readsTemporal(codec)) return decode(codec, value, temporal)
  if (codec === 'set' && Array.isArray(value)) return new Set(value)
  return value
}

/**
 * The attribute text that reads back as a value (`decode`'s inverse), for a
 * prop set by its attribute alone: `null` for no attribute, which reads as the
 * prop left out. A prop set from script only has no text.
 */
export function encode(codec: Codec, value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (codec === 'property') throw new Unreadable('a prop set from script only has no attribute')
  if (typeof value === 'boolean') return value ? '' : 'false'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value instanceof Set) return JSON.stringify([...value])
  if (readsTemporal(codec)) {
    const range = value as { start?: unknown; end?: unknown }
    return codec.temporal === 'range'
      ? `${String(range.start)}/${String(range.end)}`
      : String(value)
  }
  return JSON.stringify(value)
}
