import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Input } from '../controls/Input'
import { Select } from '../controls/Select'
import { Grid } from '../layout/Grid'
import { Badge } from '../structure/Badge'
import { Card } from '../structure/Card'
import { Stat } from '../structure/Stat'
import { Table } from '../structure/Table'
import { ListPage } from './ListPage'

/** States fixture, from `design/archetypes/list-page.md`'s States table. */

const TICKETS = [
  { id: 'T-1041', subject: 'Login loop after password reset', status: 'Open', replies: 4 },
  { id: 'T-1039', subject: 'Invoice shows the wrong currency', status: 'Waiting', replies: 12 },
  { id: 'T-1032', subject: 'Export finishes but the file is empty', status: 'Open', replies: 2 },
  { id: 'T-1027', subject: 'Cannot invite a teammate', status: 'Closed', replies: 7 },
  { id: 'T-1019', subject: 'Webhook retries stop after one failure', status: 'Open', replies: 1 },
] as const

const TONE = { Open: 'accent', Waiting: 'warning', Closed: 'neutral' } as const

const ACTIONS = (
  <>
    <Button variant="ghost" tone="neutral" icon="download" label="Export" />
    <Button icon="add" label="New ticket" />
  </>
)

const FILTERS = (
  <>
    <Input size="sm" icon="search" placeholder="Search tickets…" aria-label="Search tickets" />
    <Select
      size="sm"
      aria-label="Status"
      placeholder="Any status"
      options={[
        { value: 'open', label: 'Open' },
        { value: 'waiting', label: 'Waiting' },
        { value: 'closed', label: 'Closed' },
      ]}
    />
  </>
)

/**
 * The summary band (the dashboard block's section cards). Four Cards on the
 * page background, not inside the body panel, because cards do not nest. The
 * band also stays during the body swap, because a filter that matches nothing
 * does not change how many tickets are open.
 */
const SUMMARY = (
  <Grid columns={4} gap={6}>
    <Card>
      <Stat
        label="Open tickets"
        value="3"
        trend={{ direction: 'down', label: '−40%' }}
        footer={{ primary: '2 fewer than last week', secondary: 'Still waiting on someone' }}
      />
    </Card>
    <Card>
      <Stat
        label="Urgent"
        value="1"
        trend={{ direction: 'down', label: '−67%' }}
        footer={{ primary: '2 fewer than last week', secondary: 'Triage before anything else' }}
      />
    </Card>
    <Card>
      <Stat
        label="Median response"
        value="2h 23m"
        trend={{ direction: 'up', label: '+18%' }}
        footer={{ primary: 'Slower than last week', secondary: 'Since the last reply' }}
      />
    </Card>
    <Card>
      <Stat
        label="Solved this week"
        value="2"
        trend={{ direction: 'down', label: '−33%' }}
        footer={{ primary: '1 fewer than last week', secondary: 'Closed in the last seven days' }}
      />
    </Card>
  </Grid>
)

const EMPTY = {
  title: 'No tickets yet',
  description: 'When a customer writes in, their ticket will show up here.',
  action: <Button variant="soft" icon="add" label="New ticket" />,
}

function Tickets() {
  return (
    <Table label="Tickets">
      <Table.Head>
        <Table.Row>
          <Table.Header>Ticket</Table.Header>
          <Table.Header>Subject</Table.Header>
          <Table.Header>Status</Table.Header>
          <Table.Header numeric sortable sortDirection="desc">
            Replies
          </Table.Header>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {TICKETS.map((ticket) => (
          <Table.Row key={ticket.id} interactive>
            <Table.Cell>{ticket.id}</Table.Cell>
            <Table.Cell>{ticket.subject}</Table.Cell>
            <Table.Cell>
              <Badge tone={TONE[ticket.status]}>{ticket.status}</Badge>
            </Table.Cell>
            <Table.Cell numeric>{ticket.replies}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

export const states: ComponentStates = {
  component: 'ListPage',

  entries: [
    {
      name: 'full — header, filters, table',
      render: () => (
        <ListPage
          title="Tickets"
          description="Everything customers have asked for, oldest first."
          actions={ACTIONS}
          filters={FILTERS}
          emptyState={EMPTY}
        >
          <Tickets />
        </ListPage>
      ),
    },
    {
      // The dashboard block's band, above the filters and kept through the
      // body swap. The header has no description here, because the numbers
      // already say what it would restate.
      name: 'with a summary band — the numbers before the rows',
      render: () => (
        <ListPage
          title="Tickets"
          actions={ACTIONS}
          summary={SUMMARY}
          filters={FILTERS}
          emptyState={EMPTY}
        >
          <Tickets />
        </ListPage>
      ),
    },
    {
      name: 'summary survives the empty story — a filter changed the view, not the queue',
      render: () => (
        <ListPage
          empty
          title="Tickets"
          actions={ACTIONS}
          summary={SUMMARY}
          filters={FILTERS}
          emptyState={{
            icon: 'search',
            title: 'No results match',
            description: 'Nothing here answers to those filters.',
            secondaryAction: <Button variant="ghost" tone="neutral" label="Clear filters" />,
          }}
        >
          <Tickets />
        </ListPage>
      ),
      expect: { 'data-empty': '' },
    },
    {
      name: 'no filters — the gutter closes cleanly',
      render: () => (
        <ListPage title="Tickets" actions={ACTIONS} emptyState={EMPTY}>
          <Tickets />
        </ListPage>
      ),
    },
    {
      name: 'empty',
      render: () => (
        <ListPage empty title="Tickets" actions={ACTIONS} filters={FILTERS} emptyState={EMPTY}>
          <Tickets />
        </ListPage>
      ),
      expect: { 'data-empty': '' },
    },
    {
      name: 'filtered dry — the way out is a secondary action',
      render: () => (
        <ListPage
          empty
          title="Tickets"
          actions={ACTIONS}
          filters={FILTERS}
          emptyState={{
            icon: 'search',
            title: 'No results match',
            description: 'Nothing here answers to those filters.',
            secondaryAction: <Button variant="ghost" tone="neutral" label="Clear filters" />,
          }}
        >
          <Tickets />
        </ListPage>
      ),
      expect: { 'data-empty': '' },
    },
  ],

  requiredSelectors: ['[data-empty]'],
}
