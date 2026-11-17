'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { SearchInput } from '../controls/SearchInput'
import { Select } from '../controls/Select'
import { Stack } from '../layout/Stack'
import { CursorPagination } from '../structure/CursorPagination'
import { FilterBar } from '../structure/FilterBar'
import { Heading } from '../structure/Heading'
import { List } from '../structure/List'
import { SearchPage } from './SearchPage'

/**
 * States fixture, from `design/archetypes/search-page.md`'s States table.
 *
 * The workspace search of a support desk. A query finds tickets and help
 * articles, each kind its own group under its own heading.
 */

const noop = () => {}

const TICKETS = [
  {
    title: 'Webhook retries stop after the first 5xx',
    description: 'T-1019 · Northwind · open',
    meta: '2h',
    href: '#t-1019',
  },
  {
    title: 'Webhook signature fails after rotating the secret',
    description: 'T-0987 · Contoso · waiting on the customer',
    meta: '3d',
    href: '#t-0987',
  },
  {
    title: 'Duplicate webhook deliveries during the outage',
    description: 'T-0952 · Fabrikam · solved',
    meta: '2w',
    href: '#t-0952',
  },
]

const ARTICLES = [
  {
    title: 'Retrying failed webhook deliveries',
    description: 'Help centre · updated last month',
    href: '#a-retries',
  },
  {
    title: 'Verifying webhook signatures',
    description: 'Help centre · updated in March',
    href: '#a-signatures',
  },
]

const options = (...labels: string[]) =>
  labels.map((label) => ({ value: label.toLowerCase(), label }))

/** Four `sm` Selects, the filter row the page's measure is set against. */
const SELECTS = (
  <>
    <Select
      size="sm"
      aria-label="Kind"
      emptyOption="Any kind"
      options={options('Tickets', 'Articles')}
    />
    <Select
      size="sm"
      aria-label="Status"
      emptyOption="Any status"
      options={options('Open', 'Waiting', 'Solved')}
    />
    <Select
      size="sm"
      aria-label="Assignee"
      emptyOption="Anyone"
      options={options('Me', 'My team', 'Unassigned')}
    />
    <Select
      size="sm"
      aria-label="Updated"
      emptyOption="Any time"
      options={options('Today', 'This week', 'This month')}
    />
  </>
)

const FIELD = (
  <SearchInput
    aria-label="Search the workspace"
    placeholder="Search tickets and articles…"
    defaultValue="webhook"
  />
)

/** A FormField whose Input submits from its trailing Button, `loading` while a search runs. */
const submitted = (loading = false) => (
  <FormField label="Search the workspace">
    <Input
      name="q"
      defaultValue="webhook"
      trailing={
        <Button
          type="submit"
          variant="ghost"
          tone="neutral"
          size="sm"
          icon="search"
          label="Search"
          loading={loading}
        />
      }
    />
  </FormField>
)

const NOTHING = {
  icon: 'search' as const,
  title: 'Nothing matches that search',
  description: 'Check the spelling, or search with fewer filters.',
  secondaryAction: <Button variant="ghost" tone="neutral" label="Clear filters" />,
}

const tickets = (
  <List label="Tickets">
    {TICKETS.map((ticket) => (
      <List.Item key={ticket.href} {...ticket} />
    ))}
  </List>
)

/** Two groups of results, each a Heading over a List; the tickets load further windows. */
const GROUPS = (
  <>
    <Stack gap={3}>
      <Heading>Tickets</Heading>
      {tickets}
      <CursorPagination mode="append" label="Tickets" hasPrevious={false} hasNext onNext={noop} />
    </Stack>
    <Stack gap={3}>
      <Heading>Articles</Heading>
      <List label="Articles">
        {ARTICLES.map((article) => (
          <List.Item key={article.href} {...article} />
        ))}
      </List>
    </Stack>
  </>
)

export const states: ComponentStates = {
  component: 'SearchPage',

  entries: [
    {
      name: 'before a query — the field and the filters, nothing below them',
      render: () => (
        <SearchPage
          title="Search"
          description="Find tickets and help articles across the workspace."
          searchLabel="Workspace"
          search={
            <SearchInput
              aria-label="Search the workspace"
              placeholder="Search tickets and articles…"
            />
          }
          filters={SELECTS}
          emptyState={NOTHING}
        />
      ),
    },
    {
      name: 'results in groups — a heading over each kind',
      render: () => (
        <SearchPage
          title="Search"
          searchLabel="Workspace"
          search={FIELD}
          filters={SELECTS}
          emptyState={NOTHING}
        >
          {GROUPS}
        </SearchPage>
      ),
    },
    {
      name: 'one list of results — the filter row counts them',
      render: () => (
        <SearchPage
          title="Search"
          searchLabel="Workspace"
          search={FIELD}
          filters={
            <FilterBar isFiltered onClear={noop} resultCount={{ shown: 3 }}>
              <Select
                size="sm"
                aria-label="Kind"
                emptyOption="Any kind"
                defaultValue="tickets"
                options={options('Tickets', 'Articles')}
              />
            </FilterBar>
          }
          emptyState={NOTHING}
        >
          {tickets}
        </SearchPage>
      ),
    },
    {
      name: 'nothing found — the way out is a secondary action',
      render: () => (
        <SearchPage
          empty
          title="Search"
          searchLabel="Workspace"
          search={FIELD}
          filters={SELECTS}
          emptyState={NOTHING}
        >
          {GROUPS}
        </SearchPage>
      ),
      expect: { 'data-empty': '' },
    },
    {
      name: 'searching — the last results stay, marked busy',
      render: () => (
        <SearchPage
          pending
          title="Search"
          searchLabel="Workspace"
          search={submitted(true)}
          onSubmit={noop}
          emptyState={NOTHING}
        >
          {GROUPS}
        </SearchPage>
      ),
      expect: { 'data-pending': '' },
    },
    {
      name: 'submitted with a button — Enter and the Button submit the form',
      render: () => (
        <SearchPage
          title="Search"
          searchLabel="Workspace"
          search={submitted()}
          onSubmit={noop}
          filters={SELECTS}
          emptyState={NOTHING}
        >
          {GROUPS}
        </SearchPage>
      ),
    },
  ],

  // Every state comes from a prop.
  requiredSelectors: [],
}
