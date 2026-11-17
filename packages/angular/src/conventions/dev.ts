/**
 * A development warning for a law a type cannot express, the counterpart of
 * the React foundation's `useDevWarning`. A member calls it from an effect, so
 * the message appears once per mount and again when the condition changes,
 * not once per render.
 *
 * It reads `ngDevMode`, the global Angular's own development checks read: the
 * Angular CLI defines it as `false` in a production build, so the body drops
 * out of it. It is declared here, because this package compiles with no
 * ambient environment types (see `css-modules.d.ts`).
 */

declare const ngDevMode: unknown

export function devWarning(unlawful: boolean, message: string): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return
  if (unlawful) console.warn(`polymorph: ${message}`)
}
