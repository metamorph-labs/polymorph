'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Badge } from './Badge'
import { DataTable, type DataTableColumn } from './DataTable'
import { Pagination } from './Pagination'
import { Text } from './Text'

/** States fixture, from `design/components/data-table.md`'s States table. */

const noop = () => {}

interface Ticket {
  id: string
  subject: string
  requester: string
  status: 'open' | 'pending' | 'solved'
  minutes: number
  /** What a row's detail shows: more than the columns have room for. */
  note: string
}

const TICKETS: Ticket[] = [
  {
    id: 'T-2041',
    subject: 'Webhook retries stop after the first 5xx',
    requester: 'dana@northwind.example',
    status: 'open',
    minutes: 4,
    note: 'The endpoint answered 503 twice. No third attempt was queued.',
  },
  {
    id: 'T-2038',
    subject: 'SSO login loops back to the sign-in page',
    requester: 'm.okafor@lattice.example',
    status: 'open',
    minutes: 26,
    note: 'The identity provider returns a valid assertion. The session cookie is not set.',
  },
  {
    id: 'T-2035',
    subject: 'Export produces an empty CSV',
    requester: 'support@brightline.example',
    status: 'pending',
    minutes: 91,
    note: 'The export has a header row and no records for any date range.',
  },
]

const COLUMNS: DataTableColumn<Ticket>[] = [
  { key: 'subject', header: 'Ticket', sortable: true },
  { key: 'requester', header: 'Requester' },
  {
    key: 'status',
    header: 'Status',
    cell: (row) => <Badge tone={row.status === 'solved' ? 'success' : 'info'}>{row.status}</Badge>,
  },
  { key: 'minutes', header: 'Updated', numeric: true, sortable: true },
]

const EMPTY = {
  icon: 'search' as const,
  title: 'No tickets match these filters',
  description: 'Every conversation is still here — the filters are hiding them.',
}

const base = {
  columns: COLUMNS,
  data: TICKETS,
  getRowId: (row: Ticket) => row.id,
  emptyState: EMPTY,
  label: 'Tickets',
}

/**
 * An expandable table. `getRowName` returns the row's own name, which the
 * disclosure's name is made from ("Details for …").
 */
const expandable = {
  ...base,
  getRowName: (row: Ticket) => row.subject,
  rowDetail: ({ row }: { row: Ticket }) => <Text size="sm">{row.note}</Text>,
}

export const states: ComponentStates = {
  component: 'DataTable',

  entries: [
    {
      name: 'plain',
      render: () => <DataTable {...base} />,
      expect: { 'data-loading': null, 'data-empty': null },
    },
    {
      name: 'sorted, ascending, on one column',
      render: () => <DataTable {...base} sort={{ key: 'subject', direction: 'asc' }} />,
    },
    {
      name: 'sorted the other way',
      render: () => <DataTable {...base} sort={{ key: 'minutes', direction: 'desc' }} />,
    },
    {
      name: 'selectable, with nothing selected yet',
      render: () => <DataTable {...base} selection={new Set()} onSelectionChange={noop} />,
    },
    {
      name: 'some selected — the header goes indeterminate and the bar arrives',
      render: () => (
        <DataTable
          {...base}
          selection={new Set(['T-2041'])}
          onSelectionChange={noop}
          getRowLabel={(row) => `Select ${row.subject}`}
          bulkActions={
            <>
              <Button variant="ghost" tone="neutral" size="sm" icon="archive" label="Archive" />
              <Button variant="soft" tone="danger" size="sm" icon="delete" label="Delete" />
            </>
          }
        />
      ),
    },
    {
      name: 'all selected',
      render: () => (
        <DataTable
          {...base}
          selection={new Set(TICKETS.map((row) => row.id))}
          onSelectionChange={noop}
          bulkActions={<Button variant="ghost" tone="neutral" size="sm" label="Archive" />}
        />
      ),
    },
    {
      name: 'expandable, with every row closed',
      render: () => <DataTable {...expandable} />,
    },
    {
      name: 'a row open — its detail spans every column',
      render: () => (
        <DataTable {...expandable} expanded={new Set(['T-2041'])} onExpandedChange={noop} />
      ),
    },
    {
      name: 'a row that takes no detail — its cell in the expansion column is empty',
      render: () => (
        <DataTable {...expandable} isRowExpandable={(row) => row.status !== 'pending'} />
      ),
    },
    {
      name: 'selection with expansion — a selected row that is open',
      render: () => (
        <DataTable
          {...expandable}
          getRowLabel={(row) => `Select ${row.subject}`}
          selection={new Set(['T-2038'])}
          onSelectionChange={noop}
          expanded={new Set(['T-2038'])}
          onExpandedChange={noop}
        />
      ),
    },
    {
      name: 'loading — the chrome stays and the shape of the rows arrives',
      render: () => <DataTable {...base} loading selection={new Set()} onSelectionChange={noop} />,
      expect: { 'data-loading': '', 'aria-busy': 'true' },
    },
    {
      name: 'empty — the chrome gives way to a sentence',
      render: () => <DataTable {...base} data={[]} />,
      expect: { 'data-empty': '' },
    },
    {
      name: 'with a pagination row',
      render: () => (
        <DataTable
          {...base}
          pagination={<Pagination page={2} pageCount={7} onPageChange={noop} />}
        />
      ),
    },
  ],

  requiredSelectors: ['[data-loading]', '[data-empty]'],
}
