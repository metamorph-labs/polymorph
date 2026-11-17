/**
 * A class list from recipe classes, leaving out the ones a condition turned
 * off (`undefined`). Every name is a recipe's: the token-only law holds a
 * member's `class` to reading its recipes.
 */
export function classes(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')
}

/**
 * An attribute the DOM reads by its presence (`disabled`, `hidden`), from a
 * value: `''` to write it, when the value is truthy or `''`, and `null` to
 * remove it, as React and Vue write one. Angular's `[attr.disabled]` would
 * otherwise write `disabled="false"`.
 */
export function presence(value: unknown): '' | null {
  return value === '' || Boolean(value) ? '' : null
}

/**
 * An object whose properties read the functions it is made from, each time:
 * what a member hands its compound parts (`owner.api`), which always reads the
 * member's current state.
 */
export function getters<T extends object>(reads: { readonly [K in keyof T]: () => T[K] }): T {
  const out = {} as T
  for (const key of Object.keys(reads) as (keyof T & string)[]) {
    Object.defineProperty(out, key, { enumerable: true, get: reads[key] })
  }
  return out
}

/** A form control's value, as Vue writes one: `''` for `null` and `undefined`, and the value as text. */
export function fieldValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}
