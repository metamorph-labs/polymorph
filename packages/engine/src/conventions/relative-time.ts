import {
  type CalendarDate,
  getLocalTimeZone,
  parseAbsoluteToLocal,
  parseDate,
  today,
} from '@internationalized/date'

/**
 * RelativeTime's phrase (`design/components/relative-time.md`): "2h ago" for a
 * moment, made by `Intl.RelativeTimeFormat`, the moment itself, made by
 * `Intl.DateTimeFormat`, or both. Every framework's RelativeTime renders it,
 * so the units, the rounding, the date and time styles and the calendar-date
 * rule are decided once. An application calls it for a string prop that takes
 * app-formatted text, such as Timeline's `time`, so the words match the
 * member's.
 */

export interface RelativeTimeOptions {
  /** The locale `Intl` formats with; the page's own when absent. */
  locale?: string
  /** Intl's `numeric`: `always` gives "1 day ago", `auto` gives "yesterday". */
  numeric?: 'auto' | 'always'
  /**
   * Intl's `style`, without `short`, which looks like `narrow`. In the absolute
   * form it is the date's length: `narrow` is Intl's `medium` date, `long` its
   * `long` date.
   */
  format?: 'long' | 'narrow'
  /**
   * What the phrase says: the distance from now (`relative`, the default), the
   * moment itself (`absolute`), or the moment and the distance together
   * (`both`), joined by `messages.both`.
   */
  mode?: 'relative' | 'absolute' | 'both'
  /**
   * RelativeTime's `messages`, which a locale replaces. `both` joins the moment
   * and the distance, so a locale orders and punctuates them.
   */
  messages?: { both: (moment: string, distance: string) => string }
}

/**
 * The English words: the moment, then the distance in parentheses, "Aug 4,
 * 2026, 2:05 PM (2h ago)". Parentheses read as an aside in English, and a
 * screen reader pauses at them.
 */
const MESSAGES: Required<RelativeTimeOptions>['messages'] = {
  both: (moment, distance) => `${moment} (${distance})`,
}

/** `2026-08-04`: a calendar date, with no time of day and therefore no timezone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
/** The Gregorian average (365.25 / 12 days), so month and year stay consistent. */
const MONTH_MS = 30.4375 * DAY_MS
const YEAR_MS = 12 * MONTH_MS

interface Rung {
  unit: Intl.RelativeTimeFormatUnit
  ms: number
}

/** Smallest to largest; a value uses the largest unit it has at least one of. */
const LADDER: Rung[] = [
  { unit: 'minute', ms: MINUTE_MS },
  { unit: 'hour', ms: HOUR_MS },
  { unit: 'day', ms: DAY_MS },
  { unit: 'week', ms: WEEK_MS },
  { unit: 'month', ms: MONTH_MS },
  { unit: 'year', ms: YEAR_MS },
]

/**
 * The parsed value: an instant, or a calendar date, which has no time of day
 * and so no timezone.
 */
type Moment = { kind: 'instant'; at: Date } | { kind: 'calendar'; date: CalendarDate }

function readMoment(value: string): Moment | null {
  if (DATE_ONLY.test(value)) {
    try {
      // `parseDate` takes no timezone by type, so no offset reaches a calendar
      // date.
      return { kind: 'calendar', date: parseDate(value) }
    } catch {
      return null
    }
  }

  // A full timestamp keeps its offset. One written without an offset falls back
  // to the platform's parser, exactly as the charts' `parseIso` does.
  try {
    return { kind: 'instant', at: parseAbsoluteToLocal(value).toDate() }
  } catch {
    const fallback = new Date(value)
    if (Number.isNaN(fallback.getTime())) return null
    return { kind: 'instant', at: fallback }
  }
}

/**
 * Whole days from today to a calendar date. Distance is calendar to calendar
 * in the reader's zone (both ends at local midnight), rounded so a DST hour
 * cannot shift a day, using `@internationalized/date` as charts do.
 */
function calendarDays(date: CalendarDate): number {
  const zone = getLocalTimeZone()
  const then = date.toDate(zone)
  const now = today(zone).toDate(zone)
  return Math.round((then.getTime() - now.getTime()) / DAY_MS)
}

/**
 * The largest unit with a count of at least one, rounded to the **nearest** (90
 * minutes is "2 hours ago", as Relay rounds). A count reaching the next unit's
 * threshold moves up, so 59 minutes 40 seconds is "1 hour ago", never "60
 * minutes ago". `rungs` are the allowed units: all of them for instants, day
 * and larger for calendar dates, which have no time of day.
 */
function nearestRung(
  magnitudeMs: number,
  rungs: Rung[],
): { unit: Intl.RelativeTimeFormatUnit; count: number } {
  // The largest unit the magnitude has at least one of. The smallest unit is the
  // minimum, even when the magnitude is less than one of it.
  let held = rungs[0] as Rung
  for (const rung of rungs) {
    if (magnitudeMs >= rung.ms) held = rung
  }

  let count = Math.round(magnitudeMs / held.ms)
  // Promotion, checked upward so one carry can lead to another: a count that
  // rounds to the next unit's threshold uses that unit instead.
  for (const rung of rungs) {
    if (rung.ms > held.ms && count * held.ms >= rung.ms) {
      held = rung
      count = Math.max(1, Math.round(magnitudeMs / rung.ms))
    }
  }
  return { unit: held.unit, count }
}

/** The distance from now, "2h ago", in Intl's relative words. */
function relativeWords(
  moment: Moment,
  { locale, numeric = 'always', format = 'narrow' }: RelativeTimeOptions,
): string {
  const signed = moment.kind === 'instant' ? moment.at.getTime() - Date.now() : 0
  const days = moment.kind === 'calendar' ? calendarDays(moment.date) : 0
  const magnitude = Math.abs(moment.kind === 'instant' ? signed : days * DAY_MS)

  // The zero cases use Intl's own word regardless of `numeric`: "now" under a
  // minute, because seconds would be stale in a component that never updates,
  // and "today" for a calendar date with no distance.
  if (moment.kind === 'instant' && magnitude < MINUTE_MS) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: format }).format(
      0,
      'second',
    )
  }
  if (moment.kind === 'calendar' && days === 0) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: format }).format(0, 'day')
  }

  const rungs = moment.kind === 'calendar' ? LADDER.filter((rung) => rung.ms >= DAY_MS) : LADDER
  const { unit, count } = nearestRung(magnitude, rungs)

  // Future values are allowed. The sign passes through to Intl, so a due date
  // reads "in 2 days".
  const past = moment.kind === 'instant' ? signed < 0 : days < 0
  return new Intl.RelativeTimeFormat(locale, { numeric, style: format }).format(
    past ? -count : count,
    unit,
  )
}

/**
 * The moment itself, in Intl's date and time words. The pair is fixed:
 * `narrow` is the `medium` date ("Aug 4, 2026"), which names the month, so a
 * day and a month are never confused across locales as `short` dates are;
 * `long` is the `long` date. An instant adds the `short` time, without
 * seconds, in the zone of the runtime that formats it (the reader's in a
 * browser), as the relative form measures from that runtime's now. A calendar
 * date is the date alone, formatted at UTC midnight in UTC, so no zone moves
 * its day.
 */
function absoluteWords(moment: Moment, { locale, format = 'narrow' }: RelativeTimeOptions): string {
  const dateStyle = format === 'long' ? 'long' : 'medium'
  if (moment.kind === 'calendar') {
    return new Intl.DateTimeFormat(locale, { dateStyle, timeZone: 'UTC' }).format(
      moment.date.toDate('UTC'),
    )
  }
  return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle: 'short' }).format(moment.at)
}

/**
 * The phrase for `value`, or `null` when `value` is not a moment: nothing
 * honest can be said about it, so the member renders nothing.
 *
 * `value` is ISO-8601 with the chart tier's calendar-date rules
 * (`docs/charts.md`): a date-only string is a calendar date, not shifted by
 * timezone, and a full timestamp keeps its offset. The relative phrase is
 * measured from now and is as current as the call; nothing refreshes it.
 * `both` is the moment and the distance joined by `messages.both`: by default
 * the moment, then the distance in parentheses, "Aug 4, 2026, 2:05 PM (2h
 * ago)".
 *
 * An instant's moment is written in the time zone of the runtime that calls
 * it, Intl's default: the reader's in a browser, the server's on a server.
 */
export function relativeTimePhrase(
  value: string,
  options: RelativeTimeOptions = {},
): string | null {
  const moment = readMoment(value)
  if (moment === null) return null

  const { mode = 'relative', messages = MESSAGES } = options
  if (mode === 'absolute') return absoluteWords(moment, options)
  if (mode === 'both')
    return messages.both(absoluteWords(moment, options), relativeWords(moment, options))
  return relativeWords(moment, options)
}
