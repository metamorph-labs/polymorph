import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { FormField } from './FormField'
import { Input } from './Input'
import { MonthInput } from './MonthInput'

/**
 * States fixture, from `design/components/month-input.md`'s States table.
 *
 * Fixed months rather than "this month", for the same reason as DatePicker. The states show
 * how a month is displayed, and a gallery entry that changes every month cannot be compared
 * with the previous one.
 */

/** A card's expiry, the spec's own example. */
const EXPIRY = '2029-08'

export const states: ComponentStates = {
  component: 'MonthInput',

  entries: [
    {
      name: 'empty',
      render: () => <MonthInput aria-label="Expires" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'filled',
      render: () => <MonthInput defaultValue={EXPIRY} aria-label="Expires" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <MonthInput
              key={size}
              size={size}
              defaultValue={EXPIRY}
              aria-label={`Expires (${size})`}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'out-of-range value',
      render: () => (
        <MonthInput
          min="2026-03"
          max="2027-02"
          defaultValue="2026-02"
          aria-label="Billing month, before the first allowed month"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'locale order — en-US',
      render: () => <MonthInput locale="en-US" defaultValue={EXPIRY} aria-label="Expires" />,
    },
    {
      // The year first, as the locale writes a month.
      name: 'locale order — ja-JP',
      render: () => <MonthInput locale="ja-JP" defaultValue={EXPIRY} aria-label="有効期限" />,
    },
    {
      // A right-to-left language. The document's `dir` turns the row; the locale orders it.
      name: 'right-to-left locale — he-IL',
      render: () => <MonthInput locale="he-IL" defaultValue={EXPIRY} aria-label="תוקף" />,
    },
    {
      name: 'readOnly',
      render: () => <MonthInput readOnly defaultValue={EXPIRY} aria-label="Expires" />,
      expect: { 'data-readonly': '' },
    },
    {
      name: 'invalid',
      render: () => <MonthInput invalid aria-label="Expires, required" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <MonthInput disabled defaultValue={EXPIRY} aria-label="Expires" />,
      expect: { 'data-disabled': '' },
    },
    {
      // The site the member was made for: a card's expiry, typed beside its number.
      name: 'expiry form',
      render: () => (
        <Inline gap={4} align="start" wrap>
          <FormField label="Card number">
            <Input autoComplete="cc-number" />
          </FormField>
          <FormField label="Expires">
            <MonthInput min="2020-01" name="expiry" />
          </FormField>
        </Inline>
      ),
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
