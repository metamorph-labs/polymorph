import { sharedConfig } from 'solid-js'

/**
 * What the Solid members do about a hydration's keys.
 *
 * Solid names each element a server renders by a key, counted in the order
 * its components are created, and a browser that hydrates finds each element
 * by the same count. Three things a member does would break that, and the
 * functions here keep them from it.
 *
 * A member creates a slot's content, or a prop's value that holds nodes, the
 * first time it reads it, and a server and a browser do not read in the same
 * order: a server evaluates an element's attributes before its children, and a
 * browser inserts the children first. `reserveKeys` takes the content's place
 * in the count where the member declares it, which both run in the same order.
 *
 * A member is also created without being drawn: Avatar.Group creates every
 * Avatar to count them and draws the first few, and ArtifactPane is given every
 * view's content and draws one. A server sends no markup for those, and a
 * browser that created them under the hydration would ask for elements that
 * are not there. `claimKeys` and `reserveKeys` create what the server did not
 * render outside the hydration, as new elements.
 *
 * A portal's content is never a server's, because a server renders no portal.
 * Solid creates it once the hydration's pass is over, when the portal was
 * created inside the hydration, and during the pass otherwise, which is where
 * a portal inside a member that left the hydration is. So a member's portal
 * creates its content through `afresh`, outside the hydration either way.
 */

/** Every prefix of every key a hydration held when it was first asked, by its registry. */
const PREFIXES = new WeakMap<object, Set<string>>()

/**
 * Whether the server's markup holds an element under `id`: a component's place
 * in the count, which is the start of the key of everything created under it.
 * `true` outside a browser's hydration.
 */
function serverRendered(id: string): boolean {
  const registry = sharedConfig.registry
  if (registry === undefined || registry === null) return true
  let known = PREFIXES.get(registry)
  if (known === undefined) {
    known = new Set()
    for (const key of registry.keys()) {
      for (let length = 0; length <= key.length; length++) known.add(key.slice(0, length))
    }
    PREFIXES.set(registry, known)
  }
  if (known.has(id)) return true
  // A key gathered since (markup that arrived later) is not in the set.
  for (const key of registry.keys()) if (key.startsWith(id)) return true
  return false
}

/**
 * Called as a member is created (`claimSlot`). In a hydration, a member the
 * server rendered nothing for leaves the hydration, so it and everything it
 * creates are new elements. Solid restores the hydration when the member's
 * function returns, as it does after every component.
 */
export function claimKeys(): void {
  const context = sharedConfig.context
  if (context === undefined || context === null || sharedConfig.done === true) return
  if (!serverRendered(context.id)) sharedConfig.context = undefined
}

/**
 * Takes the place in a hydration's count of content a member creates later,
 * and returns what creates the content there, or outside the hydration when
 * the server rendered none of it.
 *
 * The place is used once. Content created again (a caller's list that
 * changes), content created once the hydration's pass is over, and content
 * outside a hydration are created as they are.
 */
export function reserveKeys(): <T>(create: () => T) => T {
  const declared = sharedConfig.context
  if (declared === undefined || declared === null) return (create) => create()
  let reserved: typeof declared | undefined = {
    ...declared,
    id: sharedConfig.getNextContextId(),
    count: 0,
  }
  return (create) => {
    const current = sharedConfig.context
    if (reserved === undefined || current === undefined || current === null) return create()
    sharedConfig.context = serverRendered(reserved.id) ? reserved : undefined
    reserved = undefined
    try {
      return create()
    } finally {
      sharedConfig.context = current
    }
  }
}

/** Creates content outside a hydration, as new elements: a portal's, which no server renders. */
export function afresh<T>(create: () => T): T {
  const current = sharedConfig.context
  if (current === undefined || current === null) return create()
  sharedConfig.context = undefined
  try {
    return create()
  } finally {
    sharedConfig.context = current
  }
}
