import { describe, expect, it } from 'vitest'

import { CalendarDate, CalendarDateTime, Time } from '@internationalized/date'

import {
  calendarDateOf,
  dateFieldDraft,
  dateFieldValue,
  dateOutOfBounds,
  dayPeriodNames,
  eraseSegment,
  fieldHourCycle,
  fieldSegments,
  fieldSegmentTypes,
  monthDraft,
  monthFieldValue,
  monthOutOfBounds,
  segmentValueText,
  stepSegment,
  timeDraft,
  timeFieldValue,
  timeOfDraft,
  typeIntoSegment,
  type DateFieldOptions,
  type DateFieldSegment,
} from './segments'

/**
 * The segmented field's model. A framework's TimeInput renders these segments
 * and routes its keys here; its own tests check the spinbuttons.
 */

const TIME_US: DateFieldOptions = { locale: 'en-US', parts: ['hour', 'minute'] }
const TIME_DE: DateFieldOptions = { locale: 'de-DE', parts: ['hour', 'minute'] }
const DATE_US: DateFieldOptions = { locale: 'en-US', parts: ['year', 'month', 'day'] }

describe('the segments a locale shows, in its order', () => {
  it('adds the day period at a 12-hour locale and drops it under a 24-hour cycle', () => {
    expect(fieldSegmentTypes(TIME_US)).toEqual(['hour', 'minute', 'dayPeriod'])
    expect(fieldSegmentTypes({ ...TIME_US, hourCycle: 24 })).toEqual(['hour', 'minute'])
    expect(fieldSegmentTypes(TIME_DE)).toEqual(['hour', 'minute'])
    expect(fieldHourCycle('de-DE')).toBe(24)
    expect(fieldHourCycle('de-DE', 12)).toBe(12)
  })

  it('drops the minute at hour granularity', () => {
    expect(fieldSegmentTypes({ locale: 'en-US', parts: ['hour'] })).toEqual(['hour', 'dayPeriod'])
  })

  it('puts the day period where the locale does', () => {
    expect(fieldSegmentTypes({ locale: 'ko-KR', parts: ['hour', 'minute'] })).toEqual([
      'dayPeriod',
      'hour',
      'minute',
    ])
  })

  it('orders a date by the locale too', () => {
    expect(fieldSegmentTypes(DATE_US)).toEqual(['month', 'day', 'year'])
    expect(fieldSegmentTypes({ ...DATE_US, locale: 'de-DE' })).toEqual(['day', 'month', 'year'])
  })

  it('writes values and separators as the locale does, and placeholders while empty', () => {
    const filled = fieldSegments(timeDraft({ hour: 9, minute: 0 }, TIME_US), TIME_US)
    expect(filled.map((segment) => segment.text).join('')).toBe('9:00 AM')
    const empty = fieldSegments({}, TIME_US)
    expect(empty.filter((segment) => segment.type !== 'literal')).toEqual([
      expect.objectContaining({ type: 'hour', text: '––', placeholder: true, min: 1, max: 12 }),
      expect.objectContaining({ type: 'minute', text: '––', placeholder: true, min: 0, max: 59 }),
      expect.objectContaining({ type: 'dayPeriod', text: 'AM', placeholder: true }),
    ])
  })

  it('writes a year under 100 as the digits typed, not as a year of the 1900s', () => {
    const year = (draft: { year: number }) =>
      fieldSegments(draft, DATE_US).find((segment) => segment.type === 'year')?.text
    expect(year({ year: 2 })).toBe('2')
    expect(year({ year: 20 })).toBe('20')
    expect(year({ year: 202 })).toBe('202')
  })

  it('writes the Gregorian date whatever calendar the locale defaults to', () => {
    // th-TH counts years in the Buddhist era, 543 ahead of the Gregorian count.
    const thai = fieldSegments({ year: 2026, month: 7, day: 15 }, { ...DATE_US, locale: 'th-TH' })
    expect(thai.map((segment) => segment.text).join('')).toBe('15/7/2026')
  })
})

describe('the arrow keys', () => {
  it('step one segment and wrap at its ends', () => {
    const nine = timeDraft({ hour: 9, minute: 59 }, TIME_US)
    expect(stepSegment(nine, 'hour', 1, TIME_US).hour).toBe(10)
    expect(stepSegment({ ...nine, hour: 12 }, 'hour', 1, TIME_US).hour).toBe(1)
    expect(stepSegment(nine, 'minute', 1, TIME_US).minute).toBe(0)
    expect(stepSegment({ hour: 0 }, 'hour', -1, TIME_DE).hour).toBe(23)
    expect(stepSegment(nine, 'dayPeriod', 1, TIME_US).dayPeriod).toBe(1)
  })

  it('give an empty segment its first value', () => {
    expect(stepSegment({}, 'minute', 1, TIME_US).minute).toBe(0)
    expect(stepSegment({}, 'minute', -1, TIME_US).minute).toBe(59)
  })

  it('keep a day inside the month it falls in', () => {
    const draft = stepSegment({ year: 2026, month: 1, day: 31 }, 'month', 1, DATE_US)
    expect(draft).toEqual({ year: 2026, month: 2, day: 28 })
  })
})

describe('the 29th of February while the year is typed', () => {
  const typeYear = (digits: string, year: number) => {
    let state = { draft: { month: 2, day: 29 } as Record<string, number>, typed: '' }
    const shown: string[] = []
    for (const digit of digits) {
      state = typeIntoSegment(state.draft, 'year', state.typed, digit, DATE_US)
      shown.push(
        fieldSegments(state.draft, DATE_US)
          .map((segment) => segment.text)
          .join(''),
      )
    }
    expect(state.draft.year).toBe(year)
    return { draft: state.draft, shown }
  }

  it('keeps the day through the first digits of a leap year', () => {
    const { draft, shown } = typeYear('2028', 2028)
    expect(draft).toEqual({ year: 2028, month: 2, day: 29 })
    expect(shown).toEqual(['2/29/2', '2/29/20', '2/29/202', '2/29/2028'])
  })

  it('clamps the day once the year is a whole year without it', () => {
    expect(typeYear('2027', 2027).draft).toEqual({ year: 2027, month: 2, day: 28 })
  })
})

describe('typed keys', () => {
  it('wait for a second digit while one could fit, and move on when none could', () => {
    const one = typeIntoSegment({}, 'hour', '', '1', TIME_US)
    expect(one).toEqual({ draft: { hour: 1 }, typed: '1', advance: false })
    expect(typeIntoSegment(one.draft, 'hour', one.typed, '2', TIME_US)).toEqual({
      draft: { hour: 12 },
      typed: '',
      advance: true,
    })
    expect(typeIntoSegment({}, 'hour', '', '3', TIME_US).advance).toBe(true)
    expect(typeIntoSegment({}, 'minute', '', '6', TIME_US)).toMatchObject({
      draft: { minute: 6 },
      advance: true,
    })
  })

  it('start again when a digit would leave the range', () => {
    expect(typeIntoSegment({ minute: 5 }, 'minute', '5', '9', TIME_US).draft.minute).toBe(59)
    expect(typeIntoSegment({ hour: 1 }, 'hour', '1', '5', TIME_US).draft.hour).toBe(5)
  })

  it('hold a leading zero until the digit after it', () => {
    const zero = typeIntoSegment({}, 'month', '', '0', DATE_US)
    expect(zero).toEqual({ draft: {}, typed: '0', advance: false })
    expect(typeIntoSegment(zero.draft, 'month', zero.typed, '7', DATE_US)).toMatchObject({
      draft: { month: 7 },
      advance: true,
    })
  })

  it('set the day period by the first letter of its name', () => {
    expect(dayPeriodNames('en-US')).toEqual(['AM', 'PM'])
    expect(typeIntoSegment({}, 'dayPeriod', '', 'p', TIME_US)).toMatchObject({
      draft: { dayPeriod: 1 },
      advance: true,
    })
    expect(typeIntoSegment({}, 'dayPeriod', '', 'x', TIME_US).draft).toEqual({})
  })

  it('erase the last digit, then the segment', () => {
    expect(eraseSegment({ minute: 45 }, 'minute', TIME_US)).toEqual({ minute: 4 })
    expect(eraseSegment({ minute: 4 }, 'minute', TIME_US)).toEqual({})
  })
})

describe('a time of day and its draft', () => {
  it('reads a time on the field’s clock', () => {
    expect(timeDraft({ hour: 21, minute: 30 }, TIME_US)).toEqual({
      hour: 9,
      minute: 30,
      dayPeriod: 1,
    })
    expect(timeDraft({ hour: 0, minute: 15 }, TIME_US)).toEqual({
      hour: 12,
      minute: 15,
      dayPeriod: 0,
    })
    expect(timeDraft({ hour: 21, minute: 30 }, TIME_DE)).toEqual({ hour: 21, minute: 30 })
  })

  it('has a time only once every segment it shows is filled', () => {
    expect(timeOfDraft({ hour: 9, minute: 30 }, TIME_US)).toBeNull()
    expect(timeOfDraft({ hour: 9, minute: 30, dayPeriod: 1 }, TIME_US)).toEqual({
      hour: 21,
      minute: 30,
    })
    expect(timeOfDraft({ hour: 12, minute: 0, dayPeriod: 0 }, TIME_US)).toEqual({
      hour: 0,
      minute: 0,
    })
  })

  it('keeps the minute the field does not show', () => {
    const hourly: DateFieldOptions = { locale: 'en-GB', parts: ['hour'] }
    expect(timeOfDraft({ hour: 7 }, hourly, { hour: 9, minute: 45 })).toEqual({
      hour: 7,
      minute: 45,
    })
  })
})

describe('a field’s value and its draft', () => {
  const DATETIME_US: DateFieldOptions = {
    locale: 'en-US',
    parts: ['year', 'month', 'day', 'hour', 'minute'],
  }

  it('makes a Time once every segment is filled, keeping the seconds it does not show', () => {
    expect(timeFieldValue({ hour: 9, minute: 30 }, TIME_US)).toBeNull()
    const time = timeFieldValue({ hour: 9, minute: 30, dayPeriod: 1 }, TIME_US, new Time(8, 0, 15))
    expect(time).toBeInstanceOf(Time)
    expect(time?.toString()).toBe('21:30:15')
  })

  it('reads a date, or a datetime at a time granularity, as a draft', () => {
    expect(dateFieldDraft(new CalendarDate(2026, 7, 15), DATE_US)).toEqual({
      year: 2026,
      month: 7,
      day: 15,
    })
    expect(dateFieldDraft(new CalendarDateTime(2026, 7, 15, 21, 30), DATETIME_US)).toEqual({
      year: 2026,
      month: 7,
      day: 15,
      hour: 9,
      minute: 30,
      dayPeriod: 1,
    })
    expect(dateFieldDraft(null, DATE_US)).toEqual({})
  })

  it('makes a CalendarDate without a time, and a CalendarDateTime with one', () => {
    expect(dateFieldValue({ year: 2026, month: 7 }, DATE_US)).toBeNull()
    const date = dateFieldValue({ year: 2026, month: 7, day: 15 }, DATE_US)
    expect(date).toBeInstanceOf(CalendarDate)
    expect(date?.toString()).toBe('2026-07-15')
    const draft = { year: 2026, month: 7, day: 15, hour: 9, minute: 30, dayPeriod: 0 }
    const datetime = dateFieldValue(draft, DATETIME_US)
    expect(datetime).toBeInstanceOf(CalendarDateTime)
    expect(datetime?.toString()).toBe('2026-07-15T09:30:00')
    expect(dateFieldValue({ ...draft, minute: undefined }, DATETIME_US)).toBeNull()
  })

  it('holds a value inside its bounds by day, and refuses a day the app refuses', () => {
    const bounds = { min: new CalendarDate(2026, 7, 10), max: new CalendarDate(2026, 7, 20) }
    expect(dateOutOfBounds(new CalendarDate(2026, 7, 28), bounds)).toBe(true)
    expect(dateOutOfBounds(new CalendarDate(2026, 7, 9), bounds)).toBe(true)
    expect(dateOutOfBounds(new CalendarDateTime(2026, 7, 20, 23, 0), bounds)).toBe(false)
    expect(dateOutOfBounds(null, bounds)).toBe(false)
    expect(
      dateOutOfBounds(new CalendarDate(2026, 7, 15), { unavailable: (day) => day.day === 15 }),
    ).toBe(true)
    expect(calendarDateOf(new CalendarDateTime(2026, 7, 15, 9, 30)).toString()).toBe('2026-07-15')
  })
})

describe('a month and its draft', () => {
  const MONTH_US: DateFieldOptions = { locale: 'en-US', parts: ['year', 'month'] }

  it('shows the month and the year in the locale’s order, with no day', () => {
    expect(fieldSegmentTypes(MONTH_US)).toEqual(['month', 'year'])
    expect(fieldSegmentTypes({ ...MONTH_US, locale: 'ja-JP' })).toEqual(['year', 'month'])
    const shown = fieldSegments(monthDraft('2026-07'), MONTH_US)
    expect(shown.map((segment) => segment.text).join('')).toBe('7/2026')
  })

  it('reads `YYYY-MM`, and reads any other text as empty', () => {
    expect(monthDraft('2026-07')).toEqual({ year: 2026, month: 7 })
    expect(monthDraft('0999-12')).toEqual({ year: 999, month: 12 })
    for (const text of ['2026-13', '2026-7', '2026-07-01', '26-07', '', null, undefined]) {
      expect(monthDraft(text)).toEqual({})
    }
  })

  it('writes `YYYY-MM` once both segments are filled, with a four-digit year', () => {
    expect(monthFieldValue({ year: 2026, month: 7 })).toBe('2026-07')
    expect(monthFieldValue({ year: 202, month: 7 })).toBe('0202-07')
    expect(monthFieldValue({ year: 2026 })).toBeNull()
    expect(monthFieldValue({ month: 7 })).toBeNull()
  })

  it('holds a month inside its bounds, and ignores a bound that is not a month', () => {
    const bounds = { min: '2026-03', max: '2027-02' }
    expect(monthOutOfBounds('2026-02', bounds)).toBe(true)
    expect(monthOutOfBounds('2026-03', bounds)).toBe(false)
    expect(monthOutOfBounds('2027-02', bounds)).toBe(false)
    expect(monthOutOfBounds('2027-03', bounds)).toBe(true)
    expect(monthOutOfBounds(null, bounds)).toBe(false)
    expect(monthOutOfBounds('2020-01', { min: 'soon' })).toBe(false)
  })

  it('says a month by its number and its name, and an empty segment as the caller words it', () => {
    const [month, , year] = fieldSegments(monthDraft('2026-07'), MONTH_US)
    expect(segmentValueText(month as DateFieldSegment, 'en-US', 'Empty')).toBe('7 – July')
    expect(segmentValueText(month as DateFieldSegment, 'de-DE', 'Leer')).toBe('7 – Juli')
    expect(segmentValueText(year as DateFieldSegment, 'en-US', 'Empty')).toBe('2026')
    const [empty] = fieldSegments({}, MONTH_US)
    expect(segmentValueText(empty as DateFieldSegment, 'en-US', 'Empty')).toBe('Empty')
  })
})
