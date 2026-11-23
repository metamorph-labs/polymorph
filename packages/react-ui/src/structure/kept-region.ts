'use client'

import { useLayoutEffect, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/**
 * A disclosure region that stays in the document while it is closed
 * (`keepMounted`, `design/components/accordion.md` and `collapsible.md`).
 * Accordion and Collapsible share it.
 *
 * Radix leaves a closed region's content out of the document. With
 * `forceMount` it keeps the content, and it also stops hiding the region, so
 * the member hides it with `hidden`, which takes it out of the layout, the
 * focus order and the accessibility tree.
 *
 * The region is hidden only after its close animation. The recipe plays the
 * close keyframes on the closed state, and they have no fill: hiding the
 * region at once would cut them, and leaving it unhidden would show the
 * content again when they end. So when the region closes, the member reads the
 * animations the closed state started on the region itself and hides it once
 * they have finished, or in the microtask after the commit when there are
 * none. Reduced motion, and the `none` temperament's zero durations, start none
 * that run, and no `animationend` is needed. The hide is flushed in a
 * microtask, which runs before the browser paints, so the region is never
 * painted at full height after its keyframes end. An animation interrupted by
 * opening again is replaced, and its region stays.
 *
 * Radix measures the region's height in a layout effect and writes it into the
 * region's style on its next render. Without `forceMount` the region's own
 * presence changes when it opens, which causes that render. With it, nothing
 * does, so the member renders once more when a hidden region opens, in the
 * microtask after the commit and before paint, and the open keyframes read the
 * measured height.
 *
 * A region that is closed when it mounts is hidden from the first render, so
 * a server's markup carries the content and the `hidden` attribute, and it
 * plays no close animation. Radix also holds the region's animations until
 * its first change.
 *
 * `region` is the ref the member gives the region. Returns the `hidden` to
 * give it, which is `undefined` without `keepMounted`: the default path is
 * Radix's, unchanged.
 */
export function useKeptRegion(
  region: RefObject<HTMLElement | null>,
  open: boolean,
  keepMounted: boolean,
): boolean | undefined {
  // Whether the region is shown: while it is open, and through its close animation.
  const [shown, setShown] = useState(open)

  useLayoutEffect(() => {
    if (!keepMounted || open === shown) return
    let current = true
    const settle = (next: boolean) => {
      if (current) flushSync(() => setShown(next))
    }
    if (open) {
      queueMicrotask(() => settle(true))
    } else {
      // A document with no animation model (jsdom) runs none.
      const element = region.current
      const running = (
        typeof element?.getAnimations === 'function' ? element.getAnimations() : []
      ).filter((animation) => animation.playState === 'running')
      // With none running, this settles in the microtask after the commit.
      void Promise.allSettled(running.map((animation) => animation.finished)).then(() =>
        settle(false),
      )
    }
    return () => {
      current = false
    }
  }, [region, open, keepMounted, shown])

  return keepMounted ? !open && !shown : undefined
}
