import {
  getCurrentInstance,
  getCurrentScope,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
  type ShallowRef,
} from 'vue'

import { readThemeValues, UNTHEMED_VALUES, watchTheme, type ThemeValues } from '@polymorph/engine'

import { isHydrating } from './hydration'

/**
 * The theme as data, kept current (`readThemeValues` in `@polymorph/engine`
 * says what it holds). It is for another library's component inside a
 * `<ThirdParty>` boundary that takes its colours, radii, type and spacing
 * through a JavaScript API. The ref holds a new object each time the pairing,
 * the mode, the density, a scope or the reading direction changes, so a
 * `watch` on it, a computed value and the render that read it run again then.
 *
 * `scope` is a template ref (or a getter) for an element inside the region
 * the component is drawn in. Its values are read from that element, so a
 * density or tone scope around it is seen. Without one the values are the
 * document root's.
 *
 * On a server render every colour is the empty string and every number 0,
 * and `themed` is false. A component being hydrated starts from the same, so
 * its first render is the server's, and holds the document's values once it
 * has mounted. A component mounted in the browser reads the document at once.
 *
 * Called in a component's setup, the ref follows the theme from the mount to
 * the unmount. Called in an effect scope outside a component, it follows the
 * theme from the call until the scope stops. Called outside both, it holds
 * the reading taken at the call and no other, because nothing mounts and
 * nothing ends. Vue warns in development that the lifecycle hooks have no
 * component, as it does for `useDirection` and `useMediaQuery`.
 */
export function useThemeValues(
  scope?: MaybeRefOrGetter<Element | null | undefined>,
): ShallowRef<ThemeValues> {
  const read = () => readThemeValues(() => toValue(scope))
  const values = shallowRef<ThemeValues>(isHydrating() ? UNTHEMED_VALUES : read())
  let release: (() => void) | undefined
  const update = () => {
    values.value = read()
  }
  if (getCurrentInstance() === null && getCurrentScope() !== undefined) {
    // An effect scope has no mount, so it follows from here. The reading above is still current.
    release = watchTheme(update)
    onScopeDispose(() => release?.())
    return values
  }
  // Outside a component Vue registers neither hook and warns for each.
  onMounted(() => {
    update()
    release = watchTheme(update)
  })
  onBeforeUnmount(() => release?.())
  return values
}
