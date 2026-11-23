'use client'

/**
 * The keyboard of a `role="toolbar"` row (`design/components/rich-text-input.md`,
 * "The toolbar" and "The selection bar"): one tab stop, the arrow keys, Home
 * and End move between its enabled controls, and Escape hands focus back to
 * the member. A pointer press on a control keeps focus where it is, so a
 * selection in the text survives the press. RichTextInput's fixed toolbar and
 * the selection bar both use it, in every framework: React's `useToolbarKeys`
 * binds these functions, and a description calls them from its handlers and
 * effects.
 *
 * The functions read and write the document and keep their state in a
 * `ToolbarStop` the member holds, one per toolbar.
 */

/** What a toolbar's keys move between: its own controls, and none of a toolbar inside it. */
const CONTROLS = 'button, [href], input, select, textarea, [tabindex]'

/** A text field takes the arrow keys and the pointer itself. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]'

/** Which control holds a toolbar's tab stop, and whether focus is in the toolbar. */
export interface ToolbarStop {
  /** The control that holds the tab stop. */
  control: HTMLElement | null
  /** Whether focus is in the toolbar, kept while it falls to the page from a control that was disabled. */
  holding: boolean
}

/** A toolbar's stop before any control holds it. */
export const toolbarStop = (): ToolbarStop => ({ control: null, holding: false })

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

/** The toolbar's enabled controls, in document order. */
const enabledControls = (toolbar: HTMLElement): HTMLElement[] =>
  everyControl(toolbar).filter(enabled)

/** The first enabled control after `element` in document order. */
function after(element: HTMLElement, controls: readonly HTMLElement[]): HTMLElement | undefined {
  if (!element.isConnected) return undefined
  return controls.find(
    (control) =>
      (element.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )
}

/** Whether an event's target is an element of this toolbar. */
const mine = (toolbar: HTMLElement, target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement && toolbar.contains(target)

/**
 * Writes the roving tab stop, after each change of what the toolbar holds:
 * the stop's control gets `tabindex="0"` and every other control `-1`, so Tab
 * reaches the toolbar once and arrives on the control it left from, the first
 * one before that. A control that is disabled while it has focus hands focus
 * to the next enabled control, so focus does not fall to the page when Undo
 * runs out of steps.
 *
 * The tab index is written on every control the toolbar holds, the
 * application's among them, because a vocabulary control takes no `tabIndex`.
 */
export function syncToolbarStop(toolbar: HTMLElement | null | undefined, stop: ToolbarStop): void {
  if (toolbar === null || toolbar === undefined) return
  const every = everyControl(toolbar)
  const controls = every.filter(enabled)
  const previous = stop.control
  const kept = previous !== null && controls.includes(previous) ? previous : null
  const next = kept ?? (previous === null ? undefined : after(previous, controls)) ?? controls[0]
  stop.control = next ?? null
  for (const control of every) control.tabIndex = control === next ? 0 : -1
  if (kept !== null || next === undefined || !stop.holding) return
  const active = toolbar.ownerDocument.activeElement
  if (active === null || active === toolbar.ownerDocument.body || active === previous) next.focus()
}

/** The attributes that make a control enabled or not, or reachable or not. */
const STOP_ATTRIBUTES = ['disabled', 'aria-disabled', 'hidden', 'inert']

/**
 * Writes the roving tab stop again whenever what the toolbar holds changes: a
 * control added or removed, or one disabled, enabled, hidden or made inert.
 * The application's controls in a toolbar render on their own schedule, so
 * the member does not wait for its own render to give them their tab index.
 * Returns the function that stops watching.
 */
export function watchToolbarStop(
  toolbar: HTMLElement | null | undefined,
  stop: ToolbarStop,
): () => void {
  const view = toolbar?.ownerDocument.defaultView
  if (toolbar === null || toolbar === undefined || view === null || view === undefined)
    return () => {}
  syncToolbarStop(toolbar, stop)
  if (typeof view.MutationObserver !== 'function') return () => {}
  const observer = new view.MutationObserver(() => syncToolbarStop(toolbar, stop))
  observer.observe(toolbar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: STOP_ATTRIBUTES,
  })
  return () => observer.disconnect()
}

/**
 * Whether focus was in a toolbar that is leaving (made inert, or already
 * removed, which a framework may do before its effects run) and is still in it
 * or has fallen to the page from it: the member then hands focus back (to its
 * text, or to where focus came from), so focus does not fall to the page when
 * a selection bar leaves under the control the person used. The stop no
 * longer holds focus afterwards.
 */
export function toolbarLosesFocus(
  toolbar: HTMLElement | null | undefined,
  stop: ToolbarStop,
): boolean {
  const owner = (toolbar ?? stop.control)?.ownerDocument
  if (!stop.holding || owner === undefined) return false
  const active = owner.activeElement
  const lost =
    active === null ||
    active === owner.body ||
    (toolbar !== null && toolbar !== undefined && toolbar.contains(active))
  if (lost) stop.holding = false
  return lost
}

/**
 * A key on the toolbar: Escape runs `onEscape`, and the arrows (mirrored in a
 * right-to-left document), Home and End move focus between the enabled
 * controls, wrapping at the ends. Returns whether the toolbar took the key. A
 * key on a text field inside the toolbar, with a modifier, or while an input
 * method composes is left alone.
 */
export function toolbarKeydown(
  toolbar: HTMLElement,
  event: KeyboardEvent,
  stop: ToolbarStop,
  onEscape: () => void,
): boolean {
  const target = event.target
  if (!mine(toolbar, target) || event.isComposing) return false
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onEscape()
    return true
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (target.closest(TEXT_ENTRY) !== null) return false
  const controls = enabledControls(toolbar)
  const at = controls.findIndex((control) => control.contains(target))
  if (at === -1 || controls.length === 0) return false
  const view = toolbar.ownerDocument.defaultView
  const rtl = view?.getComputedStyle(toolbar).direction === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
  const count = controls.length
  let to: HTMLElement | undefined
  if (event.key === forward) to = controls[(at + 1) % count]
  else if (event.key === backward) to = controls[(at - 1 + count) % count]
  else if (event.key === 'Home') to = controls[0]
  else if (event.key === 'End') to = controls[count - 1]
  else return false
  event.preventDefault()
  if (to !== undefined) {
    stop.control = to
    to.focus()
  }
  return true
}

/** Focus entering a control of the toolbar: that control holds the stop. */
export function toolbarFocusIn(toolbar: HTMLElement, event: FocusEvent, stop: ToolbarStop): void {
  const target = event.target
  if (!mine(toolbar, target)) return
  stop.holding = true
  const control = enabledControls(toolbar).find((candidate) => candidate.contains(target))
  if (control === undefined) return
  stop.control = control
  for (const other of everyControl(toolbar)) other.tabIndex = other === control ? 0 : -1
}

/**
 * Focus leaving a control of the toolbar. Focus that falls to the page (a
 * control disabled while it had focus) stays the toolbar's.
 */
export function toolbarFocusOut(toolbar: HTMLElement, event: FocusEvent, stop: ToolbarStop): void {
  if (!mine(toolbar, event.target)) return
  const to = event.relatedTarget
  if (to instanceof Node && !toolbar.contains(to)) stop.holding = false
}

/** A pointer press on a control of the toolbar does not take focus, so the selection in the text stays. */
export function toolbarPress(toolbar: HTMLElement, event: MouseEvent): void {
  const target = event.target
  if (!mine(toolbar, target) || target.closest(TEXT_ENTRY) !== null) return
  event.preventDefault()
}

/** Moves focus to the toolbar's tab stop. Returns whether a control took it. */
export function enterToolbar(toolbar: HTMLElement | null | undefined, stop: ToolbarStop): boolean {
  const to =
    stop.control?.isConnected === true
      ? stop.control
      : toolbar === null || toolbar === undefined
        ? undefined
        : enabledControls(toolbar)[0]
  if (to === undefined) return false
  to.focus()
  return true
}

/**
 * Escape is the toolbar's. A dialog's layer hears it on the document before
 * the toolbar does and closes unless the key's default is prevented, so the
 * toolbar prevents it on the window, which the key reaches first, and hands
 * focus back in its own key handler. Returns the function that stops holding.
 * `toolbar` is read at each key, because the toolbar may be drawn again.
 */
export function holdToolbarEscape(
  view: Window,
  toolbar: () => HTMLElement | null | undefined,
): () => void {
  const hold = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing) return
    const target = event.target
    if (target instanceof Node && toolbar()?.contains(target) === true) event.preventDefault()
  }
  view.addEventListener('keydown', hold, true)
  return () => view.removeEventListener('keydown', hold, true)
}
