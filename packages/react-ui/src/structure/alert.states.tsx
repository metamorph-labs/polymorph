'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Stack } from '../layout/Stack'
import { Alert } from './Alert'

/** States fixture, from `design/components/alert.md`'s States table. */

const noop = () => {}

export const states: ComponentStates = {
  component: 'Alert',

  entries: [
    {
      name: 'info — the default register',
      render: () => (
        <Alert title="Sandbox mode">Nothing you do here reaches a real customer.</Alert>
      ),
      expect: { 'data-tone': 'info', 'data-state': null },
    },
    {
      name: 'success',
      render: () => (
        <Alert tone="success" title="Import finished">
          All 1,284 tickets came across. Twelve needed a requester and now have one.
        </Alert>
      ),
      expect: { 'data-tone': 'success' },
    },
    {
      name: 'warning',
      render: () => (
        <Alert tone="warning" title="Storage almost full">
          You are at 92% of your plan. Uploads stop working at 100%.
        </Alert>
      ),
      expect: { 'data-tone': 'warning' },
    },
    {
      name: 'danger',
      render: () => (
        <Alert tone="danger" title="Two fields need attention">
          The requester email is not an address, and the due date is in the past.
        </Alert>
      ),
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'body only — no title',
      render: () => (
        <Alert tone="warning">Replies are delayed while the mail queue catches up.</Alert>
      ),
      expect: { 'data-tone': 'warning' },
    },
    {
      name: 'title only — the message is the whole Alert',
      render: () => <Alert tone="danger" title="The changes could not be saved" />,
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'with an action',
      render: () => (
        <Alert
          tone="warning"
          title="Storage almost full"
          action={<Button variant="soft" tone="accent" size="sm" label="Upgrade plan" />}
        >
          You are at 92% of your plan. Uploads stop working at 100%.
        </Alert>
      ),
    },
    {
      name: 'with two actions — a review answered in place, apply or discard',
      render: () => (
        <Alert
          tone="info"
          title="Imported fields need review"
          action={<Button variant="soft" tone="accent" size="sm" label="Apply" />}
          secondaryAction={<Button variant="ghost" tone="neutral" size="sm" label="Discard" />}
        >
          Three ticket fields came across under new names.
        </Alert>
      ),
    },
    {
      name: 'dismissible — the ✕ plays the departure, the app owns the unmount',
      render: () => (
        <Alert tone="info" title="New keyboard shortcuts" onDismiss={noop}>
          Press ⌘K anywhere to jump to a ticket.
        </Alert>
      ),
    },
    {
      name: 'icon suppressed — for a stack where the wash already says it',
      render: () => (
        <Stack gap={2}>
          <Alert tone="danger" icon={false}>
            The requester email is not an address.
          </Alert>
          <Alert tone="danger" icon={false}>
            The due date is in the past.
          </Alert>
        </Stack>
      ),
    },
    {
      name: 'nothing to say — no title and no content, so no panel',
      // An empty title and a dismiss handler still give the Alert nothing to show.
      render: () => <Alert tone="danger" title="" onDismiss={noop} />,
      rendersNothing: true,
    },
  ],

  requiredSelectors: ['[data-tone="danger"]'],
}
