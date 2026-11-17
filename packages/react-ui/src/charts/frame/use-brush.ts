'use client'

import { createBrush, type BrushMachine, type BrushState } from '@polymorph/react'
import {
  useCallback,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react'

import type { Reading } from './use-reading'

/**
 * The brush for a React member: the engine's brush machine (`createBrush`,
 * `@polymorph/engine/charts`), followed through `useSyncExternalStore`. The
 * machine's module states what the brush is for and how its keys and pointer
 * build a range.
 */

export type { BrushState }

export interface UseBrushOptions {
  /** True for a `time`/`linear` x with an `onBrushEnd`; otherwise the brush does nothing. */
  enabled: boolean
  /** The row count; a range built on different data reads as none. */
  count: number
  /** Row positions in px, for snapping the pointer to indexes. */
  positions: readonly (number | null)[]
  reading: Reading
  /** Receives the committed pair unsorted; the member sorts it by its domain and emits it. */
  onCommit: (anchor: number, edge: number) => void
}

export interface BrushControl {
  brush: BrushState | null
  /** The engine's machine, which an agent's `brush` drives with the keys a person presses. */
  machine: BrushMachine
  /** Returns true when the brush handled the key, so the reading must not also handle it. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => boolean
  onPointerDown: (px: number) => void
  onPointerMove: (px: number) => void
  onPointerUp: () => void
  /** Returns true once after a committed drag, because the following click belongs to the drag. */
  consumeClick: () => boolean
  /** Clears an in-progress range on blur; a committed range stays. */
  onBlur: () => void
}

export function useBrush({
  enabled,
  count,
  positions,
  reading,
  onCommit,
}: UseBrushOptions): BrushControl {
  // Created with the first render's options; every commit hands it the current ones,
  // before any handler can run.
  const [machine] = useState(() => createBrush({ enabled, count, positions, onCommit }))
  useLayoutEffect(() => {
    machine.update({ enabled, count, positions, onCommit })
  }, [machine, enabled, count, positions, onCommit])

  const snapshot = useCallback(() => machine.state(), [machine])
  useSyncExternalStore(machine.subscribe, snapshot, snapshot)

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      const handled = machine.key(event.key, event.shiftKey, reading)
      if (handled) event.preventDefault()
      return handled
    },
    [machine, reading],
  )

  return {
    // This render's row count, so a range drawn on other data reads as none in the frame that changes the data.
    brush: machine.state(count),
    machine,
    onKeyDown,
    onPointerDown: machine.pointerDown,
    onPointerMove: machine.pointerMove,
    onPointerUp: machine.pointerUp,
    consumeClick: machine.consumeClick,
    onBlur: machine.blur,
  }
}
