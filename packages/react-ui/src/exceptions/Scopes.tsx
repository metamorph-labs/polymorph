import { createElement, type ReactNode } from 'react'

import { DATA_ATTRS, type Density } from '@polymorph/react'

/**
 * Rung 2 of the exception ladder (`docs/rules.md`): a contextual scope.
 *
 * Neither scope is a style prop. Each sets the same attribute that the theme
 * runtime sets on `<html>`, but on a subtree. A dense table region inside a
 * comfortable app is still the comfortable theme, at dense density in that
 * region. Every token still comes from the theme. Only the variant that applies
 * changes, and the emitter has already emitted every variant.
 *
 * That is why this is rung 2 and not rung 4: nothing new is invented.
 */

/** The elements a scope may be. It is a wrapper, not a surface. */
export type ScopeElement = 'div' | 'section' | 'span'

interface ScopeProps<Value> {
  value: Value
  as?: ScopeElement
  children?: ReactNode
}

/**
 * Density for a region. It changes space and component dimensions only, never
 * the type scale, because a local density that reflowed typography would
 * change the page's reading rhythm from inside one of its parts.
 */
export function DensityScope({ value, as = 'div', children }: ScopeProps<Density>) {
  return createElement(as, { [DATA_ATTRS.density]: value }, children)
}

/**
 * `inverse` redeclares the core surface, text and border roles from the theme's
 * opposite mode. An inversion borrows the other mode and is not a second
 * palette, so there is one value and not a list.
 */
export type Tone = 'inverse'

export function ToneScope({ value, as = 'div', children }: ScopeProps<Tone>) {
  return createElement(as, { [DATA_ATTRS.tone]: value }, children)
}
