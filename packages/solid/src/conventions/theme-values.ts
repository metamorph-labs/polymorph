import { createSignal, getOwner, onCleanup, onMount, sharedConfig, type Accessor } from 'solid-js'

import { readThemeValues, UNTHEMED_VALUES, watchTheme, type ThemeValues } from '@polymorph/engine'

/**
 * The theme as data, kept current while the owner lives (`readThemeValues` in
 * `@polymorph/engine` says what it holds). It is for another library's
 * component inside a `<ThirdParty>` boundary that takes its colours, radii,
 * type and spacing through a JavaScript API. The accessor gives a new object
 * each time the pairing, the mode, the density, a scope or the reading
 * direction changes, so an effect, a memo or the JSX that calls it runs again
 * then.
 *
 * `scope` returns an element inside the region the component is drawn in
 * (`() => element`, for an element taken with `ref`). Its values are read from
 * that element, so a density or tone scope around it is seen. Without one the
 * values are the document root's.
 *
 * On a server render every colour is the empty string and every number 0,
 * and `themed` is false. A component being hydrated (`sharedConfig.context` is
 * set) starts from the same, so its first render is the server's, and holds
 * the document's values once it has mounted. A component created in the
 * browser outside a hydration reads the document at once.
 *
 * Called under an owner, which a component and a `createRoot` both give, the
 * accessor follows the theme from the mount until the owner is disposed.
 * Called under no owner, it follows the theme and nothing releases it. Solid
 * warns in development that the computation will never be disposed, as it
 * does for `useDirection` and `useMediaQuery`.
 */
export function useThemeValues(scope?: () => Element | null | undefined): Accessor<ThemeValues> {
  const read = () => readThemeValues(scope)
  // A new object is a change: the values inside it are what moved.
  const [values, setValues] = createSignal<ThemeValues>(
    sharedConfig.context ? UNTHEMED_VALUES : read(),
    { equals: false },
  )
  let release: (() => void) | undefined
  const update = () => setValues(read)
  // Under no owner Solid still runs this, and warns here.
  onMount(() => {
    update()
    release = watchTheme(update)
  })
  if (getOwner() !== null) onCleanup(() => release?.())
  return values
}
