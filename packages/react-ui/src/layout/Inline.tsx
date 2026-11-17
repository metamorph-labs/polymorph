import { createElement } from 'react'

import styles from '@polymorph/recipes/layout/layout.module.css'
import { type LayoutChildren, memberAttr, spacingAttrs, type SpacingProps } from '@polymorph/react'

/**
 * Horizontal counterpart of Stack for control rows, meta lines and action groups
 * (`design/components/inline.md`).
 *
 * `align` defaults to `center`, not `stretch`, because a row of mixed-height
 * controls should align itself. A wrong default here is the most common cause of
 * a button sitting a pixel off its neighbour. `baseline` is for runs of text at
 * different sizes.
 */

export type InlineAlign = 'center' | 'start' | 'end' | 'baseline' | 'stretch'
export type InlineJustify = 'start' | 'center' | 'end' | 'between'
export type InlineElement = 'div' | 'section' | 'ul' | 'ol' | 'nav'

export interface InlineProps extends SpacingProps, LayoutChildren {
  align?: InlineAlign
  justify?: InlineJustify
  as?: InlineElement
  /** Tag lists and filter rows. Row gap equals column gap. */
  wrap?: boolean
}

export function Inline({
  align = 'center',
  justify = 'start',
  as = 'div',
  wrap = false,
  children,
  ...spacing
}: InlineProps) {
  return createElement(
    as,
    {
      className: `${styles.layout} ${styles.inline}`,
      'data-align': align,
      'data-justify': justify,
      'data-wrap': wrap ? '' : undefined,
      ...spacingAttrs(spacing),
      ...memberAttr('Inline'),
    },
    children,
  )
}
