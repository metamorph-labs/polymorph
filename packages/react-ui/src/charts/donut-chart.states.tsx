'use client'

import { type ComponentStates } from '@polymorph/react'
import { DonutChart } from './DonutChart'
import type { DonutSegment } from './DonutChart'

/** States fixture, from `design/components/donut-chart.md`'s States table. */

const CHANNELS: DonutSegment[] = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

const TEAMS: DonutSegment[] = [
  { key: 'frontline', label: 'Frontline', value: 128 },
  { key: 'billing', label: 'Billing', value: 74 },
  { key: 'technical', label: 'Technical', value: 61 },
  { key: 'escalations', label: 'Escalations', value: 39 },
  { key: 'partners', label: 'Partners', value: 22 },
  { key: 'onboarding', label: 'Onboarding', value: 14 },
]

/** A channel with no use this month. The ring skips it; the legend keeps it. */
const WITH_ZERO: DonutSegment[] = [
  ...CHANNELS.slice(0, 3),
  { key: 'social', label: 'Social', value: 0 },
]

export const states: ComponentStates = {
  component: 'DonutChart',

  entries: [
    {
      name: 'channels',
      render: () => (
        <DonutChart
          segments={CHANNELS}
          center={{ value: '369', label: 'Open tickets' }}
          label="Open tickets by channel"
        />
      ),
      expect: { 'data-size': 'md' },
    },
    {
      // At the six-segment limit. A seventh raises a dev warning suggesting an
      // "Other" segment, and never gets a generated hue.
      name: 'six segments',
      render: () => (
        <DonutChart
          segments={TEAMS}
          center={{ value: '338', label: 'Open tickets' }}
          label="Open tickets by team"
        />
      ),
    },
    {
      name: 'two segments',
      render: () => (
        <DonutChart
          segments={[
            { key: 'resolved', label: 'Resolved', value: 812 },
            { key: 'open', label: 'Open', value: 369 },
          ]}
          center={{ value: '1,181', label: 'This month' }}
          label="Resolved against open"
        />
      ),
    },
    {
      // The case this chart is for: one share so dominant that no reader has to
      // estimate an angle to see it.
      name: 'dominant share',
      render: () => (
        <DonutChart
          segments={[
            { key: 'self', label: 'Self-serve', value: 880 },
            { key: 'assisted', label: 'Assisted', value: 120 },
          ]}
          center={{ value: '88%', label: 'Self-serve' }}
          label="Resolution path"
        />
      ),
    },
    {
      name: 'zero segment',
      render: () => (
        <DonutChart
          segments={WITH_ZERO}
          center={{ value: '351', label: 'Open tickets' }}
          label="Open tickets by channel, with an unused channel"
        />
      ),
    },
    {
      name: 'no center',
      render: () => <DonutChart segments={CHANNELS} label="Open tickets by channel" />,
    },
    {
      name: 'format',
      render: () => (
        <DonutChart
          segments={[
            { key: 'plan', label: 'Subscriptions', value: 48_200 },
            { key: 'seats', label: 'Seats', value: 21_400 },
            { key: 'support', label: 'Support', value: 9600 },
          ]}
          format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
          center={{ value: '$79,200', label: 'Monthly revenue' }}
          label="Revenue by line"
        />
      ),
    },
    {
      name: 'empty',
      render: () => <DonutChart segments={[]} label="Open tickets by channel" />,
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => <DonutChart segments={CHANNELS} loading label="Open tickets by channel" />,
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      render: () => (
        <DonutChart segments={CHANNELS} tooltip={false} label="Open tickets by channel, print" />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a segment.
      name: 'selectable',
      render: () => (
        <DonutChart
          segments={CHANNELS}
          center={{ value: '369', label: 'Open tickets' }}
          label="Open tickets by channel"
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
