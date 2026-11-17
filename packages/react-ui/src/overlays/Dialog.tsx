'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

import { Button } from '../controls/Button'
import { memberAttr, useAgentMember, useSupplied, type ControlSize } from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/dialog.module.css'
import { useModalFocus, type InitialFocus } from './modal-focus'
import { usePhoneViewport } from './sheet'

/**
 * Modal interruption of the page (`design/components/dialog.md`).
 *
 * It differs from a Radix example in three ways:
 *
 *  - The panel grows from the trigger that opened it, not from the middle of
 *    the screen. The origin comes from the click's `currentTarget`. That is also
 *    why the trigger is cloned rather than wrapped in Radix's `Trigger`: a
 *    governed control has closed props and forwards no ref, so `asChild` has
 *    nothing to attach to. Cloning injects `onClick`, which Button already has.
 *  - Initial focus follows the spec's order: the first tabbable element in the
 *    body, else the footer's primary action, else close. "First tabbable in the
 *    panel" would focus every dialog's own dismiss button. That policy and the
 *    matching focus restore are in `modal-focus.ts`, because Drawer is this
 *    component with a different positioner, and its spec says its
 *    accessibility is "Dialog's, unchanged".
 *  - Presence controls the unmount, so the focus trap and the scroll lock exist
 *    only while the dialog is open or closing, and the exit is not cut short.
 */

export interface DialogProps {
  closeLabel?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * A governed control, usually a Button, cloned to receive `onClick`, which
   * also tells the panel where it was opened from.
   */
  trigger?: ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>
  title: string
  description?: string
  size?: ControlSize
  children?: ReactNode
  /** Actions. One primary (`solid`), rightmost; dismiss is outline or ghost. */
  footer?: ReactNode
  /** `false` removes ✕ and ignores Escape and outside clicks, forcing a choice. */
  dismissible?: boolean
  /**
   * Which footer control has focus on open; `dismiss` suits a panel that asks
   * whether you meant it (see `initialFocus`).
   */
  initialFocus?: InitialFocus
  /**
   * Uses `alertdialog` rather than `dialog`, for an interruption the reader must
   * answer. ConfirmDialog sets it for its danger tone.
   */
  alert?: boolean
  /**
   * `'auto'` is the card, and the whole screen below `30rem` (the overlay
   * class's viewport exemption). `'sheet'` keeps the card above `30rem` and
   * becomes a bottom sheet below it (the sheet presentation,
   * `design/components/README.md`). It is for content-light confirm and pick
   * dialogs, where a full-screen takeover is too heavy. Only the shape changes:
   * scrim, trap, `dismissible`, initial focus and return focus are Dialog's in
   * both forms, which is why it can be a prop.
   */
  presentation?: 'auto' | 'sheet'
}

export type { InitialFocus } from './modal-focus'

/**
 * The only composition seam for the identity attribute (`data-member`).
 * ConfirmDialog is a Dialog preset with no surface of its own; the panel below
 * is its panel. So it renders under this provider, and the panel carries
 * `confirm-dialog` instead of `dialog`.
 *
 * It is context rather than a prop for two reasons. The member a surface
 * belongs to is not the caller's decision, so it does not belong in the public
 * API. And the exception seam sets its token on the element the recipe reads it
 * from, so the identity must be on the panel itself. A marker inside the body
 * could be addressed but would have no effect.
 */
const PanelMember = createContext('Dialog')

/**
 * Where the member that lends this panel its identity reads the panel, when it
 * asks to: ConfirmDialog's agent handle names the panel and withholds what it
 * holds. Only the Dialog directly inside reads it; it is not passed further.
 */
const LentPanel = createContext<((panel: HTMLElement | null) => void) | null>(null)

export function DialogPanelMember({
  member,
  panel = null,
  children,
}: {
  member: string
  /** Called with the panel when it mounts, and with `null` when it unmounts. */
  panel?: ((panel: HTMLElement | null) => void) | null
  children: ReactNode
}) {
  return (
    <PanelMember value={member}>
      <LentPanel value={panel}>{children}</LentPanel>
    </PanelMember>
  )
}

export function Dialog({
  closeLabel = 'Close',
  open: openProp,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  size = 'md',
  children,
  footer,
  dismissible = true,
  initialFocus: prefer = 'primary',
  alert = false,
  presentation = 'auto',
}: DialogProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false)
  const [launchedFrom, setLaunchedFrom] = useState<Element | null>(null)
  const open = openProp ?? uncontrolled

  const focus = useModalFocus(prefer)

  /** `Dialog`, unless a member without its own panel is using this one. */
  const member = useContext(PanelMember)

  /**
   * Resolves the sheet presentation's attribute contract. The panel is drawn as
   * a sheet only with `'sheet'` and below the overlay class's `30rem`
   * threshold, the same threshold the stylesheet's full-screen block uses.
   * Under `'auto'` the hook is read and ignored on purpose, because `'auto'`
   * means the card and the full-screen form.
   */
  const phone = usePhoneViewport()
  const sheet = presentation === 'sheet' && phone

  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  // A server component may have passed the trigger, and it is cloned below
  // (`useSupplied`).
  // An agent closes the dialog as a person's close does, through `setOpen`, so `onOpenChange`
  // reports it in either form. A non-dismissible dialog asks for a choice among its own
  // actions, so it refuses. The panel names the dialog, and a closed dialog has none: an agent
  // opens one by pressing its trigger. A Dialog whose panel another member reads stands for
  // that member (ConfirmDialog), which registers in its place, so this one registers nothing.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const lentPanel = useContext(LentPanel)
  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node
      lentPanel?.(node)
    },
    [lentPanel],
  )
  useAgentMember(
    {
      member: 'Dialog',
      element: () => panelRef.current,
      state: () => ({ open }),
      actions: {
        close: () => {
          if (!dismissible) throw new Error('The dialog asks for a choice among its own actions.')
          setOpen(false)
        },
      },
    },
    { unless: lentPanel !== null },
  )

  const supplied = useSupplied(trigger)
  const triggerNode = supplied
    ? cloneElement(supplied, {
        onClick: (event: MouseEvent<HTMLElement>) => {
          supplied.props.onClick?.(event)
          setLaunchedFrom(event.currentTarget)
          setOpen(true)
        },
      })
    : null

  return (
    // The lender's panel holder is this Dialog's alone, so no Dialog inside it reads it.
    <LentPanel value={null}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        {triggerNode}

        <MotionPresence>
          {open ? (
            <DialogPrimitive.Portal key="dialog" forceMount>
              <DialogPrimitive.Overlay asChild forceMount>
                <MotionSurface binding="dialog.scrim" className={styles.scrim} />
              </DialogPrimitive.Overlay>

              {/* A plain positioner, so only the motion engine writes the panel's
                transform. Centring with `translate(-50%, -50%)` would also write
                the property the scale-fade animates. In sheet form the same div
                pins to the bottom edge instead, using the sheet presentation's
                anatomy composed from `sheet.module.css`. */}
              <div className={sheet ? styles.sheetPositioner : styles.positioner}>
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
                    ref={attachPanel}
                    // The sheet has its own motion: it slides in from the bottom
                    // edge at full opacity, while the card grows from its
                    // trigger. One panel has two bindings, chosen at the same
                    // threshold as the geometry.
                    binding={sheet ? 'sheet.panel' : 'dialog.panel'}
                    {...(sheet ? { sheetSide: 'bottom' as const } : { launchedFrom })}
                    className={sheet ? styles.sheetPanel : styles.panel}
                    {...(sheet ? { 'data-presentation': 'sheet' } : {})}
                    data-size={size}
                    {...memberAttr(member)}
                    // Spread only when true. `role={undefined}` in a spread is
                    // applied after Radix's cloned props and removes the `dialog`
                    // role Radix set.
                    {...(alert ? { role: 'alertdialog' as const } : {})}
                    // Radix hides the rest of the page with `aria-hidden` and
                    // omits this attribute. The spec requires it, so assistive
                    // software that relies on the attribute rather than the
                    // hiding gets the same result.
                    aria-modal
                  >
                    <DialogPrimitive.Title className={styles.title}>{title}</DialogPrimitive.Title>

                    {description === undefined ? null : (
                      <DialogPrimitive.Description className={styles.description}>
                        {description}
                      </DialogPrimitive.Description>
                    )}

                    <div className={styles.body} data-dialog-part="body">
                      {children}
                    </div>

                    {footer === undefined ? null : (
                      <div className={styles.footer} data-dialog-part="footer">
                        {footer}
                      </div>
                    )}

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
                  </MotionSurface>
                </DialogPrimitive.Content>
              </div>
            </DialogPrimitive.Portal>
          ) : null}
        </MotionPresence>
      </DialogPrimitive.Root>
    </LentPanel>
  )
}
