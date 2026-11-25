'use client'

import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

const onServer = (): ReadingDirection => 'ltr'

/**
 * The reading direction of the place a member is in, kept current
 * (`readDirection` in `@polymorph/engine` says where it is read). A member
 * passes it to the substrate primitive it renders, which otherwise writes
 * `dir="ltr"` on the member's root.
 *
 * `root` is the element the member draws outermost in the page. The direction
 * is read from the element around it, because the substrate writes `dir` on
 * the root itself. Until the root is in the document, and without one, it is
 * the document's. It is `ltr` on a server render and while React hydrates, so
 * a hydrated member's first render is the server's; the place is read before
 * the browser paints the mounted member.
 */
export function useDirection(root?: RefObject<Element | null>): ReadingDirection {
  const documentDirection = useSyncExternalStore(watchDirection, readDirection, onServer)
  const [placed, setPlaced] = useState<ReadingDirection | null>(null)
  useLayoutEffect(() => {
    if (root === undefined) return
    const update = () => {
      const around = root.current?.parentElement
      setPlaced(around == null ? null : readDirection(around))
    }
    update()
    return watchDirection(update, true)
  }, [root])
  return placed ?? documentDirection
}
