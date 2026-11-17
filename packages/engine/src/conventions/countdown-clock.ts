'use client'

import { COUNTDOWN_MARKS, countdownLeft } from './countdown'

/*
 * The clock that moves every Countdown on a page (`design/components/countdown.md`).
 * It reads the document's visibility, so it is a module of its own, apart
 * from the time and the words, which a server renders.
 */

const SECOND_MS = 1000

/**
 * Called with the whole seconds left each time they change, and once when
 * the following starts. `marked` is true when the change passed one of
 * `COUNTDOWN_MARKS`. It is never true on the first call, because a count that
 * starts below a mark has not reached it, and never true at `0`, because the
 * end is not a mark.
 */
export type CountdownListener = (left: number, marked: boolean) => void

/** The part of a document the clock reads: whether it is hidden, and when that changes. */
export interface CountdownDocument {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface CountdownClock {
  /**
   * Follows the time left until `moment`, in epoch milliseconds. The listener
   * is called at once with the time left, then each time it changes, and with
   * `0` once when the moment is reached. Returns the function that stops it.
   */
  follow(moment: number, listener: CountdownListener): () => void
}

interface Follower {
  readonly moment: number
  readonly listener: CountdownListener
  left: number
}

/**
 * A clock for every Countdown on one page. It holds one timer, whatever the
 * number of Countdowns. The timer wakes when the time left of a Countdown
 * reaches its next whole second, so a Countdown changes on the second of its
 * own time left and two that count to one moment change together. At each
 * wake every Countdown reads the clock again.
 *
 * While the document is hidden, a browser throttles timers, and nobody sees
 * the seconds. The clock then wakes only when a Countdown reaches its moment,
 * so the end is still reported, and when the document is shown again every
 * Countdown reads the clock at once and the seconds resume.
 *
 * `document` is absent on a server and in a test without one; the clock then
 * treats the page as shown.
 */
export function createCountdownClock(document?: CountdownDocument): CountdownClock {
  const followers = new Set<Follower>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const hidden = (): boolean => document?.hidden === true

  /** Gives each follower whose time left changed its new time left. */
  const read = (): void => {
    const now = Date.now()
    for (const follower of [...followers]) {
      // A listener may stop another follower before its turn.
      if (!followers.has(follower)) continue
      const left = countdownLeft(follower.moment, now)
      if (left === follower.left) continue
      // The end is not a mark: what reaching the moment means is the application's to say.
      const marked =
        left > 0 && COUNTDOWN_MARKS.some((mark) => follower.left > mark && left <= mark)
      follower.left = left
      follower.listener(left, marked)
    }
  }

  /** Sets the one timer for the nearest change, or none when nothing is left to count. */
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    const now = Date.now()
    let wait = Infinity
    for (const follower of followers) {
      if (follower.left === 0) continue
      const remaining = follower.moment - now
      // The next whole second of this follower's time left, or only its end while hidden. A
      // moment the clock passed since the follower last read it is read at once.
      const next =
        remaining <= 0
          ? 0
          : hidden()
            ? remaining
            : remaining - (Math.ceil(remaining / SECOND_MS) - 1) * SECOND_MS
      wait = Math.min(wait, next)
    }
    if (wait === Infinity) return
    timer = setTimeout(
      () => {
        timer = undefined
        wake()
      },
      Math.max(0, wait),
    )
  }

  function wake(): void {
    read()
    schedule()
  }

  // Shown again: every follower reads the clock now, and the seconds resume. Hidden: the timer
  // is set again for the ends alone.
  const onVisibility = (): void => wake()

  return {
    follow(moment, listener) {
      const follower: Follower = { moment, listener, left: countdownLeft(moment) }
      if (followers.size === 0) document?.addEventListener('visibilitychange', onVisibility)
      followers.add(follower)
      schedule()
      listener(follower.left, false)
      return () => {
        if (!followers.delete(follower)) return
        if (followers.size === 0) {
          document?.removeEventListener('visibilitychange', onVisibility)
          if (timer !== undefined) clearTimeout(timer)
          timer = undefined
        } else {
          schedule()
        }
      }
    },
  }
}

let page: CountdownClock | undefined

/**
 * Follows the time left until `moment` on the page's one clock
 * (`createCountdownClock`), which every Countdown shares. Call it once the
 * member has mounted: a server render reads `countdownLeft` and follows
 * nothing.
 */
export function followCountdown(moment: number, listener: CountdownListener): () => void {
  page ??= createCountdownClock(typeof document === 'undefined' ? undefined : document)
  return page.follow(moment, listener)
}
