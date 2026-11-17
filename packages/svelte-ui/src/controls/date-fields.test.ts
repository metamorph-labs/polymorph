import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { CalendarDate, CalendarDateTime, Time } from '@polymorph/svelte'

import { render } from '../mount'
import DatePicker from './DatePicker.svelte'
import DateRangePicker from './DateRangePicker.svelte'
import TimeInput from './TimeInput.svelte'

/**
 * The segmented date and time fields in Svelte: what the contract grammar
 * cannot state. A field reports a value once every segment it shows is
 * filled, and `null` once a filled segment is erased; typed digits fill a
 * segment and move on; a supplied value's seconds are kept. DatePicker's
 * calendar sets the date and keeps the time, and DateRangePicker's grid
 * anchors a span, cancels it on the first Escape and commits it on the second
 * choice, filling both fields.
 */

beforeAll(installTestTheme)

const segments = (member: string) => [
  ...document.querySelectorAll<HTMLElement>(`[data-member="${member}"] [data-segment]`),
]
const texts = (member: string) => segments(member).map((segment) => segment.textContent?.trim())
const days = (member: string) => [
  ...document.querySelectorAll<HTMLElement>(
    `[data-member="${member}"][role="dialog"] [data-calendar-part="day"]`,
  ),
]
const day = (member: string, date: string) =>
  days(member).find((element) => element.getAttribute('data-value') === date)
const trigger = (member: string) =>
  document.querySelector<HTMLElement>(`[data-member="${member}"] [aria-haspopup]`)
const panel = (member: string) =>
  document.querySelector<HTMLElement>(`[data-member="${member}"][role="dialog"]`)

describe('TimeInput', () => {
  it('fills each segment from typed digits, moves on, and reports the time once it is whole', async () => {
    const change = vi.fn()
    await render(TimeInput, { locale: 'en-US', 'aria-label': 'Opens at', onChange: change })
    ;(segments('time-input')[0] as HTMLElement).focus()
    await userEvent.keyboard('9')
    expect(document.activeElement?.getAttribute('data-segment')).toBe('minute')
    await userEvent.keyboard('30')
    expect(change).not.toHaveBeenCalled()
    await userEvent.keyboard('p')
    await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1))
    const time = change.mock.calls[0]?.[0] as Time
    expect(time).toBeInstanceOf(Time)
    expect(time.toString()).toBe('21:30:00')
    expect(texts('time-input')).toEqual(['9', '30', 'PM'])
  })

  it('steps a segment, keeps the seconds it does not show, and reports null once erased', async () => {
    const change = vi.fn()
    await render(TimeInput, {
      locale: 'en-US',
      defaultValue: new Time(9, 0, 15),
      'aria-label': 'Opens at',
      onChange: change,
    })
    ;(segments('time-input')[0] as HTMLElement).focus()
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1))
    expect((change.mock.calls[0]?.[0] as Time).toString()).toBe('10:00:15')
    await userEvent.keyboard('{Backspace}{Backspace}')
    await vi.waitFor(() => expect(change).toHaveBeenLastCalledWith(null))
    expect(segments('time-input')[0]?.hasAttribute('data-placeholder')).toBe(true)
  })

  it('moves focus and edits nothing when read-only, and serializes under its name', async () => {
    const change = vi.fn()
    await render(TimeInput, {
      locale: 'en-US',
      readOnly: true,
      name: 'opens',
      defaultValue: new Time(9, 0),
      'aria-label': 'Opens at',
      onChange: change,
    })
    ;(segments('time-input')[0] as HTMLElement).focus()
    await userEvent.keyboard('{ArrowUp}5{ArrowRight}')
    expect(change).not.toHaveBeenCalled()
    expect(document.activeElement?.getAttribute('data-segment')).toBe('minute')
    expect(document.querySelector<HTMLInputElement>('input[name="opens"]')?.value).toBe('09:00:00')
  })
})

describe('DatePicker', () => {
  it('reports the date typed into its segments, in the locale’s order, as each digit makes one', async () => {
    const change = vi.fn()
    await render(DatePicker, { locale: 'en-US', 'aria-label': 'Due date', onChange: change })
    expect(segments('date-picker').map((segment) => segment.dataset.segment)).toEqual([
      'month',
      'day',
      'year',
    ])
    ;(segments('date-picker')[0] as HTMLElement).focus()
    await userEvent.keyboard('0715')
    expect(change).not.toHaveBeenCalled()
    await userEvent.keyboard('2026')
    await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(4))
    const date = change.mock.calls.at(-1)?.[0] as CalendarDate
    expect(date).toBeInstanceOf(CalendarDate)
    expect(date.toString()).toBe('2026-07-15')
  })

  it('sets the date a day is chosen for, keeps the time, closes and returns focus to the trigger', async () => {
    const change = vi.fn()
    await render(DatePicker, {
      locale: 'en-US',
      granularity: 'minute',
      defaultValue: new CalendarDateTime(2026, 7, 15, 9, 30),
      'aria-label': 'Due date and time',
      onChange: change,
    })
    await userEvent.click(trigger('date-picker') as HTMLElement)
    await vi.waitFor(() => expect(day('date-picker', '2026-07-20')).toBeDefined())
    await userEvent.click(day('date-picker', '2026-07-20') as HTMLElement)
    await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1))
    expect((change.mock.calls[0]?.[0] as CalendarDateTime).toString()).toBe('2026-07-20T09:30:00')
    await vi.waitFor(() => expect(panel('date-picker')).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger('date-picker')))
  })

  it('clears to placeholders, reports null, and moves focus to the first segment', async () => {
    const change = vi.fn()
    await render(DatePicker, {
      clearable: true,
      defaultValue: new CalendarDate(2026, 7, 15),
      'aria-label': 'Due date',
      onChange: change,
    })
    const clear = document.querySelector<HTMLElement>(
      '[data-member="date-picker"] button[aria-label="Clear"]',
    )
    await userEvent.click(clear as HTMLElement)
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith(null))
    expect(
      segments('date-picker').every((segment) => segment.hasAttribute('data-placeholder')),
    ).toBe(true)
    expect(document.activeElement).toBe(segments('date-picker')[0])
  })
})

describe('DateRangePicker', () => {
  const REPORT = { start: new CalendarDate(2026, 6, 1), end: new CalendarDate(2026, 6, 14) }

  it('names each day as React Aria does: a day of the range selected, and today as today', async () => {
    const { unmount } = await render(DateRangePicker, {
      defaultOpen: true,
      defaultValue: REPORT,
      'aria-label': 'Report range',
    })
    await vi.waitFor(() => expect(days('date-range-picker').length).toBeGreaterThan(0))
    expect(day('date-range-picker', '2026-06-05')?.getAttribute('aria-label')).toMatch(/ selected$/)
    expect(day('date-range-picker', '2026-06-20')?.getAttribute('aria-label')).not.toMatch(
      /selected|Today/,
    )
    unmount()

    const now = new Date()
    const today = new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
    await render(DateRangePicker, {
      defaultOpen: true,
      defaultValue: { start: today, end: today },
      'aria-label': 'Report range, today',
    })
    await vi.waitFor(() => expect(day('date-range-picker', today.toString())).toBeDefined())
    expect(day('date-range-picker', today.toString())?.getAttribute('aria-label')).toMatch(
      /^Today, .+ selected$/,
    )
  })

  it('draws the committed range as a start, its middles and an end, and a one-day range as both ends', async () => {
    const { unmount } = await render(DateRangePicker, {
      defaultOpen: true,
      defaultValue: REPORT,
      'aria-label': 'Report range',
    })
    await vi.waitFor(() => expect(days('date-range-picker').length).toBeGreaterThan(0))
    const marked = (attribute: string) =>
      days('date-range-picker')
        .filter((element) => element.hasAttribute(attribute))
        .map((element) => element.getAttribute('data-value'))
    expect(marked('data-range-start')).toEqual(['2026-06-01'])
    expect(marked('data-range-end')).toEqual(['2026-06-14'])
    expect(marked('data-range-middle')).toHaveLength(12)
    expect(marked('data-selected')).toEqual([])
    unmount()

    const one = new CalendarDate(2026, 6, 8)
    await render(DateRangePicker, {
      defaultOpen: true,
      defaultValue: { start: one, end: one },
      'aria-label': 'Report range, one day',
    })
    await vi.waitFor(() => expect(days('date-range-picker').length).toBeGreaterThan(0))
    const eighth = day('date-range-picker', '2026-06-08') as HTMLElement
    expect(eighth.hasAttribute('data-range-start') && eighth.hasAttribute('data-range-end')).toBe(
      true,
    )
    expect(
      days('date-range-picker').some((element) => element.hasAttribute('data-range-middle')),
    ).toBe(false)
  })

  it('commits the second choice, filling both fields and closing the popup', async () => {
    const change = vi.fn()
    await render(DateRangePicker, {
      locale: 'en-US',
      defaultValue: REPORT,
      'aria-label': 'Report range',
      onChange: change,
    })
    await userEvent.click(trigger('date-range-picker') as HTMLElement)
    await vi.waitFor(() => expect(day('date-range-picker', '2026-06-03')).toBeDefined())
    await userEvent.click(day('date-range-picker', '2026-06-03') as HTMLElement)
    expect(change).not.toHaveBeenCalled()
    await userEvent.click(day('date-range-picker', '2026-06-09') as HTMLElement)
    await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1))
    const range = change.mock.calls[0]?.[0] as { start: CalendarDate; end: CalendarDate }
    expect([range.start.toString(), range.end.toString()]).toEqual(['2026-06-03', '2026-06-09'])
    await vi.waitFor(() => expect(panel('date-range-picker')).toBeNull())
    expect(texts('date-range-picker')).toEqual(['6', '3', '2026', '6', '9', '2026'])
  })

  it('cancels a span in progress on the first Escape, keeping the range, and closes on the second', async () => {
    const change = vi.fn()
    await render(DateRangePicker, {
      defaultValue: REPORT,
      'aria-label': 'Report range',
      onChange: change,
    })
    ;(segments('date-range-picker')[0] as HTMLElement).focus()
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('data-calendar-part')).toBe('day'),
    )
    // Down a week from the range's start, Enter anchors a span there, and Down extends it.
    await userEvent.keyboard('{ArrowDown}{Enter}{ArrowDown}')
    await vi.waitFor(() =>
      expect(day('date-range-picker', '2026-06-08')?.hasAttribute('data-range-start')).toBe(true),
    )
    await userEvent.keyboard('{Escape}')
    // The committed range is back, and the popup is still open. A popup the first Escape closed
    // would read `closed` here, because the machine closes it in the same task as the cancel.
    await vi.waitFor(() => {
      expect(day('date-range-picker', '2026-06-01')?.hasAttribute('data-range-start')).toBe(true)
      expect(day('date-range-picker', '2026-06-14')?.hasAttribute('data-range-end')).toBe(true)
    })
    expect(panel('date-range-picker')?.getAttribute('data-state')).toBe('open')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel('date-range-picker')).toBeNull())
    expect(change).not.toHaveBeenCalled()
  })
})
