import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { DonutChart, type DonutChartProps, type DonutSegment } from './DonutChart'
import { states } from './donut-chart.states'

/**
 * Browser checks: a zero segment takes none of the ring and keeps its row, the
 * **share** is shown wherever the value is, and every segment has a pointer
 * target large enough to hit.
 */

beforeAll(installTestTheme)

const CHANNELS: DonutSegment[] = [
  { key: 'email', label: 'Email', value: 214 },
  { key: 'chat', label: 'Chat', value: 96 },
  { key: 'phone', label: 'Phone', value: 41 },
  { key: 'social', label: 'Social', value: 18 },
]

const arcs = (root: Element) => [...root.querySelectorAll('path[class*="segment"]')]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DonutChartProps>(true)
  })
})

describe('DonutChart', () => {
  it('draws one arc per segment, in declaration order', () => {
    const { container } = render(<DonutChart segments={CHANNELS} label="Channels" />)
    expect(arcs(container)).toHaveLength(4)
  })

  it('draws no arc for a zero segment but keeps its legend key and row', async () => {
    const { container } = render(
      <DonutChart
        segments={[...CHANNELS.slice(0, 3), { key: 'social', label: 'Social', value: 0 }]}
        label="With an unused channel"
      />,
    )
    // Three arcs and four legend keys. A zero belongs in the table; on the ring
    // it would be a sliver that suggests a quantity.
    expect(arcs(container)).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /With an unused channel — data/ })
    expect(table.textContent).toContain('Social')
    expect(table.textContent).toContain('0%')
  })

  it('keeps a negative segment off the ring and in the twin', async () => {
    const { container } = render(
      <DonutChart
        segments={[
          { key: 'sales', label: 'Sales', value: 400 },
          { key: 'refunds', label: 'Refunds', value: -60 },
        ]}
        label="Signed"
      />,
    )
    expect(arcs(container)).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    // Data is never silently dropped. The value is in the table, where a
    // negative number can be read.
    expect(screen.getByRole('table', { name: /Signed — data/ }).textContent).toContain('-60')
  })

  it('keeps the ring when one segment is not a number', async () => {
    // One NaN in the total's reduce would erase every arc. Counted as zero, the
    // bad segment draws no arc and shows no number (the twin's em dash, as for
    // any absent value), and the rest of the ring still draws.
    const { container } = render(
      <DonutChart
        segments={[
          { key: 'email', label: 'Email', value: 214 },
          { key: 'chat', label: 'Chat', value: Number.NaN },
          { key: 'phone', label: 'Phone', value: 41 },
        ]}
        label="Partly measured"
      />,
    )
    expect(arcs(container)).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: /show the data table/i }))
    const table = screen.getByRole('table', { name: /Partly measured — data/ })
    const row = [...table.querySelectorAll('tbody tr')].find((entry) =>
      entry.textContent?.includes('Chat'),
    )
    expect(row?.textContent).toContain('—')
  })

  it('shows the share beside the value', async () => {
    const { container } = render(<DonutChart segments={CHANNELS} label="Shares" />)
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()

    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    // A cursor left over an arc would set the reading position, and the first
    // arrow would step from there. `test-setup.ts` moves the cursor away; this
    // assertion names the failure if that stops working.
    expect(live.textContent, 'a resting pointer had already set the position').toBe('')

    await userEvent.keyboard('{ArrowRight}')
    expect(live.textContent).toContain('Email')
    expect(live.textContent).toContain('214')
    expect(live.textContent).toMatch(/%/)
  })

  it('renders the center figure as real text, pre-formatted by the app', () => {
    const { container } = render(
      <DonutChart
        segments={CHANNELS}
        center={{ value: '369', label: 'Open tickets' }}
        label="With a total"
      />,
    )
    const text = [...container.querySelectorAll('text')].map((node) => node.textContent)
    expect(text).toContain('369')
    expect(text).toContain('Open tickets')
  })

  it('gives every segment a pointer target of at least 24px', () => {
    const { container } = render(
      <DonutChart
        segments={[
          { key: 'bulk', label: 'Bulk', value: 990 },
          { key: 'sliver', label: 'Sliver', value: 10 },
        ]}
        label="Uneven"
      />,
    )
    const hits = [...container.querySelectorAll('path[class*="hit"]')]
    expect(hits).toHaveLength(2)
    // A 1% arc is a two-pixel sliver. Its target is grown to 24px, so the
    // target path differs from the painted path.
    const [, sliver] = arcs(container)
    expect(hits[1]?.getAttribute('d')).not.toBe(sliver?.getAttribute('d'))
  })

  it('shows no legend for a single segment', () => {
    const { container } = render(
      <DonutChart segments={[{ key: 'all', label: 'All', value: 12 }]} label="One" />,
    )
    expect(container.querySelector('[class*="legend"]')).toBeNull()
  })

  it('reports the selection with the share included', async () => {
    const onSelect = vi.fn()
    const { container } = render(
      <DonutChart segments={CHANNELS} onSelect={onSelect} label="Selectable" />,
    )
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()
    // Left/Right walk segments clockwise. Enter reports the read segment with
    // its share, which the geometry shows least accurately.
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}')
    expect(onSelect).toHaveBeenCalledWith({
      key: 'chat',
      label: 'Chat',
      value: 96,
      share: 96 / (214 + 96 + 41 + 18),
    })
    expect(container.textContent).toContain('Enter or Space selects')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'React',
  member: 'DonutChart',
  entries: states.entries,
  adapter: reactAdapter,
})
