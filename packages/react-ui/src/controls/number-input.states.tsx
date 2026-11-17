import { type ComponentStates } from '@polymorph/react'
import { FormField } from './FormField'
import { NumberInput } from './NumberInput'

/**
 * States fixture, from `design/components/number-input.md`'s States table.
 *
 * The rest entry renders inside a FormField because the spec's Render cell does, and
 * the label is part of the state shown. Its root is therefore the FormField's. So the
 * field-level checks (`data-size`, steppers present) are in the browser test, not in
 * `expect`, which reads only the root.
 */

export const states: ComponentStates = {
  component: 'NumberInput',

  entries: [
    {
      name: 'rest md',
      render: () => (
        <FormField label="Agents on this plan">
          <NumberInput placeholder="0" />
        </FormField>
      ),
    },
    {
      name: 'with value',
      render: () => (
        <NumberInput defaultValue={5} min={1} step={1} aria-label="Agents on this plan" />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      name: 'at the rail',
      render: () => <NumberInput defaultValue={1} min={1} aria-label="Agents on this plan" />,
    },
    {
      // The per-seat price.
      name: 'currency',
      render: () => (
        <NumberInput
          defaultValue={29}
          format={{ style: 'currency', currency: 'USD' }}
          aria-label="Price per seat"
        />
      ),
    },
    {
      // The CSAT target: the value is the ratio, the formatter draws "90%".
      name: 'percent',
      render: () => (
        <NumberInput defaultValue={0.9} format={{ style: 'percent' }} aria-label="CSAT target" />
      ),
    },
    {
      // The SLA first-response target, in a unit Intl cannot format.
      name: 'affixed',
      render: () => (
        <NumberInput suffix="hrs" defaultValue={4} aria-label="First response within" />
      ),
    },
    {
      name: 'sm',
      render: () => <NumberInput size="sm" aria-label="Agents on this plan" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'invalid',
      render: () => <NumberInput invalid aria-label="Agents on this plan" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <NumberInput disabled defaultValue={5} aria-label="Agents on this plan" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly',
      render: () => <NumberInput readOnly defaultValue={5} aria-label="Agents on this plan" />,
      expect: { 'data-readonly': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-invalid]',
    '[data-disabled]',
    '[data-readonly]',
    '::placeholder',
  ],
}
