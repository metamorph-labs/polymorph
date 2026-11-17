import { type ComponentStates } from '@polymorph/react'
import { FormField } from './FormField'
import { RadioGroup } from './Radio'

/** States fixture, from `design/components/radio.md`'s States table. */

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' },
]

export const states: ComponentStates = {
  component: 'RadioGroup',

  entries: [
    {
      name: 'nothing chosen yet',
      render: () => <RadioGroup options={PLANS} aria-label="Plan" />,
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'one chosen',
      render: () => <RadioGroup options={PLANS} defaultValue="team" aria-label="Plan" />,
    },
    {
      name: 'horizontal — three short labels at most',
      render: () => (
        <RadioGroup
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          orientation="horizontal"
          defaultValue="yes"
          aria-label="Notify"
        />
      ),
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'invalid',
      render: () => <RadioGroup options={PLANS} invalid aria-label="Plan" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'the whole group disabled',
      render: () => <RadioGroup options={PLANS} defaultValue="team" disabled aria-label="Plan" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'one option disabled — the plan you cannot pick yet',
      render: () => (
        <RadioGroup
          options={[
            { value: 'starter', label: 'Starter' },
            { value: 'team', label: 'Team' },
            { value: 'enterprise', label: 'Enterprise (contact sales)', disabled: true },
          ]}
          defaultValue="starter"
          aria-label="Plan"
        />
      ),
    },
    {
      name: 'in a FormField — the label is the question',
      render: () => (
        <FormField label="Which plan?" description="You can change this at any time." required>
          <RadioGroup options={PLANS} defaultValue="team" />
        </FormField>
      ),
    },
    {
      name: 'in a FormField, in error',
      render: () => (
        <FormField label="Which plan?" error="Pick a plan to continue.">
          <RadioGroup options={PLANS} />
        </FormField>
      ),
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="checked"]',
    '[data-disabled]',
    '[data-invalid]',
  ],
}
