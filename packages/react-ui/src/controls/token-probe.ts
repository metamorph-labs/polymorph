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
