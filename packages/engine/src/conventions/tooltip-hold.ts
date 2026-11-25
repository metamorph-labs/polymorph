'use client'

/**
 * A tooltip that keyboard focus opened stays open while its control holds that
 * focus (`design/components/tooltip.md`, A11y): it closes when focus leaves, on
 * Escape, or on a press. A scroll and the pointer leaving the control do not
 * close it then.
 *
 * Whether the keyboard gave the control its focus is the input that came
 * before the focus: a key, or a press of the pointer. `:focus-visible` does
 * not say it, because a text field matches it after a click as well. So a
 * tooltip notes where each focus came from (`trackFocusOrigin`) while it is
 * mounted, and reads `:focus-visible` only for a focus that came before it
 * was noting. A press on the control that holds focus counts as the pointer's
 * from then on.
 */

type Origin = 'keyboard' | 'pointer'

/** The input that came last, and where each focus since the noting began came from. */
let last: Origin = 'keyboard'
const origins = new WeakMap<Element, Origin>()
let noting = 0

const onKey = (event: KeyboardEvent) => {
  // A shortcut with Meta, Control or Alt is not a move of focus by the keyboard.
  if (event.metaKey || event.ctrlKey || event.altKey) return
  last = 'keyboard'
}
const onPointer = (event: PointerEvent) => {
  last = 'pointer'
  // A press on the control that holds focus takes the focus over: the press closed its tooltip,
  // and a tooltip the pointer opens on it after that is the pointer's.
  const focused = document.activeElement
  if (focused !== null && event.target instanceof Node && focused.contains(event.target))
    origins.set(focused, 'pointer')
}
const onFocus = (event: FocusEvent) => {
  if (event.target instanceof Element) origins.set(event.target, last)
}

/**
 * Notes, for each element that takes focus, whether a key or a press of the
 * pointer came before it, until the function it returns is called. Every
 * caller shares one set of listeners on the document, released with the last
 * caller. A tooltip calls it when it mounts, so the focus that opens it is
 * already noted.
 */
export function trackFocusOrigin(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (noting === 0) {
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('focusin', onFocus, true)
  }
  noting += 1
  let released = false
  return () => {
    if (released) return
    released = true
    noting -= 1
    if (noting > 0) return
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('focusin', onFocus, true)
  }
}

/**
 * Whether the focused element is inside a tooltip's anchor and has focus the
 * keyboard gave it. A tooltip that keyboard focus opened stays open while this
 * holds.
 */
export function keyboardHolds(anchor: Element | null | undefined): boolean {
  if (anchor == null || typeof document === 'undefined') return false
  const focused = document.activeElement
  if (focused === null || !anchor.contains(focused)) return false
  const origin = origins.get(focused)
  return origin === undefined ? focused.matches(':focus-visible') : origin === 'keyboard'
}

/**
 * Calls `close` when an element that holds a tooltip's anchor scrolls, the
 * page included, because the bubble would then point at a control that moved
 * under a pointer that did not. It does not call it while the anchor holds
 * keyboard focus (`keyboardHolds`): a Tab to a control below the fold scrolls
 * the page a frame after the focus that opened its tooltip. Returns the
 * function that stops listening; given no anchor, it listens for nothing.
 */
export function closeTooltipOnScroll(
  anchor: Element | null | undefined,
  close: () => void,
): () => void {
  if (anchor == null || typeof window === 'undefined') return () => {}
  const onScroll = (event: Event) => {
    if (!(event.target instanceof Node) || !event.target.contains(anchor)) return
    if (!keyboardHolds(anchor)) close()
  }
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => window.removeEventListener('scroll', onScroll, { capture: true })
}

/**
 * Keeps the pointer leaving a tooltip's anchor from reaching the anchor while
 * the keyboard holds its control, so a Zag tooltip the keyboard holds stays
 * open when the pointer passes over it and leaves. The machine hears the leave
 * on the anchor itself; this stops it from the window, in the capture phase,
 * before it gets there. A leave stopped this way is sent again once focus has
 * left the control, unless the pointer is back over it, so the machine does
 * not take the pointer to be still over its trigger. It notes where focus
 * comes from while it holds (`trackFocusOrigin`). Returns the function that
 * stops holding; given no anchor, it holds nothing.
 */
export function holdTooltipFromPointer(anchor: HTMLElement | null | undefined): () => void {
  if (anchor == null || typeof window === 'undefined') return () => {}
  const untrack = trackFocusOrigin()
  let stopped = false
  let resend = false
  const onLeave = (event: PointerEvent) => {
    if (event.target !== anchor || resend || !keyboardHolds(anchor)) return
    event.stopImmediatePropagation()
    stopped = true
  }
  const onFocusOut = () => {
    if (!stopped) return
    setTimeout(() => {
      if (!stopped || keyboardHolds(anchor) || anchor.matches(':hover')) return
      stopped = false
      resend = true
      anchor.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      resend = false
    })
  }
  const onEnter = (event: PointerEvent) => {
    if (event.target === anchor) stopped = false
  }
  window.addEventListener('pointerleave', onLeave, true)
  window.addEventListener('pointerenter', onEnter, true)
  anchor.addEventListener('focusout', onFocusOut)
  return () => {
    untrack()
    window.removeEventListener('pointerleave', onLeave, true)
    window.removeEventListener('pointerenter', onEnter, true)
    anchor.removeEventListener('focusout', onFocusOut)
  }
}
