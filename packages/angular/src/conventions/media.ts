import { DestroyRef, inject, signal, type Signal } from '@angular/core'

/**
 * The media queries the vocabulary's specs name, by name. `phone` is the sheet
 * presentation's one breakpoint, the overlay class's own threshold, as
 * `packages/react-ui/src/overlays/sheet.tsx` reads it. A member names a query;
 * the threshold is decided here, once.
 */
export const MEDIA_QUERIES = {
  phone: '(width < 30rem)',
} as const

export type MediaQueryName = keyof typeof MEDIA_QUERIES

/**
 * Whether a named media query matches, as a signal kept current until the
 * member is destroyed. Call it in an injection context. The value is `false`
 * where there is no window, as on a server render.
 */
export function useMediaQuery(name: MediaQueryName): Signal<boolean> {
  const list = typeof window === 'undefined' ? null : window.matchMedia(MEDIA_QUERIES[name])
  const matches = signal(list?.matches ?? false)
  const update = () => matches.set(list?.matches ?? false)
  list?.addEventListener('change', update)
  inject(DestroyRef).onDestroy(() => list?.removeEventListener('change', update))
  return matches.asReadonly()
}
