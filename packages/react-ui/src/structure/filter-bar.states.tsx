'use client'

import { type ComponentStates } from '@polymorph/react'
import { SearchInput } from '../controls/SearchInput'
import { Select } from '../controls/Select'
import { FilterBar } from './FilterBar'

/** States fixture, from `design/components/filter-bar.md`'s States table. */

const noop = () => {}

const STATUS = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'solved', label: 'Solved' },
]

const PRIORITY = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
]

const SEARCH = <SearchInput size="sm" shortcut="⌘K" aria-label="Search tickets" />

export const states: ComponentStates = {
  component: 'FilterBar',

  entries: [
    {
      name: 'nothing set — no offer to clear what nobody filtered',
      render: () => (
        <FilterBar search={SEARCH} isFiltered={false} onClear={noop}>
          <Select size="sm" options={STATUS} emptyOption="Any status" aria-label="Status" />
        </FilterBar>
      ),
      expect: { 'data-filtered': null },
    },
    {
      name: 'filtered — the clear affordance arrives',
      render: () => (
        <FilterBar search={SEARCH} isFiltered onClear={noop}>
          <Select
            size="sm"
            options={STATUS}
            emptyOption="Any status"
            defaultValue="open"
            aria-label="Status"
          />
        </FilterBar>
      ),
      expect: { 'data-filtered': '' },
    },
    {
      name: 'with a count, which is what a reader hears when it changes',
      render: () => (
        <FilterBar search={SEARCH} isFiltered onClear={noop} resultCount={{ shown: 4, total: 27 }}>
          <Select size="sm" options={STATUS} emptyOption="Any status" aria-label="Status" />
          <Select size="sm" options={PRIORITY} emptyOption="Any priority" aria-label="Priority" />
        </FilterBar>
      ),
    },
    {
      name: 'search alone',
      render: () => <FilterBar search={SEARCH} isFiltered={false} onClear={noop} />,
    },
    {
      name: 'enough controls to wrap',
      render: () => (
        <FilterBar search={SEARCH} isFiltered onClear={noop} resultCount={{ shown: 4, total: 27 }}>
          <Select size="sm" options={STATUS} emptyOption="Any status" aria-label="Status" />
          <Select size="sm" options={PRIORITY} emptyOption="Any priority" aria-label="Priority" />
          <Select size="sm" options={STATUS} emptyOption="Any assignee" aria-label="Assignee" />
          <Select size="sm" options={PRIORITY} emptyOption="Any channel" aria-label="Channel" />
        </FilterBar>
      ),
    },
  ],

  requiredSelectors: ['[data-filtered]'],
}
