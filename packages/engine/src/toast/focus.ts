/**
 * Where focus goes when a toast that holds it leaves (`design/components/toast.md`, A11y), for
 * every framework's viewport.
 *
 * A toast leaves by its close control, its action, Escape, a swipe or a call to `toast.dismiss`.
 * Its card then plays its exit and is removed, and focus inside it would fall to the body. So
 * focus moves as the toast starts to leave: to the next toast, else the previous one, so a
 * reader who works down the stack stays in it. When no toast is left, focus goes back to the
 * element it came from as it entered the notifications (with F8 or Tab), while that element is
 * still in the document, and otherwise to the list, which F8 focuses.
 *
 * The viewport calls `noteToastEntry` as focus enters its list and the card calls
 * `focusAfterToast` as its toast starts to leave. Both read the document and no framework.
 */

/** Where focus came from as it last entered each list. */
const entries = new WeakMap<Element, HTMLElement>()

/**
 * Records where focus came from as it enters the list: call it on the list's `focusin`, with
 * the event's `relatedTarget`. A move between two toasts, or from the region's own elements,
 * keeps the record, and focus that came from nowhere clears it.
 */
export function noteToastEntry(list: Element | null | undefined, from: EventTarget | null): void {
  if (!list) return
  const region = list.closest('[role="region"]') ?? list
  if (from instanceof Node && region.contains(from)) return
  if (from instanceof HTMLElement) entries.set(list, from)
  else entries.delete(list)
}

/**
 * Moves focus off a card whose toast is leaving, when focus is in it: to the next card that is
 * staying, else the previous one, else where focus came from, else the list.
 */
export function focusAfterToast(card: Element | null | undefined): void {
  if (!card || !card.contains(card.ownerDocument.activeElement)) return
  const list = card.closest<HTMLElement>('[data-toast-part="list"]')
  if (list === null) return
  const staying = Array.from(list.querySelectorAll<HTMLElement>('[data-member="toast"]')).filter(
    (other) => other !== card && other.getAttribute('data-state') !== 'closed',
  )
  const next = staying.find(
    (other) => (card.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )
  const previous = staying
    .filter(
      (other) => (card.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
    )
    .at(-1)
  const from = entries.get(list)
  const target = next ?? previous ?? (from?.isConnected === true ? from : list)
  target.focus()
}
