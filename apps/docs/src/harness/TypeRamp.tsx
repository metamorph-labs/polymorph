import type { CSSProperties } from 'react'

import styles from './type-ramp.module.css'

/**
 * Renders `text.*` and `display.*` steps at their emitted size in the current theme's families.
 * Harness CSS: Text draws two body steps and only Hero draws a display step, and a page has one
 * opener, so no member can show the whole ramp. Step names come from the registry's scale
 * catalogue. The values are read through the tokens, so they are whatever the live theme
 * resolves. `sizes` labels each step with its size in the current system.
 */
export function TypeRamp({
  steps,
  kind,
  sample,
  sizes = {},
}: {
  steps: readonly string[]
  kind: 'text' | 'display'
  sample: string
  sizes?: Readonly<Record<string, string | undefined>>
}) {
  return (
    <div className={styles.ramp}>
      {steps.map((step) => (
        <div key={step} className={styles.row}>
          <span className={styles.step}>
            <span>{`${kind}.${step}`}</span>
            {sizes[step] === undefined ? null : <span>{sizes[step]}</span>}
          </span>
          <TypeSample kind={kind} step={step}>
            {sample}
          </TypeSample>
        </div>
      ))}
    </div>
  )
}

/** One line of text set in one type step's quartet. */
export function TypeSample({
  kind,
  step,
  children,
}: {
  kind: 'text' | 'display'
  step: string
  children: string
}) {
  const prefix = `--pm-${kind}-${step}`
  const style = {
    ['--pm-sample-family' as string]: `var(${prefix}-family)`,
    ['--pm-sample-size' as string]: `var(${prefix}-size)`,
    ['--pm-sample-weight' as string]: `var(${prefix}-weight)`,
    ['--pm-sample-line-height' as string]: `var(${prefix}-line-height)`,
    ['--pm-sample-tracking' as string]: `var(${prefix}-tracking)`,
    ['--pm-sample-style' as string]: `var(${prefix}-style, normal)`,
  } as CSSProperties
  return (
    <span className={styles.specimen} style={style}>
      {children}
    </span>
  )
}
