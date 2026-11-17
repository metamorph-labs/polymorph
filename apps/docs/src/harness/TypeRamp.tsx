import styles from './type-ramp.module.css'

const SAMPLE = 'Design decisions, made once'

/**
 * Renders `text.*` and `display.*` steps at their emitted size in the current
 * theme's families, in the same layout as the workbench's type section. Step
 * names come from the registry's scale catalogue. The values are read through
 * the tokens, so they are whatever the live theme resolves.
 */
export function TypeRamp({ steps, kind }: { steps: string[]; kind: 'text' | 'display' }) {
  return (
    <div>
      {steps.map((step) => {
        const prefix = `--pm-${kind}-${step}`
        return (
          <div key={step} className={styles.row}>
            <span className={styles.step}>
              {kind}.{step}
            </span>
            <span
              className={styles.specimen}
              style={{
                ['--pm-sample-family' as string]: `var(${prefix}-family)`,
                ['--pm-sample-size' as string]: `var(${prefix}-size)`,
                ['--pm-sample-weight' as string]: `var(${prefix}-weight)`,
                ['--pm-sample-line-height' as string]: `var(${prefix}-line-height)`,
                ['--pm-sample-tracking' as string]: `var(${prefix}-tracking)`,
                ['--pm-sample-style' as string]: `var(${prefix}-style, normal)`,
              }}
            >
              {SAMPLE}
            </span>
          </div>
        )
      })}
    </div>
  )
}
