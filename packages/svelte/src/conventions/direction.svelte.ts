import { createSubscriber } from 'svelte/reactivity'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

/**
 * The reading direction of the place a member is in, kept current (`current`;
 * `readDirection` in `@polymorph/engine` says where it is read). A member
 * passes it to its machine, which otherwise writes `dir="ltr"` on the member's
 * root. `within` is an element the member draws in the page; without one, or
 * until it is in the document, the direction is the document's. It is `ltr`
 * where there is no document, as on a server render.
 */
export function useDirection(within?: () => Element | null | undefined): {
  readonly current: ReadingDirection
} {
  const subscribe = createSubscriber((update) => watchDirection(update, within !== undefined))
  return {
    get current() {
      subscribe()
      return readDirection(within?.())
    },
  }
}
