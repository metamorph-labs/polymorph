import { createElement } from 'react'

import styles from '@polymorph/recipes/layout/layout.module.css'
import { type LayoutChildren, memberAttr, spacingAttrs, type SpacingProps } from '@polymorph/react'

/**
 * Vertical layout primitive (`design/components/stack.md`).
 *
 * With Inline and Grid, it removes the remaining reason for CSS in application
 * code. Composition is props over the space scale, and a value off that scale
 * cannot be expressed: `gap={5}` resolves to `var(--pm-space-5)` and
 * `gap="17px"` is a type error.
 *
 * Stack paints nothing: no background, border or radius. Surfaces are Card's
 * job, so a Stack cannot become one.
 */

export type StackAlign = 'stretch' | 'start' | 'center' | 'end'
export type StackJustify = 'start' | 'center' | 'end' | 'between'
export type StackElement = 'div' | 'section' | 'ul' | 'ol' | 'form'

export interface StackProps extends SpacingProps, LayoutChildren {
  align?: StackAlign
  justify?: StackJustify
  /** List and form semantics without a wrapper element. */
  as?: StackElement
}

export function Stack({
  align = 'stretch',
  justify = 'start',
  as = 'div',
  children,
  ...spacing
}: StackProps) {
  return createElement(
    as,
    {
      className: `${styles.layout} ${styles.stack}`,
      'data-align': align,
      'data-justify': justify,
      ...spacingAttrs(spacing),
      ...memberAttr('Stack'),
    },
    children,
  )
}
