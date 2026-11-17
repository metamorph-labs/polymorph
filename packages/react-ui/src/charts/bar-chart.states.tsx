'use client'

import type { ChartDatum, ChartSeries, ComponentStates } from '@polymorph/react'
import { BarChart } from './BarChart'

/**
 * States fixture, from `design/components/bar-chart.md`'s States table.
 *
 * The data is Relay's. A chart shown with `foo / bar / baz` data says nothing
 * about what the component is *for*, and a reader judging a support dashboard
 * needs to see one.
 */

const BY_CHANNEL: ChartDatum[] = [
  { channel: 'Email', tickets: 214 },
  { channel: 'Chat', tickets: 96 },
  { channel: 'Phone', tickets: 41 },
  { channel: 'Social', tickets: 18 },
]

const BY_WEEKDAY: ChartDatum[] = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
  { day: 'Thu', opened: 29, resolved: 31 },
  { day: 'Fri', opened: 22, resolved: 25 },
]

const BY_PRIORITY: ChartDatum[] = [
  { day: 'Mon', urgent: 4, high: 11, normal: 17 },
  { day: 'Tue', urgent: 6, high: 14, normal: 21 },
  { day: 'Wed', urgent: 3, high: 12, normal: 22 },
  { day: 'Thu', urgent: 5, high: 9, normal: 15 },
  { day: 'Fri', urgent: 2, high: 8, normal: 12 },
]

const BY_AGENT: ChartDatum[] = [
  { agent: 'Priya Raghunathan-Iyer', tickets: 88 },
  { agent: 'Tomás Oyelaran', tickets: 74 },
  { agent: 'Wei Zhang', tickets: 61 },
  { agent: 'Amara Okonkwo-Bell', tickets: 52 },
  { agent: 'Sam Ferreira', tickets: 39 },
]

const BACKLOG_DELTA: ChartDatum[] = [
  { week: 'W31', delta: 12 },
  { week: 'W32', delta: -8 },
  { week: 'W33', delta: 3 },
  { week: 'W34', delta: -15 },
]

const PAIR: ChartSeries[] = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const FOUR: ChartSeries[] = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'reopened', label: 'Reopened' },
  { key: 'escalated', label: 'Escalated' },
]

const FOUR_ROWS: ChartDatum[] = BY_WEEKDAY.map((row, index) => ({
  ...row,
  reopened: [4, 6, 3, 5, 2][index] ?? 0,
  escalated: [2, 3, 1, 4, 1][index] ?? 0,
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

const EIGHT_ROWS: ChartDatum[] = [
  Object.fromEntries([
    ['day', 'Mon'],
    ...EIGHT.map((entry, index) => [entry.key, 40 - index * 4]),
  ]) as ChartDatum,
]

const THOUSANDS: ChartDatum[] = [
  { month: 'May', tickets: 18_400 },
  { month: 'Jun', tickets: 21_900 },
  { month: 'Jul', tickets: 24_100 },
  { month: 'Aug', tickets: 22_700 },
]

/**
 * Survey agreement, pre-signed by the app, which handles the neutral split
 * (`bar-chart.md`). Disagreement values are negative, and the member never
 * derives a neutral key. The first row is the spec's example; two more
 * questions give the horizontal form a column to read down.
 */
const LIKERT: ChartDatum[] = [
  { question: 'Response speed', strongDisagree: -9, disagree: -16, agree: 31, strongAgree: 14 },
  { question: 'Ease of contact', strongDisagree: -4, disagree: -11, agree: 38, strongAgree: 17 },
  { question: 'Issue resolved', strongDisagree: -12, disagree: -19, agree: 26, strongAgree: 13 },
]

/**
 * Tickets opened by week, with the app's trailing four-week average as a line
 * on the same axis. The app computes the average, over the weeks it has at the
 * start, because the member draws what it is given.
 */
const BY_WEEK: ChartDatum[] = [
  { week: 'W40', opened: 182, average: 182 },
  { week: 'W41', opened: 205, average: 194 },
  { week: 'W42', opened: 197, average: 195 },
  { week: 'W43', opened: 231, average: 204 },
  { week: 'W44', opened: 214, average: 212 },
  { week: 'W45', opened: 188, average: 208 },
  { week: 'W46', opened: 243, average: 219 },
  { week: 'W47', opened: 226, average: 218 },
  { week: 'W48', opened: 251, average: 227 },
  { week: 'W49', opened: 238, average: 240 },
]

const AVERAGE: ChartSeries[] = [{ key: 'average', label: 'Four-week average' }]

export const states: ComponentStates = {
  component: 'BarChart',

  entries: [
    {
      name: 'single series',
      render: () => (
        <BarChart
          data={BY_CHANNEL}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          x={{ key: 'channel', label: 'Channel' }}
          label="Tickets by channel"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      name: 'grouped',
      render: () => (
        <BarChart
          data={BY_WEEKDAY}
          series={PAIR}
          x={{ key: 'day', label: 'Day' }}
          label="Opened and resolved by weekday"
        />
      ),
    },
    {
      name: 'stacked',
      render: () => (
        <BarChart
          data={BY_PRIORITY}
          series={[
            { key: 'urgent', label: 'Urgent' },
            { key: 'high', label: 'High' },
            { key: 'normal', label: 'Normal' },
          ]}
          x={{ key: 'day', label: 'Day' }}
          mode="stacked"
          label="Tickets by priority and weekday"
        />
      ),
    },
    {
      name: 'horizontal',
      render: () => (
        <BarChart
          data={BY_AGENT}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          x={{ key: 'agent', label: 'Agent' }}
          orientation="horizontal"
          label="Tickets by agent"
        />
      ),
    },
    {
      // With one signed series, sign is what matters, so the bars take the
      // diverging colours automatically and centre on zero.
      name: 'signed single',
      render: () => (
        <BarChart
          data={BACKLOG_DELTA}
          series={[{ key: 'delta', label: 'Backlog change' }]}
          x={{ key: 'week', label: 'Week' }}
          label="Backlog change by week"
        />
      ),
    },
    {
      name: 'status-toned',
      render: () => (
        <BarChart
          data={BY_WEEKDAY.map((row) => ({
            day: row['day'] ?? '',
            breaches: Number(row['opened']) / 8,
          }))}
          series={[{ key: 'breaches', label: 'SLA breaches', tone: 'danger' }]}
          x={{ key: 'day', label: 'Day' }}
          label="SLA breaches by weekday"
        />
      ),
    },
    {
      name: 'baseline',
      render: () => (
        <BarChart
          data={BY_WEEKDAY}
          series={PAIR}
          x={{ key: 'day', label: 'Day' }}
          baseline={{ value: 40, label: 'Target' }}
          label="Opened and resolved against target"
        />
      ),
    },
    {
      name: 'emphasis',
      render: () => (
        <BarChart
          data={FOUR_ROWS}
          series={FOUR}
          x={{ key: 'day', label: 'Day' }}
          emphasis="resolved"
          label="Ticket flow, resolved emphasised"
        />
      ),
    },
    {
      name: 'max series',
      render: () => (
        <BarChart
          data={EIGHT_ROWS}
          series={EIGHT}
          x={{ key: 'day', label: 'Day' }}
          label="Every channel, one day"
        />
      ),
    },
    {
      name: 'y format',
      render: () => (
        <BarChart
          data={THOUSANDS}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          x={{ key: 'month', label: 'Month' }}
          y={{ format: { style: 'compact' } }}
          label="Tickets by month"
        />
      ),
    },
    {
      name: 'empty',
      render: () => (
        <BarChart
          data={[]}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          x={{ key: 'channel' }}
          label="Tickets by channel"
        />
      ),
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => (
        <BarChart
          data={BY_WEEKDAY}
          series={PAIR}
          x={{ key: 'day' }}
          loading
          label="Opened and resolved by weekday"
        />
      ),
      expect: { 'data-state': 'loading' },
    },
    {
      // `false` removes the visual layer only: the keyboard reading position,
      // its announcements and the table twin all stay.
      name: 'tooltip off',
      render: () => (
        <BarChart
          data={BY_WEEKDAY}
          series={PAIR}
          x={{ key: 'day' }}
          tooltip={false}
          label="Opened and resolved, print"
        />
      ),
    },
    {
      // The Likert form. The app pre-signs the values (the member never
      // derives a neutral key), and the arms colour them outward from zero.
      // The app controls the result through declaration order, because
      // stacking never reorders. Each side declares mild before extreme, so
      // the strong answers stack outermost with the stronger arm colour.
      name: 'diverging (Likert)',
      render: () => (
        <BarChart
          data={LIKERT}
          series={[
            { key: 'disagree', label: 'Disagree' },
            { key: 'strongDisagree', label: 'Strongly disagree' },
            { key: 'agree', label: 'Agree' },
            { key: 'strongAgree', label: 'Strongly agree' },
          ]}
          x={{ key: 'question', label: 'Question' }}
          mode="diverging"
          orientation="horizontal"
          label="Survey agreement by question"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      // A line over the bars, on their axis and in their unit.
      name: 'line',
      render: () => (
        <BarChart
          data={BY_WEEK}
          series={[{ key: 'opened', label: 'Opened' }]}
          lines={AVERAGE}
          x={{ key: 'week', label: 'Week' }}
          label="Tickets opened by week, with the four-week average"
        />
      ),
    },
    {
      name: 'grouped with line',
      render: () => (
        <BarChart
          data={BY_WEEKDAY.map((row, index) => ({
            ...row,
            lastWeek: [30, 38, 35, 31, 20][index] ?? null,
          }))}
          series={PAIR}
          lines={[{ key: 'lastWeek', label: 'Opened last week' }]}
          x={{ key: 'day', label: 'Day' }}
          label="Opened and resolved by weekday, with last week"
        />
      ),
    },
    {
      // The line reads against the stack's total, on the same axis.
      name: 'stacked with line',
      render: () => (
        <BarChart
          data={BY_PRIORITY.map((row, index) => ({
            ...row,
            capacity: [36, 38, 38, 34, 28][index] ?? null,
          }))}
          series={[
            { key: 'urgent', label: 'Urgent' },
            { key: 'high', label: 'High' },
            { key: 'normal', label: 'Normal' },
          ]}
          lines={[{ key: 'capacity', label: 'Capacity' }]}
          x={{ key: 'day', label: 'Day' }}
          mode="stacked"
          label="Tickets by priority, against capacity"
        />
      ),
    },
    {
      // A week with no average breaks the line and draws no point.
      name: 'line with a gap',
      render: () => (
        <BarChart
          data={BY_WEEK.map((row) => (row['week'] === 'W45' ? { ...row, average: null } : row))}
          series={[{ key: 'opened', label: 'Opened' }]}
          lines={AVERAGE}
          x={{ key: 'week', label: 'Week' }}
          label="Tickets opened by week, one average missing"
        />
      ),
    },
    {
      // One signed bar series keeps its polarity colours beside a line.
      name: 'signed with line',
      render: () => (
        <BarChart
          data={BACKLOG_DELTA.map((row, index) => ({
            ...row,
            trend: [6, 2, -1, -5][index] ?? null,
          }))}
          series={[{ key: 'delta', label: 'Backlog change' }]}
          lines={[{ key: 'trend', label: 'Trend' }]}
          x={{ key: 'week', label: 'Week' }}
          label="Backlog change by week, with its trend"
        />
      ),
    },
    {
      // Long names on a vertical chart thin out; the tooltip and the twin name every one.
      name: 'long labels with line',
      render: () => (
        <BarChart
          data={BY_AGENT.map((row, index) => ({
            ...row,
            lastMonth: [80, 71, 66, 49, 41][index] ?? null,
          }))}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          lines={[{ key: 'lastMonth', label: 'Last month' }]}
          x={{ key: 'agent', label: 'Agent' }}
          label="Tickets by agent, with last month"
        />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a bar.
      name: 'selectable',
      render: () => (
        <BarChart
          data={BY_CHANNEL}
          series={[{ key: 'tickets', label: 'Tickets' }]}
          x={{ key: 'channel', label: 'Channel' }}
          label="Tickets by channel"
          onSelect={() => {}}
        />
      ),
    },
  ],

  /*
   * `[data-mode='stacked']` is in the spec's list but not in this one. This
   * field lists selectors the stylesheet must style, and stacking changes
   * *geometry the component computes* (where a segment starts, which end gets
   * the radius, where the surface gap goes), not paint a CSS rule applies.
   * Listing it would require CSS written only to satisfy the list, which is
   * what the field exists to prevent. The attribute is still rendered and is
   * asserted by `bar-chart.test.ts`; `bar-chart.md` says the same.
   */
  /*
   * `[aria-pressed='false']` is a hidden series' legend key, a state no prop
   * sets. It is styled in the legend's sheet, which joins this member's
   * `composes` closure so the selectors law can see it (see the spec's note).
   */
  requiredSelectors: [
    "[data-state='empty']",
    "[data-state='loading']",
    "[data-orientation='horizontal']",
    '[data-active]',
    "[aria-pressed='false']",
    ':focus-visible',
  ],
}
