import { CalendarDate } from '@internationalized/date'

import { type ComponentStates } from '@polymorph/react'
import { DateRangePicker } from './DateRangePicker'

/**
 * States fixture, from `design/components/date-range-picker.md`'s States table.
 *
 * Fixed dates rather than "today", for DatePicker's reason: the field's states are about the
 * *shape* of a range, and a gallery cell that changes every day cannot be compared over time.
 *
 * The grid-cell attributes (`data-range-start`, the middles, `data-range-end`) are in the popup,
 * which portals out of the entry's root. The browser test asserts them in the DOM. Here they are
 * `requiredSelectors`, checked against the stylesheet source.
 */

/** The report range, June 1 → 14, from the spec's example. */
const REPORT = {
  start: new CalendarDate(2026, 6, 1),
  end: new CalendarDate(2026, 6, 14),
}

export const states: ComponentStates = {
  component: 'DateRangePicker',

  entries: [
    {
      name: 'empty',
      render: () => <DateRangePicker aria-label="Report range" />,
      expect: { 'data-state': 'closed', 'data-size': 'md' },
    },
    {
      name: 'range filled',
      render: () => <DateRangePicker defaultValue={REPORT} aria-label="Report range" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'open with range',
      render: () => (
        <DateRangePicker defaultOpen defaultValue={REPORT} aria-label="Report range, open" />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'one-day range',
      render: () => (
        <DateRangePicker
          defaultOpen
          defaultValue={{ start: new CalendarDate(2026, 6, 8), end: new CalendarDate(2026, 6, 8) }}
          aria-label="Report range, one day"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'out-of-range typed',
      render: () => (
        <DateRangePicker
          defaultValue={REPORT}
          maxValue={new CalendarDate(2026, 6, 10)}
          aria-label="Report range, past the last allowed day"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      // React Aria marks the pair: end before start is invalid on both halves.
      name: 'reversed typed',
      render: () => (
        <DateRangePicker
          defaultValue={{ start: new CalendarDate(2026, 6, 14), end: new CalendarDate(2026, 6, 1) }}
          aria-label="Report range, reversed"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'unavailable inside',
      render: () => (
        <DateRangePicker
          defaultOpen
          defaultValue={REPORT}
          isDateUnavailable={(date) => date.month === 6 && date.day >= 20 && date.day <= 22}
          aria-label="Report range, with blackout days"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'clearable',
      render: () => <DateRangePicker clearable defaultValue={REPORT} aria-label="Report range" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'invalid',
      render: () => <DateRangePicker invalid aria-label="Report range, required" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <DateRangePicker disabled defaultValue={REPORT} aria-label="Report range" />,
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="open"]',
    '[data-placeholder]',
    '[data-invalid]',
    '[data-disabled]',
    '[data-range-start]',
    '[data-range-middle]',
    '[data-range-end]',
  ],
}
