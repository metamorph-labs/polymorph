import {
  CHART_DIVERGING_ARM_STEPS,
  CHART_SEQ_STEPS,
  chartDivergingRole,
  chartSeqRole,
  cssVar,
} from '@polymorph/theme'

import { crisp, rulePath } from './geometry'

/**
 * The drawings of the frame's parts that hold more than their props: the
 * brush's range and the scale legend's swatches. Every framework's frame draws
 * from them, so the brush's edges land on the same pixels and the legend's
 * swatches are the same tokens in each.
 */

/** The brush's range, between two positions along the x axis, over the plot's height. */
export interface BrushDrawing {
  x: number
  width: number
  height: number
  /** The range's two boundaries, as hairline paths. The top and bottom belong to the plot. */
  near: string
  far: string
}

/** The range from `from` to `to`, in either order. */
export function brushDrawing(from: number, to: number, height: number): BrushDrawing {
  const near = Math.min(from, to)
  const far = Math.max(from, to)
  return {
    x: near,
    width: far - near,
    height,
    near: rulePath([crisp(near), 0], [crisp(near), height]),
    far: rulePath([crisp(far), 0], [crisp(far), height]),
  }
}

/** One swatch of the scale legend: a token reference, never a colour. */
export interface ScaleStep {
  key: string
  paint: string
}

/** The negative arm, strongest first: the band runs neg 3..1, mid, pos 1..3. */
const NEG_STEPS = [...CHART_DIVERGING_ARM_STEPS].reverse()

/**
 * The swatches of the magnitude ramp's legend, in order. **sequential** is the
 * seven `--pm-chart-seq-*` steps; a continuous gradient would suggest a
 * precision the quantised cells do not have. **diverging** is the two arms and
 * the mid swatch between them (`--pm-chart-neg-3..1` · `--pm-chart-mid` ·
 * `--pm-chart-pos-1..3`), where mid means exactly zero.
 */
export function scaleLegendSteps(variant: 'sequential' | 'diverging'): ScaleStep[] {
  if (variant === 'sequential') {
    return CHART_SEQ_STEPS.map((step) => ({ key: String(step), paint: cssVar(chartSeqRole(step)) }))
  }
  return [
    ...NEG_STEPS.map((step) => ({
      key: `neg-${step}`,
      paint: cssVar(chartDivergingRole('neg', step)),
    })),
    { key: 'mid', paint: cssVar('chart.mid') },
    ...CHART_DIVERGING_ARM_STEPS.map((step) => ({
      key: `pos-${step}`,
      paint: cssVar(chartDivergingRole('pos', step)),
    })),
  ]
}
