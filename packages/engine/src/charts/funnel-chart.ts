import type { ChartReadout, ChartTooltipRow, ChartTwinColumn } from './anatomy'
import { ESTIMATED_AXIS_TEXT_PX } from './cartesian'
import { formatValue } from './format'
import { barPath, estimateTextWidth, hitBox, labelCapacity } from './geometry'
import type { MeasuredBox } from './measured-box'
import { DEFAULT_CHART_MESSAGES, spokenSummary } from './messages'
import type { ReadingPosition, ReadingView } from './reading'
import { thinLabels } from './scales'
import { resolveSeries } from './series'
import {
  chartState,
  type ChartMessages,
  type ChartState,
  type ChartTooltipConfig,
  type ValueFormat,
} from './types'

/**
 * FunnelChart's drawing (`design/components/funnel-chart.md`): everything the
 * member shows that follows from its props and the measured plot, and what it
 * shows at a reading position. Every framework's FunnelChart renders it, so the
 * bars, the shares, the step rates and the readout's words are decided once.
 *
 * A funnel is one series of counts over ordered stages, drawn as horizontal
 * bars from the inline start, one stage per row, top to bottom. A bar's length
 * is its value against the largest stage. Each stage states its value and its
 * share of the first stage, and the gap between two bars states the share of
 * the stage above that reached the stage below. Bars are plain rectangles: a
 * tapered trapezoid would state each value by an area that also depends on its
 * neighbours.
 *
 * The data is the app's. Stages are drawn in the order given, and a stage that
 * is larger than the one before it is drawn as it is, with a dev warning,
 * because a funnel that clamped or reordered its stages would show counts that
 * were never measured.
 */

export interface FunnelStage {
  key: string
  label: string
  /** A count. Stages are expected not to rise from one to the next. */
  value: number
}

export interface FunnelChartInput {
  stages: readonly FunnelStage[]
  /** Formats each stage's value in the plot, the tooltip and the twin. */
  format?: ValueFormat | undefined
  /** The chart's accessible name. */
  label: string
  locale?: string | undefined
  messages?: ChartMessages | undefined
  /** The tooltip's configuration; it shapes the readout and not the marks. */
  tooltip?: ChartTooltipConfig | false | undefined
  loading?: boolean | undefined
  /** Whether the member has an `onSelect`: the summary then says the plot responds to Enter. */
  selectable?: boolean | undefined
  /** The measured plot, or `null` before the first measurement. */
  box: MeasuredBox | null
}

/** One stage's bar and its pointer target. */
export interface FunnelBar {
  key: string
  /** The stage's position in `stages`, which the reading walks. */
  index: number
  /** The painted bar; `''` for a stage that draws none (a zero, a negative, not a number). */
  d: string
  /** A `var(--pm-chart-…)` reference, set as `--pm-chart-mark`. */
  paint: string
  /** The pointer target: the stage's whole row, at least `HIT_TARGET_MIN` tall. */
  hit: { x: number; y: number; width: number; height: number }
}

/**
 * A line of text the plot draws: a stage's label, its value and share, or the
 * step rate between two stages. `x` is the distance from the plot's inline
 * start and `y` the line's centre, both in px.
 */
export interface FunnelText {
  key: string
  index: number
  text: string
  x: number
  y: number
}

/** The plot at its measured size. */
export interface FunnelPlot {
  width: number
  height: number
  /**
   * Where every bar starts, in px from the inline start: the end of the label
   * column. The stylesheet's entrance grows the bars from it
   * (`--pm-chart-zero`). It is geometry, not a design value.
   */
  start: number
  /** The label column's width, set as each label's maximum inline size. */
  labelWidth: number
  bars: FunnelBar[]
  /** The stage labels that fit, in the label column. */
  labels: FunnelText[]
  /** Each shown stage's value and share, just past its bar's end. */
  values: FunnelText[]
  /** The step rates, each between the two bars it joins, when a line fits there. */
  steps: FunnelText[]
}

export interface FunnelChartModel {
  state: ChartState
  /** The one series' colour: a funnel is one series, so every bar shares it. */
  paint: string
  /** The visually hidden sentence that orients a reader. */
  summary: string
  /** One message per unlawful use, each naming what the member does instead. */
  warnings: string[]
  twin: { columns: ChartTwinColumn[]; rows: string[][] }
  /**
   * Each stage's share of the first stage, index-aligned with `stages`. `null`
   * where there is no share: a first stage of zero, or a value that is not a
   * count.
   */
  shares: (number | null)[]
  /**
   * The share of the stage before that reached each stage, index-aligned with
   * `stages`. `null` for the first stage, after a stage of zero, and for a value
   * that is not a count.
   */
  rates: (number | null)[]
  /** Each stage's row centre down the plot, in px; empty before the measurement. */
  positions: number[]
  /** Each stage's bar end along the inline axis, in px; empty before the measurement. */
  ends: number[]
  /** The marks, or `null` before the plot is measured. */
  plot: FunnelPlot | null
}

/** A bar is at most 24px thick, the tier's bar-thickness cap (`--pm-space-6`). */
const MAX_BAR_PX = 24

/** The thinnest bar that still reads as a bar. */
const MIN_BAR_PX = 4

/**
 * One line of `text.xs`, estimated as BarChart estimates a band label's line
 * box: the text's size and half again.
 */
const LINE_PX = ESTIMATED_AXIS_TEXT_PX * 1.5

/** The share of a row the bar leaves empty when no step rate is drawn under it. */
const ROW_SPACING = 0.4

/** The space between the label column and the bars, and between a bar's end and its value. */
const TEXT_GAP_PX = 8

/** The most of the plot's width the label column takes; a longer label ends in an ellipsis. */
const LABEL_SHARE = 0.4

/** The narrowest run the bars keep: below it, the values leave the plot for the tooltip. */
const MIN_BAR_RUN_PX = 48

/** The share and the step rate: percentages of a count, to one decimal place. */
const SHARE: ValueFormat = { style: 'percent', maximumFractionDigits: 1 }

/** Whether a value is a count a bar can draw: a finite number, zero or more. */
const counts = (value: number) => Number.isFinite(value) && value >= 0

/** `part` over `whole`, or `null` when there is no ratio to state. */
const ratio = (part: number, whole: number): number | null =>
  counts(part) && counts(whole) && whole > 0 ? part / whole : null

/** A stage's value as the plot, the tooltip and the twin print it; `''` for a value that is not a number. */
const valueText = (value: number, format: ValueFormat | undefined, locale: string | undefined) =>
  formatValue(value, format, locale)

/** A stage's value and its share of the first stage, as one line. */
function amountText(
  value: number,
  share: number | null,
  format: ValueFormat | undefined,
  locale: string | undefined,
): string {
  const printed = valueText(value, format, locale)
  const shown = printed === '' ? '—' : printed
  return share === null ? shown : `${shown} · ${formatValue(share, SHARE, locale)}`
}

export function funnelChartModel(input: FunnelChartInput): FunnelChartModel {
  const {
    stages,
    format,
    label,
    locale,
    messages = DEFAULT_CHART_MESSAGES,
    loading = false,
    selectable = false,
    box,
  } = input

  // One series, so it takes slot 1 through the same resolution every chart uses.
  const paint = resolveSeries([{ key: 'stages', label }]).series[0]?.paint ?? ''

  const first = stages[0]?.value ?? 0
  const shares = stages.map((stage) => ratio(stage.value, first))
  const rates = stages.map((stage, index) =>
    index === 0 ? null : ratio(stage.value, stages[index - 1]?.value ?? 0),
  )

  /*
   * Dev warnings, each saying what the member does instead. Nothing is clamped
   * and nothing is reordered: the stages are drawn as the app passes them.
   */
  const warnings: string[] = []
  const rising = stages.filter(
    (stage, index) =>
      index > 0 && counts(stage.value) && stage.value > (stages[index - 1]?.value ?? Infinity),
  )
  if (rising.length > 0) {
    warnings.push(
      `${rising.map((stage) => `"${stage.label}"`).join(', ')} ${rising.length === 1 ? 'is' : 'are'} larger than the stage before. A funnel's counts do not rise from one stage to the next; FunnelChart draws the stages as given, in the order given, and clamps nothing.`,
    )
  }
  if (stages.some((stage) => Number.isFinite(stage.value) && stage.value < 0)) {
    warnings.push(
      'A stage is a count and cannot be negative. A negative stage draws no bar and has no share; its value stays in the table twin.',
    )
  }

  let plot: FunnelPlot | null = null
  let positions: number[] = []
  let ends: number[] = []
  if (box !== null && box.width > 0 && box.height > 0 && stages.length > 0) {
    const { width, height } = box
    const count = stages.length
    const row = height / count
    positions = stages.map((_, index) => row * (index + 0.5))

    /*
     * Labels are never shrunk and never overlap. When the rows are shorter than
     * a line, whole labels drop at an even stride, as a band axis thins its
     * labels, and a stage's value goes with its label. The tooltip, the live
     * region and the twin still name every stage.
     */
    const kept = new Set(
      thinLabels(
        stages.map((_, index) => index),
        labelCapacity(height, LINE_PX, 0),
      ),
    )

    const labelWidth = Math.min(
      width * LABEL_SHARE,
      Math.max(0, ...stages.map((stage) => estimateTextWidth(stage.label, ESTIMATED_AXIS_TEXT_PX))),
    )
    const start = labelWidth > 0 ? labelWidth + TEXT_GAP_PX : 0
    const amounts = stages.map((stage, index) =>
      amountText(stage.value, shares[index] ?? null, format, locale),
    )
    const amountWidth = Math.max(
      0,
      ...amounts.map((text) => estimateTextWidth(text, ESTIMATED_AXIS_TEXT_PX)),
    )
    /*
     * The bars run from the label column to where the longest value still fits
     * after the longest bar. On a plot too narrow for both, the values leave the
     * plot, because a bar too short to compare is worse than a number read from
     * the tooltip or the twin.
     */
    const withValues = width - start - TEXT_GAP_PX - amountWidth
    const valuesShown = withValues >= MIN_BAR_RUN_PX
    const run = Math.max(0, valuesShown ? withValues : width - start)

    const largest = Math.max(0, ...stages.map((stage) => (counts(stage.value) ? stage.value : 0)))
    const lengthOf = (value: number) => (largest > 0 && counts(value) ? (value / largest) * run : 0)

    /*
     * A step rate takes a line between two bars. It is drawn only when every
     * row has room for the line and a bar of the minimum thickness, and when the
     * longest rate fits across the bars' run, so the rates are all drawn or
     * none are.
     */
    const stepTexts = rates.map((rate) =>
      rate === null ? '' : messages.continued(formatValue(rate, SHARE, locale)),
    )
    const stepsShown =
      count > 1 &&
      row - LINE_PX >= MIN_BAR_PX &&
      Math.max(0, ...stepTexts.map((text) => estimateTextWidth(text, ESTIMATED_AXIS_TEXT_PX))) <=
        width - start
    const thickness = Math.min(
      MAX_BAR_PX,
      Math.max(1, stepsShown ? row - LINE_PX : row * (1 - ROW_SPACING)),
    )

    ends = stages.map((stage) => start + lengthOf(stage.value))
    const bars = stages.map((stage, index): FunnelBar => {
      const center = positions[index] ?? 0
      const length = lengthOf(stage.value)
      const target = hitBox(center, row)
      return {
        key: stage.key,
        index,
        d: length > 0 ? barPath(start, center - thickness / 2, length, thickness, 'right') : '',
        paint,
        hit: { x: 0, y: target.start, width, height: target.size },
      }
    })

    plot = {
      width,
      height,
      start,
      labelWidth,
      bars,
      labels: stages.flatMap((stage, index) =>
        kept.has(index)
          ? [{ key: stage.key, index, text: stage.label, x: 0, y: positions[index] ?? 0 }]
          : [],
      ),
      values: valuesShown
        ? stages.flatMap((stage, index) =>
            kept.has(index)
              ? [
                  {
                    key: stage.key,
                    index,
                    text: amounts[index] ?? '',
                    x: (ends[index] ?? start) + TEXT_GAP_PX,
                    y: positions[index] ?? 0,
                  },
                ]
              : [],
          )
        : [],
      steps: stepsShown
        ? stages.flatMap((stage, index) => {
            const text = stepTexts[index] ?? ''
            return index === 0 || text === ''
              ? []
              : [{ key: stage.key, index, text, x: start, y: row * index }]
          })
        : [],
    }
  }

  return {
    state: chartState(stages, loading),
    paint,
    summary: spokenSummary(
      messages.funnelSummary({ label, stages: stages.length }),
      messages,
      selectable,
    ),
    warnings,
    twin: {
      columns: [
        { key: '__stage', label: messages.stageColumn },
        { key: '__value', label: messages.valueColumn, numeric: true },
        { key: '__share', label: messages.shareColumn, numeric: true },
        { key: '__continued', label: messages.continuedColumn, numeric: true },
      ],
      rows: stages.map((stage, index) => {
        const share = shares[index] ?? null
        const rate = rates[index] ?? null
        return [
          stage.label,
          valueText(stage.value, format, locale),
          share === null ? '' : formatValue(share, SHARE, locale),
          rate === null ? '' : formatValue(rate, SHARE, locale),
        ]
      }),
    },
    shares,
    rates,
    positions,
    ends,
    plot,
  }
}

/**
 * What the chart shows at a reading position: the tooltip's row, the live
 * region's sentence and the tooltip itself. Both give the stage's value, its
 * share of the first stage and the share of the stage before that reached it,
 * so a stage whose step rate the plot had no room for still states it. A value
 * that is not a number shows the twin's em dash. `tooltip: false` removes only
 * the visual layer: the announcement stays.
 */
export function funnelChartReadout(
  input: FunnelChartInput,
  model: FunnelChartModel,
  view: ReadingView,
): ChartReadout {
  const { stages, format, locale, tooltip = {}, box } = input
  const messages = input.messages ?? DEFAULT_CHART_MESSAGES
  const stage = view.index === null ? undefined : stages[view.index]
  if (view.index === null || stage === undefined) {
    return { rows: [], announcement: '', tooltip: null }
  }
  const printed = valueText(stage.value, format, locale)
  const value = printed === '' ? '—' : printed
  const share = model.shares[view.index] ?? null
  const rate = model.rates[view.index] ?? null
  const step = rate === null ? undefined : messages.continued(formatValue(rate, SHARE, locale))
  const rows: ChartTooltipRow[] = [
    {
      key: stage.key,
      label: stage.label,
      value: amountText(stage.value, share, format, locale),
      paint: model.paint,
    },
  ]

  const at =
    model.plot === null || box === null
      ? null
      : {
          x: Math.min(box.width, Math.max(model.plot.start, model.ends[view.index] ?? 0)),
          y: model.positions[view.index] ?? 0,
        }

  return {
    rows,
    announcement: [
      `${stage.label}: ${value}`,
      ...(share === null ? [] : [formatValue(share, SHARE, locale)]),
      ...(step === undefined ? [] : [step]),
    ].join(', '),
    tooltip:
      tooltip === false || !view.active || at === null || box === null
        ? null
        : {
            ...(tooltip.hideLabel || step === undefined ? {} : { header: step }),
            rows,
            indicator: tooltip.indicator ?? 'dot',
            ...at,
            side: at.x > box.width / 2 ? 'start' : 'end',
          },
  }
}

/**
 * What `onSelect` reports at a position: the stage's index, key, label and
 * value. A stage whose value is not a number reports nothing, because the
 * payload's `value` must be a number. `null` when nothing is read.
 */
export function funnelChartSelection(
  input: FunnelChartInput,
  _model: FunnelChartModel,
  at: ReadingPosition,
): { index: number; key: string; label: string; value: number } | null {
  const stage = at.index === null ? undefined : input.stages[at.index]
  if (at.index === null || stage === undefined || !Number.isFinite(stage.value)) return null
  return { index: at.index, key: stage.key, label: stage.label, value: stage.value }
}
