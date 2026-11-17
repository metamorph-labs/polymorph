/**
 * An element's content box, measured in whole pixels and kept up to date.
 *
 * Width is measured, never scaled. A chart stretched by `viewBox` scales its
 * labels and stroke widths with the container, so a 2px hairline stops being
 * 2px. The plot lays out in real pixels at the measured size and lays out
 * again on resize. `Sparkline` is the one chart scaled by `viewBox`, because it
 * has no text.
 *
 * A member's box is `null` until the first measurement. The frame renders that
 * state instead of waiting: it draws at full height with axes, legend and twin
 * in place and an empty plot, so nothing reflows when the marks appear.
 *
 * The functions read the document only when called, so the module imports in
 * plain Node. React's `useMeasuredBox` observes through `observeBox`; a
 * described member measures with `measureBox` from an effect that runs again
 * when the plot's size changes.
 */

export interface MeasuredBox {
  width: number
  height: number
}

/** A box before its first measurement, typed as a box a member holds. */
export const UNMEASURED: MeasuredBox | null = null

/**
 * Whether two boxes have the same size. A member keeps the box it has when a
 * measurement repeats it, so a renderer that compares by identity draws once.
 */
export function sameBox(a: MeasuredBox | null, b: MeasuredBox | null): boolean {
  return a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height)
}

/**
 * The element's box now, or `previous` when the size has not changed.
 *
 * It reads the layout box (`clientWidth`, `clientHeight`), which a transform
 * does not change. `getBoundingClientRect` includes an ancestor's transform,
 * so a chart in an overlay's entrance (`scale(0.94)`) would lay out at 94% of
 * its cell. The layout box is in whole pixels, which the plot needs: a
 * fractional plot puts no hairline on the pixel grid. The plot cell has no
 * padding, no border and no scrollbar, so its layout box is its content box.
 */
export function measureBox(element: Element, previous: MeasuredBox | null = null): MeasuredBox {
  const box = { width: element.clientWidth, height: element.clientHeight }
  return previous !== null && sameBox(previous, box) ? previous : box
}

/**
 * Observes an element's box: calls `onBox` with the first measurement now, and
 * again whenever the size changes. Returns the release that stops observing.
 *
 * Each change is measured with `measureBox`, the function a described member
 * calls from its resize effect, so every renderer lays out at the same size.
 * Where there is no `ResizeObserver` (jsdom), the first measurement still
 * arrives, so a frame is testable there, and nothing follows.
 */
export function observeBox(element: Element, onBox: (box: MeasuredBox) => void): () => void {
  let current = measureBox(element)
  onBox(current)
  if (typeof ResizeObserver === 'undefined') return () => undefined
  const observer = new ResizeObserver(() => {
    const next = measureBox(element, current)
    if (next === current) return
    current = next
    onBox(next)
  })
  observer.observe(element)
  return () => observer.disconnect()
}
