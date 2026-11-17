'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react'

import { Button } from '../controls/Button'
import { Image } from '../structure/Image'
import { memberAttr, useAgentMember, useSupplied } from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/lightbox.module.css'
import { useModalFocus } from './modal-focus'

/**
 * A picture opened large over the page (`design/components/lightbox.md`).
 *
 * The first sentence is the member's line on the system card, which has a
 * budget, so it stays this short.
 *
 * It is a positioned Dialog variant, as Drawer is: Radix's dialog behaviour,
 * Dialog's scrim, Dialog's focus policy from `modal-focus.ts` and Dialog's
 * presence motion, with a panel of its own. The panel fills the window and
 * draws no card, so the picture is fitted inside the window and not inside a
 * card's width and scrolling body.
 *
 * It is not Dialog, which holds a task under a visible title. It is not
 * Carousel, which pages slides in place on the page. Each picture is an Image,
 * with Image's loading and failed states.
 */

export interface LightboxImage {
  /** The picture's URL. An empty string is Image's failed state. */
  src: string
  /** The picture's accessible name, as Image's `alt`. */
  alt: string
}

/**
 * Every word the lightbox writes, localized by passing them. Pass all keys or
 * none, so one panel never mixes two languages.
 */
export interface LightboxMessages {
  /** The close Button's name. */
  close: string
  /** The previous Button's name. */
  previous: string
  /** The next Button's name. */
  next: string
  /** The position line, "2 of 5". `position` counts from 1. */
  position: (position: number, count: number) => string
}

const DEFAULT_MESSAGES: LightboxMessages = {
  close: 'Close',
  previous: 'Previous picture',
  next: 'Next picture',
  position: (position, count) => `${position} of ${count}`,
}

export interface LightboxProps {
  /** The pictures in reading order. An empty list opens nothing. */
  images: LightboxImage[]
  /** The dialog's accessible name, such as "Attachment preview". It is not drawn. */
  label: string
  /** The picture shown, counted from 0. Controlled, as in Carousel. */
  index?: number
  /** The picture shown first while the lightbox holds the position. Defaults to 0. */
  defaultIndex?: number
  /** Called with the index of the picture the reader moved to. */
  onIndexChange?: (index: number) => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * A governed control, usually a Button, cloned to receive `onClick`, which
   * also tells the panel where it was opened from. As in Dialog.
   */
  trigger?: ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>
  /** Omit for the English defaults; localized hosts pass their own. */
  messages?: LightboxMessages
}

const clampIndex = (value: number, count: number) =>
  Math.min(Math.max(count - 1, 0), Math.max(0, value))

/** The travel Button inside a part of the panel. */
const buttonIn = (part: HTMLElement | null) => part?.querySelector('button') ?? null

export function Lightbox({
  images,
  label,
  index: controlled,
  defaultIndex = 0,
  onIndexChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
  trigger,
  messages = DEFAULT_MESSAGES,
}: LightboxProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false)
  const [launchedFrom, setLaunchedFrom] = useState<Element | null>(null)
  // An empty list has nothing to show, so the panel never opens for it.
  const open = (openProp ?? uncontrolled) && images.length > 0

  // Mirrored, not owned, as in Carousel.
  const [mirror, setMirror] = useState(() => clampIndex(defaultIndex, images.length))
  const index = clampIndex(controlled ?? mirror, images.length)
  const several = images.length > 1
  const first = index === 0
  const last = index === images.length - 1

  // Dialog's policy: the panel holds no body and no footer, so focus starts on close.
  const focus = useModalFocus('primary')

  const previousPart = useRef<HTMLDivElement>(null)
  const nextPart = useRef<HTMLDivElement>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  function travel(to: number) {
    if (to < 0 || to >= images.length || to === index) return
    setMirror(to)
    onIndexChange?.(to)
  }

  // An agent moves and closes as a person's controls do, through `travel` and `setOpen`, so
  // `onIndexChange` and `onOpenChange` report it in either form. A move is refused where its
  // control is disabled or absent. The panel names the lightbox, and it withholds the panel,
  // because every control in it is the lightbox's own.
  const panelRef = useRef<HTMLElement | null>(null)
  function movable(): void {
    if (!open) throw new Error('The lightbox is closed.')
  }
  useAgentMember({
    member: 'Lightbox',
    element: () => panelRef.current,
    state: () => ({ open, index, images: images.map((image) => ({ alt: image.alt })) }),
    actions: {
      close: () => open && setOpen(false),
      next: () => {
        movable()
        if (last) throw new Error('This is the last picture.')
        travel(index + 1)
      },
      previous: () => {
        movable()
        if (first) throw new Error('This is the first picture.')
        travel(index - 1)
      },
    },
    withholds: () => panelRef.current,
  })

  /*
   * A browser takes focus from a button as it is disabled, so the travel Button
   * that reaches an end would leave focus on the page, outside the trap, where
   * the arrow keys do nothing. After each move, when focus is on a disabled
   * travel Button (Firefox and WebKit report this) or on the page (Chromium
   * reports this), it goes to the other travel Button, which the move has
   * enabled. It runs on a move only, so focus on open is Dialog's policy.
   */
  const shown = useRef(index)
  useEffect(() => {
    if (shown.current === index) return
    shown.current = index
    if (!open) return
    const previous = buttonIn(previousPart.current)
    const next = buttonIn(nextPart.current)
    const active = document.activeElement
    const lost =
      active === null ||
      active === document.body ||
      ((active === previous || active === next) && (active as HTMLButtonElement).disabled)
    if (!lost) return
    const other = [previous, next].find((button) => button !== null && !button.disabled)
    other?.focus()
  }, [index, open])

  /**
   * ArrowLeft and ArrowRight move one picture, by the page's direction: in a
   * right-to-left page the arrow that points left moves to the next picture.
   * A key with a modifier is the browser's or the reader's own, and is left
   * alone. At an end the key does nothing.
   */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!several || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key !== forward && event.key !== back) return
    event.preventDefault()
    travel(event.key === forward ? index + 1 : index - 1)
  }

  // A server component may have passed the trigger, and it is cloned below
  // (`useSupplied`).
  const supplied = useSupplied(trigger)
  const triggerNode = supplied
    ? cloneElement(supplied, {
        onClick: (event: MouseEvent<HTMLElement>) => {
          supplied.props.onClick?.(event)
          if (images.length === 0) return
          setLaunchedFrom(event.currentTarget)
          setOpen(true)
        },
      })
    : null

  const picture = images[index]

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      {triggerNode}

      <MotionPresence>
        {open && picture !== undefined ? (
          <DialogPrimitive.Portal key="lightbox" forceMount>
            {/* Dialog's scrim, composed in the recipe. A press on it closes. */}
            <DialogPrimitive.Overlay asChild forceMount>
              <MotionSurface binding="dialog.scrim" className={styles.scrim} />
            </DialogPrimitive.Overlay>

            <div className={styles.positioner}>
              <DialogPrimitive.Content
                asChild
                forceMount
                onCloseAutoFocus={focus.onCloseAutoFocus}
                onOpenAutoFocus={focus.onOpenAutoFocus}
                onKeyDown={onKeyDown}
                // The panel draws no description: a picture's name is its `alt`.
                aria-describedby={undefined}
              >
                <MotionSurface
                  ref={panelRef}
                  binding="dialog.panel"
                  launchedFrom={launchedFrom}
                  className={styles.panel}
                  {...memberAttr('Lightbox')}
                  // Radix hides the rest of the page with `aria-hidden` and omits
                  // this attribute, as in Dialog.
                  aria-modal
                >
                  <DialogPrimitive.Title className={styles.title}>{label}</DialogPrimitive.Title>

                  {/* One element per picture, so a picture that is still
                      loading never shows the last one in its place. */}
                  <div className={styles.stage}>
                    <Image key={index} src={picture.src} alt={picture.alt} loading="eager" />
                  </div>

                  {several ? (
                    <>
                      <div
                        ref={previousPart}
                        className={styles.previous}
                        data-lightbox-part="previous"
                      >
                        <Button
                          variant="ghost"
                          tone="neutral"
                          size="sm"
                          iconOnly
                          icon="previous"
                          label={messages.previous}
                          disabled={first}
                          onClick={() => travel(index - 1)}
                        />
                      </div>
                      <div ref={nextPart} className={styles.next} data-lightbox-part="next">
                        <Button
                          variant="ghost"
                          tone="neutral"
                          size="sm"
                          iconOnly
                          icon="next"
                          label={messages.next}
                          disabled={last}
                          onClick={() => travel(index + 1)}
                        />
                      </div>
                      <p className={styles.position} role="status">
                        {messages.position(index + 1, images.length)}
                      </p>
                    </>
                  ) : null}

                  {/* Not Radix's `Close`, as in Dialog: it needs `asChild`, and a
                      governed control forwards no ref. */}
                  <div className={styles.close} data-dialog-part="close">
                    <Button
                      variant="ghost"
                      tone="neutral"
                      size="sm"
                      iconOnly
                      icon="close"
                      label={messages.close}
                      onClick={() => setOpen(false)}
                    />
                  </div>
                </MotionSurface>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </MotionPresence>
    </DialogPrimitive.Root>
  )
}
