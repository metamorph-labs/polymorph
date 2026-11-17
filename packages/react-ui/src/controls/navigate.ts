'use client'

import type { MouseEvent } from 'react'

/**
 * The routing seam that Link, `AppShell.NavItem` and Breadcrumbs share
 * (`design/components/link.md` §Routing).
 *
 * Each takes `onNavigate(href)`. Given, a click the browser would follow in
 * this tab is the app's: the member stops the browser's navigation and calls
 * `onNavigate` with the `href` the app wrote, which the app hands to its
 * router. The member stops the navigation itself, rather than handing the app
 * the event to cancel, so the prop means the same in every renderer: an
 * Angular output emits one value and a native member has no DOM event.
 */

/**
 * Whether a click on a link would navigate this tab: the primary button, no
 * modifier key, a link that opens here, and no other handler has taken it.
 * Every other click opens a tab or a window, or saves the link, and stays the
 * browser's, as router libraries leave it.
 */
export function navigatesHere(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.getAttribute('target')
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (target === null || target === '' || target === '_self')
  )
}

/**
 * The click handler for a link that takes `onNavigate`, or `undefined` when
 * the app passed none, so the browser follows every click.
 */
export function routeClick(
  href: string,
  onNavigate: ((href: string) => void) | undefined,
): ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined {
  if (onNavigate === undefined) return undefined
  return (event) => {
    if (!navigatesHere(event)) return
    event.preventDefault()
    onNavigate(href)
  }
}
