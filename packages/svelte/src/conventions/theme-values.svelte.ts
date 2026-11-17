import { createSubscriber } from 'svelte/reactivity'

import { readThemeValues, themeVersion, watchTheme, type ThemeValues } from '@polymorph/engine'

/**
 * The theme as data, kept current (`current`; `readThemeValues` in
 * `@polymorph/engine` says what it holds). It is for another library's
 * component inside a `<ThirdParty>` boundary that takes its colours, radii,
 * type and spacing through a JavaScript API. Read in an `$effect`, a
 * `$derived` or the template, `current` is a new object each time the pairing,
 * the mode, the density, a scope or the reading direction changes, and what
 * read it runs again then.
 *
 * `scope` returns an element inside the region the component is drawn in
 * (`() => element`, for an element bound with `bind:this`). Its values are
 * read from that element, so a density or tone scope around it is seen.
 * Without one the values are the document root's.
 *
 * The hook follows the theme only while an effect reads `current`. Read
 * anywhere else, as in an event handler or another library's callback,
 * `current` is a new reading each time, so it is never one from before a
 * change. On a server render every value is empty.
 */
export function useThemeValues(scope?: () => Element | null | undefined): {
  readonly current: ThemeValues
} {
  const subscribe = createSubscriber(watchTheme)
  let version = -1
  let values: ThemeValues | undefined
  return {
    get current() {
      // No effect means no listener, and the engine's version says nothing to a caller without one.
      if (!$effect.tracking()) return readThemeValues(scope)
      // The listener is taken before the version is read, which grows when the engine takes its first.
      subscribe()
      if (values === undefined || version !== themeVersion()) {
        version = themeVersion()
        values = readThemeValues(scope)
      }
      return values
    },
  }
}
