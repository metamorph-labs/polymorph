import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

import { isHydrating } from './hydration'

/**
 * The document's reading direction, kept current (`readDirection` in
 * `@polymorph/engine` says where it is read). A member passes it to its
 * machine, which otherwise writes `dir="ltr"` on the member's root. It is
 * `ltr` on a server render and while the member is being hydrated, so a
 * hydrated member's first render is the server's; it reads the document once
 * the member has mounted and follows it after.
 */
export function useDirection(): ShallowRef<ReadingDirection> {
  const direction = shallowRef<ReadingDirection>(isHydrating() ? 'ltr' : readDirection())
  let release: (() => void) | undefined
  const update = () => {
    direction.value = readDirection()
  }
  onMounted(() => {
    update()
    release = watchDirection(update)
  })
  onBeforeUnmount(() => release?.())
  return direction
}
