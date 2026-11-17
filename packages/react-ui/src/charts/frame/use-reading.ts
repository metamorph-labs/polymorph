'use client'

import {
  createReading,
  readingView,
  type ReadingOptions,
  type ReadingPosition,
} from '@polymorph/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react'

/**
 * The reading position for a React member: the engine's reading machine
 * (`createReading`, `@polymorph/engine/charts`), which holds the position and
 * the keys that move it, followed through `useSyncExternalStore`. The machine's
 * module states the interaction rules it enforces.
 */

export type { ReadingPosition }

export interface Reading extends ReadingPosition {
  /** Whether anything is being read; if so, the other marks dim and the readout shows. */
  active: boolean
  moveTo: (index: number | null, series?: number | null) => void
  clear: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /**
   * The position as of the last input, updated synchronously before render.
   * Event handlers read this; render code reads the state (see the machine's
   * `now`).
   */
  now: () => ReadingPosition
}

export interface UseReadingOptions extends ReadingOptions {
  /**
   * Called with the new index each time the position's *index* changes; this
   * is how `syncId` hooks in. Every local change goes through the machine, so a
   * listener hears each move once, not once per pointer frame. A member
   * applying a *received* reading suppresses its own listener during the
   * apply, so a group of charts does not echo one reading back and forth.
   */
  onRead?: (index: number | null) => void
}

export function useReading({
  count,
  seriesCount = 1,
  walkSeries = false,
  seriesStart = null,
  onRead,
  wrap = false,
}: UseReadingOptions): Reading {
  const [machine] = useState(() =>
    createReading({ count, seriesCount, walkSeries, seriesStart, wrap }),
  )
  // The keys read the counts of the latest commit, which is the frame the reader sees.
  useLayoutEffect(() => {
    machine.update({ count, seriesCount, walkSeries, seriesStart, wrap })
  }, [machine, count, seriesCount, walkSeries, seriesStart, wrap])

  const position = useSyncExternalStore(machine.subscribe, machine.now, machine.now)

  const onReadRef = useRef(onRead)
  useEffect(() => {
    // Updated in an effect, not during render. The listener is only called
    // from event handlers, which run after the commit.
    onReadRef.current = onRead
  })
  useEffect(
    () =>
      machine.subscribe((now, was) => {
        if (now.index !== was.index) onReadRef.current?.(now.index)
      }),
    [machine],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (machine.key(event.key)) event.preventDefault()
    },
    [machine],
  )

  return {
    ...readingView(position, count, seriesCount),
    moveTo: machine.moveTo,
    clear: machine.clear,
    onKeyDown,
    now: machine.now,
  }
}
