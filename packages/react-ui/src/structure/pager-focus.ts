'use client'

import { useLayoutEffect, useRef, type FocusEvent } from 'react'

/**
 * One control of a pager, by what it does: a direction, the append form's
 * action, or a page number. A pager may draw a control again as a new element
 * (a page of another window), so a control is remembered by this name.
 */
export type PagerControl = string | number

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
 * The pager remembers which of its elements has focus, because Chromium has
 * moved focus to the page by the time the effect runs, and focus on the page
 * does not say where it was. The element is remembered, not only that
 * one had focus: a button that left the document (the append form's action
 * when its list runs out) is not one the hold disabled, and focus stays with
 * the browser there.
 *
 * `controls` names the pager's buttons in document order, one name for each
 * `<button>` under the root.
 *
 * Returns the root's props: its ref, the `tabIndex` that lets a script focus
 * it without making it a tab stop, and the two focus handlers.
 */
export function usePagerFocus(held: boolean, controls: readonly PagerControl[]) {
  const root = useRef<HTMLElement>(null)
  const focused = useRef<HTMLElement | null>(null)
  // The control the hold took focus from, until the hold ends.
  const taken = useRef<PagerControl | null>(null)

  // After every commit and before paint, so focus has moved before the browser
  // shows the disabled button. It runs without dependencies because a button
  // is disabled by more than `held`: a window that arrives under a hold
  // disables the direction that was busy.
  useLayoutEffect(() => {
    const pager = root.current
    const buttons = () => [...(pager?.querySelectorAll('button') ?? [])]

    if (!held) {
      // The hold is over, and the pager decides once. Focus that is not on the
      // root is where the reader put it, and it stays.
      const control = taken.current
      taken.current = null
      if (control === null || pager === null || document.activeElement !== pager) return
      const button = buttons()[controls.indexOf(control)]
      if (button !== undefined && !button.matches(':disabled')) button.focus()
      return
    }

    const from = focused.current
    if (pager === null || from === null) return
    if (!from.isConnected || !from.matches(':disabled')) return
    // Focus is still on the disabled button, which Firefox and WebKit report
    // just after it is disabled, or on the page, which Chromium reports at
    // once. Anywhere else, the reader has moved it, and it stays.
    const active = document.activeElement
    if (active !== from && active !== null && active !== document.body) return
    taken.current = controls[buttons().indexOf(from as HTMLButtonElement)] ?? null
    pager.focus()
  })

  return {
    ref: root,
    tabIndex: -1,
    onFocus(event: FocusEvent<HTMLElement>) {
      focused.current = event.target
    },
    // A browser blurs a button as it is disabled. That button is still the one
    // the hold took focus from, so only an enabled element's blur is forgotten.
    onBlur(event: FocusEvent<HTMLElement>) {
      if (!event.target.matches(':disabled')) focused.current = null
    },
  }
}
