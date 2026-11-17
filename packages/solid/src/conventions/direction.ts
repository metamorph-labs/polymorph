import { createSignal, getOwner, onCleanup, onMount, sharedConfig, type Accessor } from 'solid-js'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

/**
 * The document's reading direction, kept current while the owner lives
 * (`readDirection` in `@polymorph/engine` says where it is read). A member
 * passes it to its machine, which otherwise writes `dir="ltr"` on the member's
 * root. It is `ltr` on a server render and while the member is being hydrated
 * (`sharedConfig.context` is set), so a hydrated member's first render is the
 * server's; it reads the document once the member has mounted and follows it
 * after.
 */
export function useDirection(): Accessor<ReadingDirection> {
  const [direction, setDirection] = createSignal<ReadingDirection>(
    sharedConfig.context ? 'ltr' : readDirection(),
  )
  let release: (() => void) | undefined
  const update = () => setDirection(readDirection())
  onMount(() => {
    update()
    release = watchDirection(update)
  })
  if (getOwner() !== null) onCleanup(() => release?.())
  return direction
}
