'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { DismissableLayer } from '@radix-ui/react-dismissable-layer'
import { FocusScope } from '@radix-ui/react-focus-scope'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { usePreventScroll } from 'react-aria'

import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/sheet.module.css'

/**
 * The shared bottom sheet (the sheet presentation,
 * `design/components/README.md`). It is Drawer's bottom anatomy, promoted for
 * every member whose spec has a sheet form but that does not already have
 * Dialog's machinery. Dialog and ConfirmDialog keep Radix's dialog substrate
 * and compose only the CSS. Menu, ContextMenu, SplitButton and Popover render
 * this surface, because on their sheet lanes there is no Radix root to provide
 * a scrim, a portal or containment.
 *
 * Not a member and not exported to consumers, like `trigger-anchor.tsx`.
 *
 * What it handles, and what it deliberately does not:
 *
 *  - **The scrim, the panel and the motion.** `sheet.panel` (the `sheet`
 *    pattern, overlay class, bound in `design/motion/motion.json`) and
 *    Dialog's `fade` scrim. Reduced motion projects through the engine. A
 *    sheet has no fade to keep, so under reduced motion it appears in place.
 *    That is the `sheet → fade` projection that `values.ts` tests.
 *  - **Dismissal**: a press on the scrim, and Escape from anywhere inside the
 *    panel. Dismissing on selection belongs to the menu lane (`sheet-menu.tsx`).
 *  - **A layer of its own.** A sheet opened from inside a Dialog or a Drawer
 *    is portalled out of it, so the panel is a Radix layer and a Radix focus
 *    scope, as the overlay it sits on is. The topmost layer takes Escape, so
 *    Escape closes the sheet and not the Dialog beneath it, and a Tooltip or a
 *    Menu open inside the sheet takes the Escape that closes it, which then
 *    leaves the sheet open. A new focus scope
 *    pauses the one beneath, so the Dialog's trap does not pull focus out of
 *    the sheet. The layer dismisses nothing by itself: the panel's own Escape
 *    and the scrim do, as below.
 *  - **Containment**: a trapped focus scope, the sheet presentation's
 *    Dialog-lane rule for modal sheets. The scope wraps Tab only at the
 *    panel's first and last controls, as Radix's Dialog does, and Radix's
 *    Dialog also puts a focusable guard at each end of the page. The sheet
 *    keeps one on each side of its panel for the same reason: a browser whose
 *    Tab passes over buttons (Safari's default) moves focus from a field past
 *    the panel's last button, onto the guard, and the scope takes it back
 *    into the panel instead of letting it leave the page. Menus and Popover contain focus
 *    (Popover because its sheet form changes its contract to modal,
 *    `design/components/popover.md`). The combobox lane opts out with
 *    `containFocus={false}`, following the sheet presentation's split: a
 *    combobox-lane sheet has no focus scope, DOM focus stays in the input in
 *    the page, and the scrim only dismisses and never traps focus. The opt-out
 *    also disables the fallback focus below, because both are one policy: a
 *    contained sheet must hold DOM focus, and a sheet with no scope must never
 *    take it.
 *  - **Scroll lock** while open (`usePreventScroll`). The page behind a modal
 *    surface does not scroll, as with the Radix-rooted overlays.
 *  - **The page hidden** from assistive software while a contained sheet is
 *    open, as a Dialog hides it: every other element of the body takes
 *    `aria-hidden` until the exit begins. The combobox lane hides nothing,
 *    because its field stays in the page.
 *  - **Not focus restore.** Each member decides where focus goes when the
 *    sheet closes. Menu and Popover restore through `TriggerAnchor`,
 *    SplitButton to its chevron, and ContextMenu to where focus was when the
 *    press began. A second restore here would race the first.
 *
 * The `data-state` context needs explaining. `MotionPresence` keeps a leaving
 * subtree mounted with the props it last rendered, so an attribute passed as a
 * prop would stay `"open"` for the whole exit. A leaving scrim that still reads
 * open still takes clicks, which breaks the pointer-events law. Context still
 * reaches the frozen tree (Radix's own overlays rely on this), so the state is
 * provided outside the presence boundary and read inside it.
 */

/**
 * The sheet presentation's one breakpoint: `30rem`, the overlay class's own
 * threshold. It reads the viewport, because an overlay is portalled and
 * `fixed`, so the viewport is its only container. It is SSR-safe (`false` on
 * the server and for the hydration render, via the server snapshot) and
 * hydration-consistent: the live value arrives with the store sync, never as a
 * mismatched first paint.
 */
const PHONE_QUERY = '(width < 30rem)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readPhone(): boolean {
  return window.matchMedia(PHONE_QUERY).matches
}

function readServerPhone(): boolean {
  return false
}

export function usePhoneViewport(): boolean {
  return useSyncExternalStore(subscribe, readPhone, readServerPhone)
}

const SheetStateContext = createContext<'open' | 'closed'>('open')

export interface SheetSurfaceProps {
  open: boolean
  /** Called on scrim press and Escape; the member decides what closing means. */
  onDismiss: () => void
  /**
   * Called before Escape dismisses; return `true` to keep the sheet open for
   * that press. It is the sheet's version of the popper lane's
   * `onEscapeKeyDown` gate, with its own signature for a reason. Radix gives
   * its gate a new event whose `defaultPrevented` starts false. Here the
   * member's own substrate has already handled the event (the range grid calls
   * `preventDefault` on Escape whether or not an anchor is set), so a DOM flag
   * cannot carry the answer. The member answers from its own state instead.
   * DateRangePicker's in-progress range is cancelled first, by the grid's
   * handler, which has already run when this is called while this render's
   * closure still holds the anchor. The sheet closes on the next press.
   */
  holdEscape?: () => boolean
  /**
   * Selects the sheet presentation's lane. `true` (the default) is the Dialog
   * lane: a trapped focus scope, and the panel takes focus if its content has
   * nothing focusable. `false` is the combobox lane: no scope, and focus is
   * never taken. DOM focus stays in the field's input in the page, the listbox
   * uses `aria-activedescendant`, and the scrim dismisses without trapping.
   */
  containFocus?: boolean
  /**
   * The panel's role: `dialog` for Popover's sheet, and unset for a menu, whose
   * `<ul role="menu">` carries the semantics.
   */
  role?: 'dialog'
  'aria-label'?: string
  'aria-modal'?: boolean
  children?: ReactNode
}

export function SheetSurface({
  open,
  onDismiss,
  holdEscape,
  containFocus = true,
  role,
  'aria-label': label,
  'aria-modal': modal,
  children,
}: SheetSurfaceProps) {
  return (
    <SheetStateContext.Provider value={open ? 'open' : 'closed'}>
      <MotionPresence>
        {open ? (
          <SheetPortal
            key="sheet"
            onDismiss={onDismiss}
            holdEscape={holdEscape}
            containFocus={containFocus}
            role={role}
            label={label}
            modal={modal}
          >
            {children}
          </SheetPortal>
        ) : null}
      </MotionPresence>
    </SheetStateContext.Provider>
  )
}

function SheetPortal({
  onDismiss,
  holdEscape,
  containFocus,
  role,
  label,
  modal,
  children,
}: {
  onDismiss: () => void
  holdEscape?: () => boolean
  containFocus: boolean
  role?: 'dialog'
  label?: string
  modal?: boolean
  children?: ReactNode
}) {
  const state = useContext(SheetStateContext)
  const panelRef = useRef<HTMLElement>(null)
  const scrimRef = useRef<HTMLElement>(null)
  const positionerRef = useRef<HTMLDivElement>(null)
  /**
   * Whether the lane's content is drawn. A contained sheet draws it once its
   * focus scope is active (`onMountAutoFocus`), a commit after the panel. A
   * new scope pauses the one beneath it, so a lane that moves focus into the
   * sheet as it mounts is not undone by a Dialog's trap beneath the sheet,
   * which would otherwise put focus back on the trigger before the sheet's
   * scope is active. The combobox lane has no scope and draws at once.
   */
  const [ready, setReady] = useState(!containFocus)

  useEffect(() => {
    if (!containFocus || state === 'closed') return
    return hideOutside([scrimRef.current, positionerRef.current])
  }, [containFocus, state])

  // The page behind a modal surface does not scroll. The lock is released as
  // soon as the exit begins. The combobox lane keeps the lock too: its scrim
  // already takes every touch, so any page scroll beneath it would be
  // unintended.
  usePreventScroll({ isDisabled: state === 'closed' })

  /**
   * Focus moves into the panel once the content is drawn. Child effects run first, so a lane
   * with its own initial-focus policy (the menu's `autoFocus: 'first'`) has
   * already moved focus when this checks. The fallback only handles a panel
   * whose content has nothing focusable. Without it, DOM focus would stay
   * outside a contained scope. The combobox lane skips it entirely: DOM focus
   * is in the field's input by design, and moving it would break the
   * focus-management boundary (`design/components/README-substrates.md`).
   */
  useEffect(() => {
    if (!containFocus || !ready) return
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
  }, [containFocus, ready])

  /**
   * The Escape the sheet's own layer took as the topmost layer. Radix hands a
   * layer the keydown on the document before any element sees it, and only
   * the topmost layer's: a Tooltip or a Menu open inside the sheet takes the
   * Escape that closes it, and the sheet's layer is not handed that one. The
   * panel's own handler below then runs after the content's, so a member's
   * substrate has handled the key when `holdEscape` is asked.
   */
  const topmost = useRef<Event | null>(null)

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || state === 'closed') return
    if (topmost.current !== event.nativeEvent) return
    if (holdEscape?.() === true) return
    event.stopPropagation()
    onDismiss()
  }

  const panel = (
    <MotionSurface
      binding="sheet.panel"
      sheetSide="bottom"
      ref={panelRef}
      className={styles.panel}
      data-presentation="sheet"
      data-state={state}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      {...(role === undefined ? {} : { role })}
      {...(label === undefined ? {} : { 'aria-label': label })}
      {...(modal === undefined ? {} : { 'aria-modal': modal })}
    >
      {ready ? children : null}
    </MotionSurface>
  )

  // The layer takes Escape from the layers beneath it and dismisses nothing by
  // itself: it records the Escape it was handed, and the panel decides.
  const layered = (
    <DismissableLayer
      asChild
      onEscapeKeyDown={(event) => {
        topmost.current = event
      }}
    >
      {panel}
    </DismissableLayer>
  )

  return createPortal(
    <>
      <MotionSurface
        ref={scrimRef}
        binding="dialog.scrim"
        className={styles.scrim}
        data-state={state}
        onClick={() => {
          if (state === 'open') onDismiss()
        }}
      />
      <div ref={positionerRef} className={styles.positioner}>
        {/* Containment is released as soon as the exit begins. The member's
            focus restore runs at dismiss time, and a scope still active during
            the exit would pull focus back into the closing panel. The scope
            moves focus neither as it mounts nor as it unmounts: the lane and
            the member decide both. */}
        {containFocus ? (
          <>
            <VisuallyHidden tabIndex={0} data-sheet-guard="" />
            <FocusScope
              asChild
              loop
              trapped={state === 'open'}
              onMountAutoFocus={(event) => {
                event.preventDefault()
                setReady(true)
              }}
              onUnmountAutoFocus={(event) => event.preventDefault()}
            >
              {layered}
            </FocusScope>
            <VisuallyHidden tabIndex={0} data-sheet-guard="" />
          </>
        ) : (
          layered
        )}
      </div>
    </>,
    document.body,
  )
}

/**
 * Hides every other element of the body from assistive software, as a modal
 * Dialog does, and returns what shows them again. An element that is already
 * hidden is left as it is, so a Dialog beneath keeps what it hid.
 */
function hideOutside(keep: readonly (Element | null)[]): () => void {
  const hidden: Element[] = []
  for (const element of document.body.children) {
    if (keep.includes(element) || element.getAttribute('aria-hidden') === 'true') continue
    if (element.matches('script, style, template, link')) continue
    element.setAttribute('aria-hidden', 'true')
    hidden.push(element)
  }
  return () => {
    for (const element of hidden) element.removeAttribute('aria-hidden')
  }
}
