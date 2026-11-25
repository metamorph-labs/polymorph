'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { memberAttr, TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/react'
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
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger asChild>
        {/* An icon-only Button inside finds the anchor by its part, and shows this bubble
            instead of its name tip. */}
        <span ref={anchor} className={styles.anchor} data-tooltip-part="trigger">
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
            <TooltipPrimitive.Content asChild forceMount side={side} align={align}>
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
