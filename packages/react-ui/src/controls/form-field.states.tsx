import { type ComponentStates } from '@polymorph/react'
import { Checkbox } from './Checkbox'
import { FormField } from './FormField'
import { Input } from './Input'
import { Link } from './Link'
import { Select } from './Select'
import { Switch } from './Switch'

/** States fixture, from `design/components/form-field.md`'s States table. */

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

export const states: ComponentStates = {
  component: 'FormField',

  entries: [
    {
      name: 'plain',
      render: () => (
        <FormField label="Subject">
          <Input placeholder="What went wrong?" />
        </FormField>
      ),
    },
    {
      name: 'described',
      render: () => (
        <FormField label="Subject" description="One line, as the customer would say it.">
          <Input placeholder="What went wrong?" />
        </FormField>
      ),
    },
    {
      name: 'required',
      render: () => (
        <FormField required label="Subject">
          <Input placeholder="What went wrong?" />
        </FormField>
      ),
    },
    {
      // The login block's password row: the recovery link belongs beside the label, not below the
      // field.
      name: 'labelEnd — the row has two ends',
      render: () => (
        <FormField
          label="Password"
          labelEnd={
            <Link href="#reset" variant="standalone">
              Forgot your password?
            </Link>
          }
        >
          <Input type="password" autoComplete="current-password" />
        </FormField>
      ),
    },
    {
      name: 'labelEnd, required and in error — the row holds all three',
      render: () => (
        <FormField
          required
          label="Password"
          error="That password does not match."
          labelEnd={
            <Link href="#reset" variant="standalone">
              Forgot your password?
            </Link>
          }
        >
          <Input type="password" autoComplete="current-password" />
        </FormField>
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'error',
      render: () => (
        <FormField label="Subject" error="A subject is required.">
          <Input />
        </FormField>
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'error replaces description',
      render: () => (
        <FormField
          label="Subject"
          description="One line, as the customer would say it."
          error="A subject is required."
        >
          <Input />
        </FormField>
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled control',
      render: () => (
        <FormField label="Subject" description="Locked while the ticket is closed.">
          <Input disabled defaultValue="Login loop" />
        </FormField>
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'with Select',
      render: () => (
        <FormField required label="Priority" description="How fast this needs an answer.">
          <Select options={PRIORITIES} placeholder="Choose one" />
        </FormField>
      ),
    },
    {
      name: 'with Select, in error',
      render: () => (
        <FormField required label="Priority" error="Pick a priority before sending.">
          <Select options={PRIORITIES} placeholder="Choose one" />
        </FormField>
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'with Checkbox — the field label becomes the row label',
      render: () => (
        <FormField label="Email me about replies" description="You can turn this off later.">
          <Checkbox />
        </FormField>
      ),
    },
    {
      name: 'with Checkbox, in error',
      render: () => (
        <FormField label="Accept the terms" error="You have to accept the terms to continue.">
          <Checkbox />
        </FormField>
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'required Checkbox — the row carries the marker',
      render: () => (
        <FormField required label="Accept the terms">
          <Checkbox />
        </FormField>
      ),
    },
    {
      name: 'with Switch',
      render: () => (
        <FormField label="Desktop notifications">
          <Switch />
        </FormField>
      ),
    },
    {
      name: 'described Switch — the message sits below the row',
      render: () => (
        <FormField
          label="Send a daily digest"
          description="One summary each morning instead of a notification per reply. Long enough to wrap, because the message runs the full width of the field and is not indented under the row label."
        >
          <Switch />
        </FormField>
      ),
    },
  ],

  requiredSelectors: ['[data-invalid]', '[data-disabled]'],
}
