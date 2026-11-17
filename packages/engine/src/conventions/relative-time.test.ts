import { afterEach, describe, expect, it, vi } from 'vitest'

import { relativeTimePhrase, type RelativeTimeOptions } from './relative-time'

/**
 * RelativeTime's phrase, against a pinned clock.
 *
 * Whole units, rounded to the nearest, moving up at the next threshold, and
 * calendar dates measured calendar to calendar in days and larger. Every test
 * pins "now" with fake timers, because a real clock makes failures depend on
 * the date. The members' own tests cover the element around the phrase.
 */

afterEach(() => {
  vi.useRealTimers()
})

/** Local noon, so day arithmetic sits far from every midnight and DST edge. */
const NOW = new Date(2026, 7, 7, 12, 0, 0)

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function pin() {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
}

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

/**
 * The phrase in en-US unless the test names another locale. The words a test
 * expects are a locale's, and the default locale is the engine's choice:
 * Chromium's is en-US under the test runner, and Firefox and WebKit take the
 * machine's.
 */
function phrase(value: string, options: RelativeTimeOptions = {}): string | null {
  return relativeTimePhrase(value, { locale: 'en-US', ...options })
}

/** The local calendar date `days` from the pinned now, as `YYYY-MM-DD`. */
function calendar(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toLocaleDateString('en-CA')
}

describe('units: whole, rounded to nearest, promoted at the threshold', () => {
  it('uses minutes under an hour and hours under a day', () => {
    pin()
    expect(phrase(at(-5 * MINUTE_MS))).toBe('5m ago')
    expect(phrase(at(-2 * HOUR_MS))).toBe('2h ago')
  })

  it('rounds to the nearest whole unit, so 90 minutes is two hours', () => {
    pin()
    expect(phrase(at(-90 * MINUTE_MS))).toBe('2h ago')
  })

  it('moves up a unit at the next threshold, never "60 minutes ago"', () => {
    pin()
    expect(phrase(at(-(59 * MINUTE_MS + 40_000)))).toBe('1h ago')
    expect(phrase(at(-(23 * HOUR_MS + 58 * MINUTE_MS)))).toBe('1d ago')
  })

  it('steps from days to weeks to months to years', () => {
    pin()
    expect(phrase(at(-3 * DAY_MS))).toBe('3d ago')
    expect(phrase(at(-30 * DAY_MS))).toBe('4w ago')
    expect(phrase(at(-32 * DAY_MS))).toBe('1mo ago')
    expect(phrase(at(-400 * DAY_MS))).toBe('1y ago')
  })

  it('says "now" under a minute, because a count of seconds would be stale', () => {
    pin()
    expect(phrase(at(-20_000))).toBe('now')
  })

  it('formats future values', () => {
    pin()
    expect(phrase(at(2 * DAY_MS))).toBe('in 2d')
    expect(phrase(at(2 * DAY_MS), { format: 'long' })).toBe('in 2 days')
  })
})

describe('numeric, format and locale options', () => {
  it('uses narrow by default and long for sentences', () => {
    pin()
    expect(phrase(at(-3 * DAY_MS), { format: 'long' })).toBe('3 days ago')
  })

  it('gives prose surfaces "yesterday" through numeric auto', () => {
    pin()
    expect(phrase(at(-DAY_MS), { numeric: 'auto', format: 'long' })).toBe('yesterday')
  })

  it('formats with Intl in the given locale', () => {
    pin()
    expect(phrase(at(-2 * HOUR_MS), { locale: 'de', format: 'long' })).toBe('vor 2 Stunden')
  })
})

describe('calendar dates use days and larger only', () => {
  it('measures calendar to calendar, not elapsed time', () => {
    pin()
    // Local noon against a date with no time: measured as an instant, the span
    // would round 3.5 days to 4. The calendar path must give exactly 3.
    expect(phrase(calendar(-3))).toBe('3d ago')
  })

  it('never uses hours for a calendar date: yesterday is one day, not 36 hours', () => {
    pin()
    expect(phrase(calendar(-1))).toBe('1d ago')
  })

  it('formats a future calendar date', () => {
    pin()
    expect(phrase(calendar(2))).toBe('in 2d')
  })

  it('calls the same calendar day "today"', () => {
    pin()
    expect(phrase(calendar(0))).toBe('today')
  })
})

describe('unparseable values', () => {
  it('has no phrase for a value that is not a moment', () => {
    expect(phrase('not-a-date')).toBeNull()
    // A calendar date that does not exist is not rolled over into March.
    expect(phrase('2026-02-30')).toBeNull()
  })
})

describe('the absolute and both modes', () => {
  /** Intl's own words for an instant, in the reader's zone: the pair the spec names. */
  function intl(offsetMs: number, dateStyle: 'medium' | 'long', locale = 'en-US'): string {
    return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle: 'short' }).format(
      new Date(NOW.getTime() + offsetMs),
    )
  }

  it('writes an instant as the medium date and the short time, in the reader’s zone', () => {
    pin()
    const written = phrase(at(-2 * HOUR_MS), { mode: 'absolute', locale: 'en-US' })
    expect(written).toBe(intl(-2 * HOUR_MS, 'medium'))
    // The medium date names the month, and the short time has no seconds. The
    // word between them is the engine's locale data's: a comma, or "at".
    expect(written).toMatch(/^Aug 7, 2026(,| at) 10:00\sAM$/)
  })

  it('writes the long date for format long', () => {
    pin()
    expect(phrase(at(-2 * HOUR_MS), { mode: 'absolute', format: 'long', locale: 'en-US' })).toBe(
      intl(-2 * HOUR_MS, 'long'),
    )
  })

  it('writes a calendar date as the date alone, the same day in every zone', () => {
    pin()
    expect(phrase('2026-08-04', { mode: 'absolute', locale: 'en-US' })).toBe('Aug 4, 2026')
    expect(phrase('2026-08-04', { mode: 'absolute', format: 'long', locale: 'en-US' })).toBe(
      'August 4, 2026',
    )
  })

  it('formats in the given locale', () => {
    pin()
    expect(phrase('2026-08-04', { mode: 'absolute', locale: 'de' })).toBe('04.08.2026')
  })

  it('writes both as the moment, then the distance in parentheses', () => {
    pin()
    expect(phrase(at(-2 * HOUR_MS), { mode: 'both', locale: 'en-US' })).toBe(
      `${intl(-2 * HOUR_MS, 'medium')} (2h ago)`,
    )
    expect(phrase(calendar(-3), { mode: 'both', locale: 'en-US' })).toMatch(
      /^Aug 4, 2026 \(3d ago\)$/,
    )
  })

  it('joins both with the locale’s words, which order and punctuate them', () => {
    pin()
    // A locale that puts the distance first, as a catalog may.
    const messages = { both: (moment: string, distance: string) => `${distance} · ${moment}` }
    expect(phrase(calendar(-3), { mode: 'both', locale: 'en-US', messages })).toBe(
      '3d ago · Aug 4, 2026',
    )
    // The words are read in `both` alone.
    expect(phrase(calendar(-3), { locale: 'en-US', messages })).toBe('3d ago')
  })

  it('reads numeric only in the relative words', () => {
    pin()
    expect(
      phrase(at(-DAY_MS), {
        mode: 'both',
        numeric: 'auto',
        format: 'long',
        locale: 'en-US',
      }),
    ).toBe(`${intl(-DAY_MS, 'long')} (yesterday)`)
  })

  it('has no phrase in any mode for a value that is not a moment', () => {
    expect(phrase('not-a-date', { mode: 'absolute' })).toBeNull()
    expect(phrase('2026-02-30', { mode: 'both' })).toBeNull()
  })
})
