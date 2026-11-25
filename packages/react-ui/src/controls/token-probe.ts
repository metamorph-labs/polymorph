'use client'

/**
 * Reads the value a token resolves to through the cascade, in the browser the component
 * renders in.
 *
 * Component tests must compare against this rather than the token's source text.
 * `--pm-accent-bg` is written as an OKLCH string and computed as whatever the browser
 * serialises, so a test that hardcodes either one checks a string format, not a colour.
 * Reading both sides through `getComputedStyle` lets a test check that "this button's
 * background is the accent role".
 */

function probe(
  apply: (element: HTMLElement) => void,
  read: (style: CSSStyleDeclaration) => string,
) {
  const element = document.createElement('div')
  apply(element)
  document.body.append(element)
  const value = read(getComputedStyle(element))
  element.remove()
  return value
}

/** `--pm-accent-bg` -> the computed colour, in the browser's own serialisation. */
export function tokenColor(name: string): string {
  return probe(
    (element) => {
      element.style.backgroundColor = `var(${name})`
    },
    (style) => style.backgroundColor,
  )
}

/** `--pm-control-height-md` -> the computed length, e.g. `36px`. */
export function tokenLength(name: string): string {
  return probe(
    (element) => {
      element.style.height = `var(${name})`
    },
    (style) => style.height,
  )
}

/**
 * `--pm-accent-gradient` -> whatever it painted, colour or gradient.
 *
 * The gradient roles can resolve to either, by design: in a theme without a partner hue
 * the gradient is a solid colour. So a test that read only `backgroundColor` would see
 * `none` in half the presets, and a test that read only `backgroundImage` would see it in
 * the other half. Reading whichever one the browser set lets "this fill is the accent
 * gradient role" be one assertion in every theme.
 */
export function tokenBackground(name: string): string {
  return probe(
    (element) => {
      element.style.background = `var(${name})`
    },
    (style) => (style.backgroundImage === 'none' ? style.backgroundColor : style.backgroundImage),
  )
}

/** The same read, for an element that is already in the tree. */
export function paintedBackground(element: Element): string {
  const style = getComputedStyle(element)
  return style.backgroundImage === 'none' ? style.backgroundColor : style.backgroundImage
}

/** How far past each side of an element's border box its `box-shadow` is drawn, in pixels. */
export interface ShadowReach {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * How far past each side of its border box an element's `box-shadow` is drawn: for each outer
 * layer, its blur and spread, moved by its offset. A blur fades out over the blur radius past the
 * shadow's edge, so that is where the browser stops drawing it. Inset layers draw inside the box
 * and reach nothing.
 */
export function shadowReach(element: Element): ShadowReach {
  const reach = { top: 0, right: 0, bottom: 0, left: 0 }
  const value = getComputedStyle(element).boxShadow
  if (value === 'none') return reach
  // Layers are separated by the commas that are not inside a colour's parentheses.
  for (const layer of value.split(/,(?![^(]*\))/)) {
    if (/\binset\b/.test(layer)) continue
    const lengths = layer.replace(/[a-z-]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths.map((length) => Number.parseFloat(length))
    reach.top = Math.max(reach.top, blur + spread - y)
    reach.right = Math.max(reach.right, blur + spread + x)
    reach.bottom = Math.max(reach.bottom, blur + spread + y)
    reach.left = Math.max(reach.left, blur + spread - x)
  }
  return reach
}

/**
 * Where an element's `box-shadow` is cut: each side on which the part of the shadow inside the
 * window passes the padding box of an ancestor that clips. A scroll container clips there on both
 * axes, whichever one it scrolls. The walk stops at a fixed ancestor, because the ancestors above
 * it do not contain it. Empty when the whole shadow is drawn.
 */
export function shadowCuts(element: Element): string[] {
  return reachCuts(element, shadowReach(element))
}

/**
 * Where something drawn `reach` past an element's border box is cut, as `shadowCuts` reads it:
 * a focus mark drawn outside a control, for one. `reach` is one length for every side, or one
 * per side.
 */
export function reachCuts(element: Element, reach: number | ShadowReach): string[] {
  if (typeof reach === 'number') {
    return reachCuts(element, { top: reach, right: reach, bottom: reach, left: reach })
  }
  const rect = element.getBoundingClientRect()
  const drawn = {
    left: Math.max(0, rect.left - reach.left),
    top: Math.max(0, rect.top - reach.top),
    right: Math.min(window.innerWidth, rect.right + reach.right),
    bottom: Math.min(window.innerHeight, rect.bottom + reach.bottom),
  }
  const cuts: string[] = []
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const box = node.getBoundingClientRect()
      const left = box.left + node.clientLeft
      const top = box.top + node.clientTop
      const past = {
        left: left - drawn.left,
        top: top - drawn.top,
        right: drawn.right - (left + node.clientWidth),
        bottom: drawn.bottom - (top + node.clientHeight),
      }
      const part =
        node.getAttribute('data-dialog-part') ??
        node.getAttribute('role') ??
        (typeof node.className === 'string' ? node.className.split(' ')[0] : null) ??
        null
      const name = `${node.tagName.toLowerCase()}${part === null || part === '' ? '' : ` (${part})`}`
      for (const [side, by] of Object.entries(past)) {
        if (by > 0.5) cuts.push(`${side}, ${Math.round(by * 10) / 10}px, by ${name}`)
      }
    }
    if (style.position === 'fixed') break
  }
  return cuts
}
