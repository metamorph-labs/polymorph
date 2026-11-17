/**
 * The reading position: one state, driven by pointer *and* keyboard (the
 * interaction rules, `docs/charts.md`).
 *
 * The rule it enforces: **the same details on focus as on hover, never
 * hover-only.** Every value reachable by pointer must be reachable by keyboard.
 * So there is one position, two ways to move it, and one readout; the tooltip
 * and the live region both read from here.
 *
 * The plot is **one focus stop**, not one per mark. Forty tab stops to cross a
 * month of data would be a burden. Readers use arrow keys inside a graphic, and
 * `role="img"` with a name tells them there is something to arrow through.
 *
 * The machine has no framework in it. A member creates one per instance, tells
 * it the counts its keys walk (`update`), moves it from its handlers, and
 * follows it through `subscribe`. React's `useReading` and every described
 * member read the same machine, so the keys do the same thing in each.
 */

export interface ReadingPosition {
  /** Index along the x axis, or `null` when nothing is being read. */
  index: number | null
  /**
   * Which series within the position (bars walk it with Up/Down), or `null`
   * when the whole position is being read and no series is selected.
   */
  series: number | null
}

/** The position as a render shows it: clamped to the counts, with whether anything is read. */
export interface ReadingView extends ReadingPosition {
  /** Whether anything is being read; if so, the other marks dim and the readout shows. */
  active: boolean
}

export interface ReadingOptions {
  /** How many positions along x. */
  count: number
  /** How many series at each position. `1` disables the Up/Down walk. */
  seriesCount?: number
  /**
   * Whether Up/Down walk the series or do nothing. A line chart's readout lists
   * every series at the position, so there is nothing to walk *to*; the
   * crosshair is the whole reading (the interaction rules, `docs/charts.md`).
   */
  walkSeries?: boolean
  /**
   * The series coordinate before Up/Down moves it. Bars leave it `null`: the
   * reading is the whole band until a series is selected, and the first
   * Up/Down lands on an end, as the first Left/Right does. The heatmap sets it
   * to `0`, because its "series" is a second axis. A cell always has a row, and
   * starting from `null` would waste the first press on arriving instead of
   * moving.
   */
  seriesStart?: number | null
  /**
   * Whether Left/Right wrap past the ends. An axis has ends and the walk stops
   * at them, which is the default for cartesian charts. A radar's positions
   * form a cycle: its spec walks axes *around* the polygon, and clockwise past
   * the last spoke is the first (`radar-chart.md`). Home and End keep their
   * meanings, because the cycle still has a first axis, the one at 12 o'clock.
   */
  wrap?: boolean
}

/**
 * Called after every change, with the new position and the one before it. A
 * listener that cares only about the index (`syncId`'s broadcast) compares the
 * two, so it hears each move once, not once per pointer frame.
 */
export type ReadingListener = (now: ReadingPosition, was: ReadingPosition) => void

export interface ReadingMachine {
  /**
   * The position as of the last input, updated synchronously.
   *
   * Activation (`onSelect`, the brush's anchor) happens in event handlers, and
   * a renderer may draw a pointer move later than it happens. A click that
   * arrives before that draw would read the previous drawing's position and
   * select the wrong mark. Event handlers read this; a render reads what its
   * listener stored, through `readingView`.
   */
  now: () => ReadingPosition
  /** Sets the counts and the walk the keys read. The position is clamped when it is read, not here. */
  update: (options: ReadingOptions) => void
  /** Moves to a position; `series` defaults to the start coordinate. A move to the same position does nothing. */
  moveTo: (index: number | null, series?: number | null) => void
  /** Nothing is read. */
  clear: () => void
  /**
   * Applies a key. Returns `true` when the key belongs to the reading, so the
   * caller prevents its default (an arrow would otherwise scroll the page).
   */
  key: (key: string) => boolean
  /** Follows every change. Returns the function that stops following. */
  subscribe: (listener: ReadingListener) => () => void
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))

/** The position at rest: nothing read, the series at its start coordinate. */
export function readingRest(seriesStart: number | null = null): ReadingPosition {
  return { index: null, series: seriesStart }
}

/**
 * The position as a render shows it. The data may have shrunk since the
 * position was set, so the index and the series are clamped to the counts a
 * render has now.
 */
export function readingView(
  position: ReadingPosition,
  count: number,
  seriesCount = 1,
): ReadingView {
  return {
    index: position.index === null ? null : clamp(position.index, Math.max(0, count - 1)),
    series: position.series === null ? null : clamp(position.series, Math.max(0, seriesCount - 1)),
    active: position.index !== null && count > 0,
  }
}

export function createReading(initial: ReadingOptions): ReadingMachine {
  let options: Required<ReadingOptions> = {
    seriesCount: 1,
    walkSeries: false,
    seriesStart: null,
    wrap: false,
    ...initial,
  }
  let current: ReadingPosition = readingRest(options.seriesStart)
  const listeners = new Set<ReadingListener>()

  /*
   * Every change goes through `apply`, which compares against the current
   * position. So a move to the same position does nothing (no listener call,
   * no redraw), and `pointermove` at frame rate stays cheap. That matters
   * because a LineChart redraw walks every series to rebuild its paths.
   */
  const apply = (next: ReadingPosition) => {
    const was = current
    if (was.index === next.index && was.series === next.series) return
    current = next
    for (const listener of [...listeners]) listener(next, was)
  }

  const moveTo = (index: number | null, series: number | null = options.seriesStart) => {
    apply({ index, series })
  }

  const clear = () => {
    if (current.index === null) return
    apply(readingRest(options.seriesStart))
  }

  const key = (pressed: string): boolean => {
    const { count, seriesCount, walkSeries, wrap } = options
    if (count === 0) return false
    const was = current
    const step = (delta: number) => {
      // The first arrow lands on an end, not in the middle, because a reader
      // arriving from the left expects the left-most point.
      apply({
        ...was,
        index:
          was.index === null
            ? delta > 0
              ? 0
              : count - 1
            : wrap
              ? (((was.index + delta) % count) + count) % count
              : clamp(was.index + delta, count - 1),
      })
      return true
    }

    switch (pressed) {
      case 'ArrowRight':
        return step(1)
      case 'ArrowLeft':
        return step(-1)
      case 'Home':
        apply({ ...was, index: 0 })
        return true
      case 'End':
        apply({ ...was, index: count - 1 })
        return true
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!walkSeries || seriesCount <= 1 || was.index === null) return false
        const delta = pressed === 'ArrowUp' ? -1 : 1
        // From rest, the first press lands on an end (Down on the first
        // series, Up on the last), as the first Left/Right does.
        apply({
          ...was,
          series:
            was.series === null
              ? delta > 0
                ? 0
                : seriesCount - 1
              : clamp(was.series + delta, seriesCount - 1),
        })
        return true
      }
      case 'Escape':
        // Escape dismisses the readout, which could otherwise cover what the
        // reader wants to see.
        if (was.index === null) return false
        clear()
        return true
      default:
        return false
    }
  }

  return {
    now: () => current,
    update: (next) => {
      options = { seriesCount: 1, walkSeries: false, seriesStart: null, wrap: false, ...next }
    },
    moveTo,
    clear,
    key,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
