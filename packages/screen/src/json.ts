/**
 * A value reduced to JSON, as an action and the screen's `values` carry it to
 * the host.
 *
 * A member calls its callbacks with what its framework hands it: a value, a
 * DOM event, a date from `@internationalized/date`, a `Set`. The host reads
 * the call as data, in another process or another language, so each argument
 * is reduced to what JSON can say. A DOM event, a node and a function say
 * nothing a host can use, so they are dropped. A date or a time says its ISO
 * text. This module has no DOM, so it knows each of them by its shape.
 */

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** What `toJson` answers for a value JSON cannot say, which the caller drops. */
export const DROPPED: unique symbol = Symbol('dropped')

type Reduced = JsonValue | typeof DROPPED

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A DOM event, or a framework's event around one: it can be cancelled and it has a target. */
const isEvent = (value: Record<string, unknown>): boolean =>
  typeof value['preventDefault'] === 'function' && 'target' in value

/** A DOM node, or a React or Solid element: it says what kind of node it is. */
const isNode = (value: Record<string, unknown>): boolean =>
  (typeof value['nodeType'] === 'number' && typeof value['nodeName'] === 'string') ||
  '$$typeof' in value

/** A `File` or a `Blob`: what a JSON reader can know of it is its name, its size and its type. */
const isBlob = (value: Record<string, unknown>): boolean =>
  typeof value['arrayBuffer'] === 'function' && typeof value['size'] === 'number'

/** Sets a key as the object's own, `__proto__` included, as `JSON.parse` does. */
function own(target: { [key: string]: JsonValue }, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

/**
 * A date or a time from `@internationalized/date`, which members hand their
 * date callbacks: it compares, copies and prints itself as ISO 8601.
 */
const isTemporal = (value: Record<string, unknown>): boolean =>
  typeof value['compare'] === 'function' &&
  typeof value['copy'] === 'function' &&
  typeof value['toString'] === 'function'

function reduce(value: unknown, seen: Set<object>): Reduced {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  // JSON has no `NaN` or infinity; `JSON.stringify` writes them as `null`.
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (!isRecord(value)) return DROPPED
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (isEvent(value) || isNode(value)) return DROPPED
  if (isTemporal(value)) return String(value)
  if (isBlob(value)) {
    const out: { [key: string]: JsonValue } = { size: value['size'] as number }
    if (typeof value['name'] === 'string') out['name'] = value['name']
    if (typeof value['type'] === 'string') out['type'] = value['type']
    return out
  }
  // A value that holds itself is cut where it does, as JSON has no reference.
  if (seen.has(value)) return DROPPED
  seen.add(value)
  try {
    if (Array.isArray(value) || value instanceof Set) {
      return [...(value as Iterable<unknown>)].map((item) => {
        const reduced = reduce(item, seen)
        return reduced === DROPPED ? null : reduced
      })
    }
    const entries: [string, unknown][] =
      value instanceof Map
        ? [...(value as Map<unknown, unknown>)].map(([key, item]) => [String(key), item])
        : Object.entries(value)
    const out: { [key: string]: JsonValue } = {}
    for (const [key, item] of entries) {
      const reduced = reduce(item, seen)
      if (reduced !== DROPPED) own(out, key, reduced)
    }
    return out
  } finally {
    seen.delete(value)
  }
}

/** A value as JSON: `undefined` when JSON cannot say it (a function, an event, a node). */
export function toJson(value: unknown): JsonValue | undefined {
  const reduced = reduce(value, new Set())
  return reduced === DROPPED ? undefined : reduced
}

/**
 * A call's arguments as JSON. An argument JSON cannot say is dropped from the
 * end of the list and is `null` before an argument that is kept, so every
 * kept argument stays at its position: `onClick(event)` is `[]` and
 * `onSelect(item, event, index)` is `[item, null, index]`.
 */
export function argumentsToJson(args: readonly unknown[]): JsonValue[] {
  const reduced = args.map((arg) => reduce(arg, new Set()))
  while (reduced.length > 0 && reduced[reduced.length - 1] === DROPPED) reduced.pop()
  return reduced.map((arg) => (arg === DROPPED ? null : arg))
}
