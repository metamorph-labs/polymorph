'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import {
  focusPlace,
  memberAttr,
  returnFocusTo,
  revealTourTarget,
  useAgentMember,
  tourPlacement,
  tourTarget,
  tourTargetRect,
  tourViewport,
  type FocusPlace,
  type TourPlacement,
  type TourRect,
} from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/tour.module.css'
import { Button } from '../controls/Button'

/**
 * Tour's root and its target part, in a client module; `Tour.tsx` attaches
 * the part (`design/components/tour.md`).
 *
 * The panel is Radix's modal dialog without its overlay, so the page keeps its
 * scroll, and the panel and the cut-out follow the target. The engine places
 * the panel (`tourPlacement`), because a popper has no place for a panel whose
 * target is larger than the window, and the panel must stay inside it.
 */

/** One step: the part it points at, if any, and what it says about it. */
export interface TourStep {
  /** The step's key, unique in the tour. */
  id: string
  /** The `name` of the `Tour.Target` the step points at. Without one, the step is drawn centred. */
  target?: string
  title: string
  /** A sentence or two about the target, as text. */
  body: string
  /** The side of the target the panel opens on, when it fits there. */
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * The words the member writes itself, localized by passing every key or none,
 * so one Tour never mixes two languages. The position is a function, because
 * word order belongs to the application's catalog.
 */
export interface TourMessages {
  next: string
  previous: string
  /** The last step's forward control, which ends the tour. */
  done: string
  /** The close control's accessible name. */
  close: string
  /** The position line, counting from 1: "Step 2 of 5". */
  position: (position: number, count: number) => string
}

/** Why a tour ended: the last step's control, or Escape and the close control. */
export type TourEnd = 'finished' | 'dismissed'

export interface TourProps {
  steps: readonly TourStep[]
  open?: boolean
  defaultOpen?: boolean
  /**
   * Called when the reader ends the tour, with why. A tour never opens itself,
   * so its end is the one change it reports. The member stores nothing: the
   * application records that the tour was seen.
   */
  onEnd?: (reason: TourEnd) => void
  /** The current step's index, clamped to the steps. */
  step?: number
  defaultStep?: number
  onStepChange?: (index: number) => void
  messages?: TourMessages
}

export interface TourTargetProps {
  /** The name a step's `target` uses. */
  name: string
  children: ReactNode
}

const DEFAULT_MESSAGES: TourMessages = {
  next: 'Next',
  previous: 'Previous',
  done: 'Done',
  close: 'Close',
  position: (position, count) => `Step ${position} of ${count}`,
}

/**
 * The part a step points at. It adds no box (`display: contents`), so the
 * layout around what it wraps does not change.
 */
export function TourTarget({ name, children }: TourTargetProps) {
  return (
    <span className={styles.target} data-tour-target={name}>
      {children}
    </span>
  )
}

interface Geometry {
  x: number
  y: number
  placement: TourPlacement
  hole: TourRect | null
}

const same = (a: Geometry | null, b: Geometry) =>
  a !== null &&
  a.x === b.x &&
  a.y === b.y &&
  a.placement === b.placement &&
  JSON.stringify(a.hole) === JSON.stringify(b.hole)

export function TourRoot({
  steps,
  open: openProp,
  defaultOpen,
  onEnd,
  step: stepProp,
  defaultStep,
  onStepChange,
  messages = DEFAULT_MESSAGES,
}: TourProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const [uncontrolledStep, setUncontrolledStep] = useState(defaultStep ?? 0)
  const count = steps.length
  const open = (openProp ?? uncontrolledOpen) && count > 0
  const index = Math.min(Math.max(stepProp ?? uncontrolledStep, 0), Math.max(count - 1, 0))
  const current = steps[index]

  const end = (reason: TourEnd) => {
    setUncontrolledOpen(false)
    onEnd?.(reason)
  }
  const go = (next: number) => {
    setUncontrolledStep(next)
    onStepChange?.(next)
  }

  const [positioner, setPositioner] = useState<HTMLDivElement | null>(null)
  const panel = useRef<HTMLElement | null>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)

  // An agent moves between steps and ends the tour as a person's controls do, through `go` and
  // `end`, so `onStepChange` and `onEnd` report it in either form. A move is refused where its
  // control is absent, and on the last step, whose Done says the reader went through the tour:
  // an agent ends it with `dismiss`. The panel names the tour by the step's title, and it
  // withholds the panel, because every control in it is the tour's own.
  function steppable(): void {
    if (!open) throw new Error('The tour is not open.')
  }
  useAgentMember({
    member: 'Tour',
    element: () => panel.current,
    state: () => ({
      open,
      step: index,
      steps: steps.map((each) => ({ id: each.id, title: each.title, body: each.body })),
    }),
    actions: {
      next: () => {
        steppable()
        if (index === count - 1)
          throw new Error('On the last step, an agent ends a tour with dismiss.')
        go(index + 1)
      },
      previous: () => {
        steppable()
        if (index === 0) throw new Error('This is the first step.')
        go(index - 1)
      },
      dismiss: () => open && end('dismissed'),
    },
    withholds: () => panel.current,
  })

  // A step that opens brings its target into view and places its panel and the
  // cut-out. It is a layout effect, so the first frame the browser paints is
  // the placed one. The panel then follows its target when the page scrolls,
  // the window resizes, or the panel's own size changes. The effect reads the
  // step's id, target and side, not the step object: an application that
  // writes `steps` inline makes a new object on each of its renders, and a
  // render must not bring back a target the reader has scrolled away from.
  const shownStep = current?.id
  const target = current?.target
  const side = current?.side
  useLayoutEffect(() => {
    if (!open || positioner === null || shownStep === undefined) return
    const place = () => {
      const hole = tourTargetRect(tourTarget(target))
      const box = { width: positioner.offsetWidth, height: positioner.offsetHeight }
      const next = { ...tourPlacement(hole, box, tourViewport(), side), hole }
      setGeometry((previous) => (same(previous, next) ? previous : next))
    }
    revealTourTarget(tourTarget(target))
    place()
    const observer = new ResizeObserver(place)
    observer.observe(positioner)
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, { capture: true })
    }
  }, [open, positioner, shownStep, target, side])

  // Every later step moves focus to the panel too, so assistive software reads
  // the new step's title, body and position once, as it read the first.
  const shown = useRef<number | null>(null)
  useEffect(() => {
    if (!open) {
      shown.current = null
      return
    }
    if (shown.current !== null && shown.current !== index) panel.current?.focus()
    shown.current = index
  }, [open, index])

  // Focus returns to where it was when the tour opened. A tour has no trigger,
  // so Radix's own return has nothing to go back to. When the element that had
  // focus has left the page, focus goes to the focusable element nearest where
  // it was (`returnFocusTo`).
  const returnTo = useRef<FocusPlace | null>(null)
  const onOpenAutoFocus = (event: Event) => {
    returnTo.current = focusPlace(document.activeElement)
    event.preventDefault()
    panel.current?.focus()
  }
  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    returnFocusTo(returnTo.current, [event.currentTarget as Element | null])
  }

  const placement = geometry?.placement ?? 'center'
  const hole = geometry?.hole ?? null
  const first = index === 0
  const last = index === count - 1

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) end('dismissed')
      }}
    >
      <MotionPresence>
        {open && current !== undefined ? (
          <DialogPrimitive.Portal key="tour" forceMount>
            {/* The scrim, with a cut-out around the target when the step has
                one. It is decorative: the step's words say what it points at. */}
            <MotionSurface
              binding="dialog.scrim"
              className={hole ? styles.spotlight : styles.scrim}
              aria-hidden
              data-tour-part="scrim"
              style={
                hole
                  ? ({
                      '--pm-tour-hole-x': `${hole.x}px`,
                      '--pm-tour-hole-y': `${hole.y}px`,
                      '--pm-tour-hole-width': `${hole.width}px`,
                      '--pm-tour-hole-height': `${hole.height}px`,
                    } as CSSProperties)
                  : undefined
              }
            />

            {/* Placed by the engine; it is the panel's box with its margin. */}
            <div
              ref={setPositioner}
              className={styles.positioner}
              data-placement={placement}
              style={
                {
                  '--pm-tour-x': `${geometry?.x ?? 0}px`,
                  '--pm-tour-y': `${geometry?.y ?? 0}px`,
                } as CSSProperties
              }
            >
              <DialogPrimitive.Content
                asChild
                forceMount
                onOpenAutoFocus={onOpenAutoFocus}
                onCloseAutoFocus={onCloseAutoFocus}
                // The page is out of reach, and a press on it does not end the
                // tour: Escape and the close control do.
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
              >
                <MotionSurface
                  binding="popover.panel"
                  {...(placement === 'center' ? {} : { side: placement, align: 'center' as const })}
                  ref={panel}
                  className={styles.panel}
                  data-step={current.id}
                  {...memberAttr('Tour')}
                  // Radix hides the rest of the page and omits this attribute;
                  // the spec requires it, as Dialog's does.
                  aria-modal
                >
                  <DialogPrimitive.Title className={styles.title}>
                    {current.title}
                  </DialogPrimitive.Title>

                  {/* The description is the body and the position, so the
                      position is read once, with the step, and is no live
                      region of its own. */}
                  <DialogPrimitive.Description asChild>
                    <div className={styles.description}>
                      <p className={styles.body}>{current.body}</p>
                      <p className={styles.position} data-tour-part="position">
                        {messages.position(index + 1, count)}
                      </p>
                    </div>
                  </DialogPrimitive.Description>

                  <div className={styles.actions} data-tour-part="actions">
                    {first ? null : (
                      <Button
                        variant="outline"
                        tone="neutral"
                        size="sm"
                        label={messages.previous}
                        onClick={() => go(index - 1)}
                      />
                    )}
                    <Button
                      size="sm"
                      label={last ? messages.done : messages.next}
                      onClick={() => (last ? end('finished') : go(index + 1))}
                    />
                  </div>

                  <div className={styles.close} data-tour-part="close">
                    <Button
                      variant="ghost"
                      tone="neutral"
                      size="sm"
                      iconOnly
                      icon="close"
                      label={messages.close}
                      onClick={() => end('dismissed')}
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
