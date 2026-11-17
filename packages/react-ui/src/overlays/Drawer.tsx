'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useCallback, useRef, useState, type ReactNode } from 'react'

import { Button } from '../controls/Button'
import { memberAttr, useAgentMember, type ControlSize } from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/drawer.module.css'
import { useModalFocus, type InitialFocus } from './modal-focus'

/**
 * Modal side sheet (`design/components/drawer.md`).
 *
 * **A positioned Dialog variant** (`design/components/README-substrates.md`,
 * Drawer / Sheet): Radix's dialog behaviour, Dialog's focus policy imported
 * rather than restated, a different positioner and a different panel recipe.
 * It adds no dependencies and nothing new to test about focus.
 *
 * The spec sets two boundaries, and this file keeps them:
 *
 *  - **No gesture dismissal.** The drawer closes by control, scrim and Escape.
 *    Swipe needs a velocity model the motion system does not have. A drag with
 *    no rubber-band and no reduced-motion behaviour is worse than none.
 *  - **A persistent side panel is not this component.** That is an archetype
 *    region. A dialog without a focus trap is a different component.
 *
 * There is no `trigger`, which is the one difference from Dialog's API. The
 * screen decides what opens a drawer, and the focus restore does not need to
 * know which control that was, because it records where focus came from.
 */

/** Logical, so `end` is the right edge in LTR and the left edge in RTL. */
export type DrawerSide = 'end' | 'start' | 'bottom'

export interface DrawerProps {
  side?: DrawerSide
  /**
   * Inline size for a start/end sheet, block size for a bottom one. Both derive
   * from the space scale, so a roomier theme gets a larger sheet.
   */
  size?: ControlSize
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: string
  /** The ✕'s accessible name, as in Dialog; localized hosts replace the default `Close`. */
  closeLabel?: string
  children?: ReactNode
  /** Actions. One primary (`solid`), rightmost; dismiss is outline or ghost. */
  footer?: ReactNode
  /** `false` removes ✕ and ignores Escape and outside clicks, forcing a choice. */
  dismissible?: boolean
  /**
   * The same as Dialog's, from the shared focus code: unset focuses the first
   * tabbable per the focus-order rule, and `dismiss` suits a panel asking
   * whether you meant it.
   */
  initialFocus?: InitialFocus
}

export function Drawer({
  side = 'end',
  size = 'md',
  open: openProp,
  defaultOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
  initialFocus: prefer = 'primary',
  closeLabel = 'Close',
}: DrawerProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false)
  const open = openProp ?? uncontrolled

  const focus = useModalFocus(prefer)

  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  // An agent closes the drawer as a person's close does, through `setOpen`, so `onOpenChange`
  // reports it in either form. A forced choice refuses. The panel names the drawer, and a closed
  // drawer has none: an agent opens one with the screen's own control.
  const panelRef = useRef<HTMLElement | null>(null)
  useAgentMember({
    member: 'Drawer',
    element: () => panelRef.current,
    state: () => ({ open }),
    actions: {
      close: () => {
        if (!dismissible) throw new Error('The drawer asks for a choice among its own actions.')
        if (open) setOpen(false)
      },
    },
  })

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <MotionPresence>
        {open ? (
          <DialogPrimitive.Portal key="drawer" forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <MotionSurface binding="dialog.scrim" className={styles.scrim} />
            </DialogPrimitive.Overlay>

            {/* Pins the panel to an edge and takes no clicks itself, so a click
                that misses the panel lands on the scrim and dismisses. Only the
                motion engine writes the panel's transform. */}
            <div className={styles.positioner} data-side={side}>
              <DialogPrimitive.Content
                asChild
                forceMount
                onCloseAutoFocus={focus.onCloseAutoFocus}
                onOpenAutoFocus={focus.onOpenAutoFocus}
                onEscapeKeyDown={(event) => {
                  if (!dismissible) event.preventDefault()
                }}
                onPointerDownOutside={(event) => {
                  if (!dismissible) event.preventDefault()
                }}
              >
                <MotionSurface
                  ref={panelRef}
                  binding="drawer.panel"
                  // The pattern derives the physical direction from this and the
                  // page's direction: a sheet leaves by the edge it is pinned to.
                  sheetSide={side}
                  className={styles.panel}
                  data-side={side}
                  data-size={size}
                  {...memberAttr('Drawer')}
                  // Radix hides the rest of the page with `aria-hidden` and omits
                  // this attribute. Assistive software that relies on the attribute
                  // rather than the hiding gets the same result.
                  aria-modal
                >
                  <div className={styles.header}>
                    <div className={styles.heading}>
                      <DialogPrimitive.Title className={styles.title}>
                        {title}
                      </DialogPrimitive.Title>

                      {description === undefined ? null : (
                        <DialogPrimitive.Description className={styles.description}>
                          {description}
                        </DialogPrimitive.Description>
                      )}
                    </div>

                    {/* Not Radix's `Close`, because it needs `asChild` and a
                        governed control forwards no ref. Button already takes
                        `onClick`. */}
                    {dismissible ? (
                      <div className={styles.close} data-dialog-part="close">
                        <Button
                          variant="ghost"
                          tone="neutral"
                          size="sm"
                          iconOnly
                          icon="close"
                          label={closeLabel}
                          onClick={() => setOpen(false)}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.body} data-dialog-part="body">
                    {children}
                  </div>

                  {footer === undefined ? null : (
                    <div className={styles.footer} data-dialog-part="footer">
                      {footer}
                    </div>
                  )}
                </MotionSurface>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </MotionPresence>
    </DialogPrimitive.Root>
  )
}
