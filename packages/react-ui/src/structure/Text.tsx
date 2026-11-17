import type { CSSProperties, ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/text.module.css'

/**
 * A paragraph of body text (`design/components/text.md`).
 *
 * A member under the same promotion rule as Heading. A bare `<p>` is unstyled on
 * purpose (the base layer only removes UA margins), so without this every site
 * would build its own `Prose`.
 *
 * Emphasis comes from the children (`<strong>`, `Code`), not from a `weight`
 * prop that would duplicate the type scale.
 *
 * No measure (line-length cap), on purpose: it needs a `--pm-measure` engine
 * token, not a `65ch` literal.
 *
 * `lines` keeps the paragraph to a number of lines and ends the last with an
 * ellipsis. Only the drawing is cut: the whole text stays in the document, so a
 * screen reader reads it and a copy takes it.
 */

export type TextSize = 'sm' | 'md'
export type TextTone = 'primary' | 'secondary'

export interface TextProps {
  size?: TextSize
  /**
   * Never below secondary; muted text is a caption, and captions belong to the
   * components that own them.
   */
  tone?: TextTone
  /**
   * The most lines the paragraph draws; the last ends with an ellipsis. Only
   * the drawing is cut, so the whole text must be reachable another way (the
   * page it opens, a detail view). A value that is not a whole number reads as
   * the whole number below it, and below 1 nothing is cut.
   */
  lines?: number
  children: ReactNode
}

export function Text({ size = 'md', tone = 'primary', lines, children }: TextProps) {
  const kept = lines === undefined ? 0 : Math.floor(lines)
  const clamped = kept >= 1
  return (
    <p
      className={styles.text}
      data-size={size}
      data-tone={tone}
      data-lines={clamped ? kept : undefined}
      // The count is data, not a design value, so it reaches the recipe as a property.
      style={clamped ? ({ '--pm-text-clamp': kept } as CSSProperties) : undefined}
      {...memberAttr('Text')}
    >
      {children}
    </p>
  )
}
