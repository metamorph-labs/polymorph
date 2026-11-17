import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Checkbox } from './Checkbox'

/**
 * States fixture, from `design/components/checkbox.md`'s States table.
 *
 * The spec's last row expects `aria-label` on the unlabelled checkbox. The attribute is on the
 * control, which *is* the root in that case, so the fixture can assert it here.
 * `checkbox.test.tsx` also checks it as an accessible name, which is what matters.
 */

export const states: ComponentStates = {
  component: 'Checkbox',

  entries: [
    {
      name: 'unchecked',
      render: () => <Checkbox label="Email me about replies" />,
      expect: { 'data-state': 'unchecked' },
    },
    {
      name: 'checked',
      render: () => <Checkbox defaultChecked label="Email me about replies" />,
      expect: { 'data-state': 'checked' },
    },
    {
      name: 'indeterminate',
      render: () => <Checkbox checked="indeterminate" label="Select all" />,
      expect: { 'data-state': 'indeterminate' },
    },
    {
      name: 'invalid',
      render: () => <Checkbox invalid label="Accept the terms" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'required — the marker the field row cannot render for it',
      render: () => <Checkbox aria-required label="Accept the terms" />,
      expect: { 'data-required': '' },
    },
    {
      name: 'disabled',
      render: () => <Checkbox disabled label="Email me about replies" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'disabled checked',
      render: () => <Checkbox disabled defaultChecked label="Email me about replies" />,
      expect: { 'data-disabled': '', 'data-state': 'checked' },
    },
    {
      name: 'no label — a Table selection cell',
      render: () => <Checkbox aria-label="Select row" />,
      expect: { 'aria-label': 'Select row', 'data-state': 'unchecked' },
    },
    {
      name: 'a stack of them, so the rhythm is visible',
      render: () => (
        <Stack gap={2}>
          <Checkbox defaultChecked label="Urgent" />
          <Checkbox label="Waiting on customer" />
          <Checkbox label="A label long enough to wrap onto a second line, so the box stays on the first" />
        </Stack>
      ),
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="checked"]',
    '[data-state="indeterminate"]',
    '[data-disabled]',
    '[data-invalid]',
    '[data-required]',
  ],
}
