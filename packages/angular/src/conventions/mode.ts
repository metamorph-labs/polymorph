import { DestroyRef, inject, signal, type Signal } from '@angular/core'

import { readMode, watchMode, type ModeReading } from '@polymorph/engine'

/**
 * The document's colour mode, as a signal kept current until the component is
 * destroyed (`readMode` in `@polymorph/engine` says what it holds): the
 * preference, `light`, `dark` or `system`, and the mode it resolves to. Call it
 * in an injection context. The signal holds a new reading after each
 * `setMode`, from any caller, and when the OS's mode changes while `system` is
 * applied, so a template, an `effect` or a `computed` that reads it runs again
 * then. An application sets the mode with the runtime's `setMode`, which this
 * package re-exports.
 *
 * A server stores no preference, so on a server render the reading is
 * `system` and `light` (`SERVER_MODE`). The first render in the browser reads
 * the document.
 */
export function useMode(): Signal<ModeReading> {
  // Injected before anything is subscribed: outside an injection context this throws, and a
  // listener taken before it would have nothing to release it.
  const destroyed = inject(DestroyRef)
  const reading = signal<ModeReading>(readMode())
  destroyed.onDestroy(watchMode(() => reading.set(readMode())))
  return reading.asReadonly()
}
