'use client'

import { useState } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Stack } from '../layout/Stack'
import { Drawer, type DrawerProps } from './Drawer'

/**
 * States fixture, from `design/components/drawer.md`'s States table.
 *
 * Every entry has a working launcher. A drawer takes no `trigger`, because the
 * screen owns the control that opens it and the state behind it. An open panel
 * with no way back would leave out the part an application writes. `Launcher`
 * is that part, in as few lines as possible.
 *
 * One entry starts open, on purpose. The panel portals out of the container,
 * so a closed drawer renders only its button, and a gallery of buttons shows
 * nothing about a sheet. Only one, because six open sheets would stack six
 * scrims and misrepresent the single token they all use.
 */

function Launcher({ label, ...drawer }: { label: string } & Omit<DrawerProps, 'onOpenChange'>) {
  const [open, setOpen] = useState(drawer.defaultOpen ?? false)

  return (
    <>
      <Button variant="outline" tone="neutral" label={label} onClick={() => setOpen(true)} />
      <Drawer {...drawer} open={open} onOpenChange={setOpen} />
    </>
  )
}

function TicketDetail() {
  return (
    <Stack gap={4}>
      <FormField label="Assignee" description="Whoever picks this up owns it until it closes.">
        <Input defaultValue="Priya Raman" />
      </FormField>
      <p>
        The customer replied twice while this sat unassigned. Both replies are on the ticket, and
        neither has been read.
      </p>
    </Stack>
  )
}

function LongBody() {
  return (
    <Stack gap={4}>
      {Array.from({ length: 14 }, (_, index) => (
        <p key={index}>
          Reply {index + 1}. A thread long enough that it has to scroll inside the sheet while the
          title and the actions stay exactly where they were put.
        </p>
      ))}
    </Stack>
  )
}

export const states: ComponentStates = {
  component: 'Drawer',

  entries: [
    {
      name: 'open end — the default edge',
      render: () => (
        <Launcher
          defaultOpen
          label="Open the ticket"
          title="Ticket #4182"
          description="Refund not received"
        >
          <TicketDetail />
        </Launcher>
      ),
    },
    {
      name: 'start — the other inline edge',
      render: () => (
        <Launcher side="start" label="Open from the start edge" title="Filters">
          <p>A filter stack is the other thing a side sheet is for.</p>
        </Launcher>
      ),
    },
    {
      name: 'bottom — as tall as its content, up to a share of the viewport',
      render: () => (
        <Launcher side="bottom" label="Open from the bottom" title="Share this ticket">
          <p>A bottom sheet sizes on the block axis, which is why its sizes are viewport shares.</p>
        </Launcher>
      ),
    },
    {
      name: 'sizes — sm and lg',
      render: () => (
        <Stack gap={3} align="start">
          <Launcher size="sm" label="Open a small sheet" title="Quick edit">
            <p>Narrow enough to sit beside the page it came from.</p>
          </Launcher>
          <Launcher size="lg" label="Open a large sheet" title="Full ticket history">
            <p>Wide enough for a table, which is the reason the size exists.</p>
          </Launcher>
        </Stack>
      ),
    },
    {
      name: 'with a footer — one primary action, rightmost',
      render: () => (
        <Launcher
          label="Open with actions"
          title="Reassign ticket"
          description="The current owner is told either way."
          footer={
            <>
              <Button variant="outline" tone="neutral" label="Cancel" />
              <Button label="Reassign" />
            </>
          }
        >
          <TicketDetail />
        </Launcher>
      ),
    },
    {
      name: 'forced choice — no ✕, no Escape, no outside click',
      render: () => (
        <Launcher
          dismissible={false}
          label="Open a forced choice"
          title="Finish the handover"
          description="This one cannot be waved away."
          footer={<Button label="Hand over" />}
        >
          <p>Use sparingly. The footer is the only way out, so it had better contain one.</p>
        </Launcher>
      ),
    },
    {
      name: 'scrolling body — the header and the footer stay put',
      render: () => (
        <Launcher
          label="Open a long thread"
          title="Ticket #4182"
          description="Fourteen replies"
          footer={<Button label="Reply" />}
        >
          <LongBody />
        </Launcher>
      ),
    },
  ],

  requiredSelectors: ['[data-state="open"]', '[data-state="closed"]', ':focus-visible'],
}
