import { memberAttr, type IconRole } from '@polymorph/engine'

import styles from './icon.module.css'
import { GlyphSvg } from './map'

/**
 * The only component that renders icons (`design/components/icon.md`).
 *
 * There is no `color` prop and no `className`. An icon takes `currentColor`
 * from the text role of its context, so a status icon is coloured by its
 * position, not by an argument. There are no numeric sizes either. The three
 * token sizes align with the type scale's line boxes, so an inline icon sits on
 * the baseline grid without a wrapper.
 */

export type IconSize = 'sm' | 'md' | 'lg'

export interface IconProps {
  /** A meaning from the closed role enum, never a glyph name. */
  name: IconRole
  size?: IconSize
  /**
   * Accessible name: set it for a meaningful icon (`role="img"` + `aria-label`), omit it for
   * a decorative one (`aria-hidden`), and omit it inside an icon-only Button, which uses its
   * own `label`.
   */
  label?: string
}

export function Icon({ name, size = 'md', label }: IconProps) {
  const meaningful = label !== undefined

  return (
    <GlyphSvg
      glyph={name}
      className={styles.icon}
      data-size={size}
      data-icon={name}
      aria-hidden={meaningful ? undefined : true}
      role={meaningful ? 'img' : undefined}
      aria-label={label}
      {...memberAttr('Icon')}
    />
  )
}
