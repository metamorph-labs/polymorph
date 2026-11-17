import { keyArray } from '@solid-primitives/keyed'
import { createMemo, on, untrack, type Accessor, type JSX } from 'solid-js'

/**
 * The content once per item of a list, keyed by what a description names as
 * the item's key (`item.value`), as Vue's `v-for` and React's `key` key it.
 *
 * Solid's `<For>` keys an item by its identity, and a member often derives its
 * list afresh (a filtered list, TagInput's chips with their presence), so a new
 * object for the same item would replace its element, its focus and its exit.
 * Here an item keeps its element while its key stays.
 *
 * The content reads the item as a value, as a Vue template does, and the value
 * follows the latest item of its key: a plain object or array is passed as a
 * view whose properties read the latest item, so a row updates in place and
 * TypeScript narrows the item as it narrows any constant. A primitive, or an
 * object of a class (a calendar date), is passed as it is; when the content
 * reads it (`renew`), a row whose item changes under the same key is made
 * again, and otherwise the row stays (Slider's thumbs, keyed by their place,
 * keep their focus as their values move). The index is an accessor, because a
 * keyed row moves.
 *
 * A view is not the caller's object: `===`, `indexOf` and `structuredClone`
 * tell them apart. So a row hands its item to a call as `itemOf(item)`, the
 * latest item of its key itself, and a callback (`onRowClick(row)`) or a
 * function prop (`getRowId(row)`) gets the object the caller put in the list.
 */
export function Each<T>(props: {
  of: readonly T[] | null | undefined
  by: (item: T, index: number) => unknown
  /** The content reads the item: a primitive or class item that changes makes a new row. */
  renew?: boolean
  children: (item: T, index: Accessor<number>) => JSX.Element
}): JSX.Element {
  return createMemo(
    keyArray(
      () => props.of,
      (item, index) =>
        props.renew === true ? identity(item, props.by(item, index)) : props.by(item, index),
      (item, index) => props.children(follow(item), index),
    ),
  ) as unknown as JSX.Element
}

/**
 * Content made again whenever `by` changes, as Vue's `:key` and Svelte's
 * `{#key}` replace an element: Calendar's month grid is a new element for each
 * month, so its recipe's entrance plays on every move. The content is created
 * once per value of `by`, untracked, and disposed when the next one is created.
 */
export function Keyed(props: { by: unknown; children: () => JSX.Element }): JSX.Element {
  const by = createMemo(() => props.by)
  return createMemo(on(by, () => untrack(props.children))) as unknown as JSX.Element
}

/** The view's own key for the latest item it reads, which no caller's object holds. */
const LATEST: unique symbol = Symbol('latest')

/**
 * The item itself, for a row's item that `Each` passed as a view: the latest
 * item of its key. Any other value is returned as it is.
 */
export function itemOf<T>(item: T): T {
  if (item === null || typeof item !== 'object') return item
  const latest = (item as { [LATEST]?: T })[LATEST]
  return latest === undefined ? item : latest
}

const plain = (value: unknown): value is object => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null
}

/** The key a row that renews is kept by: the description's, with an item that is not plain. */
function identity(item: unknown, key: unknown): unknown {
  if (plain(item)) return key
  if (item !== null && (typeof item === 'object' || typeof item === 'function')) return item
  return `${typeof key}:${String(key)}\u0000${typeof item}:${String(item)}`
}

/** The item a row reads: a view over the latest plain item of its key, or the item itself. */
function follow<T>(item: Accessor<T>): T {
  const first = untrack(item)
  if (!plain(first)) return first
  const latest = () => item() as object
  return new Proxy(Array.isArray(first) ? [] : {}, {
    get: (_, property) => (property === LATEST ? latest() : Reflect.get(latest(), property)),
    has: (_, property) => Reflect.has(latest(), property),
    ownKeys: () => Reflect.ownKeys(latest()),
    getOwnPropertyDescriptor: (target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(latest(), property)
      if (descriptor === undefined) return undefined
      // An array's `length` is not configurable on the view either.
      const fixed = Reflect.getOwnPropertyDescriptor(target, property)?.configurable === false
      return { ...descriptor, configurable: !fixed }
    },
  }) as T
}
