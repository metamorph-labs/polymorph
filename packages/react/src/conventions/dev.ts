'use client'

import { createWarningLog } from '@polymorph/engine/charts'
import { useEffect, useState } from 'react'

/**
 * Dev-time warnings for laws a type cannot express.
 *
 * The vocabulary's default is to make an unlawful call a type error. The
 * engine's `conventions/variants.ts` does that for variants so an invalid one is not a
 * runtime warning that nobody reads. This hook covers what types cannot: laws
 * about the relationship between two props that are each lawful alone. Select's
 * empty choice is one. `placeholder` and `emptyOption` are each valid but
 * meaningless together. Expressing that in the type would split the component's
 * public shape into many overloads to prevent one rare mistake.
 *
 * The check runs in an effect, not in render, so the message appears once per
 * mount instead of once per render, and a mounted component pays nothing on
 * later renders.
 *
 * `process.env.NODE_ENV` is written as the bare member expression that every
 * bundler replaces, as React's own development-only code does. That lets the
 * whole body drop out of a production build. It is declared locally, not
 * globally, because this package and the vocabulary both compile with no
 * ambient environment types (see `css-modules.d.ts`).
 */

declare const process: { env: { NODE_ENV?: string } }

export function useDevWarning(unlawful: boolean, message: string): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (unlawful) console.warn(`polymorph: ${message}`)
  }, [unlawful, message])
}

/**
 * The warnings a member's engine model reports (a chart's `warnings`), each
 * logged on its own line when it enters the list, through the engine's
 * `createWarningLog`: a message that stays in the list is not logged again
 * when another one changes. The engine decides which uses are unlawful; this
 * only says so.
 */
export function useDevWarnings(messages: readonly string[]): void {
  const [log] = useState(createWarningLog)
  const key = JSON.stringify(messages)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    log.log(JSON.parse(key) as string[], (message) => console.warn(`polymorph: ${message}`))
  }, [log, key])
}
