import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { EmptyState } from './EmptyState'

/** States fixture, from `design/components/empty-state.md`'s States table. */

export const states: ComponentStates = {
  component: 'EmptyState',

  entries: [
    {
      name: 'minimal',
      render: () => <EmptyState title="No tickets yet" />,
    },
    {
      name: 'standard',
      render: () => (
        <EmptyState
          title="No tickets yet"
          description="When a customer writes in, their ticket will show up here."
        />
      ),
    },
    {
      name: 'with an action — soft, because the page keeps its primary',
      render: () => (
        <EmptyState
          title="No tickets yet"
          description="When a customer writes in, their ticket will show up here."
          action={<Button variant="soft" icon="add" label="New ticket" />}
        />
      ),
    },
    {
      name: 'filtered dry',
      render: () => (
        <EmptyState
          icon="search"
          title="No results match"
          description="Nothing here answers to those filters."
          action={<Button variant="soft" label="New ticket" />}
          secondaryAction={<Button variant="ghost" tone="neutral" label="Clear filters" />}
        />
      ),
    },
    {
      name: 'error-empty — the well stays quiet, the title carries the news',
      render: () => (
        <EmptyState
          icon="error"
          title="Could not load tickets"
          description="The request timed out. Trying again usually works."
          action={<Button variant="soft" icon="refresh" label="Try again" />}
        />
      ),
    },
  ],

  requiredSelectors: [],
}
