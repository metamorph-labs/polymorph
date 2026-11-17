import type { ReactNode } from 'react'

import styles from '@polymorph/recipes/conventions/fixture-box.module.css'

/**
 * Filler content for the layout primitives' own fixtures. A Stack needs
 * something to stack, so `stack.states.tsx` and its siblings use this to render
 * "three chips" without another member's recipe.
 *
 * Exported only from `@polymorph/react-ui/galleries`, never from the package root,
 * because it is fixture apparatus, not vocabulary.
 */
export interface FixtureBoxProps {
  children?: ReactNode
  /** Taller, to show cross-axis alignment. */
  tall?: boolean
}

export function FixtureBox({ children = 'box', tall = false }: FixtureBoxProps) {
  return (
    <span className={styles.box} data-tall={tall ? '' : undefined}>
      {children}
    </span>
  )
}
