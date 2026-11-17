import { CalendarDate, getLocalTimeZone } from '@internationalized/date'

import { type ComponentStates } from '@polymorph/react'
import { Calendar } from './Calendar'

/**
 * States fixture, from `design/components/calendar.md`'s States table.
 *
 * This component's state attributes (`data-selected`, `data-today`, `data-unavailable`) are on
 * its *cells*, but the completeness law's `expect` reads the entry's root. So each entry asserts
 * only what is true of the root, and the cell-level assertions are in `dates.test.tsx`, where a
 * real grid can be queried. Without them, this fixture would name states that nothing checks.
 *
 * Entries use fixed dates rather than "now" unless the state depends on the current month,
 * because a gallery cell that changes every month cannot be compared over time. The month is set
 * with `defaultValue` rather than `focusedValue`. A *controlled* focus with no handler would make
 * the arrow keys and header buttons do nothing, and the gallery cell could not be navigated.
 *
 * `role="application"` comes from React Aria, and asserting it is deliberate. React Aria wraps a
 * calendar in it so that a screen reader in browse mode passes the arrow keys to the grid instead
 * of consuming them. If a future version stops doing that, the keyboard model changes and these
 * entries fail.
 */

const JULY = new CalendarDate(2026, 7, 15)
const MID_JULY = JULY

/** Weekends, the usual shape of a booked-out predicate. */
const weekendsOut = (date: CalendarDate) => {
  const day = date.toDate(getLocalTimeZone()).getDay()
  return day === 0 || day === 6
}

export const states: ComponentStates = {
  component: 'Calendar',

  entries: [
    {
      name: 'month with selection',
      render: () => <Calendar defaultValue={MID_JULY} aria-label="Due date" />,
      expect: { role: 'application' },
    },
    {
      name: 'today visible',
      render: () => <Calendar aria-label="Due date, this month" />,
      expect: { role: 'application' },
    },
    {
      name: 'min/max bounds',
      render: () => (
        <Calendar
          defaultValue={JULY}
          minValue={new CalendarDate(2026, 7, 10)}
          maxValue={new CalendarDate(2026, 7, 20)}
          aria-label="Due date, within a narrow range"
        />
      ),
      expect: { role: 'application' },
    },
    {
      name: 'unavailable dates',
      render: () => (
        <Calendar
          defaultValue={JULY}
          isDateUnavailable={weekendsOut}
          aria-label="Due date, weekdays only"
        />
      ),
      expect: { role: 'application' },
    },
    {
      name: 'week start override',
      render: () => (
        <Calendar defaultValue={JULY} firstDayOfWeek={1} aria-label="Due date, weeks from Monday" />
      ),
      expect: { role: 'application' },
    },
    {
      name: 'another locale',
      render: () => <Calendar defaultValue={JULY} locale="de-DE" aria-label="Fälligkeitsdatum" />,
      expect: { role: 'application' },
    },
    {
      name: 'disabled',
      render: () => (
        <Calendar disabled defaultValue={MID_JULY} aria-label="Due date, unavailable" />
      ),
      expect: { role: 'application' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-selected]',
    '[data-today]',
    '[data-unavailable]',
  ],
}
