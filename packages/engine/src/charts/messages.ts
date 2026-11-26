import type { ChartMessages } from './types'

/**
 * The English defaults the chart tier uses when a host passes no messages, all
 * in one module.
 *
 * Text spread across many files (a sentence composed in `format.ts`, a
 * constant in the readout, headings in an object literal inside a member, a
 * toggle's name behind a ternary) cannot be reached by any prop, and most of
 * it is invisible to the law that reads JSX sites
 * (`packages/rules/src/localization.test.ts`). These defaults are the only
 * place English may appear in `charts/`. `chart-messages.test.tsx` derives the
 * vocabulary it forbids for a localized host from this object, so a sentence
 * added here is covered as soon as it is added.
 *
 * It lives in the engine, beside `format.ts`, because both turn a fact into
 * text. It uses no React and no browser API, because a default is a plain
 * value.
 */

/** "Opened", "Opened and Resolved", "Opened, Resolved and Escalated". */
function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const counted = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`

/**
 * The measures a summary names, as one sentence: "Values: Tickets.", and on a
 * scatter chart "Values: Satisfaction against Handle time." Empty when the
 * chart names none.
 */
function measured(measure: string | undefined, xMeasure: string | undefined): string {
  if (measure === undefined && xMeasure === undefined) return ''
  return ` Values${measure === undefined ? '' : `: ${measure}`}${xMeasure === undefined ? '' : ` against ${xMeasure}`}.`
}

/**
 * A summary sentence, not a chart description. The table twin holds the data.
 * The summary helps someone decide whether to open it, so every summary ends by
 * saying the table exists (the accessibility contract, `docs/charts.md`).
 */
const TWIN = 'The same data is available as a table.'

export const DEFAULT_CHART_MESSAGES: ChartMessages = {
  summary: ({ label, series, points, measure, xMeasure }) =>
    `${label}${series.length === 0 ? '' : ` showing ${listed(series)}`}, ${counted(points, 'point', 'points')}.${measured(measure, xMeasure)} ${TWIN}`,
  donutSummary: ({ label, segments }) =>
    `${label}, ${counted(segments, 'segment', 'segments')}. ${TWIN}`,
  // Reports the grid's shape, not a count of measurements. A count such as
  // "42 cells" over a mostly empty fortnight tells the reader nothing useful.
  heatmapSummary: ({ label, grid }) =>
    grid === undefined
      ? `${label}. ${TWIN}`
      : `${label}, ${grid.rows} rows by ${grid.columns} columns. ${TWIN}`,
  // The domain maximum appears here and in the twin because the rings carry no
  // figures.
  radarSummary: ({ label, axes, series, max }) =>
    `${label}, ${axes} axes by ${series} series, one shared scale from zero to ${max}. ${TWIN}`,
  funnelSummary: ({ label, stages }) => `${label}, ${counted(stages, 'stage', 'stages')}. ${TWIN}`,
  treemapSummary: ({ label, items, groups, absent }) =>
    `${label}, ${counted(items, 'item', 'items')}${groups === 0 ? '' : ` in ${counted(groups, 'group', 'groups')}`}.${
      absent === 0
        ? ''
        : ` ${absent === 1 ? '1 has' : `${absent} have`} no positive value and ${absent === 1 ? 'is' : 'are'} not drawn.`
    } ${TWIN}`,
  activationHint: 'Enter or Space selects the current reading.',
  empty: 'No data yet',
  noData: 'No data',
  showTable: (label) => `Show the data table for ${label}`,
  hideTable: (label) => `Hide the data table for ${label}`,
  tableLabel: (label) => `${label} — data`,
  segmentColumn: 'Segment',
  valueColumn: 'Value',
  shareColumn: 'Share',
  rangeColumn: 'Range',
  countColumn: 'Count',
  stageColumn: 'Stage',
  continuedColumn: 'Continued',
  continued: (rate) => `${rate} continued`,
  groupColumn: 'Group',
  itemColumn: 'Item',
  // Notation, not prose. It is the only key a formatter reads: `Intl` has no
  // quarter field, so `format.ts` asks the catalog (`ChartMessages.quarter`).
  quarter: (quarter) => `Q${quarter}`,
}

/**
 * The two member-specific variants. `empty` is the only key whose English
 * differs by member, because three specs fix three different empty sentences.
 * The variants live here, not in the members, so all of the tier's English is
 * in this module and `chart-messages.test.tsx` can derive its forbidden
 * vocabulary from all three.
 */

/**
 * `LineChart` · `AreaChart` (`line-chart.md`, `area-chart.md`): a trend covers a span of time, so
 * the empty message refers to the range.
 */
export const DEFAULT_RANGE_MESSAGES: ChartMessages = {
  ...DEFAULT_CHART_MESSAGES,
  empty: 'No data in this range',
}

/** `Heatmap` (`heatmap.md`): an empty grid means no activity over the span the axes cover. */
export const DEFAULT_GRID_MESSAGES: ChartMessages = {
  ...DEFAULT_CHART_MESSAGES,
  empty: 'No activity in this range',
}

/**
 * The summary the frame announces: the summary sentence, then the activation
 * hint only when the member has an `onSelect` to call. Naming an activation the
 * chart does not have would describe an interaction that does not exist.
 */
export function spokenSummary(
  summary: string,
  messages: ChartMessages,
  selectable: boolean,
): string {
  return selectable ? `${summary} ${messages.activationHint}` : summary
}
