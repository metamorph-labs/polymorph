import type { ReactNode } from 'react'

import styles from './stage.module.css'

interface StageProps {
  system: string
  palette: string
  mode: 'light' | 'dark'
  children: ReactNode
}

/**
 * A framed region that wears its own pairing: a nested scope with the page
 * surface painted behind it. The members inside read the scope's tokens, so one
 * screen can be shown in a system the rest of the page does not wear.
 */
export function Stage({ system, palette, mode, children }: StageProps) {
  return (
    <div className={styles.stage} data-system={system} data-palette={palette} data-mode={mode}>
      {children}
    </div>
  )
}
