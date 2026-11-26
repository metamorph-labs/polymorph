import { describe, expect, it } from 'vitest'

import { anchorAtEnds } from './cartesian'
import { formatValue, granularityFor, isIsoDate, parseIso } from './format'
import { crisp, hitBox, HIT_TARGET_MIN, labelCapacity, nearest2D, nearestIndex } from './geometry'
import { DEFAULT_CHART_MESSAGES, spokenSummary } from './messages'
import { polarAngle, polarAngles, polarPoint, profilePath, radialScale, ringPath } from './polar'
import {
  bandDomain,
  bandXScale,
  binSample,
  continuousScale,
  inferScale,
  seriesValues,
  signedAmplitude,
  signedBinOf,
  sqrtRadiusScale,
  thinLabels,
  timeDomain,
  valueDomain,
} from './scales'
import {
  divergingArms,
  emphasised,
  emphasisWarning,
  hasMixedSigns,
  legendFor,
  OTHER_PAINT,
  resolveSeries,
  stackSegments,
  valueAt,
} from './series'
import type { ChartDatum } from './types'

/**
 * Tests for the chart engine.
 *
 * Everything here is a pure function over data, so the assertions are exact.
 * Member tests check what is drawn. These tests check that the numbers behind
 * the drawing are right. The two kinds of failure look very different in a
 * screenshot.
 */

const DAY = 86_400_000

describe('formatting with Intl, not d3-format', () => {
  it('reads a date-only string as a calendar date, not as UTC midnight', () => {
    // `new Date('2026-08-04')` parses as UTC and renders as the 3rd anywhere
    // west of Greenwich, which puts every axis label one day early. A calendar
    // date has no offset to apply.
    const parsed = parseIso('2026-08-04')
    expect(parsed).not.toBeNull()
    expect(parsed!.getFullYear()).toBe(2026)
    expect(parsed!.getMonth()).toBe(7)
    expect(parsed!.getDate()).toBe(4)
  })

  it('honours the offset a full timestamp carries', () => {
    const parsed = parseIso('2026-08-04T12:00:00Z')
    expect(parsed!.getTime()).toBe(Date.UTC(2026, 7, 4, 12))
  })

  it('returns null for anything unparseable rather than throwing in a render', () => {
    expect(parseIso('not a date')).toBeNull()
    expect(isIsoDate('2026-08-04')).toBe(true)
    expect(isIsoDate('Mon')).toBe(false)
    expect(isIsoDate(4)).toBe(false)
  })

  it('formats each closed style the descriptor allows', () => {
    expect(formatValue(1234, undefined, 'en-US')).toBe('1,234')
    expect(formatValue(1_240_000, { style: 'compact' }, 'en-US')).toBe('1.2M')
    // Percent takes a ratio and the formatter multiplies by 100. These are
    // Intl's semantics, so a screen spec can express them.
    expect(formatValue(0.42, { style: 'percent' }, 'en-US')).toBe('42%')
    expect(formatValue(12.5, { style: 'currency', currency: 'USD' }, 'en-US')).toBe('$12.50')
    expect(formatValue(3.14159, { maximumFractionDigits: 2 }, 'en-US')).toBe('3.14')
  })

  it('formats a calendar date at the requested granularity', () => {
    expect(formatValue('2026-08-01', { style: 'date', granularity: 'month' }, 'en-US')).toBe('Aug')
    expect(formatValue('2026-08-04', { style: 'date', granularity: 'day' }, 'en-US')).toBe('Aug 4')
    expect(formatValue('2026-08-04', { style: 'date', granularity: 'year' }, 'en-US')).toBe('2026')
    // `Intl` has no quarter field, so the usual finance notation is composed
    // instead of requested.
    expect(formatValue('2026-08-04', { style: 'date', granularity: 'quarter' }, 'en-US')).toBe('Q3')
    // The glyph comes from the catalog: a French host gets `T3`, which `Intl` cannot produce.
    expect(
      formatValue('2026-08-04', { style: 'date', granularity: 'quarter' }, 'fr-FR', {
        quarter: (quarter) => `T${quarter}`,
      }),
    ).toBe('T3')
  })

  it('returns a band category string unchanged', () => {
    expect(formatValue('Mon', undefined, 'en-US')).toBe('Mon')
    expect(formatValue(null, undefined, 'en-US')).toBe('')
  })

  it('derives a granularity from a tick step', () => {
    expect(granularityFor(DAY)).toBe('day')
    expect(granularityFor(7 * DAY)).toBe('week')
    expect(granularityFor(30 * DAY)).toBe('month')
    expect(granularityFor(91 * DAY)).toBe('quarter')
    expect(granularityFor(365 * DAY)).toBe('year')
  })

  it('builds the default English summary sentences', () => {
    // The sentence comes from the catalog (`ChartMessages`). These are the
    // generic English defaults, plurals included, used when a host passes none.
    const say = DEFAULT_CHART_MESSAGES
    expect(say.summary({ label: 'Tickets', series: ['Opened', 'Resolved'], points: 30 })).toBe(
      'Tickets showing Opened and Resolved, 30 points. The same data is available as a table.',
    )
    expect(say.summary({ label: 'Tickets', series: ['Opened'], points: 1 })).toBe(
      'Tickets showing Opened, 1 point. The same data is available as a table.',
    )
    expect(say.summary({ label: 'Tickets', series: ['A', 'B', 'C'], points: 2 })).toContain(
      'showing A, B and C, 2 points',
    )
    // A Histogram's sample has no series names to list.
    expect(say.summary({ label: 'Latency', series: [], points: 200 })).toBe(
      'Latency, 200 points. The same data is available as a table.',
    )
    // The measure the values are in, said once for every series.
    expect(
      say.summary({
        label: 'Tickets by weekday',
        series: ['Opened', 'Resolved'],
        points: 5,
        measure: 'Tickets',
      }),
    ).toBe(
      'Tickets by weekday showing Opened and Resolved, 5 points. Values: Tickets. The same data is available as a table.',
    )
    // A scatter chart's two measures, the vertical against the horizontal.
    expect(
      say.summary({
        label: 'Handle time and satisfaction',
        series: ['Agents'],
        points: 24,
        measure: 'Satisfaction',
        xMeasure: 'Handle time (min)',
      }),
    ).toContain('24 points. Values: Satisfaction against Handle time (min).')
    expect(
      say.summary({ label: 'Agents', series: ['Agents'], points: 24, xMeasure: 'Handle time' }),
    ).toContain('24 points. Values against Handle time.')
    expect(say.donutSummary({ label: 'Channels', segments: 1 })).toContain('Channels, 1 segment.')
    expect(say.heatmapSummary({ label: 'Load' })).toBe(
      'Load. The same data is available as a table.',
    )
    expect(say.heatmapSummary({ label: 'Load', grid: { rows: 7, columns: 24 } })).toContain(
      'Load, 7 rows by 24 columns.',
    )
    expect(say.radarSummary({ label: 'Skills', axes: 5, series: 2, max: '5' })).toContain(
      'Skills, 5 axes by 2 series, one shared scale from zero to 5.',
    )
  })

  it('appends the activation hint only when the chart is selectable', () => {
    const say = DEFAULT_CHART_MESSAGES
    expect(spokenSummary('Orientation.', say, false)).toBe('Orientation.')
    expect(spokenSummary('Orientation.', say, true)).toBe(
      'Orientation. Enter or Space selects the current reading.',
    )
  })
})

describe('domains: zero anchoring, fitting and gaps', () => {
  const rows: ChartDatum[] = [
    { day: 'Mon', opened: 12, resolved: 9 },
    { day: 'Tue', opened: 18, resolved: null },
    { day: 'Wed', opened: 7, resolved: 11 },
  ]

  it('anchors a zero domain at the origin regardless of the data', () => {
    expect(valueDomain(seriesValues(rows, ['opened']), 'zero')).toEqual([0, 18])
    expect(valueDomain([40, 42, 44], 'zero')).toEqual([0, 44])
  })

  it('fits an auto domain to the data', () => {
    expect(valueDomain([40, 42, 44], 'auto')).toEqual([40, 44])
  })

  it('leaves null values out of the domain', () => {
    // Treating a gap as 0 would put the resolved series' floor at the origin and
    // change the shape of every mark above it.
    expect(seriesValues(rows, ['resolved'])).toEqual([9, 11])
  })

  it('widens a domain with no spread instead of leaving it flat', () => {
    expect(valueDomain([5, 5], 'auto')).toEqual([0, 10])
    expect(valueDomain([5, 5], 'zero')).toEqual([0, 5])
    expect(valueDomain([], 'zero')).toEqual([0, 1])
  })

  it('keeps categories in row order without duplicates', () => {
    expect(bandDomain(rows, 'day')).toEqual(['Mon', 'Tue', 'Wed'])
    expect(bandDomain([{ a: 'x' }, { a: 'x' }, { a: 'y' }], 'a')).toEqual(['x', 'y'])
  })

  it('infers a time scale only when every row is a date', () => {
    expect(inferScale([{ d: '2026-08-04' }, { d: '2026-08-05' }], 'd')).toBe('time')
    expect(inferScale([{ d: '2026-08-04' }, { d: 'Tue' }], 'd')).toBe('band')
    expect(inferScale([], 'd')).toBe('band')
  })

  it('computes the time extent of a parsed date column', () => {
    const [low, high] = timeDomain([{ d: '2026-08-04' }, { d: '2026-08-06' }], 'd')
    expect(high - low).toBe(2 * DAY)
  })
})

describe('scales: the wrapped d3 scales', () => {
  it('places a band and finds the category under a pixel', () => {
    const scale = bandXScale(['Mon', 'Tue', 'Wed'], 300)
    expect(scale.bandwidth).toBeGreaterThan(0)
    expect(scale.center('Mon')).toBeLessThan(scale.center('Tue')!)
    expect(scale.at(scale.center('Tue')!)).toBe('Tue')
    // A pixel past either end clamps to the nearest band instead of returning
    // nothing. A pointer just past the last bar still targets the last bar.
    expect(scale.at(-50)).toBe('Mon')
    expect(scale.at(9999)).toBe('Wed')
  })

  it('rounds a continuous domain out to clean tick values', () => {
    // This is why the scale is borrowed: a home-grown tick algorithm produces
    // ticks such as 0, 3.7, 7.4.
    const scale = continuousScale('linear', [0, 37], [0, 100], 5)
    expect(scale.ticks.every((tick) => Number.isInteger(tick))).toBe(true)
    expect(scale.domain[0]).toBe(0)
    expect(scale.domain[1]).toBeGreaterThanOrEqual(37)
    expect(scale.at(scale.domain[0])).toBeCloseTo(0, 6)
    expect(scale.invert(scale.at(20))).toBeCloseTo(20, 6)
  })

  it('steps a time scale on calendar boundaries', () => {
    const start = new Date(2026, 0, 1).getTime()
    const end = new Date(2026, 11, 31).getTime()
    const scale = continuousScale('time', [start, end], [0, 600], 4)
    expect(scale.ticks.length).toBeGreaterThan(1)
    // Every tick lands on the first of a month. This boundary arithmetic is the
    // reason `d3-scale` is worth its 13 KB. It is also why the granularity is
    // derived from the tick step instead of being set: four ticks across a year
    // is a quarterly step, so the axis prints "Q1" with no configuration.
    for (const tick of scale.ticks) {
      expect(new Date(tick).getDate()).toBe(1)
    }
    expect(granularityFor(scale.step)).toBe('quarter')

    const monthly = continuousScale('time', [start, end], [0, 900], 12)
    expect(granularityFor(monthly.step)).toBe('month')
  })

  it('drops whole labels rather than rotating or clipping them', () => {
    const domain = Array.from({ length: 30 }, (_, index) => `d${index + 1}`)
    const kept = thinLabels(domain, 6)
    expect(kept.length).toBeLessThanOrEqual(7)
    expect(kept[0]).toBe('d1')
    // The last category is kept even if its gap is uneven. An axis whose
    // labels stop three bars from the end looks as if the data stops there too.
    expect(kept.at(-1)).toBe('d30')
    expect(thinLabels(domain, 100)).toEqual(domain)
    expect(thinLabels([], 5)).toEqual([])
  })

  it('keeps no label closer to the next than the stride, the last one included', () => {
    // Ten weeks where nine labels fit: every second label, and the last in place of the ninth.
    // Keeping both the ninth and the tenth put two labels one band apart, where one band is
    // less room than a label and its gap.
    const weeks = Array.from({ length: 10 }, (_, index) => `W${40 + index}`)
    expect(thinLabels(weeks, 9)).toEqual(['W40', 'W42', 'W44', 'W46', 'W49'])

    for (let count = 2; count <= 40; count += 1) {
      const domain = Array.from({ length: count }, (_, index) => index)
      for (let fits = 2; fits <= count; fits += 1) {
        const kept = thinLabels(domain, fits)
        const stride = Math.ceil(count / fits)
        expect(kept[0]).toBe(0)
        expect(kept.at(-1)).toBe(count - 1)
        expect(kept.length).toBeLessThanOrEqual(fits)
        for (let index = 1; index < kept.length; index += 1) {
          expect((kept[index] ?? 0) - (kept[index - 1] ?? 0)).toBeGreaterThanOrEqual(stride)
        }
      }
    }
  })
})

describe('anchorAtEnds: tick labels inside the plot', () => {
  const tick = (at: number, label: string) => ({ key: label, at, label })

  it('anchors the label on a tick at either end of the plot at that end, and centres the rest', () => {
    const ticks = anchorAtEnds([tick(0, '0'), tick(150, '50'), tick(300, '100')], 300)
    expect(ticks.map((entry) => entry.align)).toEqual(['start', undefined, 'end'])
    // The ticks stay where the scale put them, so the gridlines drawn from them do not move.
    expect(ticks.map((entry) => entry.at)).toEqual([0, 150, 300])
  })

  it('anchors a band label wider than the room beside its band, and centres one that fits', () => {
    const ticks = anchorAtEnds(
      [tick(34, 'Priya Raghunathan-Iyer'), tick(170, 'Wei'), tick(307, 'Sam Ferreira')],
      341,
    )
    expect(ticks.map((entry) => entry.align)).toEqual(['start', undefined, 'end'])
  })

  it('drops the label beside an anchored one that comes nearer than the gap, on an axis that drops labels', () => {
    // Histogram's dollar edges at phone width: anchored, $160.00 comes within 5px of $120.00.
    const ticks = [
      tick(0, '$0.00'),
      tick(80.75, '$40.00'),
      tick(161.5, '$80.00'),
      tick(242.25, '$120.00'),
      tick(323, '$160.00'),
    ]
    expect(anchorAtEnds(ticks, 323, 12).map((entry) => entry.label)).toEqual([
      '$0.00',
      '$40.00',
      '$80.00',
      '$160.00',
    ])
    // With no gap every label is kept.
    expect(anchorAtEnds(ticks, 323)).toHaveLength(5)
  })

  it('keeps the tick and draws no label beside an anchored one, on an axis whose ticks the scale chose', () => {
    // A horizontal BarChart's values in a 153px plot: anchored, 100 comes within 5px of 80.
    const ticks = [0, 20, 40, 60, 80, 100].map((value) => tick(value * 1.53, String(value)))
    const kept = anchorAtEnds(ticks, 153, 12, true)
    // Every tick stays where the scale put it, so no gridline is lost.
    expect(kept.map((entry) => entry.at)).toEqual(ticks.map((entry) => entry.at))
    expect(kept.map((entry) => entry.label)).toEqual(['0', '20', '40', '60', '', '100'])
    expect(kept.map((entry) => entry.align)).toEqual([
      'start',
      undefined,
      undefined,
      undefined,
      undefined,
      'end',
    ])
    // In a plot wide enough for every label, none gives way.
    const wide = [0, 20, 40, 60, 80, 100].map((value) => tick(value * 6, String(value)))
    expect(anchorAtEnds(wide, 600, 12, true).map((entry) => entry.label)).toEqual(
      wide.map((entry) => entry.label),
    )
  })

  it('anchors a label wider than the whole plot at the start', () => {
    expect(anchorAtEnds([tick(20, 'A label far wider than the plot')], 40)[0]?.align).toBe('start')
  })
})

describe('series: slots, emphasis and the legend', () => {
  it('assigns slots in declaration order', () => {
    const { series } = resolveSeries([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ])
    expect(series.map((entry) => entry.slot)).toEqual([1, 2])
    expect(series[0]!.paint).toBe('var(--pm-chart-1)')
    expect(series[1]!.paint).toBe('var(--pm-chart-2)')
  })

  it('reserves an explicit slot, so no two series share a colour', () => {
    const { series } = resolveSeries([
      { key: 'a', label: 'A', slot: 2 },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
    ])
    expect(series.map((entry) => entry.slot)).toEqual([2, 1, 3])
  })

  it('gives a status series its status role and no slot', () => {
    const { series } = resolveSeries([{ key: 'errors', label: 'Errors', tone: 'danger' }])
    expect(series[0]!.paint).toBe('var(--pm-danger-solid)')
    expect(series[0]!.slot).toBeUndefined()
  })

  it('warns when a series sets both tone and slot', () => {
    const { warnings } = resolveSeries([{ key: 'a', label: 'A', tone: 'danger', slot: 3 }])
    expect(warnings.join(' ')).toContain('never both')
  })

  it('folds series past the eighth into the other colour', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      key: `s${index}`,
      label: `S${index}`,
    }))
    const { series, warnings } = resolveSeries(many)
    expect(series.slice(0, 8).every((entry) => entry.slot !== undefined)).toBe(true)
    expect(series[8]!.paint).toBe(OTHER_PAINT)
    expect(series[8]!.folded).toBe(true)
    expect(warnings.join(' ')).toContain('Fold the tail')
  })

  it('mutes every series except the emphasised one and status series', () => {
    const { series } = resolveSeries([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'errors', label: 'Errors', tone: 'danger' },
    ])
    const painted = emphasised(series, 'a')
    expect(painted[0]!.paint).toBe('var(--pm-chart-1)')
    expect(painted[1]!.paint).toBe(OTHER_PAINT)
    // Reserved meaning is never greyed out. Muting a danger series because
    // another series is emphasised would hide what the tone exists to show.
    expect(painted[2]!.paint).toBe('var(--pm-danger-solid)')
  })

  it('warns when emphasis names a series that is not on the chart', () => {
    expect(emphasisWarning([{ key: 'a', label: 'A' }], 'b')).toContain('not a series')
    expect(emphasisWarning([{ key: 'a', label: 'A' }], 'a')).toBeUndefined()
    expect(emphasisWarning([{ key: 'a', label: 'A' }], undefined)).toBeUndefined()
  })

  it('derives the legend from the series count only', () => {
    const one = resolveSeries([{ key: 'a', label: 'A' }]).series
    const two = resolveSeries([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ]).series
    // One series gets no legend, because the panel title already names it and
    // a one-entry legend is only a label placed further from what it labels.
    expect(legendFor(one)).toBeNull()
    expect(legendFor(two)).toHaveLength(2)
  })
})

describe('stacking: d3 offsets and gap handling', () => {
  const rows: ChartDatum[] = [
    { day: 'Mon', a: 3, b: 7 },
    { day: 'Tue', a: 5, b: null },
    { day: 'Wed', a: 2, b: 8 },
  ]

  it('stacks in declaration order', () => {
    const [first, second] = stackSegments(rows, ['a', 'b'])
    expect(first![0]).toMatchObject({ from: 0, to: 3, present: true })
    expect(second![0]).toMatchObject({ from: 3, to: 10, present: true })
  })

  it('marks a gap as absent instead of a zero-height segment', () => {
    const [, second] = stackSegments(rows, ['a', 'b'])
    expect(second![1]!.present).toBe(false)
    expect(second![1]!.from).toBe(second![1]!.to)
  })

  it('normalises to one for the percent variant', () => {
    const [first, second] = stackSegments(rows, ['a', 'b'], 'percent')
    expect(second![0]!.to).toBeCloseTo(1, 6)
    expect(first![0]!.to).toBeCloseTo(0.3, 6)
  })

  it('detects values on both sides of zero', () => {
    expect(hasMixedSigns(rows, ['a', 'b'])).toBe(false)
    expect(hasMixedSigns([{ a: 4 }, { a: -2 }], ['a'])).toBe(true)
  })

  it('returns null for a gap', () => {
    expect(valueAt(rows[1], 'b')).toBeNull()
    expect(valueAt(rows[1], 'a')).toBe(5)
    expect(valueAt(undefined, 'a')).toBeNull()
  })
})

describe('geometry: hit testing and pixel snapping', () => {
  it('snaps the reading position to the nearest x, not to the nearest mark', () => {
    const positions = [0, 50, 100, 150]
    expect(nearestIndex(positions, 47)).toBe(1)
    expect(nearestIndex(positions, 76)).toBe(2)
    expect(nearestIndex(positions, -20)).toBe(0)
    expect(nearestIndex([], 10)).toBe(-1)
  })

  it('inflates a thin mark to the minimum pointer target', () => {
    expect(hitBox(100, 2)).toEqual({ start: 100 - HIT_TARGET_MIN / 2, size: HIT_TARGET_MIN })
    // A mark already wider than the minimum keeps its own size.
    expect(hitBox(100, 40)).toEqual({ start: 80, size: 40 })
  })

  it('counts how many labels fit across a width', () => {
    expect(labelCapacity(300, 40, 8)).toBe(6)
    expect(labelCapacity(10, 40, 8)).toBe(1)
  })

  it('snaps an odd-width hairline to the half-pixel grid', () => {
    // A 1px rule on an integer coordinate renders as a blurred 2px line.
    expect(crisp(10, 1)).toBe(10.5)
    expect(crisp(10.4, 2)).toBe(10)
  })

  it('finds the nearest point on the plane within the minimum hit distance', () => {
    // A linear scan for the any-neighbour forms. It is fast enough for the
    // tier's ≤ ~1k points. More than 24px from every mark, the pointer is over
    // the surface, not over data.
    const points = [{ x: 0, y: 0 }, { x: 50, y: 50 }, null, { x: 100, y: 0 }]
    expect(nearest2D(points, 55, 45)).toBe(1)
    expect(nearest2D(points, 99, 1)).toBe(3)
    // A `null` is a row with no place and is never the nearest.
    expect(nearest2D([null, { x: 10, y: 10 }], 10, 10)).toBe(1)
    // Farther than the minimum from every point, the pointer is over the surface.
    expect(nearest2D(points, 200, 200)).toBe(-1)
    expect(nearest2D(points, 0, HIT_TARGET_MIN + 1)).toBe(-1)
    expect(nearest2D([], 0, 0)).toBe(-1)
    // Ties keep the first point in data order.
    expect(
      nearest2D(
        [
          { x: 10, y: 0 },
          { x: 30, y: 0 },
        ],
        20,
        0,
      ),
    ).toBe(0)
  })
})

describe('signed bins: diverging arms, with the mid only at zero', () => {
  it('returns the mid for zero and only for zero', () => {
    expect(signedBinOf(0, 9)).toBe(0)
    expect(signedBinOf(-0, 9)).toBe(0)
    // A value near zero gets arm 1, because the mid means exactly zero.
    expect(signedBinOf(0.0001, 9)).toBe(1)
    expect(signedBinOf(-0.0001, 9)).toBe(-1)
  })

  it('bins three equal-width magnitude steps per side, boundaries to the outer bin', () => {
    // The same convention as `binOf`: a boundary value goes to the upper bin,
    // which here is the outer one, and the ceiling clamps into the outermost arm.
    expect(signedBinOf(1, 9)).toBe(1)
    expect(signedBinOf(3, 9)).toBe(2)
    expect(signedBinOf(4, 9)).toBe(2)
    expect(signedBinOf(6, 9)).toBe(3)
    expect(signedBinOf(8.9, 9)).toBe(3)
    expect(signedBinOf(9, 9)).toBe(3)
    expect(signedBinOf(-4, 9)).toBe(-2)
    expect(signedBinOf(-9, 9)).toBe(-3)
  })

  it('returns the mid when the amplitude is zero', () => {
    // A non-positive amplitude means the whole grid is zeros, and every zero
    // maps to the mid.
    expect(signedBinOf(0, 0)).toBe(0)
  })

  it('takes the symmetric range from the larger magnitude', () => {
    // Equal magnitudes get equal intensity. The range is `[-A, +A]` even when
    // one side is empty, because a lopsided range would emphasise one sign.
    expect(signedAmplitude([-6, 8])).toBe(8)
    expect(signedAmplitude([-6, -2])).toBe(6)
    expect(signedAmplitude([0, 0])).toBe(0)
  })
})

describe('polar geometry', () => {
  it('places spokes clockwise from 12 o’clock, in the donut’s frame', () => {
    expect(polarAngles(4)).toEqual([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2])
    expect(polarAngle(1, 6)).toBeCloseTo(Math.PI / 3)
    // 12 o'clock is up; a quarter turn clockwise is inline-end.
    const top = polarPoint(0, 10)
    expect(top.x).toBeCloseTo(0)
    expect(top.y).toBeCloseTo(-10)
    const right = polarPoint(Math.PI / 2, 10)
    expect(right.x).toBeCloseTo(10)
    expect(right.y).toBeCloseTo(0)
  })

  it('builds one zero-based nice’d scale and widens a flat maximum', () => {
    const scale = radialScale(47, 100)
    expect(scale.domain[0]).toBe(0)
    expect(scale.domain[1]).toBeGreaterThanOrEqual(47)
    expect(scale.at(0)).toBe(0)
    expect(scale.ticks).toContain(0)
    // A profile of zeros still gets a non-empty domain instead of dividing by zero.
    expect(radialScale(0, 100).domain).toEqual([0, 1])
  })

  it('draws rings as closed polygons through the spokes, never circles', () => {
    // A circle would imply a continuous scale between axes, which does not
    // exist. The scale exists only on the spokes.
    const ring = ringPath(polarAngles(5), 10)
    expect(ring.startsWith('M')).toBe(true)
    expect(ring.endsWith('Z')).toBe(true)
    expect(ring.match(/L/g)).toHaveLength(4)
    expect(ring).not.toContain('A')
    expect(ringPath([], 10)).toBe('')
  })

  it('closes a gapless profile and breaks a gapped one at the vertex', () => {
    const square = [
      { x: 0, y: -10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
    ]
    const closed = profilePath(square)
    expect(closed.endsWith('Z')).toBe(true)
    expect(closed.match(/M/g)).toHaveLength(1)

    // A `null` is a gap. The stroke breaks there and never dips to the centre.
    // The wrap edge, from the last vertex back to the first, still draws
    // because both of its ends exist.
    const gapped = profilePath([square[0]!, square[1]!, null, square[3]!])
    expect(gapped.match(/M/g)).toHaveLength(2)
    expect(gapped).not.toContain('Z')
  })
})

describe('binSample, the d3-array.bin wrapper', () => {
  it('uses Sturges by default and counts every observation once', () => {
    const sample = Array.from({ length: 32 }, (_, index) => index)
    const bins = binSample(sample)
    // n = 32 → ⌈log₂ 32⌉ + 1 = 6 as the target. d3 may adjust it to clean
    // thresholds, as it does for tick counts.
    expect(bins.length).toBeGreaterThanOrEqual(4)
    expect(bins.length).toBeLessThanOrEqual(9)
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(32)
  })

  it('produces contiguous bins with the maximum counted in the last bin', () => {
    const bins = binSample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let at = 1; at < bins.length; at += 1) {
      expect(bins[at]!.from).toBe(bins[at - 1]!.to)
    }
    // The sample's maximum lands in the last bin (the closed [a, b] rule), so
    // no empty bin is created past it. The last edge comes from d3:
    // count-derived thresholds nice the domain, so the edge may sit past the
    // maximum on a clean step, as with tick rounding.
    const last = bins[bins.length - 1]!
    expect(last.count).toBeGreaterThan(0)
    expect(last.to).toBeGreaterThanOrEqual(10)
    expect(bins.some((bin) => bin.from <= 10 && 10 <= bin.to && bin.count > 0)).toBe(true)
  })

  it('treats a given bin count as a target', () => {
    const sample = Array.from({ length: 240 }, (_, index) => (index * 7919) % 100)
    const twenty = binSample(sample, 20)
    expect(twenty.length).toBeGreaterThan(binSample(sample).length)
  })

  it('drops non-finite values and returns no bins for an empty sample', () => {
    expect(binSample([])).toEqual([])
    expect(binSample([Number.NaN, Infinity])).toEqual([])
    const bins = binSample([1, 2, Number.NaN, 3])
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3)
  })
})

describe('sqrtRadiusScale: area encodes the value', () => {
  it('maps the extent onto the given radius bounds', () => {
    const radius = sqrtRadiusScale([10, 100], [4, 12])
    expect(radius(10)).toBe(4)
    expect(radius(100)).toBe(12)
    const mid = radius(55)
    expect(mid).toBeGreaterThan(4)
    expect(mid).toBeLessThan(12)
  })

  it('grows the radius with the square root of the value', () => {
    const radius = sqrtRadiusScale([0, 100], [0, 10])
    // Area ∝ value: a quarter of the value is half the radius.
    expect(radius(25)).toBeCloseTo(5, 5)
  })

  it('puts a flat extent at the maximum radius, as binOf does', () => {
    const radius = sqrtRadiusScale([40, 40], [4, 12])
    expect(radius(40)).toBe(12)
  })
})

describe('divergingArms: arm steps by distance from zero', () => {
  const LIKERT: ChartDatum[] = [
    { q: 'A', sd: -9, d: -16, a: 31, sa: 14 },
    { q: 'B', sd: -4, d: -11, a: 38, sa: 17 },
  ]

  it('assigns arm 1 nearest zero and steps outward per side in declaration order', () => {
    const arms = divergingArms(LIKERT, ['sd', 'd', 'a', 'sa'])
    expect(arms[0]).toMatchObject({ side: 'neg', step: 1 })
    expect(arms[1]).toMatchObject({ side: 'neg', step: 2 })
    expect(arms[2]).toMatchObject({ side: 'pos', step: 1 })
    expect(arms[3]).toMatchObject({ side: 'pos', step: 2 })
    expect(arms[0]?.paint).toBe('var(--pm-chart-neg-1)')
    expect(arms[2]?.paint).toBe('var(--pm-chart-pos-1)')
  })

  it('clamps ranks past three at arm 3', () => {
    const rows: ChartDatum[] = [{ a: 1, b: 2, c: 3, d: 4 }]
    const arms = divergingArms(rows, ['a', 'b', 'c', 'd'])
    expect(arms.map((arm) => arm?.step)).toEqual([1, 2, 3, 3])
  })

  it('returns null for a series with no signed value', () => {
    const arms = divergingArms([{ a: 0, b: null, c: 5 }], ['a', 'b', 'c'])
    expect(arms[0]).toBeNull()
    expect(arms[1]).toBeNull()
    expect(arms[2]).toMatchObject({ side: 'pos', step: 1 })
  })

  it('stacks each sign outward from zero with the diverging offset', () => {
    const segments = stackSegments(LIKERT, ['sd', 'd', 'a', 'sa'], 'diverging')
    // Positives stack up from zero in series order, and negatives stack down.
    // The order within each bound pair is d3's, so the member reads the sign
    // from the bounds' sum.
    const a = segments[2]![0]!
    const sa = segments[3]![0]!
    expect(a.from).toBe(0)
    expect(a.to).toBe(31)
    expect(sa.from).toBe(31)
    expect(sa.to).toBe(45)
    const sd = segments[0]![0]!
    expect(Math.min(sd.from, sd.to)).toBe(-9)
    expect(Math.max(sd.from, sd.to)).toBe(0)
  })
})
