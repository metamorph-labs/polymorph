'use client'

import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'

import type { RichTextRect } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/selection-bar.module.css'

/**
 * Two things a member that edits or reads a document draws at the person's
 * text (`design/components/rich-text-input.md`, "The selection bar").
 *
 * `useToolbarKeys` is the keyboard of a `role="toolbar"` row: one tab stop,
 * the arrow keys, Home and End move between its controls, and Escape hands
 * focus back to the member. A pointer press on a control keeps focus where it
 * is, so a selection in the text survives the press. RichTextInput's fixed
 * toolbar and the selection bar both use it.
 *
 * `SelectionBar` is the bar drawn at a selection: `position: fixed`, centred
 * over the selection's box and above it, below it when there is less room
 * above or on a coarse pointer (where the system's own callout sits above the
 * selection), and inside the viewport's inline edges. It follows the selection
 * as the page scrolls and the window resizes. Application code may not place
 * anything, so the member draws the bar and the application gives it
 * controls.
 */

/** What a toolbar's keys move between: its own controls, and none of a toolbar inside it. */
const CONTROLS = 'button, [href], input, select, textarea, [tabindex]'

/** A text field takes the arrow keys and the pointer itself. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]'

function enabled(element: HTMLElement): boolean {
  return (
    !element.matches(':disabled') &&
    element.getAttribute('aria-disabled') !== 'true' &&
    element.closest('[hidden], [inert]') === null
  )
}

/** Every control of the toolbar, enabled or not, in document order. */
function everyControl(toolbar: HTMLElement): HTMLElement[] {
  return Array.from(toolbar.querySelectorAll<HTMLElement>(CONTROLS)).filter(
    (element) => element.closest('[role="toolbar"]') === toolbar,
  )
}

/** The first enabled control after `element` in document order. */
function after(element: HTMLElement, controls: readonly HTMLElement[]): HTMLElement | undefined {
  if (!element.isConnected) return undefined
  return controls.find(
    (control) =>
      (element.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )
}

export interface ToolbarKeys {
  /** Spread on the toolbar element. */
  props: {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
    onFocus: (event: FocusEvent<HTMLElement>) => void
    onBlur: (event: FocusEvent<HTMLElement>) => void
    onMouseDown: (event: MouseEvent<HTMLElement>) => void
  }
  /** Moves focus to the toolbar's tab stop. Returns whether a control took it. */
  enter: () => boolean
}

/**
 * The roving tab stop of a toolbar. Each render gives the stop's control
 * `tabindex="0"` and every other control `-1`, so Tab reaches the toolbar once
 * and arrives on the control it left from, the first one before that. A
 * control that is disabled while it has focus hands focus to the next enabled
 * control, so focus does not fall to the page when Undo runs out of steps.
 *
 * The tab index is written on the controls the toolbar holds, the
 * application's among them, because a vocabulary control takes no `tabIndex`
 * prop. Events from a popup a control opened reach the toolbar through React
 * but not through the document, and the toolbar leaves them alone.
 */
export function useToolbarKeys(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
): ToolbarKeys {
  /** The control that holds the tab stop. */
  const stop = useRef<HTMLElement | null>(null)
  /** Whether focus is in the toolbar, kept while it falls to the page from a control that was disabled. */
  const holding = useRef(false)

  useLayoutEffect(() => {
    const toolbar = ref.current
    if (toolbar === null) return
    const every = everyControl(toolbar)
    const controls = every.filter(enabled)
    const previous = stop.current
    const kept = previous !== null && controls.includes(previous) ? previous : null
    const next = kept ?? (previous === null ? undefined : after(previous, controls)) ?? controls[0]
    stop.current = next ?? null
    for (const control of every) control.tabIndex = control === next ? 0 : -1
    if (kept !== null || next === undefined || !holding.current) return
    const active = toolbar.ownerDocument.activeElement
    if (active === null || active === toolbar.ownerDocument.body || active === previous) {
      next.focus()
    }
  })

  // Escape is the toolbar's. A dialog's layer hears it on the document before the toolbar does
  // and closes unless the key's default is prevented, so the toolbar prevents it on the window,
  // which the key reaches first, and then hands focus back in its own handler. The window is the
  // toolbar's own, read once the toolbar is drawn: a selection bar is drawn after its member.
  const listening = useRef<{ view: Window; hold: (event: globalThis.KeyboardEvent) => void }>(null)
  useLayoutEffect(() => {
    const view = ref.current?.ownerDocument.defaultView ?? null
    if (listening.current?.view === view) return
    if (listening.current !== null) {
      listening.current.view.removeEventListener('keydown', listening.current.hold, true)
      listening.current = null
    }
    if (view === null) return
    const hold = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target) === true) event.preventDefault()
    }
    view.addEventListener('keydown', hold, true)
    listening.current = { view, hold }
  })
  useLayoutEffect(
    () => () => {
      if (listening.current === null) return
      listening.current.view.removeEventListener('keydown', listening.current.hold, true)
      listening.current = null
    },
    [],
  )

  function controlsNow(): HTMLElement[] {
    return ref.current === null ? [] : everyControl(ref.current).filter(enabled)
  }

  function mine(target: EventTarget | null): target is HTMLElement {
    return target instanceof HTMLElement && ref.current?.contains(target) === true
  }

  function move(to: HTMLElement | undefined) {
    if (to === undefined) return
    stop.current = to
    to.focus()
  }

  return {
    props: {
      onKeyDown: (event) => {
        if (!mine(event.target) || event.nativeEvent.isComposing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onEscape()
          return
        }
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
        if (event.target.closest(TEXT_ENTRY) !== null) return
        const controls = controlsNow()
        const at = controls.findIndex((control) => control.contains(event.target as Node))
        if (at === -1 || controls.length === 0) return
        const view = event.currentTarget.ownerDocument.defaultView
        const rtl = view?.getComputedStyle(event.currentTarget).direction === 'rtl'
        const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
        const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
        const count = controls.length
        let to: HTMLElement | undefined
        if (event.key === forward) to = controls[(at + 1) % count]
        else if (event.key === backward) to = controls[(at - 1 + count) % count]
        else if (event.key === 'Home') to = controls[0]
        else if (event.key === 'End') to = controls[count - 1]
        else return
        event.preventDefault()
        move(to)
      },
      onFocus: (event) => {
        if (!mine(event.target)) return
        holding.current = true
        const control = controlsNow().find((candidate) => candidate.contains(event.target as Node))
        if (control === undefined || ref.current === null) return
        stop.current = control
        for (const other of everyControl(ref.current)) other.tabIndex = other === control ? 0 : -1
      },
      onBlur: (event) => {
        if (!mine(event.target)) return
        const to = event.relatedTarget
        // Focus that falls to the page (a control disabled while it had focus) stays the toolbar's.
        if (to instanceof Node && ref.current?.contains(to) !== true) holding.current = false
      },
      onMouseDown: (event) => {
        if (!mine(event.target) || event.target.closest(TEXT_ENTRY) !== null) return
        // The press does not take focus, so the selection in the text stays.
        event.preventDefault()
      },
    },
    enter: () => {
      const to = stop.current?.isConnected === true ? stop.current : controlsNow()[0]
      if (to === undefined) return false
      to.focus()
      return true
    },
  }
}

/* -------------------------------------------------------------------------- */
/* The selection bar                                                          */
/* -------------------------------------------------------------------------- */

export interface SelectionBarProps {
  /** Whether the bar is drawn. It leaves with the motion it entered with. */
  open: boolean
  /** The selection's box in viewport coordinates now, or null while there is none. */
  measure: () => RichTextRect | null
  /** The toolbar's accessible name. */
  label: string
  /** Whether focus is in the bar, as it enters and leaves. */
  onFocusChange?: (inside: boolean) => void
  /** The bar's element, for the member's agent handle and for Alt+F10. */
  barRef: RefObject<HTMLDivElement | null>
  /** The keys of the bar, which the member holds to move focus into it. */
  keys: ToolbarKeys
  children: ReactNode
}

/** Where the bar's top-left corner goes, in viewport coordinates. */
function placement(
  bar: HTMLElement,
  rect: RichTextRect,
): { x: number; y: number; side: 'top' | 'bottom' } | null {
  const owner = bar.ownerDocument
  const view = owner.defaultView
  if (view === null) return null
  const viewport = owner.documentElement.clientWidth
  const width = bar.offsetWidth
  const height = bar.offsetHeight
  // The edge margin is the one the bar's own maximum width leaves on each side.
  const widest = Number.parseFloat(view.getComputedStyle(bar).maxWidth)
  const margin = Number.isFinite(widest) ? Math.max(0, (viewport - widest) / 2) : 0
  const centre = (rect.left + rect.right) / 2
  const x = Math.max(margin, Math.min(centre - width / 2, viewport - margin - width))
  const coarse = view.matchMedia?.('(pointer: coarse)').matches ?? false
  const side = coarse || rect.top - margin < height + margin ? 'bottom' : 'top'
  const y = side === 'top' ? rect.top - margin - height : rect.bottom + margin
  return { x, y, side }
}

const px = (bar: HTMLElement, property: string) =>
  Number.parseFloat(bar.style.getPropertyValue(property)) || 0

export function SelectionBar({
  open,
  measure,
  label,
  onFocusChange,
  barRef,
  keys,
  children,
}: SelectionBarProps) {
  // The bar stays while it leaves, and takes no focus and no press then.
  const [closing, setClosing] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setClosing(!open)
  }
  const drawn = open || closing

  const latest = useRef(measure)
  useLayoutEffect(() => {
    latest.current = measure
  })

  /**
   * Places the bar. A transformed or contained ancestor is the containing block
   * of a fixed box, and moves it, so the offset between where the bar was put
   * and where it is drawn is read back and taken off.
   */
  const place = useRef(() => {})
  useLayoutEffect(() => {
    place.current = () => {
      const bar = barRef.current
      const rect = latest.current()
      if (bar === null || rect === null) return
      const at = placement(bar, rect)
      if (at === null) return
      const box = bar.getBoundingClientRect()
      const originX = box.left - px(bar, '--pm-selection-bar-x')
      const originY = box.top - px(bar, '--pm-selection-bar-y')
      bar.style.setProperty('--pm-selection-bar-x', `${at.x - originX}px`)
      bar.style.setProperty('--pm-selection-bar-y', `${at.y - originY}px`)
      bar.dataset['side'] = at.side
    }
  })

  // Every render of an open bar: the selection or the bar's contents may have moved.
  useLayoutEffect(() => {
    if (open) place.current()
  })

  // The selection moves under the bar as the page scrolls and the window resizes.
  useLayoutEffect(() => {
    const bar = barRef.current
    const view = bar?.ownerDocument.defaultView
    if (!open || bar === null || view === null || view === undefined) return
    const follow = () => place.current()
    view.addEventListener('scroll', follow, true)
    view.addEventListener('resize', follow)
    const observer =
      typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(follow) : null
    observer?.observe(bar)
    return () => {
      view.removeEventListener('scroll', follow, true)
      view.removeEventListener('resize', follow)
      observer?.disconnect()
    }
  }, [open, barRef])

  // A bar with no leaving motion (reduced motion) is gone at once.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!closing || bar === null) return
    const style = bar.ownerDocument.defaultView?.getComputedStyle(bar)
    if (style === undefined || style.animationName === 'none') setClosing(false)
  }, [closing, barRef])

  if (!drawn) return null

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={label}
      className={styles.bar}
      data-state={closing ? 'closed' : undefined}
      inert={closing}
      {...keys.props}
      onFocus={(event) => {
        keys.props.onFocus(event)
        onFocusChange?.(true)
      }}
      onBlur={(event) => {
        keys.props.onBlur(event)
        const to = event.relatedTarget
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) onFocusChange?.(false)
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && closing) setClosing(false)
      }}
    >
      {children}
    </div>
  )
}
