import { formatValue, type NotationMessages } from './format'
import type { ResolvedSeries } from './series'
import { valueAt } from './series'
import type { ChartDatum, ChartXAxis, ChartYAxis, ValueFormat } from './types'
import type { ChartTooltipRow, ChartTwinColumn } from './anatomy'

/**
 * Formats the numbers a chart shows in its tooltip, live region and table twin.
 *
 * A chart states its data four times: in the marks, in the tooltip, in the live
 * region a keyboard user hears, and in the table twin. They must agree exactly.
 * A tooltip reading `1.2M` beside a twin reading `1,240,000` gives two answers,
 * so every one is formatted here, once, through `format.ts`.
 *
 * It is apart from the scales and the geometry because it is about *reading*,
 * not arithmetic. They turn data into positions; this turns data into text.
 */

/**
 * The x label for each row: a category as written, a date at its granularity,
 * or a quarter in the catalog's notation.
 */
export function categoryLabels(
  rows: readonly ChartDatum[],
  x: ChartXAxis,
  locale: string | undefined,
  messages: NotationMessages,
  fallbackFormat?: ValueFormat,
): string[] {
  const format = x.format ?? fallbackFormat
  return rows.map((row) => {
    const value = row[x.key]
    return formatValue(value ?? '', format, locale, messages)
  })
}

/**
 * One tooltip row per series at a reading position, in declaration order.
 *
 * `noData` is the catalog's text for a gap (`ChartMessages.noData`). It is an
 * argument because this module only formats; every sentence comes from the
 * host.
 */
export function readingRows(
  rows: readonly ChartDatum[],
  index: number,
  series: readonly ResolvedSeries[],
  format: ValueFormat | undefined,
  locale: string | undefined,
  noData: string,
): ChartTooltipRow[] {
  const row = rows[index]
  return series.map((entry) => {
    const value = valueAt(row, entry.key)
    return {
      key: entry.key,
      label: entry.label,
      // A gap shows the no-data text, because a blank would read as zero.
      value: value === null ? noData : formatValue(value, format, locale),
      paint: entry.paint,
    }
  })
}

/**
 * What a keyboard user hears when the position moves.
 *
 * A sentence, not the tooltip's layout. The tooltip's three columns are visual,
 * and a live region announcing "Mon 12 9" would read out the layout instead of
 * the data.
 */
export function announcement(category: string, rows: readonly ChartTooltipRow[]): string {
  if (rows.length === 0) return ''
  const values = rows.map((row) => `${row.label} ${row.value}`).join(', ')
  return category === '' ? values : `${category}: ${values}`
}

/**
 * The same numbers, starting with the series selected by Up/Down.
 *
 * The whole-band sentence starts with the category because the reader is
 * walking categories. A reader walking series is asking about one mark, so the
 * mark comes first and its band comes last.
 */
export function seriesAnnouncement(category: string, row: ChartTooltipRow): string {
  const lead = `${row.label}: ${row.value}`
  return category === '' ? lead : `${lead} — ${category}`
}

/** The twin's header row: the x column, then one per series. */
export function twinColumns(x: ChartXAxis, series: readonly ResolvedSeries[]): ChartTwinColumn[] {
  return [
    { key: '__x', label: x.label ?? columnName(x.key) },
    ...series.map((entry) => ({ key: entry.key, label: entry.label, numeric: true })),
  ]
}

/** The twin's body: every value the chart draws, formatted exactly as in the tooltip. */
export function twinRows(
  rows: readonly ChartDatum[],
  categories: readonly string[],
  series: readonly ResolvedSeries[],
  format: ValueFormat | undefined,
  locale: string | undefined,
): string[][] {
  return rows.map((row, index) => [
    categories[index] ?? '',
    ...series.map((entry) => {
      const value = valueAt(row, entry.key)
      return value === null ? '' : formatValue(value, format, locale)
    }),
  ])
}

/**
 * A field name as a column heading, when the axis does not carry one.
 *
 * `firstResponse` → `First response`. It is deliberately not a general
 * humaniser. It is the fallback for an x axis with no label, and the fix is to
 * give the axis a label, so this stays small.
 */
function columnName(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

/** Whether the y axis is anchored at zero. Bars force it; lines default to fitting. */
export function yDomainMode(y: ChartYAxis | undefined, forced: 'zero' | 'auto'): 'zero' | 'auto' {
  return forced === 'zero' ? 'zero' : (y?.domain ?? 'auto')
}
