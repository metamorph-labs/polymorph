import { BRAND_DRAWINGS, BRAND_MARKS, type BrandName, isBrandName } from '@polymorph/engine'

import styles from './icon.module.css'
import type { IconSize } from './Icon'

/**
 * Renders third-party brand marks (`design/components/icon.md`, brand marks).
 *
 * An `Icon` names a meaning, and the theme decides how it is drawn: one stroke
 * weight, `currentColor`, and a glyph set that can be replaced as a whole. A
 * provider's mark is different. Its geometry and colours belong to the provider
 * and are fixed by their brand terms. A sign-in button that redraws the Google
 * "G" in the accent colour is a trademark problem. Brand marks are therefore not
 * icon roles. They are a second, much smaller closed set behind a second
 * component, with the same rule: application code names the brand and never
 * draws it.
 *
 * The set is closed and grows only through a reviewed change, not through a
 * prop. There is no `src`, no `children` and no `color`, because a mark that can
 * be supplied can be supplied wrong, and the providers' terms forbid that.
 *
 * The marks themselves, with the providers' published colours, are the
 * engine's data (`BRAND_DRAWINGS`), which every framework's BrandMark draws.
 * This is the one React file the containment law allows to draw them
 * (`packages/rules/src/containment.ts`, `SYMBOL_DRAWERS`).
 */

export { BRAND_MARKS, isBrandName }
export type { BrandName }

export interface BrandMarkProps {
  name: BrandName
  /** Icon's three sizes, so a mark fills the same slot and line box as a glyph. */
  size?: IconSize
  /**
   * Accessible name: set it for a meaningful mark (`role="img"` + `aria-label`), and omit it for
   * a decorative `aria-hidden` one, which is the usual case beside a label naming the provider.
   */
  label?: string
}

export function BrandMark({ name, size = 'md', label }: BrandMarkProps) {
  const { viewBox, paths } = BRAND_DRAWINGS[name]
  const meaningful = label !== undefined

  return (
    <svg
      // Icon's recipe: the three token sizes and the baseline alignment. Its
      // stroke width has no effect on these filled paths, which have no stroke.
      className={styles.icon}
      viewBox={viewBox}
      data-size={size}
      data-brand={name}
      aria-hidden={meaningful ? undefined : true}
      role={meaningful ? 'img' : undefined}
      aria-label={label}
      focusable={false}
    >
      {paths.map((path) => (
        <path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </svg>
  )
}
