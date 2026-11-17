import { nearestIndex } from './geometry'
import type { ReadingPosition } from './reading'

/**
 * The brush (the interaction rules, `docs/charts.md`). Its only output is a
 * committed range.
 *
 * **The brush is an input device.** It reports a committed range to app state
 * (`onBrushEnd`) and never filters the chart itself; `FilterBar` owns and
 * displays the range. So the machine holds very little: an anchor, a moving
 * edge, and whether the pair is committed.
 *
 * The range is in **index space**. Both edges snap to data positions, as the
 * crosshair does ("the pointer aims at a date, never at a 2px line"). So the
 * keyboard and the pointer build the same range, and the committed values are
 * the data's own, not values inverted from pixels at arbitrary precision. The
 * member maps the pair through its rows to emit domain values and paints it
 * through its positions, so a resize repaints the same range.
 *
 * Keyboard: **Shift+Arrows extend from the reading position, and Enter
 * commits**. Commit is the only time `onCommit` runs. **Escape has two
 * stages**: the member routes keys here first, so an Escape with a range on
 * screen clears the range and does not reach the reading. The next Escape
 * clears the reading.
 *
 * The machine has no framework in it: React's `useBrush` and every described
 * member drive the same one, and follow it through `subscribe`.
 */

export interface BrushState {
  /** Where the range started, as a row index. */
  anchor: number
  /** The moving edge, as a row index, on either side of the anchor. */
  edge: number
  /** True once committed: the range stays painted and belongs to the app. */
  committed: boolean
}

export interface BrushOptions {
  /** True for a `time`/`linear` x with an `onBrushEnd`; otherwise the brush does nothing. */
  enabled: boolean
  /** The row count; a range built on different data reads as none. */
  count: number
  /** Row positions in px, for snapping the pointer to indexes. */
  positions: readonly (number | null)[]
  /** Receives the committed pair unsorted; the member sorts it by its domain and emits it. */
  onCommit: (anchor: number, edge: number) => void
}

/** What the brush reads of the reading position and moves: the reading machine, or a member's. */
export interface BrushReading {
  now: () => ReadingPosition
  moveTo: (index: number | null) => void
}

export interface BrushMachine {
  /**
   * The range on screen, or `null`. A range built on data of another row count
   * reads as none: `count` is the rows a render draws, which a member passes
   * when the data may have changed since its last `update`.
   */
  state: (count?: number) => BrushState | null
  /** Sets what the brush reads: whether it is on, the rows, their positions and the commit. */
  update: (options: BrushOptions) => void
  /**
   * Applies a key, before the reading does. Returns `true` when the brush
   * handled it, so the caller prevents its default and the reading must not
   * also handle it.
   */
  key: (key: string, shift: boolean, reading: BrushReading) => boolean
  pointerDown: (px: number) => void
  pointerMove: (px: number) => void
  pointerUp: () => void
  /** Returns true once after a committed drag, because the following click belongs to the drag. */
  consumeClick: () => boolean
  /** Clears an in-progress range on blur; a committed range stays. */
  blur: () => void
  /** Follows every change of `state()`. Returns the function that stops following. */
  subscribe: (listener: () => void) => () => void
}

/**
 * The stored form records the row count it was built against. Row indexes do
 * not carry over to changed data, so a range from other data reads as no
 * range. This is derived when read, not cleared when the data changes, so no
 * frame paints a stale range.
 */
interface StoredBrush extends BrushState {
  of: number
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

export function createBrush(initial: BrushOptions): BrushMachine {
  let options = initial
  let stored: StoredBrush | null = null
  const listeners = new Set<() => void>()

  /** A stored range is valid only for the data it was drawn on. */
  const live = (count: number = options.count): StoredBrush | null =>
    stored !== null && stored.of === count ? stored : null

  const apply = (next: BrushState | null) => {
    stored = next === null ? null : { ...next, of: options.count }
    for (const listener of [...listeners]) listener()
  }

  /** A pointer that is down but has not yet moved off its anchor row. */
  let pending: number | null = null
  let dragging = false
  let suppressClick = false

  return {
    // The stored object itself, so the same range reads as the same value until it changes.
    state: (count) => live(count),
    update: (next) => {
      options = next
    },
    key: (key, shift, reading) => {
      const state = live()
      if (key === 'Escape' && state !== null) {
        // Stage one: with a range on screen, Escape clears the range.
        apply(null)
        return true
      }
      const { enabled, count } = options
      if (!enabled || count === 0) return false

      if (shift && (key === 'ArrowRight' || key === 'ArrowLeft')) {
        const delta = key === 'ArrowRight' ? 1 : -1
        // The live position, not a drawn one. A Shift+Arrow right after a plain
        // arrow must extend from where the reader just moved.
        const at = reading.now().index
        // With no reading, the first press lands on an end, as the reading's
        // first arrow does. The anchor is the reader's position.
        const next = at === null ? (delta > 0 ? 0 : count - 1) : clamp(at + delta, count - 1)
        const anchor = state !== null && !state.committed ? state.anchor : (at ?? next)
        apply({ anchor, edge: next, committed: false })
        reading.moveTo(next)
        return true
      }

      if (key === 'Enter' && state !== null && !state.committed && state.anchor !== state.edge) {
        options.onCommit(state.anchor, state.edge)
        apply({ ...state, committed: true })
        return true
      }

      return false
    },
    pointerDown: (px) => {
      if (!options.enabled) return
      const at = nearestIndex(options.positions, px)
      pending = at === -1 ? null : at
      dragging = false
    },
    pointerMove: (px) => {
      const anchor = pending
      // A pointer pressed on different data sets no anchor here.
      if (anchor === null || anchor >= options.count) return
      const edge = nearestIndex(options.positions, px)
      if (edge === -1) return
      // A drag starts when the pointer crosses to another row. Until then the
      // gesture is a click and paints nothing.
      if (!dragging && edge === anchor) return
      dragging = true
      // A move within the same row changes nothing, so it stores and tells nothing.
      const state = live()
      if (state !== null && state.anchor === anchor && state.edge === edge && !state.committed) {
        return
      }
      apply({ anchor, edge, committed: false })
    },
    pointerUp: () => {
      const state = live()
      if (dragging && state !== null && !state.committed) {
        if (state.anchor !== state.edge) {
          // The commit: the only time the range is reported out of the chart.
          options.onCommit(state.anchor, state.edge)
          apply({ ...state, committed: true })
          suppressClick = true
        } else {
          apply(null)
        }
      }
      pending = null
      dragging = false
    },
    consumeClick: () => {
      const suppressed = suppressClick
      suppressClick = false
      return suppressed
    },
    blur: () => {
      pending = null
      dragging = false
      const state = live()
      if (state !== null && !state.committed) apply(null)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
