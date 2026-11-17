/**
 * The segmented date and time field, as data (`design/components/time-input.md`,
 * `design/components/date-picker.md`): which segments a locale shows and in
 * what order, the range of each, how the arrow keys step one, how typed digits
 * fill one, and how a draft becomes a value. A framework renders the segments
 * as spinbuttons and routes their keys here, so every framework's TimeInput and
 * date fields order, step and fill segments the same way.
 *
 * The field is edited one segment at a time, so it holds a draft: a value per
 * segment, any of which may still be empty. A draft is complete when every
 * segment the field shows has a value; only then is there a value to report.
 * Hours are held as the field shows them: 1–12 with a day period at a 12-hour
 * cycle, 0–23 at a 24-hour one.
 *
 * A field's value is `@internationalized/date`'s (`Time`, `CalendarDate`,
 * `CalendarDateTime`), never a JS `Date`, which would add a time zone to a
 * field that has none. A month field's value is `YYYY-MM` text, because that
 * package has no type for a year and a month. Beyond those types only `Intl`
 * is read: no DOM and no framework.
 */

import { CalendarDate, CalendarDateTime, Time } from '@internationalized/date'

/** A part of a date or a time that a field can edit. */
export type DateFieldPart = 'year' | 'month' | 'day' | 'hour' | 'minute'

/** A segment the field shows: a part, or the day period a 12-hour cycle adds. */
export type DateSegmentType = DateFieldPart | 'dayPeriod'

export interface DateFieldOptions {
  /** Orders the segments and supplies the separators and the day period's names. */
  locale: string
  /** The parts the field edits; the locale orders them. A time field is `['hour', 'minute']`. */
  parts: readonly DateFieldPart[]
  /** `12` adds the day period, `24` never does; the locale decides when absent. */
  hourCycle?: 12 | 24
}

/** What the reader has entered, by segment. A missing segment shows its placeholder. */
export type DateFieldDraft = Readonly<Partial<Record<DateSegmentType, number>>>

export interface DateFieldSegment {
  type: DateSegmentType | 'literal'
  /** The segment's text: its value as the locale writes it, its placeholder, or a separator. */
  text: string
  /** The segment is empty and shows its placeholder. A separator never is. */
  placeholder: boolean
  /** The segment's value; absent for a separator and an empty segment. */
  value?: number
  /** The range the arrows and typed digits stay inside; absent for a separator. */
  min?: number
  max?: number
}

/** A time of day on a 24-hour clock. */
export interface TimeOfDay {
  hour: number
  minute: number
}

/** The hour cycle a field uses: the caller's, else the locale's. */
export function fieldHourCycle(locale: string, hourCycle?: 12 | 24): 12 | 24 {
  if (hourCycle !== undefined) return hourCycle
  const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle
  return cycle === 'h11' || cycle === 'h12' ? 12 : 24
}

function formatOptions(options: DateFieldOptions): Intl.DateTimeFormatOptions {
  const has = (part: DateFieldPart) => options.parts.includes(part)
  return {
    ...(has('year') ? { year: 'numeric' } : {}),
    ...(has('month') ? { month: 'numeric' } : {}),
    ...(has('day') ? { day: 'numeric' } : {}),
    ...(has('hour') ? { hour: 'numeric' } : {}),
    ...(has('minute') ? { minute: '2-digit' } : {}),
    ...(has('hour')
      ? { hourCycle: fieldHourCycle(options.locale, options.hourCycle) === 12 ? 'h12' : 'h23' }
      : {}),
    // The draft's values are Gregorian and carry no zone, so the sample is written in both.
    calendar: 'gregory',
    timeZone: 'UTC',
  } as Intl.DateTimeFormatOptions
}

/**
 * Days in a month of the proleptic Gregorian calendar. `setUTCFullYear` takes
 * the year as given; `Date.UTC` would read 0–99 as 1900–1999.
 */
function daysIn(month: number, year: number): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 0)
  return date.getUTCDate()
}

/** The range of one segment, given what the rest of the draft holds. */
export function segmentRange(
  type: DateSegmentType,
  draft: DateFieldDraft,
  options: DateFieldOptions,
): { min: number; max: number } {
  switch (type) {
    case 'year':
      return { min: 1, max: 9999 }
    case 'month':
      return { min: 1, max: 12 }
    case 'day': {
      // A day the month does not have is never entered; an unknown month allows 31. A year
      // under 1000 is read as one still being typed, and a leap year stands in for it, so
      // the 29th of February survives the first digits of 2028.
      const year = draft.year !== undefined && draft.year >= 1000 ? draft.year : 2000
      return { min: 1, max: draft.month === undefined ? 31 : daysIn(draft.month, year) }
    }
    case 'hour':
      return fieldHourCycle(options.locale, options.hourCycle) === 12
        ? { min: 1, max: 12 }
        : { min: 0, max: 23 }
    case 'minute':
      return { min: 0, max: 59 }
    case 'dayPeriod':
      return { min: 0, max: 1 }
  }
}

/**
 * A date carrying the draft's values, for the formatter to write; empty
 * segments take a sample. It is built in UTC, which the formatter also writes
 * in, so no zone's daylight-saving gap moves its hour. `setUTCFullYear` keeps a
 * year of 0–99 as typed, where the `Date` constructor would read it as 1900–1999.
 */
function sampleDate(draft: DateFieldDraft, options: DateFieldOptions): Date {
  const twelve = fieldHourCycle(options.locale, options.hourCycle) === 12
  const shown = draft.hour ?? (twelve ? 12 : 0)
  const hour = twelve ? (shown % 12) + ((draft.dayPeriod ?? 0) === 1 ? 12 : 0) : shown
  const month = (draft.month ?? 1) - 1
  const day = draft.day ?? 1
  const date = new Date(Date.UTC(2000, 0, 1, hour, draft.minute ?? 0))
  date.setUTCFullYear(draft.year ?? 2000, month, day)
  // The 29th of February in a year still being typed (the 2 of 2028) is written in a leap
  // year, so the month and the day keep their places; `fieldSegments` writes the year itself.
  if (date.getUTCDate() !== day) date.setUTCFullYear(2000, month, day)
  return date
}

/** A year as the locale writes it in a date: its digits, without the calendar's era. */
function yearText(year: number, locale: string): string {
  const date = new Date(0)
  date.setUTCFullYear(year, 0, 1)
  return (
    new Intl.DateTimeFormat(locale, { year: 'numeric', calendar: 'gregory', timeZone: 'UTC' })
      .formatToParts(date)
      .find((part) => part.type === 'year')?.value ?? String(year)
  )
}

/** The placeholder each empty segment shows: a pattern for a date part, dashes for a time part. */
const PLACEHOLDERS: Readonly<Record<DateFieldPart, string>> = {
  year: 'yyyy',
  month: 'mm',
  day: 'dd',
  hour: '––',
  minute: '––',
}

/**
 * The segments the field shows, in the locale's order, with the locale's
 * separators between them. An empty segment shows its placeholder; the day
 * period's placeholder is the morning's name, as the locale writes it.
 */
export function fieldSegments(
  draft: DateFieldDraft,
  options: DateFieldOptions,
): DateFieldSegment[] {
  const sample = sampleDate(draft, options)
  const parts = new Intl.DateTimeFormat(options.locale, formatOptions(options)).formatToParts(
    sample,
  )
  const segments: DateFieldSegment[] = []
  for (const part of parts) {
    if (part.type === 'literal') {
      segments.push({ type: 'literal', text: part.value, placeholder: false })
      continue
    }
    if (!['year', 'month', 'day', 'hour', 'minute', 'dayPeriod'].includes(part.type)) continue
    const type = part.type as DateSegmentType
    const value = draft[type]
    const range = segmentRange(type, draft, options)
    const empty = value === undefined
    const text =
      empty && type !== 'dayPeriod'
        ? PLACEHOLDERS[type as DateFieldPart]
        : type === 'year' && value !== sample.getUTCFullYear()
          ? yearText(value as number, options.locale)
          : part.value
    segments.push({
      type,
      text,
      placeholder: empty,
      ...(empty ? {} : { value }),
      ...range,
    })
  }
  return segments
}

/** The segment types the field shows, in order: the ones a reader moves between. */
export function fieldSegmentTypes(options: DateFieldOptions): DateSegmentType[] {
  return fieldSegments({}, options)
    .filter((segment) => segment.type !== 'literal')
    .map((segment) => segment.type as DateSegmentType)
}

/** The draft with one segment set, and a day clamped to the month it now falls in. */
function withSegment(
  draft: DateFieldDraft,
  type: DateSegmentType,
  value: number | undefined,
  options: DateFieldOptions,
): DateFieldDraft {
  const next: Partial<Record<DateSegmentType, number>> = { ...draft }
  if (value === undefined) delete next[type]
  else next[type] = value
  if (next.day !== undefined) next.day = Math.min(next.day, segmentRange('day', next, options).max)
  return next
}

/**
 * The arrow keys: one step up (`1`) or down (`-1`), wrapping at the ends of
 * the segment's range. An empty segment takes its first value instead: the
 * minimum going up, the maximum going down.
 */
export function stepSegment(
  draft: DateFieldDraft,
  type: DateSegmentType,
  delta: 1 | -1,
  options: DateFieldOptions,
): DateFieldDraft {
  const { min, max } = segmentRange(type, draft, options)
  const current = draft[type]
  const span = max - min + 1
  const next =
    current === undefined
      ? delta > 0
        ? min
        : max
      : ((((current - min + delta) % span) + span) % span) + min
  return withSegment(draft, type, next, options)
}

/**
 * A key typed into a segment. `typed` is what the reader has typed into it
 * since it took focus. A digit extends it while the value stays in range, and
 * starts it again when it would not; focus moves on once no further digit
 * could fit. In the day period, the first letter of either name sets it.
 * Any other key changes nothing.
 */
export function typeIntoSegment(
  draft: DateFieldDraft,
  type: DateSegmentType,
  typed: string,
  key: string,
  options: DateFieldOptions,
): { draft: DateFieldDraft; typed: string; advance: boolean } {
  if (type === 'dayPeriod') {
    const names = dayPeriodNames(options.locale).map((name) =>
      name.toLocaleLowerCase(options.locale),
    )
    const at = names.findIndex((name) => name.startsWith(key.toLocaleLowerCase(options.locale)))
    if (key.length !== 1 || at === -1) return { draft, typed, advance: false }
    return { draft: withSegment(draft, type, at, options), typed: '', advance: true }
  }
  if (!/^\d$/.test(key)) return { draft, typed, advance: false }
  const { min, max } = segmentRange(type, draft, options)
  let entered = `${typed}${key}`
  if (Number(entered) > max) entered = key
  const value = Number(entered)
  const advance = Number(`${entered}0`) > max || entered.length >= String(max).length
  // A zero that cannot be a value yet (the `0` of `07` in a month) waits for the next digit.
  if (value < min)
    return { draft: withSegment(draft, type, undefined, options), typed: entered, advance: false }
  return { draft: withSegment(draft, type, value, options), typed: advance ? '' : entered, advance }
}

/** Backspace: the segment loses its last digit, and is empty once none is left. */
export function eraseSegment(
  draft: DateFieldDraft,
  type: DateSegmentType,
  options: DateFieldOptions,
): DateFieldDraft {
  const current = draft[type]
  if (current === undefined || type === 'dayPeriod')
    return withSegment(draft, type, undefined, options)
  const rest = String(current).slice(0, -1)
  return withSegment(draft, type, rest === '' ? undefined : Number(rest), options)
}

/** The day period's two names in the locale, morning first. */
export function dayPeriodNames(locale: string): [string, string] {
  const name = (hour: number) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' })
      .formatToParts(new Date(2000, 0, 1, hour))
      .find((part) => part.type === 'dayPeriod')?.value ?? (hour < 12 ? 'AM' : 'PM')
  return [name(9), name(21)]
}

/** A time of day as a time field's draft. */
export function timeDraft(
  time: TimeOfDay | null | undefined,
  options: DateFieldOptions,
): DateFieldDraft {
  if (time === null || time === undefined) return {}
  const twelve = fieldHourCycle(options.locale, options.hourCycle) === 12
  const shown = twelve ? time.hour % 12 || 12 : time.hour
  return {
    hour: shown,
    ...(options.parts.includes('minute') ? { minute: time.minute } : {}),
    ...(twelve ? { dayPeriod: time.hour >= 12 ? 1 : 0 } : {}),
  }
}

/**
 * A time field's draft as a time of day on a 24-hour clock, or `null` while a
 * segment it shows is still empty. A part the field does not show (the minute
 * at hour granularity) is `kept`'s, so a value the app supplied keeps it.
 */
export function timeOfDraft(
  draft: DateFieldDraft,
  options: DateFieldOptions,
  kept?: TimeOfDay | null,
): TimeOfDay | null {
  const twelve = fieldHourCycle(options.locale, options.hourCycle) === 12
  const showsMinute = options.parts.includes('minute')
  if (draft.hour === undefined || (showsMinute && draft.minute === undefined)) return null
  if (twelve && draft.dayPeriod === undefined) return null
  const hour = twelve ? (draft.hour % 12) + (draft.dayPeriod === 1 ? 12 : 0) : draft.hour
  return { hour, minute: showsMinute ? (draft.minute as number) : (kept?.minute ?? 0) }
}

/** A date field's value: a date, or a date with a time of day. */
export type DateFieldValue = CalendarDate | CalendarDateTime

/**
 * A time field's draft as a `Time`, or `null` while a segment it shows is
 * still empty. The parts the field does not show (the minute at hour
 * granularity, the seconds) are `kept`'s, so a value the app supplied keeps
 * them.
 */
export function timeFieldValue(
  draft: DateFieldDraft,
  options: DateFieldOptions,
  kept?: Time | null,
): Time | null {
  const time = timeOfDraft(draft, options, kept)
  if (time === null) return null
  return new Time(time.hour, time.minute, kept?.second ?? 0, kept?.millisecond ?? 0)
}

/**
 * A date or a datetime as a date field's draft: the year, the month and the
 * day, and the hour and the minute when the field shows them.
 */
export function dateFieldDraft(
  value: DateFieldValue | null | undefined,
  options: DateFieldOptions,
): DateFieldDraft {
  if (value === null || value === undefined) return {}
  const time = 'hour' in value && options.parts.includes('hour') ? timeDraft(value, options) : {}
  return { year: value.year, month: value.month, day: value.day, ...time }
}

/**
 * A date field's draft as its value, or `null` while a segment it shows is
 * still empty: a `CalendarDate` when the field shows no time, and a
 * `CalendarDateTime` when it does. The parts the field does not show are
 * `kept`'s, as in a time field.
 */
export function dateFieldValue(
  draft: DateFieldDraft,
  options: DateFieldOptions,
  kept?: DateFieldValue | null,
): DateFieldValue | null {
  const { year, month, day } = draft
  if (year === undefined || month === undefined || day === undefined) return null
  if (!options.parts.includes('hour')) return new CalendarDate(year, month, day)
  const timed = kept !== null && kept !== undefined && 'hour' in kept ? kept : null
  const time = timeOfDraft(draft, options, timed)
  if (time === null) return null
  return new CalendarDateTime(
    year,
    month,
    day,
    time.hour,
    time.minute,
    timed?.second ?? 0,
    timed?.millisecond ?? 0,
  )
}

/** A date field's value without its time of day: what a month grid shows and chooses. */
export function calendarDateOf(value: DateFieldValue): CalendarDate {
  return new CalendarDate(value.year, value.month, value.day)
}

/** What a date field may hold: its earliest and latest dates, and the days the app refuses. */
export interface DateBounds {
  min?: CalendarDate | undefined
  max?: CalendarDate | undefined
  unavailable?: ((date: CalendarDate) => boolean) | undefined
}

/**
 * Whether a value is one the field cannot hold: before `min`, after `max`, or
 * a day `unavailable` refuses. Dates are compared by day, so a time on the
 * last allowed day is inside the bounds. An empty field is never out of them.
 */
export function dateOutOfBounds(
  value: DateFieldValue | null | undefined,
  bounds: DateBounds,
): boolean {
  if (value === null || value === undefined) return false
  const date = calendarDateOf(value)
  if (bounds.min !== undefined && date.compare(bounds.min) < 0) return true
  if (bounds.max !== undefined && date.compare(bounds.max) > 0) return true
  return bounds.unavailable?.(date) === true
}

/** `YYYY-MM` as its year and month, or `null` when the text is not a month. */
function monthOf(text: string | null | undefined): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(text ?? '')
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  return year >= 1 && month >= 1 && month <= 12 ? { year, month } : null
}

/**
 * A month as a month field's draft: the year and the month of a `YYYY-MM`
 * text, the form `<input type="month">` reports. Text that is not a month is
 * an empty draft.
 */
export function monthDraft(value: string | null | undefined): DateFieldDraft {
  return monthOf(value) ?? {}
}

/**
 * A month field's draft as `YYYY-MM`, or `null` while a segment is still
 * empty. The year is written with four digits, so two months compare as text.
 */
export function monthFieldValue(draft: DateFieldDraft): string | null {
  const { year, month } = draft
  if (year === undefined || month === undefined) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/**
 * Whether a month is before `min` or after `max`, each a `YYYY-MM` text. A
 * bound that is not a month bounds nothing, and an empty field is never out of
 * its bounds.
 */
export function monthOutOfBounds(
  value: string | null | undefined,
  bounds: { min?: string | undefined; max?: string | undefined },
): boolean {
  if (monthOf(value) === null) return false
  const text = value as string
  if (monthOf(bounds.min) !== null && text < (bounds.min as string)) return true
  return monthOf(bounds.max) !== null && text > (bounds.max as string)
}

/**
 * What a segment says to assistive software as its value: its text, a filled
 * month's name after its number (`7 – July`, as React Aria says it), or
 * `empty` while it is unfilled. The month's name is the locale's.
 */
export function segmentValueText(segment: DateFieldSegment, locale: string, empty: string): string {
  if (segment.placeholder) return empty
  if (segment.type !== 'month' || segment.value === undefined) return segment.text
  const date = new Date(0)
  date.setUTCFullYear(2000, segment.value - 1, 1)
  const name = new Intl.DateTimeFormat(locale, {
    month: 'long',
    calendar: 'gregory',
    timeZone: 'UTC',
  }).format(date)
  return name === segment.text ? name : `${segment.text} – ${name}`
}
