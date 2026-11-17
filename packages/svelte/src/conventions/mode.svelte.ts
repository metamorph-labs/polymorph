import { createSubscriber } from 'svelte/reactivity'

import { readMode, watchMode, type ModeReading } from '@polymorph/engine'

/**
 * The document's colour mode, kept current (`current`; `readMode` in
 * `@polymorph/engine` says what it holds): the preference, `light`, `dark` or
 * `system`, and the mode it resolves to. Read in an `$effect`, a `$derived` or
 * the template, `current` is a new reading after each `setMode`, from any
 * caller, and when the OS's mode changes while `system` is applied, and what
 * read it runs again then. Read anywhere else, it is the reading now. An
 * application sets the mode with the runtime's `setMode`, which this package
 * re-exports.
 *
 * A server stores no preference, so on a server render the reading is
 * `system` and `light` (`SERVER_MODE`). The first render in the browser reads
 * the document.
 */
export function useMode(): { readonly current: ModeReading } {
  const subscribe = createSubscriber(watchMode)
  return {
    get current() {
      subscribe()
      return readMode()
    },
  }
}
