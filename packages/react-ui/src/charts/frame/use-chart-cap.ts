'use client'

import { readChartCap } from '@polymorph/react'
import { useCallback, useState } from 'react'

/**
 * The palette's any-neighbour series cap, read from the member's plot surface
 * when the surface mounts: the engine's `readChartCap`
 * (`@polymorph/engine/charts`), which says why it reads the palette and not a
 * number, and why reading it when the marks appear is enough.
 */
export function useChartCap(): {
  capRef: (node: HTMLElement | null) => void
  cap: number | null
} {
  const [cap, setCap] = useState<number | null>(null)

  const capRef = useCallback((node: HTMLElement | null) => {
    if (node === null) return
    setCap(readChartCap(node))
  }, [])

  return { capRef, cap }
}
