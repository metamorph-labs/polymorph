import { type ComponentStates } from '@polymorph/react'
import { JsonTree } from './JsonTree'

/** States fixture, from `design/components/json-tree.md`'s States table. */

const PAYLOAD = {
  id: 'tkt_5417',
  title: 'Sync fails on large workspaces',
  priority: 2,
  resolved: false,
  assignee: { name: 'Ada Okonkwo', team: 'Platform' },
  labels: ['sync', 'performance'],
  closedAt: null,
}

const EVERY_KIND = {
  string: 'a string',
  number: 41.5,
  boolean: true,
  nothing: null,
}

export const states: ComponentStates = {
  component: 'JsonTree',

  entries: [
    {
      name: 'a payload — the first ring open',
      render: () => <JsonTree data={PAYLOAD} label="Response body" />,
      expect: { 'aria-label': 'Response body' },
    },
    {
      name: 'closed fist — depth 0',
      render: () => <JsonTree data={PAYLOAD} label="Response body" defaultDepth={0} />,
    },
    {
      name: 'wide open — every ring',
      render: () => <JsonTree data={PAYLOAD} label="Response body" defaultDepth={Infinity} />,
    },
    {
      name: 'every kind',
      render: () => <JsonTree data={EVERY_KIND} label="Every kind" defaultDepth={Infinity} />,
    },
    {
      name: 'empty containers — leaves, no toggle',
      render: () => (
        <JsonTree data={{ empty: {}, none: [] }} label="Empty containers" defaultDepth={Infinity} />
      ),
    },
    {
      name: 'primitive root',
      render: () => <JsonTree data={42} label="A number alone" />,
    },
  ],

  /*
   * The toggle's pointer states, its open state, and every kind value, to show
   * that each has a recipe and not only a type.
   */
  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[aria-expanded="true"]',
    '[data-kind="string"]',
    '[data-kind="number"]',
    '[data-kind="boolean"]',
    '[data-kind="null"]',
  ],
}
