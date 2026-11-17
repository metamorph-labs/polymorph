import {
  chartDivergingRole,
  chartSlotRole,
  cssVar,
  statusRole,
  type ChartDivergingArmStep,
} from '@polymorph/theme'
import { stack, stackOffsetDiverging, stackOffsetExpand, stackOrderNone } from 'd3-shape'

import type { IconRole } from '../icon/roles'

import {
  CHART_SLOT_COUNT,
  type ChartDatum,
  type ChartSeries,
  type ChartSlot,
  type SeriesTone,
} from './types'

/**
 * Series: identity, emphasis, the legend, and stacking.
 *
 * Every decision about which mark gets which colour is made here, once, so six
 * members do not each re-derive it. Two of those decisions are laws:
 *
 *  - **Colour follows the entity.** Slots bind to declaration order, not to
 *    render order, so filtering the data never recolours the remaining series.
 *    If revenue is orange, it stays orange when churn is filtered out.
 *  - **A slot is never generated.** There is no ninth hue, because the wheel
 *    has eight seats by design. Series past the eighth fold to
 *    `--pm-chart-other` with a warning, instead of using a colour no law has
 *    measured.
 *
 * A mark's colour is always a token reference built from the theme's own name
 * for it (`cssVar(chartSlotRole(slot))`), never a string written here. A typo
 * in a custom-property name silently discards its whole declaration, and
 * `token-references.test.ts` reads CSS, not TSX, so it would not catch a typo
 * in this file.
 */

export interface ResolvedSeries {
  key: string
  label: string
  /** `var(--pm-chart-3)`, or a status role when the series carries reserved meaning. */
  paint: string
  /** Absent for a status-toned series, which has no seat on the wheel. */
  slot?: ChartSlot
  tone?: SeriesTone
  icon?: IconRole
  /** True when the series comes after the eighth seat and is folded. */
  folded?: boolean
}

export interface SeriesResolution {
  series: ResolvedSeries[]
  /** Dev-time findings, phrased as the sentence a warning should print. */
  warnings: string[]
}

export const OTHER_PAINT = cssVar('chart.other')

function slotPaint(slot: ChartSlot): string {
  return cssVar(chartSlotRole(slot))
}

function tonePaint(tone: SeriesTone): string {
  // The existing status family at its solid fill. No new tokens are added (the
  // chart tokens, `docs/charts.md`).
  return cssVar(statusRole(tone, 'solid'))
}

/**
 * Maps declared series, in declaration order, to painted series.
 *
 * Explicit slots are honoured and reserve their seat. A chart that pins its
 * second series to slot 5 does not get slot 5 again from the automatic
 * assignment, because two series must never share a colour.
 */
export function resolveSeries(series: readonly ChartSeries[]): SeriesResolution {
  const warnings: string[] = []
  const taken = new Set<ChartSlot>()

  for (const entry of series) {
    if (entry.slot !== undefined && entry.tone !== undefined) {
      warnings.push(
        `series "${entry.key}" sets both tone and slot — a series is status or categorical, ` +
          'never both in one chart. The tone wins; drop the slot.',
      )
    }
    if (entry.slot !== undefined && entry.tone === undefined) taken.add(entry.slot)
  }

  if (series.length > CHART_SLOT_COUNT) {
    warnings.push(
      `${series.length} series, and the wheel has ${CHART_SLOT_COUNT} seats. Fold the tail into ` +
        'a single "Other" series in the data — the ninth hue does not exist, so everything past ' +
        `the eighth is drawn in ${OTHER_PAINT} and is no longer telling them apart.`,
    )
  }

  let next: number = 1
  const nextFreeSlot = (): ChartSlot | undefined => {
    while (next <= CHART_SLOT_COUNT && taken.has(next as ChartSlot)) next += 1
    if (next > CHART_SLOT_COUNT) return undefined
    const slot = next as ChartSlot
    taken.add(slot)
    next += 1
    return slot
  }

  const resolved = series.map((entry): ResolvedSeries => {
    if (entry.tone !== undefined) {
      return {
        key: entry.key,
        label: entry.label,
        paint: tonePaint(entry.tone),
        tone: entry.tone,
        ...(entry.icon ? { icon: entry.icon } : {}),
      }
    }
    const slot = entry.slot ?? nextFreeSlot()
    if (slot === undefined) {
      return {
        key: entry.key,
        label: entry.label,
        paint: OTHER_PAINT,
        folded: true,
        ...(entry.icon ? { icon: entry.icon } : {}),
      }
    }
    return {
      key: entry.key,
      label: entry.label,
      paint: slotPaint(slot),
      slot,
      ...(entry.icon ? { icon: entry.icon } : {}),
    }
  })

  return { series: resolved, warnings }
}

/**
 * Emphasis: one series keeps its colour and the rest recede to `OTHER_PAINT`.
 *
 * A status-toned series keeps its status colour, because reserved meaning is
 * never greyed out. If emphasising another series muted a danger series, the
 * chart would hide what the tone exists to show.
 */
export function emphasised(
  series: readonly ResolvedSeries[],
  emphasis: string | undefined,
): ResolvedSeries[] {
  if (emphasis === undefined) return [...series]
  return series.map((entry) =>
    entry.key === emphasis || entry.tone !== undefined ? entry : { ...entry, paint: OTHER_PAINT },
  )
}

/** Whether the emphasis prop names a series that is actually here. */
export function emphasisWarning(
  series: readonly ChartSeries[],
  emphasis: string | undefined,
): string | undefined {
  if (emphasis === undefined) return undefined
  if (series.some((entry) => entry.key === emphasis)) return undefined
  return `emphasis names "${emphasis}", which is not a series on this chart — nothing is emphasised.`
}

/**
 * Toggle-to-isolate: the hidden series after a press on `key`'s legend key. A
 * new set, so a renderer that compares by identity draws the change. The
 * member owns the set, because it refits its domains to the series that remain.
 */
export function toggleSeries(hidden: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(hidden)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

/**
 * The legend, derived rather than configured (the shared grammar, `docs/charts.md`).
 *
 * Two or more series get a legend below the plot. One series gets none,
 * because the panel's title already names it, and a one-entry legend is only a
 * label placed further from what it labels. Returns `null` instead of an empty
 * array, so a caller checks the decision, not a length.
 */
export function legendFor(series: readonly ResolvedSeries[]): ResolvedSeries[] | null {
  return series.length >= 2 ? [...series] : null
}

/* -------------------------------------------------------------------------- */
/* Stacking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Three modes. `diverging` is `stackOffsetDiverging`, used for exactly one
 * form: the Likert form, BarChart `mode: 'diverging'` (`bar-chart.md`). The
 * neutral split is data logic. The app pre-signs values and the offset stacks
 * each side outward from zero. The member never derives a neutral key.
 */
export type StackMode = 'stacked' | 'percent' | 'diverging'

export interface StackSegment {
  key: string
  /** Index of the row this segment came from. */
  row: number
  /** Lower and upper bound in value space. */
  from: number
  to: number
  /**
   * False when the source value is `null`. A gap is an absent segment, not a
   * zero-height one, and the mark must not draw it.
   */
  present: boolean
}

/**
 * Stacked bounds per series per row.
 *
 * The offsets are borrowed from d3: `stackOffsetExpand` normalises to 1 and
 * `stackOffsetDiverging` splits signs around zero. That arithmetic is worth
 * taking from the standard library. This function adds the gap rule: a `null`
 * adds nothing to the total and produces a segment marked absent, so a missing
 * measurement neither shifts the stack nor draws a sliver.
 */
export function stackSegments(
  rows: readonly ChartDatum[],
  keys: readonly string[],
  mode: StackMode = 'stacked',
): StackSegment[][] {
  if (keys.length === 0 || rows.length === 0) return []

  const offset =
    mode === 'percent' ? stackOffsetExpand : mode === 'diverging' ? stackOffsetDiverging : undefined

  const generator = stack<ChartDatum>()
    .keys([...keys])
    .order(stackOrderNone)
    .value((row, key) => {
      const value = row[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : 0
    })
  if (offset) generator.offset(offset)

  const stacked = generator([...rows])

  return stacked.map((layer, index) => {
    const key = keys[index] ?? ''
    return layer.map((point, row): StackSegment => {
      const source = rows[row]?.[key]
      const present = typeof source === 'number' && Number.isFinite(source)
      const [from, to] = point
      return {
        key,
        row,
        from: Number.isFinite(from) ? from : 0,
        to: Number.isFinite(to) ? to : 0,
        present,
      }
    })
  })
}

/** Whether a stacked chart has been handed values on both sides of zero. */
export function hasMixedSigns(rows: readonly ChartDatum[], keys: readonly string[]): boolean {
  let positive = false
  let negative = false
  for (const row of rows) {
    for (const key of keys) {
      const value = row[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      if (value > 0) positive = true
      if (value < 0) negative = true
      if (positive && negative) return true
    }
  }
  return false
}

/** A row's value for a key: a number, or `null` for a gap. */
export function valueAt(row: ChartDatum | undefined, key: string): number | null {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/* -------------------------------------------------------------------------- */
/* The diverging arms                                                          */
/* -------------------------------------------------------------------------- */

/** The arm assigned to one diverging series: a side, a step, and its token reference. */
export interface DivergingArm {
  side: 'pos' | 'neg'
  step: ChartDivergingArmStep
  paint: string
}

/**
 * The arm each series of a diverging stack uses (`bar-chart.md`). Arms are
 * ordered by distance from zero on each side, an ordinal scale around a
 * centre, which is what arms are for. Arm 1 is nearest the centre and arm 3 at
 * the extremes.
 *
 * The assignment is per series, not per segment, because colour follows the
 * entity. A Likert scale's "Disagree" is one answer wherever it appears. The
 * app pre-signs the values, so a series' side is a property of its data, read
 * from its first finite nonzero value. Rank is the series' position among the
 * series on its side, in declaration order, so a `null` in one row cannot
 * change a neighbour's colour. Past three steps a side clamps at arm 3, the
 * same ceiling `signedBinOf` uses, so an extreme value gets the extreme arm.
 *
 * Returns `null` for a series with no signed value. It has nothing to place on
 * either side of zero, so it keeps its existing paint. It draws no length
 * anyway, and its legend key still identifies the series correctly.
 */
export function divergingArms(
  rows: readonly ChartDatum[],
  keys: readonly string[],
): (DivergingArm | null)[] {
  let positives = 0
  let negatives = 0
  return keys.map((key) => {
    const first = rows
      .map((row) => valueAt(row, key))
      .find((value): value is number => value !== null && value !== 0)
    if (first === undefined) return null
    const side = first > 0 ? 'pos' : 'neg'
    const rank = side === 'pos' ? (positives += 1) : (negatives += 1)
    const step = Math.min(3, rank) as ChartDivergingArmStep
    return { side, step, paint: cssVar(chartDivergingRole(side, step)) }
  })
}
