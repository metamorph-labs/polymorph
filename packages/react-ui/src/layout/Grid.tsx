import { createElement } from 'react'

import styles from '@polymorph/recipes/layout/layout.module.css'
import { type LayoutChildren, memberAttr, spacingAttrs, type SpacingProps } from '@polymorph/react'

/**
 * Equal-track grid (`design/components/grid.md`) for card fields, stat rows and
 * form pairs.
 *
 * It is deliberately simple. Tracks are equal, gaps are tokens, and there are no
 * breakpoint props. The number of columns at each width is a pattern-scope
 * decision that belongs to the archetype, because spreading it across instances
 * makes layouts inconsistent.
 */

export type GridColumns = 1 | 2 | 3 | 4 | 6 | 12
export type GridAlign = 'stretch' | 'start' | 'center' | 'end'
export type GridElement = 'div' | 'section' | 'ul'

export interface GridProps extends SpacingProps, LayoutChildren {
  columns?: GridColumns
  align?: GridAlign
  as?: GridElement
}

export function Grid({
  columns = 2,
  align = 'stretch',
  as = 'div',
  children,
  ...spacing
}: GridProps) {
  return createElement(
    as,
    {
      className: `${styles.layout} ${styles.grid}`,
      'data-columns': String(columns),
      'data-align': align,
      ...spacingAttrs(spacing),
      ...memberAttr('Grid'),
    },
    children,
  )
}
