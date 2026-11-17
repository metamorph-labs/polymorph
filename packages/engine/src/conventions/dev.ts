/**
 * A development warning for a law a type cannot express, the counterpart of
 * the React foundation's `useDevWarning` for a framework that is not React. A
 * member calls it from an effect, so the message appears once per mount and
 * again when the condition changes, not once per render.
 *
 * `process.env.NODE_ENV` is written as the bare member expression that every
 * application bundler replaces, so the body drops out of the application's
 * production build. The engine's own library build leaves it in place, because
 * the application decides which build it is. It is declared locally, because
 * the engine compiles with no ambient environment types.
 */

declare const process: { env: { NODE_ENV?: string } }

export function devWarning(unlawful: boolean, message: string): void {
  if (process.env.NODE_ENV === 'production') return
  if (unlawful) console.warn(`polymorph: ${message}`)
}
