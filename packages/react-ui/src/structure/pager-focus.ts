'use client'

import { useLayoutEffect, useRef, type FocusEvent } from 'react'

/**
 * One control of a pager, by what it does: a direction, the append form's
 * action, or a page number. A pager may draw a control again as a new element
 * (a page of another window), so a control is remembered by this name.
 */
export type PagerControl = string | number

/**
 * A pager's controls in the document: its buttons, and the links it draws for
 * them when the app gives addresses (`pager-link.tsx`).
 */
const CONTROLS = 'button, a[href]'

/** The pager's element that has focus, and the control it draws, if it is one. */
interface Focused {
  element: HTMLElement
  control: PagerControl | undefined
}

/**
 * Where focus goes when the app holds a pager (`design/components/pagination.md`
 * and `cursor-pagination.md`, A11y). Pagination and CursorPagination share it.
 *
 * A hold disables the pager's buttons, and a browser takes focus from a button
 * as it is disabled: the page has it, and no control does. So when a hold
 * disables the button that has focus, the pager moves focus to its root, the
 * `<nav>`. The reader stays in the pager and hears its name, and the next Tab
 * goes on from it. A hold that begins while focus is elsewhere moves nothing.
 *
 * When the hold ends and focus is still on the root, focus returns to the
 * control it was taken from. An app that holds the pager while each page loads
 * would otherwise leave the reader to move back to the button after every
 * page. A control that is no longer drawn, or is still disabled, takes no
 * focus, and focus stays on the root: the nearest enabled control does
 * something else (Previous, when Next has run out), and a reader who presses
 * again would do that instead.
 *
 * A control the app gave an address is a link while it can be followed and a
 * button otherwise, so a press, a hold or a busy window draws it again as a
 * new element, and the browser gives focus to the page as the old one leaves.
 * Focus follows the control to its new element when the element that had it
 * left in the same update, the page has focus, and the control is still drawn.
 * A new element that is disabled is treated as a button the update disabled:
 * under a hold, focus moves to the root.
 *
 * The pager remembers which of its elements has focus, because Chromium has
 * moved focus to the page by the time the effect runs, and focus on the page
 * does not say where it was. The element is remembered, not only that
 * one had focus: a button that left the document (the append form's action
 * when its list runs out) is not one the hold disabled, and focus stays with
 * the browser there. It also remembers the element's control, because an
 * element that left the document is no longer among the controls.
 *
 * `controls` names the pager's controls in document order, one name for each
 * `<button>` and each link under the root.
 *
 * Returns the root's props: its ref, the `tabIndex` that lets a script focus
 * it without making it a tab stop, and the two focus handlers.
 */
export function usePagerFocus(held: boolean, controls: readonly PagerControl[]) {
  const root = useRef<HTMLElement>(null)
  const focused = useRef<Focused | null>(null)
  // The control the hold took focus from, until the hold ends.
  const taken = useRef<PagerControl | null>(null)

  // After every commit and before paint, so focus has moved before the browser
  // shows the disabled button. It runs without dependencies because a button
  // is disabled by more than `held`: a window that arrives under a hold
  // disables the direction that was busy.
  useLayoutEffect(() => {
    const pager = root.current
    const drawn = () => [...(pager?.querySelectorAll<HTMLElement>(CONTROLS) ?? [])]
    const onPage = () => document.activeElement === null || document.activeElement === document.body

    // The element that had focus left the document in this update. A control
    // drawn again as a new element takes focus; one that is no longer drawn
    // leaves it with the browser.
    const left = focused.current
    if (pager !== null && left !== null && !left.element.isConnected) {
      focused.current = null
      const control = left.control
      const now = control === undefined ? undefined : drawn()[controls.indexOf(control)]
      if (now !== undefined && onPage()) {
        if (now.matches(':disabled')) focused.current = { element: now, control }
        else now.focus()
      }
    }

    if (!held) {
      // The hold is over, and the pager decides once. Focus that is not on the
      // root is where the reader put it, and it stays.
      const control = taken.current
      taken.current = null
      if (control === null || pager === null || document.activeElement !== pager) return
      const element = drawn()[controls.indexOf(control)]
      if (element !== undefined && !element.matches(':disabled')) element.focus()
      return
    }

    const from = focused.current?.element ?? null
    if (pager === null || from === null) return
    if (!from.isConnected || !from.matches(':disabled')) return
    // Focus is still on the disabled button, which Firefox and WebKit report
    // just after it is disabled, or on the page, which Chromium reports at
    // once. Anywhere else, the reader has moved it, and it stays.
    const active = document.activeElement
    if (active !== from && active !== null && active !== document.body) return
    taken.current = controls[drawn().indexOf(from)] ?? null
    pager.focus()
  })

  return {
    ref: root,
    tabIndex: -1,
    onFocus(event: FocusEvent<HTMLElement>) {
      const at =
        root.current === null
          ? -1
          : [...root.current.querySelectorAll(CONTROLS)].indexOf(event.target)
      focused.current = { element: event.target, control: at < 0 ? undefined : controls[at] }
    },
    // A browser blurs a button as it is disabled. That button is still the one
    // the hold took focus from, so only an enabled element's blur is forgotten.
    // Chromium also blurs an element as it leaves the document, but React's
    // events are off while it commits, so that blur does not reach this
    // handler, and the element that left is still remembered.
    onBlur(event: FocusEvent<HTMLElement>) {
      if (!event.target.matches(':disabled')) focused.current = null
    },
  }
}
