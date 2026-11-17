'use client'

import type { ChartDatum, ComponentStates } from '@polymorph/react'
import { Heatmap } from './Heatmap'

/** States fixture, from `design/components/heatmap.md`'s States table. */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const BANDS = ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24']

/**
 * Relay's support week: quiet overnight, a working-hours plateau, and a
 * realistic Tue–Thu surge across the two midday bands.
 */
const VOLUME: Record<string, readonly number[]> = {
  Mon: [1, 6, 34, 38, 21, 4],
  Tue: [2, 8, 51, 58, 26, 5],
  Wed: [1, 7, 49, 55, 24, 6],
  Thu: [2, 9, 46, 52, 23, 4],
  Fri: [1, 5, 31, 29, 17, 3],
  Sat: [0, 2, 9, 11, 7, 2],
  Sun: [0, 1, 6, 8, 5, 1],
}

const WEEK: ChartDatum[] = DAYS.flatMap((day) =>
  BANDS.map((band, index) => ({ band, day, tickets: VOLUME[day]?.[index] ?? 0 })),
)

/** The same grid at thousands scale, so `compact` has something to shorten. */
const AT_SCALE: ChartDatum[] = WEEK.map((row) => ({
  ...row,
  tickets: (row['tickets'] as number) * 214,
}))

/**
 * A new product's first fortnight, where most of the grid has no data. Absent
 * cells must show the **surface**, not the ramp's lightest step, which means a
 * measurement of almost nothing rather than no measurement.
 */
const SPARSE: ChartDatum[] = WEEK.map((row) => {
  const live =
    (row['day'] === 'Wed' && row['band'] === '08–12') ||
    (row['day'] === 'Wed' && row['band'] === '12–16') ||
    (row['day'] === 'Thu' && row['band'] === '12–16') ||
    (row['day'] === 'Fri' && row['band'] === '08–12')
  return { ...row, tickets: live ? (row['tickets'] as number) : null }
})

/**
 * Fourteen calendar dates as columns. They are date-only, so no timezone shift
 * applies.
 *
 * The rows are **channels**, not weekdays. A date already implies its weekday,
 * so a weekday × date grid would encode one fact twice, and every column would
 * have exactly one filled cell. A date axis needs a second axis independent of
 * time.
 */
const CHANNELS = ['Email', 'Chat', 'Phone', 'Social']

const FORTNIGHT: ChartDatum[] = CHANNELS.flatMap((channel, row) =>
  Array.from({ length: 14 }, (_, index) => {
    // Weekends are quiet, and each channel's share stays steady across the fortnight.
    const weekend = index % 7 === 5 || index % 7 === 6
    const base = [64, 38, 21, 9][row] ?? 10
    return {
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      channel,
      tickets: Math.round(base * (weekend ? 0.3 : 1) * (1 + ((index * 7) % 5) / 12)),
    }
  }),
)

/**
 * Staffing delta against plan, weekday × shift: signed values −6…+8 with one
 * exact zero (the entry in `heatmap.md`). Understaffed mornings take the cool
 * arm, the overstaffed midweek swing takes the warm one, and Wednesday's
 * Evening zero takes the mid colour.
 */
const SHIFTS = ['Morning', 'Midday', 'Evening', 'Night']

const DELTAS: Record<string, readonly number[]> = {
  Mon: [-6, -2, 1, 2],
  Tue: [-4, 3, 5, 1],
  Wed: [-1, 8, 0, -2],
  Thu: [2, 6, 4, -3],
  Fri: [-5, -3, 2, 3],
}

const STAFFING: ChartDatum[] = Object.keys(DELTAS).flatMap((day) =>
  SHIFTS.map((shift, index) => ({ shift, day, delta: DELTAS[day]?.[index] ?? 0 })),
)

export const states: ComponentStates = {
  component: 'Heatmap',

  entries: [
    {
      name: 'the support week',
      render: () => (
        <Heatmap
          data={WEEK}
          x={{ key: 'band', label: 'Hour' }}
          y={{ key: 'day', label: 'Day' }}
          value={{ key: 'tickets' }}
          label="Ticket volume by weekday and hour"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      name: 'compact format',
      render: () => (
        <Heatmap
          data={AT_SCALE}
          x={{ key: 'band', label: 'Hour' }}
          y={{ key: 'day', label: 'Day' }}
          value={{ key: 'tickets', format: { style: 'compact' } }}
          label="Session volume by weekday and hour"
        />
      ),
    },
    {
      name: 'sparse',
      render: () => (
        <Heatmap
          data={SPARSE}
          x={{ key: 'band', label: 'Hour' }}
          y={{ key: 'day', label: 'Day' }}
          value={{ key: 'tickets' }}
          label="Ticket volume in the first fortnight"
        />
      ),
    },
    {
      name: 'time-labeled x',
      render: () => (
        <Heatmap
          data={FORTNIGHT}
          x={{ key: 'date', format: { style: 'date', granularity: 'day' }, label: 'Date' }}
          y={{ key: 'channel', label: 'Channel' }}
          value={{ key: 'tickets' }}
          label="Ticket volume by channel and date"
        />
      ),
    },
    {
      name: 'empty',
      render: () => (
        <Heatmap
          data={[]}
          x={{ key: 'band' }}
          y={{ key: 'day' }}
          value={{ key: 'tickets' }}
          label="Ticket volume by weekday and hour"
        />
      ),
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => (
        <Heatmap
          data={WEEK}
          x={{ key: 'band' }}
          y={{ key: 'day' }}
          value={{ key: 'tickets' }}
          loading
          label="Ticket volume by weekday and hour"
        />
      ),
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      render: () => (
        <Heatmap
          data={WEEK}
          x={{ key: 'band' }}
          y={{ key: 'day' }}
          value={{ key: 'tickets' }}
          tooltip={false}
          label="Ticket volume by weekday and hour, print"
        />
      ),
    },
    {
      // Signed data switches to diverging automatically: the symmetric range,
      // one exact zero in the mid colour, and the scale legend's three labels
      // (min · zero · max).
      name: 'diverging',
      render: () => (
        <Heatmap
          data={STAFFING}
          x={{ key: 'shift', label: 'Shift' }}
          y={{ key: 'day', label: 'Day' }}
          value={{ key: 'delta' }}
          label="Staffing delta vs plan by weekday and shift"
        />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a cell.
      name: 'selectable',
      render: () => (
        <Heatmap
          data={WEEK}
          x={{ key: 'band', label: 'Hour' }}
          y={{ key: 'day', label: 'Day' }}
          value={{ key: 'tickets' }}
          label="Ticket volume by weekday and hour"
          onSelect={() => {}}
        />
      ),
    },
  ],

  requiredSelectors: [
    "[data-state='empty']",
    "[data-state='loading']",
    '[data-active]',
    ':focus-visible',
  ],
}
