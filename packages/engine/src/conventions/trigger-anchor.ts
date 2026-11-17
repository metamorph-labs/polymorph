'use client'

/**
 * The trigger of an anchored overlay, when the trigger is a governed control
 * the caller passes: the counterpart of the React vocabulary's `TriggerAnchor`
 * (`packages/react-ui/src/overlays/trigger-anchor.tsx`).
 *
 * The overlay's machine needs a trigger element it can find, measure and
 * listen on, and a governed control (`Button`) takes no `id` or ARIA it does
 * not declare. So the overlay wraps the control in an anchor element that the
 * machine owns, and this moves the ARIA the machine gives its trigger onto the
 * control inside, where assistive software expects it. When an overlay that
 * takes focus closes, focus returns to that control, because the anchor itself
 * is not focusable. A tooltip takes no focus and passes `returnFocus: false`;
 * focus arriving on its control would open it again.
 *
 * A machine focuses its panel a frame after the panel opens. When the close
 * comes sooner than that frame, the focus arrives in a panel that is leaving,
 * and is lost when the panel is removed. So focus that arrives in a closed
 * overlay's panel goes back to where it was when the overlay closed.
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const ARIA = ['aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-describedby'] as const

/** Whether each anchor's overlay was open when it was last synced. */
const wasOpen = new WeakMap<Element, boolean>()

/**
 * The description ids the anchor added to each control on its last sync: the
 * overlay's. The control's own description (FormField's hint and error) is
 * whatever else the attribute holds, read again on every sync, so an error id
 * the field adds after the first sync is kept.
 */
const addedDescription = new WeakMap<Element, readonly string[]>()

const ids = (value: unknown): string[] =>
  value === undefined || value === null ? [] : String(value).split(/\s+/).filter(Boolean)

/**
 * Whether focus may go back to the anchor's control as its overlay closes:
 * only from inside the anchor or the overlay, or from nowhere. A control the
 * reader moved to while a non-modal overlay closed keeps focus. The overlay is
 * the panel and anything that holds it, such as the sheet a React panel sits
 * in. React's `TriggerAnchor` asks the same question.
 */
export function anchorFocusReturns(anchor: Element, panel: Element | null): boolean {
  const active = document.activeElement
  return (
    active === null ||
    active === document.body ||
    !document.contains(active) ||
    anchor.contains(active) ||
    (panel !== null && (panel.contains(active) || active.contains(panel)))
  )
}

/**
 * Sends the next focus that arrives in a closed overlay's panel back to where
 * focus is now. It asks whether the overlay is still closed when that focus
 * arrives, so a panel that opens again keeps the focus its machine gives it.
 */
function refuseLateFocus(anchor: Element, panel: HTMLElement): void {
  const held = document.activeElement
  panel.addEventListener(
    'focusin',
    () => {
      if (wasOpen.get(anchor) !== false) return
      if (held instanceof HTMLElement && held.isConnected) held.focus()
    },
    { once: true },
  )
}

export function syncTriggerAnchor(
  anchor: HTMLElement | null | undefined,
  given: object,
  open: boolean,
  returnFocus = true,
): void {
  if (!anchor) return
  const props = given as Readonly<Record<string, unknown>>
  const control = anchor.querySelector(FOCUSABLE)
  if (!(control instanceof HTMLElement)) return
  for (const attribute of ARIA) {
    const value = props[attribute]
    let next = ids(value).join(' ')
    if (attribute === 'aria-describedby') {
      const previous = addedDescription.get(control) ?? []
      const own = ids(control.getAttribute(attribute)).filter((id) => !previous.includes(id))
      const added = ids(value).filter((id) => !own.includes(id))
      addedDescription.set(control, added)
      next = [...own, ...added].join(' ')
    }
    if (next === '') control.removeAttribute(attribute)
    else control.setAttribute(attribute, next)
  }
  const before = wasOpen.get(anchor) ?? false
  wasOpen.set(anchor, open)
  if (before && !open && returnFocus) {
    const panel = document.getElementById(String(props['aria-controls'] ?? ''))
    if (anchorFocusReturns(anchor, panel)) control.focus()
    if (panel !== null) refuseLateFocus(anchor, panel)
  }
}

/** The prop names a framework gives the `focusin` and `focusout` handlers. */
export interface FocusHandlerNames {
  readonly focusIn: string
  readonly focusOut: string
}

/**
 * The anchor's own props: the machine's trigger props without the ARIA the
 * control carries. A machine's focus handlers listen for the control's focus,
 * which reaches the anchor as `focusin` and `focusout`, because `focus` and
 * `blur` do not bubble. `focus` names those handlers the way the framework
 * spells them: `onFocusin` in Vue's and Svelte's normalized props, `onFocusIn`
 * in Solid's.
 */
export function anchorProps(
  props: object,
  focus: FocusHandlerNames = { focusIn: 'onFocusin', focusOut: 'onFocusout' },
): Record<string, unknown> {
  const own: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if ((ARIA as readonly string[]).includes(name) || name === 'type') continue
    const key = name === 'onFocus' ? focus.focusIn : name === 'onBlur' ? focus.focusOut : name
    own[key] = value
  }
  return own
}
