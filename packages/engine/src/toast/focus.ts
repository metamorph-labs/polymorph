'use client'

import { canTakeFocus } from '../conventions/focus-after-removal'

/**
 * Where focus goes when a toast that holds it leaves (`design/components/toast.md`, A11y), for
 * every framework's viewport.
 *
 * A toast leaves by its close control, its action, Escape, a swipe, a call to `toast.dismiss`,
 * its owner's removal or a newer toast's eviction, and its card then leaves the page. Focus
 * inside the card would fall to the body. So focus moves to the next toast that is staying,
 * else the previous one, so a reader who works down the stack stays in it. When no toast is
 * staying, focus goes back to the element it came from as it entered the notifications (with
 * F8 or Tab), while focus can go to that element, and otherwise to the list, which F8 focuses.
 *
 * The rule runs at two moments. The card calls `focusAfterToast` as its toast starts to leave,
 * so focus moves before the card plays its exit. The viewport calls `followToastFocus` once for
 * its list, which records where focus entered from and, when a card that holds focus leaves the
 * page without having moved it (its owner removed the toast, or a newer toast evicted it), moves
 * focus from the body by the same rule. Both read the document and no framework.
 */

const CARD = '[data-member="toast"]'

/** Where focus came from as it last entered each list. */
const entries = new WeakMap<Element, HTMLElement>()

/** The cards in a list, in document order. */
const cardsOf = (list: Element): HTMLElement[] => Array.from(list.querySelectorAll(CARD))

/** A card is staying while it is in the page and has not started to leave (`data-state`). */
const staying = (card: Element): boolean =>
  card.isConnected && card.getAttribute('data-state') !== 'closed'

/**
 * Records where focus came from as it enters the list, from a `focusin` event's
 * `relatedTarget`. A move between two toasts, or from the region's own elements, keeps the
 * record, and focus that came from nowhere clears it.
 */
function noteEntry(list: Element, from: EventTarget | null): void {
  const region = list.closest('[role="region"]') ?? list
  if (from instanceof Node && region.contains(from)) return
  if (from instanceof HTMLElement) entries.set(list, from)
  else entries.delete(list)
}

/** The next staying card, else the previous one, else where focus entered from, else the list. */
function destination(
  list: HTMLElement,
  next: HTMLElement | undefined,
  previous: HTMLElement | undefined,
): HTMLElement {
  const from = entries.get(list)
  return next ?? previous ?? (from !== undefined && canTakeFocus(from) ? from : list)
}

/**
 * Moves focus off a card whose toast is leaving, when focus is in it: to the next card that is
 * staying, else the previous one, else where focus came from, else the list.
 */
export function focusAfterToast(card: Element | null | undefined): void {
  if (!card || !card.contains(card.ownerDocument.activeElement)) return
  const list = card.closest<HTMLElement>('[data-toast-part="list"]')
  if (list === null) return
  const others = cardsOf(list).filter((other) => other !== card && staying(other))
  const next = others.find(
    (other) => (card.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )
  const previous = others
    .filter(
      (other) => (card.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
    )
    .at(-1)
  destination(list, next, previous).focus()
}

/**
 * Follows focus in a viewport's list, and returns the function that stops. It records where
 * focus came from as it enters the list, and which card holds it. When that card leaves the
 * page while focus is on it, focus falls to the body, and this moves it on by the rule above,
 * from the cards as they were before the card left.
 *
 * It reads the page's changes, not its focus events, because a browser need not send a
 * `focusout` when it drops focus from an element that leaves.
 */
export function followToastFocus(list: HTMLElement | null | undefined): () => void {
  if (!list) return () => undefined
  const top = list.ownerDocument
  /** The card that holds focus, and the cards as they were while it was in the page. */
  let held: HTMLElement | null = null
  let order: HTMLElement[] = []
  /** Set while this moves focus from the body, which is no entry from the page. */
  let moving = false
  /** The element in the list that took focus last, until focus moves to an element outside. */
  let last: EventTarget | null = null

  const enter = (event: FocusEvent): void => {
    // A window that takes focus back gives it to the element that held it, with no
    // `relatedTarget`: that is focus coming back, not an entry from nowhere.
    const back = event.relatedTarget === null && event.target === last
    if (!moving && !back) noteEntry(list, event.relatedTarget)
    last = event.target
    held = event.target instanceof Element ? event.target.closest<HTMLElement>(CARD) : null
    order = cardsOf(list)
  }
  const leave = (event: FocusEvent): void => {
    const to = event.relatedTarget
    if (to instanceof Node) {
      if (!list.contains(to)) {
        held = null
        last = null
      }
      return
    }
    // Focus went to the body. If the card is still there a moment later, the reader put it
    // there; if it is gone, its leaving did, and the observer below has moved it on.
    const card = held
    setTimeout(() => {
      if (held === card && card?.isConnected === true && !list.contains(top.activeElement)) {
        held = null
      }
    }, 0)
  }
  const observer = new MutationObserver(() => {
    const card = held
    if (card === null) return
    if (card.isConnected) {
      order = cardsOf(list)
      return
    }
    held = null
    const active = top.activeElement
    if (active !== null && active !== top.body) return
    const at = order.indexOf(card)
    const next = order.slice(at + 1).find(staying)
    const previous = order.slice(0, Math.max(at, 0)).filter(staying).at(-1)
    moving = true
    try {
      destination(list, next, previous).focus()
    } finally {
      moving = false
    }
  })

  list.addEventListener('focusin', enter)
  list.addEventListener('focusout', leave)
  observer.observe(list, { childList: true, subtree: true })
  return () => {
    list.removeEventListener('focusin', enter)
    list.removeEventListener('focusout', leave)
    observer.disconnect()
  }
}
