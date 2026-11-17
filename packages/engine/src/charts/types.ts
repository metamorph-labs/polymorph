import { CHART_SLOT_COUNT, type ChartSlot } from '@polymorph/theme'

import type { IconRole } from '../icon/roles'

/**
 * The chart grammar: the whole app-facing vocabulary of the chart tier (the
 * shared grammar, `docs/charts.md`). Everything else in `charts/` is anatomy.
 *
 * Some props are decision references instead of values (`slot`, `tone`,
 * `ValueFormat`). That keeps the grammar closed: a screen spec can express all
 * of it, and none of it can express a raw colour, a raw formatter or a
 * callback.
 *
 * `ChartSlot` is imported, not redeclared. The slots a series may take are the
 * palette's slots (`--pm-chart-1…8`), and two definitions of one closed set can
 * drift apart.
 */

export type { ChartSlot }

/**
 * Eight seats, and no ninth. Re-exported from the theme instead of restated,
 * because the number of seats is a property of the wheel (`CHART_ANCHORS`). A
 * second 8 written here would disagree with the wheel if the wheel changed.
 */
export { CHART_SLOT_COUNT }

/**
 * A series with a status meaning uses the status role, never a categorical
 * slot.
 *
 * The collision rule is `tone` XOR `slot`: a series is status or categorical,
 * never both in one chart. A palette does not assign reserved meaning.
 * `success` is green because it means success.
 */
export type SeriesTone = 'success' | 'danger' | 'warning' | 'info'

export interface ChartSeries {
  /** Field name in each datum. Other chart APIs call this a `dataKey`. */
  key: string
  /** Legend and tooltip name. It is never derived from the key, because naming is a decision. */
  label: string
  /**
   * Categorical slot 1–8. Defaults to declaration order. A slot is a named
   * decision reference, used instead of a per-series raw `color:`, which cannot
   * be expressed.
   */
  slot?: ChartSlot
  /** Status tone, the alternative to `slot` (`tone` XOR `slot`). Setting both is a dev-warning. */
  tone?: SeriesTone
  /**
   * Icon for the series' legend and tooltip key, rendered through the Icon
   * gateway. It appears beside the mark-shaped key, never in place of it,
   * because the mark carries the series identity.
   */
  icon?: IconRole
}

/**
 * Row shape. Time values are ISO-8601 strings, which the x scale parses. A
 * date-only string is a calendar date and is parsed without a timezone shift
 * (through `@internationalized/date`), so "2026-08-04" never renders as the
 * 3rd. Full timestamps keep their offset. Rows render in the given order.
 * Sorting is data logic (Stat's rule), and the chart never reorders. `null` is
 * a gap, never a zero, because a missing measurement is not a measurement of
 * nothing: lines break, a grouped bar is absent, a stacked segment is absent.
 * Every value is a literal, so a screen spec can express it. There are no
 * functions.
 */
export type ChartDatum = Readonly<Record<string, string | number | null>>

/**
 * Closed Intl descriptor, used instead of a formatter callback. Stat's rule is
 * that the app pre-formats values. A chart derives its ticks internally, so it
 * must format them, but it does so from a closed spec that a screen spec can
 * express.
 */
export interface ValueFormat {
  /**
   * Formatting style, default 'decimal'. 'percent' takes ratios (0–1), and the
   * formatter multiplies by 100 as in Intl. 'date' formats ISO values
   * (band-of-dates axes).
   */
  style?: 'decimal' | 'compact' | 'percent' | 'currency' | 'date'
  /** ISO 4217; required when style is 'currency'. */
  currency?: string
  maximumFractionDigits?: number
  /**
   * Date granularity, for style 'date' only. A `time` scale derives it from its
   * tick step. A band of ISO strings sets it (`'month'` turns "2026-08-01" into
   * "Aug"). `Intl` cannot produce `'quarter'`, so its glyph comes from
   * `ChartMessages.quarter`.
   */
  granularity?: DateGranularity
}

export type DateGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export const DATE_GRANULARITIES = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const satisfies readonly DateGranularity[]

/** Band is the default because most charts compare named things, not measured ones. */
export type ChartScaleKind = 'band' | 'time' | 'linear'

export interface ChartXAxis {
  key: string
  /** default 'band' */
  scale?: ChartScaleKind
  label?: string
  /** time scales format from tick granularity via Intl */
  format?: ValueFormat
  /**
   * Target tick count on continuous scales, which the engine adjusts to clean
   * steps. Band scales ignore it and thin labels to fit the width. Labels are
   * never rotated or clipped; when they cannot fit, a horizontal orientation or
   * the tooltip and twin carry the names.
   */
  ticks?: number
}

export interface ChartYAxis {
  label?: string
  format?: ValueFormat
  /** Target tick count, default ~4–5. Ticks are clean numbers with thousands separators. */
  ticks?: number
  /**
   * 'auto' fits the data (for lines). Bars are always 'zero', because a
   * truncated bar misstates its value. Setting 'auto' on a BarChart is a
   * dev-warning and is ignored.
   */
  domain?: 'auto' | 'zero'
}

/** Frame height; width is the container's. */
export type ChartSize = 'sm' | 'md' | 'lg'

export const CHART_SIZES = ['sm', 'md', 'lg'] as const satisfies readonly ChartSize[]

/** Tooltip row key. `dashed` is not offered, because a dashed line reads as a projection. */
export type TooltipIndicator = 'dot' | 'line'

export interface ChartTooltipConfig {
  indicator?: TooltipIndicator
  hideLabel?: boolean
}

/** A drawn reference line, such as a target or a budget. It never re-centres colour. */
export interface ChartBaseline {
  value: number
  label?: string
}

/**
 * The closed annotation union (the shared grammar, `docs/charts.md`). It holds
 * literals only, so a screen spec can express every annotation and none can
 * carry a callback.
 *
 * `line` and `band` use the member's own value domain (in AreaChart's
 * `percent` mode that domain is ratios). `point` names a place on both axes.
 * Its `x` is a category, an ISO date or a linear value, matching the member's
 * x axis. One shared presentational layer draws them in px space (the
 * frame's annotation layer, from `annotationLayers`). Members map values to
 * px, and the frame never sees scales. `baseline` is shorthand for the `line` kind and is its first
 * consumer.
 */
export type ChartAnnotation =
  | { kind: 'line'; value: number; label?: string }
  | { kind: 'band'; from: number; to: number; label?: string }
  | { kind: 'point'; x: string | number; y: number; label: string }

/**
 * Every sentence the chart tier prints, localizable by passing `messages`. Every
 * tier's sentences go through a `messages` prop like this one (the
 * accessibility contract, `docs/charts.md`).
 *
 * There is one type for the tier, not one per member. A dashboard has many
 * charts and one language. The host writes this catalog once and passes the
 * same object to every member, so a `DonutChart` added later is already
 * translated and a half-translated dashboard cannot be built. The cost is that
 * a host drawing only bars still writes the radar's sentence: every key once,
 * instead of a per-member type on each member. It is all keys or none, for the
 * same reason as `DataTableMessages`: two languages in one figure is worse than
 * either.
 *
 * Sentences are functions with named fields, because plural rules and word
 * order belong to the catalog. French puts the chart's name before a colon,
 * joins series with its own conjunction, and does not say "1 relevés". A
 * member passes facts (counts as numbers, names as the host wrote them, a
 * value already formatted by `Intl`), never a fragment of prose.
 *
 * The catalog leaves out what the host already controls: `label`, series and
 * axis labels, segment names. Those are props. The catalog covers the rest.
 */
export interface ChartMessages {
  /**
   * The summary sentence of a series chart (`BarChart`, `LineChart`,
   * `AreaChart`, `ScatterChart`) and of `Histogram`. A histogram's sample has
   * observations but no series, so `series` is empty there. The names arrive
   * as a list, not joined, because each language has its own list conjunction.
   */
  summary: (chart: { label: string; series: readonly string[]; points: number }) => string
  donutSummary: (chart: { label: string; segments: number }) => string
  /**
   * `grid` is absent before the plot is measured and when there is no data.
   * The sentence must still work without it, because it tells the reader the
   * table exists.
   */
  heatmapSummary: (chart: { label: string; grid?: { rows: number; columns: number } }) => string
  /**
   * `max` is the shared scale's top, already formatted with `format` and
   * `locale`. It is `''` before the plot is measured, because the scale does
   * not exist until then.
   */
  radarSummary: (chart: { label: string; axes: number; series: number; max: string }) => string
  /** `FunnelChart`'s summary: its name and how many stages it has. */
  funnelSummary: (chart: { label: string; stages: number }) => string
  /**
   * `Treemap`'s summary. `items` counts every item the chart lists, `groups` is
   * `0` for a treemap of one level, and `absent` counts the items with no
   * positive value, which take no area and are listed in the twin.
   */
  treemapSummary: (map: { label: string; items: number; groups: number; absent: number }) => string
  /**
   * Appended to the summary if and only if the member has an `onSelect`. The
   * plot keeps `role="img"`, so this sentence is the only place a reader learns
   * that the plot responds to Enter.
   */
  activationHint: string
  /**
   * The sentence on an empty plot. It is the only key whose English differs by
   * member, because three specs fix three sentences. It is also the key a host
   * most often rewords for a single panel: `{ ...catalog, empty: … }`.
   */
  empty: string
  /** Shown for a gap in the tooltip and the live region. A blank would read as zero. */
  noData: string
  /** The table twin's toggle, closed and open. It names the chart, because a dashboard has many. */
  showTable: (label: string) => string
  hideTable: (label: string) => string
  /** Names the twin's table and its scroll region, as heard when a reader lists tables. */
  tableLabel: (label: string) => string
  /** `DonutChart`'s twin headings, for the three columns no prop names. */
  segmentColumn: string
  valueColumn: string
  shareColumn: string
  /** `Histogram`'s twin headings when `x.label` / `y.label` are not supplied. */
  rangeColumn: string
  countColumn: string
  /**
   * `FunnelChart`'s twin headings: the stage, and the share of the stage before
   * it that reached this one. Its value and share columns use `valueColumn` and
   * `shareColumn`.
   */
  stageColumn: string
  continuedColumn: string
  /**
   * `FunnelChart`'s step between two stages, given the rate already formatted
   * as a percentage: "62% continued". It is drawn between the two bars and said
   * in the live region.
   */
  continued: (rate: string) => string
  /** `Treemap`'s twin headings for the group and the item, which no prop names. */
  groupColumn: string
  itemColumn: string
  /**
   * The quarter label on a date axis, given the quarter's number 1–4: `Q3` in
   * English, `T3` for a French host. It is the only key here that is notation,
   * not prose. It is in the catalog because the grammar gives composed text to
   * the catalog.
   *
   * `Intl` has no quarter field, so the tier composes the label itself, and a
   * composed label is in effect a sentence. `Q` is the first letter of an
   * English word, which neither law can detect (the word regex needs three
   * letters). The alternative is a literal on the closed `ValueFormat`
   * descriptor, a `quarterPrefix`. That would keep `formatValue` a function of
   * three arguments and let a screen spec write `'T'`. It is not used for four
   * reasons. Every field on that descriptor names an `Intl` option, and this
   * would be the first to name a word. A host would have to restate its
   * language on every quarterly axis, which produces the half-translated
   * dashboard this catalog exists to prevent: a chart added later with a bare
   * `{ scale: 'time' }` would say `Q3` on a French screen. A prefix cannot
   * express `3e trimestre`, where the number comes first. A function can, for
   * the same reason every other sentence here is a function: word order belongs
   * to the catalog. Finally, the descriptor is reused as the base of
   * `NumberInput`'s `NumberFormat`, so a word on it would have to be removed
   * there.
   *
   * The cost is that the formatter takes the catalog's notation next to
   * `locale` (`formatValue`'s fourth argument, typed
   * `Pick<ChartMessages, 'quarter'>` so a formatter cannot reach a sentence).
   * The few sites that print an x value pass it: a tick, a twin cell, a tooltip
   * header, an announcement. A number never takes the date path, so the value
   * side is unaffected. `chart-messages.test.tsx` renders a quarterly axis for
   * a French host and fails on a `Q`, so a site that forgets fails the test
   * instead of printing English.
   */
  quarter: (quarter: number) => string
}

/**
 * Props every cartesian member shares (the shared grammar, `docs/charts.md`).
 * Members narrow it (`Heatmap` drops `series` and `emphasis`, and `Sparkline`
 * shares almost none of it), so this is the common shape, not a base class.
 */
export interface CartesianChartProps {
  /** The data rows. `[]` renders the built-in empty state. */
  data: readonly ChartDatum[]
  /**
   * The series to draw, 1–8. A ninth gets a dev-warning about folding into
   * "Other", never a generated hue, because the wheel has eight seats.
   */
  series: readonly ChartSeries[]
  x: ChartXAxis
  /** Y axis configuration. The axis renders by default. */
  y?: ChartYAxis
  /** Frame height, from `--pm-chart-height-*`. The frame never nests a scroll region. */
  size?: ChartSize
  /**
   * The chart's accessible name. It is required, as for Progress, because an
   * unnamed chart tells a reader nothing.
   */
  label: string
  // The doc below avoids naming a browser global, because the client-directive
  // law matches bare words and would mark this pure type module as needing a
  // browser. The rule is to reword, not to loosen the regex, which would miss
  // real guards.
  /** The locale `Intl` formats with. When omitted, the runtime's own resolved locale applies. */
  locale?: string
  /**
   * Tooltip configuration, on with `'dot'` by default. `false`, for print and
   * report surfaces, removes only the visual layer.
   */
  tooltip?: ChartTooltipConfig | false
  /**
   * Key of the series to emphasise. It keeps its slot colour and the rest use
   * `--pm-chart-other`. A status-toned series keeps its status colour, because
   * reserved meaning is never greyed out.
   */
  emphasis?: string
  baseline?: ChartBaseline
  /**
   * Annotations from the closed union above: line, band and point, literals
   * only. The frame's shared annotation layer draws them in
   * `--pm-chart-axis`, with bands washed in `--pm-chart-other` at 0.08. An
   * annotation never re-centres colour. Colliding labels are dropped, but the
   * annotation itself always draws because the app asked for it explicitly.
   */
  annotations?: readonly ChartAnnotation[]
  /**
   * Loading state. On first render the frame shows a quiet `Skeleton`; on
   * refetch it shows the previous frame at reduced opacity, with no layout jump
   * or flash. Failure is not a chart state: the app reports errors, and a chart
   * shows only data, never network status.
   */
  loading?: boolean
  /**
   * The tier's message catalog. When omitted, the generic English defaults
   * apply. A localized host passes its own, the same object to every chart on
   * the screen.
   */
  messages?: ChartMessages
}

/**
 * What the frame is showing, as one word. `empty` comes from
 * `data.length === 0`, and `loading` takes precedence when both apply.
 */
export type ChartState = 'ready' | 'loading' | 'empty'

export function chartState(rows: readonly unknown[], loading: boolean | undefined): ChartState {
  if (loading) return 'loading'
  return rows.length === 0 ? 'empty' : 'ready'
}
