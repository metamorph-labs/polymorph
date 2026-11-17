/**
 * The `syncId` registry (the shared grammar, `docs/charts.md`): synced reading
 * positions across sibling charts.
 *
 * A **module-scope registry with no provider**. The frame cannot be composed,
 * and a provider would add a composition point this tier does not have. It
 * only runs in the browser: the map lives in the page's single module instance,
 * and a member joins it from an effect, so server rendering never touches it.
 *
 * **The broadcast is the x-domain value, never the row index.** Charts in a
 * group need not share rows (one may be daily and one weekly), so a receiver
 * maps the value through its *own* scale to its nearest position, as the
 * crosshair does ("the pointer aims at a date"). `null` clears the group:
 * Escape or blur on any member clears every chart, because a group shares one
 * reading.
 *
 * A member leaves its group when it unmounts: React's `useSyncGroup` calls
 * `leave` from its effect's cleanup, and a described member's join effect
 * releases with `leave`. So the registry holds only mounted members. A member
 * that joins with its element is skipped by a broadcast while that element is
 * out of the document, and stays in its group: a Vue chart inside a
 * deactivated `<KeepAlive>` is detached but not unmounted, and receives again
 * when it is attached again.
 */

type SyncListener = (value: number | null) => void

interface SyncEntry {
  listener: SyncListener
  /** The member's element; a broadcast skips the member while it is out of the document. */
  anchor: { readonly isConnected: boolean } | null
}

const groups = new Map<string, Set<SyncEntry>>()

/** For tests: how many members a group currently has. */
export function syncGroupSize(id: string): number {
  return groups.get(id)?.size ?? 0
}

export interface SyncMember {
  /**
   * Joins the group `id`, leaving the one it was in. An `undefined` id joins
   * nothing, so a member calls this unconditionally and the prop stays
   * optional. `anchor` is the member's element: a broadcast skips the member
   * while the element is out of the document.
   */
  join: (id: string | undefined, anchor?: { readonly isConnected: boolean } | null) => void
  /** Leaves the group, and removes it from the registry when it is empty. */
  leave: () => void
  /**
   * Sends a value to every *other* member of the group. A broadcaster is
   * excluded from its own broadcast, so a group of charts does not echo one
   * reading around.
   */
  broadcast: (value: number | null) => void
}

/** A member of the registry. `onValue` receives every other member's readings. */
export function createSyncMember(onValue: SyncListener): SyncMember {
  let joined: { id: string; entry: SyncEntry } | null = null

  const leave = () => {
    if (joined === null) return
    const members = groups.get(joined.id)
    members?.delete(joined.entry)
    if (members?.size === 0) groups.delete(joined.id)
    joined = null
  }

  return {
    join: (id, anchor = null) => {
      if (
        joined !== null &&
        joined.id === id &&
        joined.entry.anchor === anchor &&
        groups.get(joined.id)?.has(joined.entry) === true
      )
        return
      leave()
      if (id === undefined) return
      const entry: SyncEntry = { listener: (value) => onValue(value), anchor }
      let members = groups.get(id)
      if (!members) groups.set(id, (members = new Set()))
      members.add(entry)
      joined = { id, entry }
    },
    leave,
    broadcast: (value) => {
      if (joined === null) return
      const { id, entry: self } = joined
      for (const entry of [...(groups.get(id) ?? [])]) {
        if (entry === self) continue
        // Skipped, not removed: the member may be attached again, and it leaves through `leave`.
        if (entry.anchor !== null && !entry.anchor.isConnected) continue
        entry.listener(value)
      }
    },
  }
}
