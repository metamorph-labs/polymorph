'use client'

import { useSyncExternalStore } from 'react'

import { readMode, SERVER_MODE, watchMode, type ModeReading } from '@polymorph/engine'

const onServer = (): ModeReading => SERVER_MODE

/**
 * The document's colour mode, kept current (`readMode` in `@polymorph/engine`
 * says what it holds): the preference, `light`, `dark` or `system`, and the
 * mode it resolves to. A component renders again after each `setMode`, from
 * any caller, and when the OS's mode changes while `system` is applied. An
 * application sets the mode with the runtime's `setMode`, which this package
 * re-exports.
 *
 * A server stores no preference, so on a server render the reading is
 * `system` and `light` (`SERVER_MODE`). React reads the same while it hydrates
 * the server's markup, and renders again with the document's reading once it
 * has hydrated, so the markup matches.
 */
export function useMode(): ModeReading {
  return useSyncExternalStore(watchMode, readMode, onServer)
}
