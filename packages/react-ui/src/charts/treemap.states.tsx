'use client'

import { type ComponentStates } from '@polymorph/react'
import { Treemap } from './Treemap'
import type { TreemapItem } from './Treemap'

/** States fixture, from `design/components/treemap.md`'s States table. */

/** Relay's storage, in gigabytes, by kind. */
const STORAGE: TreemapItem[] = [
  { key: 'attachments', label: 'Attachments', value: 420 },
  { key: 'images', label: 'Inline images', value: 260 },
  { key: 'exports', label: 'Exports', value: 180 },
  { key: 'audit', label: 'Audit log', value: 90 },
  { key: 'avatars', label: 'Avatars', value: 50 },
]

/** Relay's open tickets by team, and within each team by channel. */
const TEAMS: TreemapItem[] = [
  {
    key: 'support',
    label: 'Support',
    value: 340,
    children: [
      { key: 'support-email', label: 'Email', value: 180 },
      { key: 'support-chat', label: 'Chat', value: 120 },
      { key: 'support-phone', label: 'Phone', value: 40 },
    ],
  },
  {
    key: 'technical',
    label: 'Technical',
    value: 140,
    children: [
      { key: 'technical-email', label: 'Email', value: 70 },
      { key: 'technical-chat', label: 'Chat', value: 50 },
      { key: 'technical-phone', label: 'Phone', value: 20 },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    value: 120,
    children: [
      { key: 'billing-email', label: 'Email', value: 90 },
      { key: 'billing-chat', label: 'Chat', value: 30 },
    ],
  },
  { key: 'partners', label: 'Partners', value: 35 },
]

/** One workspace that holds nearly everything, and forty that hold almost nothing. */
const SKEWED: TreemapItem[] = [
  { key: 'main', label: 'Main workspace', value: 96_000 },
  ...Array.from({ length: 40 }, (_, index) => ({
    key: `sandbox-${index + 1}`,
    label: `Sandbox ${index + 1}`,
    value: 20 + index * 3,
  })),
]

export const states: ComponentStates = {
  component: 'Treemap',

  entries: [
    {
      name: 'storage',
      render: () => <Treemap items={STORAGE} label="Storage by kind, in gigabytes" />,
      expect: { 'data-size': 'md' },
    },
    {
      // Two levels: each team in its own colour, its channels inside it.
      name: 'two levels',
      render: () => <Treemap items={TEAMS} label="Open tickets by team and channel" />,
    },
    {
      name: 'one item',
      render: () => <Treemap items={STORAGE.slice(0, 1)} label="Storage by kind, in gigabytes" />,
    },
    {
      // Nothing takes area; the twin lists every item and the summary says none is drawn.
      name: 'all zero',
      render: () => (
        <Treemap
          items={[
            { key: 'email', label: 'Email', value: 0 },
            { key: 'chat', label: 'Chat', value: 0 },
          ]}
          label="Escalations by channel"
        />
      ),
    },
    {
      name: 'one huge, many tiny',
      render: () => <Treemap items={SKEWED} label="Storage by workspace, in megabytes" />,
    },
    {
      name: 'long labels',
      render: () => (
        <Treemap
          items={[
            {
              key: 'archive',
              label: 'Archived exports from the previous storage provider, kept for audit',
              value: 300,
            },
            { key: 'current', label: 'Current exports', value: 200 },
            {
              key: 'scheduled',
              label: 'Scheduled reports waiting for delivery to the finance team',
              value: 60,
            },
          ]}
          label="Exports"
        />
      ),
    },
    {
      // A zero and a negative take no area; they stay in the twin and the summary counts them.
      name: 'absent items',
      render: () => (
        <Treemap
          items={[
            ...STORAGE.slice(0, 3),
            { key: 'trash', label: 'Trash', value: 0 },
            { key: 'credit', label: 'Storage credit', value: -40 },
          ]}
          label="Storage by kind, in gigabytes"
        />
      ),
    },
    {
      // A third level is summed into the second, with a dev warning.
      name: 'three levels',
      render: () => (
        <Treemap
          items={[
            {
              key: 'engineering',
              label: 'Engineering',
              value: 90,
              children: [
                {
                  key: 'platform',
                  label: 'Platform',
                  value: 60,
                  children: [
                    { key: 'databases', label: 'Databases', value: 35 },
                    { key: 'network', label: 'Network', value: 25 },
                  ],
                },
                { key: 'apps', label: 'Apps', value: 30 },
              ],
            },
            { key: 'design', label: 'Design', value: 40 },
          ]}
          label="Seats by team"
        />
      ),
    },
    {
      name: 'format',
      render: () => (
        <Treemap
          items={[
            { key: 'compute', label: 'Compute', value: 48_200 },
            { key: 'storage', label: 'Storage', value: 21_400 },
            { key: 'egress', label: 'Egress', value: 9600 },
            { key: 'support', label: 'Support', value: 4100 },
          ]}
          format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
          label="Spend by line"
        />
      ),
    },
    {
      name: 'small',
      render: () => <Treemap items={TEAMS} size="sm" label="Open tickets by team and channel" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'empty',
      render: () => <Treemap items={[]} label="Storage by kind, in gigabytes" />,
      expect: { 'data-state': 'empty' },
    },
    {
      name: 'loading',
      render: () => <Treemap items={STORAGE} loading label="Storage by kind, in gigabytes" />,
      expect: { 'data-state': 'loading' },
    },
    {
      name: 'tooltip off',
      render: () => (
        <Treemap items={STORAGE} tooltip={false} label="Storage by kind, in gigabytes, print" />
      ),
    },
    {
      // With `onSelect`: the summary names the activation, and an agent can pick a tile.
      name: 'selectable',
      render: () => (
        <Treemap items={STORAGE} label="Storage by kind, in gigabytes" onSelect={() => {}} />
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
