'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Avatar } from './Avatar'
import { Badge } from './Badge'
import { List } from './List'

/** States fixture, from `design/components/list.md`'s States table. */

const PEOPLE = [
  { name: 'Ada Okafor', role: 'Owner · signed in 2 minutes ago', seen: '2m', href: '#ada' },
  { name: 'Bao Tran', role: 'Member · signed in yesterday', seen: '1d', href: '#bao' },
  { name: 'Carmen Ruiz', role: 'Member · invited, not yet signed in', seen: '6d', href: '#carmen' },
]

const LONG_TITLE =
  'ticket-export-2026-eu-west-1-production-customer-support-archive-part-0001-of-0042'

export const states: ComponentStates = {
  component: 'List',

  entries: [
    {
      name: 'items that are read',
      render: () => (
        <List label="Recent sign-ins">
          {PEOPLE.map((person) => (
            <List.Item
              key={person.name}
              title={person.name}
              description={person.role}
              meta={person.seen}
            />
          ))}
        </List>
      ),
      expect: { 'aria-label': 'Recent sign-ins' },
    },
    {
      name: 'items that navigate',
      render: () => (
        <List label="Members">
          {PEOPLE.map((person) => (
            <List.Item
              key={person.name}
              title={person.name}
              description={person.role}
              meta={person.seen}
              href={person.href}
              leading={<Avatar name={person.name} />}
            />
          ))}
        </List>
      ),
    },
    {
      name: 'the item of the open page is current',
      render: () => (
        <List label="Members">
          {PEOPLE.map((person, index) => (
            <List.Item
              key={person.name}
              title={person.name}
              description={person.role}
              href={person.href}
              current={index === 0}
            />
          ))}
        </List>
      ),
    },
    {
      name: 'items that are picked',
      render: () => (
        <List label="Accounts">
          {PEOPLE.map((person, index) => (
            <List.Item
              key={person.name}
              title={person.name}
              description={person.role}
              onSelect={() => {}}
              current={index === 0}
              leading={<Avatar name={person.name} />}
            />
          ))}
        </List>
      ),
    },
    {
      name: 'a trailing control — it takes its own press',
      render: () => (
        <List label="Invitations">
          <List.Item
            title="Ada Okafor"
            description="Invited as an owner"
            href="#ada"
            trailing={<Button variant="outline" tone="neutral" size="sm" label="Resend" />}
          />
          <List.Item
            title="Bao Tran"
            description="Invited as a member"
            href="#bao"
            trailing={<Badge tone="warning">Expired</Badge>}
          />
        </List>
      ),
    },
    {
      name: 'a long title and description — they wrap, so the list does not widen the page',
      render: () => (
        <List label="Exports">
          <List.Item
            title={LONG_TITLE}
            description={`${LONG_TITLE}.zip, requested by an administrator and kept for thirty days`}
            meta="4.2 GB"
          />
        </List>
      ),
    },
  ],

  requiredSelectors: ['[data-interactive]:hover', ':focus-visible', '[data-current]'],
}
