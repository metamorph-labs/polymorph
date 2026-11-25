import { onBeforeUnmount, onMounted, shallowRef, watch, type ShallowRef } from 'vue'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

import { isHydrating } from './hydration'

/**
 * The reading direction of the place a member is in, kept current
 * (`readDirection` in `@polymorph/engine` says where it is read). A member
 * passes it to its machine, which otherwise writes `dir="ltr"` on the member's
 * root. `within` is an element the member draws in the page; without one, or
 * until it is in the document, the direction is the document's. It is `ltr`
 * on a server render and while the member is being hydrated, so a hydrated
 * member's first render is the server's; it reads its place once the member
 * has mounted and follows it after. A place drawn in a branch that appears
 * later (Menubar's bar, which the phone form does not draw) is read when it
 * appears.
 */
export function useDirection(
  within?: () => Element | null | undefined,
): ShallowRef<ReadingDirection> {
  const direction = shallowRef<ReadingDirection>(isHydrating() ? 'ltr' : readDirection())
  let release: (() => void) | undefined
  const update = () => {
    direction.value = readDirection(within?.())
  }
  onMounted(() => {
    update()
    release = watchDirection(update, within !== undefined)
  })
  if (within !== undefined) watch(within, update, { flush: 'post' })
  onBeforeUnmount(() => release?.())
  return direction
}
