import { MediaQuery } from 'svelte/reactivity'

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
 * Whether a named media query matches, kept current (`current`). It is `false`
 * where there is no window, as on a server render.
 */
export function useMediaQuery(name: MediaQueryName): { readonly current: boolean } {
  return new MediaQuery(MEDIA_QUERIES[name], false)
}
