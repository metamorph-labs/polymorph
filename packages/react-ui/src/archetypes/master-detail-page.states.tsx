'use client'

import { type ComponentStates } from '@polymorph/react'
import type { ReactNode } from 'react'

import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Badge } from '../structure/Badge'
import { Heading } from '../structure/Heading'
import { List } from '../structure/List'
import { Text } from '../structure/Text'
import { MasterDetailPage } from './MasterDetailPage'
import styles from '@polymorph/recipes/archetypes/master-detail-page.module.css'

/**
 * States fixture, from `design/archetypes/master-detail-page.md`'s States table.
 *
 * The page fills its region (the shell's content region in a product), so
 * the entries render inside a fixed-height harness, and the narrow entries
 * inside one of a phone's width. The root attributes are asserted in the
 * browser test, where the width that sets them can be controlled.
 */

const noop = () => {}

type Status = 'Open' | 'Waiting' | 'Closed'

const TONE = { Open: 'accent', Waiting: 'warning', Closed: 'neutral' } as const

const TICKETS: readonly { subject: string; from: string; time: string; status: Status }[] = [
  { subject: 'Login loop after password reset', from: 'Ada Okafor', time: '2m', status: 'Open' },
  { subject: 'Invoice shows the wrong currency', from: 'Bao Tran', time: '1h', status: 'Waiting' },
  {
    subject: 'Export finishes but the file is empty',
    from: 'Carmen Ruiz',
    time: '3h',
    status: 'Open',
  },
  { subject: 'Cannot invite a teammate', from: 'Dev Patel', time: '1d', status: 'Closed' },
  {
    subject: 'Webhook retries stop after one failure',
    from: 'Ewa Nowak',
    time: '2d',
    status: 'Open',
  },
  { subject: 'Two-factor codes arrive late', from: 'Femi Adeyemi', time: '4d', status: 'Waiting' },
]

/** Thirty tickets: the six, five times over. */
const MANY = Array.from({ length: 30 }, (_, index) => TICKETS[index % TICKETS.length]!)

function tickets(items: typeof TICKETS, current: number | null) {
  return (
    <List label="Tickets">
      {items.map((ticket, index) => (
        <List.Item
          key={index}
          title={ticket.subject}
          description={ticket.from}
          meta={ticket.time}
          trailing={<Badge tone={TONE[ticket.status]}>{ticket.status}</Badge>}
          current={index === current}
          onSelect={noop}
        />
      ))}
    </List>
  )
}

/** The second ticket's detail: a heading, its meta, its body and its actions. */
const DETAIL = (
  <Stack gap={4}>
    <Heading level={2}>Invoice shows the wrong currency</Heading>
    <Inline gap={2} align="center">
      <Badge tone="warning">Waiting</Badge>
      <Text size="sm" tone="secondary">
        Bao Tran · opened an hour ago
      </Text>
    </Inline>
    <Text>
      The March invoice for the Lisbon workspace is in US dollars. The workspace bills in euros, and
      the previous invoices were right.
    </Text>
    <Inline gap={3}>
      <Button variant="soft" icon="mail" label="Reply" onClick={noop} />
      <Button variant="ghost" tone="neutral" label="Close ticket" onClick={noop} />
    </Inline>
  </Stack>
)

const EMPTY = {
  icon: 'inbox',
  title: 'No ticket selected',
  description: 'Pick a ticket in the list to read it here.',
} as const

function Boxed({ phone = false, children }: { phone?: boolean; children: ReactNode }) {
  return <div className={phone ? styles.phone : styles.harness}>{children}</div>
}

const page = {
  title: 'Support',
  description: 'Every ticket customers have opened, newest first.',
  listLabel: 'Tickets',
  emptyState: EMPTY,
  backLabel: 'All tickets',
  onBack: noop,
}

export const states: ComponentStates = {
  component: 'MasterDetailPage',

  entries: [
    {
      name: 'an item selected — the list beside its detail',
      render: () => (
        <Boxed>
          <MasterDetailPage
            {...page}
            actions={<Button icon="add" label="New ticket" onClick={noop} />}
            list={tickets(TICKETS, 1)}
            detail={DETAIL}
          />
        </Boxed>
      ),
    },
    {
      name: 'nothing selected — the list beside the empty state',
      render: () => (
        <Boxed>
          <MasterDetailPage {...page} list={tickets(TICKETS, null)} />
        </Boxed>
      ),
    },
    {
      name: 'a long list — the list pane scrolls and the detail stays',
      render: () => (
        <Boxed>
          <MasterDetailPage {...page} list={tickets(MANY, 1)} detail={DETAIL} />
        </Boxed>
      ),
    },
    {
      name: 'narrow, an item selected — the detail alone under the way back',
      render: () => (
        <Boxed phone>
          <MasterDetailPage {...page} list={tickets(TICKETS, 1)} detail={DETAIL} />
        </Boxed>
      ),
    },
    {
      name: 'narrow, nothing selected — the list alone',
      render: () => (
        <Boxed phone>
          <MasterDetailPage {...page} list={tickets(TICKETS, null)} />
        </Boxed>
      ),
    },
  ],

  /*
   * Every state comes from a prop or a width. The split's divider belongs to
   * SplitPane and the items' states to List. So the list is empty.
   */
  requiredSelectors: [],
}
