import type { CSSProperties } from 'react'

import styles from './scales.module.css'

/**
 * The tokens page's scale specimens: a space step as a bar of that length, a radius step as a
 * corner, a shadow step as a raised tile. Harness CSS: a member takes a step for its own padding
 * or corner, and none draws a step as a measured shape. Each value is the live pairing's custom
 * property, so the theme control redraws them, and the page puts each one's name beside it with
 * members.
 */

const token = (name: string): CSSProperties => ({ ['--pm-sample' as string]: `var(${name})` })

/**
 * The space scale as rows of bars, each as long as its step, with the step's name and its size
 * in the current system. The rows are one component because the bars share a start line, which
 * the layout members cannot give a column of labels of different widths.
 */
export function SpaceScale({
  steps,
  values,
}: {
  steps: readonly string[]
  values: Readonly<Record<string, string>>
}) {
  return (
    <div className={styles.scale}>
      {steps.map((step) => (
        <div key={step} className={styles.row}>
          <span className={styles.label}>{`space.${step}`}</span>
          <span className={styles.value}>{values[step]}</span>
          <div className={styles.bar} style={token(`--pm-space-${step}`)} aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}

/** A tile with one radius step on its corners. */
export function RadiusTile({ step }: { step: string }) {
  return <div className={styles.radius} style={token(`--pm-radius-${step}`)} aria-hidden="true" />
}

/** A tile lifted by one shadow step. */
export function ShadowTile({ step }: { step: string }) {
  return <div className={styles.shadow} style={token(`--pm-shadow-${step}`)} aria-hidden="true" />
}
