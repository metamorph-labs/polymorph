/**
 * Tooltip's delays, set once for every framework (`design/components/tooltip.md`).
 * A tooltip waits half a second before it appears, and a reader moving along a
 * toolbar does not wait again at each control: within the skip delay of one
 * tooltip closing, the next opens at once. HoverCard opens and closes on the
 * same two values.
 *
 * Delay is interaction design rather than motion, so it does not scale with
 * temperament and `none` does not remove it.
 */
export const TOOLTIP_DELAY_MS = 500
export const TOOLTIP_SKIP_DELAY_MS = 250

/**
 * Whether the focused element is inside a tooltip's anchor and has focus the
 * keyboard gave it (`:focus-visible`). A tooltip that keyboard focus opened
 * stays open while this holds (`design/components/tooltip.md`, A11y): it
 * closes when focus leaves, on Escape, or on a press.
 */
export function keyboardHolds(anchor: Element | null | undefined): boolean {
  if (anchor == null || typeof document === 'undefined') return false
  const focused = document.activeElement
  return focused !== null && anchor.contains(focused) && focused.matches(':focus-visible')
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
