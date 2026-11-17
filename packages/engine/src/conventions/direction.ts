'use client'

/**
 * The document's reading direction, which every member hands to the substrate
 * it is built on.
 *
 * A recipe mirrors by itself in a right-to-left document, because it is written
 * in logical properties. A substrate does not. Radix and Zag take the direction
 * as a value, write it on the member's root as `dir`, and read it to decide
 * what the arrow keys, a slider's track and a submenu's side mean. Given none,
 * they write `dir="ltr"`, which turns the member left to right inside a
 * right-to-left page. So each foundation reads the direction here, and each
 * member passes it on.
 *
 * The direction is the one `dir` says on `<body>`, or else on `<html>`. It is
 * the document's and not that of the place a member is mounted in: a member
 * inside an element whose `dir` differs from the document's follows the
 * document. A document that sets its direction only in CSS reads as
 * left-to-right here.
 *
 * It is `ltr` where there is no document, as on a server render.
 */
export type ReadingDirection = 'ltr' | 'rtl'

/**
 * The document's reading direction now. It reads two attributes, and a
 * computed style only for `dir="auto"`, so a member can call it on every render.
 */
export function readDirection(): ReadingDirection {
  if (typeof document === 'undefined') return 'ltr'
  // A document still being parsed has no body yet.
  const places: (HTMLElement | null)[] = [document.body, document.documentElement]
  for (const element of places) {
    if (element === null) continue
    const said = element.getAttribute('dir')?.toLowerCase()
    if (said === 'rtl' || said === 'ltr') return said
    // `auto` takes the direction from the element's text, which only the browser resolves.
    if (said === 'auto') return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr'
  }
  return 'ltr'
}

const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

/**
 * Calls `listener` each time `dir` changes on `<html>` or `<body>`, until the
 * function it returns is called. The listener reads the new direction with
 * `readDirection`. Every listener shares one observer, which is released with
 * the last of them.
 */
export function watchDirection(listener: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  listeners.add(listener)
  if (observer === null) {
    observer = new MutationObserver(() => {
      for (const each of [...listeners]) each()
    })
    const places: (HTMLElement | null)[] = [document.documentElement, document.body]
    for (const element of places) {
      if (element !== null) {
        observer.observe(element, { attributes: true, attributeFilter: ['dir'] })
      }
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    observer?.disconnect()
    observer = null
  }
}
