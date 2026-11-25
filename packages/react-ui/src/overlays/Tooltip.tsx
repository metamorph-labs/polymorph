'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  keyboardHolds,
  memberAttr,
  TOOLTIP_DELAY_MS,
  TOOLTIP_SKIP_DELAY_MS,
} from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/tooltip.module.css'

/**
 * A short text hint shown on hover or focus (`design/components/tooltip.md`).
 *
 * `content` is a string, not a node, on purpose: a tooltip that can hold a
 * component will eventually hold a form. Anything interactive or essential
 * belongs in a Popover or in visible text. A tooltip is never the only place
 * information appears.
 *
 * No arrow. An arrow is ornament that does not suit the sharp preset, and the
 * offset plus the origin-aware growth already connect the bubble to its
 * trigger.
 *
 * **The wrapper span.** Radix's `asChild` clones its child with a ref and many
 * props. A governed control has closed props and forwards no ref, on purpose,
 * because a governed component's props are its whole API (no `className`,
 * `style` or ref passthrough). So it cannot be an `asChild` child. The span is
 * the anchor Radix needs. The one thing it would lose, `aria-describedby` on
 * the control itself, is copied across by hand below. Removing the span would
 * need either a slot contract on controls or a tooltip prop on the control it
 * describes.
 */

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left'
export type TooltipAlign = 'start' | 'center' | 'end'

export interface TooltipProps {
  content: string
  side?: TooltipSide
  align?: TooltipAlign
  /** Opens on mount, for galleries and tests. */
  defaultOpen?: boolean
  /** One focusable element; a tooltip on a disabled control can never be read. */
  children: ReactNode
}

/**
 * Delays, set once for the whole app (`design/components/tooltip.md`). They are
 * the engine's, shared with every framework's Tooltip, and re-exported here for
 * the vocabulary's index and HoverCard.
 */
export { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS }

export function TooltipProvider({ children }: { children?: ReactNode }) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={TOOLTIP_DELAY_MS}
      skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}
    >
      {children}
    </TooltipPrimitive.Provider>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The event Radix dispatches on the document when a tooltip opens, which every
 * other open tooltip closes on. Radix does not export the name.
 */
const RADIX_TOOLTIP_OPEN = 'tooltip.open'

export function Tooltip({
  content,
  side = 'top',
  align = 'center',
  defaultOpen,
  children,
}: TooltipProps) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const anchor = useRef<HTMLSpanElement>(null)

  /**
   * A tooltip the keyboard opened stays open while its control holds keyboard
   * focus (WCAG 1.4.13: it stays until focus leaves or the reader dismisses
   * it). Radix also closes it when an element around the control scrolls, and
   * when the pointer leaves the control. A Tab to a control below the fold
   * scrolls the page a frame after the focus that opened the tooltip, so the
   * tooltip and the description it adds would go with no action of the
   * reader's.
   *
   * Radix gives no reason with a close, so the closes a reader asks for mark
   * themselves before Radix requests them: Escape, a press on the control or
   * outside it, a click on the control (Enter on a button), focus leaving, and
   * another tooltip opening. Any other close is refused while the control has
   * focus and matches `:focus-visible`.
   */
  const asked = useRef(false)
  const ask = () => {
    asked.current = true
  }
  function onOpenChange(next: boolean) {
    const askedFor = asked.current
    asked.current = false
    if (!next && !askedFor && keyboardHolds(anchor.current)) return
    setOpen(next)
  }

  /*
   * Another tooltip opening closes this one, so one bubble shows at a time.
   * The listener captures, so it runs before Radix's own listener requests the
   * close.
   */
  useEffect(() => {
    if (!open) return
    document.addEventListener(RADIX_TOOLTIP_OPEN, ask, true)
    return () => document.removeEventListener(RADIX_TOOLTIP_OPEN, ask, true)
  }, [open])

  /**
   * Radix describes the anchor, but the reader focuses the control inside it.
   * The association moves to the element that takes focus. Otherwise a screen
   * reader announces the button's name without its hint.
   *
   * The control's existing description is restored when the tooltip closes, so
   * a field wired by FormField keeps its error message.
   */
  useEffect(() => {
    const control = anchor.current?.querySelector(FOCUSABLE)
    const described = anchor.current?.getAttribute('aria-describedby')
    if (!control || !described) return

    const own = control.getAttribute('aria-describedby')
    if (!open) return

    control.setAttribute('aria-describedby', own ? `${own} ${described}` : described)
    return () => {
      if (own) control.setAttribute('aria-describedby', own)
      else control.removeAttribute('aria-describedby')
    }
  }, [open, content])

  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild onPointerDown={ask} onClick={ask} onBlur={ask}>
        <span ref={anchor} className={styles.anchor}>
          {children}
        </span>
      </TooltipPrimitive.Trigger>

      <MotionPresence>
        {open ? (
          <TooltipPrimitive.Portal key="tooltip" forceMount>
            {/* The offset is CSS rather than Radix's numeric `sideOffset`,
                because it is `--pm-space-2` and a token cannot be passed as a
                number. The recipe applies it as a margin on the bubble, inside
                the box Radix positions, so the positioner counts it. It keys
                off the side the bubble was placed on, so a collision flip
                moves the gap too. */}
            <TooltipPrimitive.Content
              asChild
              forceMount
              side={side}
              align={align}
              onEscapeKeyDown={ask}
              onPointerDownOutside={ask}
            >
              <MotionSurface
                binding="tooltip.bubble"
                // The declared side, not the placed one. `data-side` is not
                // settled when a ref first fires, and an origin that is wrong for
                // one frame is worse than one that ignores a rare collision flip.
                side={side}
                align={align}
                className={styles.bubble}
                // The member has no single DOM root (an anchor span in the
                // page, a bubble in a portal). The bubble is the surface, so it
                // carries the identity attribute (`data-member`).
                {...memberAttr('Tooltip')}
              >
                {content}
              </MotionSurface>
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        ) : null}
      </MotionPresence>
    </TooltipPrimitive.Root>
  )
}
