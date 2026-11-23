/**
 * How deep a screen document may nest.
 *
 * Every pass over a document reads it by recursion: `parsePartial`, the
 * validator under `checkScreen`, and the walk. An engine's stack ends a few
 * thousand calls deep, so a few kilobytes of text that only opens lists would
 * throw out of the host's renderer. So a document nests at most `MAX_DEPTH`
 * objects and lists inside one another, the document's own object counting as
 * one. `parsePartial` cuts deeper text where it goes too deep and records an
 * error, `checkScreen` reports a fault and does not validate the document, and
 * the walk reports a fault and draws nothing deeper.
 *
 * The deepest screen in `design/screens/` nests 19 objects and lists, and
 * each element a screen nests adds two. The limit leaves room for screens
 * several times as deep, and stays far below the depth at which any of those
 * passes runs out of stack. `parsePartial` defines it, as it loads no other
 * module.
 */

import { MAX_DEPTH } from './partial'

export { MAX_DEPTH }

/** The fault's words for a value that nests deeper than `MAX_DEPTH`. */
export const TOO_DEEP =
  `objects and lists are nested here deeper than ${MAX_DEPTH}, which no screen needs; ` +
  'what is deeper is left out'

/**
 * The path of the first object or list in `value` that sits deeper than
 * `MAX_DEPTH`, `value` itself sitting at `depth`, or `null` when there is none.
 * It reads the value without recursion, and a value that holds itself is
 * deeper than any limit.
 */
export function tooDeep(value: unknown, path = '$', depth = 1): string | null {
  const stack: [unknown, string, number][] = [[value, path, depth]]
  for (;;) {
    const next = stack.pop()
    if (next === undefined) return null
    const [current, at, level] = next
    if (typeof current !== 'object' || current === null) continue
    if (level > MAX_DEPTH) return at
    // Pushed last to first, so the first too deep in document order is the one found.
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push([current[index], `${at}[${index}]`, level + 1])
      }
    } else {
      const keys = Object.keys(current)
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index] as string
        // A structured object's fields sit at its own path, as the validator writes them.
        const inner = key === '$object' ? at : `${at}.${key}`
        stack.push([(current as Record<string, unknown>)[key], inner, level + 1])
      }
    }
  }
}
