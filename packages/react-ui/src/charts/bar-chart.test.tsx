import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned, type ChartDatum } from '@polymorph/react'
import { barLinesLaw } from '@polymorph/conformance/bar-lines'
import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { barChartReadingLaw } from '@polymorph/conformance/chart-reading'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { BarChart, type BarChartProps } from './BarChart'
import { states } from './bar-chart.states'

/**
 * Browser checks for *geometry*, which unit tests of the engine cannot cover:
 * the marks land where the engine's arithmetic says (tested in the engine's
 * `charts/charts.test.ts`), with the pointer, the tooltip, the legend and the
 * twin. The reading position and its keys are the law's
 * (`@polymorph/conformance/chart-reading`), the lines over the bars are
 * `@polymorph/conformance/bar-lines`'s, and the chart's box is
 * `@polymorph/conformance/chart-box`'s; this file calls each for React.
 */

beforeAll(installTestTheme)

const ROWS: ChartDatum[] = [
  { day: 'Mon', opened: 32, resolved: 28 },
  { day: 'Tue', opened: 41, resolved: 39 },
  { day: 'Wed', opened: 37, resolved: 40 },
]

const PAIR = [
  { key: 'opened', label: 'Opened' },
  { key: 'resolved', label: 'Resolved' },
]

const bars = (root: Element) => [...root.querySelectorAll('path[class*="bar"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<BarChartProps>(true)
  })
})

/* The lines over the bars are the law every shell runs (`@polymorph/conformance/bar-lines`). */
barLinesLaw({
  shell: 'React',
  async mount(props) {
    return render(<BarChart {...props} />).container
  },
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'BarChart', entries: states.entries, adapter: reactAdapter })

describe('BarChart', () => {
  it('draws one mark per series per row and has an accessible name', () => {
    const { container } = render(
      <BarChart data={ROWS} series={PAIR} x={{ key: 'day' }} label="Opened and resolved" />,
    )
    expect(bars(container)).toHaveLength(6)
    expect(screen.getAllByRole('img', { name: 'Opened and resolved' }).length).toBeGreaterThan(0)
  })

  it('draws nothing for a gap instead of a zero-height bar', () => {
    // `null` is a gap, never a zero. A zero-height mark would sit on the axis
    // and read as a measured zero, which is a different statement.
    const { container } = render(
      <BarChart
        data={[
          { day: 'Mon', opened: 32 },
          { day: 'Tue', opened: null },
        ]}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day' }}
        label="With a gap"
      />,
    )
    expect(bars(container)).toHaveLength(1)
  })

  it('anchors the value axis at zero however far from it the data sits', () => {
    // A truncated bar misleads: the mark's length is the value, so the axis must
    // start at zero.
    const { container } = render(
      <BarChart
        data={[
          { day: 'Mon', v: 40 },
          { day: 'Tue', v: 44 },
        ]}
        series={[{ key: 'v', label: 'Value' }]}
        x={{ key: 'day' }}
        label="Anchored"
      />,
    )
    const ticks = [...container.querySelectorAll('[class*="yAxis"] span')].map(
      (span) => span.textContent,
    )
    expect(ticks).toContain('0')
  })

  it('rounds the data end and leaves the baseline square', () => {
    const { container } = render(
      <BarChart
        data={[{ day: 'Mon', v: 40 }]}
        series={[{ key: 'v', label: 'Value' }]}
        x={{ key: 'day' }}
        label="Rounded"
      />,
    )
    const d = bars(container)[0]?.getAttribute('d') ?? ''
    // Two arcs, not four: the two corners at the data end. A rect can only
    // round all corners or none, so the mark is drawn as a path.
    expect(d.match(/A/g)).toHaveLength(2)
  })

  it('caps bar thickness so the band keeps its spacing', () => {
    const { container } = render(
      <BarChart
        data={[{ day: 'Mon', v: 40 }]}
        series={[{ key: 'v', label: 'Value' }]}
        x={{ key: 'day' }}
        label="Capped"
      />,
    )
    const box = (bars(container)[0] as SVGPathElement).getBBox()
    // 24px. The rest of a very wide single band is left empty on purpose.
    expect(box.width).toBeLessThanOrEqual(24)
  })

  it('exposes its orientation and mode as attributes', () => {
    const { container } = render(
      <BarChart
        data={ROWS}
        series={PAIR}
        x={{ key: 'day' }}
        orientation="horizontal"
        mode="stacked"
        label="Stacked, horizontal"
      />,
    )
    const marks = container.querySelector('svg[data-orientation]') as SVGElement
    expect(marks.getAttribute('data-orientation')).toBe('horizontal')
    expect(marks.getAttribute('data-mode')).toBe('stacked')
  })

  it('renders grouped when a stack is handed values on both sides of zero', () => {
    // Nothing is silently clamped. Mixed signs belong to mode "diverging", and
    // the fallback here is grouped, which can draw both signs.
    const { container } = render(
      <BarChart
        data={[{ day: 'Mon', a: 4, b: -2 }]}
        series={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ]}
        x={{ key: 'day' }}
        mode="stacked"
        label="Mixed signs"
      />,
    )
    expect(container.querySelector('svg[data-mode]')?.getAttribute('data-mode')).toBe('grouped')
    expect(bars(container)).toHaveLength(2)
  })

  it('makes every hit target at least 24px wide, however dense the chart', () => {
    // Thirty bands in a 360px plot gives bands of about 10px, which is too small
    // a target. `hitBox` grows each one to the system minimum. Neighbours may
    // overlap at this density, as the ring's targets do: an overlapping target
    // still hits something, and a sliver hits nothing.
    const dense = Array.from({ length: 30 }, (_, index) => ({
      day: `D${index + 1}`,
      v: 5 + (index % 7),
    }))
    const { container } = render(
      <div style={{ inlineSize: '360px' }}>
        <BarChart
          data={dense}
          series={[{ key: 'v', label: 'Value' }]}
          x={{ key: 'day' }}
          label="Dense"
        />
      </div>,
    )
    const hits = [...container.querySelectorAll('rect[class*="hit"]')]
    expect(hits).toHaveLength(30)
    for (const hit of hits) {
      expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(24)
    }
  })

  it('shows no axis over a first load with no rows', () => {
    // `loading` takes precedence over `empty`, so a check on the *empty* state
    // would let a first load show an invented 0–1 scale over an unmeasured plot.
    // No rows means no axis. Loading with rows keeps its axes, as part of the
    // held frame.
    const { container: firstLoad } = render(
      <BarChart data={[]} series={PAIR} x={{ key: 'day' }} loading label="First load" />,
    )
    expect(firstLoad.querySelector('[class*="tick"]')).toBeNull()

    const { container: refetch } = render(
      <BarChart data={ROWS} series={PAIR} x={{ key: 'day' }} loading label="Refetch" />,
    )
    expect(refetch.querySelector('[class*="tick"]')).not.toBeNull()
  })

  it('staggers the bands from zero delay and does not animate the grid or rules', () => {
    // The entrance stagger counts only bands. A rule on `.marks g` would also
    // scale the grid and the target rule out of the zero line, and would carry
    // no stagger, so every band would enter at once.
    const { container } = render(
      <BarChart
        data={ROWS}
        series={PAIR}
        x={{ key: 'day' }}
        baseline={{ value: 38, label: 'Target' }}
        label="Entrance"
      />,
    )
    const bands = [...container.querySelectorAll('[class*="bands"] > g')]
    expect(bands).toHaveLength(3)
    expect(getComputedStyle(bands[0]!).animationName).toContain('chart-bars-rise')
    expect(getComputedStyle(bands[0]!).animationDelay).toBe('0s')
    expect(getComputedStyle(bands[1]!).animationDelay).not.toBe('0s')
    const grid = container.querySelector('[class*="grid"]') as SVGGElement
    // The target rule is in the shared annotation layer, and the same check
    // applies to it.
    const target = container.querySelector('[class*="ink"]') as SVGGElement
    expect(target).toBeTruthy()
    expect(getComputedStyle(grid).animationName).toBe('none')
    expect(getComputedStyle(target).animationName).toBe('none')
  })

  it('keeps the reading position and the twin when the tooltip is off', async () => {
    // `tooltip={false}` removes the visual layer only. Print surfaces lose the
    // hover, never the data.
    const { container } = render(
      <BarChart data={ROWS} series={PAIR} x={{ key: 'day' }} tooltip={false} label="Print" />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    // As above: the claim is about arriving with nothing read.
    expect(live.textContent, 'a resting pointer had already set the position').toBe('')

    await userEvent.keyboard('{ArrowRight}')
    expect(container.querySelector('[class*="tooltip"]')).toBeNull()
    expect(live.textContent).toContain('Opened 32')
    expect(screen.getByRole('button', { name: /data table/i })).toBeTruthy()
  })

  it('opens a real table with every value the marks carry', async () => {
    render(<BarChart data={ROWS} series={PAIR} x={{ key: 'day' }} label="Twin" />)
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    // Found by name, not just by role: a dashboard renders several twins, and an
    // unnamed one cannot be told apart from other tables on the page. The name
    // comes from `Table`'s `<caption>`.
    const table = screen.getByRole('table', { name: /Twin — data/ })
    expect(table).toBeTruthy()
    // Every value is reachable without hover, which is what allows the palette's
    // soft gates (`docs/charts.md`).
    expect(table.textContent).toContain('41')
    expect(table.textContent).toContain('39')
  })

  /** The largest number the value axis currently states. */
  const axisMax = (root: Element): number =>
    Math.max(
      ...[...root.querySelectorAll('[class*="yAxis"] span')].map((span) =>
        Number(span.textContent ?? '0'),
      ),
    )

  it('hides a toggled series and refits the domain, but keeps it in the twin', async () => {
    const { container } = render(
      <BarChart
        data={[
          { day: 'Mon', opened: 40, resolved: 8 },
          { day: 'Tue', opened: 44, resolved: 10 },
        ]}
        series={PAIR}
        x={{ key: 'day' }}
        label="Refit"
      />,
    )
    expect(bars(container)).toHaveLength(4)
    const before = axisMax(container)
    expect(before).toBeGreaterThanOrEqual(44)

    const key = screen.getByRole('button', { name: 'Opened' })
    await userEvent.click(key)
    expect(key.getAttribute('aria-pressed')).toBe('false')
    // Hiding removes the series: one mark per row, and the y domain refits,
    // because changing the view is the purpose of hiding.
    expect(bars(container)).toHaveLength(2)
    expect(axisMax(container)).toBeLessThan(before)

    // The twin never hides data, because it always receives the unfiltered set.
    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /Refit — data/ })
    expect(table.textContent).toContain('Opened')
    expect(table.textContent).toContain('40')
  })

  it('activates on click at the band the pointer is reading', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <BarChart
        data={ROWS}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day' }}
        onSelect={onSelect}
        label="Clickable"
      />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    await userEvent.click(plot)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ key: 'opened' })
  })

  it('draws a reference band and a target through the shared annotation layer', () => {
    const { container } = render(
      <BarChart
        data={ROWS}
        series={PAIR}
        x={{ key: 'day' }}
        baseline={{ value: 40, label: 'Target' }}
        annotations={[{ kind: 'band', from: 30, to: 38 }]}
        label="Annotated"
      />,
    )
    expect(container.querySelector('[class*="span"]')).toBeTruthy()
    expect(container.querySelector('[class*="rule"]')).toBeTruthy()
    const texts = [...container.querySelectorAll('text')].map((text) => text.textContent)
    expect(texts).toContain('Target')
  })

  it('extends a stacked axis to the running total', () => {
    const { container } = render(
      <BarChart
        data={[{ day: 'Mon', a: 40, b: 40, c: 40 }]}
        series={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
          { key: 'c', label: 'C' },
        ]}
        x={{ key: 'day' }}
        mode="stacked"
        label="Stack total"
      />,
    )
    // The value axis reaches the stack's total, not the largest single band.
    // The segments are passed to cartesian.ts, as it documents.
    const ticks = [...container.querySelectorAll('[class*="tick"]')].map(
      (tick) => tick.textContent ?? '',
    )
    expect(ticks.some((label) => Number(label.replace(/[^\d]/g, '')) >= 120)).toBe(true)
  })
})

describe('BarChart mode="diverging" (the Likert form)', () => {
  const LIKERT: ChartDatum[] = [
    { question: 'Speed', sd: -9, d: -16, a: 31, sa: 14 },
    { question: 'Ease', sd: -4, d: -11, a: 38, sa: 17 },
  ]

  const SCALE = [
    { key: 'sd', label: 'Strongly disagree' },
    { key: 'd', label: 'Disagree' },
    { key: 'a', label: 'Agree' },
    { key: 'sa', label: 'Strongly agree' },
  ]

  it('stacks each side outward from zero and sets data-mode', () => {
    const { container } = render(
      <BarChart
        data={LIKERT}
        series={SCALE}
        x={{ key: 'question' }}
        mode="diverging"
        label="Likert"
      />,
    )
    const marks = container.querySelector('svg[data-mode]') as SVGElement
    expect(marks.getAttribute('data-mode')).toBe('diverging')
    // One column per band: four segments each, two rows.
    expect(bars(container)).toHaveLength(8)
  })

  it('colours the arms by distance from zero on each side, arm 1 nearest the centre', () => {
    const { container } = render(
      <BarChart
        data={LIKERT}
        series={SCALE}
        x={{ key: 'question' }}
        mode="diverging"
        label="Arms"
      />,
    )
    const paints = bars(container).map((bar) =>
      (bar as SVGElement).style.getPropertyValue('--pm-chart-mark'),
    )
    expect(paints).toContain('var(--pm-chart-neg-1)')
    expect(paints).toContain('var(--pm-chart-neg-2)')
    expect(paints).toContain('var(--pm-chart-pos-1)')
    expect(paints).toContain('var(--pm-chart-pos-2)')
    // Slot hues never appear; the arms are the only colours here.
    expect(paints.some((paint) => paint.includes('--pm-chart-1'))).toBe(false)
  })

  it('reverses the mixed-sign warning, so all-positive data warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <BarChart
        data={[{ question: 'Speed', a: 31, sa: 14 }]}
        series={SCALE.slice(2)}
        x={{ key: 'question' }}
        mode="diverging"
        label="One-sided"
      />,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('all one sign'))
    warn.mockRestore()

    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <BarChart
        data={LIKERT}
        series={SCALE}
        x={{ key: 'question' }}
        mode="diverging"
        label="Signed"
      />,
    )
    expect(quiet.mock.calls.some(([message]) => String(message).includes('all one sign'))).toBe(
      false,
    )
    quiet.mockRestore()
  })

  it('names Histogram in the warning for a continuous x', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <BarChart
        data={[{ day: 4, opened: 3 }]}
        series={[{ key: 'opened', label: 'Opened' }]}
        x={{ key: 'day', scale: 'linear' }}
        label="Continuum"
      />,
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('histogram.md'))
    expect(warn.mock.calls.some(([message]) => String(message).includes('deferred'))).toBe(false)
    warn.mockRestore()
  })

  it('keeps a series’ arm colour when other series are hidden', async () => {
    const { container } = render(
      <BarChart
        data={LIKERT}
        series={SCALE}
        x={{ key: 'question' }}
        mode="diverging"
        label="Isolate"
      />,
    )
    // Hide everything but "Strongly agree". Its paint must stay arm 2 and not
    // shift inward to arm 1.
    for (const name of ['Strongly disagree', 'Disagree', 'Agree']) {
      await userEvent.click(screen.getByRole('button', { name }))
    }
    const paints = bars(container).map((bar) =>
      (bar as SVGElement).style.getPropertyValue('--pm-chart-mark'),
    )
    expect(paints.length).toBeGreaterThan(0)
    expect(new Set(paints)).toEqual(new Set(['var(--pm-chart-pos-2)']))
  })
})

/* The reading position and its keys, as every shell holds them (`@polymorph/conformance/chart-reading`). */
barChartReadingLaw({
  shell: 'React',
  mount: async (props) => render(<BarChart {...props} />),
})
