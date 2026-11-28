import { beforeAll, describe, expect, it, vi } from 'vitest'

import { CalendarDate } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The law for the title of DateRangePicker's range grid and the grid's name
 * (`design/components/date-range-picker.md`, A11y), which every web shell's
 * test calls with a mount of its own. The grid shows one month, so its title
 * says that month and its year once, in the field's locale, and the
 * calendar's name, and the grid's, are the popup's word followed by the title,
 * as React Aria writes them. A contract statement reads a name from one prop
 * (`docs/conformance.md`), and the title is the locale's words for the month on
 * screen, so this law reads them. Each field names its locale, because Firefox
 * and WebKit otherwise take the machine's.
 */

/** The props the law mounts a DateRangePicker with. */
export interface RangeCalendarTitleProps {
  'aria-label': string
  locale: string
  defaultValue: { start: CalendarDate; end: CalendarDate }
  defaultOpen: boolean
}

export interface RangeCalendarTitleLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one DateRangePicker with these props, after any the test mounted before it. */
  mount(props: RangeCalendarTitleProps): Promise<unknown>
}

/** The report range, June 1 → 14, from the spec's example. */
const REPORT = { start: new CalendarDate(2026, 6, 1), end: new CalendarDate(2026, 6, 14) }

/** The popup's word, which names the calendar before its title by default. */
const CHOOSE = 'Choose a date range'

const WAIT = { timeout: 2000, interval: 25 }

/** The calendar of the DateRangePicker mounted last, once its popup is open. */
async function calendar(): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const element = [...document.querySelectorAll<HTMLElement>('[role="application"]')].at(-1)
    if (element === undefined) throw new Error('the DateRangePicker drew no open calendar')
    return element
  }, WAIT)
}

/** The calendar's title: the month on screen, which a screen reader hears as it changes. */
function title(root: HTMLElement): string {
  const element = root.querySelector<HTMLElement>('[aria-live="polite"]')
  if (element === null) throw new Error('the calendar has no title')
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** The calendar's grid of days. */
function grid(root: HTMLElement): HTMLElement {
  const element = root.querySelector<HTMLElement>('[role="grid"]')
  if (element === null) throw new Error('the calendar has no grid')
  return element
}

export function rangeCalendarTitleLaw({ shell, mount }: RangeCalendarTitleLaw): void {
  describe(`${shell} DateRangePicker — the title of its range grid`, () => {
    beforeAll(installTestTheme)

    for (const [locale, month] of [
      ['en-US', 'June 2026'],
      ['de-DE', 'Juni 2026'],
    ] as const) {
      it(`says the month on screen and its year once, in ${locale}`, async () => {
        await mount({
          'aria-label': 'Report range',
          locale,
          defaultValue: REPORT,
          defaultOpen: true,
        })
        const root = await calendar()
        await vi.waitFor(() => expect(title(root)).toBe(month), WAIT)
        expect(harness.nameOf(root)).toBe(`${CHOOSE}, ${month}`)
        expect(harness.nameOf(grid(root))).toBe(`${CHOOSE}, ${month}`)
      })
    }
  })
}
