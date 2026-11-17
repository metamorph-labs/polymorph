'use client'

import { observeBox, type MeasuredBox } from '@polymorph/react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * An element's content box, measured and kept up to date: the engine's
 * `observeBox` (`@polymorph/engine/charts`), bound to a ref callback.
 *
 * This is separate from the pure geometry, which has no directive, because this
 * part runs on the client. `Sparkline` needs the arithmetic but not the
 * observer. A shared module with `'use client'` would pull an axis-less inline
 * glyph into the client bundle for a measurement it never makes (the
 * client-directive law checks both directions).
 *
 * The box is `null` until the first measurement; the engine's module says why
 * the frame renders that state instead of waiting.
 */
export function useMeasuredBox<T extends HTMLElement>(): {
  ref: (node: T | null) => void
  box: MeasuredBox | null
} {
  const [box, setBox] = useState<MeasuredBox | null>(null)
  const release = useRef<(() => void) | null>(null)

  const disconnect = useCallback(() => {
    release.current?.()
    release.current = null
  }, [])

  const ref = useCallback(
    (node: T | null) => {
      disconnect()
      if (node === null) return
      release.current = observeBox(node, setBox)
    },
    [disconnect],
  )

  useLayoutEffect(() => disconnect, [disconnect])

  return { ref, box }
}
