import { use } from 'react'

/**
 * Reads an element, or an element's type, that a server component may have
 * passed to a client member.
 *
 * A member that only renders a node it is given needs none of this, because
 * React renders whatever arrives. A member that reads the node does: FormField
 * reads its control's `type` and `props` and clones it, and Dialog clones its
 * trigger. Under React Server Components the value a client member receives
 * may not be the element yet:
 *
 *  - an element whose own parts are still loading arrives as a lazy node,
 *    which has no `type` and no `props`. React's development build sends every
 *    element a server component passes this way, so a development server shows
 *    it on every page. A production build sends one while a client component's
 *    module is still loading.
 *  - an element's `type` is a lazy reference when it names a client component,
 *    so a static property such as `controlKind` cannot be read from it.
 *
 * A lazy value holds the thenable that resolves to the real one, and `use`
 * reads it, suspending while it loads. Radix's `Slot` reads a lazy child the
 * same way. React has no public call for this, so `$$typeof` and `_payload` are
 * React's own field names. Both are checked first, and a value that is not
 * shaped this way is returned as it came: an element a client component
 * created, or a component `React.lazy` wraps, whose payload is not a thenable
 * and which React resolves when it renders it.
 *
 * This module carries no `'use client'`. `use` runs in a server component as
 * it does in a client one, and the members that call this are client modules.
 */

const LAZY = Symbol.for('react.lazy')

interface LazyReference {
  $$typeof: symbol
  _payload: PromiseLike<unknown>
}

function isLazyReference(value: unknown): value is LazyReference {
  if (typeof value !== 'object' || value === null) return false
  const { $$typeof: kind, _payload: payload } = value as Partial<LazyReference>
  return (
    kind === LAZY &&
    typeof payload === 'object' &&
    payload !== null &&
    typeof payload.then === 'function'
  )
}

/**
 * `value` itself, or what it resolves to when it is a lazy reference from a
 * server component. Call it on an element before reading or cloning it, and on
 * the element's `type` before reading a static property from it.
 */
export function useSupplied<T>(value: T): T {
  return isLazyReference(value) ? (use(value._payload) as T) : value
}
