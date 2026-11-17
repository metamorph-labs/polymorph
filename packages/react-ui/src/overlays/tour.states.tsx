import type { ReactElement } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Tour } from './Tour'
import type { TourStep } from './Tour'

/**
 * States fixture, from `design/components/tour.md`'s States table.
 *
 * Every entry is open, because a tour has no trigger. A target's name is the
 * page's, so each entry names its targets after itself: the gallery draws
 * every entry on one page, and each tour points at its own targets. Escape
 * closes the topmost tour and shows the one under it.
 */

/** Three steps over a small page of three targets, the targets named after the entry. */
const steps = (entry: string, side?: TourStep['side']): readonly TourStep[] =>
  [
    { id: 'create', title: 'Create a ticket', body: 'Start here to log a new request.' },
    { id: 'filter', title: 'Narrow the list', body: 'Filter tickets by status, owner or tag.' },
    {
      id: 'export',
      title: 'Take the list with you',
      body: 'Export the tickets you see as a file.',
    },
  ].map((step) => ({ ...step, target: `${entry}-${step.id}`, ...(side ? { side } : {}) }))

/** The tour above the page it walks through. The Tour is written inline, so its props can be set. */
const page = (entry: string, tour: ReactElement) => (
  <Stack gap={4}>
    {tour}
    <Inline gap={3}>
      <Tour.Target name={`${entry}-create`}>
        <Button label="New ticket" icon="add" />
      </Tour.Target>
      <Tour.Target name={`${entry}-filter`}>
        <Button variant="outline" tone="neutral" icon="filter" label="Filter" />
      </Tour.Target>
      <Tour.Target name={`${entry}-export`}>
        <Button variant="ghost" tone="neutral" label="Export" />
      </Tour.Target>
    </Inline>
  </Stack>
)

export const states: ComponentStates = {
  component: 'Tour',

  entries: [
    {
      name: 'first step — below its target, with no Previous',
      render: () => page('first', <Tour defaultOpen steps={steps('first')} />),
    },
    {
      name: 'middle step — Previous and Next',
      render: () => page('middle', <Tour defaultOpen defaultStep={1} steps={steps('middle')} />),
    },
    {
      name: 'last step — Done ends the tour',
      render: () => page('last', <Tour defaultOpen defaultStep={2} steps={steps('last')} />),
    },
    {
      name: 'a step with no target, drawn centred',
      render: () =>
        page(
          'none',
          <Tour
            defaultOpen
            steps={[
              {
                id: 'welcome',
                title: 'Welcome to the queue',
                body: 'Three things to know before you start.',
              },
              ...steps('none'),
            ]}
          />,
        ),
    },
    {
      name: 'a step whose target is not on the page, drawn centred',
      render: () =>
        page(
          'missing',
          <Tour
            defaultOpen
            steps={[
              {
                id: 'assign',
                target: 'missing-assign',
                title: 'Assign it',
                body: 'Give the ticket an owner from its own page.',
              },
            ]}
          />,
        ),
    },
    {
      name: 'above its target',
      render: () => page('top', <Tour defaultOpen defaultStep={1} steps={steps('top', 'top')} />),
    },
    {
      name: 'beside its target',
      render: () =>
        page('right', <Tour defaultOpen defaultStep={1} steps={steps('right', 'right')} />),
    },
  ],

  /* The panel takes focus when a step opens, and draws its ring when that came
     from a key. */
  requiredSelectors: [':focus-visible'],
}
