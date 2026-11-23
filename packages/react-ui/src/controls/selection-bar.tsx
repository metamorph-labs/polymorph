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

import {
  enterToolbar,
  followSelectionBar,
  holdToolbarEscape,
  placeSelectionBar,
  syncToolbarStop,
  toolbarFocusIn,
  toolbarFocusOut,
  toolbarKeydown,
  toolbarLosesFocus,
  toolbarPress,
  toolbarStop,
  watchToolbarStop,
  type RichTextRect,
} from '@polymorph/react'
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
 * selection), at the selection's visible edge when neither side has room, and
 * inside the visible viewport on both axes. It follows the selection as the
 * page scrolls, the window resizes and a virtual keyboard opens. Application
 * code may not place anything, so the member draws the bar and the
 * application gives it controls. A bar that leaves while focus is in it hands
 * focus to the member (`onFocusLost`), so focus does not fall to the page when
 * an application's control in it replaces the selection.
 *
 * The keys and the placement are the engine's (`conventions/toolbar.ts`,
 * `conventions/selection-bar.ts`), which every framework's member calls; this
 * module binds them to React's elements and events.
 */

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
  /**
   * Whether focus was in the toolbar as it leaves, there still or fallen to the page from it
   * (`toolbarLosesFocus`): the member hands it back.
   */
  losesFocus: () => boolean
}

/**
 * The roving tab stop of a toolbar (`syncToolbarStop`). Each render, and each
 * change of what the toolbar holds (`watchToolbarStop`), gives the stop's
 * control `tabindex="0"` and every other control `-1`, so Tab reaches the
 * toolbar once and arrives on the control it left from, the first one before
 * that. A control that is disabled while it has focus hands focus to the next
 * enabled control, so focus does not fall to the page when Undo runs out of
 * steps.
 *
 * The tab index is written on the controls the toolbar holds, the
 * application's among them, because a vocabulary control takes no `tabIndex`
 * prop; the application's controls render on their own schedule, so the
 * toolbar watches for them rather than waiting for the member's render.
 * Events from a popup a control opened reach the toolbar through React but
 * not through the document, and the toolbar leaves them alone.
 */
export function useToolbarKeys(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
): ToolbarKeys {
  /** The control that holds the tab stop, and whether focus is in the toolbar: one object, kept. */
  const [held] = useState(toolbarStop)

  useLayoutEffect(() => {
    syncToolbarStop(ref.current, held)
  })

  // What the toolbar holds changes without this member's render: the application's controls.
  // The toolbar is read once it is drawn, and again when it is drawn anew.
  const watching = useRef<{ toolbar: HTMLElement; release: () => void }>(null)
  useLayoutEffect(() => {
    const toolbar = ref.current
    if (watching.current?.toolbar === toolbar) return
    watching.current?.release()
    watching.current =
      toolbar === null ? null : { toolbar, release: watchToolbarStop(toolbar, held) }
  })

  // Escape is the toolbar's (`holdToolbarEscape`). The window is the toolbar's own, read once the
  // toolbar is drawn: a selection bar is drawn after its member.
  const listening = useRef<{ view: Window; release: () => void }>(null)
  useLayoutEffect(() => {
    const view = ref.current?.ownerDocument.defaultView ?? null
    if (listening.current?.view === view) return
    listening.current?.release()
    listening.current = null
    if (view === null) return
    listening.current = { view, release: holdToolbarEscape(view, () => ref.current) }
  })
  useLayoutEffect(
    () => () => {
      listening.current?.release()
      listening.current = null
      watching.current?.release()
      watching.current = null
    },
    [],
  )

  return {
    props: {
      onKeyDown: (event) => {
        const toolbar = ref.current
        if (toolbar === null) return
        // The key stops here in React's tree too, where a popup's events also travel.
        if (toolbarKeydown(toolbar, event.nativeEvent, held, onEscape) && event.key === 'Escape')
          event.stopPropagation()
      },
      onFocus: (event) => {
        if (ref.current !== null) toolbarFocusIn(ref.current, event.nativeEvent, held)
      },
      onBlur: (event) => {
        if (ref.current !== null) toolbarFocusOut(ref.current, event.nativeEvent, held)
      },
      onMouseDown: (event) => {
        if (ref.current !== null) toolbarPress(ref.current, event.nativeEvent)
      },
    },
    enter: () => enterToolbar(ref.current, held),
    losesFocus: () => toolbarLosesFocus(ref.current, held),
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
  /**
   * The element whose visible part the selection must be in (the field's text, which scrolls in
   * its own box). The bar is hidden while none of the selection is in view there.
   */
  within?: () => Element | null
  /** The bar left while focus was in it: the member gives focus back. */
  onFocusLost?: () => void
  /** The bar's controls, or a function that draws them, called only while the bar is drawn. */
  children: ReactNode | (() => ReactNode)
}

export function SelectionBar({
  open,
  measure,
  label,
  onFocusChange,
  barRef,
  keys,
  within,
  onFocusLost,
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

  const latest = useRef({ measure, within, onFocusLost })
  useLayoutEffect(() => {
    latest.current = { measure, within, onFocusLost }
  })

  /** Places the bar at the selection (`placeSelectionBar`). */
  const place = useRef(() => {})
  useLayoutEffect(() => {
    place.current = () =>
      placeSelectionBar(barRef.current, latest.current.measure(), latest.current.within?.())
  })

  /** Focus in the leaving bar, or fallen from it to the page, goes back to the member. */
  const giveBack = () => {
    const back = latest.current.onFocusLost
    if (back !== undefined && keys.losesFocus()) back()
  }

  // The bar leaves (it is inert from this commit): focus in it goes back before the browser
  // moves it to the page.
  const shownRef = useRef(open)
  useLayoutEffect(() => {
    if (shownRef.current && !open) giveBack()
    shownRef.current = open
  })

  // Every render of an open bar: the selection or the bar's contents may have moved.
  useLayoutEffect(() => {
    if (open) place.current()
  })

  // The selection moves under the bar as the page scrolls and the window resizes.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!open || bar === null) return
    return followSelectionBar(bar, () => place.current())
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
        // A browser that moves focus off the inert bar to the page does so here.
        if (to === null && closing) giveBack()
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && closing) setClosing(false)
      }}
    >
      {typeof children === 'function' ? children() : children}
    </div>
  )
}
