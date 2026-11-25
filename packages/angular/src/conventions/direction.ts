import { afterNextRender, DestroyRef, inject, signal, type Signal } from '@angular/core'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

/**
 * The reading direction of the place a member is in, as a signal kept current
 * until the member is destroyed (`readDirection` in `@polymorph/engine` says
 * where it is read). Call it in an injection context. A member passes it to
 * its machine, which otherwise writes `dir="ltr"` on the member's root.
 * `within` is an element the member draws in the page; without one, or until
 * it is in the document, the direction is the document's. It is `ltr` where
 * there is no document, as on a server render.
 */
export function useDirection(within?: () => Element | null | undefined): Signal<ReadingDirection> {
  const direction = signal<ReadingDirection>(readDirection())
  const update = () => direction.set(readDirection(within?.()))
  const release = watchDirection(update, within !== undefined)
  // The member's elements exist once it has rendered.
  if (within !== undefined) afterNextRender(update)
  inject(DestroyRef).onDestroy(release)
  return direction.asReadonly()
}
