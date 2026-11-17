import { Icon, type IconSize, memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/spinner.module.css'

/**
 * Loading indicator for work of unknown duration (`design/components/spinner.md`).
 *
 * Determinate progress is Progress: "how much is done" and "is anything
 * happening" are different questions.
 *
 * It owns no layout. Centring is the region's decision, so this is an inline
 * mark that the surrounding Stack positions, just as `Icon` has no `margin`.
 */

export interface SpinnerProps {
  size?: IconSize
  /** Announced once, so screen reader users know something is loading. */
  label?: string
}

export function Spinner({ size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <span className={styles.spinner} data-size={size} role="status" {...memberAttr('Spinner')}>
      <span className={styles.glyph}>
        <Icon name="loading" size={size} />
      </span>
      {/* The name, for screen readers. Visually hidden rather than absent,
          because the glyph shows "loading" but has no text. */}
      <span className={styles.label}>{label}</span>
    </span>
  )
}
