/**
 * A number of seconds written as text: as clock digits (`1:02:05`) and in the
 * locale's words (`1 hour, 2 minutes, 5 seconds`). AudioPlayer, RecordButton
 * and Countdown write their times with these, through `clockTime`,
 * `spokenDuration`, `countdownClock` and `countdownSpoken`, so a time reads
 * the same in each of them. DurationInput says a segment's value with
 * `unitWords`, so a count and its unit are said the same way everywhere.
 *
 * These functions write the whole seconds they are given. Each caller makes
 * that count from its own seconds, because the counts differ on purpose and
 * the text does not:
 *
 *  - AudioPlayer and RecordButton floor a position, so a recording's elapsed
 *    time equals its length when it ends (`audio.ts`).
 *  - Countdown's time left is the ceiling of the time to the moment
 *    (`countdownLeft`), so it shows `0:01` through its last second and `0:00`
 *    at the moment. Its formatters then floor what they are given, as the
 *    audio ones do (`countdown.ts`).
 *
 * The clock has no days. From an hour on it writes hours, past 24 too
 * (`25:00:00`), because Countdown's and RecordButton's specs write every time
 * from an hour on as `h:mm:ss`.
 *
 * DurationInput's segments are not written here. A segment draws its count's
 * digits and its unit's short word apart, on the side the locale writes the
 * word, so it needs `Intl`'s parts and not one string (`duration.ts`). Its
 * units include days, which the clock does not show.
 *
 * Only `Intl` is read: no DOM, so a server renders these.
 */

/** A unit of time as `Intl.NumberFormat` names it. */
export type TimeUnit = 'day' | 'hour' | 'minute' | 'second'

/**
 * `15` minutes -> `15 minutes`: a count and its unit's long word, from `Intl`,
 * so no word comes from the vocabulary.
 */
export function unitWords(count: number, unit: TimeUnit, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' }).format(count)
}

/** Whole seconds as hours, minutes and the seconds left over. */
function split(whole: number): { hours: number; minutes: number; rest: number } {
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    rest: whole % 60,
  }
}

/**
 * `65` -> `1:05`, `3725` -> `1:02:05`: minutes and two-digit seconds, with the
 * hours in front from an hour on, and the minutes then in two digits too. The
 * digits are the locale's own numerals, and the hours are not grouped
 * (`1000:00:00`). The colon is the separator in every locale.
 */
export function timeDigits(whole: number, locale?: string): string {
  const { hours, minutes, rest } = split(whole)
  const plain = new Intl.NumberFormat(locale, { useGrouping: false })
  const padded = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false })
  return hours > 0
    ? `${plain.format(hours)}:${padded.format(minutes)}:${padded.format(rest)}`
    : `${plain.format(minutes)}:${padded.format(rest)}`
}

/**
 * `65` -> `1 minute, 5 seconds`: each unit that is not zero in the locale's
 * words, joined as `Intl` joins a list of units. No time at all is
 * `0 seconds`. A screen reader says these words, where it would read the
 * digits as "1 colon 05" or as a time of day.
 */
export function timeWords(whole: number, locale?: string): string {
  const { hours, minutes, rest } = split(whole)
  const said = (
    [
      [hours, 'hour'],
      [minutes, 'minute'],
      [rest, 'second'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, unit]) => unitWords(count, unit, locale))
  if (said.length === 0) return unitWords(0, 'second', locale)
  return new Intl.ListFormat(locale, { type: 'unit', style: 'long' }).format(said)
}
