import { CalendarDate, CalendarDateTime, Time } from '@polymorph/engine'

import { Unreadable, type TemporalCodecs } from './attributes'

/**
 * The temporal codecs (`@polymorph/elements/temporal`): how an attribute's ISO
 * 8601 text becomes a date or a time, as the engine's values, which are
 * `@internationalized/date`'s.
 *
 * They are a module of their own so the date library loads only with a member
 * that takes a date or a time. The definition module of each such member
 * imports them and gives them to `define`, and the element reads its `time`,
 * `date` and `range` attributes through them. Text they cannot read throws
 * `Unreadable`.
 */

const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

function time(text: string): Time {
  const match = TIME.exec(text)
  if (match === null) throw new Unreadable(`"${text}" is not an ISO 8601 time (09:30)`)
  return new Time(Number(match[1]), Number(match[2]), Number(match[3] ?? 0))
}

function date(text: string): CalendarDate | CalendarDateTime {
  const day = DATE.exec(text)
  if (day !== null) return new CalendarDate(Number(day[1]), Number(day[2]), Number(day[3]))
  const moment = DATE_TIME.exec(text)
  if (moment === null) {
    throw new Unreadable(`"${text}" is not an ISO 8601 date (2026-07-15) or date and time`)
  }
  return new CalendarDateTime(
    Number(moment[1]),
    Number(moment[2]),
    Number(moment[3]),
    Number(moment[4]),
    Number(moment[5]),
    Number(moment[6] ?? 0),
  )
}

function range(text: string): { start: CalendarDate; end: CalendarDate } {
  const [start, end, ...rest] = text.split('/')
  const days = [start, end].map((part) => (part === undefined ? null : DATE.exec(part)))
  if (rest.length > 0 || days.some((day) => day === null)) {
    throw new Unreadable(`"${text}" is not an ISO 8601 range of two dates (2026-07-01/2026-07-15)`)
  }
  const [from, to] = days.map(
    (day) => new CalendarDate(Number(day?.[1]), Number(day?.[2]), Number(day?.[3])),
  ) as [CalendarDate, CalendarDate]
  return { start: from, end: to }
}

/** The three temporal codecs, by the kind each reads: `time`, `date` and `range`. */
export const temporal: TemporalCodecs = { time, date, range }
