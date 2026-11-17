import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { SplitPane, type SplitPaneProps } from './SplitPane'
import { states } from './split-pane.states'

/**
 * SplitPane in a real browser, where a ratio becomes a number of pixels.
 *
 * Three claims. The separator is a real WAI window-splitter: named, valued,
 * fully keyboard-operable, and accurate about its clamp. The
 * `aria-valuemin`/`-max` it publishes are the px floors measured over its
 * actual box, not a fixed 0/100. The floors apply twice: the paint through
 * `minmax()`, and the interaction through the same numbers. The orientation
 * words are inverted on purpose: side-by-side panes have a vertical divider
 * line, and this test pins the inversion so nobody mistakes it for a bug.
 */

beforeAll(installTestTheme)

const divider = () => screen.getByRole('separator')

/** A box the grid can be measured against: 400px of usable rail plus the seam. */
function mount(node: React.ReactElement, size = 400) {
  const { container } = render(
    <div style={{ inlineSize: `${size}px`, blockSize: `${size}px` }}>{node}</div>,
  )
  return container.firstElementChild?.firstElementChild as HTMLElement
}

const panes = () => (
  <SplitPane label="Resize navigator" start={<p>navigator</p>} end={<p>canvas</p>} />
)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SplitPaneProps>(true)
  })
})

describe('the separator', () => {
  it('is named, valued, and controls the start pane', () => {
    mount(panes())
    const handle = screen.getByRole('separator', { name: 'Resize navigator' })
    expect(handle.getAttribute('aria-valuenow')).toBe('50')
    const startPane = document.getElementById(handle.getAttribute('aria-controls') ?? '')
    expect(startPane?.textContent).toBe('navigator')
  })

  it('reports the divider line’s axis, not the panes’, as the spec requires', () => {
    mount(panes())
    expect(divider().getAttribute('aria-orientation')).toBe('vertical')
  })

  it('inverts the other way when the panes stack', () => {
    mount(
      <SplitPane
        label="Resize response"
        orientation="vertical"
        start={<p>request</p>}
        end={<p>response</p>}
      />,
    )
    expect(divider().getAttribute('aria-orientation')).toBe('horizontal')
    expect(divider().parentElement?.getAttribute('data-orientation')).toBe('vertical')
  })

  it('publishes the measured clamp, not a fixed 0/100', async () => {
    mount(
      <SplitPane
        label="Resize navigator"
        startMin={100}
        endMin={100}
        start={<p>navigator</p>}
        end={<p>canvas</p>}
      />,
    )
    // 400px box minus the seam leaves the usable rail; 100px each side of it.
    await vi.waitFor(() => {
      const min = Number(divider().getAttribute('aria-valuemin'))
      const max = Number(divider().getAttribute('aria-valuemax'))
      expect(min).toBeGreaterThan(20)
      expect(min).toBeLessThan(30)
      expect(max).toBe(100 - min)
    })
  })
})

describe('the keyboard contract', () => {
  it('steps along the split axis and commits every step as a release', async () => {
    const onRatioChange = vi.fn()
    const onCommit = vi.fn()
    mount(
      <SplitPane
        label="Resize navigator"
        onRatioChange={onRatioChange}
        onCommit={onCommit}
        start={<p>navigator</p>}
        end={<p>canvas</p>}
      />,
    )
    divider().focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(divider().getAttribute('aria-valuenow')).toBe('52')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(divider().getAttribute('aria-valuenow')).toBe('48')
    expect(onRatioChange).toHaveBeenCalledTimes(3)
    expect(onCommit).toHaveBeenCalledTimes(3)
    expect(onCommit).toHaveBeenLastCalledWith(0.48)
  })

  it('ignores the cross-axis arrows, so scrolling past never moves the layout', async () => {
    mount(panes())
    divider().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')
    expect(divider().getAttribute('aria-valuenow')).toBe('50')
  })

  it('pages by ten and moves Home/End to the clamp’s ends', async () => {
    mount(
      <SplitPane
        label="Resize navigator"
        startMin={100}
        endMin={100}
        start={<p>navigator</p>}
        end={<p>canvas</p>}
      />,
    )
    // Let the ResizeObserver publish the measured clamp first.
    await vi.waitFor(() => {
      expect(Number(divider().getAttribute('aria-valuemin'))).toBeGreaterThan(0)
    })
    divider().focus()
    await userEvent.keyboard('{PageDown}')
    expect(divider().getAttribute('aria-valuenow')).toBe('40')
    await userEvent.keyboard('{Home}')
    expect(divider().getAttribute('aria-valuenow')).toBe(divider().getAttribute('aria-valuemin'))
    await userEvent.keyboard('{End}')
    expect(divider().getAttribute('aria-valuenow')).toBe(divider().getAttribute('aria-valuemax'))
  })

  it('steps the block axis when stacked', async () => {
    mount(
      <SplitPane
        label="Resize response"
        orientation="vertical"
        start={<p>request</p>}
        end={<p>response</p>}
      />,
    )
    divider().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(divider().getAttribute('aria-valuenow')).toBe('52')
    await userEvent.keyboard('{ArrowLeft}')
    expect(divider().getAttribute('aria-valuenow')).toBe('52')
  })
})

describe('pointer dragging', () => {
  it('follows a drag, shows the held state, and commits on release', async () => {
    const onCommit = vi.fn()
    const root = mount(
      <SplitPane
        label="Resize navigator"
        onCommit={onCommit}
        start={<p>navigator</p>}
        end={<p>canvas</p>}
      />,
    )

    const handle = divider()
    const rect = root.getBoundingClientRect()
    const from = handle.getBoundingClientRect()
    const grabX = from.left + from.width / 2
    const grabY = from.top + from.height / 2

    // Real pointer events, not a synthesised sequence, because capture and
    // release are part of what is tested.
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        clientX: grabX,
        clientY: grabY,
      }),
    )
    // The press, the move and the release all go through React's flush, so
    // each is awaited rather than read synchronously.
    await vi.waitFor(() => expect(handle.getAttribute('data-state')).toBe('dragging'))

    const targetX = rect.left + rect.width * 0.75
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: targetX,
        clientY: grabY,
      }),
    )
    await vi.waitFor(() => {
      const now = Number(handle.getAttribute('aria-valuenow'))
      expect(now).toBeGreaterThan(70)
      expect(now).toBeLessThan(80)
    })
    const dragged = Number(handle.getAttribute('aria-valuenow'))

    handle.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        clientX: targetX,
        clientY: grabY,
      }),
    )
    await vi.waitFor(() => expect(handle.getAttribute('data-state')).toBeNull())
    expect(onCommit).toHaveBeenCalledTimes(1)
    // `aria-valuenow` is the ratio rounded to a percent; the commit is exact.
    expect(onCommit.mock.calls[0]?.[0]).toBeCloseTo(dragged / 100, 1)
  })

  it('ignores pointer movement without a press', () => {
    mount(panes())
    divider().dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }),
    )
    expect(divider().getAttribute('aria-valuenow')).toBe('50')
  })
})

describe('the floors', () => {
  it('clamps what it reports to the same numbers minmax paints', async () => {
    mount(
      <SplitPane
        label="Resize navigator"
        startMin={100}
        endMin={100}
        start={<p>navigator</p>}
        end={<p>canvas</p>}
      />,
    )
    await vi.waitFor(() => {
      expect(Number(divider().getAttribute('aria-valuemin'))).toBeGreaterThan(0)
    })
    divider().focus()
    // Four page steps of 10 from 50 would reach 10, past the floor of about 25 that
    // 100px of a 400px box sets. The clamp holds.
    await userEvent.keyboard('{PageDown}{PageDown}{PageDown}{PageDown}')
    expect(divider().getAttribute('aria-valuenow')).toBe(divider().getAttribute('aria-valuemin'))
  })

  it('keeps a controlled ratio, but reports the clamped value', async () => {
    mount(
      <SplitPane
        label="Resize navigator"
        ratio={0.95}
        endMin={100}
        start={<p>navigator</p>}
        end={<p>canvas</p>}
      />,
    )
    await vi.waitFor(() => {
      const now = Number(divider().getAttribute('aria-valuenow'))
      expect(now).toBeLessThan(95)
      expect(now).toBe(Number(divider().getAttribute('aria-valuemax')))
    })
  })
})

describe('an agent', () => {
  it('reads the position the separator reports, and sets it as a drag does and commits', async () => {
    const onRatioChange = vi.fn()
    const onCommit = vi.fn()
    const bridge = createAgentBridge()
    try {
      mount(
        <SplitPane
          label="Resize navigator"
          onRatioChange={onRatioChange}
          onCommit={onCommit}
          start={<p>navigator</p>}
          end={<p>canvas</p>}
        />,
      )
      const [split] = bridge.snapshot().members
      expect(split).toMatchObject({
        member: 'SplitPane',
        name: 'Resize navigator',
        state: { position: 50 },
        actions: [{ name: 'set', argument: 'number' }],
      })
      const { results } = await bridge.act([{ id: split?.id ?? '', action: 'set', value: 30 }])
      expect(results[0]).toMatchObject({
        ok: true,
        changed: { position: { from: 50, to: 30 } },
      })
      expect(divider().getAttribute('aria-valuenow')).toBe('30')
      expect(onRatioChange).toHaveBeenCalledExactlyOnceWith(0.3)
      expect(onCommit).toHaveBeenCalledExactlyOnceWith(0.3)
    } finally {
      bridge.dispose()
    }
  })

  it('stops at the bounds the floors give, as the keyboard does', async () => {
    const bridge = createAgentBridge()
    try {
      mount(
        <SplitPane
          label="Resize navigator"
          startMin={100}
          endMin={100}
          start={<p>navigator</p>}
          end={<p>canvas</p>}
        />,
      )
      await vi.waitFor(() => {
        expect(Number(divider().getAttribute('aria-valuemin'))).toBeGreaterThan(0)
      })
      const id = bridge.snapshot().members[0]?.id ?? ''
      await bridge.act([{ id, action: 'set', value: 0 }])
      expect(bridge.snapshot().members[0]?.state['position']).toBe(
        Number(divider().getAttribute('aria-valuemin')),
      )
      await bridge.act([{ id, action: 'set', value: 100 }])
      expect(bridge.snapshot().members[0]?.state['position']).toBe(
        Number(divider().getAttribute('aria-valuemax')),
      )
    } finally {
      bridge.dispose()
    }
  })

  it('stays where a controlled caller holds it, and still reports the set', async () => {
    const onRatioChange = vi.fn()
    const bridge = createAgentBridge()
    try {
      mount(
        <SplitPane
          label="Resize navigator"
          ratio={0.66}
          onRatioChange={onRatioChange}
          start={<p>navigator</p>}
          end={<p>canvas</p>}
        />,
      )
      const id = bridge.snapshot().members[0]?.id ?? ''
      const { results } = await bridge.act([{ id, action: 'set', value: 40 }])
      expect(results[0]).toMatchObject({ ok: true, changed: {} })
      expect(onRatioChange).toHaveBeenCalledExactlyOnceWith(0.4)
      expect(divider().getAttribute('aria-valuenow')).toBe('66')
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * A stacked split divides the height its container gives it. With none, it has only its
 * content's, and the ratio leaves each pane half of what it holds. The fixture gives the
 * stacked entry a box with a height, so the gallery shows both panes whole.
 */
describe('the stacked fixture entry', () => {
  it('gives the split a height, so neither pane cuts what it holds', () => {
    const entry = states.entries.find((candidate) => candidate.name.startsWith('stacked'))
    const { container } = render(<>{entry?.render()}</>)
    const split = container.querySelector('[data-orientation="vertical"]') as HTMLElement
    const [start, , end] = [...split.children] as HTMLElement[]
    for (const pane of [start, end]) {
      expect(pane?.clientHeight).toBeGreaterThan(0)
      expect(pane?.scrollHeight).toBe(pane?.clientHeight)
    }
  })
})
