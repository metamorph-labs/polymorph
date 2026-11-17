import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/code.module.css'

/**
 * Inline code, such as a token name, flag or path (`design/components/code.md`).
 *
 * Monospace text in running prose, on a subtle background. A text-tier member,
 * because the harnesses (such as the docs install page) need it.
 *
 * The recipe's one decision: the size is fixed at `sm`, not relative to the
 * prose, so a page has one mono size rather than two a step apart.
 */

export interface CodeProps {
  children: string
}

export function Code({ children }: CodeProps) {
  return (
    <code className={styles.code} {...memberAttr('Code')}>
      {children}
    </code>
  )
}
