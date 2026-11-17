'use client'

import { type ComponentStates } from '@polymorph/react'
import { FunnelChart } from './FunnelChart'
import type { FunnelStage } from './FunnelChart'

/** States fixture, from `design/components/funnel-chart.md`'s States table. */

/** Relay's tickets this month, from opened to rated. */
const LIFECYCLE: FunnelStage[] = [
  { key: 'opened', label: 'Opened', value: 1240 },
  { key: 'assigned', label: 'Assigned', value: 1180 },
  { key: 'replied', label: 'First reply', value: 1020 },
  { key: 'resolved', label: 'Resolved', value: 860 },
  { key: 'rated', label: 'Rated', value: 312 },
]

/** The help centre's self-serve path, twelve steps long. */
const TWELVE: FunnelStage[] = [
  'Searched',
  'Opened an article',
  'Read to the end',
  'Opened a second article',
  'Used the contact form',
  'Picked a topic',
  'Wrote a message',
  'Attached a file',
  'Sent',
  'Got an answer',
  'Marked solved',
  'Rated the answer',
].map((label, index) => ({
  key: `step-${index + 1}`,
  label,
  value: Math.round(9600 * 0.82 ** index),
}))

export const states: ComponentStates = {
  component: 'FunnelChart',

  entries: [
    {
      name: 'lifecycle',
      render: () => <FunnelChart stages={LIFECYCLE} label="Tickets from opened to rated" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'two stages',
      render: () => (
        <FunnelChart stages={LIFECYCLE.slice(0, 2)} label="Tickets opened and assigned" />
      ),
    },
    {
      name: 'one stage',
      render: () => <FunnelChart stages={LIFECYCLE.slice(0, 1)} label="Tickets opened" />,
    },
    {
      // No share and no step can be stated against a first stage of zero.
      name: 'first stage zero',
      render: () => (
        <FunnelChart
          stages={[
            { key: 'invited', label: 'Invited', value: 0 },
            { key: 'joined', label: 'Joined', value: 0 },
            { key: 'active', label: 'Active', value: 0 },
          ]}
          label="Agents invited this week"
        />
      ),
    },
    {
      name: 'zero in the middle',
      render: () => (
        <FunnelChart
          stages={[
            { key: 'escalated', label: 'Escalated', value: 46 },
            { key: 'engineering', label: 'Sent to engineering', value: 0 },
            { key: 'fixed', label: 'Fixed', value: 0 },
          ]}
          label="Escalations this week"
        />
      ),
    },
    {
      name: 'equal stages',
      render: () => (
        <FunnelChart
          stages={[
            { key: 'opened', label: 'Opened', value: 320 },
            { key: 'assigned', label: 'Assigned', value: 320 },
            { key: 'replied', label: 'First reply', value: 290 },
          ]}
          label="Urgent tickets"
        />
      ),
    },
    {
      // Drawn as given and warned about: the member never clamps or reorders.
      name: 'rising stage',
      render: () => (
        <FunnelChart
          stages={[
            { key: 'trial', label: 'Started a trial', value: 400 },
            { key: 'invited', label: 'Invited a teammate', value: 520 },
            { key: 'paid', label: 'Paid', value: 180 },
          ]}
          label="Workspaces from trial to paid"
        />
      ),
    },
    {
      name: 'long labels',
      render: () => (
        <FunnelChart
          stages={[
            {
              key: 'verify',
              label: 'Started the identity verification with a passport or a national card',
              value: 2048,
            },
            {
              key: 'upload',
              label: 'Uploaded both sides of the card and a recent photograph',
              value: 1630,
            },
            { key: 'approved', label: 'Approved', value: 1410 },
          ]}
          label="Identity verification"
        />
      ),
    },
    {
      name: 'twelve stages',
      render: () => <FunnelChart stages={TWELVE} label="Self-serve help path" />,
    },
    {
      name: 'format',
      render: () => (
        <FunnelChart
          stages={[
            { key: 'pipeline', label: 'Pipeline', value: 1_840_000 },
            { key: 'qualified', label: 'Qualified', value: 920_000 },
            { key: 'proposal', label: 'Proposal', value: 410_000 },
            { key: 'won', label: 'Won', value: 126_000 },
          ]}
          format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
          label="Seat revenue by stage"
        />
      ),
    },
    {
      name: 'small',
      render: () => (
        <FunnelChart stages={LIFECYCLE} size="sm" label="Tickets from opened to rated" />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'empty',
      render: () => <FunnelChart stages={[]} label="Tickets from opened to rated" />,
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => <FunnelChart stages={LIFECYCLE} loading label="Tickets from opened to rated" />,
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      render: () => (
        <FunnelChart
          stages={LIFECYCLE}
          tooltip={false}
          label="Tickets from opened to rated, print"
        />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a stage.
      name: 'selectable',
      render: () => (
        <FunnelChart stages={LIFECYCLE} label="Tickets from opened to rated" onSelect={() => {}} />
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
