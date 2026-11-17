import { type ComponentStates } from '@polymorph/react'
import { DurationInput } from './DurationInput'

/**
 * States fixture, from `design/components/duration-input.md`'s States table.
 *
 * The values are the surveyed screens' own: an inactivity lifetime of seven days, an
 * absolute lifetime of thirty, and a five-minute timeout.
 */

/** Seven days, the longest inactivity lifetime the session policies allow. */
const WEEK = 604_800

export const states: ComponentStates = {
  component: 'DurationInput',

  entries: [
    {
      name: 'empty',
      render: () => <DurationInput aria-label="Inactivity lifetime" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'filled',
      render: () => <DurationInput defaultValue={WEEK} aria-label="Inactivity lifetime" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'days only',
      render: () => (
        <DurationInput units={['days']} defaultValue={2_592_000} aria-label="Absolute lifetime" />
      ),
    },
    {
      name: 'with seconds',
      render: () => (
        <DurationInput
          units={['minutes', 'seconds']}
          defaultValue={300}
          aria-label="Request timeout"
        />
      ),
    },
    {
      name: 'bounded',
      render: () => (
        <DurationInput min={900} max={WEEK} defaultValue={900} aria-label="Inactivity lifetime" />
      ),
    },
    {
      name: 'remainder',
      render: () => (
        <DurationInput units={['minutes']} defaultValue={90} aria-label="Grace period" />
      ),
    },
    {
      name: 'locale',
      render: () => (
        <DurationInput locale="de-DE" defaultValue={5_400} aria-label="Inaktivitätsdauer" />
      ),
    },
    {
      name: 'sm',
      render: () => (
        <DurationInput size="sm" defaultValue={WEEK} aria-label="Inactivity lifetime" />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'readOnly',
      render: () => <DurationInput readOnly defaultValue={WEEK} aria-label="Inactivity lifetime" />,
      expect: { 'data-readonly': '' },
    },
    {
      name: 'invalid',
      render: () => <DurationInput invalid aria-label="Inactivity lifetime, required" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <DurationInput disabled defaultValue={WEEK} aria-label="Inactivity lifetime" />,
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
