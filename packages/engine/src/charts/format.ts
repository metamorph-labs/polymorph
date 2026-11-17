import { parseAbsoluteToLocal, parseDate } from '@internationalized/date'

import { DEFAULT_CHART_MESSAGES } from './messages'
import {
  DATE_GRANULARITIES,
  type ChartMessages,
  type DateGranularity,
  type ValueFormat,
} from './types'

/**
 * Formats every string a chart prints. It imports no d3
 * (`design/components/README-substrates.md`, the transitive packages).
 *
 * `d3-format` and `d3-time-format` arrive transitively with `d3-scale` and are
 * never called. Tick values come from the scale. Tick and tooltip labels come
 * from `Intl`, with the locale taken from a prop. Formatting a date through
 * `d3-time-format` would add a second locale system beside the one the
 * vocabulary already has. No lint rule can catch a transitive import, so the
 * rule is kept here, in the file that would otherwise call those packages.
 */

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/** `2026-08-04` — a calendar date, with no time and therefore no timezone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses an ISO string as an instant.
 *
 * A date-only string is a calendar date and is read at local midnight, not at
 * UTC midnight. `new Date('2026-08-04')` parses as UTC and renders as the 3rd
 * anywhere west of Greenwich. That puts every axis label one day early, which
 * is easy to miss until a month boundary. Full timestamps carry their own
 * offset and are read as written.
 *
 * Returns `null` for anything unparseable, so a bad row gives an unlabelled
 * tick instead of throwing during render.
 */
export function parseIso(value: string): Date | null {
  try {
    if (DATE_ONLY.test(value)) {
      // `parseDate` does not accept a timezone in its type. A calendar date has
      // no offset to apply.
      return parseDate(value).toDate(localTimeZone())
    }
    return parseAbsoluteToLocal(value).toDate()
  } catch {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Whether a value is a time the x scale can place. Used to pick a default scale. */
export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIso(value) !== null
}

/* -------------------------------------------------------------------------- */
/* Formatters                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Intl` formatters are expensive to construct and cheap to reuse, and an axis
 * builds one per tick without this. Keyed on the resolved options, so two axes
 * with the same descriptor share one.
 */
const NUMBER_CACHE = new Map<string, Intl.NumberFormat>()
const DATE_CACHE = new Map<string, Intl.DateTimeFormat>()

function numberFormatter(locale: string | undefined, options: Intl.NumberFormatOptions) {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let formatter = NUMBER_CACHE.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    NUMBER_CACHE.set(key, formatter)
  }
  return formatter
}

function dateFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions) {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let formatter = DATE_CACHE.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    DATE_CACHE.set(key, formatter)
  }
  return formatter
}

function numberOptions(format: ValueFormat | undefined): Intl.NumberFormatOptions {
  const digits = format?.maximumFractionDigits
  switch (format?.style) {
    case 'compact':
      // Default to one fraction digit so compact notation prints `1.2M`, not
      // `1M`. With none, 1.2 and 1.9 print the same.
      return { notation: 'compact', maximumFractionDigits: digits ?? 1 }
    case 'percent':
      // Intl semantics: the input is a ratio and the formatter multiplies by 100.
      return { style: 'percent', maximumFractionDigits: digits ?? 0 }
    case 'currency':
      return {
        style: 'currency',
        currency: format.currency ?? 'USD',
        ...(digits === undefined ? {} : { maximumFractionDigits: digits }),
      }
    default:
      return digits === undefined ? {} : { maximumFractionDigits: digits }
  }
}

/**
 * The `ChartMessages` keys this file uses, which is only `quarter`. It is a
 * `Pick` so a formatter cannot reach a sentence, and so a caller can pass the
 * member's whole catalog as is. `ChartMessages.quarter` explains why the glyph
 * belongs to the catalog and not to `ValueFormat`.
 *
 * It is `formatValue`'s fourth argument, next to `locale`, because both
 * describe the host's language where `Intl` has no answer. It is optional for
 * the same reason the `messages` prop is: when omitted, the generic English
 * applies. Only a call site that prints an x value can reach the quarter path,
 * because a number never takes the date path. Each such site passes the
 * member's catalog. `chart-messages.test.tsx` renders a quarterly axis for a
 * French host and fails on a `Q`, so a site that forgets the catalog fails the
 * test instead of printing English.
 */
export type NotationMessages = Pick<ChartMessages, 'quarter'>

/**
 * `Intl` options per granularity. `Intl` has no quarter field, so `formatDate`
 * composes quarter labels itself. The `quarter` entry exists only because the
 * record covers every granularity. Nothing reads it.
 */
const DATE_OPTIONS: Record<DateGranularity, Intl.DateTimeFormatOptions> = {
  day: { month: 'short', day: 'numeric' },
  // A week is labelled by the day it starts on.
  week: { month: 'short', day: 'numeric' },
  month: { month: 'short' },
  quarter: {},
  year: { year: 'numeric' },
}

function formatDate(
  value: Date,
  granularity: DateGranularity,
  locale: string | undefined,
  messages: NotationMessages,
): string {
  if (granularity === 'quarter') {
    // `Intl` has no quarter field, so the label is composed, and the catalog
    // words it: `Q3` in English, `T3` for a French host. The engine supplies
    // the number. The host's catalog supplies the glyph and its position.
    return messages.quarter(Math.floor(value.getMonth() / 3) + 1)
  }
  return dateFormatter(locale, DATE_OPTIONS[granularity]).format(value)
}

/**
 * Formats one value. Numbers use the number formatter. Strings use the date
 * formatter when the descriptor's style is `date`, and are otherwise returned
 * unchanged, because a band category is already its display text. `messages`
 * supplies the quarter label, the one date label `Intl` cannot produce.
 */
export function formatValue(
  value: number | string | null,
  format: ValueFormat | undefined,
  locale?: string,
  messages: NotationMessages = DEFAULT_CHART_MESSAGES,
): string {
  if (value === null) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return numberFormatter(locale, numberOptions(format)).format(value)
  }
  if (format?.style === 'date') {
    const parsed = parseIso(value)
    return parsed === null
      ? value
      : formatDate(parsed, format.granularity ?? 'day', locale, messages)
  }
  return value
}

/** A tick on a time scale, at the granularity its step implies. */
export function formatTime(
  value: Date | number,
  format: ValueFormat | undefined,
  stepMs: number,
  locale?: string,
  messages: NotationMessages = DEFAULT_CHART_MESSAGES,
): string {
  const date = typeof value === 'number' ? new Date(value) : value
  return formatDate(date, format?.granularity ?? granularityFor(stepMs), locale, messages)
}

const DAY_MS = 86_400_000

/**
 * The granularity a tick step implies, so a time axis picks its label format
 * when none is given. Each threshold sits below its unit's nominal length
 * rather than at a round number, so a 28-day step counts as a month and a
 * 90-day step as a quarter.
 */
export function granularityFor(stepMs: number): DateGranularity {
  if (stepMs >= 300 * DAY_MS) return 'year'
  if (stepMs >= 80 * DAY_MS) return 'quarter'
  if (stepMs >= 27 * DAY_MS) return 'month'
  if (stepMs >= 6 * DAY_MS) return 'week'
  return 'day'
}

export { DATE_GRANULARITIES }
