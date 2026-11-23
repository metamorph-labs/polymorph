'use client'

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { useRef, useState, type ReactNode } from 'react'

import { Icon, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/collapsible.module.css'
import { useKeptRegion } from './kept-region'

/**
 * A single show-or-hide section with one trigger (`design/components/collapsible.md`).
 * For example "Advanced options" under a form, or a raw payload at the end of
 * an aside. `@radix-ui/react-collapsible` supplies behaviour, as a direct
 * dependency.
 *
 * Not an Accordion of one. Accordion is document structure: a **list** of
 * sections with real headings, rules, and single or multiple open items. One
 * disclosure in list semantics would announce "list, 1 item" and add an
 * unwanted heading level. Collapsible is an inline control: as wide as its
 * label, no rules, no outline entry. A second section beside it means it should
 * be an Accordion.
 *
 * The member holds its open state, seeded from `defaultOpen`, and Radix is
 * always controlled with the caller's `open` or that state, so an agent's open
 * and close go through the same setter a press does in both forms.
 *
 * With `keepMounted`, the closed region's content stays in the document,
 * hidden (`kept-region.ts`), so a page's server markup carries it.
 */

export interface CollapsibleProps {
  /** The trigger's text, naming what is disclosed in the product's words. */
  label: string
  /** Closed by default, because a disclosure that starts open hides nothing. */
  defaultOpen?: boolean
  /** Controlled state, paired with `onOpenChange` as in Radix. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Keeps the closed region's content in the document and `hidden`, so a
   * page's server markup carries it and its state survives a close. Without it
   * the React member leaves closed content out. The generated members keep it
   * in every case.
   */
  keepMounted?: boolean
  /** Strings get the content text style; components keep their own (Accordion's rule). */
  children: ReactNode
}

export function Collapsible({
  label,
  defaultOpen = false,
  open,
  onOpenChange,
  keepMounted = false,
  children,
}: CollapsibleProps) {
  const [held, setHeld] = useState(defaultOpen)
  const current = open ?? held
  const region = useRef<HTMLDivElement>(null)
  const hidden = useKeptRegion(region, current, keepMounted)

  /** Opens or closes the region, as a press does: the held state, then the caller's handler. */
  function change(next: boolean) {
    setHeld(next)
    onOpenChange?.(next)
  }

  // The spec's `agent` fence. The trigger carries the label, which names the member. Opening an
  // open region, or closing a closed one, reports nothing, as no press can.
  const triggerRef = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'Collapsible',
    element: () => triggerRef.current,
    state: () => ({ open: current }),
    actions: {
      open: () => {
        if (!current) change(true)
      },
      close: () => {
        if (current) change(false)
      },
    },
  })

  return (
    <CollapsiblePrimitive.Root
      className={styles.root}
      open={current}
      onOpenChange={change}
      {...memberAttr('Collapsible')}
    >
      {/* No heading: heading structure is the page's, and a form's "Advanced
          options" toggle is not an outline entry (Accordion heads every trigger).
          Radix renders a real button with aria-expanded and aria-controls. */}
      <CollapsiblePrimitive.Trigger ref={triggerRef} className={styles.trigger}>
        <span className={styles.label}>{label}</span>
        {/* The system's disclosure chevron, decorative. aria-expanded announces
            the state, so a named glyph would announce it twice. */}
        <span className={styles.chevron}>
          <Icon name="down" size="sm" />
        </span>
      </CollapsiblePrimitive.Trigger>

      {/* The inner wrapper puts the padding inside the animated region, so the
          gap collapses with the content (as in Accordion). */}
      <CollapsiblePrimitive.Content
        ref={region}
        className={styles.content}
        forceMount={keepMounted || undefined}
        // Spread conditionally rather than passed as `undefined`. Radix writes its
        // own `hidden` before spreading ours, and an explicit `hidden: undefined`
        // would remove the hiding the default path relies on.
        {...(hidden === undefined ? {} : { hidden })}
      >
        <div className={styles.inner}>{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}
