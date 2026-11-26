'use client'

import type { ChartDatum, ComponentStates } from '@polymorph/react'
import { LineChart } from '../charts/LineChart'
import { InlineEdit } from '../controls/InlineEdit'
import type { StatProps } from '../structure/Stat'
import { Table } from '../structure/Table'
import { Dashboard } from './Dashboard'

const noop = () => {}

/** States fixture, from `design/archetypes/dashboard.md`'s States table. */

const STATS: StatProps[] = [
  {
    label: 'Open tickets',
    value: '128',
    delta: { value: '8%', direction: 'down', positive: true },
    /*
     * The chart tier's smallest member, inside its tile. It is a line beside a
     * number, with no axes and no readout. The panel below shows the values,
     * and this shows the trend.
     */
    spark: [141, 138, 144, 136, 132, 135, 129, 131, 126, 128],
  },
  { label: 'First response', value: '14m', icon: 'time' },
  { label: 'Satisfaction', value: '91%', delta: { value: '3pts', direction: 'down' } },
]

/** Two weeks of Relay's queue, as calendar dates, so no timezone shifts them. */
const DAYS: ChartDatum[] = Array.from({ length: 14 }, (_, index) => ({
  day: `2026-07-${String(index + 1).padStart(2, '0')}`,
  opened: [28, 34, 31, 45, 39, 22, 18][index % 7] ?? 30,
  resolved: [25, 30, 33, 41, 37, 20, 16][index % 7] ?? 28,
}))

/**
 * The primary panel's content: two series in slots 1 and 2 at the default
 * `md` height, inside a panel that provides the surface and the heading. This
 * applies Stat's "content, not surface" rule to the chart tier.
 */
const VOLUME = (
  <LineChart
    data={DAYS}
    series={[
      { key: 'opened', label: 'Opened' },
      { key: 'resolved', label: 'Resolved' },
    ]}
    x={{ key: 'day', scale: 'time', label: 'Day' }}
    label="Tickets opened and resolved by day"
  />
)

const TICKETS = (
  <Table label="Recent tickets">
    <Table.Head>
      <Table.Row>
        <Table.Header>Ticket</Table.Header>
        <Table.Header numeric>Updated</Table.Header>
      </Table.Row>
    </Table.Head>
    <Table.Body>
      <Table.Row>
        <Table.Cell>Webhook retries stop after the first 5xx</Table.Cell>
        <Table.Cell numeric>4m ago</Table.Cell>
      </Table.Row>
      <Table.Row>
        <Table.Cell>SSO login loops back to the sign-in page</Table.Cell>
        <Table.Cell numeric>26m ago</Table.Cell>
      </Table.Row>
    </Table.Body>
  </Table>
)

export const states: ComponentStates = {
  component: 'Dashboard',

  entries: [
    {
      name: 'three stats, a table and a narrow column',
      render: () => (
        <Dashboard
          title="Overview"
          description="The last seven days."
          stats={STATS}
          primary={
            <>
              <Dashboard.Panel title="Ticket volume">{VOLUME}</Dashboard.Panel>
              <Dashboard.Panel title="Recent tickets">{TICKETS}</Dashboard.Panel>
            </>
          }
          secondary={
            <>
              <Dashboard.Panel title="On call">
                <p>Ada Lovelace, until Friday.</p>
              </Dashboard.Panel>
              <Dashboard.Panel title="Backlog">
                <p>1,204 conversations.</p>
              </Dashboard.Panel>
            </>
          }
        />
      ),
    },
    {
      name: 'four stats',
      render: () => (
        <Dashboard
          title="Overview"
          stats={[...STATS, { label: 'Escalations', value: '17' }]}
          primary={<Dashboard.Panel title="Recent tickets">{TICKETS}</Dashboard.Panel>}
        />
      ),
    },
    {
      name: 'no second column — the primary takes the width',
      render: () => (
        <Dashboard
          title="Overview"
          stats={STATS.slice(0, 2)}
          primary={<Dashboard.Panel title="Recent tickets">{TICKETS}</Dashboard.Panel>}
        />
      ),
    },
    {
      name: 'a panel with no title, and no stats at all',
      render: () => (
        <Dashboard title="Overview" primary={<Dashboard.Panel>{TICKETS}</Dashboard.Panel>} />
      ),
    },
    {
      name: 'a title edited in place — the overview of one environment the reader names',
      render: () => (
        <Dashboard
          title="Staging"
          titleEdit={
            <InlineEdit
              label="Environment name"
              value="Staging"
              size="lg"
              required
              onCommit={noop}
            />
          }
          stats={STATS.slice(0, 2)}
          primary={<Dashboard.Panel title="Recent tickets">{TICKETS}</Dashboard.Panel>}
        />
      ),
    },

    /*
     * The page before its numbers: each stat keeps its card and its label, and
     * the chart draws its first-load skeleton.
     */
    {
      name: 'the numbers loading — each card keeps its label and its height',
      render: () => (
        <Dashboard
          title="Overview"
          stats={STATS.map((stat) => ({ ...stat, loading: true }))}
          primary={
            <Dashboard.Panel title="Ticket volume">
              <LineChart
                data={[]}
                loading
                series={[
                  { key: 'opened', label: 'Opened' },
                  { key: 'resolved', label: 'Resolved' },
                ]}
                x={{ key: 'day', scale: 'time', label: 'Day' }}
                label="Tickets opened and resolved by day"
              />
            </Dashboard.Panel>
          }
        />
      ),
    },
  ],

  requiredSelectors: [],
}
