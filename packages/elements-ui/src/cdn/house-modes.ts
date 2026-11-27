/**
 * Each house system whose `defaultMode` is `light` or `dark`, for the scripts
 * of a page with no build. The no-build build writes the map in from the
 * function that builds `prepaint.js` (`noBuildModes` in
 * `vite.build.config.ts`), so the two carry the same map, and
 * `packaging.test.ts` holds the built files to it.
 *
 * Nothing on such a page calls `hydrateTheme`, so each script hands this map
 * to the theme runtime's `hydrateMode` as it runs. The runtime then holds the
 * preference the pre-paint script applied, which a `<poly-mode-switch>` shows,
 * and follows the device while that preference is `system`.
 */
declare const __PM_HOUSE_MODES__: Readonly<Record<string, 'light' | 'dark'>>

export const HOUSE_MODES = __PM_HOUSE_MODES__
