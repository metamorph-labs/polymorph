import { parseAbsoluteToLocal } from '@internationalized/date'

import { timeDigits, timeWords } from './time-text'

/**
 * Countdown's time (`design/components/countdown.md`): the moment it counts
 * to, the whole seconds left, and the digits and the words it writes. Every
 * framework's Countdown calls these, so the rounding, the digits, the spoken
 * words and the marks are decided once. The clock that moves every Countdown
 * on a page is `countdown-clock.ts`, which needs a browser.
 *
 * The time left is always read from the clock (`Date.now()`) and never
 * counted down by subtraction, so a late timer, a throttled background tab or
 * a changed system clock cannot make it drift.
 */

/** `2026-08-04`: a calendar date, which has no time of day to count to. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const SECOND_MS = 1000

/**
 * The marks, in seconds left, at which a Countdown that announces says the
 * time left. One minute leaves more than the 20 seconds WCAG 2.2.1 asks a
 * warning to leave for extending a limit; ten seconds is the last notice.
 */
export const COUNTDOWN_MARKS: readonly number[] = [60, 10]

/**
 * The moment `until` names, in epoch milliseconds, or `null` when it names
 * none. `until` is an ISO-8601 instant: a full timestamp keeps its offset, and
 * one written without an offset is read by the platform's parser, as
 * RelativeTime reads its value. A date-only string is a calendar date, which
 * has no time of day, so it is not a moment to count to.
 */
export function countdownMoment(until: string): number | null {
  if (DATE_ONLY.test(until)) return null
  try {
    return parseAbsoluteToLocal(until).toDate().getTime()
  } catch {
    const at = new Date(until).getTime()
    return Number.isNaN(at) ? null : at
  }
}

/**
 * Whole seconds from `now` to `moment`, rounded up, and never below zero. A
 * countdown shows `0:01` through its last second and `0:00` exactly when the
 * moment is reached, so the count is the ceiling of the time left.
 */
export function countdownLeft(moment: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((moment - now) / SECOND_MS))
}

/** Seconds as whole seconds. Fractions and negatives are dropped. */
function whole(seconds: number): number {
  return Math.max(0, Math.floor(seconds))
}

/**
 * `299` -> `4:59`, and `3725` -> `1:02:05` from an hour: the time left as a
 * clock, in the locale's numerals. The minutes and seconds after the first
 * field take two digits, so the text keeps its length while it counts. The
 * text is AudioPlayer's clock (`time-text.ts`).
 */
export function countdownClock(seconds: number, locale?: string): string {
  return timeDigits(whole(seconds), locale)
}

/**
 * `299` -> `4 minutes, 59 seconds`: the time left in the locale's words, from
 * `Intl`'s unit names joined as a list of units, so a screen reader says words
 * and not "4 colon 59", and no word comes from the vocabulary. A unit that is
 * zero is left out, and no time at all is `0 seconds`. The words are
 * AudioPlayer's (`time-text.ts`).
 */
export function countdownSpoken(seconds: number, locale?: string): string {
  return timeWords(whole(seconds), locale)
}
