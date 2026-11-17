/**
 * Tooltip's delays, set once for every framework (`design/components/tooltip.md`).
 * A tooltip waits half a second before it appears, and a reader moving along a
 * toolbar does not wait again at each control: within the skip delay of one
 * tooltip closing, the next opens at once. HoverCard opens and closes on the
 * same two values.
 *
 * Delay is interaction design rather than motion, so it does not scale with
 * temperament and `none` does not remove it.
 */
export const TOOLTIP_DELAY_MS = 500
export const TOOLTIP_SKIP_DELAY_MS = 250
