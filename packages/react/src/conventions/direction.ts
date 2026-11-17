'use client'

import { useSyncExternalStore } from 'react'

import { readDirection, watchDirection, type ReadingDirection } from '@polymorph/engine'

const onServer = (): ReadingDirection => 'ltr'

/**
 * The document's reading direction, kept current (`readDirection` in
 * `@polymorph/engine` says where it is read). A member passes it to the
 * substrate primitive it renders, which otherwise writes `dir="ltr"` on the
 * member's root. It is `ltr` on a server render and while React hydrates, so a
 * hydrated member's first render is the server's.
 */
export function useDirection(): ReadingDirection {
  return useSyncExternalStore(watchDirection, readDirection, onServer)
}
