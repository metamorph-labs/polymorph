import { type ComponentStates } from '@polymorph/react'
import { FormField } from './FormField'
import { SearchInput } from './SearchInput'

/** States fixture, from `design/components/search-input.md`'s States table. */

export const states: ComponentStates = {
  component: 'SearchInput',

  entries: [
    {
      name: 'empty, offering the shortcut that reaches it',
      render: () => <SearchInput shortcut="⌘K" aria-label="Search tickets" />,
      expect: { 'data-shortcut': '' },
    },
    {
      name: 'with a value — the hint yields to the clear button',
      render: () => (
        <SearchInput defaultValue="webhook" shortcut="⌘K" aria-label="Search tickets" />
      ),
      expect: { 'data-shortcut': null },
    },
    {
      name: 'no shortcut at all',
      render: () => <SearchInput aria-label="Search tickets" />,
      expect: { 'data-shortcut': null },
    },
    {
      name: 'small — the size a filter row uses',
      render: () => <SearchInput size="sm" shortcut="⌘K" aria-label="Search tickets" />,
    },
    {
      name: 'disabled — nothing to reach, so nothing to hint at',
      render: () => <SearchInput disabled shortcut="⌘K" aria-label="Search tickets" />,
      expect: { 'data-shortcut': null },
    },
    {
      // Every other entry renders at its own width, where a stretched root and a
      // field that fills it look the same. This entry shows whether the Input inside
      // fills the root or only sizes to its content.
      name: 'in a column that stretches it — the field is as wide as it is given',
      render: () => (
        <FormField label="Search accounts">
          <SearchInput placeholder="Search accounts…" />
        </FormField>
      ),
      expect: { 'data-kind': 'field' },
    },
  ],

  requiredSelectors: ['[data-shortcut]'],
}
