import {
  getCurrentInstance,
  getCurrentScope,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  shallowRef,
  type ShallowRef,
} from 'vue'

import { readMode, SERVER_MODE, watchMode, type ModeReading } from '@polymorph/engine'

import { isHydrating } from './hydration'

/**
 * The document's colour mode, kept current (`readMode` in `@polymorph/engine`
 * says what it holds): the preference, `light`, `dark` or `system`, and the
 * mode it resolves to. The ref holds a new reading after each `setMode`, from
 * any caller, and when the OS's mode changes while `system` is applied, so a
 * `watch` on it, a computed value and the render that read it run again then.
 * An application sets the mode with the runtime's `setMode`, which this
 * package re-exports.
 *
 * A server stores no preference, so on a server render the reading is
 * `system` and `light` (`SERVER_MODE`). A component being hydrated starts from
 * the same, so its first render is the server's, and reads the document once
 * it has mounted. A component mounted in the browser reads the document at
 * once.
 *
 * Called in a component's setup, the ref follows the mode from the mount to
 * the unmount. Called in an effect scope outside a component, it follows the
 * mode from the call until the scope stops. Called outside both, it holds the
 * reading taken at the call and no other, and Vue warns in development that
 * the lifecycle hooks have no component, as it does for `useThemeValues`.
 */
export function useMode(): ShallowRef<ModeReading> {
  const reading = shallowRef<ModeReading>(isHydrating() ? SERVER_MODE : readMode())
  let release: (() => void) | undefined
  const update = () => {
    reading.value = readMode()
  }
  if (getCurrentInstance() === null && getCurrentScope() !== undefined) {
    // An effect scope has no mount, so it follows from here. The reading above is still current.
    release = watchMode(update)
    onScopeDispose(() => release?.())
    return reading
  }
  onMounted(() => {
    update()
    release = watchMode(update)
  })
  onBeforeUnmount(() => release?.())
  return reading
}
