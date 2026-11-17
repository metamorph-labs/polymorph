import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import {
  annotationLayers,
  collidingLabels,
  mapAnnotations,
  resolveSeries,
  type ChartAnnotation,
} from '@polymorph/react'

import { ChartAnnotations } from './ChartAnnotations'
import { ChartAxis } from './ChartAxis'
import { ChartBrush } from './ChartBrush'
import { ChartFrame } from './ChartFrame'
import { ChartLegend } from './ChartLegend'
import { ChartTooltip } from './ChartTooltip'
import { syncGroupSize, useSyncGroup } from './use-sync'

/**
 * Tests for the frame internals.
 *
 * These are anatomy, not members, so there is no states fixture and no gallery
 * route; the completeness law and the axe pass reach them through the members
 * that render them. The browser checks here cover what a unit test cannot: the
 * grid sizes the gutter to its labels, the frame's height comes from the size
 * token, and the plot is measured, not stretched.
 */

beforeAll(installTestTheme)

const ticks = [
  { key: '0', at: 100, label: '0' },
  { key: '50', at: 50, label: '50' },
  { key: '100', at: 0, label: '100' },
]

describe('ChartFrame', () => {
  it('has an accessible name and exposes its member, size and state as attributes', () => {
    render(
      <ChartFrame member="BarChart" label="Tickets by day" size="lg" state="loading">
        {null}
      </ChartFrame>,
    )
    const figure = screen.getByRole('figure', { name: 'Tickets by day' })
    // The frame is the member's outermost element, so the identity attribute
    // (`data-member`) is set here. The legend, the axes and the twin are all
    // inside it.
    expect(figure.dataset['member']).toBe('bar-chart')
    expect(figure.dataset['size']).toBe('lg')
    expect(figure.dataset['state']).toBe('loading')
  })

  it('takes its height from the size token, with the x-axis band inside it', () => {
    const { container } = render(
      <ChartFrame
        member="BarChart"
        label="Sized"
        size="sm"
        xAxis={<ChartAxis orientation="x" ticks={ticks} />}
      >
        {null}
      </ChartFrame>,
    )
    const region = container.querySelector('[class*="region"]') as HTMLElement
    const plot = container.querySelector('[class*="plot"]') as HTMLElement
    const regionHeight = region.getBoundingClientRect().height
    const plotHeight = plot.getBoundingClientRect().height

    // 144px at standard density: `--pm-chart-height-sm`, from the space scale.
    expect(Math.round(regionHeight)).toBe(144)
    // The band is subtracted from the height, not added to it, so a chart never
    // has its own scrollbar.
    expect(plotHeight).toBeLessThan(regionHeight)
  })

  it('passes the plot cell out to be measured instead of stretching a viewBox', () => {
    // The frame owns the *position* and the member owns the measurement. The
    // height is a token this component applies through CSS; a member that
    // computed it itself would be reading the stylesheet back from the DOM.
    let node: HTMLDivElement | null = null
    render(
      <div style={{ inlineSize: '600px' }}>
        <ChartFrame member="BarChart" label="Measured" plotRef={(element) => (node = element)}>
          {null}
        </ChartFrame>
      </div>,
    )
    const measured = (node as HTMLDivElement | null)?.getBoundingClientRect()
    expect(measured).toBeDefined()
    expect(measured!.width).toBeGreaterThan(500)
    expect(measured!.height).toBeGreaterThan(0)
  })

  it('sizes the y gutter to the widest label it is handed, in CSS', () => {
    // The rule "the y gutter is sized to the widest rendered tick label", met
    // by CSS layout, not by a measuring pass.
    const narrow = render(
      <ChartFrame
        member="BarChart"
        label="Narrow"
        yAxis={<ChartAxis orientation="y" ticks={ticks} />}
      >
        {null}
      </ChartFrame>,
    )
    const narrowGutter = (
      narrow.container.querySelector('[class*="yAxis"]') as HTMLElement
    ).getBoundingClientRect().width

    const wide = render(
      <ChartFrame
        member="BarChart"
        label="Wide"
        yAxis={
          <ChartAxis
            orientation="y"
            ticks={ticks.map((tick) => ({ ...tick, label: `${tick.label},000,000` }))}
          />
        }
      >
        {null}
      </ChartFrame>,
    )
    const wideGutter = (
      wide.container.querySelector('[class*="yAxis"]') as HTMLElement
    ).getBoundingClientRect().width

    expect(wideGutter).toBeGreaterThan(narrowGutter)
  })

  it('renders the empty state in place of the marks, with the member’s text', () => {
    render(
      <ChartFrame
        member="BarChart"
        label="Nothing yet"
        state="empty"
        empty={<span>No tickets this week</span>}
      >
        <span>marks</span>
      </ChartFrame>,
    )
    expect(screen.getByText('No tickets this week')).toBeTruthy()
    expect(screen.queryByText('marks')).toBeNull()
  })

  it('renders the summary and an always-mounted live region', () => {
    const { container } = render(
      <ChartFrame
        member="BarChart"
        label="Announced"
        summary="Two series, thirty points."
        announcement="Mon: 12"
      >
        {null}
      </ChartFrame>,
    )
    expect(screen.getByText('Two series, thirty points.')).toBeTruthy()
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    // Always mounted, because most screen readers do not announce a live region
    // added to the DOM at the same time as its content.
    expect(live).toBeTruthy()
    expect(live.textContent).toBe('Mon: 12')
  })
})

describe('ChartAxis', () => {
  it('positions ticks along its own axis and hides itself from the tree', () => {
    const { container } = render(<ChartAxis orientation="y" ticks={ticks} />)
    const axis = container.firstElementChild as HTMLElement
    expect(axis.dataset['orientation']).toBe('y')
    // The table twin and the live region repeat the labels, and an axis read
    // out tick by tick would get in the reader's way.
    expect(axis.getAttribute('aria-hidden')).toBe('true')
    const spans = [...axis.querySelectorAll('span')]
    expect(spans.map((span) => span.textContent)).toEqual(['0', '50', '100'])
    expect(spans[0]!.style.top).toBe('100px')
  })
})

describe('ChartLegend', () => {
  const { series } = resolveSeries([
    { key: 'opened', label: 'Opened' },
    { key: 'resolved', label: 'Resolved' },
  ])

  it('labels each series and colours its key from a token reference', () => {
    const { container } = render(<ChartLegend series={series} />)
    expect(screen.getByText('Opened')).toBeTruthy()
    const swatch = container.querySelector('[class*="swatch"]') as HTMLElement
    // A token *reference*, never a colour, so a palette change repaints it
    // without the component knowing.
    expect(swatch.style.getPropertyValue('--pm-chart-key')).toBe('var(--pm-chart-1)')
  })

  it('matches the key to the mark: a rect for fills, a line for strokes', () => {
    const { container } = render(<ChartLegend series={series} keyShape="line" />)
    const legend = container.firstElementChild as HTMLElement
    expect(legend.dataset['keyShape']).toBe('line')
    const swatch = container.querySelector('[class*="swatch"]') as HTMLElement
    // Shape is the second way to identify a series, for a reader who cannot
    // tell two hues apart.
    expect(Math.round(swatch.getBoundingClientRect().height)).toBe(2)
  })
})

describe('ChartLegend toggle-to-isolate', () => {
  const { series } = resolveSeries([
    { key: 'opened', label: 'Opened' },
    { key: 'resolved', label: 'Resolved' },
  ])

  it('keeps plain keys when no member asked for the toggle', () => {
    const { container } = render(<ChartLegend series={series} />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('turns the keys into pressed buttons and reports a press', async () => {
    const onToggle = vi.fn()
    render(<ChartLegend series={series} onToggle={onToggle} />)
    const key = screen.getByRole('button', { name: 'Opened' })
    // Pressed while shown: `aria-pressed` means the series is present.
    expect(key.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(key)
    expect(onToggle).toHaveBeenCalledWith('opened')
  })

  it('marks a hidden key unpressed, which the hollow style keys off', () => {
    render(<ChartLegend series={series} hidden={new Set(['resolved'])} onToggle={() => {}} />)
    expect(screen.getByRole('button', { name: 'Resolved' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(screen.getByRole('button', { name: 'Opened' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('annotations mapped from values and drawn in px', () => {
  it('maps the three kinds and folds the baseline in as the first rule', () => {
    const mapped = mapAnnotations({
      annotations: [
        { kind: 'line', value: 30, label: 'SLA' },
        { kind: 'band', from: 10, to: 20 },
        { kind: 'point', x: 'W30', y: 40, label: 'Launch' },
      ],
      baseline: { value: 50, label: 'Target' },
      valueAt: (value) => value * 2,
      categoryAt: () => 7,
      vertical: true,
    })
    expect(mapped.rules.map((rule) => rule.at)).toEqual([100, 60])
    expect(mapped.rules[0]?.label).toBe('Target')
    expect(mapped.spans).toEqual([{ key: 'band-1', from: 20, to: 40 }])
    expect(mapped.marks).toEqual([{ key: 'point-2', x: 7, y: 80, label: 'Launch' }])
  })

  it('swaps a point’s axes on a horizontal member and drops a point with no position', () => {
    const mapped = mapAnnotations({
      annotations: [
        { kind: 'point', x: 'Email', y: 40, label: 'Cap' },
        { kind: 'point', x: 'Not a band', y: 10, label: 'Nowhere' },
      ],
      baseline: undefined,
      valueAt: (value) => value * 2,
      categoryAt: (at) => (at === 'Email' ? 12 : null),
      vertical: false,
    })
    // Horizontal: the value runs along x and the category down y. A point the
    // axis cannot place draws nothing instead of sitting at an edge.
    expect(mapped.marks).toEqual([{ key: 'point-0', x: 80, y: 12, label: 'Cap' }])
  })

  it('drops only the colliding labels', () => {
    const drops = collidingLabels([
      { x0: 0, x1: 40, y0: 0, y1: 14 },
      { x0: 30, x1: 70, y0: 6, y1: 20 },
      { x0: 0, x1: 40, y0: 100, y1: 114 },
    ])
    expect(drops).toEqual([true, true, false])
  })

  it('draws band washes under the data and edges, rules, marks and labels over it', () => {
    const mapped = mapAnnotations({
      annotations: [
        { kind: 'band', from: 20, to: 35, label: 'Zone' },
        { kind: 'line', value: 45, label: 'SLA' },
        { kind: 'point', x: 'W30', y: 20, label: 'Launch' },
      ],
      baseline: undefined,
      valueAt: (value) => value,
      categoryAt: () => 60,
      vertical: true,
    })

    const wash = render(
      <svg>
        <ChartAnnotations layer="wash" layers={annotationLayers(mapped, 'y', 200, 100)} />
      </svg>,
    )
    const rect = wash.container.querySelector('rect')
    expect(rect?.getAttribute('y')).toBe('20')
    expect(rect?.getAttribute('height')).toBe('15')
    expect(rect?.getAttribute('width')).toBe('200')
    // The wash layer draws only fills; labels belong to the ink layer.
    expect(wash.container.querySelector('text')).toBeNull()

    const ink = render(
      <svg>
        <ChartAnnotations layer="ink" layers={annotationLayers(mapped, 'y', 200, 100)} />
      </svg>,
    )
    // Two band edges plus one rule, one point mark, and three labels with room:
    // rule labels first, then spans, then marks.
    expect(ink.container.querySelectorAll('path')).toHaveLength(3)
    expect(ink.container.querySelectorAll('circle')).toHaveLength(1)
    const texts = [...ink.container.querySelectorAll('text')].map((text) => text.textContent)
    expect(texts).toEqual(['SLA', 'Zone', 'Launch'])
  })

  it('keeps a colliding pair’s rules and drops only their labels', () => {
    const mapped = mapAnnotations({
      annotations: [
        { kind: 'line', value: 50, label: 'Target' },
        { kind: 'line', value: 52, label: 'Stretch' },
        { kind: 'line', value: 90, label: 'Floor' },
      ],
      baseline: undefined,
      valueAt: (value) => value,
      categoryAt: () => null,
      vertical: true,
    })
    const { container } = render(
      <svg>
        <ChartAnnotations layer="ink" layers={annotationLayers(mapped, 'y', 200, 100)} />
      </svg>,
    )
    expect(container.querySelectorAll('path')).toHaveLength(3)
    const texts = [...container.querySelectorAll('text')].map((text) => text.textContent)
    expect(texts).toEqual(['Floor'])
  })

  it('draws a label below an anchor that has no room above it in the plot', () => {
    // The plot's svg cuts what is drawn above its top edge. A band whose top is the top of the
    // domain, a rule there and a point there would each lose their label.
    const layersOf = (annotation: ChartAnnotation) =>
      annotationLayers(
        mapAnnotations({
          annotations: [annotation],
          baseline: undefined,
          valueAt: (value) => value,
          categoryAt: () => 60,
          vertical: true,
        }),
        'y',
        200,
        100,
      )
    const baselineOf = (annotation: ChartAnnotation) => layersOf(annotation).ink?.labels[0]?.y ?? 0

    // With room, the label's baseline is above its anchor.
    expect(baselineOf({ kind: 'line', value: 50, label: 'SLA' })).toBeLessThan(50)
    expect(baselineOf({ kind: 'point', x: 'W30', y: 50, label: 'Launch' })).toBeLessThan(50)

    // Without it, the baseline is below the anchor by more than the text's height.
    const TEXT = 12
    expect(baselineOf({ kind: 'line', value: 0, label: 'Ceiling' })).toBeGreaterThan(TEXT)
    expect(baselineOf({ kind: 'band', from: 0, to: 30, label: 'Target' })).toBeGreaterThan(TEXT)
    expect(baselineOf({ kind: 'point', x: 'W30', y: 4, label: 'Peak' })).toBeGreaterThan(4 + TEXT)

    // The drawn text is inside the svg that holds it.
    const { container } = render(
      <svg width={200} height={100}>
        <ChartAnnotations
          layer="ink"
          layers={layersOf({ kind: 'band', from: 0, to: 30, label: 'Target' })}
        />
      </svg>,
    )
    const svg = container.querySelector('svg') as SVGSVGElement
    const text = container.querySelector('text') as SVGTextElement
    expect(text.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      svg.getBoundingClientRect().top - 1,
    )
  })
})

describe('ChartBrush', () => {
  it('paints the range with the selection roles and edges only its boundaries', () => {
    const { container } = render(
      <svg>
        <ChartBrush from={80} to={20} height={100} />
      </svg>,
    )
    const rect = container.querySelector('rect')
    // Accepts either order and sorts it.
    expect(rect?.getAttribute('x')).toBe('20')
    expect(rect?.getAttribute('width')).toBe('60')
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })
})

describe('the sync registry', () => {
  function Probe({ id, log }: { id?: string; log: (value: number | null) => void }) {
    const broadcast = useSyncGroup(id, log)
    return (
      <button type="button" onClick={() => broadcast(42)}>
        send
      </button>
    )
  }

  it('sends a value to every other member and never back to the sender', async () => {
    const heard: Array<number | null> = []
    const echoed: Array<number | null> = []
    render(
      <>
        <Probe id="pair" log={(value) => echoed.push(value)} />
        <Probe id="pair" log={(value) => heard.push(value)} />
      </>,
    )
    expect(syncGroupSize('pair')).toBe(2)
    await userEvent.click(screen.getAllByRole('button', { name: 'send' })[0]!)
    expect(heard).toEqual([42])
    // The sender is excluded from its own broadcast, so nothing echoes.
    expect(echoed).toEqual([])
  })

  it('leaves the group on unmount and removes the empty group from the registry', () => {
    const { unmount } = render(<Probe id="solo" log={() => {}} />)
    expect(syncGroupSize('solo')).toBe(1)
    unmount()
    expect(syncGroupSize('solo')).toBe(0)
  })

  it('joins nothing without an id, and its broadcast reaches no group', async () => {
    const heard: Array<number | null> = []
    render(
      <>
        <Probe log={() => {}} />
        <Probe id="any" log={(value) => heard.push(value)} />
      </>,
    )
    expect(syncGroupSize('any')).toBe(1)
    await userEvent.click(screen.getAllByRole('button', { name: 'send' })[0]!)
    expect(heard).toEqual([])
    expect(syncGroupSize('any')).toBe(1)
  })
})

describe('ChartTooltip', () => {
  it('shows the value before the label', () => {
    const { container } = render(
      <ChartTooltip
        header="Mon"
        x={120}
        y={40}
        rows={[{ key: 'opened', label: 'Opened', value: '12', paint: 'var(--pm-chart-1)' }]}
      />,
    )
    const row = container.querySelector('[class*="row"]') as HTMLElement
    const text = [...row.querySelectorAll('span')].map((span) => span.textContent)
    // Key, then value, then label: the reverse of the legend's order.
    expect(text).toEqual(['', '12', 'Opened'])
  })

  it('positions itself within the frame instead of in a portal', () => {
    const { container } = render(
      <div style={{ position: 'relative' }}>
        <ChartTooltip
          x={120}
          y={40}
          rows={[{ key: 'a', label: 'A', value: '1', paint: 'var(--pm-chart-1)' }]}
        />
      </div>,
    )
    const tip = container.querySelector('[class*="tooltip"]') as HTMLElement
    expect(tip.parentElement).toBe(container.firstElementChild)
    expect(tip.style.getPropertyValue('--pm-chart-tip-x')).toBe('120px')
    expect(tip.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders nothing when there is nothing at the reading position', () => {
    const { container } = render(<ChartTooltip x={0} y={0} rows={[]} />)
    expect(container.firstElementChild).toBeNull()
  })
})
