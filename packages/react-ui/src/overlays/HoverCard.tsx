'use client'

import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import { useRef, useState, type ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/hover-card.module.css'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from './Tooltip'

/**
 * A preview card shown on hover or focus (`design/components/hover-card.md`).
 * It shows, for example, the person behind an assignee link or the ticket
 * behind a reference, without navigating. Its surface matches Popover's.
 *
 * It is not a Tooltip: a tooltip is a short text hint, and content that needs
 * an Avatar is not a hint. It is not a Popover: a Popover's content is
 * reachable and operable, but this card's content is **never load-bearing**.
 * The trigger still navigates, touch users lose only a preview, and focus
 * opens the preview without hover. If the reader must click inside it, use a
 * Popover. If losing it loses information, it does not belong here.
 *
 * There is no `label`. The panel is deliberately unannounced: it takes no
 * focus, touch skips it, and it is a preview for sighted readers. Naming it
 * would promise assistive technology a surface the pattern does not provide.
 * The never-load-bearing law makes that acceptable, because the trigger's
 * destination already has everything the card shows. There is no controlled
 * `open` pair either. A preview the app opens from code is a Popover; Tooltip
 * takes the same position.
 */

export type HoverCardSide = 'top' | 'right' | 'bottom' | 'left'
export type HoverCardAlign = 'start' | 'center' | 'end'

declare const process: { env: { NODE_ENV?: string } }

export interface HoverCardProps {
  /**
   * The trigger: one focusable element with its own destination or action,
   * which the card previews but never replaces. A HoverCard on an inert span
   * previews nothing reachable.
   */
  children: ReactNode
  /**
   * Vocabulary content, typically a Stack of Avatar/Text/Badge rows. It has no
   * typed shape, because person, ticket and link previews share no anatomy and
   * the closed vocabulary already constrains it. The never-load-bearing law
   * governs the content, not a slot shape.
   */
  content: ReactNode
  side?: HoverCardSide
  align?: HoverCardAlign
  /** Opens on mount, for galleries and tests; screens wait for the reader to hover. */
  defaultOpen?: boolean
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function HoverCard({
  children,
  content,
  side = 'bottom',
  align = 'start',
  defaultOpen,
}: HoverCardProps) {
  /**
   * Escape must keep the card closed. The primitive starts a dwell timer on
   * every focus and pointer entry and clears it on blur and leave, but not on
   * dismiss. So an Escape inside the dwell window closes the card, and the
   * stale timer then reopens it (hover it open, Tab onto the trigger, press
   * Escape: the preview reappears half a second later). This component holds
   * the state and treats dismissal as a latch. Escape sets it, and an open
   * request while it is set can only come from a stale timer. A new dwell
   * starts with a new focus or pointer entry, which is where the latch resets.
   * This is internal state, not a controlled prop pair. The public API still
   * has no `open`, because a preview the app opens from code is a Popover.
   */
  const [open, setOpen] = useState(defaultOpen ?? false)
  const dismissed = useRef(false)

  function armDismissal() {
    dismissed.current = true
  }

  function beginDwell() {
    dismissed.current = false
  }

  function onOpenChange(next: boolean) {
    if (next && dismissed.current) return
    setOpen(next)
  }

  /**
   * The guardrail's fourth sentence as a dev warning, like Card's `href` rule.
   * Tab never enters the card, because it closes on blur, so anything
   * clickable inside it would be pointer-only. It is a ref callback rather
   * than an effect, so it runs on every opening: the panel mounts on each open,
   * and refs fire bottom-up after the content is in place.
   */
  function auditPanel(node: HTMLDivElement | null) {
    if (process.env.NODE_ENV === 'production' || node === null) return
    if (node.querySelector(FOCUSABLE) !== null) {
      console.warn(
        'polymorph: HoverCard: the preview contains interactive content, which keyboard ' +
          'and touch readers can never reach — a card the reader must operate is a ' +
          'Popover. Move the control to the trigger’s destination.',
      )
    }
  }

  return (
    /*
     * Uses Tooltip's timing. Opening waits for the Tooltip provider's open
     * delay, and closing waits for its skip delay, so the pointer can cross the
     * gap into the card without it closing. Delay is interaction design, not
     * motion, so temperament does not scale it and `none` does not remove it
     * (Tooltip's rule).
     */
    <HoverCardPrimitive.Root
      openDelay={TOOLTIP_DELAY_MS}
      closeDelay={TOOLTIP_SKIP_DELAY_MS}
      open={open}
      onOpenChange={onOpenChange}
    >
      {/* Tooltip's anchor span, for the same reason: a governed control has
          closed props and forwards no ref, so the primitive clones a box
          exactly the size of the control inside it. The trigger keeps its own
          semantics: a Link stays a link. `aria-describedby` is deliberately
          not set, because rich content flattened into a description string
          reads worse than none. A dwell starts on focus and pointer entry, so
          the dismissal latch resets there. The primitive's own handlers still
          run alongside. */}
      <HoverCardPrimitive.Trigger asChild>
        <span className={styles.anchor} onFocus={beginDwell} onPointerEnter={beginDwell}>
          {children}
        </span>
      </HoverCardPrimitive.Trigger>

      <HoverCardPrimitive.Portal>
        {/* `sideOffset: 4`, Popover's offset: a small surface with its own
            content, set slightly off its trigger, not a menu growing out of a
            control. No arrow, as in Tooltip. The panel is unannounced and takes
            no focus. The substrate opens it on hover and keyboard focus, and
            closes it on leave, blur and Escape. */}
        <HoverCardPrimitive.Content
          ref={auditPanel}
          className={styles.panel}
          side={side}
          align={align}
          sideOffset={4}
          onEscapeKeyDown={armDismissal}
          {...memberAttr('HoverCard')}
        >
          {content}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  )
}
