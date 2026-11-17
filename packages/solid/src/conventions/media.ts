import { createSignal, getOwner, onCleanup, onMount, sharedConfig, type Accessor } from 'solid-js'

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
 * Whether a named media query matches, kept current while the owner lives. It
 * is `false` on a server render, where there is no window, and while the member
 * is being hydrated (`sharedConfig.context` is set), so a hydrated member's
 * first render is the server's; it reads the query once the member has mounted
 * and follows it after. A member created in the browser outside a hydration
 * reads the query at once, so a phone's first render is already the phone's,
 * as React reads its server snapshot only while it hydrates.
 */
export function useMediaQuery(name: MediaQueryName): Accessor<boolean> {
  const query = MEDIA_QUERIES[name]
  const [matches, setMatches] = createSignal(
    !sharedConfig.context && typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  let list: MediaQueryList | null = null
  const update = () => setMatches(list?.matches ?? false)
  onMount(() => {
    list = window.matchMedia(query)
    update()
    list.addEventListener('change', update)
  })
  if (getOwner() !== null) onCleanup(() => list?.removeEventListener('change', update))
  return matches
}
