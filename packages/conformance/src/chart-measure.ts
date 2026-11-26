import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for the measure a series chart names (`docs/charts.md`, the shared
 * grammar): BarChart, LineChart, AreaChart and ScatterChart. Every web shell's
 * test of each of these members calls the member's law with a mount of its own.
 *
 * `y.label` names the measure the values are in, and a ScatterChart's
 * `x.label` names its other measure. No chart draws an axis title, so a
 * measure is said in words. The chart says it once, in its summary sentence,
 * which a screen reader reads with the plot. Every series is in the one
 * measure, so the readings at a position (the live region and the tooltip)
 * name each value by its series and leave the measure out, and so does the
 * table twin, whose value columns are the series and whose first column
 * `x.label` heads.
 *
 * The law mounts each chart with `locale: 'en-US'` and the English default
 * catalog, and states the words exactly. It focuses the plot from a script,
 * because Tab does not stop on every element in WebKit.
 */

/** The props the law mounts a chart with. A prop the law leaves out is not passed. */
export interface MeasureLawProps {
  data: Record<string, string | number | null>[]
  series: { key: string; label: string }[]
  x: { key: string; label?: string }
  y: { label: string }
  label: string
  locale: string
}

export interface ChartMeasureLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one chart with these props, and no other chart. */
  mount(props: MeasureLawProps): Promise<unknown>
}

/** What the law mounts for one member, and what its summary says. */
interface Subject {
  readonly name: string
  /** The member's `data-member`. */
  readonly member: string
  readonly props: MeasureLawProps
  /** The words naming the measures that the summary says once, and nothing else does. */
  readonly measures: readonly string[]
  readonly summary: string
}

const TWIN = 'The same data is available as a table.'

const WEEKDAYS = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const MEASURED = 'Tickets handled'

/** A series chart over the weekdays, its values in tickets handled. */
const series = (name: string, member: string): Subject => ({
  name,
  member,
  props: {
    data: WEEKDAYS,
    series: PAIR,
    x: { key: 'day', label: 'Weekday' },
    y: { label: MEASURED },
    label: 'Weekday load',
    locale: 'en-US',
  },
  measures: [MEASURED],
  summary: `Weekday load showing Opened and Resolved, 3 points. Values: ${MEASURED}. ${TWIN}`,
})

const SCATTER: Subject = {
  name: 'ScatterChart',
  member: 'scatter-chart',
  props: {
    data: [
      { minutes: 2, csat: 4.8 },
      { minutes: 6, csat: 4.1 },
      { minutes: 11, csat: 3.4 },
    ],
    series: [{ key: 'csat', label: 'Agents' }],
    x: { key: 'minutes', label: 'Handle time in minutes' },
    y: { label: 'Customer satisfaction' },
    label: 'Speed and satisfaction',
    locale: 'en-US',
  },
  measures: ['Customer satisfaction', 'Handle time in minutes'],
  summary: `Speed and satisfaction showing Agents, 3 points. Values: Customer satisfaction against Handle time in minutes. ${TWIN}`,
}

/** The one chart of a member on the page. */
function figureOf(member: string): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)
  if (found.length !== 1)
    throw new Error(`expected one ${member} on the page, found ${found.length}`)
  return found[0] as HTMLElement
}

/**
 * Everything the chart shows or says: its text, node by node, and the names
 * and descriptions its elements carry.
 */
function heard(figure: HTMLElement): string {
  const texts: string[] = []
  const walker = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    texts.push(node.textContent ?? '')
  }
  const named = [...figure.querySelectorAll('*')].flatMap((element) =>
    ['aria-label', 'aria-description', 'title'].map((name) => element.getAttribute(name) ?? ''),
  )
  return [...texts, ...named].join('\n')
}

/** How many times the chart shows or says these words. */
const times = (figure: HTMLElement, words: string) => heard(figure).split(words).length - 1

const saying = (figure: HTMLElement) =>
  figure.querySelector('[aria-live="polite"]')?.textContent ?? ''

function measureLaw(subject: Subject, law: ChartMeasureLaw): void {
  describe(`${subject.name}'s measure — the ${law.shell} shell`, () => {
    beforeAll(installTestTheme)

    it('says its measure once, in its summary sentence', async () => {
      await law.mount(subject.props)
      const figure = figureOf(subject.member)
      await vi.waitFor(() => expect(heard(figure)).toContain(subject.summary))
      for (const words of subject.measures) expect(times(figure, words), words).toBe(1)
    })

    it('leaves the measure out of a reading, which names each value by its series, and out of the twin', async () => {
      await law.mount(subject.props)
      const figure = figureOf(subject.member)
      const plot = figure.querySelector<HTMLElement>('[role="img"]')
      if (plot === null) throw new Error(`the ${subject.name} has no plot`)
      // The marks are drawn once the plot is measured, and a reading needs them.
      await vi.waitFor(() => expect(plot.querySelector('path, circle, rect')).not.toBeNull())
      plot.focus()
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(saying(figure)).not.toBe(''))
      expect(saying(figure)).toContain(subject.props.series[0]?.label as string)
      for (const words of subject.measures) expect(times(figure, words), words).toBe(1)

      const toggle = [...figure.querySelectorAll<HTMLElement>('button')].find((button) =>
        button.getAttribute('aria-label')?.startsWith('Show the data table'),
      )
      if (toggle === undefined) throw new Error(`the ${subject.name} has no twin toggle`)
      await userEvent.click(toggle)
      await vi.waitFor(() => expect(figure.querySelector('table')).not.toBeNull())
      // The twin's value columns are the series. `x.label` heads its first column, as on every
      // chart whose rows run along x.
      expect(times(figure, subject.props.y.label)).toBe(1)
      const headings = [...figure.querySelectorAll('th')].map((cell) => cell.textContent?.trim())
      expect(headings).toEqual([subject.props.x.label, ...subject.props.series.map((s) => s.label)])
    })
  })
}

export function barChartMeasureLaw(law: ChartMeasureLaw): void {
  measureLaw(series('BarChart', 'bar-chart'), law)
}

export function lineChartMeasureLaw(law: ChartMeasureLaw): void {
  measureLaw(series('LineChart', 'line-chart'), law)
}

export function areaChartMeasureLaw(law: ChartMeasureLaw): void {
  measureLaw(series('AreaChart', 'area-chart'), law)
}

export function scatterChartMeasureLaw(law: ChartMeasureLaw): void {
  measureLaw(SCATTER, law)
}
