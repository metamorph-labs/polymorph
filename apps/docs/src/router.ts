import { useSyncExternalStore } from 'react'

/**
 * The same twenty-line router as the workbench, for the same reason: a handful
 * of routes and no data loading do not justify a dependency.
 */

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function navigate(path: string): void {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  for (const listener of listeners) listener()
}

/**
 * Routes in-app links in JavaScript and leaves every other click to the browser.
 *
 * One delegated listener is used instead of a handler per call site. The site's
 * links come from the vocabulary (`Link`, `Breadcrumbs`, `AppShell.NavItem`), and
 * these members forward no click handler that could call `preventDefault`.
 * `NavItem`'s `onSelect` is typed `() => void`, so a call site never sees the
 * event. Delegation keeps the anchors as real `href`s, so middle-click,
 * cmd-click, copy-link and the status bar work, while a plain click stays on the
 * page.
 *
 * The listener skips the cases the browser already handles correctly: a
 * modified click (new tab, new window, download), a secondary button, an
 * explicit `target`, an off-site URL, and the shell's `#content` skip link.
 * `navigate` ignores a path that is already current, so clicking the current
 * section again adds no history entry.
 */
export function interceptLinks(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const target = event.target
    const anchor = target instanceof Element ? target.closest('a') : null
    if (!anchor) return
    if (anchor.hasAttribute('download')) return

    const explicitTarget = anchor.getAttribute('target')
    if (explicitTarget !== null && explicitTarget !== '_self') return

    // Only a site-absolute path is routed. `#content`, `https://…` and
    // `mailto:` are left to the browser.
    const href = anchor.getAttribute('href')
    if (href === null || !href.startsWith('/') || href.startsWith('//')) return

    event.preventDefault()
    navigate(href)
  })
}

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  )
}
