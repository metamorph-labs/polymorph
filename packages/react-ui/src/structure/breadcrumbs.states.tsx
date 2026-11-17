import { type ComponentStates } from '@polymorph/react'
import { Breadcrumbs } from './Breadcrumbs'

/** States fixture, from `design/components/breadcrumbs.md`'s States table. */

const TWO = [{ label: 'Tickets', href: '#tickets' }, { label: 'Ticket #4182' }]

const FOUR = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Support', href: '#support' },
  { label: 'Ticket #4182' },
]

const SIX = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Northwind', href: '#northwind' },
  { label: 'Support', href: '#support' },
  { label: 'Escalations', href: '#escalations' },
  { label: 'Ticket #4182' },
]

export const states: ComponentStates = {
  component: 'Breadcrumbs',

  entries: [
    {
      name: 'two levels',
      render: () => <Breadcrumbs items={TWO} />,
      expect: { 'aria-label': 'Breadcrumb' },
    },
    {
      name: 'four levels — no overflow yet',
      render: () => <Breadcrumbs items={FOUR} />,
    },
    {
      name: 'collapsed — the first crumb, the overflow, and the last two',
      render: () => <Breadcrumbs items={SIX} />,
    },
    {
      name: 'overflow open — the hidden crumbs, in order',
      render: () => <Breadcrumbs items={SIX} defaultOpen />,
    },
    {
      name: 'collapsing disabled — the whole path, however long',
      render: () => <Breadcrumbs items={SIX} maxItems={Infinity} />,
    },
    {
      name: 'long labels — clipped, so the trail stays one line',
      render: () => (
        <Breadcrumbs
          items={[
            { label: 'Home', href: '#home' },
            {
              label: 'Refund not received for order 88-2401 placed in March',
              href: '#thread',
            },
            { label: 'Ticket #4182' },
          ]}
        />
      ),
    },
  ],

  requiredSelectors: [':hover', ':focus-visible', '[aria-current="page"]'],
}
