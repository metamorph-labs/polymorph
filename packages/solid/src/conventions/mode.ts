import { createSignal, getOwner, onCleanup, onMount, sharedConfig, type Accessor } from 'solid-js'

import { readMode, SERVER_MODE, watchMode, type ModeReading } from '@polymorph/engine'

/**
 * The document's colour mode, kept current while the owner lives (`readMode`
 * in `@polymorph/engine` says what it holds): the preference, `light`, `dark`
 * or `system`, and the mode it resolves to. The accessor gives a new reading
 * after each `setMode`, from any caller, and when the OS's mode changes while
 * `system` is applied, so an effect, a memo or the JSX that calls it runs
 * again then. An application sets the mode with the runtime's `setMode`,
 * which this package re-exports.
 *
 * A server stores no preference, so on a server render the reading is
 * `system` and `light` (`SERVER_MODE`). A component being hydrated
 * (`sharedConfig.context` is set) starts from the same, so its first render is
 * the server's, and reads the document once it has mounted. A component
 * created in the browser outside a hydration reads the document at once.
 *
 * Called under an owner, which a component and a `createRoot` both give, the
 * accessor follows the mode from the mount until the owner is disposed. Called
 * under no owner, it follows the mode and nothing releases it, and Solid warns
 * in development, as it does for `useThemeValues`.
 */
export function useMode(): Accessor<ModeReading> {
  const [reading, setReading] = createSignal<ModeReading>(
    sharedConfig.context ? SERVER_MODE : readMode(),
  )
  let release: (() => void) | undefined
  const update = () => setReading(readMode())
  onMount(() => {
    update()
    release = watchMode(update)
  })
  if (getOwner() !== null) onCleanup(() => release?.())
  return reading
}
