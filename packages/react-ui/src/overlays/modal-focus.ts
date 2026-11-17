'use client'

import { useCallback, useRef } from 'react'

import { modalFocusTarget, type InitialFocus } from '@polymorph/react'

/**
 * The focus policy every modal surface in the vocabulary shares.
 *
 * It is shared because a drawer is a positioned Dialog variant
 * (`design/components/drawer.md`; `design/components/README-substrates.md`,
 * Drawer / Sheet), and its spec's accessibility section says only "Dialog's,
 * unchanged". A second copy of this code would let that statement become
 * false without anyone noticing.
 *
 * It handles two things Radix does not:
 *
 *  - **Where focus goes on open.** Radix focuses the first tabbable node in the
 *    panel, which for most panels is the ✕. A dialog that opens with focus on
 *    its close button suggests leaving is the main action. The policy here is
 *    the spec's: the first tabbable in the body, else the footer's primary
 *    action, else close.
 *  - **Where focus returns on close.** Radix restores focus to its own
 *    `Trigger`, and no surface here uses one. A governed control has closed
 *    props and forwards no ref, so `asChild` has nothing to attach to and
 *    Radix's restore focuses nothing. So this records the element that had
 *    focus when the panel opened. That also covers panels opened with no
 *    trigger: a controlled prop, or `defaultOpen`.
 */

/**
 * Where focus goes on open is the spec's order, written once in the engine
 * (`modalFocusTarget`) for every framework's modal surfaces. The panel marks
 * its parts with `data-dialog-part`, which is its contract with that policy.
 */
export type { InitialFocus, ModalPart } from '@polymorph/react'

export interface ModalFocusHandlers {
  onOpenAutoFocus: (event: Event) => void
  onCloseAutoFocus: (event: Event) => void
}

/**
 * The pair of handlers to spread onto a Radix `Dialog.Content`. The open handler
 * fires before the trap moves focus, so it can record where focus came from.
 */
export function useModalFocus(prefer: InitialFocus): ModalFocusHandlers {
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  const onOpenAutoFocus = useCallback(
    (event: Event) => {
      restoreFocusTo.current = document.activeElement as HTMLElement | null
      const target = modalFocusTarget(event.currentTarget as HTMLElement, prefer)
      if (!target) return
      event.preventDefault()
      target.focus()
    },
    [prefer],
  )

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    restoreFocusTo.current?.focus()
  }, [])

  return { onOpenAutoFocus, onCloseAutoFocus }
}
