'use client'

import type { ChartDatum, ChartSeries, ComponentStates } from '@polymorph/react'
import { LineChart } from './LineChart'

/**
 * States fixture, from `design/components/line-chart.md`'s States table.
 *
 * The first entry uses the Relay dashboard's composition, so the gallery and the
 * shipped panel show the same chart.
 */

/** Thirty days of ISO calendar dates. They are date-only, so no timezone shift applies. */
const DAYS: ChartDatum[] = Array.from({ length: 30 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0')
  const opened = [28, 34, 31, 45, 39, 22, 18][index % 7] ?? 30
  const resolved = [25, 30, 33, 41, 37, 20, 16][index % 7] ?? 28
  return {
    day: `2026-07-${day}`,
    opened: opened + (index % 5),
    resolved: resolved + (index % 4),
  }
})

const PAIR: ChartSeries[] = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const BACKLOG: ChartDatum[] = DAYS.map((row, index) => ({
  day: row['day'] ?? '',
  backlog: 120 + index * 3 - (index % 6) * 8,
}))

/** A week the exporter missed. `null` is a gap, and the line breaks over it. */
const WITH_GAP: ChartDatum[] = DAYS.map((row, index) =>
  index >= 12 && index <= 16 ? { ...row, resolved: null } : row,
)

const MONTHS: ChartDatum[] = [
  { month: '2026-03-01', tickets: 1840 },
  { month: '2026-04-01', tickets: 2110 },
  { month: '2026-05-01', tickets: 1975 },
  { month: '2026-06-01', tickets: 2260 },
  { month: '2026-07-01', tickets: 2405 },
  { month: '2026-08-01', tickets: 2190 },
]

const TEAMS: ChartSeries[] = [
  { key: 'Frontline', label: 'Frontline' },
  { key: 'Billing', label: 'Billing' },
  { key: 'Technical', label: 'Technical' },
  { key: 'Escalations', label: 'Escalations' },
]

const TEAM_ROWS: ChartDatum[] = ['W27', 'W28', 'W29', 'W30', 'W31', 'W32'].map((week, index) => ({
  week,
  Frontline: 46 - index * 2,
  Billing: 62 - index,
  Technical: 88 - index * 3,
  Escalations: 140 - index * 9,
}))

const RESPONSE: ChartDatum[] = TEAM_ROWS.map((row, index) => ({
  week: row['week'] ?? '',
  minutes: 38 - index * 2,
}))

const EIGHT: ChartSeries[] = [
  'Email',
  'Chat',
  'Phone',
  'Social',
  'Portal',
  'API',
  'Partner',
  'Walk-in',
].map((label) => ({ key: label.toLowerCase().replace(/[^a-z]/g, ''), label }))

const EIGHT_ROWS: ChartDatum[] = ['W29', 'W30', 'W31', 'W32'].map((week, index) =>
  Object.fromEntries([
    ['week', week],
    ...EIGHT.map((entry, at) => [entry.key, 40 - at * 4 + index * 2]),
  ]),
)

const REFUNDS: ChartDatum[] = ['W29', 'W30', 'W31', 'W32'].map((week, index) => ({
  week,
  refunds: 1240 + index * 310,
}))

export const states: ComponentStates = {
  component: 'LineChart',

  entries: [
    {
      // The Relay dashboard's panel, so the fixture and the product screen
      // match.
      name: 'the Relay pair',
      render: () => (
        <LineChart
          data={DAYS}
          series={PAIR}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          label="Tickets opened and resolved by day"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      name: 'single series area',
      render: () => (
        <LineChart
          data={BACKLOG}
          series={[{ key: 'backlog', label: 'Open backlog' }]}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          variant="area"
          label="Open backlog by day"
        />
      ),
    },
    {
      name: 'markers',
      render: () => (
        <LineChart
          data={DAYS.slice(0, 10)}
          series={PAIR}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          markers
          label="Opened and resolved, with points"
        />
      ),
    },
    {
      name: 'gap',
      render: () => (
        <LineChart
          data={WITH_GAP}
          series={PAIR}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          label="Opened and resolved, with a reporting gap"
        />
      ),
    },
    {
      // "2026-08-01" is a calendar date and renders as "Aug". Parsed as UTC, a
      // date-only string would become the 31st of July in some timezones.
      name: 'band-of-dates',
      render: () => (
        <LineChart
          data={MONTHS}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          x={{ key: 'month', format: { style: 'date', granularity: 'month' }, label: 'Month' }}
          label="Tickets by month"
        />
      ),
    },
    {
      name: 'emphasis',
      render: () => (
        <LineChart
          data={TEAM_ROWS}
          series={TEAMS}
          x={{ key: 'week', label: 'Week' }}
          emphasis="Escalations"
          label="Resolution time by team"
        />
      ),
    },
    {
      name: 'baseline',
      render: () => (
        <LineChart
          data={RESPONSE}
          series={[{ key: 'minutes', label: 'First response' }]}
          x={{ key: 'week', label: 'Week' }}
          baseline={{ value: 30, label: 'SLA' }}
          label="First response against the SLA"
        />
      ),
    },
    {
      name: 'max series',
      render: () => (
        <LineChart
          data={EIGHT_ROWS}
          series={EIGHT}
          x={{ key: 'week', label: 'Week' }}
          label="Volume by channel"
        />
      ),
    },
    {
      name: 'status-toned',
      render: () => (
        <LineChart
          data={TEAM_ROWS}
          series={[
            { key: 'Frontline', label: 'Frontline' },
            { key: 'Escalations', label: 'Error rate', tone: 'danger' },
          ]}
          x={{ key: 'week', label: 'Week' }}
          label="Frontline volume and error rate"
        />
      ),
    },
    {
      name: 'y currency',
      render: () => (
        <LineChart
          data={REFUNDS}
          series={[{ key: 'refunds', label: 'Refunds' }]}
          x={{ key: 'week', label: 'Week' }}
          y={{ format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } }}
          label="Weekly refunds"
        />
      ),
    },
    {
      name: 'empty',
      render: () => (
        <LineChart
          data={[]}
          series={PAIR}
          x={{ key: 'day', scale: 'time' }}
          label="Tickets by day"
        />
      ),
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => (
        <LineChart
          data={DAYS}
          series={PAIR}
          x={{ key: 'day', scale: 'time' }}
          loading
          label="Tickets by day"
        />
      ),
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      render: () => (
        <LineChart
          data={DAYS}
          series={PAIR}
          x={{ key: 'day', scale: 'time' }}
          tooltip={false}
          label="Tickets by day, print"
        />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a day.
      name: 'selectable',
      render: () => (
        <LineChart
          data={DAYS}
          series={PAIR}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          label="Tickets opened and resolved by day"
          onSelect={() => {}}
        />
      ),
    },
    {
      // With `onBrushEnd` on a time x: a person, or an agent, brushes a range of days.
      name: 'brushable',
      render: () => (
        <LineChart
          data={DAYS}
          series={[{ key: 'opened', label: 'Opened' }]}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          label="Tickets opened by day"
          onBrushEnd={() => {}}
        />
      ),
    },
  ],

  /*
   * `[data-variant='area']` is in the spec's list but not in this one, for the
   * reason `bar-chart.states.tsx` gives about `[data-mode]`. The variant adds a
   * *mark* (the wash path) instead of changing how any mark is painted, so no
   * CSS rule keys off it, and adding one only to satisfy the list would be
   * wrong. The attribute is rendered and `line-chart.test.ts` asserts it.
   *
   * `[aria-pressed='false']` is a hidden series' legend key, a state no prop
   * sets. It is styled in the legend's sheet, which joins this member's
   * `composes` closure so the selectors law can see it (see the spec's note).
   */
  requiredSelectors: [
    "[data-state='empty']",
    "[data-state='loading']",
    '[data-active]',
    "[aria-pressed='false']",
    ':focus-visible',
  ],
}
