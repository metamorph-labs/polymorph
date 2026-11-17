/**
 * Types for the modules `@polymorph/engine/vite` provides. Reference once, e.g.
 * in `src/vite-env.d.ts`: `/// <reference types="@polymorph/engine/vite-env" />`.
 */
declare module 'virtual:polymorph/theme' {
  /** The installed systems (name → default palette) and palettes. */
  export const catalogue: { systems: Record<string, string>; palettes: string[] }
  /** The system used on a first visit. */
  export const defaultSystem: string
  /** Loads a pairing's stylesheet if it is not in the main one. Await it before switching. */
  export function ensurePairing(system: string, palette: string): Promise<void>
}
