import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { converter } from 'culori'
import { describe, expect, it } from 'vitest'

import { auditChartPalette, chartAllPairsCap } from './color/chart'
import { contrast } from './color/contrast'
import {
  CHART_ANCHORS,
  CHART_CHROMA_FLOOR,
  CHART_CVD_FLOOR,
  CHART_CVD_TARGET,
  CHART_DIVERGING_ARM_LADDER,
  CHART_DIVERGING_HUES,
  CHART_LIGHTNESS_BAND,
  CHART_NORMAL_TARGET,
  CHART_SEQ_CHROMA,
  CHART_SEQ_LADDER,
  CHART_SEQ_MIN_DELTA_L,
  CHART_WHEEL_STEPS,
  chartRotation,
} from './color/chart-wheel'
import { emitThemeCSS } from './emit'
import { cssVarName } from './css-vars'
import {
  CHART_DIVERGING_ARM_STEPS,
  CHART_DIVERGING_SIDES,
  CHART_ROLES,
  CHART_SEQ_STEPS,
  CHART_SLOTS,
  chartDivergingRole,
  chartSeqRole,
  chartSlotRole,
} from './roles'
import { LC_FLOORS } from './pairings'
import { MAX_NEUTRAL_TINT, type Seeds } from './seeds'
import { composeTheme, parsePalette, parseSystem, type Palette, type System } from './systems'
import { resolveTheme } from './resolve-theme'
import { MODES, type Mode, type ResolvedTheme } from './theme'

/**
 * The chart palette laws, over everything that ships (`docs/charts.md`).
 *
 * Two claims. **Exactness**: the reference's inputs give the reference's chart
 * colours from four ordinary seed fields. **Lawfulness**: every other pairing
 * derives a wheel a colour-blind reader can read, in both modes.
 *
 * Both are measured on the emitted strings, against `design/charts-wheel.json`
 * read from disk, so any disagreement between design and engine fails here.
 */

const DESIGN = (...parts: string[]) => resolve(process.cwd(), 'design', ...parts)

const toOklch = converter('oklch')
const oklchOf = (hex: string) => {
  const parsed = toOklch(hex)
  if (!parsed) throw new Error(`cannot parse ${hex}`)
  return { l: parsed.l, c: parsed.c, h: parsed.h ?? 0 }
}

function load<T>(dir: string, parse: (raw: unknown) => T): { name: string; value: T }[] {
  return readdirSync(DESIGN(dir))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const raw: unknown = JSON.parse(readFileSync(DESIGN(dir, file), 'utf8'))
      return { name: file.replace(/\.json$/, ''), value: parse(raw) }
    })
}

const SYSTEMS = load('systems', parseSystem) as { name: string; value: System }[]
const PALETTES = load('palettes', parsePalette) as { name: string; value: Palette }[]

interface Pair {
  id: string
  system: System
  palette: Palette
  resolved: ResolvedTheme
}

const PAIRINGS: Pair[] = SYSTEMS.flatMap(({ value: system }) =>
  PALETTES.map(({ value: palette }): Pair => {
    const theme = composeTheme(system, palette)
    return { id: theme.name, system, palette, resolved: resolveTheme(theme) }
  }),
)

/* ------------------------------------------------------ the wheel's design */

interface RuledStep {
  slot: number
  hex: string
  oklch: [number, number, number]
  ref: string
}

interface Wheel {
  anchors: { slot: number; family: string; hue: number }[]
  canonical: Record<Mode, RuledStep[]>
  sequential: {
    chromaTarget: number
    vizLadder: Record<Mode, number[]>
    canonicalHex: Record<Mode, string[]>
    ordinalUsableFrom: Record<Mode, number>
  }
  diverging: {
    poleStep: Record<Mode, { l: number; c: number }>
    arms: {
      ladder: Record<Mode, { l: number; c: number }[]>
      canonical: Record<Mode, Record<'neg' | 'pos', string[]>>
      loudnessToMid: Record<Mode, Record<'neg' | 'pos', number[]>>
    }
    canonical: Record<Mode, { neg: string; mid: string; pos: string }>
  }
  seriesCap: { allPairs: Record<Mode, number>; published: number }
  measured: Record<Mode, { bandWarns: number[]; reliefSlots: Record<string, number> }>
}

const WHEEL = JSON.parse(readFileSync(DESIGN('charts-wheel.json'), 'utf8')) as Wheel

const FLAGSHIP = PAIRINGS.find((pair) => pair.id === 'plain/neutral')

/**
 * **Projection corrections: empty, and it should stay empty.**
 *
 * The `hex` fields in `charts-wheel.json` are the design's sRGB projections and
 * this suite's target. A projection that truncated a channel culori's
 * `formatHex` rounds (as the emitter and browser do) would differ by one step.
 * Such a case gets a named entry with a reason here, never an epsilon, which
 * would weaken all sixteen slots. The list is empty: the file agrees with its
 * authored OKLCH values.
 */
const PROJECTION_CORRECTIONS: Record<string, string> = {}

const ruledHex = (mode: Mode, slot: number): string => {
  const correction = PROJECTION_CORRECTIONS[`${mode}/${slot}`]
  if (correction) return correction
  const step = WHEEL.canonical[mode].find((entry) => entry.slot === slot)
  expect(step, `charts-wheel.json has no ${mode} slot ${slot}`).toBeDefined()
  return step!.hex
}

describe('the wheel in the engine matches the wheel in the design file', () => {
  it('has the eight anchors, in the design’s order', () => {
    expect(CHART_ANCHORS.map((anchor) => ({ ...anchor }))).toEqual(WHEEL.anchors)
  })

  it('has the authored step for every slot in both modes', () => {
    for (const mode of MODES) {
      for (const slot of CHART_SLOTS) {
        const ruled = WHEEL.canonical[mode].find((entry) => entry.slot === slot)!
        const [l, c] = CHART_WHEEL_STEPS[mode][slot - 1]!
        const hue = CHART_ANCHORS[slot - 1]!.hue
        expect([l, c, hue], `${mode} slot ${slot}`).toEqual(ruled.oklch)
      }
    }
  })

  it('has the viz ladder, the arm ladder, and the fixed diverging hues', () => {
    for (const mode of MODES) {
      expect([...CHART_SEQ_LADDER[mode]], mode).toEqual(WHEEL.sequential.vizLadder[mode])
      expect(
        CHART_DIVERGING_ARM_LADDER[mode].map((step) => ({ ...step })),
        mode,
      ).toEqual(WHEEL.diverging.arms.ladder[mode])
      // Arm 3 is the pole step itself, not a separate value.
      expect(CHART_DIVERGING_ARM_LADDER[mode].at(-1), `${mode} arm 3`).toEqual(
        WHEEL.diverging.poleStep[mode],
      )
    }
    expect(CHART_SEQ_CHROMA).toBe(WHEEL.sequential.chromaTarget)
    // Checked against the anchors themselves, so the pair cannot drift.
    expect(CHART_DIVERGING_HUES.pos).toBe(CHART_ANCHORS[0].hue)
    expect(CHART_DIVERGING_HUES.neg).toBe(CHART_ANCHORS[2].hue)
  })

  it('assigns slots in declaration order and never re-sorts them', () => {
    // The fixed order makes the wheel CVD-safe: the gates measure adjacent
    // pairs, so re-sorting would measure one palette and draw another.
    expect(CHART_ANCHORS.map((anchor) => anchor.slot)).toEqual([...CHART_SLOTS])
    expect(CHART_SLOTS.map(chartSlotRole)).toEqual([
      'chart.1',
      'chart.2',
      'chart.3',
      'chart.4',
      'chart.5',
      'chart.6',
      'chart.7',
      'chart.8',
    ])
  })
})

describe('the calibrated default in charts: the reference’s values from plain seeds', () => {
  it('seeds the flagship with nothing a chart derivation reads', () => {
    // The flagship's file has no chart setting. `chartCaps` is the one chart
    // key allowed: a measured output, and the cap-record law fails if it
    // disagrees with the measurement, so it cannot become an input.
    const raw = JSON.parse(readFileSync(DESIGN('palettes', 'neutral.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(Object.keys(raw).sort()).toEqual([
      'accentHue',
      'chartCaps',
      'chromaBudget',
      'name',
      'neutralTint',
    ])
    expect(raw['chromaBudget']).toBe('none')
  })

  it('takes the canonical wheel unrotated, because an achromatic palette has no anchor', () => {
    expect(chartRotation(FLAGSHIP!.resolved.seeds)).toBe(0)
  })

  for (const mode of MODES) {
    it(`matches the reference’s ${mode} chart palette, slot for slot`, () => {
      const chart = FLAGSHIP!.resolved.chart[mode]
      const got = CHART_SLOTS.map((slot) => chart[chartSlotRole(slot)])
      expect(got).toEqual(CHART_SLOTS.map((slot) => ruledHex(mode, slot)))
    })

    it(`matches the authored ${mode} sequential ramp, stop for stop`, () => {
      const chart = FLAGSHIP!.resolved.chart[mode]
      expect(CHART_SEQ_STEPS.map((step) => chart[chartSeqRole(step)])).toEqual(
        WHEEL.sequential.canonicalHex[mode],
      )
    })

    it(`matches the authored ${mode} diverging arms, arm for arm`, () => {
      const chart = FLAGSHIP!.resolved.chart[mode]
      for (const side of CHART_DIVERGING_SIDES) {
        expect(
          CHART_DIVERGING_ARM_STEPS.map((step) => chart[chartDivergingRole(side, step)]),
          side,
        ).toEqual(WHEEL.diverging.arms.canonical[mode][side])
      }
      // Arm 3 is the pole: the design file's pole value, byte for byte.
      expect(chart['chart.neg.3']).toBe(WHEEL.diverging.canonical[mode].neg)
      expect(chart['chart.pos.3']).toBe(WHEEL.diverging.canonical[mode].pos)
    })
  }

  it('binds the midpoint to a ramp step, as the design specifies', () => {
    // Light: neutral step 3, `bg.subtle`'s step, `#f5f5f5`. Dark: the neutral
    // step nearest L .32 that is not the grid (step 6), so step 5. Excluding
    // grid and axis, moving down only, changes nothing on the canonical 6/7.
    // The grid-and-axis law below checks every pairing.
    expect(FLAGSHIP!.resolved.chart.light['chart.mid']).toBe(WHEEL.diverging.canonical.light.mid)
    expect(FLAGSHIP!.resolved.chart.dark['chart.mid']).toBe(WHEEL.diverging.canonical.dark.mid)
  })

  it('draws the light gridline in the reference’s own `--border`', () => {
    // The grid matches the theme's border weight, because counting steps from
    // `bg.surface` is invisible on white. The result is the reference charts'
    // own gridline colour.
    //
    // Pinned by value, because a grid one step too strong is still a lawful
    // hairline and nothing else would catch it.
    expect(FLAGSHIP!.resolved.chart.light['chart.grid']).toBe('#e5e5e5')
    expect(FLAGSHIP!.resolved.chart.light['chart.grid']).toBe(
      FLAGSHIP!.resolved.color.light['border.default'],
    )
    // The axis is the zero baseline, one step past the grid, in both modes.
    expect(FLAGSHIP!.resolved.chart.light['chart.axis']).toBe('#d7d7d7')
    expect(FLAGSHIP!.resolved.chart.dark['chart.grid']).toBe('#353535')
    expect(FLAGSHIP!.resolved.chart.dark['chart.axis']).toBe('#484848')
  })

  it('reproduces the design file’s recorded soft findings exactly', () => {
    for (const mode of MODES) {
      const audit = auditChartPalette(
        mode,
        FLAGSHIP!.resolved.chart[mode],
        FLAGSHIP!.resolved.color[mode],
      )
      expect(
        audit.slots.filter((slot) => slot.bandWarn).map((slot) => slot.slot),
        `${mode} band warns`,
      ).toEqual(WHEEL.measured[mode].bandWarns)

      const relief = Object.fromEntries(
        audit.slots
          .filter((slot) => slot.reliefSlot)
          .map((slot) => [String(slot.slot), Number(slot.markRatio.toFixed(2))]),
      )
      expect(relief, `${mode} relief slots`).toEqual(WHEEL.measured[mode].reliefSlots)

      expect(audit.allPairsCap, `${mode} all-pairs cap`).toBe(WHEEL.seriesCap.allPairs[mode])
      expect(audit.sequential.ordinalUsableFrom, `${mode} ordinal start`).toBe(
        WHEEL.sequential.ordinalUsableFrom[mode],
      )
    }
    // The published cap is the minimum across modes.
    expect(Math.min(...MODES.map((mode) => WHEEL.seriesCap.allPairs[mode]))).toBe(
      WHEEL.seriesCap.published,
    )
  })

  it('measures the arms at the authored strength, matched per step between the sides', () => {
    for (const mode of MODES) {
      const audit = auditChartPalette(
        mode,
        FLAGSHIP!.resolved.chart[mode],
        FLAGSHIP!.resolved.color[mode],
      )
      // Exact against the design file's recorded measurements, which also pins
      // the strict outward increase (17.6 → 31.4 → 44.2).
      for (const side of CHART_DIVERGING_SIDES) {
        expect(
          audit.diverging.loudnessToMid[side].map((value) => Number(value.toFixed(1))),
          `${mode} ${side}`,
        ).toEqual(WHEEL.diverging.arms.loudnessToMid[mode][side])
      }
      // Per-step mismatch ≤ 0.2, except light arm 3's 1.1 from the poles'
      // asymmetry. Dark stays under 1 at every step.
      for (const [index, step] of CHART_DIVERGING_ARM_STEPS.entries()) {
        const mismatch = Math.abs(
          audit.diverging.loudnessToMid.neg[index]! - audit.diverging.loudnessToMid.pos[index]!,
        )
        if (mode === 'light' && step === 3) {
          expect(mismatch, `light arm 3 inherits the poles' asymmetry`).toBeLessThan(1.2)
          expect(mismatch).toBeGreaterThan(0.2)
        } else {
          expect(mismatch, `${mode} arm ${step}`).toBeLessThanOrEqual(0.2 + 0.05)
        }
        if (mode === 'dark') expect(mismatch, `dark arm ${step}`).toBeLessThan(1)
      }
    }
  })
})

describe('the palette laws: every system × every palette, both modes', () => {
  for (const pair of PAIRINGS) {
    it(pair.id, () => {
      const failures = MODES.flatMap((mode) =>
        auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode]).failures.map(
          (failure) => `${mode}: ${failure}`,
        ),
      )
      expect(failures).toEqual([])
    })
  }

  it('measures the whole catalogue, not a subset', () => {
    expect(PAIRINGS).toHaveLength(SYSTEMS.length * PALETTES.length)
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(4)
  })

  it('reads a chart label on its surface plate, never on a series colour, in every pairing', () => {
    /**
     * A treemap tile is painted with a chart slot, and the slots run from a
     * light yellow to a deep blue, so no text token reads on every one of them
     * in every palette. Treemap's label sits on a plate of `bg.surface`
     * instead (`treemap.md`). This holds that plate's two texts to the floors
     * every surface's text meets, in every system, palette and mode.
     */
    for (const pair of PAIRINGS) {
      for (const mode of MODES) {
        const colour = pair.resolved.color[mode]
        const plate = oklchOf(colour['bg.surface'])
        expect(
          contrast(oklchOf(colour['text.primary']), plate),
          `${pair.id} ${mode}: label`,
        ).toBeGreaterThanOrEqual(LC_FLOORS.bodyText)
        expect(
          contrast(oklchOf(colour['text.secondary']), plate),
          `${pair.id} ${mode}: value`,
        ).toBeGreaterThanOrEqual(LC_FLOORS.secondaryText)
      }
    }
  })

  it('records every palette whose any-neighbour cap falls under the canonical three', () => {
    /**
     * "The first three slots pass all-pairs" holds for the canonical wheel but
     * must be checked per palette, because the wheel rotates and the gates do
     * not. Some rotations cap at two. A change that drops a cap below three
     * fails here, not in a scatter chart's review.
     */
    const below = new Set<string>()
    for (const pair of PAIRINGS)
      for (const mode of MODES) {
        const audit = auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode])
        if (audit.allPairsCap < 3)
          below.add(`${pair.id.split('/')[1]}/${mode}: cap ${audit.allPairsCap}`)
      }
    // The record is each palette's own `chartCaps`, not a list here.
    const declared = PALETTES.flatMap(({ name, value: palette }) =>
      MODES.filter((mode) => (palette.chartCaps?.[mode] ?? 3) < 3).map(
        (mode) => `${name}/${mode}: cap ${palette.chartCaps?.[mode]}`,
      ),
    )
    expect([...below].sort()).toEqual(declared.sort())
  })

  it('holds every slot above the chroma floor, whatever the budget', () => {
    // The `STATUS_CHROMA_FLOOR` reasoning: `none` and `ink` apply to the accent.
    const grey = MODES.flatMap((mode) =>
      PAIRINGS.flatMap((pair) =>
        auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode])
          .slots.filter((slot) => slot.chroma < CHART_CHROMA_FLOOR - 1e-9)
          .map((slot) => `${pair.id} ${mode} slot ${slot.slot}: C ${slot.chroma.toFixed(3)}`),
      ),
    )
    expect(grey).toEqual([])
  })

  it('keeps the diverging midpoint neutral in every pairing', () => {
    /**
     * The ceiling is the neutral ramp's, because zero has no hue.
     *
     * Measured on the emitted hex, so it needs the derivation's 8-bit
     * allowance: at the schema's maximum `neutralTint` of 0.03, the dark
     * midpoint reads back at 0.0302. No shipped palette is that high, so
     * without the allowance the first one that is would fail wrongly.
     */
    const QUANTISATION_SLACK = 0.004
    const tinted = MODES.flatMap((mode) =>
      PAIRINGS.filter(
        (pair) =>
          auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode]).diverging
            .midChroma >
          MAX_NEUTRAL_TINT + QUANTISATION_SLACK,
      ).map((pair) => `${pair.id} ${mode}`),
    )
    expect(tinted).toEqual([])
  })

  it('keeps the midpoint different from both the grid and the axis, in every pairing', () => {
    /**
     * With the canonical grid 6 and axis 7, excluding the grid is enough. But
     * faint-border systems put their dark grid at step 5, the midpoint's
     * default, and "nearest L .32 that is not the grid" would give step 6,
     * their axis. So both are excluded and the midpoint moves down (to step 4
     * there), never up, because zero must be fainter than the grid and axis.
     * Both are checked: the two inequalities, and "fainter" as difference from
     * `bg.surface`, which makes never-up a law.
     */
    for (const pair of PAIRINGS) {
      for (const mode of MODES) {
        const chart = pair.resolved.chart[mode]
        expect(chart['chart.mid'], `${pair.id} ${mode}: mid wears the grid`).not.toBe(
          chart['chart.grid'],
        )
        expect(chart['chart.mid'], `${pair.id} ${mode}: mid wears the axis`).not.toBe(
          chart['chart.axis'],
        )
        const surface = oklchOf(pair.resolved.color[mode]['bg.surface']).l
        const loudness = (value: string) => Math.abs(oklchOf(value).l - surface)
        expect(
          loudness(chart['chart.mid']),
          `${pair.id} ${mode}: mid louder than the grid`,
        ).toBeLessThan(loudness(chart['chart.grid']))
        expect(
          loudness(chart['chart.mid']),
          `${pair.id} ${mode}: mid louder than the axis`,
        ).toBeLessThan(loudness(chart['chart.axis']))
      }
    }
  })

  it('never rotates the diverging arms, so “above zero” means one thing everywhere', () => {
    for (const mode of MODES) {
      const arms = new Set(
        PAIRINGS.map((pair) =>
          CHART_DIVERGING_SIDES.flatMap((side) =>
            CHART_DIVERGING_ARM_STEPS.map(
              (step) => pair.resolved.chart[mode][chartDivergingRole(side, step)],
            ),
          ).join('/'),
        ),
      )
      expect([...arms], mode).toHaveLength(1)
    }
  })

  it('makes each pairing’s arms strictly stronger outward, at least the ramp floor apart', () => {
    // The two arm gates in one sweep, so a failure names a threshold, not a
    // colour. `auditChartPalette.failures` has both too; this asserts they
    // apply to every pairing.
    for (const pair of PAIRINGS) {
      for (const mode of MODES) {
        const audit = auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode])
        for (const side of CHART_DIVERGING_SIDES) {
          const loudness = audit.diverging.loudnessToMid[side]
          const hexes = audit.diverging[side]
          for (let step = 0; step < loudness.length - 1; step += 1) {
            expect(
              loudness[step + 1]!,
              `${pair.id} ${mode} ${side} arm ${step + 2} louder than arm ${step + 1}`,
            ).toBeGreaterThan(loudness[step]!)
            const deltaLightness = Math.abs(oklchOf(hexes[step + 1]!).l - oklchOf(hexes[step]!).l)
            expect(
              deltaLightness,
              `${pair.id} ${mode} ${side} arms ${step + 1}-${step + 2} ΔL`,
            ).toBeGreaterThanOrEqual(CHART_SEQ_MIN_DELTA_L - 1e-9)
          }
        }
      }
    }
  })

  it('rotates slot 1 onto the brand for every chromatic palette, and nothing for the rest', () => {
    for (const { value: palette } of PALETTES) {
      // Passing only the two seeds the rotation reads makes this a check on the
      // palette alone.
      const rotation = chartRotation({
        accentHue: palette.accentHue,
        chromaBudget: palette.chromaBudget,
      } as Seeds)
      const achromatic = palette.chromaBudget === 'none' || palette.chromaBudget === 'ink'
      if (achromatic) expect(rotation, palette.name).toBe(0)
      else
        expect((CHART_ANCHORS[0].hue + rotation + 360) % 360, palette.name).toBeCloseTo(
          palette.accentHue,
          6,
        )
    }
  })

  it('gives an achromatic palette the canonical wheel, whatever hue it seeds', () => {
    // `umber` seeds accentHue 75 under `ink`, yet its chart palette must equal
    // `neutral`'s byte for byte.
    const umber = PAIRINGS.find((pair) => pair.id === 'plain/umber')
    expect(umber, 'plain/umber is missing').toBeDefined()
    for (const mode of MODES) {
      for (const slot of CHART_SLOTS) {
        expect(umber!.resolved.chart[mode][chartSlotRole(slot)], `${mode} slot ${slot}`).toBe(
          FLAGSHIP!.resolved.chart[mode][chartSlotRole(slot)],
        )
      }
    }
  })

  /**
   * The gates in one sweep, so a failure names a threshold. The repair loop
   * aims for a CVD target of 8 and the law requires 6. Pairs in between are
   * recorded here so that range cannot grow unnoticed.
   */
  it('matches the cap record every committed palette declares, mode by mode', () => {
    /**
     * Each file in `design/palettes/` declares its own `chartCaps`, so the
     * record is design data and a new palette is still only a file. The laws
     * above keep the cap consistent, but a retune could still raise a cap (to
     * four, say) and give scatter charts a series no record allows. So the
     * declaration must equal the measurement, and any change shows up in the
     * palette file in review. A palette with no declaration fails with the
     * measured value to copy in.
     *
     * One pairing per palette is enough, because the wheel derives from seeds
     * alone. The emission law above checks every system × palette.
     */
    for (const { name, value: palette } of PALETTES) {
      const pair = PAIRINGS.find((candidate) => candidate.palette === palette)
      expect(pair, `no pairing carries ${name}`).toBeDefined()
      const caps = Object.fromEntries(
        MODES.map((mode) => [
          mode,
          chartAllPairsCap(
            CHART_SLOTS.map((slot) => pair!.resolved.chart[mode][chartSlotRole(slot)]),
          ),
        ]),
      )
      const measured = { ...caps, published: pair!.resolved.chartCap }
      expect(
        palette.chartCaps,
        `${name} declares no chartCaps — measured ${JSON.stringify(measured)}`,
      ).toBeDefined()
      expect(measured, name).toEqual(palette.chartCaps)
    }
  })

  it('records which pairings sit between the CVD target and the CVD floor', () => {
    const between: string[] = []
    for (const pair of PAIRINGS) {
      for (const mode of MODES) {
        const audit = auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode])
        for (const row of audit.adjacent) {
          if (row.cvd < CHART_CVD_TARGET)
            between.push(`${pair.id} ${mode} ${row.pair}: ${row.cvd.toFixed(1)}`)
          expect(row.cvd, `${pair.id} ${mode} ${row.pair}`).toBeGreaterThanOrEqual(CHART_CVD_FLOOR)
          expect(row.normal, `${pair.id} ${mode} ${row.pair}`).toBeGreaterThanOrEqual(
            CHART_NORMAL_TARGET,
          )
        }
      }
    }
    // The loop reaches the target everywhere. New entries must be justified;
    // the floor is not lowered.
    expect(between).toEqual([])
  })

  it('records the soft gates and never fails on them', () => {
    // Band WARNs and relief slots are findings. The flagship has five and two,
    // because exactness takes priority over the band and the table twin carries
    // the data.
    const warns = MODES.flatMap((mode) =>
      auditChartPalette(
        mode,
        FLAGSHIP!.resolved.chart[mode],
        FLAGSHIP!.resolved.color[mode],
      ).slots.filter((slot) => slot.bandWarn),
    )
    expect(warns.length).toBeGreaterThan(0)
    for (const mode of MODES) {
      const band = CHART_LIGHTNESS_BAND[mode]
      expect(band[0]).toBeLessThan(band[1])
    }
  })
})

describe('emission: the chart roles are in the sheet', () => {
  it('emits every chart role in the base block and in both mode blocks', () => {
    const css = emitThemeCSS(FLAGSHIP!.resolved)
    for (const role of CHART_ROLES) {
      const name = cssVarName(role)
      expect(name, role).toMatch(/^--pm-chart-[a-z0-9-]+$/)
      // Base + light + dark, at minimum. The inverse blocks add more.
      const occurrences = css.split(`${name}:`).length - 1
      expect(occurrences, `${role} appears ${occurrences} times`).toBeGreaterThanOrEqual(3)
    }
  })

  it('lets an inverse subtree borrow the opposite mode’s chart palette', () => {
    // An inverted panel uses the other mode, so its charts must too.
    const css = emitThemeCSS(FLAGSHIP!.resolved)
    const inverse = css
      .split('\n')
      .some(
        (line) =>
          line.includes(cssVarName('chart.1')) &&
          line.includes(FLAGSHIP!.resolved.chart.dark['chart.1']),
      )
    expect(inverse).toBe(true)
  })

  it('numbers the family with the common `--chart-N` convention, one to one', () => {
    expect(cssVarName('chart.1')).toBe('--pm-chart-1')
    expect(cssVarName('chart.seq.7')).toBe('--pm-chart-seq-7')
    expect(cssVarName('chart.other')).toBe('--pm-chart-other')
    expect(cssVarName('chart.neg.1')).toBe('--pm-chart-neg-1')
    expect(cssVarName('chart.pos.3')).toBe('--pm-chart-pos-3')
  })

  it('publishes the any-neighbour cap as `--pm-chart-cap`, the number the audit computes', () => {
    /**
     * The sheet's integer is the audit's: the same all-pairs check, minimum
     * across modes (`charts-wheel.json`, `seriesCap`). Every pairing is
     * checked, so carmine and orchid publish their own 2, not the canonical 3.
     */
    for (const pair of PAIRINGS) {
      const audited = Math.min(
        ...MODES.map(
          (mode) =>
            auditChartPalette(mode, pair.resolved.chart[mode], pair.resolved.color[mode])
              .allPairsCap,
        ),
      )
      expect(pair.resolved.chartCap, pair.id).toBe(audited)
      const css = emitThemeCSS(pair.resolved)
      const occurrences = css.split(`--pm-chart-cap: ${audited};`).length - 1
      // Base + light + dark, never inverse, because it is mode-invariant.
      expect(occurrences, `${pair.id} emits --pm-chart-cap: ${audited}`).toBe(3)
      expect(css.split('--pm-chart-cap:').length - 1, `${pair.id} total`).toBe(3)
    }
    // The flagship publishes the design file's own published cap.
    expect(FLAGSHIP!.resolved.chartCap).toBe(WHEEL.seriesCap.published)
  })

  it('has no separate pole roles: chart.neg and chart.pos do not exist', () => {
    // The pole is arm 3 (`chart.neg.3`/`chart.pos.3`). A second name for it
    // would be drift, so the bare names never appear.
    expect(CHART_ROLES).not.toContain('chart.neg')
    expect(CHART_ROLES).not.toContain('chart.pos')
    const css = emitThemeCSS(FLAGSHIP!.resolved)
    expect(css).not.toMatch(/--pm-chart-neg:/)
    expect(css).not.toMatch(/--pm-chart-pos:/)
  })
})
