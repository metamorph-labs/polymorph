import { CalendarDate, CalendarDateTime } from '@internationalized/date'

import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { DatePicker } from './DatePicker'

/**
 * States fixture, from `design/components/date-picker.md`'s States table.
 *
 * Fixed dates rather than "today", because the field's states are about the *shape* of a date,
 * and a gallery cell that changes every day cannot be compared over time.
 */

const JULY = new CalendarDate(2026, 7, 15)
const LATE_JULY = new CalendarDate(2026, 7, 28)

export const states: ComponentStates = {
  component: 'DatePicker',

  entries: [
    {
      name: 'empty',
      render: () => <DatePicker aria-label="Due date" />,
      expect: { 'data-state': 'closed', 'data-size': 'md' },
    },
    {
      name: 'filled',
      render: () => <DatePicker defaultValue={JULY} aria-label="Due date" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <DatePicker key={size} size={size} defaultValue={JULY} aria-label={`Due (${size})`} />
          ))}
        </Inline>
      ),
    },
    {
      name: 'open',
      render: () => (
        <DatePicker defaultOpen defaultValue={JULY} aria-label="Due date, open on its month" />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'locale order — en-US',
      render: () => <DatePicker locale="en-US" defaultValue={JULY} aria-label="Due date (en-US)" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'locale order — de-DE',
      render: () => <DatePicker locale="de-DE" defaultValue={JULY} aria-label="Fällig (de-DE)" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'clearable',
      render: () => <DatePicker clearable defaultValue={JULY} aria-label="Due date" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'out-of-range value',
      render: () => (
        <DatePicker
          defaultValue={LATE_JULY}
          maxValue={new CalendarDate(2026, 7, 20)}
          aria-label="Due date, past the last allowed day"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      // A time granularity adds time segments after the date, in one field.
      name: 'datetime',
      render: () => (
        <DatePicker
          granularity="minute"
          defaultValue={new CalendarDateTime(2026, 7, 15, 9, 30)}
          aria-label="Due date and time"
        />
      ),
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'invalid',
      render: () => <DatePicker invalid aria-label="Due date, required" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <DatePicker disabled defaultValue={JULY} aria-label="Due date" />,
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':focus-visible',
    '[data-state="open"]',
    '[data-placeholder]',
    '[data-invalid]',
    '[data-disabled]',
  ],
}
