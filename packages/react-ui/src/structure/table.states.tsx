'use client'

import { useState } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { Badge } from './Badge'
import { Table } from './Table'

/** States fixture, from `design/components/table.md`'s States table. */

interface Ticket {
  id: string
  subject: string
  status: 'Open' | 'Waiting' | 'Closed'
  replies: number
}

const TICKETS: Ticket[] = [
  { id: 'T-1041', subject: 'Login loop after password reset', status: 'Open', replies: 4 },
  { id: 'T-1039', subject: 'Invoice shows the wrong currency', status: 'Waiting', replies: 12 },
  { id: 'T-1032', subject: 'Export finishes but the file is empty', status: 'Open', replies: 2 },
  { id: 'T-1027', subject: 'Cannot invite a teammate', status: 'Closed', replies: 7 },
]

const TONE = { Open: 'accent', Waiting: 'warning', Closed: 'neutral' } as const

function Rows({
  interactive = false,
  selected = () => false,
  onPick,
}: {
  interactive?: boolean
  selected?: (id: string) => boolean
  onPick?: (id: string) => void
}) {
  return (
    <>
      {TICKETS.map((ticket) => (
        <Table.Row
          key={ticket.id}
          interactive={interactive}
          selected={selected(ticket.id)}
          onClick={onPick === undefined ? undefined : () => onPick(ticket.id)}
        >
          <Table.Cell>{ticket.id}</Table.Cell>
          <Table.Cell>{ticket.subject}</Table.Cell>
          <Table.Cell>
            <Badge tone={TONE[ticket.status]}>{ticket.status}</Badge>
          </Table.Cell>
          <Table.Cell numeric>{ticket.replies}</Table.Cell>
        </Table.Row>
      ))}
    </>
  )
}

/**
 * Interactive rows that a click selects, as an application's would: a row adds
 * itself to the selection, so a click on a row shows (`table.md`'s contract).
 */
function PickedRows({ initial }: { initial: string }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set([initial]))
  return (
    <Rows
      interactive
      selected={(id) => picked.has(id)}
      onPick={(id) => setPicked((before) => new Set([...before, id]))}
    />
  )
}

function Headers({ sortDirection }: { sortDirection?: 'asc' | 'desc' }) {
  return (
    <Table.Row>
      <Table.Header>Ticket</Table.Header>
      <Table.Header>Subject</Table.Header>
      <Table.Header>Status</Table.Header>
      <Table.Header numeric sortable sortDirection={sortDirection}>
        Replies
      </Table.Header>
    </Table.Row>
  )
}

export const states: ComponentStates = {
  component: 'Table',

  entries: [
    {
      name: 'basic',
      render: () => (
        <Table label="Tickets">
          <Table.Head>
            <Headers />
          </Table.Head>
          <Table.Body>
            <Rows />
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'sorted ascending',
      render: () => (
        <Table label="Tickets">
          <Table.Head>
            <Headers sortDirection="asc" />
          </Table.Head>
          <Table.Body>
            <Rows />
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'sorted descending',
      render: () => (
        <Table label="Tickets">
          <Table.Head>
            <Headers sortDirection="desc" />
          </Table.Head>
          <Table.Body>
            <Rows />
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'interactive rows, one selected',
      render: () => (
        <Table label="Tickets">
          <Table.Head>
            <Headers />
          </Table.Head>
          <Table.Body>
            <PickedRows initial="T-1039" />
          </Table.Body>
        </Table>
      ),
    },
    {
      // The visible caption. The announced-only caption is the default and is
      // invisible, so a gallery cell cannot show it. The browser tests assert it.
      name: 'visible caption',
      render: () => (
        <Table label="Tickets" caption="Tickets opened this week" captionVisible>
          <Table.Head>
            <Headers />
          </Table.Head>
          <Table.Body>
            <Rows />
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'sticky header, over a body long enough to scroll',
      render: () => (
        <Table stickyHeader label="Tickets">
          <Table.Head>
            <Headers />
          </Table.Head>
          <Table.Body>
            <Rows />
            <Rows />
            <Rows />
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'totals — a foot under the numeric column, top rule, figures aligned',
      render: () => (
        <Table label="Tickets">
          <Table.Head>
            <Headers />
          </Table.Head>
          <Table.Body>
            <Rows />
          </Table.Body>
          <Table.Foot>
            <Table.Row>
              <Table.Cell>Total</Table.Cell>
              <Table.Cell />
              <Table.Cell />
              <Table.Cell numeric>25</Table.Cell>
            </Table.Row>
          </Table.Foot>
        </Table>
      ),
    },
  ],

  requiredSelectors: [
    '[data-interactive]:hover',
    '[data-selected]',
    '[data-sortable]:hover',
    ':focus-visible',
  ],
}
