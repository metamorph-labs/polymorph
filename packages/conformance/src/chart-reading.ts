import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for the reading position of the charts whose keys walk their marks:
 * BarChart, LineChart, AreaChart, ScatterChart, Histogram, RadarChart, Heatmap
 * and DonutChart (each member's spec, A11y, and `docs/charts.md`, the reading
 * position). Every web shell's test of each of these members calls the
 * member's law with a mount of its own. The chart tier has no contract fence,
 * and the contract grammar reads one part's role, name or attribute, or where
 * focus goes. A chart's keys move a reading position inside one focus stop,
 * and what a key does shows as words in a live region and a mark on the plot,
 * both of which depend on the data. This law presses the keys and reads both,
 * in every renderer.
 *
 * The keys are the engine's reading machine (`createReading`) and brush
 * machine (`createBrush`). Each member gives them the counts they walk and
 * says what each position reads, so the law states the walk and the words
 * member by member. It mounts every chart with `locale: 'en-US'` and the
 * English default catalog, and states the words exactly.
 *
 * The law focuses the plot from a script, because Tab does not stop on every
 * element in WebKit. It reads whether a key's default was prevented from a
 * listener on the window, which runs after every handler in the document, so
 * a key the chart takes is one whose default is prevented: an arrow the
 * reading takes does not scroll the page, and an Escape the chart does not
 * take is left to what holds the chart.
 */

/** A row as the law passes it, in the shape of the grammar's `ChartDatum`. */
export type ReadingLawDatum = Record<string, string | number | null>

/** A series as the law passes it, in the shape of the grammar's `ChartSeries`. */
export interface ReadingLawSeries {
  key: string
  label: string
}

/** The props the law mounts a BarChart with. A prop the law leaves out is not passed. */
export interface BarReadingLawProps {
  data: ReadingLawDatum[]
  series: ReadingLawSeries[]
  x: { key: string }
  label: string
  locale: string
  onSelect?: (selection: { index: number; key: string; datum: ReadingLawDatum }) => void
}

/** The props the law mounts a LineChart with. A prop the law leaves out is not passed. */
export interface LineReadingLawProps {
  data: ReadingLawDatum[]
  series: ReadingLawSeries[]
  x: { key: string; scale: 'band' | 'time' }
  label: string
  locale: string
  onSelect?: (selection: { index: number; datum: ReadingLawDatum }) => void
  onBrushEnd?: (range: [string, string] | [number, number]) => void
}

/** The props the law mounts an AreaChart with. A prop the law leaves out is not passed. */
export type AreaReadingLawProps = LineReadingLawProps

/** The props the law mounts a ScatterChart with. A prop the law leaves out is not passed. */
export interface ScatterReadingLawProps {
  data: ReadingLawDatum[]
  series: ReadingLawSeries[]
  x: { key: string }
  label: string
  locale: string
  onSelect?: (selection: { index: number; key: string; datum: ReadingLawDatum }) => void
}

/** The props the law mounts a Histogram with. A prop the law leaves out is not passed. */
export interface HistogramReadingLawProps {
  data: number[]
  bins: number
  label: string
  locale: string
  onSelect?: (selection: { bin: { from: number; to: number; count: number } }) => void
}

/** The props the law mounts a RadarChart with. A prop the law leaves out is not passed. */
export interface RadarReadingLawProps {
  axes: { key: string; label: string }[]
  data: ReadingLawDatum[]
  series: ReadingLawSeries[]
  label: string
  locale: string
  onSelect?: (selection: { axis: string; key: string; value: number }) => void
}

/** The props the law mounts a Heatmap with. A prop the law leaves out is not passed. */
export interface HeatmapReadingLawProps {
  data: ReadingLawDatum[]
  x: { key: string }
  y: { key: string }
  value: { key: string }
  label: string
  locale: string
  onSelect?: (selection: { x: string | number; y: string | number; value: number }) => void
}

/** A segment as the law passes it, in the shape of the member's `DonutSegment`. */
export interface ReadingLawSegment {
  key: string
  label: string
  value: number
}

/** The props the law mounts a DonutChart with. A prop the law leaves out is not passed. */
export interface DonutReadingLawProps {
  segments: ReadingLawSegment[]
  label: string
  locale: string
  onSelect?: (selection: { key: string; label: string; value: number; share: number }) => void
}

export interface ChartReadingLaw<Props> {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one chart with these props, and no other chart. */
  mount(props: Props): Promise<unknown>
}

const LOCALE = 'en-US'

/** The summary's sentence for a plot that can be activated, in the English default catalog. */
const ACTIVATION_HINT = 'Enter or Space selects the current reading.'

/** An element a reader could reach with Tab. */
const TAB_STOP =
  'a[href], area[href], button, input, select, textarea, iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

/** The one chart of a member on the page. */
function figureOf(member: string): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)
  if (found.length !== 1)
    throw new Error(`expected one ${member} on the page, found ${found.length}`)
  return found[0] as HTMLElement
}

/** The plot: the image a reader focuses and walks. */
function plotOf(member: string): HTMLElement {
  const plot = figureOf(member).querySelector<HTMLElement>('[role="img"]')
  if (plot === null) throw new Error(`the ${member} has no plot`)
  return plot
}

/** What the live region says now. */
const saying = (member: string) =>
  figureOf(member).querySelector('[aria-live="polite"]')?.textContent ?? ''

/** Every part the reading position marks. */
const activeIn = (member: string) => figureOf(member).querySelectorAll('[data-active]')

/**
 * Presses the keys `userEvent.keyboard` writes, and returns whether the last
 * key other than a modifier had its default prevented when it went down.
 */
async function press(keys: string): Promise<boolean> {
  const down: KeyboardEvent[] = []
  const record = (event: KeyboardEvent) => down.push(event)
  window.addEventListener('keydown', record)
  try {
    await userEvent.keyboard(keys)
  } finally {
    window.removeEventListener('keydown', record)
  }
  const last = down
    .filter((event) => !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))
    .at(-1)
  if (last === undefined) throw new Error(`no key went down for ${keys}`)
  return last.defaultPrevented
}

/** The walk a member's keys take over the data the law gives it. */
interface Walk<Props extends ReadingLawBase> {
  /** The member's name: `BarChart`. */
  readonly name: string
  /** The member's `data-member`: `bar-chart`. */
  readonly member: string
  /** The marks the chart draws once its plot is measured, and how many there are for the props. */
  readonly marks: { readonly selector: string; readonly count: (props: Props) => number }
  /** The one part that shows the reading position on the plot while something is read. */
  readonly mark: string
  /** The chart, without a handler. */
  readonly props: Props
  /** What the live region says at each position along Right, on the walk's first series. */
  readonly says: readonly string[]
  /** Whether Right past the last position reads the first, and Left past the first the last. */
  readonly wraps: boolean
  /** What `onSelect` receives at each position along Right, on the walk's first series. */
  readonly selection: (index: number) => unknown
}

/** What every chart the law mounts takes. */
interface ReadingLawBase {
  label: string
  onSelect?: unknown
}

/** Presses a key the reading takes, and waits until the live region says `words`. */
async function taken(member: string, keys: string, words: string): Promise<void> {
  expect(await press(keys), `${keys} is the chart's`).toBe(true)
  await vi.waitFor(() => expect(saying(member)).toBe(words))
}

/**
 * Presses a key the chart does not take, and holds that the live region still
 * says `words`.
 */
async function left(member: string, keys: string, words: string): Promise<void> {
  expect(await press(keys), `${keys} is not the chart's`).toBe(false)
  // A frame for a renderer that draws a change after the key's handler has run.
  await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
  expect(saying(member)).toBe(words)
}

/** Mounts the chart and waits until its marks are drawn and its entrance has ended. */
async function drawn<Props extends ReadingLawBase>(
  walk: Walk<Props>,
  law: ChartReadingLaw<Props>,
  props: Props,
): Promise<HTMLElement> {
  await law.mount(props)
  await vi.waitFor(() =>
    expect(figureOf(walk.member).querySelectorAll(walk.marks.selector)).toHaveLength(
      walk.marks.count(props),
    ),
  )
  await Promise.all(
    figureOf(walk.member)
      .getAnimations({ subtree: true })
      .map((motion) => motion.finished),
  )
  return plotOf(walk.member)
}

/**
 * The statements every member's reading makes: one focus stop, nothing read at
 * rest, the first arrow on an end, the steps and the ends, Home and End,
 * Escape, and Enter and Space with and without `onSelect`. `more` adds the
 * member's own statements inside the same block.
 */
function readingLaw<Props extends ReadingLawBase>(
  walk: Walk<Props>,
  law: ChartReadingLaw<Props>,
  more: (focused: (props?: Props) => Promise<HTMLElement>) => void,
): void {
  const { member, says } = walk
  const marked = () => figureOf(member).querySelectorAll(walk.mark)
  const last = says.length - 1
  const first = says[0] as string
  const end = says[last] as string

  /** Mounts the chart, focuses its plot and returns the plot. */
  const focused = async (props: Props = walk.props): Promise<HTMLElement> => {
    const plot = await drawn(walk, law, props)
    plot.focus()
    expect(document.activeElement).toBe(plot)
    return plot
  }

  describe(`${walk.name}'s reading position — the ${law.shell} shell`, () => {
    beforeAll(installTestTheme)

    it('is one focus stop: an image named by its label, with nothing inside it to tab to', async () => {
      const plot = await drawn(walk, law, walk.props)
      expect(getByRole(figureOf(member), 'img', { name: walk.props.label })).toBe(plot)
      expect(plot.getAttribute('tabindex')).toBe('0')
      expect([...plot.querySelectorAll(TAB_STOP)].map((element) => element.outerHTML)).toEqual([])
    })

    it('says nothing and marks nothing at rest, with focus on the plot', async () => {
      await focused()
      expect(saying(member), 'a resting pointer had already set the position').toBe('')
      expect(activeIn(member)).toHaveLength(0)
      expect(marked()).toHaveLength(0)
    })

    it('lands the first Right on the first position and the first Left on the last', async () => {
      await focused()
      await taken(member, '{ArrowRight}', first)
      expect(marked()).toHaveLength(1)
      await taken(member, '{Escape}', '')
      await taken(member, '{ArrowLeft}', end)
      expect(marked()).toHaveLength(1)
    })

    if (walk.wraps) {
      it('says each position as Right walks around, and goes on past either end', async () => {
        await focused()
        for (const words of says) await taken(member, '{ArrowRight}', words)
        await taken(member, '{ArrowRight}', first)
        await taken(member, '{ArrowLeft}', end)
        for (let index = last - 1; index >= 0; index -= 1) {
          await taken(member, '{ArrowLeft}', says[index] as string)
        }
        await taken(member, '{ArrowLeft}', end)
      })
    } else {
      it('says each position as Right walks to the last, and stops at either end', async () => {
        await focused()
        for (const words of says) await taken(member, '{ArrowRight}', words)
        // Right on the last position stays there: the next Left reads the one before it.
        await taken(member, '{ArrowRight}', end)
        await taken(member, '{ArrowLeft}', says[last - 1] as string)
        for (let index = last - 2; index >= 0; index -= 1) {
          await taken(member, '{ArrowLeft}', says[index] as string)
        }
        // Left on the first position stays there: the next Right reads the second.
        await taken(member, '{ArrowLeft}', first)
        await taken(member, '{ArrowRight}', says[1] as string)
      })
    }

    it('moves to the first and the last position with Home and End', async () => {
      await focused()
      await taken(member, '{End}', end)
      await taken(member, '{Home}', first)
      await taken(member, '{ArrowRight}', says[1] as string)
      await taken(member, '{End}', end)
    })

    it('clears the reading with Escape, and leaves a second Escape to the page', async () => {
      await focused()
      await taken(member, '{ArrowRight}{ArrowRight}', says[1] as string)
      expect(marked()).toHaveLength(1)
      await taken(member, '{Escape}', '')
      expect(activeIn(member)).toHaveLength(0)
      expect(marked()).toHaveLength(0)
      await left(member, '{Escape}', '')
      // The reading is at rest again: the next Right starts from the first position.
      await taken(member, '{ArrowRight}', first)
    })

    it('reports the position read on Enter and on Space through onSelect, and says it can', async () => {
      const onSelect = vi.fn()
      await focused({ ...walk.props, onSelect })
      expect(figureOf(member).textContent).toContain(ACTIVATION_HINT)
      // Nothing is read, so nothing is reported.
      await userEvent.keyboard('{Enter}')
      expect(onSelect).not.toHaveBeenCalled()
      await taken(member, '{ArrowRight}', first)
      expect(await press('{Enter}'), 'Enter is the chart’s').toBe(true)
      await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1))
      expect(onSelect).toHaveBeenLastCalledWith(walk.selection(0))
      await taken(member, '{ArrowRight}', says[1] as string)
      expect(await press(' '), 'Space is the chart’s').toBe(true)
      await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
      expect(onSelect).toHaveBeenLastCalledWith(walk.selection(1))
      // Activation leaves the reading where it is.
      expect(saying(member)).toBe(says[1])
    })

    it('takes neither Enter nor Space without onSelect, and does not say it can', async () => {
      await focused()
      expect(figureOf(member).textContent).not.toContain(ACTIVATION_HINT)
      await taken(member, '{ArrowRight}', first)
      await left(member, '{Enter}', first)
      await left(member, ' ', first)
    })

    more(focused)
  })
}

/** Holds that Up and Down are not the chart's: the reading stays, and the page may scroll. */
function upAndDownAreThePage<Props extends ReadingLawBase>(
  walk: Walk<Props>,
  focused: () => Promise<HTMLElement>,
): void {
  it('leaves Up and Down to the page', async () => {
    await focused()
    await taken(walk.member, '{ArrowRight}', walk.says[0] as string)
    await left(walk.member, '{ArrowDown}', walk.says[0] as string)
    await left(walk.member, '{ArrowUp}', walk.says[0] as string)
  })
}

/* BarChart ---------------------------------------------------------------- */

/** Tickets opened and resolved by day: three bands of two series. */
const WEEKDAYS: ReadingLawDatum[] = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
]

const OPENED_RESOLVED: ReadingLawSeries[] = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

/**
 * BarChart (`design/components/bar-chart.md`, A11y): Right and Left walk the
 * bands and stop at the ends. A band is read whole, every series in one
 * sentence, until Down or Up walks its series, bars then lines; the walked
 * series leads the sentence and stays walked as Right and Left move. Enter on
 * a whole band reports the first series.
 */
export function barChartReadingLaw(law: ChartReadingLaw<BarReadingLawProps>): void {
  const props: BarReadingLawProps = {
    data: WEEKDAYS,
    series: OPENED_RESOLVED,
    x: { key: 'day' },
    label: 'Opened and resolved',
    locale: LOCALE,
  }
  const walk: Walk<BarReadingLawProps> = {
    name: 'BarChart',
    member: 'bar-chart',
    marks: { selector: 'path[class*="bar"]', count: () => 6 },
    mark: 'g[data-active]',
    props,
    says: [
      'Mon: Opened 32, Resolved 28',
      'Tue: Opened 41, Resolved 39',
      'Wed: Opened 37, Resolved 40',
    ],
    wraps: false,
    selection: (index) => ({ index, key: 'opened', datum: WEEKDAYS[index] }),
  }
  const bands = () => figureOf('bar-chart').querySelectorAll('g[data-active]')
  const walked = () => figureOf('bar-chart').querySelectorAll('path[data-active]')

  readingLaw(walk, law, (focused) => {
    it('reads a band whole, and walks its series with Down and Up, which stop at the ends', async () => {
      await focused()
      // Nothing is read yet, so there is no series to walk.
      await left('bar-chart', '{ArrowDown}', '')
      await taken('bar-chart', '{ArrowRight}', 'Mon: Opened 32, Resolved 28')
      expect(bands()).toHaveLength(1)
      expect(walked()).toHaveLength(0)
      await taken('bar-chart', '{ArrowDown}', 'Opened: 32 — Mon')
      expect(bands()).toHaveLength(1)
      expect(walked()).toHaveLength(1)
      await taken('bar-chart', '{ArrowDown}', 'Resolved: 28 — Mon')
      // Down on the last series stays there.
      await taken('bar-chart', '{ArrowDown}', 'Resolved: 28 — Mon')
      // The walked series stays walked as Right moves.
      await taken('bar-chart', '{ArrowRight}', 'Resolved: 39 — Tue')
      await taken('bar-chart', '{ArrowUp}', 'Opened: 41 — Tue')
      await taken('bar-chart', '{ArrowUp}', 'Opened: 41 — Tue')
      expect(walked()).toHaveLength(1)
      // Escape clears the series with the band: the next Right reads a band whole.
      await taken('bar-chart', '{Escape}', '')
      expect(walked()).toHaveLength(0)
      await taken('bar-chart', '{ArrowRight}', 'Mon: Opened 32, Resolved 28')
      // From a whole band, the first Up lands on the last series.
      await taken('bar-chart', '{ArrowUp}', 'Resolved: 28 — Mon')
    })

    it('reports the walked series through onSelect', async () => {
      const onSelect = vi.fn()
      await focused({ ...props, onSelect })
      await taken('bar-chart', '{ArrowRight}{ArrowDown}{ArrowDown}', 'Resolved: 28 — Mon')
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith({ index: 0, key: 'resolved', datum: WEEKDAYS[0] }),
      )
    })
  })
}

/* LineChart and AreaChart ------------------------------------------------- */

/** Tickets by calendar day, with a gap in one series on the second day. */
const DAYS: ReadingLawDatum[] = [
  { day: '2026-07-01', opened: 28, resolved: 25 },
  { day: '2026-07-02', opened: 34, resolved: null },
  { day: '2026-07-03', opened: 31, resolved: 33 },
  { day: '2026-07-04', opened: 30, resolved: 29 },
]

/** The brush's statements, for a chart over `DAYS`. */
function brushLaw(
  member: string,
  focused: (props?: LineReadingLawProps) => Promise<HTMLElement>,
  props: LineReadingLawProps,
  says: readonly string[],
): void {
  const range = () => figureOf(member).querySelector('[class*="range"]')

  it('extends a brush from the reading position with Shift and the arrows, and reports it once, on Enter', async () => {
    const onBrushEnd = vi.fn()
    await focused({ ...props, onBrushEnd })
    await taken(member, '{ArrowRight}{ArrowRight}', says[1] as string)
    expect(range()).toBeNull()
    await taken(member, '{Shift>}{ArrowRight}{/Shift}', says[2] as string)
    expect(range()).not.toBeNull()
    await taken(member, '{Shift>}{ArrowRight}{/Shift}', says[3] as string)
    expect(onBrushEnd).not.toHaveBeenCalled()
    expect(await press('{Enter}'), 'Enter is the brush’s').toBe(true)
    await vi.waitFor(() => expect(onBrushEnd).toHaveBeenCalledTimes(1))
    expect(onBrushEnd).toHaveBeenCalledWith(['2026-07-02', '2026-07-04'])
    // A committed range stays on the plot, and Enter does not report it again.
    expect(range()).not.toBeNull()
    await userEvent.keyboard('{Enter}')
    expect(onBrushEnd).toHaveBeenCalledTimes(1)
  })

  it('cancels the brush on the first Escape and clears the reading on the second', async () => {
    const onBrushEnd = vi.fn()
    await focused({ ...props, onBrushEnd })
    await taken(member, '{ArrowRight}', says[0] as string)
    await taken(member, '{Shift>}{ArrowRight}{/Shift}', says[1] as string)
    expect(range()).not.toBeNull()
    await taken(member, '{Escape}', says[1] as string)
    await vi.waitFor(() => expect(range()).toBeNull())
    await taken(member, '{Escape}', '')
    await left(member, '{Escape}', '')
    expect(onBrushEnd).not.toHaveBeenCalled()
  })
}

/**
 * LineChart (`design/components/line-chart.md`, A11y): the crosshair walks the
 * rows with Right and Left and stops at the ends, and each row is read with
 * every series at it, a gap as no data. Up and Down are not the chart's. With
 * `onBrushEnd` on a time x, Shift and an arrow extend a range from the reading
 * position, Enter commits it, and Escape cancels it before it clears the
 * reading.
 */
export function lineChartReadingLaw(law: ChartReadingLaw<LineReadingLawProps>): void {
  const props: LineReadingLawProps = {
    data: DAYS,
    series: OPENED_RESOLVED,
    x: { key: 'day', scale: 'time' },
    label: 'Tickets by day',
    locale: LOCALE,
  }
  const walk: Walk<LineReadingLawProps> = {
    name: 'LineChart',
    member: 'line-chart',
    marks: { selector: 'path[class*="line"]', count: (chart) => chart.series.length },
    mark: '[class*="crosshair"]',
    props,
    says: [
      'Jul 1: Opened 28, Resolved 25',
      'Jul 2: Opened 34, Resolved No data',
      'Jul 3: Opened 31, Resolved 33',
      'Jul 4: Opened 30, Resolved 29',
    ],
    wraps: false,
    selection: (index) => ({ index, datum: DAYS[index] }),
  }
  readingLaw(walk, law, (focused) => {
    upAndDownAreThePage(walk, focused)
    brushLaw('line-chart', focused, props, walk.says)
  })
}

/** Open tickets by priority and week: three stacked series over a band x. */
const WEEKS: ReadingLawDatum[] = [
  { week: 'W30', urgent: 12, high: 34, normal: 68 },
  { week: 'W31', urgent: 16, high: 36, normal: 60 },
  { week: 'W32', urgent: 14, high: 38, normal: 64 },
]

const PRIORITIES: ReadingLawSeries[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
]

/**
 * AreaChart (`design/components/area-chart.md`, A11y, as LineChart's): the
 * crosshair walks the rows with Right and Left and stops at the ends, and each
 * row is read with every series at it. Up and Down are not the chart's. The
 * brush is LineChart's, on a time x.
 */
export function areaChartReadingLaw(law: ChartReadingLaw<AreaReadingLawProps>): void {
  const props: AreaReadingLawProps = {
    data: WEEKS,
    series: PRIORITIES,
    x: { key: 'week', scale: 'band' },
    label: 'Open tickets by priority',
    locale: LOCALE,
  }
  const walk: Walk<AreaReadingLawProps> = {
    name: 'AreaChart',
    member: 'area-chart',
    marks: { selector: 'path[class*="band"]', count: (chart) => chart.series.length },
    mark: '[class*="crosshair"][data-active]',
    props,
    says: [
      'W30: Urgent 12, High 34, Normal 68',
      'W31: Urgent 16, High 36, Normal 60',
      'W32: Urgent 14, High 38, Normal 64',
    ],
    wraps: false,
    selection: (index) => ({ index, datum: WEEKS[index] }),
  }
  const timed: AreaReadingLawProps = {
    data: DAYS.map((row) => ({ ...row, resolved: row.resolved ?? 0 })),
    series: OPENED_RESOLVED,
    x: { key: 'day', scale: 'time' },
    label: 'Tickets by day',
    locale: LOCALE,
  }
  readingLaw(walk, law, (focused) => {
    upAndDownAreThePage(walk, focused)
    brushLaw('area-chart', focused, timed, [
      'Jul 1: Opened 28, Resolved 25',
      'Jul 2: Opened 34, Resolved 0',
      'Jul 3: Opened 31, Resolved 33',
      'Jul 4: Opened 30, Resolved 29',
    ])
  })
}

/* ScatterChart ------------------------------------------------------------ */

/** Minutes to triage against satisfaction, for two queues; the second has no score on the last row. */
const QUEUES: ReadingLawDatum[] = [
  { minutes: 2, triage: 4.8, escalations: 4.2 },
  { minutes: 6, triage: 4.1, escalations: 3.8 },
  { minutes: 11, triage: 3.4, escalations: null },
]

const TRIAGE_ESCALATIONS: ReadingLawSeries[] = [
  { key: 'triage', label: 'Triage' },
  { key: 'escalations', label: 'Escalations' },
]

/**
 * ScatterChart (`design/components/scatter-chart.md`, A11y): Right and Left
 * walk the rows of the active series and stop at the ends, Down and Up switch
 * series at the same row and stop at the ends, and a mark is read as `x, y:
 * series`. A row the plot draws no point for is still reached, said with no
 * data, and reports nothing.
 */
export function scatterChartReadingLaw(law: ChartReadingLaw<ScatterReadingLawProps>): void {
  const props: ScatterReadingLawProps = {
    data: QUEUES,
    series: TRIAGE_ESCALATIONS,
    x: { key: 'minutes' },
    label: 'Triage time and satisfaction',
    locale: LOCALE,
  }
  const walk: Walk<ScatterReadingLawProps> = {
    name: 'ScatterChart',
    member: 'scatter-chart',
    marks: { selector: 'circle[class*="dot"]', count: () => 5 },
    mark: 'circle[data-active]',
    props,
    says: ['2, 4.8: Triage', '6, 4.1: Triage', '11, 3.4: Triage'],
    wraps: false,
    selection: (index) => ({ index, key: 'triage', datum: QUEUES[index] }),
  }
  readingLaw(walk, law, (focused) => {
    it('switches series at the same row with Down and Up, which stop at the ends', async () => {
      await focused()
      await left('scatter-chart', '{ArrowDown}', '')
      await taken('scatter-chart', '{ArrowRight}', '2, 4.8: Triage')
      await taken('scatter-chart', '{ArrowDown}', '2, 4.2: Escalations')
      await taken('scatter-chart', '{ArrowDown}', '2, 4.2: Escalations')
      await taken('scatter-chart', '{ArrowRight}', '6, 3.8: Escalations')
      await taken('scatter-chart', '{ArrowUp}', '6, 4.1: Triage')
      await taken('scatter-chart', '{ArrowUp}', '6, 4.1: Triage')
      await taken('scatter-chart', '{ArrowRight}', '11, 3.4: Triage')
    })

    it('reaches and says a row with no point, and reports nothing there', async () => {
      const onSelect = vi.fn()
      await focused({ ...props, onSelect })
      await taken('scatter-chart', '{End}{ArrowDown}', '11, No data: Escalations')
      await userEvent.keyboard('{Enter}')
      await taken('scatter-chart', '{ArrowLeft}', '6, 3.8: Escalations')
      expect(onSelect).not.toHaveBeenCalled()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith({ index: 1, key: 'escalations', datum: QUEUES[1] }),
      )
    })
  })
}

/* Histogram --------------------------------------------------------------- */

/** Ten resolution times in hours, in four bins of ten. */
const HOURS = [1, 4, 12, 14, 18, 23, 27, 33, 36, 39]

const BINS = [
  { from: 0, to: 10, count: 2 },
  { from: 10, to: 20, count: 3 },
  { from: 20, to: 30, count: 2 },
  { from: 30, to: 40, count: 3 },
]

/**
 * Histogram (`design/components/histogram.md`, A11y): Right and Left walk the
 * bins in axis order and stop at the ends, and a bin is read as its en-dash
 * range and its count. Up and Down are not the chart's.
 */
export function histogramReadingLaw(law: ChartReadingLaw<HistogramReadingLawProps>): void {
  const props: HistogramReadingLawProps = {
    data: HOURS,
    bins: 4,
    label: 'Resolution time',
    locale: LOCALE,
  }
  const walk: Walk<HistogramReadingLawProps> = {
    name: 'Histogram',
    member: 'histogram',
    marks: { selector: 'path[class*="bar"]', count: () => 4 },
    mark: 'g[data-active]',
    props,
    says: BINS.map((bin) => `${bin.from}–${bin.to}: ${bin.count}`),
    wraps: false,
    selection: (index) => ({ bin: BINS[index] }),
  }
  readingLaw(walk, law, (focused) => upAndDownAreThePage(walk, focused))
}

/* RadarChart -------------------------------------------------------------- */

const SKILLS = [
  { key: 'firstResponse', label: 'First response' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'csat', label: 'CSAT' },
  { key: 'escalation', label: 'Escalation' },
  { key: 'coverage', label: 'Coverage' },
]

/** One row per axis, in the axes' order. */
const PROFILES: ReadingLawDatum[] = [
  { agent: 4.5, team: 3.8 },
  { agent: 3.2, team: 3.6 },
  { agent: 4.8, team: 4.1 },
  { agent: 2.9, team: 3.4 },
  { agent: 3.9, team: 3.7 },
]

const AGENT_TEAM: ReadingLawSeries[] = [
  { key: 'agent', label: 'Agent' },
  { key: 'team', label: 'Team' },
]

/**
 * RadarChart (`design/components/radar-chart.md`, A11y): Right and Left walk
 * the axes around the polygon, past the last axis to the first and back, Home
 * and End go to the first and the last axis, and Down and Up switch series at
 * the same axis and stop at the ends. A vertex is read as `axis: series,
 * value`.
 */
export function radarChartReadingLaw(law: ChartReadingLaw<RadarReadingLawProps>): void {
  const props: RadarReadingLawProps = {
    axes: SKILLS,
    data: PROFILES,
    series: AGENT_TEAM,
    label: 'Agent against team',
    locale: LOCALE,
  }
  const walk: Walk<RadarReadingLawProps> = {
    name: 'RadarChart',
    member: 'radar-chart',
    marks: { selector: 'circle[class*="vertex"]', count: () => 10 },
    mark: 'circle[data-active]',
    props,
    says: SKILLS.map((axis, index) => `${axis.label}: Agent, ${PROFILES[index]?.agent}`),
    wraps: true,
    selection: (index) => ({
      axis: SKILLS[index]?.key,
      key: 'agent',
      value: PROFILES[index]?.agent,
    }),
  }
  readingLaw(walk, law, (focused) => {
    it('switches series at the same axis with Down and Up, which stop at the ends', async () => {
      await focused()
      await left('radar-chart', '{ArrowDown}', '')
      await taken('radar-chart', '{ArrowRight}', 'First response: Agent, 4.5')
      await taken('radar-chart', '{ArrowDown}', 'First response: Team, 3.8')
      await taken('radar-chart', '{ArrowDown}', 'First response: Team, 3.8')
      await taken('radar-chart', '{ArrowLeft}', 'Coverage: Team, 3.7')
      await taken('radar-chart', '{ArrowUp}', 'Coverage: Agent, 3.9')
      await taken('radar-chart', '{ArrowUp}', 'Coverage: Agent, 3.9')
    })

    it('reports the series walked to through onSelect', async () => {
      const onSelect = vi.fn()
      await focused({ ...props, onSelect })
      await taken('radar-chart', '{ArrowRight}{ArrowRight}{ArrowDown}', 'Resolution: Team, 3.6')
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith({ axis: 'resolution', key: 'team', value: 3.6 }),
      )
    })
  })
}

/* Heatmap ----------------------------------------------------------------- */

const SHIFTS = ['08–12', '12–16', '16–20']

/** Tickets by shift and day; nothing was measured on Tuesday's last shift. */
const GRID: ReadingLawDatum[] = ['Mon', 'Tue', 'Wed'].flatMap((day, row) =>
  SHIFTS.map((band, column) => ({
    band,
    day,
    tickets: day === 'Tue' && band === '16–20' ? null : 10 * (row + 1) + column,
  })),
)

/**
 * Heatmap (`design/components/heatmap.md`, A11y): Right and Left walk x and
 * Down and Up walk y, each stopping at its ends, from the first row. A cell is
 * read as `x, y: value`, an absent cell as no data, which reports nothing.
 */
export function heatmapReadingLaw(law: ChartReadingLaw<HeatmapReadingLawProps>): void {
  const props: HeatmapReadingLawProps = {
    data: GRID,
    x: { key: 'band' },
    y: { key: 'day' },
    value: { key: 'tickets' },
    label: 'Tickets by shift',
    locale: LOCALE,
  }
  const walk: Walk<HeatmapReadingLawProps> = {
    name: 'Heatmap',
    member: 'heatmap',
    marks: { selector: 'rect[class*="cell"]', count: () => 8 },
    mark: 'rect[data-active]',
    props,
    says: ['08–12, Mon: 10', '12–16, Mon: 11', '16–20, Mon: 12'],
    wraps: false,
    selection: (index) => ({ x: SHIFTS[index], y: 'Mon', value: 10 + index }),
  }
  readingLaw(walk, law, (focused) => {
    it('walks y with Down and Up, which stop at the ends, and keeps the row as Right moves', async () => {
      await focused()
      await left('heatmap', '{ArrowDown}', '')
      await taken('heatmap', '{ArrowRight}', '08–12, Mon: 10')
      await taken('heatmap', '{ArrowDown}', '08–12, Tue: 20')
      await taken('heatmap', '{ArrowDown}', '08–12, Wed: 30')
      await taken('heatmap', '{ArrowDown}', '08–12, Wed: 30')
      await taken('heatmap', '{ArrowRight}', '12–16, Wed: 31')
      await taken('heatmap', '{ArrowUp}', '12–16, Tue: 21')
      await taken('heatmap', '{ArrowUp}', '12–16, Mon: 11')
      await taken('heatmap', '{ArrowUp}', '12–16, Mon: 11')
      expect(figureOf('heatmap').querySelectorAll('rect[data-active]')).toHaveLength(1)
    })

    it('says an absent cell has no data, and reports nothing for it', async () => {
      const onSelect = vi.fn()
      await focused({ ...props, onSelect })
      await taken('heatmap', '{End}{ArrowDown}', '16–20, Tue: No data')
      await userEvent.keyboard('{Enter}')
      await taken('heatmap', '{ArrowLeft}', '12–16, Tue: 21')
      expect(onSelect).not.toHaveBeenCalled()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith({ x: '12–16', y: 'Tue', value: 21 }),
      )
    })
  })
}

/* DonutChart -------------------------------------------------------------- */

/** Tickets by channel. Their total is 369. */
const CHANNELS: ReadingLawSegment[] = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

/**
 * DonutChart (`design/components/donut-chart.md`, A11y): Right and Left walk
 * the segments clockwise from 12 o'clock and stop at the first and the last,
 * and a segment is read as `label: value, share`. Up and Down are not the
 * chart's.
 */
export function donutChartReadingLaw(law: ChartReadingLaw<DonutReadingLawProps>): void {
  const props: DonutReadingLawProps = {
    segments: CHANNELS,
    label: 'Tickets by channel',
    locale: LOCALE,
  }
  const walk: Walk<DonutReadingLawProps> = {
    name: 'DonutChart',
    member: 'donut-chart',
    marks: { selector: 'path[class*="segment"]', count: () => 4 },
    mark: 'path[data-active]',
    props,
    says: ['Email: 214, 58%', 'Chat: 96, 26%', 'Phone: 41, 11.1%', 'Social: 18, 4.9%'],
    wraps: false,
    selection: (index) => {
      const segment = CHANNELS[index] as ReadingLawSegment
      return { ...segment, share: segment.value / 369 }
    },
  }
  readingLaw(walk, law, (focused) => upAndDownAreThePage(walk, focused))
}
