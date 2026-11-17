import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import SplitPaneHarness from '../testing/SplitPaneHarness.svelte'

/**
 * SplitPane in Svelte, where a ratio becomes a number of pixels: what its
 * contract cannot state (`design/components/split-pane.md`). The separator
 * publishes the px floors measured over its box, not a fixed 0/100, and every
 * step and drag clamps to them. A keyboard step commits as a release does, and
 * a drag follows the pointer, shows its held state and commits once on release.
 */

beforeAll(installTestTheme)

const divider = () => document.querySelector<HTMLElement>('[role="separator"]') as HTMLElement

/** A 400px box for the grid to be measured against (`testing/SplitPaneHarness.svelte`). */
async function boxed(props: Record<string, unknown>) {
  const host = await render(SplitPaneHarness, { label: 'Resize navigator', ...props })
  return host.host.querySelector<HTMLElement>('[data-member="split-pane"]') as HTMLElement
}

describe('SplitPane measures its floors', () => {
  it('publishes the measured clamp, and the keys stop at it', async () => {
    await boxed({ startMin: 100, endMin: 100 })
    // 400px less the seam is the usable rail; 100px of it on each side.
    await vi.waitFor(() => {
      const min = Number(divider().getAttribute('aria-valuemin'))
      expect(min).toBeGreaterThan(20)
      expect(min).toBeLessThan(30)
      expect(Number(divider().getAttribute('aria-valuemax'))).toBe(100 - min)
    })
    divider().focus()
    await userEvent.keyboard('{PageDown}')
    expect(divider().getAttribute('aria-valuenow')).toBe('40')
    await userEvent.keyboard('{PageDown}{PageDown}{PageDown}')
    expect(divider().getAttribute('aria-valuenow')).toBe(divider().getAttribute('aria-valuemin'))
    await userEvent.keyboard('{End}')
    expect(divider().getAttribute('aria-valuenow')).toBe(divider().getAttribute('aria-valuemax'))
  })

  it('commits every keyboard step, with the ratio on two-percent marks', async () => {
    const ratioChange = vi.fn()
    const commit = vi.fn()
    await boxed({ onRatioChange: ratioChange, onCommit: commit })
    divider().focus()
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}{ArrowLeft}')
    expect(divider().getAttribute('aria-valuenow')).toBe('48')
    expect(ratioChange).toHaveBeenCalledTimes(3)
    expect(commit.mock.calls).toEqual([[0.52], [0.5], [0.48]])
  })
})

describe('SplitPane follows a drag', () => {
  it('shows the held state, follows the pointer and commits once on release', async () => {
    const commit = vi.fn()
    const root = await boxed({ onCommit: commit })
    const handle = divider()
    const box = root.getBoundingClientRect()
    const from = handle.getBoundingClientRect()
    const grab = { clientX: from.left + from.width / 2, clientY: from.top + from.height / 2 }
    const press = (type: string, clientX: number) =>
      handle.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY: grab.clientY }),
      )

    press('pointerdown', grab.clientX)
    await vi.waitFor(() => expect(handle.getAttribute('data-state')).toBe('dragging'))
    press('pointermove', box.left + box.width * 0.75)
    await vi.waitFor(() => {
      const now = Number(handle.getAttribute('aria-valuenow'))
      expect(now).toBeGreaterThan(70)
      expect(now).toBeLessThan(80)
    })
    const dragged = Number(handle.getAttribute('aria-valuenow'))
    press('pointerup', box.left + box.width * 0.75)
    await vi.waitFor(() => expect(handle.getAttribute('data-state')).toBeNull())
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]?.[0]).toBeCloseTo(dragged / 100, 1)
  })

  it('ignores a pointer that moves without a press', async () => {
    await boxed({})
    divider().dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 }),
    )
    expect(divider().getAttribute('aria-valuenow')).toBe('50')
  })
})
