/**
 * The landing page's screen spec and what the emitter writes from it, built by
 * the `emittedScreen` plugin in `vite.config.ts`.
 */
declare module 'virtual:polymorph-docs/emitted-screen' {
  /** The spec's JSON text, as the file holds it. */
  export const SCREEN_SPEC: string
  /** The emitted source for each web framework the emitter writes. */
  export const EMITTED: Readonly<Record<'react' | 'vue' | 'svelte' | 'solid' | 'angular', string>>
}

/**
 * The facts the landing page states, counted from the registry by the
 * `registryCounts` plugin in `vite.config.ts`.
 */
declare module 'virtual:polymorph-docs/counts' {
  export const COUNTS: Readonly<{
    /** How many members the vocabulary has. */
    components: number
    /** The web frameworks, and each platform that is not the web. */
    renderers: number
    palettes: number
  }>
  /** The designed systems' names, in the registry's order. */
  export const DESIGNED_SYSTEMS: readonly string[]
}
