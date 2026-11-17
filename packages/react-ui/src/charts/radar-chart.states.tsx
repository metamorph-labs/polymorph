'use client'

import type { ChartDatum, ComponentStates } from '@polymorph/react'
import { RadarChart } from './RadarChart'

/**
 * States fixture, from `design/components/radar-chart.md`'s States table.
 *
 * The data is Relay's coaching rubric, with one shared 0–5 scale on every axis.
 * An axis with a different unit would belong on another chart.
 */

const SKILL_AXES = [
  { key: 'firstResponse', label: 'First response' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'csat', label: 'CSAT' },
  { key: 'escalation', label: 'Escalation judgment' },
  { key: 'coverage', label: 'Coverage' },
] as const

/** One row per axis, in the axes' order: the agent against the team median. */
const COACHING: ChartDatum[] = [
  { agent: 4.5, team: 3.8 },
  { agent: 3.2, team: 3.6 },
  { agent: 4.8, team: 4.1 },
  { agent: 2.9, team: 3.4 },
  { agent: 3.9, team: 3.7 },
]

/** Three teams on the same rubric, which fills the series cap. */
const TEAMS: ChartDatum[] = [
  { triage: 4.2, escalations: 3.5, billing: 3.9 },
  { triage: 3.8, escalations: 4.3, billing: 3.2 },
  { triage: 4.5, escalations: 3.9, billing: 4.0 },
  { triage: 3.1, escalations: 4.6, billing: 3.6 },
  { triage: 3.7, escalations: 3.3, billing: 4.4 },
]

const SIX_AXES = [...SKILL_AXES, { key: 'tooling', label: 'Tooling fluency' }] as const

const SIX_ROWS: ChartDatum[] = [...COACHING, { agent: 4.1, team: 3.9 }]

/** One `null` vertex mid-polygon: the stroke breaks and the twin shows an empty cell. */
const GAPPED: ChartDatum[] = COACHING.map((row, index) =>
  index === 2 ? { agent: null, team: row['team'] ?? null } : row,
)

/** Coverage ratios, 0–1, for the percent format. */
const RATIOS: ChartDatum[] = [
  { weekdays: 0.92, weekends: 0.54 },
  { weekdays: 0.81, weekends: 0.4 },
  { weekdays: 0.88, weekends: 0.61 },
  { weekdays: 0.74, weekends: 0.35 },
  { weekdays: 0.9, weekends: 0.5 },
]

const PAIR = [
  { key: 'agent', label: 'Priya R.' },
  { key: 'team', label: 'Team median' },
] as const

export const states: ComponentStates = {
  component: 'RadarChart',

  entries: [
    {
      name: 'skills matrix',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={COACHING}
          series={[...PAIR]}
          label="Coaching profile against the team"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      name: 'three series',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={TEAMS}
          series={[
            { key: 'triage', label: 'Triage' },
            { key: 'escalations', label: 'Escalations' },
            { key: 'billing', label: 'Billing' },
          ]}
          label="Three teams on the rubric"
        />
      ),
    },
    {
      name: 'six axes',
      render: () => (
        <RadarChart
          axes={[...SIX_AXES]}
          data={SIX_ROWS}
          series={[...PAIR]}
          label="The full rubric — the readable limit"
        />
      ),
    },
    {
      name: 'gap',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={GAPPED}
          series={[...PAIR]}
          label="Coaching profile with an unmeasured axis"
        />
      ),
    },
    {
      name: 'format',
      render: () => (
        <RadarChart
          axes={[
            { key: 'mon', label: 'Mon' },
            { key: 'wed', label: 'Wed' },
            { key: 'fri', label: 'Fri' },
            { key: 'sat', label: 'Sat' },
            { key: 'sun', label: 'Sun' },
          ]}
          data={RATIOS}
          series={[
            { key: 'weekdays', label: 'Day shift' },
            { key: 'weekends', label: 'Night shift' },
          ]}
          format={{ style: 'percent' }}
          label="Coverage by day"
        />
      ),
    },
    {
      // One series: no legend, because the panel title names it.
      name: 'single series',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={COACHING}
          series={[{ key: 'team', label: 'Team median' }]}
          label="The team profile"
        />
      ),
    },
    {
      name: 'empty',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={[]}
          series={[...PAIR]}
          label="Coaching profile against the team"
        />
      ),
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={COACHING}
          series={[...PAIR]}
          loading
          label="Coaching profile against the team"
        />
      ),
      expect: { 'data-state': 'loading' },
    },
    {
      // `false` removes the visual layer only: the keyboard reading position,
      // its announcements and the table twin all stay.
      name: 'tooltip off',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={COACHING}
          series={[...PAIR]}
          tooltip={false}
          label="Coaching profile, print"
        />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a vertex.
      name: 'selectable',
      render: () => (
        <RadarChart
          axes={[...SKILL_AXES]}
          data={COACHING}
          series={[...PAIR]}
          label="Coaching profile against the team"
          onSelect={() => {}}
        />
      ),
    },
  ],

  /*
   * `[aria-pressed='false']` is a hidden series' legend key. As
   * `scatter-chart.md` notes, the legend sheet joins this member's `composes`
   * closure so the selectors law can see it.
   */
  requiredSelectors: [
    "[data-state='empty']",
    "[data-state='loading']",
    '[data-active]',
    "[aria-pressed='false']",
    ':focus-visible',
  ],
}
