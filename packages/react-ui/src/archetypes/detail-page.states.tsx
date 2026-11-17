'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { InlineEdit } from '../controls/InlineEdit'
import { Avatar } from '../structure/Avatar'
import { Badge } from '../structure/Badge'
import { Stack } from '../layout/Stack'
import { Card } from '../structure/Card'
import { Heading } from '../structure/Heading'
import { Stat } from '../structure/Stat'
import { TableOfContents } from '../structure/TableOfContents'
import { Text } from '../structure/Text'
import { Tabs } from '../overlays/Tabs'
import { DetailPage } from './DetailPage'

/** States fixture, from `design/archetypes/detail-page.md`'s States table. */

const noop = () => {}

const META = (
  <>
    <Badge tone="info">Open</Badge>
    <Badge variant="outline" tone="danger">
      Urgent
    </Badge>
    <Avatar name="Ada Lovelace" size="sm" />
    <span>Ada Lovelace</span>
    <span>opened 4 minutes ago</span>
  </>
)

const TABS = [
  { value: 'conversation', label: 'Conversation' },
  { value: 'events', label: 'Events', count: 12 },
]

const ASIDE = (
  <>
    <Card>
      <Stat
        label="First response"
        value="14m"
        delta={{ value: '3m', direction: 'down', positive: true }}
      />
    </Card>
    <Card>
      <Stat label="Replies" value="6" />
    </Card>
  </>
)

/**
 * The long body of the entry whose aside stays in view: a runbook's sections,
 * each a Heading whose id a TableOfContents item names and two paragraphs.
 * The ids carry the member's name, because a gallery shows every entry on one
 * page.
 */
const RUNBOOK: { id: string; label: string; text: [string, string] }[] = [
  {
    id: 'detail-before',
    label: 'Before you start',
    text: [
      'Rotating the signing keys signs every new token with the new key. Tokens signed with the old key stay valid until they expire, which takes at most one hour.',
      'Book a quiet hour and tell the support team, because a client that caches keys for longer than an hour fails its first request after the rotation.',
    ],
  },
  {
    id: 'detail-generate',
    label: 'Generate the new key',
    text: [
      'Generate the key on the release machine, never on a laptop. The command writes the private half to the vault and prints the public half and its key id.',
      'Check that the printed key id is new. A key id that is already listed means the vault returned an old key, and the rotation stops there.',
    ],
  },
  {
    id: 'detail-publish',
    label: 'Publish the public key',
    text: [
      'Add the public half to the published key set beside the old one. Both keys stay in the set until the old one has signed its last token.',
      'Wait until every region serves the new set. A region that serves the old set rejects tokens signed with the new key.',
    ],
  },
  {
    id: 'detail-switch',
    label: 'Switch the signer',
    text: [
      'Point the signer at the new key id and restart it in one region first. Watch that region for ten minutes before the others.',
      'A rise in rejected tokens means a client reads a cached key set. Point the signer back at the old key id and the rejections stop.',
    ],
  },
  {
    id: 'detail-retire',
    label: 'Retire the old key',
    text: [
      'After an hour no valid token carries the old key id. Remove the old public half from the key set, then delete its private half from the vault.',
      'Record the rotation in the audit log with both key ids and the time of each step.',
    ],
  },
  {
    id: 'detail-undo',
    label: 'Undo a rotation',
    text: [
      'Until the old private half is deleted, a rotation is undone by pointing the signer back at the old key id. After that, a new rotation is the only way back.',
      'Tokens signed with the new key stay valid until they expire, so an undo needs no second outage.',
    ],
  },
]

export const states: ComponentStates = {
  component: 'DetailPage',

  entries: [
    {
      name: 'everything — back, meta, actions, tabs and an aside',
      render: () => (
        // No children, because the tabs are the body. A page with both would
        // show the tab content and then the children below it.
        <DetailPage
          backLabel="Back to inbox"
          onBack={noop}
          title="Webhook retries stop after the first 5xx"
          meta={META}
          actions={
            <>
              <Button variant="outline" tone="neutral" label="Snooze" />
              <Button label="Reply" />
            </>
          }
          tabs={
            <Tabs tabs={TABS}>
              <Tabs.Content value="conversation">
                <p>The conversation.</p>
              </Tabs.Content>
              <Tabs.Content value="events">
                <p>The audit trail.</p>
              </Tabs.Content>
            </Tabs>
          }
          aside={ASIDE}
        />
      ),
    },
    {
      name: 'no tabs — one body',
      render: () => (
        <DetailPage
          backLabel="Back to customers"
          onBack={noop}
          title="Northwind Traders"
          meta={META}
          aside={ASIDE}
        >
          <Card>
            <p>The account.</p>
          </Card>
        </DetailPage>
      ),
    },
    {
      name: 'no aside — the body takes the width',
      render: () => (
        <DetailPage
          backLabel="Back to inbox"
          onBack={noop}
          title="SSO login loops back to the sign-in page"
          meta={META}
          actions={<Button label="Reply" />}
        >
          <Card>
            <p>The conversation.</p>
          </Card>
        </DetailPage>
      ),
    },
    {
      name: 'minimal — a way back, a name and a body',
      render: () => (
        <DetailPage backLabel="Back" onBack={noop} title="T-2041">
          <Card>
            <p>The conversation.</p>
          </Card>
        </DetailPage>
      ),
    },
    {
      name: 'an aside that stays in view — a table of contents beside a long body',
      render: () => (
        <DetailPage
          backLabel="Back to runbooks"
          onBack={noop}
          title="Rotate the signing keys"
          stickyAside
          aside={
            <>
              <Card>
                <Stat label="Last rotated" value="41 days" />
              </Card>
              <TableOfContents
                label="On this page"
                items={RUNBOOK.map(({ id, label }) => ({ id, label }))}
              />
            </>
          }
        >
          <Stack gap={6}>
            {RUNBOOK.map((section) => (
              <Stack gap={3} key={section.id}>
                <Heading id={section.id}>{section.label}</Heading>
                {section.text.map((words) => (
                  <Text key={words}>{words}</Text>
                ))}
              </Stack>
            ))}
          </Stack>
        </DetailPage>
      ),
    },
    {
      name: 'a name edited in place — the edit control beside the h1, the meta under it',
      render: () => (
        <DetailPage
          backLabel="Back to applications"
          onBack={noop}
          title="Billing service"
          titleEdit={
            <InlineEdit
              label="Application name"
              value="Billing service"
              size="lg"
              required
              maxLength={80}
              onCommit={noop}
            />
          }
          meta={META}
          actions={<Button variant="outline" tone="neutral" label="Open definition" />}
        >
          <Card>
            <p>The environments.</p>
          </Card>
        </DetailPage>
      ),
    },
  ],

  requiredSelectors: [],
}
