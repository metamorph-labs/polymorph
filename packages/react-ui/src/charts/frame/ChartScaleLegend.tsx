import { scaleLegendSteps } from '@polymorph/react'

import styles from '@polymorph/recipes/charts/frame/chart-scale-legend.module.css'

/**
 * The legend for the magnitude ramp: the emitted steps, with the extent they
 * cover (`design/components/heatmap.md`).
 *
 * It **replaces** the series legend, because a heatmap has one measure and no
 * series. There is nothing to name, only a range to read against. The swatches
 * are the emitted steps in order, so a reader matching a cell to a swatch
 * matches it to the same token, not an approximation.
 *
 * Two variants, one per scale the grid can use:
 *
 *  - **sequential**: the seven `--pm-chart-seq-*` steps in a strip, with min
 *    and max beside it. Seven, because the ramp has seven steps; a continuous
 *    gradient would suggest a precision the quantised cells do not have.
 *  - **diverging**: two arm strips and the mid swatch
 *    (`--pm-chart-neg-3..1` · `--pm-chart-mid` · `--pm-chart-pos-1..3`, with
 *    the same gaps and radius), and **three labels (min · zero · max)** below
 *    the band so the zero label sits under the mid swatch. Mid means exactly
 *    zero.
 */

export type ChartScaleLegendProps =
  | {
      variant?: 'sequential'
      /** The extent the ramp covers, already formatted. */
      min: string
      max: string
    }
  | {
      variant: 'diverging'
      /** The symmetric range's ends and its centre, already formatted. */
      min: string
      zero: string
      max: string
    }

export function ChartScaleLegend(props: ChartScaleLegendProps) {
  if (props.variant === 'diverging') {
    return (
      <div className={styles.scale} data-variant="diverging">
        <span className={styles.band} aria-hidden="true">
          {scaleLegendSteps('diverging').map((step) => (
            <span key={step.key} className={styles.step} style={{ background: step.paint }} />
          ))}
        </span>
        <span className={styles.bounds}>
          <span className={styles.bound}>{props.min}</span>
          <span className={styles.bound}>{props.zero}</span>
          <span className={styles.bound}>{props.max}</span>
        </span>
      </div>
    )
  }

  return (
    <div className={styles.scale}>
      <span className={styles.bound}>{props.min}</span>
      <span className={styles.ramp} aria-hidden="true">
        {scaleLegendSteps('sequential').map((step) => (
          <span key={step.key} className={styles.step} style={{ background: step.paint }} />
        ))}
      </span>
      <span className={styles.bound}>{props.max}</span>
    </div>
  )
}
