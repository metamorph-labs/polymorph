import type { ComponentStates } from '@polymorph/solid'

import MasterDetailPage from './src/archetypes/MasterDetailPage'
import DataTable from './src/structure/DataTable'
import DescriptionList from './src/structure/DescriptionList'

/**
 * Entries the server-render law renders beside the states fixtures
 * (`server-render.test.ts`): elements a caller wrote where a fixture passes a
 * member.
 *
 * A member that is created and not drawn leaves a hydration by itself, so a
 * fixture that passes members does not show whether the member that holds
 * them reads them once, or in its own place in the count. An element a caller
 * wrote has no such way out: it asks for the server's element wherever it is
 * created. Each entry here fails when the convention it names is taken away.
 */
export const cases: ComponentStates = {
  component: 'the conventions, with elements a caller wrote',
  entries: [
    {
      name: 'a value that holds an element, read for its length and for its rows',
      render: () => (
        <DescriptionList
          items={[
            { term: 'Status', detail: <em>Open</em> },
            { term: 'Priority', detail: 'Urgent' },
          ]}
        />
      ),
    },
    {
      name: 'a cell that returns an element',
      render: () => (
        <DataTable
          label="Tickets"
          columns={[
            { key: 'subject', header: 'Ticket' },
            { key: 'status', header: 'Status', cell: (row: Ticket) => <em>{row.status}</em> },
          ]}
          data={TICKETS}
          getRowId={(row: Ticket) => row.id}
          emptyState={{ icon: 'inbox', title: 'No tickets' }}
        />
      ),
    },
    {
      name: 'a slot a server reads and does not draw',
      render: () => (
        <MasterDetailPage
          title="Support"
          listLabel="Tickets"
          emptyState={{ icon: 'inbox', title: 'No ticket selected' }}
          backLabel="All tickets"
          onBack={() => {}}
          list={<p>Two tickets.</p>}
          detail={<p>Webhook retries stop after the first 5xx.</p>}
        />
      ),
    },
  ],
}

interface Ticket {
  id: string
  subject: string
  status: string
}

const TICKETS: Ticket[] = [
  { id: 'T-2041', subject: 'Webhook retries stop after the first 5xx', status: 'open' },
  { id: 'T-2038', subject: 'SSO login loops back to the sign-in page', status: 'solved' },
]
