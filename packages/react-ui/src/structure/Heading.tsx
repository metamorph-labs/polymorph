import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/heading.module.css'

/**
 * Section headings, levels 2 to 4, for a working screen (`design/components/heading.md`).
 *
 * A member under the promotion rule: the workbench harness and the docs site
 * both needed it, and a second build is what triggers promotion.
 *
 * `level` starts at 2, so the one-h1 law holds by type: PageHeader owns the
 * `<h1>`, and a second one cannot be written.
 *
 * No margin and no note slot. The surrounding Stack owns vertical rhythm, and a
 * caption is a `Text` beside the heading in that Stack, which a `note` prop
 * would only duplicate.
 */

export type HeadingLevel = 2 | 3 | 4

export interface HeadingProps {
  /**
   * 2 renders `<h2>`, 3 `<h3>`, 4 `<h4>`; never 1, because PageHeader owns
   * the page title.
   */
  level?: HeadingLevel
  /**
   * The heading element's id, which a fragment link (`#id`) and a
   * TableOfContents item name, so an app names a section without an element
   * of its own around it.
   */
  id?: string
  children: string
}

export function Heading({ level = 2, id, children }: HeadingProps) {
  // The element and the recipe use the same number, so the outline always
  // matches the size. An h3 cannot be drawn at the h2 step.
  const Element = level === 4 ? 'h4' : level === 3 ? 'h3' : 'h2'

  return (
    <Element id={id} className={styles.heading} data-level={level} {...memberAttr('Heading')}>
      {children}
    </Element>
  )
}
