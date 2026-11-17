'use client'

/**
 * Where MasterDetailPage puts focus after it draws a change
 * (`design/archetypes/master-detail-page.md`, Behaviour). Every web
 * renderer's member calls it after the document has updated, when the page
 * crosses its breakpoint or when the detail arrives or goes.
 *
 * The page moves focus only when the element that held it is no longer
 * drawn. Three facts decide that. The last element to take focus was inside
 * the page's body (`held`), which the member records from the document's
 * `focusin`. Focus is now on no element, or on the document's body, or on an
 * element that has left the document. Or it is on an element inside a part
 * the page hides: the list pane stays in the document while the detail is
 * drawn alone, and its element keeps focus until the browser lets it go.
 *
 * Focus then moves to the first element that takes it: the back control when
 * the detail is drawn alone; otherwise the list pane's current item (its
 * `aria-current`), then the first focusable element in the list pane, then
 * the list pane itself, which is focusable from a script.
 */

/** The attribute that names the page's parts, which this rule and the law read. */
export const MASTER_DETAIL_PART = 'data-master-detail-page-part'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Whether a focus event's target is inside the page's body: the member records it on `focusin`. */
export function masterDetailHolds(body: HTMLElement | null | undefined, event: Event): boolean {
  return body != null && event.target instanceof Node && body.contains(event.target)
}

/** Whether focus is on nothing a reader can reach. */
function stranded(body: HTMLElement): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) return true
  return body.contains(active) && active.closest('[hidden]') !== null
}

/** The elements that may take focus, in the order they are tried. */
function candidates(body: HTMLElement): HTMLElement[] {
  const back = body.querySelector<HTMLElement>(`[${MASTER_DETAIL_PART}="back"] button`)
  if (back !== null) return [back]
  const list = body.querySelector<HTMLElement>(`[${MASTER_DETAIL_PART}="list"]`)
  if (list === null) return []
  return [
    ...Array.from(list.querySelectorAll<HTMLElement>('[aria-current]:not([aria-current="false"])')),
    ...Array.from(list.querySelectorAll<HTMLElement>(FOCUSABLE)),
    list,
  ]
}

/**
 * Moves focus after the page has drawn a change, when the element that held
 * it is no longer drawn. `held` is whether the last element to take focus was
 * inside the page's body. An element that refuses focus (one the list hides,
 * or one that is not focusable) is passed over for the next.
 */
export function masterDetailFocus(body: HTMLElement | null | undefined, held: boolean): void {
  if (!held || body == null || !stranded(body)) return
  for (const candidate of candidates(body)) {
    candidate.focus()
    if (document.activeElement === candidate) return
  }
}
