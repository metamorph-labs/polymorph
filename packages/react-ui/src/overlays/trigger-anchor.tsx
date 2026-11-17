'use client'

import { useEffect, useRef, type ComponentPropsWithRef, type Ref } from 'react'

import { anchorFocusReturns } from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/trigger-anchor.module.css'

/**
 * The seam between Radix's `asChild` and this repo's closed props.
 *
 * Radix clones its trigger and gives it a ref, an `onClick`, an
 * `aria-haspopup` and a `data-state`. A governed control accepts none of these:
 * `ButtonProps` has no `ref`, no `aria-*` and no `data-*`, and that closed set
 * is its whole contract. Passing one to `Trigger asChild` appears to work but
 * does not. The ref is null, so the panel anchors to nothing and appears at the
 * origin, and focus on close goes nowhere.
 *
 * Tooltip solves this with a span the primitive can clone freely. This is the
 * same solution, shared, plus two things a click trigger needs that a hover
 * trigger does not:
 *
 *  - the ARIA Radix aims at the trigger is rendered on the control inside,
 *    because the reader focuses the control, not the span. It is kept off the
 *    span, because `aria-expanded` on an element with no role is itself a
 *    violation
 *  - focus returns to that control when the surface closes
 *
 * The alternative is to open the controls' props to `ref` and arbitrary
 * attributes, which would weaken the contract this repo depends on to suit one
 * library. This costs less.
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Two refs on one node: the primitive's, and this component's own. */
function assign(ref: Ref<HTMLSpanElement> | undefined, node: HTMLSpanElement | null): void {
  if (typeof ref === 'function') ref(node)
  else if (ref) ref.current = node
}

/**
 * Every prop the primitive passes down is forwarded to the span, including
 * `ref`.
 *
 * This is easy to get wrong and hard to notice. Radix's Slot clones this
 * component, and a component that does not spread its props discards them. The
 * span then has no ref, no handler and no ARIA, which looks like a working
 * trigger until something must be positioned next to it.
 */
export type TriggerAnchorProps = ComponentPropsWithRef<'span'> & {
  /** Drives the focus return: `true` while the surface is open. */
  open?: boolean
  /** A span has none; Radix sends one because its own trigger is a button. */
  type?: string
}

export function TriggerAnchor({
  children,
  open,
  ref,
  // Taken out of the spread rather than removed from the DOM afterwards. An
  // effect that removes them races React, which rewrites its own props on every
  // render, and the control would end up with none of them.
  'aria-haspopup': hasPopup,
  'aria-expanded': expanded,
  'aria-controls': controls,
  // A span has no `type`; Radix sends it because its own trigger is a button.
  type: _type,
  ...rest
}: TriggerAnchorProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const wasOpen = useRef(false)
  // The panel the surface last named. A member that names it only while open
  // (Menu, the sheet lane) has dropped it by the time the focus return reads it.
  const panelId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (typeof controls === 'string' && controls !== '') panelId.current = controls
    const control = anchor.current?.querySelector(FOCUSABLE)
    if (!(control instanceof HTMLElement)) return

    const applied: string[] = []
    for (const [attribute, value] of [
      ['aria-haspopup', hasPopup],
      ['aria-expanded', expanded],
      ['aria-controls', controls],
    ] as const) {
      if (value === undefined || value === null) continue
      control.setAttribute(attribute, String(value))
      applied.push(attribute)
    }

    return () => {
      for (const attribute of applied) control.removeAttribute(attribute)
    }
  }, [hasPopup, expanded, controls])

  useEffect(() => {
    if (open) {
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false

    // Radix restores focus to the trigger it was given, which is the span and is
    // not focusable. Without this, closing a menu moves focus to the body and the
    // next Tab starts from the top of the page. A control the reader moved to
    // while a non-modal surface closed keeps focus, as in the engine's anchor.
    const control = anchor.current?.querySelector(FOCUSABLE)
    if (!(control instanceof HTMLElement) || anchor.current === null) return
    const panel = panelId.current === undefined ? null : document.getElementById(panelId.current)
    if (anchorFocusReturns(anchor.current, panel)) control.focus()
  }, [open])

  return (
    <span
      {...rest}
      ref={(node) => {
        anchor.current = node
        assign(ref, node)
      }}
      className={styles.anchor}
    >
      {children}
    </span>
  )
}
