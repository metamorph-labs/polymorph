import { createSignal, getOwner, onCleanup, onMount, sharedConfig, type Accessor } from 'solid-js'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

/**
 * The reading direction of the place a member is in, kept current while the
 * owner lives (`readDirection` in `@polymorph/engine` says where it is read).
 * A member passes it to its machine, which otherwise writes `dir="ltr"` on the
 * member's root. `within` is an element the member draws in the page; without
 * one, or until it is in the document, the direction is the document's. It is
 * `ltr` on a server render and while the member is being hydrated
 * (`sharedConfig.context` is set), so a hydrated member's first render is the
 * server's; it reads its place once the member has mounted and follows it
 * after.
 */
export function useDirection(
  within?: () => Element | null | undefined,
): Accessor<ReadingDirection> {
  const [direction, setDirection] = createSignal<ReadingDirection>(
    sharedConfig.context ? 'ltr' : readDirection(),
  )
  let release: (() => void) | undefined
  const update = () => setDirection(readDirection(within?.()))
  onMount(() => {
    update()
    release = watchDirection(update, within !== undefined)
  })
  if (getOwner() !== null) onCleanup(() => release?.())
  return direction
}
