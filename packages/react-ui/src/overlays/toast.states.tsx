'use client'

import { useEffect, type ReactNode } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { Toaster } from './Toaster'
import { toast, TOAST_MAX_VISIBLE, type ToastOptions, type ToastTone } from './toast-store'

/**
 * States fixture, from `design/components/toast.md`'s States table.
 *
 * A toast has no static rendering: it is raised, shown, and removed. The store
 * behind it is module-level and shared by every `<Toaster />` on the page. So
 * this fixture mounts **one** viewport, in the first entry, and every other
 * entry is a button that raises a real toast into it. Six viewports in one
 * corner would show the same toasts six times, and the cap of four would
 * evict the early entries before a reviewer saw them.
 *
 * The first entry pins its examples so there is something to look at. The rest
 * demonstrate the motion.
 */

const TONES: ToastTone[] = ['neutral', 'success', 'danger', 'warning', 'info']

const capitalise = (value: string) => `${value[0]?.toUpperCase()}${value.slice(1)}`

/**
 * Raises its examples into the viewport it holds, and clears the store on
 * unmount. The completeness test renders fixtures one after another, and a
 * toast that outlived its entry would appear in the next one. The viewport is
 * its child, so a runner that sets the member's props finds it in the entry.
 */
function ToastHost({ raise, children }: { raise?: ToastOptions[]; children: ReactNode }) {
  useEffect(() => {
    for (const options of raise ?? []) toast({ ...options, durationMs: Number.POSITIVE_INFINITY })
    return () => toast.dismiss()
  }, [raise])

  return children
}

/** Raises into whichever viewport is on the page, which is the one above. */
function Raise({ children }: { children?: ReactNode }) {
  return (
    <Inline gap={2} wrap>
      {children}
    </Inline>
  )
}

/**
 * Reports a call of a notice's handler on `document`, for the conformance
 * runner's agent law: a notice is a record of the store and not a prop of the
 * viewport it mounts, so the runner cannot pass the handler a spy.
 */
const reports = (handler: string) => () =>
  document.dispatchEvent(new CustomEvent('polymorph:fixturecall', { detail: handler }))

/** The first has an action, so an agent's answer to the first notice can run it. */
const PINNED: ToastOptions[] = [
  {
    title: 'Ticket archived',
    tone: 'success',
    action: { label: 'Undo', onClick: reports('onClick') },
    onDismiss: reports('onDismiss'),
  },
  { title: 'Ticket created', onDismiss: reports('onDismiss') },
  {
    title: 'Ticket assigned',
    description: 'Sent to the triage queue.',
    onDismiss: reports('onDismiss'),
  },
]

export const states: ComponentStates = {
  component: 'Toast',

  entries: [
    {
      name: 'the viewport, with a pinned title, a description and an action',
      render: () => (
        <ToastHost raise={PINNED}>
          <Toaster />
        </ToastHost>
      ),
    },
    {
      name: 'every tone — the card is the same, the glyph is not',
      render: () => (
        <Raise>
          {TONES.map((tone) => (
            <Button
              key={tone}
              variant="outline"
              tone="neutral"
              size="sm"
              label={tone}
              onClick={() =>
                toast({
                  title: capitalise(tone),
                  description: 'The tone speaks through the glyph and nothing else.',
                  tone,
                })
              }
            />
          ))}
        </Raise>
      ),
    },
    {
      name: 'with an action',
      render: () => (
        <Raise>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Archive a ticket"
            onClick={() =>
              toast.success('Ticket archived', {
                action: { label: 'Undo', onClick: () => undefined },
              })
            }
          />
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Fail to delete one"
            onClick={() =>
              toast.danger('Could not delete', {
                description: 'The ticket is referenced by another.',
                action: { label: 'Retry', onClick: () => undefined },
              })
            }
          />
        </Raise>
      ),
    },
    {
      name: 'pinned — it waits to be dismissed',
      render: () => (
        <Raise>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Raise a pinned toast"
            onClick={() =>
              toast({
                title: 'Still working',
                description: 'This one has no timer.',
                durationMs: Number.POSITIVE_INFINITY,
              })
            }
          />
        </Raise>
      ),
    },
    {
      name: 'a promise — the loading face pinned, then the settled face, same card',
      render: () => (
        <Raise>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Archive, resolving"
            onClick={() =>
              toast.promise(new Promise((resolve) => setTimeout(resolve, 2500)), {
                loading: 'Archiving ticket…',
                success: 'Ticket archived',
                error: 'Could not archive',
              })
            }
          />
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Archive, failing"
            onClick={() =>
              // `toast.promise` handles this rejection: the store receives it
              // and raises the error state, so nothing is unhandled.
              toast.promise(new Promise((_, reject) => setTimeout(reject, 2500)), {
                loading: 'Archiving ticket…',
                success: 'Ticket archived',
                error: { title: 'Could not archive', description: 'The queue is read-only.' },
              })
            }
          />
        </Raise>
      ),
    },
    {
      name: 'updated in place — a second call with the first’s id, one card',
      render: () => (
        <Raise>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Raise, then update it"
            onClick={() => {
              toast({ id: 'update-demo', title: 'Exporting 0 of 3…', durationMs: Infinity })
              setTimeout(
                () =>
                  toast({ id: 'update-demo', title: 'Exporting 2 of 3…', durationMs: Infinity }),
                1200,
              )
              setTimeout(
                () => toast({ id: 'update-demo', title: 'Export ready', tone: 'success' }),
                2400,
              )
            }}
          />
        </Raise>
      ),
    },
    {
      name: 'a stack — the survivors glide into the gap',
      render: () => (
        <Raise>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label={`Raise ${TOAST_MAX_VISIBLE}`}
            onClick={() => {
              for (let index = 1; index <= TOAST_MAX_VISIBLE; index += 1) {
                toast({
                  title: `Toast ${index}`,
                  durationMs: Number.POSITIVE_INFINITY,
                })
              }
            }}
          />
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            label="Raise more than it will keep"
            onClick={() => {
              for (let index = 1; index <= TOAST_MAX_VISIBLE + 3; index += 1) {
                toast({ title: `Overflow ${index}` })
              }
            }}
          />
          <Button
            variant="ghost"
            tone="danger"
            size="sm"
            label="Dismiss all"
            onClick={() => toast.dismiss()}
          />
        </Raise>
      ),
    },
  ],

  requiredSelectors: [
    '[data-state="open"]',
    '[data-state="closed"]',
    '[data-swipe="move"]',
    ':hover',
    ':focus-visible',
  ],
}
