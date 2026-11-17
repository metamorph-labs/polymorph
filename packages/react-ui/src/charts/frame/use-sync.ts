'use client'

import { createSyncMember, type SyncMember } from '@polymorph/react'
import { useCallback, useEffect, useRef } from 'react'

/**
 * The `syncId` registry (the shared grammar, `docs/charts.md`), for a React
 * member: the engine's `createSyncMember` (`@polymorph/engine/charts`), joined
 * from an effect and left when the member unmounts, so server rendering never
 * touches the registry and unmounting cannot leak a listener.
 */

export { syncGroupSize } from '@polymorph/react'

/**
 * Joins a sync group and returns the broadcast function.
 *
 * `onValue` receives every *other* member's readings. A broadcaster is
 * excluded from its own broadcast, so a group of charts does not echo one
 * reading around. An `undefined` id joins nothing and broadcasts nowhere, so a
 * member calls this unconditionally and the prop stays optional.
 */
export function useSyncGroup(
  id: string | undefined,
  onValue: (value: number | null) => void,
): (value: number | null) => void {
  const handler = useRef(onValue)
  useEffect(() => {
    // Updated in an effect, not during render. A broadcast only arrives from
    // another member's event handler, after the commit.
    handler.current = onValue
  })

  const member = useRef<SyncMember | null>(null)
  useEffect(() => {
    const joined = createSyncMember((value) => handler.current(value))
    joined.join(id)
    member.current = joined
    return () => {
      joined.leave()
      member.current = null
    }
  }, [id])

  return useCallback((value: number | null) => member.current?.broadcast(value), [])
}
