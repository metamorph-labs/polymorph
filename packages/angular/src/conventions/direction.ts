import { DestroyRef, inject, signal, type Signal } from '@angular/core'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

/**
 * The document's reading direction, as a signal kept current until the member
 * is destroyed (`readDirection` in `@polymorph/engine` says where it is read).
 * Call it in an injection context. A member passes it to its machine, which
 * otherwise writes `dir="ltr"` on the member's root. It is `ltr` where there
 * is no document, as on a server render.
 */
export function useDirection(): Signal<ReadingDirection> {
  const direction = signal<ReadingDirection>(readDirection())
  const release = watchDirection(() => direction.set(readDirection()))
  inject(DestroyRef).onDestroy(release)
  return direction.asReadonly()
}
