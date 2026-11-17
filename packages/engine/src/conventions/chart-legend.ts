import { agentPress } from './agent'

/**
 * What an agent toggles in a chart's legend, and how, for every chart whose
 * legend toggles in every renderer (the `## Agent` section of each such
 * chart's spec). A chart with two or more series draws a legend, and where it
 * toggles to isolate, each key is a button with `aria-pressed` that hides or
 * shows its series. These read the keys from the chart's own element, by the
 * class the legend's recipe gives a key, as a person sees them: a chart whose
 * legend draws no keys (one series, or a legend that only labels) has none.
 *
 * The legend draws one key per series the chart paints, in order, so each
 * takes those series beside the element and pairs the keys with them: a
 * key's id is its series' `key`, which the document does not show. Each takes
 * the class as the member reads it from its CSS module, where a class may be
 * missing. With no key class there are no keys.
 */

/** One series an agent can hide or show, as a `choices` state lists it. */
export interface ChartSeriesChoice {
  readonly id: string
  readonly label: string
}

/** A series as the chart paints it, which the legend draws one key for. */
export interface ChartLegendSeries {
  readonly key: string
}

interface Key {
  readonly choice: ChartSeriesChoice
  readonly button: HTMLElement
  /** Whether the key says its series is shown: pressed, as `aria-pressed` reads. */
  readonly shown: boolean
}

/** A selector for every class a class attribute's value holds: `a b` is `.a.b`. */
const selectorOf = (classes: string): string =>
  classes
    .split(/\s+/)
    .filter((name) => name !== '')
    .map((name) => `.${CSS.escape(name)}`)
    .join('')

const words = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/**
 * The legend's keys in the chart's element, in the legend's order, each with
 * the series it draws. A count of keys other than the count of series is a
 * legend these cannot pair, so it has no keys.
 */
function keysOf(
  frame: Element | null | undefined,
  keyClass: string | undefined,
  series: readonly ChartLegendSeries[],
): Key[] {
  if (!frame || !keyClass || selectorOf(keyClass) === '') return []
  // `Array.from`, not a spread: the packages that build the engine's source type it without the
  // DOM's iterables.
  const buttons = Array.from(frame.querySelectorAll<HTMLElement>(selectorOf(keyClass)))
  if (buttons.length !== series.length) return []
  return buttons.map((button, at) => ({
    button,
    shown: button.getAttribute('aria-pressed') !== 'false',
    choice: { id: (series[at] as ChartLegendSeries).key, label: words(button.textContent) },
  }))
}

/**
 * The series an agent can hide or show: one per key of the legend, in the
 * legend's order. A series' id is its `key`, and its label is what its key
 * says. A chart with no toggling legend has none.
 */
export function chartSeries(
  frame: Element | null | undefined,
  keyClass: string | undefined,
  series: readonly ChartLegendSeries[],
): ChartSeriesChoice[] {
  return keysOf(frame, keyClass, series).map(({ choice }) => choice)
}

/** The ids of the series whose keys say they are hidden, in the legend's order. */
export function chartHiddenSeries(
  frame: Element | null | undefined,
  keyClass: string | undefined,
  series: readonly ChartLegendSeries[],
): string[] {
  return keysOf(frame, keyClass, series)
    .filter(({ shown }) => !shown)
    .map(({ choice }) => choice.id)
}

/**
 * Hides or shows the series an id names by pressing its key with the
 * element's own `click()`, as a person's press does, so the chart refits its
 * domains as it does for a person. A press hides a shown series and shows a
 * hidden one. Throws for an id that names no key.
 */
export function toggleChartSeries(
  frame: Element | null | undefined,
  keyClass: string | undefined,
  series: readonly ChartLegendSeries[],
  id: string,
): void {
  const key = keysOf(frame, keyClass, series).find(({ choice }) => choice.id === id)
  if (key === undefined) throw new Error(`No key of the chart's legend has the id "${id}".`)
  agentPress(key.button)
}
