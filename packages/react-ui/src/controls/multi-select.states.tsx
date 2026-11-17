import { type ComponentStates } from '@polymorph/react'
import { MultiSelect, type MultiSelectOption } from './MultiSelect'

/**
 * States fixture, from `design/components/multi-select.md`'s States table.
 *
 * The open entries use `defaultOpen`. The filtered ones set the query with
 * `defaultInputValue`, because a fixture cannot type and the spec's table includes
 * "open filtered".
 */

const ASSIGNEES: MultiSelectOption[] = [
  { value: 'ada', label: 'Ada Lovelace', description: 'Support · London' },
  { value: 'grace', label: 'Grace Hopper', description: 'Support · New York' },
  { value: 'alan', label: 'Alan Turing', description: 'Escalations · Manchester' },
  { value: 'annie', label: 'Annie Easley', description: 'Billing · Cleveland' },
  { value: 'edsger', label: 'Edsger Dijkstra', description: 'On leave', disabled: true },
  { value: 'katherine', label: 'Katherine Johnson', description: 'Escalations · Hampton' },
]

const WATCHERS: MultiSelectOption[] = [
  'needs-triage',
  'customer-reported',
  'billing',
  'regression',
  'blocked-on-vendor',
  'good-first-issue',
  'awaiting-response',
  'security-review',
].map((label) => ({ value: label, label }))

const FIRST_THREE = ['ada', 'grace', 'alan']

export const states: ComponentStates = {
  component: 'MultiSelect',

  entries: [
    {
      name: 'empty',
      render: () => (
        <MultiSelect options={ASSIGNEES} placeholder="Add assignees…" aria-label="Assignees" />
      ),
      expect: { 'data-state': 'closed', 'data-size': 'md' },
    },
    {
      name: 'with chips — options order, never click order',
      render: () => (
        <MultiSelect options={ASSIGNEES} defaultValue={FIRST_THREE} aria-label="Assignees" />
      ),
    },
    {
      name: 'wrapped — the container grew',
      render: () => (
        <MultiSelect
          options={WATCHERS}
          defaultValue={WATCHERS.map((option) => option.value)}
          aria-label="Labels"
        />
      ),
    },
    {
      name: 'open filtered — a typed query, first option highlighted',
      render: () => (
        <MultiSelect
          defaultOpen
          defaultInputValue="an"
          options={ASSIGNEES}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with selections — check glyphs say chosen',
      render: () => (
        <MultiSelect
          defaultOpen
          options={ASSIGNEES}
          defaultValue={FIRST_THREE}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'loading — skeleton rows hold the panel',
      render: () => <MultiSelect loading defaultOpen options={ASSIGNEES} aria-label="Assignees" />,
      expect: { 'data-loading': '' },
    },
    {
      name: 'empty results — a sentence, not a scene',
      render: () => (
        <MultiSelect
          defaultOpen
          defaultInputValue="zzz"
          options={ASSIGNEES}
          aria-label="Assignees"
        />
      ),
    },
    {
      name: 'at max — the input goes read-only, unchecked options refuse',
      render: () => (
        <MultiSelect
          defaultOpen
          max={3}
          options={ASSIGNEES}
          defaultValue={FIRST_THREE}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-at-max': '' },
    },
    {
      name: 'custom — the mint row offers what the list lacks',
      render: () => (
        <MultiSelect
          allowCustom
          defaultOpen
          defaultInputValue="on-call rotation"
          options={ASSIGNEES}
          aria-label="Labels"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'custom — the minted chip stands, labelled by its value',
      render: () => (
        <MultiSelect
          allowCustom
          options={ASSIGNEES}
          defaultValue={['ada', 'on-call rotation']}
          aria-label="Labels"
        />
      ),
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'loading more — the next page rides below the rows',
      render: () => (
        <MultiSelect
          loading
          defaultOpen
          options={ASSIGNEES}
          defaultValue={FIRST_THREE.slice(0, 2)}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-loading': '' },
    },
    {
      name: 'size sm',
      render: () => (
        <MultiSelect
          size="sm"
          options={ASSIGNEES}
          defaultValue={FIRST_THREE.slice(0, 2)}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <MultiSelect
          size="lg"
          options={ASSIGNEES}
          defaultValue={FIRST_THREE.slice(0, 2)}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      render: () => (
        <MultiSelect
          invalid
          options={ASSIGNEES}
          defaultValue={FIRST_THREE}
          aria-label="Assignees"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled — the removes go with the affordance',
      render: () => (
        <MultiSelect
          disabled
          options={ASSIGNEES}
          defaultValue={FIRST_THREE}
          aria-label="Assignees"
        />
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
    '[data-loading]',
    '[data-at-max]',
    '[data-removing]',
    '[data-invalid]',
    '[data-disabled]',
  ],
}
