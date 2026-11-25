/**
 * Where focus goes when the element that holds it, or the element it should
 * return to, has left the page: one rule for every framework's members.
 *
 * Two moments need it. An overlay returns focus to the control it was opened
 * from, and that control may be gone by the time it closes: a ConfirmDialog's
 * confirm deletes the row its trigger was in. And a region that holds focus
 * may unmount: an Alert, a Banner or an ArtifactPane closed from its own
 * control. In both cases the browser moves focus to the body, and a keyboard
 * reader starts again from the top of the page.
 *
 * The rule: the first focusable element after where the element was, else the
 * last one before it, else the page's `main`. "Where it was" is recorded while
 * the element is in the document (`focusPlace`), as the chain of its ancestors
 * with the siblings beside each. When the element is gone, the place is the
 * gap it left in the nearest ancestor still in the document, so the elements
 * around it are read as they are when focus moves, not as they were.
 *
 * It touches the document only when called.
 */

interface Step {
  readonly node: Node
  readonly parent: Node
  readonly next: Node | null
  readonly previous: Node | null
}

/** Where an element sat in the document when it was recorded. */
export interface FocusPlace {
  readonly element: Element
  /** From the element up to the body: each node, the parent it was in, and its siblings then. */
  readonly path: readonly Step[]
}

/** A point between two nodes: before `before` in `parent`, or at the end of `parent`. */
interface Gap {
  readonly parent: Node
  readonly before: Node | null
}

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(', ')

/** Records where an element is. The body and the document's root have no place. */
export function focusPlace(element: Element | null | undefined): FocusPlace | null {
  if (!element || !element.isConnected) return null
  const top = element.ownerDocument
  if (element === top.body || element === top.documentElement) return null
  const path: Step[] = []
  let node: Node = element
  while (node.parentNode !== null && node !== top.body) {
    path.push({
      node,
      parent: node.parentNode,
      next: node.nextSibling,
      previous: node.previousSibling,
    })
    node = node.parentNode
  }
  return { element, path }
}

/**
 * Whether focus can go to the element now: it is in the document, enabled,
 * drawn and outside an inert subtree. A control the reader opened an overlay
 * from passes, whether or not it is a tab stop.
 */
function canTakeFocus(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  if (element.matches(':disabled')) return false
  if (element.closest('[inert]') !== null) return false
  if (element.getClientRects().length === 0) return false
  return getComputedStyle(element).visibility !== 'hidden'
}

/** Whether a reader reaches the element with Tab. */
function tabbable(element: HTMLElement): boolean {
  return element.tabIndex >= 0 && canTakeFocus(element)
}

/** The gap the place's element left, or the point just after it while it is still there. */
function gapOf(place: FocusPlace): Gap | null {
  const { element } = place
  if (element.isConnected && element.parentNode !== null) {
    return { parent: element.parentNode, before: element.nextSibling }
  }
  // The first ancestor still in the document is where the removed subtree was.
  for (const step of place.path) {
    if (!step.parent.isConnected) continue
    if (step.next !== null && step.next.parentNode === step.parent) {
      return { parent: step.parent, before: step.next }
    }
    if (step.previous !== null && step.previous.parentNode === step.parent) {
      return { parent: step.parent, before: step.previous.nextSibling }
    }
    // Both neighbours are gone too, so the gap is the start of the ancestor.
    return { parent: step.parent, before: step.parent.firstChild }
  }
  return null
}

/** Whether a node comes at or after the gap in document order. */
function follows(node: Node, gap: Gap): boolean {
  if (gap.before !== null) {
    return (
      gap.before === node ||
      (gap.before.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    )
  }
  const at = gap.parent.compareDocumentPosition(node)
  return (
    (at & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
    (at & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0
  )
}

/**
 * The page's `main`, made focusable for the moment if it is not, because it is
 * where a reader who lost their place starts again. The `tabindex` it gains is
 * removed as focus leaves it.
 */
function pageMain(top: Document): HTMLElement | null {
  const main = top.querySelector<HTMLElement>('main, [role="main"]')
  if (main === null || !canTakeFocus(main)) return null
  if (!main.hasAttribute('tabindex')) {
    main.setAttribute('tabindex', '-1')
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true })
  }
  return main
}

/**
 * The focusable element nearest where the place's element is or was: the first
 * tab stop after it, else the last one before it, else the page's `main`. The
 * element itself and everything in `skip` are passed over: the overlay that is
 * closing, the region that is leaving.
 */
export function nearestFocusable(
  place: FocusPlace,
  skip: readonly (Element | null | undefined)[] = [],
): HTMLElement | null {
  const top = place.element.ownerDocument
  const avoid = [place.element, ...skip].filter((element): element is Element => !!element)
  const gap = gapOf(place)
  if (gap !== null) {
    const stops = Array.from(top.querySelectorAll<HTMLElement>(TABBABLE)).filter(
      (candidate) => tabbable(candidate) && !avoid.some((element) => element.contains(candidate)),
    )
    const after = stops.find((candidate) => follows(candidate, gap))
    if (after !== undefined) return after
    const before = stops.filter((candidate) => !follows(candidate, gap)).at(-1)
    if (before !== undefined) return before
  }
  return pageMain(top)
}

/**
 * Where focus returns as an overlay closes: the element it was opened from
 * while focus can go to it, else the focusable element nearest where it was.
 * `skip` is the overlay's own panel, which may still be in the document while
 * it plays its exit.
 */
export function focusReturnTarget(
  place: FocusPlace | null | undefined,
  skip: readonly (Element | null | undefined)[] = [],
): HTMLElement | null {
  if (!place) return null
  const { element } = place
  if (element instanceof HTMLElement && canTakeFocus(element)) return element
  return nearestFocusable(place, skip)
}

/** Moves focus back as an overlay closes, by `focusReturnTarget`. */
export function returnFocusTo(
  place: FocusPlace | null | undefined,
  skip: readonly (Element | null | undefined)[] = [],
): void {
  focusReturnTarget(place, skip)?.focus()
}

/**
 * Follows focus in a region that can leave the page, and returns the function
 * to call as it leaves: when it unmounts, or when the element the region is
 * replaced. If focus was in the region then, focus moves to the focusable
 * element nearest where the region was.
 *
 * Focus counts as in the region when it is inside it, or when it was inside it
 * last and is now on the body, because a framework may remove the region before
 * it runs the returned function, and the browser drops focus to the body as it
 * does. Focus that left the region for another element, or for the body while
 * the region stayed, no longer counts.
 */
export function focusAfterRemoval(region: Element | null | undefined): () => void {
  if (!region) return () => undefined
  const top = region.ownerDocument
  let place = region.contains(top.activeElement) ? focusPlace(region) : null
  const enter = (): void => {
    place = focusPlace(region)
  }
  const leave = (event: Event): void => {
    const to = (event as FocusEvent).relatedTarget
    if (to instanceof Node) {
      if (!region.contains(to)) place = null
      return
    }
    // Focus went to the body. If the region is still there a moment later, the reader put it
    // there; if it is gone, its removal did.
    setTimeout(() => {
      if (region.isConnected && !region.contains(top.activeElement)) place = null
    }, 0)
  }
  region.addEventListener('focusin', enter)
  region.addEventListener('focusout', leave)
  return () => {
    region.removeEventListener('focusin', enter)
    region.removeEventListener('focusout', leave)
    const held = place
    place = null
    if (held === null) return
    const active = top.activeElement
    const lost =
      active === null || active === top.body || (region.isConnected && region.contains(active))
    if (lost) nearestFocusable(held, [region])?.focus()
  }
}
