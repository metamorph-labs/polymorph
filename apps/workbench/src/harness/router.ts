import { useSyncExternalStore } from 'react'

/**
 * A minimal router instead of a router dependency. The harness has a handful of routes and no
 * data loading, so it needs nothing more.
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

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  )
}
