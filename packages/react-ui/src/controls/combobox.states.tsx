'use client'

import { useState } from 'react'

import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Combobox, type ComboboxOption } from './Combobox'

/**
 * States fixture, from `design/components/combobox.md`'s States table.
 *
 * The open entries portal their panel to `<body>`, so in the gallery they float over the page
 * rather than sitting in their section. That is where the panel renders in real use too.
 *
 * The filtered entries are *live* rather than frozen with a controlled `inputValue` and a no-op
 * handler. A combobox is about typing, so it should be typeable in the gallery. A fixture that
 * could not be typed into would show a state the component cannot actually reach.
 */

const PEOPLE: ComboboxOption[] = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
  { value: 'katherine', label: 'Katherine Johnson' },
]

const DESCRIBED: ComboboxOption[] = [
  { value: 'ada', label: 'Ada Lovelace', description: 'Analytical engine' },
  { value: 'grace', label: 'Grace Hopper', description: 'Compilers, COBOL' },
  { value: 'alan', label: 'Alan Turing', description: 'Computability' },
]

const WITH_DISABLED: ComboboxOption[] = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'archived', label: 'Archived account', disabled: true },
]

/**
 * A kept draft (`allowsCustomValue`): a value that matches no option, kept after closing and still
 * editable. The hidden input carries the text. The unit tests check the serialization, and the
 * gallery shows the appearance.
 */
function CustomValue() {
  const [text, setText] = useState('Quarterly review')
  return (
    <Combobox
      allowsCustomValue
      options={PEOPLE}
      inputValue={text}
      onInputChange={setText}
      name="assignee"
      aria-label="Assignee, holding a custom value"
    />
  )
}

/** Open, with a query already typed, and still typeable. */
function Typed({ query, label }: { query: string; label: string }) {
  const [text, setText] = useState(query)
  return (
    <Combobox
      defaultOpen
      options={PEOPLE}
      inputValue={text}
      onInputChange={setText}
      placeholder="Search people"
      aria-label={label}
    />
  )
}

export const states: ComponentStates = {
  component: 'Combobox',

  entries: [
    {
      name: 'closed rest',
      render: () => <Combobox options={PEOPLE} placeholder="Search people" aria-label="Assignee" />,
      expect: { 'data-state': 'closed', 'data-size': 'md', 'data-loading': null },
    },
    {
      name: 'with value',
      render: () => <Combobox options={PEOPLE} defaultValue="grace" aria-label="Assignee" />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <Combobox
              key={size}
              size={size}
              options={PEOPLE}
              defaultValue="ada"
              aria-label={`Assignee (${size})`}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'size sm',
      render: () => (
        <Combobox size="sm" options={PEOPLE} defaultValue="ada" aria-label="Assignee" />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <Combobox size="lg" options={PEOPLE} defaultValue="ada" aria-label="Assignee" />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'open filtered',
      render: () => <Typed query="a" label="Assignee, filtered" />,
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with selection',
      render: () => (
        <Combobox
          defaultOpen
          options={PEOPLE}
          defaultValue="grace"
          aria-label="Assignee, open on its selection"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'loading',
      render: () => (
        <Combobox
          defaultOpen
          loading
          options={[]}
          placeholder="Search people"
          aria-label="Assignee, loading"
        />
      ),
      expect: { 'data-state': 'open', 'data-loading': '' },
    },
    {
      name: 'empty results',
      render: () => <Typed query="zzzz" label="Assignee, no matches" />,
      expect: { 'data-state': 'open' },
    },
    {
      name: 'descriptions',
      render: () => (
        <Combobox
          defaultOpen
          options={DESCRIBED}
          aria-label="Assignee, with descriptions"
          placeholder="Search people"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open with a disabled option',
      render: () => (
        <Combobox
          defaultOpen
          options={WITH_DISABLED}
          aria-label="Assignee, with a disabled option"
          placeholder="Search people"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'clearable with value',
      render: () => (
        <Combobox clearable options={PEOPLE} defaultValue="alan" aria-label="Assignee" />
      ),
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'custom value',
      render: () => <CustomValue />,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'loading more',
      render: () => (
        <Combobox
          defaultOpen
          loading
          options={PEOPLE}
          placeholder="Search people"
          aria-label="Assignee, next page loading"
        />
      ),
      expect: { 'data-state': 'open', 'data-loading': '' },
    },
    {
      name: 'invalid',
      render: () => (
        <Combobox invalid options={PEOPLE} placeholder="Required" aria-label="Assignee" />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <Combobox disabled options={PEOPLE} defaultValue="ada" aria-label="Assignee" />,
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
    '[data-invalid]',
    '[data-disabled]',
  ],
}
