import { describe, expect, it } from 'vitest'

import { CalendarDate, CalendarDateTime, Time } from '@internationalized/date'

import { agentDate, agentDateRange, agentDateTime, agentMonth, agentTime } from './agent'

const weekend = (date: CalendarDate) => [0, 6].includes(date.toDate('UTC').getUTCDay())

describe('the values an agent sets on a date member', () => {
  it('reads a date in the form a CalendarDate writes, and refuses any other', () => {
    expect(agentDate('2026-07-15')).toEqual(new CalendarDate(2026, 7, 15))
    for (const text of ['2026-7-15', '15/07/2026', '2026-02-30', '2026-07-15T09:00:00', '']) {
      expect(() => agentDate(text), text).toThrow('is not a date written as YYYY-MM-DD')
    }
  })

  it('refuses a date outside the bounds, and a day the predicate refuses', () => {
    const bounds = { min: new CalendarDate(2026, 7, 1), max: new CalendarDate(2026, 7, 31) }
    expect(agentDate('2026-07-01', bounds)).toEqual(new CalendarDate(2026, 7, 1))
    expect(() => agentDate('2026-06-30', bounds)).toThrow('outside the dates the field allows')
    expect(() => agentDate('2026-08-01', bounds)).toThrow('outside the dates the field allows')
    // 18 July 2026 is a Saturday.
    expect(() => agentDate('2026-07-18', { unavailable: weekend })).toThrow(
      'a day the field does not offer',
    )
  })

  it('reads a date and a time in the form a CalendarDateTime writes', () => {
    expect(agentDateTime('2026-07-15T09:30:00')).toEqual(new CalendarDateTime(2026, 7, 15, 9, 30))
    expect(() => agentDateTime('2026-07-15T09:30')).toThrow('YYYY-MM-DDTHH:MM:SS')
    expect(() => agentDateTime('2026-07-15')).toThrow('YYYY-MM-DDTHH:MM:SS')
    expect(() =>
      agentDateTime('2026-08-01T00:00:00', { max: new CalendarDate(2026, 7, 31) }),
    ).toThrow('outside the dates the field allows')
    // A person enters whole hours at `hour`, and no seconds at either granularity.
    expect(agentDateTime('2026-07-15T09:00:00', {}, 'hour')).toEqual(
      new CalendarDateTime(2026, 7, 15, 9),
    )
    expect(() => agentDateTime('2026-07-15T09:30:00', {}, 'hour')).toThrow('whole hours')
    expect(() => agentDateTime('2026-07-15T09:30:15')).toThrow('whole minutes')
  })

  it('reads a time in the form a Time writes', () => {
    expect(agentTime('09:30:00')).toEqual(new Time(9, 30))
    for (const text of ['9:30', '09:30', '25:00:00', 'nine']) {
      expect(() => agentTime(text), text).toThrow('is not a time written as HH:MM:SS')
    }
    expect(() => agentTime('09:30:15')).toThrow('whole minutes')
    expect(() => agentTime('09:30:00', 'hour')).toThrow('whole hours')
    expect(agentTime('09:00:00', 'hour')).toEqual(new Time(9))
  })

  it('reads a month written YYYY-MM, inside the first and last months', () => {
    expect(agentMonth('2029-08')).toBe('2029-08')
    for (const text of ['2029-8', '2029-13', '0000-01', '2029-08-01']) {
      expect(() => agentMonth(text), text).toThrow('is not a month written as YYYY-MM')
    }
    expect(() => agentMonth('2025-12', { min: '2026-01' })).toThrow(
      'outside the months the field allows',
    )
  })

  it('reads a range of dates, start first, a one-day range included', () => {
    expect(agentDateRange('2026-06-01/2026-06-14')).toEqual({
      start: new CalendarDate(2026, 6, 1),
      end: new CalendarDate(2026, 6, 14),
    })
    expect(agentDateRange('2026-06-01/2026-06-01').end).toEqual(new CalendarDate(2026, 6, 1))
    expect(() => agentDateRange('2026-06-14/2026-06-01')).toThrow('ends before it starts')
    expect(() => agentDateRange('2026-06-01')).toThrow('YYYY-MM-DD/YYYY-MM-DD')
    expect(() =>
      agentDateRange('2026-06-01/2026-07-01', { max: new CalendarDate(2026, 6, 30) }),
    ).toThrow('outside the dates the field allows')
  })
})
