'use client'

import type { ChartDatum, ChartSeries, ComponentStates } from '@polymorph/react'
import { AreaChart } from './AreaChart'

/** States fixture, from `design/components/area-chart.md`'s States table. */

const WEEKS = ['W25', 'W26', 'W27', 'W28', 'W29', 'W30', 'W31', 'W32']

/** Relay's queue by priority, as the product panel shows it. */
const PRIORITY: ChartSeries[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
]

const BACKLOG: ChartDatum[] = WEEKS.map((week, index) => ({
  week,
  urgent: 12 + (index % 3) * 4,
  high: 34 + index * 2,
  normal: 68 - index * 3 + (index % 4) * 6,
}))

const CHANNELS: ChartSeries[] = [
  { key: 'email', label: 'Email' },
  { key: 'chat', label: 'Chat' },
  { key: 'phone', label: 'Phone' },
]

/** Two weeks the chat exporter missed. The band drops out and comes back. */
const WITH_HOLE: ChartDatum[] = WEEKS.map((week, index) => ({
  week,
  email: 210 + index * 8,
  chat: index === 3 || index === 4 ? null : 96 + index * 5,
  phone: 41 + (index % 3) * 6,
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

const EIGHT_ROWS: ChartDatum[] = WEEKS.map((week, index) =>
  Object.fromEntries([
    ['week', week],
    ...EIGHT.map((entry, at) => [entry.key, 34 - at * 3 + (index % 4) * 2]),
  ]),
)

/** Thirty calendar dates. They are date-only, so no timezone shift applies. */
const DAYS: ChartDatum[] = Array.from({ length: 30 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0')
  return {
    day: `2026-07-${day}`,
    urgent: 8 + (index % 5) * 2,
    high: 22 + (index % 7) * 3,
    normal: 44 - (index % 6) * 4,
  }
})

export const states: ComponentStates = {
  component: 'AreaChart',

  entries: [
    {
      name: 'backlog composition',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week', label: 'Week' }}
          label="Open backlog by priority"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      // The same data as shares. The y axis formats itself as percent.
      name: 'percent',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week', label: 'Week' }}
          variant="percent"
          label="Share of open backlog by priority"
        />
      ),
    },
    {
      name: 'absent band',
      render: () => (
        <AreaChart
          data={WITH_HOLE}
          series={CHANNELS}
          x={{ key: 'week', label: 'Week' }}
          label="Ticket volume by channel"
        />
      ),
    },
    {
      name: 'emphasis',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week', label: 'Week' }}
          emphasis="urgent"
          label="Open backlog, urgent emphasised"
        />
      ),
    },
    {
      // Deliberately busy: eight bands is the limit. Once the fills are hard to
      // tell apart, the legend and twin carry the reading.
      name: 'max series',
      render: () => (
        <AreaChart
          data={EIGHT_ROWS}
          series={EIGHT}
          x={{ key: 'week', label: 'Week' }}
          label="Volume by channel"
        />
      ),
    },
    {
      name: 'baseline',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week', label: 'Week' }}
          baseline={{ value: 120, label: 'Capacity' }}
          label="Open backlog against capacity"
        />
      ),
    },
    {
      name: 'time scale',
      render: () => (
        <AreaChart
          data={DAYS}
          series={PRIORITY}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          label="Open backlog by day"
        />
      ),
    },
    {
      name: 'empty',
      render: () => (
        <AreaChart data={[]} series={PRIORITY} x={{ key: 'week' }} label="Open backlog" />
      ),
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week' }}
          loading
          label="Open backlog"
        />
      ),
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week' }}
          tooltip={false}
          label="Open backlog, print"
        />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a week.
      name: 'selectable',
      render: () => (
        <AreaChart
          data={BACKLOG}
          series={PRIORITY}
          x={{ key: 'week', label: 'Week' }}
          label="Open backlog by priority"
          onSelect={() => {}}
        />
      ),
    },
    {
      // With `onBrushEnd` on a time x: a person, or an agent, brushes a range of days.
      name: 'brushable',
      render: () => (
        <AreaChart
          data={DAYS}
          series={PRIORITY}
          x={{ key: 'day', scale: 'time', label: 'Day' }}
          label="Open backlog by day"
          onBrushEnd={() => {}}
        />
      ),
    },
  ],

  /*
   * `[aria-pressed='false']` is a hidden series' legend key, a state no prop
   * sets. It is styled in the legend's sheet, which joins this member's
   * `composes` closure so the selectors law can see it (see the spec's note).
   */
  requiredSelectors: [
    "[data-state='empty']",
    "[data-state='loading']",
    "[data-variant='percent']",
    '[data-active]',
    "[aria-pressed='false']",
    ':focus-visible',
  ],
}
