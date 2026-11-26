import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Select, type SelectOption, type SelectOptionGroup } from './Select'

/**
 * States fixture, from `design/components/select.md`'s States table.
 *
 * The open entries portal their panel to `<body>`, so in the gallery they float over
 * the page rather than sitting in their section. This is the component's real
 * behaviour.
 */

const PRIORITIES: SelectOption[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]

const WITH_DISABLED: SelectOption[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'archived', label: 'Archived', disabled: true },
]

/** Two groups with Menu's label style. */
const GROUPED: SelectOptionGroup[] = [
  {
    label: 'Queues',
    options: [
      { value: 'billing', label: 'Billing' },
      { value: 'onboarding', label: 'Onboarding' },
    ],
  },
  {
    label: 'Archived',
    options: [
      { value: 'q3', label: 'Q3 backlog' },
      { value: 'legacy', label: 'Legacy imports' },
    ],
  },
]

/** Combobox's two-line option, used in Select. */
const DESCRIBED: SelectOption[] = [
  { value: 'urgent', label: 'Urgent', description: 'Answer within the hour' },
  { value: 'high', label: 'High', description: 'Same business day' },
  { value: 'normal', label: 'Normal', description: 'Within two days' },
]

export const states: ComponentStates = {
  component: 'Select',

  entries: [
    {
      name: 'closed rest',
      render: () => (
        <Select options={PRIORITIES} placeholder="Choose a priority" aria-label="Priority" />
      ),
      expect: { 'data-state': 'closed', 'data-size': 'md', 'data-placeholder': '' },
    },
    {
      name: 'with value',
      render: () => <Select options={PRIORITIES} defaultValue="high" aria-label="Priority" />,
      expect: { 'data-placeholder': null },
    },
    {
      // `null` held by the application is nothing chosen, so the placeholder shows.
      name: 'nothing chosen, held as null',
      render: () => (
        <Select
          options={PRIORITIES}
          placeholder="Choose a priority"
          value={null}
          aria-label="Priority"
        />
      ),
      expect: { 'data-placeholder': '' },
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <Select
              key={size}
              size={size}
              options={PRIORITIES}
              defaultValue="normal"
              aria-label={`Priority (${size})`}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'size sm',
      render: () => (
        <Select size="sm" options={PRIORITIES} defaultValue="normal" aria-label="Priority" />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <Select size="lg" options={PRIORITIES} defaultValue="normal" aria-label="Priority" />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'open',
      render: () => (
        <Select
          defaultOpen
          options={PRIORITIES}
          placeholder="Choose a priority"
          aria-label="Priority, open"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with selection',
      render: () => (
        <Select
          defaultOpen
          options={PRIORITIES}
          defaultValue="high"
          aria-label="Priority, open with a selection"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'empty choice, selected',
      render: () => (
        <Select
          options={PRIORITIES}
          emptyOption="All statuses"
          defaultValue={null}
          aria-label="Status"
        />
      ),
      // The empty choice in one assertion. "All statuses" is a chosen value, so it
      // uses `--pm-text-primary` and the trigger is not in its placeholder state.
      expect: { 'data-placeholder': null },
    },
    {
      name: 'empty choice, open',
      render: () => (
        <Select
          defaultOpen
          options={PRIORITIES}
          emptyOption="All statuses"
          aria-label="Status, open on the empty choice"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with a disabled option',
      render: () => (
        <Select
          defaultOpen
          options={WITH_DISABLED}
          defaultValue="high"
          aria-label="Priority, with a disabled option"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'grouped, open — group labels present, options selectable',
      render: () => (
        <Select
          defaultOpen
          options={GROUPED}
          placeholder="Choose a queue"
          aria-label="Queue, grouped"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'descriptions, open — two-line items',
      render: () => (
        <Select
          defaultOpen
          options={DESCRIBED}
          defaultValue="high"
          aria-label="Priority, with descriptions"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'invalid',
      render: () => (
        <Select invalid options={PRIORITIES} placeholder="Required" aria-label="Priority" />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => (
        <Select disabled options={PRIORITIES} defaultValue="normal" aria-label="Priority" />
      ),
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="open"]',
    '[data-highlighted]',
    '[data-state="checked"]',
    '[data-invalid]',
    '[data-disabled]',
  ],
}
