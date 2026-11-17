import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for the lines a BarChart draws over its bars
 * (`design/components/bar-chart.md`, `lines`), which every web shell's
 * BarChart test calls with a mount of its own. BarChart has no contract
 * fence, and what this law reads is drawing the grammar cannot state: which
 * marks a series of each kind draws, where a line's points sit against the
 * bars, the one set of gridlines, the words a screen reader hears for a line,
 * and the keyboard reading across bars and lines.
 *
 * The law focuses the plot from a script and reads the live region, because
 * Tab does not stop on every element in WebKit. It waits for the marks,
 * because the plot is drawn after its first measurement.
 */

/** A series as the law passes it, in the shape of the grammar's `ChartSeries`. */
export interface BarLinesLawSeries {
  key: string
  label: string
}

/** The props the law mounts a BarChart with. A prop the law leaves out is not passed. */
export interface BarLinesLawProps {
  data: Record<string, string | number | null>[]
  series: BarLinesLawSeries[]
  lines?: BarLinesLawSeries[]
  x: { key: string; label?: string }
  label: string
  orientation?: 'vertical' | 'horizontal'
  mode?: 'grouped' | 'stacked'
}

export interface BarLinesLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one BarChart with these props, and returns the element it is mounted in. */
  mount(props: BarLinesLawProps): Promise<Element>
}

const WEEKS = [
  { week: 'W1', opened: 10, average: 12 },
  { week: 'W2', opened: 20, average: 15 },
  { week: 'W3', opened: 30, average: 20 },
]

const OPENED: BarLinesLawSeries[] = [{ key: 'opened', label: 'Opened' }]
const AVERAGE: BarLinesLawSeries[] = [{ key: 'average', label: 'Average' }]

const lined = (over: Partial<BarLinesLawProps> = {}): BarLinesLawProps => ({
  data: WEEKS,
  series: OPENED,
  lines: AVERAGE,
  x: { key: 'week', label: 'Week' },
  label: 'Opened by week',
  ...over,
})

const bars = (host: Element) => [...host.querySelectorAll('path[class*="bar"]')]
const lineGroups = (host: Element) => [...host.querySelectorAll('g[class*="lines"] > g')]
const points = (host: Element) => [...host.querySelectorAll('circle[class*="point"]')]
const strokes = (host: Element) => [...host.querySelectorAll('g[class*="lines"] path')]

/** The centre of a bar along x, from the box its path encloses. */
const centreOf = (bar: Element) => {
  const box = (bar as SVGGraphicsElement).getBBox()
  return box.x + box.width / 2
}

const marks = (host: Element) => host.querySelector('svg[data-mode]')
const live = (host: Element) => host.querySelector('[aria-live="polite"]')?.textContent ?? ''

/** The summary sentence: the visually hidden text that says the table exists. */
const summary = (host: Element) =>
  [...host.querySelectorAll('figure *')].find(
    (element) => element.children.length === 0 && /as a table/.test(element.textContent ?? ''),
  )?.textContent ?? ''

export function barLinesLaw({ shell, mount }: BarLinesLaw): void {
  describe(`${shell} BarChart — lines over the bars`, () => {
    beforeAll(installTestTheme)

    it('draws a bar per bar value and one stroke with a point per line value', async () => {
      const host = await mount(lined())
      await vi.waitFor(() => expect(bars(host)).toHaveLength(3))
      expect(lineGroups(host)).toHaveLength(1)
      expect(strokes(host)).toHaveLength(1)
      expect(points(host)).toHaveLength(3)
      // The lines are drawn after the bars, so they sit over them.
      const svg = marks(host)
      const order = [...(svg?.children ?? [])].map((child) => child.getAttribute('class') ?? '')
      const bands = order.findIndex((name) => name.includes('bands'))
      const lines = order.findIndex((name) => name.includes('lines'))
      expect(bands).toBeGreaterThanOrEqual(0)
      expect(lines).toBeGreaterThan(bands)
    })

    it('puts each point at its category centre, the centre of that category’s bar', async () => {
      const host = await mount(lined())
      await vi.waitFor(() => expect(points(host)).toHaveLength(3))
      const centres = bars(host).map(centreOf)
      points(host).forEach((point, index) => {
        expect(Number(point.getAttribute('cx'))).toBeCloseTo(centres[index] ?? Number.NaN, 1)
      })
      // One value axis: the point for 20 sits as high as the bar of 20.
      const top = (bars(host)[1] as SVGGraphicsElement).getBBox().y
      expect(Number(points(host)[2]?.getAttribute('cy'))).toBeCloseTo(top, 1)
    })

    it('draws one value axis and one set of gridlines, one at each of its ticks', async () => {
      const host = await mount(lined())
      await vi.waitFor(() => expect(points(host)).toHaveLength(3))
      expect(host.querySelectorAll('[data-orientation="y"]')).toHaveLength(1)
      const ticks = host.querySelectorAll('[data-orientation="y"] [class*="tick"]')
      const grid = host.querySelectorAll('g[class*="grid"] path')
      expect(ticks.length).toBeGreaterThan(1)
      expect(grid).toHaveLength(ticks.length)
    })

    it('names the line in the legend with a line key, in the summary and in the twin', async () => {
      const host = await mount(lined())
      await vi.waitFor(() => expect(points(host)).toHaveLength(3))
      const key = getByRole(host as HTMLElement, 'button', { name: 'Average' })
      expect(key.closest('li')?.getAttribute('data-key-shape')).toBe('line')
      const bar = getByRole(host as HTMLElement, 'button', { name: 'Opened' })
      expect(bar.closest('li')?.hasAttribute('data-key-shape')).toBe(false)
      expect(summary(host)).toContain('Opened')
      expect(summary(host)).toContain('Average')

      await userEvent.click(
        getByRole(host as HTMLElement, 'button', { name: /show the data table/i }),
      )
      // The table is drawn in the render after the press, which Angular on Firefox finishes later.
      const table = await vi.waitFor(() =>
        getByRole(host as HTMLElement, 'table', { name: /Opened by week — data/ }),
      )
      const headers = [...table.querySelectorAll('th')].map((cell) => cell.textContent?.trim())
      expect(headers).toContain('Average')
      expect(table.textContent).toContain('15')
    })

    it('reads every series at a band, and walks from the bars onto the line', async () => {
      const host = await mount(lined())
      await vi.waitFor(() => expect(points(host)).toHaveLength(3))
      const plot = host.querySelector<HTMLElement>('[tabindex="0"][role="img"]') as HTMLElement
      plot.focus()
      const active = () => points(host).filter((point) => point.hasAttribute('data-active'))

      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(live(host)).toBe('W1: Opened 10, Average 12'))
      expect(active()).toEqual([points(host)[0]])

      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(live(host)).toBe('Opened: 10 — W1'))
      expect(active(), 'the walk is on the bar').toEqual([])

      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(live(host)).toBe('Average: 12 — W1'))
      expect(active()).toEqual([points(host)[0]])

      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(live(host)).toBe('Average: 15 — W2'))
      expect(active()).toEqual([points(host)[1]])
    })

    it('breaks the line at a gap and draws no point there', async () => {
      const host = await mount(
        lined({
          data: [
            { week: 'W1', opened: 10, average: 12 },
            { week: 'W2', opened: 20, average: null },
            { week: 'W3', opened: 30, average: 20 },
          ],
        }),
      )
      await vi.waitFor(() => expect(points(host)).toHaveLength(2))
      expect(strokes(host)[0]?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    })

    it('draws the line over stacked bars at the top of each stack it matches', async () => {
      const host = await mount(
        lined({
          data: [
            { week: 'W1', a: 10, b: 10, average: 20 },
            { week: 'W2', a: 5, b: 15, average: 20 },
          ],
          series: [
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B' },
          ],
          mode: 'stacked',
        }),
      )
      await vi.waitFor(() => expect(points(host)).toHaveLength(2))
      expect(marks(host)?.getAttribute('data-mode')).toBe('stacked')
      const tops = bars(host).filter((_, index) => index % 2 === 1)
      points(host).forEach((point, index) => {
        const top = tops[index] as SVGGraphicsElement
        expect(Number(point.getAttribute('cx'))).toBeCloseTo(centreOf(top), 1)
        expect(Number(point.getAttribute('cy'))).toBeCloseTo(top.getBBox().y, 1)
      })
    })

    it('hides a toggled line from the plot, and keeps it in the twin', async () => {
      const host = await mount(lined())
      await vi.waitFor(() => expect(points(host)).toHaveLength(3))
      const key = getByRole(host as HTMLElement, 'button', { name: 'Average' })
      await userEvent.click(key)
      await vi.waitFor(() => expect(points(host)).toHaveLength(0))
      expect(key.getAttribute('aria-pressed')).toBe('false')
      expect(bars(host)).toHaveLength(3)
      await userEvent.click(
        getByRole(host as HTMLElement, 'button', { name: /show the data table/i }),
      )
      expect(getByRole(host as HTMLElement, 'table').textContent).toContain('Average')
    })

    it('draws no lines on a horizontal chart, and warns', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const host = await mount(lined({ orientation: 'horizontal' }))
        await vi.waitFor(() => expect(bars(host)).toHaveLength(3))
        expect(points(host)).toHaveLength(0)
        expect(host.querySelector('g[class*="lines"]')).toBeNull()
        await vi.waitFor(() =>
          expect(warn).toHaveBeenCalledWith(expect.stringContaining('vertical bars only')),
        )
      } finally {
        warn.mockRestore()
      }
    })

    it('draws a chart with an empty list of lines exactly as a chart with none', async () => {
      const plain: BarLinesLawProps = {
        data: WEEKS,
        series: OPENED,
        x: { key: 'week', label: 'Week' },
        label: 'Opened by week',
      }
      const before = await mount(plain)
      await vi.waitFor(() => expect(bars(before)).toHaveLength(3))
      const after = await mount({ ...plain, lines: [] })
      await vi.waitFor(() => expect(bars(after)).toHaveLength(3))
      // Both charts are on the page, so both measure once its layout settles.
      await vi.waitFor(() => expect(marks(after)?.outerHTML).toBe(marks(before)?.outerHTML))
      expect(after.querySelector('g[class*="lines"]')).toBeNull()
      expect(summary(after)).toBe(summary(before))
    })
  })
}
