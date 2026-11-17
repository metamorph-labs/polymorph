'use client'

import { useEffect } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

/**
 * States fixture, from `design/components/confirm-dialog.md`'s States table.
 *
 * Every open entry keeps its trigger. The panel portals out of the container,
 * so an open dialog without a trigger renders nothing where the completeness
 * law looks. Real screens also always open a confirm from some control.
 */

const noop = () => {}

const TRIGGER = <Button variant="ghost" tone="neutral" label="Discard" />

/** A typed confirmation: deleting a project, named by the phrase the person types. */
const PROJECT = {
  trigger: <Button variant="ghost" tone="neutral" label="Delete project" />,
  title: 'Delete the acme-billing project?',
  description: 'Its tickets, members and settings are deleted with it. This cannot be undone.',
  confirmLabel: 'Delete project',
  confirmWith: 'acme-billing',
  onConfirm: noop,
}

/** How many frames the mistyped entry waits for its panel before giving up. */
const PANEL_FRAMES = 60

/**
 * Open, with text already typed into the phrase field. The text is the
 * reader's, not a prop, so this entry types it into the field the way a reader
 * would, once the panel is up.
 */
function Typed({ text, ...confirm }: { text: string } & ConfirmDialogProps) {
  useEffect(() => {
    let frame = 0
    let waited = 0
    const type = () => {
      const field = document.querySelector<HTMLInputElement>('[data-member="confirm-dialog"] input')
      if (field === null) {
        if (++waited < PANEL_FRAMES) frame = requestAnimationFrame(type)
        return
      }
      // React reads a typed value through the input's own setter, so the
      // prototype's setter and an `input` event are what make this a keystroke.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, text)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    frame = requestAnimationFrame(type)
    return () => cancelAnimationFrame(frame)
  }, [text])

  return <ConfirmDialog {...confirm} />
}

export const states: ComponentStates = {
  component: 'ConfirmDialog',

  entries: [
    {
      name: 'closed — just the trigger',
      render: () => (
        <ConfirmDialog
          trigger={TRIGGER}
          title="Discard this ticket?"
          description="The subject and requester you have typed will be lost."
          confirmLabel="Discard"
          onConfirm={noop}
        />
      ),
    },
    {
      name: 'closed, accent — opening puts focus on the confirm, which destroys nothing',
      render: () => (
        <ConfirmDialog
          trigger={<Button variant="ghost" tone="neutral" label="Publish" />}
          tone="accent"
          title="Publish this article?"
          description="It becomes visible to everyone with the link, immediately."
          confirmLabel="Publish"
          cancelLabel="Not yet"
          onConfirm={noop}
        />
      ),
    },
    {
      name: 'open, guarding a destruction',
      render: () => (
        <ConfirmDialog
          open
          trigger={TRIGGER}
          title="Delete 3 tickets?"
          description="They leave the inbox and the archive. This cannot be undone."
          confirmLabel="Delete 3 tickets"
          onConfirm={noop}
        />
      ),
    },
    {
      name: 'open, guarding something consequential but safe',
      render: () => (
        <ConfirmDialog
          open
          trigger={TRIGGER}
          tone="accent"
          title="Publish this article?"
          description="It becomes visible to everyone with the link, immediately."
          confirmLabel="Publish"
          cancelLabel="Not yet"
          onConfirm={noop}
        />
      ),
    },
    {
      name: 'pending — the confirm is in flight and there is no way out of it',
      render: () => (
        <ConfirmDialog
          open
          trigger={TRIGGER}
          title="Delete 3 tickets?"
          description="They leave the inbox and the archive. This cannot be undone."
          confirmLabel="Delete 3 tickets"
          // Never settles, so the fixture stays in the pending state.
          onConfirm={() => new Promise<void>(() => {})}
        />
      ),
    },
    {
      name: 'closed, with a phrase to type — opening puts focus in its field',
      render: () => <ConfirmDialog {...PROJECT} />,
    },
    {
      name: 'open, awaiting the phrase — the confirm stays disabled until it is typed',
      render: () => <ConfirmDialog open {...PROJECT} />,
    },
    {
      name: 'open, the phrase mistyped — the field says the text does not match',
      render: () => <Typed open text="acme-bulling" {...PROJECT} />,
    },
  ],

  /*
   * Empty on purpose. Every part of this is Dialog's or Button's, and both
   * fixtures already assert their own states. A list here would assert their
   * stylesheets under this component's name.
   */
  requiredSelectors: [],
}
