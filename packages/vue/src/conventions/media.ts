import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue'

import { isHydrating } from './hydration'

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
 * Whether a named media query matches, kept current. It is `false` on a server
 * render, where there is no window, and while the member is being hydrated, so
 * a hydrated member's first render is the server's; it reads the query once
 * the member has mounted and follows it after. A member mounted in the browser
 * reads the query at once, so a phone's first render is already the phone's,
 * as React's server snapshot is read only while React hydrates.
 */
export function useMediaQuery(name: MediaQueryName): ShallowRef<boolean> {
  const query = MEDIA_QUERIES[name]
  const matches = shallowRef(
    !isHydrating() && typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  let list: MediaQueryList | null = null
  const update = () => {
    matches.value = list?.matches ?? false
  }
  onMounted(() => {
    list = window.matchMedia(query)
    update()
    list.addEventListener('change', update)
  })
  onBeforeUnmount(() => list?.removeEventListener('change', update))
  return matches
}
