import { describe, expect, it } from 'vitest'

import { clockTime, spokenDuration } from './audio'
import { countdownClock, countdownSpoken } from './countdown'
import { timeDigits, timeWords, unitWords } from './time-text'

/**
 * The text a number of seconds is written as, which AudioPlayer, RecordButton,
 * Countdown and DurationInput share. The callers' own tests pin their counts:
 * `audio.test.ts` the floor and the zero for a value that is not a length,
 * `countdown.test.ts` the ceiling of the time left.
 */

describe('the digits', () => {
  it('writes m:ss under an hour and h:mm:ss from an hour', () => {
    expect(timeDigits(0, 'en-US')).toBe('0:00')
    expect(timeDigits(9, 'en-US')).toBe('0:09')
    expect(timeDigits(65, 'en-US')).toBe('1:05')
    expect(timeDigits(3599, 'en-US')).toBe('59:59')
    expect(timeDigits(3600, 'en-US')).toBe('1:00:00')
    expect(timeDigits(3725, 'en-US')).toBe('1:02:05')
  })

  it('writes hours past a day, with no days and no grouping', () => {
    expect(timeDigits(90_061, 'en-US')).toBe('25:01:01')
    expect(timeDigits(1000 * 3600, 'en-US')).toBe('1000:00:00')
  })

  it('writes the locale’s numerals around a colon', () => {
    expect(timeDigits(65, 'ar-EG')).toBe('١:٠٥')
    expect(timeDigits(3725, 'hi-IN-u-nu-deva')).toBe('१:०२:०५')
  })
})

describe('the words', () => {
  it('says each unit that is not zero, and no time as zero seconds', () => {
    expect(timeWords(0, 'en-US')).toBe('0 seconds')
    expect(timeWords(1, 'en-US')).toBe('1 second')
    expect(timeWords(60, 'en-US')).toBe('1 minute')
    expect(timeWords(3725, 'en-US')).toBe('1 hour, 2 minutes, 5 seconds')
  })

  it('says a time past a day in hours, as the digits write it', () => {
    expect(timeWords(90_061, 'en-US')).toBe('25 hours, 1 minute, 1 second')
  })

  it('says one count and its unit’s long word', () => {
    expect(unitWords(15, 'minute', 'en-US')).toBe('15 minutes')
    expect(unitWords(1, 'day', 'en-US')).toBe('1 day')
    expect(unitWords(1, 'hour', 'de-DE')).toBe('1 Stunde')
  })
})

/**
 * Seconds from zero through more than a day, with fractions and negatives.
 * `NaN` and positive `Infinity` are left out: they are not times,
 * AudioPlayer's count reads them as zero, and Countdown is never given one,
 * because `countdownLeft` of a moment is a finite count.
 */
const SECONDS = [
  -3600,
  -4,
  -0.5,
  0,
  0.4,
  0.999,
  1,
  4.9,
  12.9,
  59,
  59.9,
  60,
  61,
  65,
  299,
  600,
  3599,
  3599.5,
  3600,
  3725,
  36_059,
  86_399,
  86_400,
  90_061,
  1000 * 3600,
  Number.NEGATIVE_INFINITY,
]
const LOCALES = ['en-US', 'de-DE', 'ar-EG', 'hi-IN-u-nu-deva', 'ja-JP']

describe('one text for every member that writes a time', () => {
  it('gives AudioPlayer’s clock and Countdown’s the same digits for every time', () => {
    for (const locale of LOCALES) {
      for (const seconds of SECONDS) {
        expect(countdownClock(seconds, locale), `${seconds} in ${locale}`).toBe(
          clockTime(seconds, locale),
        )
      }
    }
  })

  it('gives AudioPlayer and Countdown the same words for every time', () => {
    for (const locale of LOCALES) {
      for (const seconds of SECONDS) {
        expect(countdownSpoken(seconds, locale), `${seconds} in ${locale}`).toBe(
          spokenDuration(seconds, locale),
        )
      }
    }
  })
})
