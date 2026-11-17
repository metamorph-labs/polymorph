'use client'

import { Badge, Button, DataTable, Input, ListPage, Tooltip } from '@polymorph/react-ui'
import { useState } from 'react'

interface Ticket {
  id: string
  subject: string
  status: string
}

/**
 * The members that take a function, in a client component. The Tooltip finds
 * the provider the root layout renders, which a server component imported.
 */
export function Tickets({ rows }: { rows: Ticket[] }) {
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const shown = rows.filter((row) => row.subject.toLowerCase().includes(query.toLowerCase()))
  const emptyState = { title: 'No tickets', description: 'Nothing matches the search.' }
  return (
    <ListPage
      title="Tickets"
      description="Every ticket in the queue."
      actions={
        <Tooltip content="Opens the form">
          <Button label="New ticket" icon="add" />
        </Tooltip>
      }
      filters={
        <Input size="sm" icon="search" placeholder="Search" value={query} onChange={setQuery} />
      }
      empty={shown.length === 0}
      emptyState={emptyState}
    >
      <DataTable
        label="Tickets"
        columns={[
          { key: 'subject', header: 'Subject', sortable: true },
          { key: 'status', header: 'Status', cell: (row) => <Badge>{row.status}</Badge> },
        ]}
        data={shown}
        getRowId={(row) => row.id}
        selection={selection}
        onSelectionChange={setSelection}
        emptyState={emptyState}
      />
    </ListPage>
  )
}
