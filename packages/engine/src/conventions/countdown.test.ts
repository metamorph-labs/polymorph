import { afterEach, describe, expect, it, vi } from 'vitest'

import { countdownClock, countdownLeft, countdownMoment, countdownSpoken } from './countdown'
import { createCountdownClock, type CountdownDocument } from './countdown-clock'

/**
 * Countdown's time, against a pinned clock.
 *
 * The moment, the whole seconds left, the digits and the words, and the one
 * clock every Countdown on a page shares: its single timer, its wake on the
 * second of each time left, its marks, its end, and its pause while the
 * document is hidden. Every test pins "now" with fake timers, because a real
 * clock makes failures depend on how loaded the machine is. The members'
 * tests cover the element around the time (`@polymorph/conformance/countdown`).
 */

afterEach(() => {
  vi.useRealTimers()
})

const NOW = Date.UTC(2026, 7, 7, 12, 0, 0)

function pin() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
}

/** A document whose visibility a test sets. */
function page(): CountdownDocument & { show(shown: boolean): void; listeners(): number } {
  const target = new EventTarget()
  let hidden = false
  let listeners = 0
  return {
    get hidden() {
      return hidden
    },
    addEventListener(type, listener) {
      listeners += 1
      target.addEventListener(type, listener)
    },
    removeEventListener(type, listener) {
      listeners -= 1
      target.removeEventListener(type, listener)
    },
    show(shown) {
      hidden = !shown
      target.dispatchEvent(new Event('visibilitychange'))
    },
    listeners: () => listeners,
  }
}

/** Every call a listener received, as `[left, marked]`. */
function recorder() {
  const calls: [number, boolean][] = []
  return { calls, listener: (left: number, marked: boolean) => void calls.push([left, marked]) }
}

describe('the moment', () => {
  it('reads an ISO-8601 instant with its offset', () => {
    expect(countdownMoment('2026-08-07T12:05:00Z')).toBe(Date.UTC(2026, 7, 7, 12, 5, 0))
    expect(countdownMoment('2026-08-07T14:05:00+02:00')).toBe(Date.UTC(2026, 7, 7, 12, 5, 0))
  })

  it('reads an instant written without an offset with the platform’s parser', () => {
    expect(countdownMoment('2026-08-07T12:05:00')).toBe(new Date('2026-08-07T12:05:00').getTime())
  })

  it('names no moment for a calendar date or a value that is not a moment', () => {
    expect(countdownMoment('2026-08-07')).toBeNull()
    expect(countdownMoment('not-a-moment')).toBeNull()
    expect(countdownMoment('')).toBeNull()
  })
})

describe('the time left', () => {
  it('is whole seconds, rounded up, so 0:00 comes exactly at the moment', () => {
    expect(countdownLeft(NOW + 299_000, NOW)).toBe(299)
    expect(countdownLeft(NOW + 298_001, NOW)).toBe(299)
    expect(countdownLeft(NOW + 1, NOW)).toBe(1)
    expect(countdownLeft(NOW, NOW)).toBe(0)
  })

  it('never goes below zero', () => {
    expect(countdownLeft(NOW - 5_000, NOW)).toBe(0)
  })

  it('reads the clock when no time is given', () => {
    pin()
    expect(countdownLeft(NOW + 10_000)).toBe(10)
  })
})

describe('the digits', () => {
  it('writes m:ss under an hour and h:mm:ss from an hour', () => {
    expect(countdownClock(299, 'en-US')).toBe('4:59')
    expect(countdownClock(65, 'en-US')).toBe('1:05')
    expect(countdownClock(9, 'en-US')).toBe('0:09')
    expect(countdownClock(0, 'en-US')).toBe('0:00')
    expect(countdownClock(3600, 'en-US')).toBe('1:00:00')
    expect(countdownClock(3725, 'en-US')).toBe('1:02:05')
    expect(countdownClock(36_000 + 59, 'en-US')).toBe('10:00:59')
  })

  it('writes the locale’s numerals, with no grouping', () => {
    expect(countdownClock(299, 'ar-EG')).toBe('٤:٥٩')
    expect(countdownClock(3725, 'hi-IN-u-nu-deva')).toBe('१:०२:०५')
    expect(countdownClock(1000 * 3600, 'en-US')).toBe('1000:00:00')
  })

  it('drops fractions and negatives', () => {
    expect(countdownClock(4.9, 'en-US')).toBe('0:04')
    expect(countdownClock(-3, 'en-US')).toBe('0:00')
  })
})

describe('the words', () => {
  it('says the time left in the locale’s unit words, leaving out a unit that is zero', () => {
    expect(countdownSpoken(299, 'en-US')).toBe('4 minutes, 59 seconds')
    expect(countdownSpoken(60, 'en-US')).toBe('1 minute')
    expect(countdownSpoken(3725, 'en-US')).toBe('1 hour, 2 minutes, 5 seconds')
    expect(countdownSpoken(1, 'en-US')).toBe('1 second')
  })

  it('says no time at all as zero seconds', () => {
    expect(countdownSpoken(0, 'en-US')).toBe('0 seconds')
  })

  it('says the words of the locale it is given', () => {
    // The joining word is the engine's list data, which differs between engines ("," or "und").
    const spoken = countdownSpoken(299, 'de')
    expect(spoken.startsWith('4 Minuten')).toBe(true)
    expect(spoken.endsWith('59 Sekunden')).toBe(true)
  })
})

describe('the clock', () => {
  it('calls a listener at once with the time left, without a mark', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 65_000, listener)
    expect(calls).toEqual([[65, false]])
    stop()
  })

  it('wakes on the second of the time left, not a second after it started', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 5_500, listener)
    expect(calls).toEqual([[6, false]])

    vi.advanceTimersByTime(499)
    expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(calls.at(-1)).toEqual([5, false])
    vi.advanceTimersByTime(999)
    expect(calls).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(calls.at(-1)).toEqual([4, false])
    stop()
  })

  it('holds one timer for every countdown it follows', () => {
    pin()
    const clock = createCountdownClock()
    const stops = [NOW + 5_000, NOW + 5_250, NOW + 90_000].map((moment) =>
      clock.follow(moment, () => {}),
    )
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(3_000)
    expect(vi.getTimerCount()).toBe(1)
    for (const stop of stops) stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('changes two countdowns to one moment at the same wake', () => {
    pin()
    const clock = createCountdownClock()
    const first = recorder()
    const stopFirst = clock.follow(NOW + 3_000, first.listener)
    vi.advanceTimersByTime(400)
    // The second starts later, and still changes on the same second as the first.
    const second = recorder()
    const stopSecond = clock.follow(NOW + 3_000, second.listener)
    expect(second.calls).toEqual([[3, false]])

    vi.advanceTimersByTime(600)
    expect(first.calls.at(-1)).toEqual([2, false])
    expect(second.calls.at(-1)).toEqual([2, false])
    stopFirst()
    stopSecond()
  })

  it('reads the clock at each wake and never counts by subtraction', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 10_000, listener)
    // The system clock jumps forward between two wakes.
    vi.setSystemTime(NOW + 6_000)
    vi.advanceTimersByTime(1_000)
    expect(calls.at(-1)).toEqual([3, false])
    stop()
  })

  it('reports the end once, with 0, and then sets no timer for it', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 2_000, listener)
    vi.advanceTimersByTime(10_000)
    expect(calls).toEqual([
      [2, false],
      [1, false],
      [0, false],
    ])
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })

  it('reports an end already past as the first call, once', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW - 3_000, listener)
    vi.advanceTimersByTime(5_000)
    expect(calls).toEqual([[0, false]])
    stop()
  })

  it('marks the change that reaches one minute and the one that reaches ten seconds', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 62_000, listener)
    vi.advanceTimersByTime(62_000)
    const marked = calls.filter(([, mark]) => mark).map(([left]) => left)
    expect(marked).toEqual([60, 10])
    expect(calls).toHaveLength(63)
    stop()
  })

  it('marks nothing for a count that starts below a mark until it reaches the next one', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 30_000, listener)
    vi.advanceTimersByTime(30_000)
    expect(calls.filter(([, mark]) => mark).map(([left]) => left)).toEqual([10])
    stop()
  })

  it('reads at once a moment the clock passed between two readings', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 2_000, listener)
    // The clock passes the moment while the follower still holds one second left.
    vi.setSystemTime(NOW + 2_000)
    const other = clock.follow(NOW + 60_000, () => {})
    vi.advanceTimersByTime(0)
    expect(calls.at(-1)).toEqual([0, false])
    stop()
    other()
  })

  it('stops calling a listener once it is stopped', () => {
    pin()
    const clock = createCountdownClock()
    const { calls, listener } = recorder()
    clock.follow(NOW + 5_000, listener)()
    vi.advanceTimersByTime(5_000)
    expect(calls).toEqual([[5, false]])
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the clock while the document is hidden', () => {
  it('waits only for an end while hidden, and reads the clock at once when shown', () => {
    pin()
    const document = page()
    const clock = createCountdownClock(document)
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 90_000, listener)

    document.show(false)
    vi.advanceTimersByTime(30_000)
    // No second changed while nobody could see it.
    expect(calls.map(([left]) => left)).toEqual([90])

    document.show(true)
    // Shown again: the time left is read from the clock before any timer fires.
    expect(calls.at(-1)).toEqual([60, true])
    vi.advanceTimersByTime(1_000)
    expect(calls.at(-1)).toEqual([59, false])
    stop()
  })

  it('still reports an end that comes while the document is hidden', () => {
    pin()
    const document = page()
    const clock = createCountdownClock(document)
    const { calls, listener } = recorder()
    const stop = clock.follow(NOW + 20_000, listener)

    document.show(false)
    vi.advanceTimersByTime(19_999)
    expect(calls.map(([left]) => left)).toEqual([20])
    vi.advanceTimersByTime(1)
    // Ten seconds passed while hidden, and the end is not a mark.
    expect(calls.at(-1)).toEqual([0, false])
    stop()
  })

  it('listens for visibility while it follows something, and not after', () => {
    pin()
    const document = page()
    const clock = createCountdownClock(document)
    const stopFirst = clock.follow(NOW + 5_000, () => {})
    const stopSecond = clock.follow(NOW + 6_000, () => {})
    expect(document.listeners()).toBe(1)
    stopFirst()
    expect(document.listeners()).toBe(1)
    stopSecond()
    expect(document.listeners()).toBe(0)
  })
})
