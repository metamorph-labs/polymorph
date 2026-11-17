import { type ComponentStates } from '@polymorph/react'
import { CheckboxGroup, type CheckboxGroupOption } from './CheckboxGroup'
import { FormField } from './FormField'

/** States fixture, from `design/components/checkbox-group.md`'s States table. */

const NOTIFY: CheckboxGroupOption[] = [
  { value: 'replies', label: 'Replies' },
  { value: 'status', label: 'Status changes' },
  { value: 'assignments', label: 'Assignments' },
]

const DESCRIBED: CheckboxGroupOption[] = [
  { value: 'replies', label: 'Replies', description: 'Every public reply on the ticket.' },
  { value: 'status', label: 'Status changes', description: 'Open, pending and solved.' },
  {
    value: 'assignments',
    label: 'Assignments',
    description: 'When the ticket moves to another agent.',
  },
]

export const states: ComponentStates = {
  component: 'CheckboxGroup',

  entries: [
    {
      name: 'none checked — an empty answer is an answer',
      render: () => <CheckboxGroup options={NOTIFY} aria-label="Notify the reporter about" />,
      expect: { role: 'group', 'data-orientation': 'vertical' },
    },
    {
      name: 'two checked',
      render: () => (
        <CheckboxGroup
          options={NOTIFY}
          defaultValue={['replies', 'status']}
          aria-label="Notify the reporter about"
        />
      ),
    },
    {
      name: 'descriptions — the two-line item register',
      render: () => <CheckboxGroup options={DESCRIBED} aria-label="Notify the reporter about" />,
    },
    {
      name: 'horizontal — three short labels at most',
      render: () => (
        <CheckboxGroup
          options={NOTIFY}
          orientation="horizontal"
          defaultValue={['replies']}
          aria-label="Notify the reporter about"
        />
      ),
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'invalid',
      render: () => (
        <CheckboxGroup options={NOTIFY} invalid aria-label="Notify the reporter about" />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'the whole group disabled',
      render: () => (
        <CheckboxGroup
          options={NOTIFY}
          defaultValue={['status']}
          disabled
          aria-label="Notify the reporter about"
        />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'one option disabled',
      render: () => (
        <CheckboxGroup
          options={[
            { value: 'replies', label: 'Replies' },
            { value: 'status', label: 'Status changes' },
            { value: 'assignments', label: 'Assignments', disabled: true },
          ]}
          defaultValue={['replies']}
          aria-label="Notify the reporter about"
        />
      ),
    },
    {
      name: 'via FormField — the question is the field label',
      render: () => (
        <FormField
          label="Notify the reporter about"
          description="You can change this per ticket."
          required
        >
          <CheckboxGroup options={NOTIFY} defaultValue={['replies']} />
        </FormField>
      ),
      expect: { 'data-kind': 'group' },
    },
  ],

  /*
   * RadioGroup's set plus `[data-required]`. Each one is implemented in the composed checkbox
   * stylesheet, which defines the box, except the group-level `[data-invalid]`, which this member
   * adds.
   */
  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="checked"]',
    '[data-disabled]',
    '[data-invalid]',
    '[data-required]',
  ],
}
