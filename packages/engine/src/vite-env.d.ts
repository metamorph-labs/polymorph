/**
 * Types for the modules `@polymorph/engine/vite` provides. Reference once, e.g.
 * in `src/vite-env.d.ts`: `/// <reference types="@polymorph/engine/vite-env" />`.
 */
declare module 'virtual:polymorph/theme' {
  /**
   * The installed systems (name → default palette), the palettes, and each system's default
   * mode (name → `light`, `dark` or `system`), which a reader who has not chosen one wears.
   */
  export const catalogue: {
    systems: Record<string, string>
    palettes: string[]
    modes: Record<string, 'light' | 'dark' | 'system'>
  }
  /** The system used on a first visit. */
  export const defaultSystem: string
  /** Loads a pairing's stylesheet if it is not in the main one. Await it before switching. */
  export function ensurePairing(system: string, palette: string): Promise<void>
}
