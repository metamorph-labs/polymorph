import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as zag from '@zag-js/date-picker'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import Calendar from './Calendar.svelte'

/**
 * Calendar in the Svelte shell, where it says and does what the React member's
 * React Aria calendar does (`packages/react-ui/src/controls/Calendar.tsx`):
 * each day's name says whether it is today, chosen, or the first or last day
 * that can be chosen, and focus leaves a month button that becomes disabled
 * for the day the grid holds focus on.
 */

beforeAll(installTestTheme)

const date = (iso: string) => zag.parse(iso) as zag.CalendarDate

const day = (number: number) =>
  [...document.querySelectorAll<HTMLElement>('[data-calendar-part="day"]')].find(
    (cell) => cell.textContent?.trim() === String(number),
  ) as HTMLElement

describe('a day’s name', () => {
  it('says that a chosen day is selected', async () => {
    await render(Calendar, {
      defaultValue: date('2026-07-15'),
      locale: 'en-US',
      'aria-label': 'Due date',
    })
    expect(day(15).getAttribute('aria-label')).toBe('Wednesday, July 15, 2026 selected')
    expect(day(16).getAttribute('aria-label')).toBe('Thursday, July 16, 2026')
  })

  it('says which day is today, and whether it is chosen', async () => {
    const now = new Date()
    const today = date(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    )
    const { unmount } = await render(Calendar, {
      defaultValue: today,
      locale: 'en-US',
      'aria-label': 'Due date',
    })
    expect(day(today.day).getAttribute('aria-label')).toMatch(/^Today, .+ selected$/)
    unmount()
    await render(Calendar, { locale: 'en-US', 'aria-label': 'Due date' })
    expect(day(today.day).getAttribute('aria-label')).toMatch(/^Today, [^,]+, .+\d$/)
  })

  it('says which days are the first and the last that can be chosen', async () => {
    await render(Calendar, {
      defaultValue: date('2026-07-15'),
      minValue: date('2026-07-10'),
      maxValue: date('2026-07-20'),
      locale: 'en-US',
      'aria-label': 'Due date',
    })
    expect(day(10).getAttribute('aria-label')).toBe('Friday, July 10, 2026, First available date')
    expect(day(20).getAttribute('aria-label')).toBe('Monday, July 20, 2026, Last available date')
  })
})

describe('the month buttons', () => {
  it('hands focus to the grid when the focused button becomes disabled', async () => {
    const { host } = await render(Calendar, {
      defaultValue: date('2026-07-15'),
      maxValue: date('2026-08-20'),
      locale: 'en-US',
      'aria-label': 'Due date',
    })
    const next = getByRole(host, 'button', { name: 'Next month' })
    next.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(true))
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('data-calendar-part')).toBe('day'),
    )
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0')
  })
})
