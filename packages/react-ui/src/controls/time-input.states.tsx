import { Time } from '@internationalized/date'

import { type ComponentStates } from '@polymorph/react'
import { TimeInput } from './TimeInput'

/**
 * States fixture, from `design/components/time-input.md`'s States table.
 *
 * Fixed times rather than "now", for the same reason as DatePicker. The states show how
 * a time is displayed, and a gallery entry that changes every day cannot be compared
 * with the previous day's.
 */

/** The start of business hours, the spec's own example. */
const NINE = new Time(9, 0)

export const states: ComponentStates = {
  component: 'TimeInput',

  entries: [
    {
      name: 'empty',
      render: () => <TimeInput aria-label="Opens at" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'filled',
      render: () => <TimeInput defaultValue={NINE} aria-label="Opens at" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: '24-hour',
      render: () => <TimeInput hourCycle={24} defaultValue={NINE} aria-label="Opens at" />,
    },
    {
      name: 'locale cycle',
      render: () => <TimeInput locale="de-DE" defaultValue={NINE} aria-label="Öffnet um" />,
    },
    {
      name: 'hour only',
      render: () => (
        <TimeInput granularity="hour" defaultValue={NINE} aria-label="Quiet hours from" />
      ),
    },
    {
      name: 'readOnly',
      render: () => <TimeInput readOnly defaultValue={NINE} aria-label="Opens at" />,
      expect: { 'data-readonly': '' },
    },
    {
      name: 'invalid',
      render: () => <TimeInput invalid aria-label="Opens at, required" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <TimeInput disabled defaultValue={NINE} aria-label="Opens at" />,
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':focus-visible',
    '[data-placeholder]',
    '[data-invalid]',
    '[data-disabled]',
    '[data-readonly]',
  ],
}
