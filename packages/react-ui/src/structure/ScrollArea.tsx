'use client'

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { memberAttr, useDirection } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/scroll-area.module.css'

/**
 * Token-styled scrollbar for a region that already scrolls (`design/components/scroll-area.md`).
 * For regions the vocabulary already lets scroll: Table's ports, CodeBlock,
 * overlay bodies and panels.
 *
 * **It creates no scroll regions.** The scroll map is fixed: the shell's content
 * is *the* page scroller, overlay bodies scroll within their panels, and Table
 * and CodeBlock scroll sideways. ScrollArea only styles a region the map
 * allows. Using it for a second page scroller fails review against the map.
 *
 * The guardrail: **never hide that there is more.** `type` defaults to
 * `'always'`, because under `'hover'` an overflowing region shows no thumb until
 * a pointer arrives, so a glance, a touch user or a keyboard user sees a region
 * that looks complete. And a region that does not overflow draws no bar in
 * either type, through the substrate's overflow detection.
 */

export type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both'
export type ScrollAreaType = 'hover' | 'always'

/**
 * The vocabulary's `'always'` means "drawn while the region overflows", the
 * substrate's `'auto'`. The substrate's own `'always'` would draw a rail with no
 * overflow, breaking the guardrail the other way.
 */
const RADIX_TYPE = { always: 'auto', hover: 'hover' } as const

export interface ScrollAreaProps {
  /**
   * The region's content; the consumer sets the region's *size* (a Table port's
   * width, a panel's height), and ScrollArea fills the box it is given.
   */
  children: ReactNode
  /** Which axes may pan; `'both'` draws two rails and the corner. */
  orientation?: ScrollAreaOrientation
  type?: ScrollAreaType
  /**
   * Names the region for keyboard users once it overflows, as in CodeBlock.
   * Required rather than defaulted. The content identifies the region, but a
   * default name would be in one fixed language, and the app's language is
   * unknown here.
   */
  label: string
}

export function ScrollArea({
  children,
  orientation = 'vertical',
  type = 'always',
  label,
}: ScrollAreaProps) {
  // The direction of the place the member is in, which Radix would otherwise take to be
  // left-to-right.
  const root = useRef<HTMLDivElement>(null)
  const dir = useDirection(root)
  const viewport = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  /**
   * CodeBlock's rule: a tab stop (`tabindex="0"`, `role="region"`, label) only
   * while the region overflows. Re-measured when the content changes, because
   * an observer cannot see the caller swapping content. The substrate's content
   * box is observed too, because it can grow inside an unchanged outer box.
   */
  useEffect(() => {
    const node = viewport.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const measure = () =>
      setOverflowing(node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    return () => observer.disconnect()
  }, [children])

  /**
   * One rail per axis. Under `'hover'` it is force-mounted, so `hidden` (rest)
   * and `visible` (pointer) are states of one element with a CSS fade, and the
   * substrate still unmounts it when content fits. Under `'always'` it is
   * mounted exactly while the region overflows. Rail and thumb only depict the
   * platform's own scrolling.
   */
  const rail = (axis: 'vertical' | 'horizontal') => (
    <ScrollAreaPrimitive.Scrollbar
      orientation={axis}
      aria-hidden="true"
      className={`${styles.rail} ${type === 'hover' ? styles.hover : styles.always}`}
      forceMount={type === 'hover' ? true : undefined}
    >
      <ScrollAreaPrimitive.Thumb className={styles.thumb} />
    </ScrollAreaPrimitive.Scrollbar>
  )

  return (
    <ScrollAreaPrimitive.Root
      ref={root}
      dir={dir}
      type={RADIX_TYPE[type]}
      className={styles.root}
      {...memberAttr('ScrollArea')}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewport}
        className={styles.viewport}
        tabIndex={overflowing ? 0 : undefined}
        role={overflowing ? 'region' : undefined}
        aria-label={overflowing ? label : undefined}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>

      {orientation === 'horizontal' ? null : rail('vertical')}
      {orientation === 'vertical' ? null : rail('horizontal')}
      {orientation === 'both' ? (
        <ScrollAreaPrimitive.Corner aria-hidden="true" className={styles.corner} />
      ) : null}
    </ScrollAreaPrimitive.Root>
  )
}
