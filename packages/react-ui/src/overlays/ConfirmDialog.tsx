'use client'

import { useCallback, useRef, useState, type MouseEvent, type ReactElement } from 'react'

import { useAgentMember } from '@polymorph/react'

import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Dialog, DialogPanelMember } from './Dialog'

/**
 * A Dialog preset for confirming an action
 * (`design/components/confirm-dialog.md`).
 *
 * It has one purpose. There is no body slot, no size, and no way to arrange the
 * buttons the wrong way round. A confirm whose destructive option looks like
 * the safe one is the failure this component prevents. The body holds only
 * the field of a typed confirmation (`confirmWith`), which this member draws.
 *
 * `confirmLabel` has no default. "Confirm" hides the verb, and the pause only
 * helps if the reader can see what they are about to do. The caller must write
 * "Discard" or "Delete 3 tickets".
 */

export type ConfirmTone = 'danger' | 'accent'

/**
 * The typed confirmation's comparison: the spaces around the text removed and
 * letter case ignored, because a phone capitalises a field's first letter.
 */
const comparable = (text: string) => text.trim().toLowerCase()

export interface ConfirmDialogProps {
  closeLabel?: string
  title: string
  /** Required, because a confirm must say what is at stake. */
  description: string
  /** The action's verb; it has no default, so the caller must name the action. */
  confirmLabel: string
  /** `accent` for consequential but safe actions; the `danger` default is for destructive ones. */
  tone?: ConfirmTone
  cancelLabel?: string
  /** A Promise puts the dialog into its pending state until it settles. */
  onConfirm: () => void | Promise<void>
  trigger?: ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Dialog's `presentation`, passed through (the sheet presentation,
   * `design/components/README.md`). A confirm is the content-light dialog this
   * option is for. `'sheet'` keeps the sm card above `30rem` and uses a bottom
   * sheet below it. Footer order, cancel-first initial focus and the pending
   * lock are the same in both forms.
   */
  presentation?: 'auto' | 'sheet'
  /**
   * A typed confirmation: the phrase the person types before the confirm
   * enables, such as the name of the project being deleted. The body draws its
   * field, and focus starts there in both tones.
   */
  confirmWith?: string
  /**
   * The phrase field's label, `Type {confirmWith} to confirm` by default.
   * Localized hosts pass their own, with the phrase in it.
   */
  confirmWithLabel?: string
  /**
   * The phrase field's error while its text cannot become the phrase,
   * `The text does not match` by default.
   */
  confirmWithError?: string
}

export function ConfirmDialog({
  closeLabel = 'Close',
  title,
  description,
  confirmLabel,
  tone = 'danger',
  cancelLabel = 'Cancel',
  onConfirm,
  trigger,
  open,
  onOpenChange,
  presentation = 'auto',
  confirmWith,
  // The default names the phrase, so it is built from the prop rather than written once.
  confirmWithLabel = confirmWith === undefined ? undefined : `Type ${confirmWith} to confirm`,
  confirmWithError = 'The text does not match',
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)

  /*
   * Mirrored, so an uncontrolled ConfirmDialog can close itself.
   *
   * Dialog manages its own open state when `open` is undefined, but Cancel and
   * Confirm are here. Calling only `onOpenChange` would leave an uncontrolled
   * dialog open with buttons that do nothing. The mirror lets
   * `<ConfirmDialog trigger={…}>` work with no state at the call site, which is
   * how most callers use it.
   */
  const [uncontrolled, setUncontrolled] = useState(false)
  const current = open ?? uncontrolled

  /*
   * The typed confirmation. The field is emptied each time the dialog opens,
   * adjusted while rendering so the panel never shows the text typed for the
   * last confirm. The confirm waits until the field holds the phrase; the error
   * shows once the text cannot become it, and never while it still can.
   */
  const [typed, setTyped] = useState('')
  const [wasOpen, setWasOpen] = useState(current)
  if (wasOpen !== current) {
    setWasOpen(current)
    if (current) setTyped('')
  }
  const phrase = confirmWith === undefined ? undefined : comparable(confirmWith)
  const entered = comparable(typed)
  const holds = phrase === undefined || entered === phrase
  const wrong = phrase !== undefined && entered !== '' && !phrase.startsWith(entered)

  const setOpen = (next: boolean) => {
    setUncontrolled(next)
    onOpenChange?.(next)
  }

  // The panel is the borrowed Dialog's, which hands it back through `DialogPanelMember`. It names
  // the dialog, and what it holds is a person's: the confirm, the phrase field and the Dialog
  // itself are withheld from an agent. Cancel closes the dialog as the person's cancel does, and
  // is refused while the confirmed action runs. No action confirms.
  const panelRef = useRef<HTMLElement | null>(null)
  const holdPanel = useCallback((panel: HTMLElement | null) => {
    panelRef.current = panel
  }, [])
  useAgentMember({
    member: 'ConfirmDialog',
    element: () => panelRef.current,
    state: () => ({ open: current, pending }),
    actions: {
      cancel: () => {
        if (pending) throw new Error('The confirmed action is running; it cannot be cancelled.')
        setOpen(false)
      },
    },
    withholds: () => panelRef.current,
  })

  const confirm = async () => {
    const result = onConfirm()
    if (!(result instanceof Promise)) {
      setOpen(false)
      return
    }

    setPending(true)
    try {
      await result
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  return (
    /*
     * The panel is Dialog's, and this member has none of its own. So it passes
     * its name down, and the surface carries `confirm-dialog` as its identity
     * attribute (`data-member`). This member has no stylesheet, and without the
     * attribute the exception seam could not address it either, with no warning.
     */
    <DialogPanelMember member="ConfirmDialog" panel={holdPanel}>
      <Dialog
        closeLabel={closeLabel}
        size="sm"
        title={title}
        description={description}
        trigger={trigger}
        open={current}
        onOpenChange={setOpen}
        // Dialog's `presentation` passes through unchanged; the sheet form is Dialog's.
        presentation={presentation}
        // While the action is pending, dismissing would leave the reader unsure
        // whether it happened.
        dismissible={!pending}
        // A danger confirm is an interruption to answer, not a surface the
        // reader chose to open.
        alert={tone === 'danger'}
        // The rightmost button is destructive, so focus starts on the other one,
        // unless there is a phrase to type: the body's field is first then, and
        // the disabled confirm is what keeps a stray Enter from destroying anything.
        initialFocus={tone === 'danger' && confirmWith === undefined ? 'dismiss' : 'primary'}
        footer={
          <>
            {/*
             * Cancel is first in the DOM and, for a danger confirm, first in focus.
             * Dialog's default focuses the primary. That suits a panel opened to
             * do something, not one asking whether you meant it. This is the only
             * place that default is overridden.
             */}
            <Button
              variant="outline"
              tone="neutral"
              label={cancelLabel}
              disabled={pending}
              onClick={() => setOpen(false)}
            />
            <Button
              variant="solid"
              tone={tone}
              label={confirmLabel}
              loading={pending}
              disabled={!holds}
              onClick={() => void confirm()}
            />
          </>
        }
      >
        {confirmWith === undefined ? null : (
          <FormField label={confirmWithLabel ?? ''} error={wrong ? confirmWithError : undefined}>
            <Input
              value={typed}
              onChange={setTyped}
              // A browser's suggestion would type the phrase for the person.
              autoComplete="off"
              // A correction can change a phrase such as `acme-billing` while it is typed.
              exact
              // The phrase cannot change under an action already running.
              disabled={pending}
            />
          </FormField>
        )}
      </Dialog>
    </DialogPanelMember>
  )
}
