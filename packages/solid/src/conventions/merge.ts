/**
 * The attributes of one element that takes a machine's prop getters, merged
 * in order: the getters' objects, then the attributes the description writes
 * for the element.
 *
 * Every key is compared in lowercase, except the ones Solid reads in
 * camelCase (`textContent`) and a namespaced one (`oncapture:click`). Zag's
 * Solid normalizer keeps React's casing (`tabIndex`, `onKeyDown`), a
 * description writes the DOM's (`tabindex`, `onKeydown`), and the DOM reads an
 * HTML attribute's name and an event's name without case. So a later source
 * wins for every attribute it holds, however either source spells it, even
 * when its value is `undefined`: a description takes an attribute away from a
 * machine (Dialog's panel keeps no `hidden` while it plays its exit;
 * ColorInput's thumbs keep no `tabindex`). Solid's own `mergeProps` reads `undefined` as "not given" and
 * would keep the getter's value. Inside one source a later name for an event
 * replaces an earlier one (`{ ...api.getInputProps(), onKeydown: own }` puts
 * the member's handler in place of the machine's), and handlers from two
 * sources both run, the earlier first, as Vue and React merge them. Styles
 * merge, and classes join.
 */
export function mergeParts(...sources: readonly object[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const source of sources) {
    const own: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(source)) own[spelled(name)] = value
    for (const [key, value] of Object.entries(own)) {
      const held = merged[key]
      if (key.startsWith('on') && typeof value === 'function' && typeof held === 'function') {
        const first = held as (...args: unknown[]) => unknown
        const second = value as (...args: unknown[]) => unknown
        merged[key] = (...args: unknown[]) => {
          first(...args)
          second(...args)
        }
      } else if (key.startsWith('on') && value === undefined && typeof held === 'function') {
        // A later source that names an event without a handler leaves the earlier one.
        continue
      } else if (key === 'style' && isStyle(held) && isStyle(value)) {
        merged[key] = { ...held, ...value }
      } else if (key === 'class' && typeof held === 'string' && typeof value === 'string') {
        merged[key] = `${held} ${value}`
      } else {
        merged[key] = value
      }
    }
  }
  return merged
}

/** The keys Solid reads only in camelCase: the properties it sets by name, and `classList`. */
const CAMEL = new Set(['textContent', 'innerHTML', 'innerText', 'classList'])

/** A key as the merge compares it: lowercased, unless Solid reads its casing or its namespace. */
const spelled = (name: string): string =>
  CAMEL.has(name) || name.includes(':') ? name : name.toLowerCase()

const isStyle = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object'

/**
 * A class list from recipe classes, leaving out the ones a condition turned
 * off (`undefined`). Every name is a recipe's: the token-only law holds a
 * member's `class` to reading its recipes.
 */
export function classes(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')
}
