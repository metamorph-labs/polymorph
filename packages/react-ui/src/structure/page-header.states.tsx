'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { InlineEdit } from '../controls/InlineEdit'
import { PageHeader } from './PageHeader'

/** States fixture, from `design/components/page-header.md`'s States table. */

const noop = () => {}

const ACTIONS = (
  <>
    <Button variant="ghost" tone="neutral" icon="download" label="Export" />
    <Button icon="add" label="New ticket" />
  </>
)

export const states: ComponentStates = {
  component: 'PageHeader',

  entries: [
    {
      name: 'title only',
      render: () => <PageHeader title="Tickets" />,
    },
    {
      name: 'with a description',
      render: () => (
        <PageHeader
          title="Tickets"
          description="Everything customers have asked for, oldest first."
        />
      ),
    },
    {
      name: 'with actions — one primary, and it is the rightmost',
      render: () => <PageHeader title="Tickets" actions={ACTIONS} />,
    },
    {
      name: 'full',
      render: () => (
        <PageHeader
          title="Tickets"
          description="Everything customers have asked for, oldest first."
          actions={ACTIONS}
        />
      ),
    },
    {
      name: 'a long title, with the actions holding their ground',
      render: () => (
        <PageHeader
          title="Tickets, escalations and everything else the support queue has collected this quarter"
          description="The title wraps; the actions do not shrink."
          actions={ACTIONS}
        />
      ),
    },
    {
      name: 'a title edited in place — the edit control beside the h1, outside it',
      render: () => (
        <PageHeader
          title="Tickets"
          titleEdit={<InlineEdit label="Queue name" value="Tickets" size="lg" onCommit={noop} />}
          description="Everything customers have asked for, oldest first."
          actions={ACTIONS}
        />
      ),
    },
    {
      name: 'renaming — the field in the title’s place, the h1 kept for assistive technology',
      render: () => (
        <PageHeader
          title="Tickets"
          titleEdit={
            <InlineEdit
              label="Queue name"
              value="Tickets"
              size="lg"
              defaultEditing
              onCommit={noop}
            />
          }
          description="Everything customers have asked for, oldest first."
          actions={ACTIONS}
        />
      ),
    },
  ],

  requiredSelectors: [],
}
