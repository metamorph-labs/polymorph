import { createSubscriber } from 'svelte/reactivity'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

/**
 * The document's reading direction, kept current (`current`; `readDirection`
 * in `@polymorph/engine` says where it is read). A member passes it to its
 * machine, which otherwise writes `dir="ltr"` on the member's root. It is
 * `ltr` where there is no document, as on a server render.
 */
export function useDirection(): { readonly current: ReadingDirection } {
  const subscribe = createSubscriber(watchDirection)
  return {
    get current() {
      subscribe()
      return readDirection()
    },
  }
}
