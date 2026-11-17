'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import { dataAttrs, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/layout/split-pane.module.css'

/**
 * Two regions on one axis, resized by a draggable or keyboard-stepped divider
 * (`design/components/split-pane.md`). It is the workbench layout: navigator
 * beside canvas, request above response.
 *
 * SplitPane shows both regions at once. Drawer shows one region that opens and
 * closes. The panes are always present, with no collapse gesture and no zero
 * position, because a pane the reader can hide is a Drawer and the vocabulary
 * already has one. There is no substrate library: a grid, a separator and the
 * WAI window-splitter keyboard pattern are small enough to implement directly.
 *
 * The unit is a ratio, never pixels, because a proportion holds across every
 * resize and every container. The px floors are the one place pixels fit,
 * because "the navigator is unusable below 240px" is a fact about content. The
 * floors apply twice. CSS `minmax()` draws them whatever the ratio prop says,
 * and the interaction clamps to the same numbers, so the separator never
 * reports a position it cannot paint.
 */

export type SplitPaneOrientation = 'horizontal' | 'vertical'

export interface SplitPaneProps {
  /** The first pane in reading order: inline-start, or block-start when stacked. */
  start: ReactNode
  /** The second pane. */
  end: ReactNode
  /** The separator's accessible name, such as "Resize navigator" rather than "Divider". */
  label: string
  /** The axis of the panes; `horizontal` means side by side, as in Stepper. */
  orientation?: SplitPaneOrientation
  /** The start pane's share, 0–1, controlled like Slider's value. */
  ratio?: number
  defaultRatio?: number
  onRatioChange?: (ratio: number) => void
  /**
   * Fires on release and after each keyboard step, like Slider's `onCommit`, so
   * apps can persist the layout without debouncing `onRatioChange`.
   */
  onCommit?: (ratio: number) => void
  /** Content floors in px, drawn by `minmax()` and respected by the keyboard clamp. */
  startMin?: number
  endMin?: number
}

/** Arrow steps in ratio space: 2 of 100 per press, 10 per page. */
const STEP = 0.02
const PAGE_STEP = 0.1

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Rounds the ratio to four decimals. That is finer than any pane can paint,
 * and coarse enough that 2% steps land on 2% marks instead of floating-point
 * error. `0.5 - 0.02` is not `0.48` as a double, and `onCommit` publishes this
 * number.
 */
const quantize = (value: number) => Math.round(value * 10000) / 10000

export function SplitPane({
  start,
  end,
  label,
  orientation = 'horizontal',
  ratio: controlled,
  defaultRatio = 0.5,
  onRatioChange,
  onCommit,
  startMin = 0,
  endMin = 0,
}: SplitPaneProps) {
  const horizontal = orientation === 'horizontal'
  const rootRef = useRef<HTMLDivElement>(null)
  const startId = useId()

  // Mirrored, not owned, as in Slider. The mirror lets an uncontrolled pane
  // still publish `aria-valuenow` and paint its tracks.
  const [mirror, setMirror] = useState(() => clampUnit(defaultRatio))
  const ratio = clampUnit(controlled ?? mirror)

  const [dragging, setDragging] = useState(false)

  /**
   * The value a release commits: the last position the pointer reached. It is
   * a ref, not the render-scope value, because a `pointermove` and its
   * `pointerup` can arrive in one batch. Otherwise the release would commit the
   * ratio from the render before the final move. `move()` writes it when the
   * pointer moves, and the effect re-syncs it when a controlled parent changes
   * the ratio.
   */
  const latest = useRef(ratio)
  useEffect(() => {
    latest.current = ratio
  }, [ratio])

  /**
   * The px floors converted to ratio space over the measured box.
   * `aria-valuemin`/`-max` publish these bounds, and every move clamps to them.
   * A ResizeObserver keeps the conversion current, because the same floors are
   * a different ratio in every container. Before the first measurement, and in
   * any box too small for both floors, the bounds fall back to the whole range.
   * CSS `minmax()` still draws the floors, so nothing unlawful is painted; the
   * separator is briefly more permissive than the paint.
   */
  const [bounds, setBounds] = useState({ min: 0, max: 1 })
  useEffect(() => {
    const node = rootRef.current
    if (node === null) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      const divider = node.querySelector('[role="separator"]')?.getBoundingClientRect()
      const size = horizontal ? rect.width : rect.height
      const usable =
        size - (divider === undefined ? 0 : horizontal ? divider.width : divider.height)
      if (usable <= 0 || startMin + endMin >= usable) {
        setBounds({ min: 0, max: 1 })
        return
      }
      setBounds({ min: clampUnit(startMin / usable), max: clampUnit(1 - endMin / usable) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [horizontal, startMin, endMin])

  const clamp = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value))

  function move(next: number) {
    const clamped = quantize(clamp(clampUnit(next)))
    if (clamped === latest.current) return
    latest.current = clamped
    setMirror(clamped)
    onRatioChange?.(clamped)
  }

  /**
   * Captures one pointer, so the divider follows that pointer wherever it goes.
   * Each move computes from the live rect rather than a stored offset, so a
   * container that resizes mid-drag (a window edge, a neighbouring pane) cannot
   * leave the divider behind.
   */
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // A pointer that lifted before this handler ran cannot be captured. Its
    // drag is already over, and the up event that ends it is still pending.
    // The drag state starts either way; capture is optional.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* an inactive pointer; nothing to capture */
    }
    setDragging(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const node = rootRef.current
    if (node === null) return
    const rect = node.getBoundingClientRect()
    const divider = event.currentTarget.getBoundingClientRect()
    const thickness = horizontal ? divider.width : divider.height
    const usable = (horizontal ? rect.width : rect.height) - thickness
    if (usable <= 0) return
    // The divider's centre is the position under the pointer.
    const rtl = horizontal && getComputedStyle(node).direction === 'rtl'
    const along = horizontal
      ? rtl
        ? rect.right - event.clientX
        : event.clientX - rect.left
      : event.clientY - rect.top
    move((along - thickness / 2) / usable)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
    onCommit?.(latest.current)
  }

  /**
   * The WAI window-splitter keys, on the split axis only. The cross-axis arrows
   * do nothing, so a reader can scroll past without the layout moving. Every
   * step commits, because a keyboard step is also a release.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rtl = horizontal && getComputedStyle(event.currentTarget).direction === 'rtl'
    const grow = horizontal ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown'
    const shrink = horizontal ? (rtl ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp'

    let next: number
    switch (event.key) {
      case grow:
        next = ratio + STEP
        break
      case shrink:
        next = ratio - STEP
        break
      case 'PageUp':
        next = ratio + PAGE_STEP
        break
      case 'PageDown':
        next = ratio - PAGE_STEP
        break
      case 'Home':
        next = bounds.min
        break
      case 'End':
        next = bounds.max
        break
      default:
        return
    }
    event.preventDefault()
    move(next)
    onCommit?.(latest.current)
  }

  const effective = clamp(ratio)

  // The spec's `agent` fence. The position is the start pane's share in percent, as the
  // separator reports it, and `set` moves the divider as a drag does and commits, as a key press
  // does, within the same bounds.
  const dividerRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'SplitPane',
    element: () => dividerRef.current,
    state: () => ({ position: Math.round(effective * 100) }),
    actions: {
      set: {
        argument: 'number',
        run: (percent) => {
          move(percent / 100)
          onCommit?.(latest.current)
        },
      },
    },
  })

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-orientation={orientation}
      /*
       * Data-driven custom properties, as in chart-tip: the ratio as an `fr`
       * pair and the floors as px. Only this pattern's stylesheet reads them.
       * Everything aesthetic stays in the stylesheet under the token law.
       */
      style={
        {
          '--pm-split-start': `${effective}fr`,
          '--pm-split-end': `${1 - effective}fr`,
          '--pm-split-start-min': `${startMin}px`,
          '--pm-split-end-min': `${endMin}px`,
        } as CSSProperties
      }
      {...memberAttr('SplitPane')}
    >
      <div className={styles.pane} id={startId}>
        {start}
      </div>
      <div
        ref={dividerRef}
        // The part hook the conformance runner locates the divider by, so its
        // role, tab stop and value are checked rather than used to find it.
        data-split-pane-part="divider"
        role="separator"
        tabIndex={0}
        aria-label={label}
        /*
         * ARIA names the orientation of the divider line, which is the opposite
         * of the prop: the separator between side-by-side panes is a vertical
         * line. A test pins this inversion so nobody mistakes it for a bug.
         */
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-controls={startId}
        aria-valuenow={Math.round(effective * 100)}
        aria-valuemin={Math.round(bounds.min * 100)}
        aria-valuemax={Math.round(bounds.max * 100)}
        className={styles.divider}
        {...dataAttrs({ state: dragging ? 'dragging' : undefined })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      <div className={styles.pane}>{end}</div>
    </div>
  )
}
