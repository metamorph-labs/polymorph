import { coerce as coerceThrough, decode as decodeThrough, type TemporalCodecs } from './attributes'
import type { Codec } from './definition'
import { temporal } from './temporal'

/**
 * How an attribute's text becomes a prop's value (`@polymorph/elements/codecs`),
 * for a script and a tool that read or write values themselves: every codec,
 * the temporal ones included (`Codec`, `definition.ts`).
 *
 * An absent attribute is `undefined`, so the member's default applies. A
 * boolean is true when the attribute is present with any value but `"false"`.
 * Text a codec cannot read throws `Unreadable`.
 *
 * The element does not read through this module. It reads through
 * `attributes.ts`, which imports no date type, and is given the temporal
 * codecs by the definition module of a member that takes a date or a time.
 */

export { encode, Unreadable } from './attributes'
export type { TemporalCodecs }

/** An attribute's text as the prop's value, a date or a time included. */
export function decode(codec: Codec, text: string | null): unknown {
  return decodeThrough(codec, text, temporal)
}

/**
 * A value set through a property, as the member takes it: a temporal prop
 * set to its ISO text reads it as its attribute would, and a set prop set to
 * an array is the set of its items. Any other value is the member's as it is.
 */
export function coerce(codec: Codec, value: unknown): unknown {
  return coerceThrough(codec, value, temporal)
}
