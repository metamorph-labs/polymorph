/**
 * The size scale all controls share (`design/components/README.md`, size
 * system).
 *
 * Every sized control uses the same three steps and the same tokens per step, so
 * a Button, an Input and a Select at `md` line up in a row. A control never
 * computes its height. The height is `--pm-control-height-<size>`, so density
 * can resize the whole vocabulary by changing one attribute.
 */

export const CONTROL_SIZES = ['sm', 'md', 'lg'] as const

export type ControlSize = (typeof CONTROL_SIZES)[number]
