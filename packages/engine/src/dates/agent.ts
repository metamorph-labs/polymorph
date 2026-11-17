/**
 * The values an agent sets on a date member (`docs/agents.md`), read from the
 * ISO 8601 text each value writes itself: `2026-07-15` for a `CalendarDate`,
 * `2026-07-15T09:30:00` for a `CalendarDateTime`, `09:30:00` for a `Time`,
 * `2026-07` for a month field, and a start and an end joined by `/` for a
 * range of dates. The text is the form a member's `value` state reads, so an
 * agent sets a value in the form it reads one.
 *
 * Each reader throws an `Error` that says why on text in any other form and on
 * a value the field's bounds refuse, because a person cannot enter either. The
 * bridge reports the step as failed with that message. Every renderer reads an
 * agent's text with these, so each refuses the same text.
 */

import {
  type CalendarDate,
  type CalendarDateTime,
  parseDate,
  parseDateTime,
  parseTime,
  type Time,
} from '@internationalized/date'

import { dateOutOfBounds, type DateBounds, monthOutOfBounds } from './segments'

/** The value `parse` reads from text it writes back unchanged, or `null` for any other text. */
function strictly<Value extends { toString(): string }>(
  text: string,
  parse: (text: string) => Value,
): Value | null {
  try {
    const value = parse(text)
    return value.toString() === text ? value : null
  } catch {
    return null
  }
}

/** Throws when a date is one the field's bounds refuse. */
function within(value: CalendarDate | CalendarDateTime, text: string, bounds: DateBounds): void {
  if (dateOutOfBounds(value, { ...bounds, unavailable: undefined })) {
    throw new Error(`${text} is outside the dates the field allows.`)
  }
  if (dateOutOfBounds(value, { unavailable: bounds.unavailable })) {
    throw new Error(`${text} is a day the field does not offer.`)
  }
}

/** A date written `YYYY-MM-DD`, on a day the field allows. */
export function agentDate(text: string, bounds: DateBounds = {}): CalendarDate {
  const date = strictly(text, parseDate)
  if (date === null) throw new Error(`"${text}" is not a date written as YYYY-MM-DD.`)
  within(date, text, bounds)
  return date
}

/**
 * Throws when a time of day is finer than the field's granularity, whose
 * segments a person cannot enter it in: a minute at `hour`, a second at either.
 */
function enterable(time: Time | CalendarDateTime, text: string, granularity: 'hour' | 'minute') {
  if (
    (granularity === 'hour' && time.minute !== 0) ||
    time.second !== 0 ||
    time.millisecond !== 0
  ) {
    throw new Error(`${text} is finer than the field, which shows whole ${granularity}s.`)
  }
}

/**
 * A date and a time of day written `YYYY-MM-DDTHH:MM:SS`, on a day the field
 * allows, in whole units of the field's granularity.
 */
export function agentDateTime(
  text: string,
  bounds: DateBounds = {},
  granularity: 'hour' | 'minute' = 'minute',
): CalendarDateTime {
  const value = strictly(text, parseDateTime)
  if (value === null) {
    throw new Error(`"${text}" is not a date and a time written as YYYY-MM-DDTHH:MM:SS.`)
  }
  within(value, text, bounds)
  enterable(value, text, granularity)
  return value
}

/** A time of day written `HH:MM:SS`, in whole units of the field's granularity. */
export function agentTime(text: string, granularity: 'hour' | 'minute' = 'minute'): Time {
  const time = strictly(text, parseTime)
  if (time === null) throw new Error(`"${text}" is not a time written as HH:MM:SS.`)
  enterable(time, text, granularity)
  return time
}

/** A month written `YYYY-MM`, inside the field's first and last months. */
export function agentMonth(
  text: string,
  bounds: { min?: string | undefined; max?: string | undefined } = {},
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(text)
  const month = match === null ? 0 : Number(match[2])
  if (match === null || Number(match[1]) < 1 || month < 1 || month > 12) {
    throw new Error(`"${text}" is not a month written as YYYY-MM.`)
  }
  if (monthOutOfBounds(text, bounds))
    throw new Error(`${text} is outside the months the field allows.`)
  return text
}

/**
 * A range of dates written `YYYY-MM-DD/YYYY-MM-DD`, start first, each end on a
 * day the field allows. A one-day range writes the same date twice.
 */
export function agentDateRange(
  text: string,
  bounds: DateBounds = {},
): { start: CalendarDate; end: CalendarDate } {
  const ends = text.split('/')
  if (ends.length !== 2) {
    throw new Error(`"${text}" is not a range of dates written as YYYY-MM-DD/YYYY-MM-DD.`)
  }
  const start = agentDate(ends[0] as string, bounds)
  const end = agentDate(ends[1] as string, bounds)
  if (end.compare(start) < 0) throw new Error(`${text} ends before it starts.`)
  return { start, end }
}
