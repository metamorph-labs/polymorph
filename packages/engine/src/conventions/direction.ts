'use client'

/**
 * The reading direction of the place a member is in, which every member hands
 * to the substrate it is built on.
 *
 * A recipe mirrors by itself in a right-to-left document, because it is written
 * in logical properties. A substrate does not. Radix and Zag take the direction
 * as a value, write it on the member's root as `dir`, and read it to decide
 * what the arrow keys, a slider's track and a submenu's side mean. Given none,
 * they write `dir="ltr"`, which turns the member left to right inside a
 * right-to-left page. So each foundation reads the direction here, and each
 * member passes it on.
 *
 * The direction is the one `dir` says on the nearest element around the place,
 * so a member inside a section that says `dir="rtl"` on a left-to-right page
 * runs right to left. The `dir` a Zag machine writes on its own parts (the
 * elements that carry `data-scope`) is passed over, because it is the
 * direction a member was handed and not one the page says. A member built on
 * Radix, whose parts carry no such mark, reads from outside its own root. Given
 * no place, or a place out of the document, the direction is the one `dir`
 * says on `<body>`, or else on `<html>`. A document that sets its direction
 * only in CSS reads as left-to-right here.
 *
 * It is `ltr` where there is no document, as on a server render.
 */
export type ReadingDirection = 'ltr' | 'rtl'

/** An element whose `dir` the page says, and not one a Zag machine wrote on its part. */
const SAYS = '[dir]:not([data-scope])'

/** The direction an element's own `dir` says, or `undefined` when it says none that counts. */
function said(element: Element): ReadingDirection | undefined {
  const value = element.getAttribute('dir')?.toLowerCase()
  if (value === 'rtl' || value === 'ltr') return value
  // `auto` takes the direction from the element's text, which only the browser resolves.
  if (value === 'auto') return getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr'
  return undefined
}

/**
 * The reading direction of the place `within` is in, or of the document when
 * there is none. It reads attributes, and a computed style only for
 * `dir="auto"`, so a member can call it on every render.
 */
export function readDirection(within?: Element | null): ReadingDirection {
  if (typeof document === 'undefined') return 'ltr'
  if (within?.isConnected === true) {
    for (let at = within.closest(SAYS); at !== null; at = at.parentElement?.closest(SAYS) ?? null) {
      const direction = said(at)
      if (direction !== undefined) return direction
    }
    return 'ltr'
  }
  // A document still being parsed has no body yet.
  const places: (HTMLElement | null)[] = [document.body, document.documentElement]
  for (const element of places) {
    if (element === null) continue
    const direction = said(element)
    if (direction !== undefined) return direction
  }
  return 'ltr'
}

const listeners = new Set<() => void>()
const anywhere = new Set<() => void>()
let observer: MutationObserver | null = null

/**
 * Calls `listener` each time `dir` changes on `<html>` or `<body>`, or, with
 * `sections`, on any element of the document, until the function it returns
 * is called. The listener reads the new direction with `readDirection`. Every
 * listener shares one observer, which is released with the last of them.
 */
export function watchDirection(listener: () => void, sections = false): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  ;(sections ? anywhere : listeners).add(listener)
  if (observer === null) {
    observer = new MutationObserver((records) => {
      const own = records.some(
        (record) => record.target === document.documentElement || record.target === document.body,
      )
      for (const each of own ? [...listeners, ...anywhere] : [...anywhere]) each()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dir'],
      subtree: true,
    })
  }
  return () => {
    listeners.delete(listener)
    anywhere.delete(listener)
    if (listeners.size > 0 || anywhere.size > 0) return
    observer?.disconnect()
    observer = null
  }
}
