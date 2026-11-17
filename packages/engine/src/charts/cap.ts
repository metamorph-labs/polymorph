import { cssVarName } from '@polymorph/theme'

/**
 * The palette's any-neighbour series cap, read from `--pm-chart-cap`.
 *
 * An any-neighbour form (Scatter's marks, Radar's polygons), where any two
 * series can land beside each other, carries at most the slots that pass the
 * all-pairs gates. It **reads the cap from the palette, never from a number in
 * a document**. The theme computes `allPairsCap` at resolve time and emits the
 * minimum across modes (3 for the canonical palette; carmine and orchid cap at
 * 2 in dark, which each palette declares as its `chartCaps`). So the number
 * here is what the active pairing measured.
 *
 * A member reads it when its marks appear, from its plot, because the warning
 * it feeds is a dev-time authoring aid, not a live subscription: React's
 * member when its plot surface mounts, a described member when its frame
 * leaves the empty state. An empty chart reads nothing, so it warns about no
 * cap. A palette switched under a mounted chart is re-read when the marks next
 * appear, and the palette laws cover the time in between. `null` where no
 * theme is installed (a bare test render) and before the member has an element
 * to read; a `null` cap warns about nothing.
 */
export function readChartCap(element: Element | null): number | null {
  if (element === null) return null
  const raw = getComputedStyle(element).getPropertyValue(cssVarName('chart.cap'))
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
