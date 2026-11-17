import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/vue'

import Button from '../controls/Button.vue'
import Inline from '../layout/Inline.vue'
import { mount } from '../mount'
import Tooltip from './Tooltip.vue'

/**
 * Tooltip's delays in the Vue shell are the engine's, which the React
 * Tooltip's provider reads too (`design/components/tooltip.md`): a bubble
 * waits half a second on hover, and a reader moving to the next control within
 * the skip window does not wait again.
 */

beforeAll(installTestTheme)

const bubble = (text: string) =>
  [...document.querySelectorAll('[data-member="tooltip"]')].find((element) =>
    element.textContent?.includes(text),
  )

describe('Tooltip waits as the spec says', () => {
  it('uses the engine’s values', () => {
    expect([TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS]).toEqual([500, 250])
  })

  it('opens after the delay on hover, and the next one at once', async () => {
    await mount(() =>
      h(Inline, { gap: 2 }, () => [
        h(Tooltip, { content: 'Archive' }, () => [h(Button, { label: 'One' })]),
        h(Tooltip, { content: 'Duplicate' }, () => [h(Button, { label: 'Two' })]),
      ]),
    )
    const [one, two] = [...document.querySelectorAll<HTMLElement>('button')]
    // The delays are the machine's timers, run here on a fake clock. What is measured is the
    // timers, not how long a hover takes to reach the page while the whole suite runs.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await userEvent.hover(one as HTMLElement)
      await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS - 1)
      expect(bubble('Archive')).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(bubble('Archive')).toBeDefined()

      // Within the skip window, the next control's bubble opens with no time passing.
      await userEvent.hover(two as HTMLElement)
      await vi.advanceTimersByTimeAsync(0)
      expect(bubble('Duplicate')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Tooltip grows from the edge it opens on', () => {
  it('passes its side and alignment to the motion engine, as the React member does', async () => {
    await mount(() =>
      h(Tooltip, { content: 'Archive', side: 'right', align: 'start', defaultOpen: true }, () => [
        h(Button, { label: 'One' }),
      ]),
    )
    await vi.waitFor(() => expect(bubble('Archive')).toBeDefined())
    const surface = bubble('Archive') as HTMLElement
    // Firefox writes the third axis out, as `left top 0px`.
    await vi.waitFor(() => expect(surface.style.transformOrigin).toMatch(/^left top( 0px)?$/))
  })
})

describe('Tooltip keeps off its trigger', () => {
  it('sits one space step from it, on each side', async () => {
    const offset = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pm-space-2'),
    )
    expect(offset).toBeGreaterThan(0)
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const content = `Hint to the ${side}`
      // Room on every side of the trigger, so the bubble lands on the side asked for and each
      // of the four is measured.
      const { unmount } = await mount(() =>
        h('div', { style: { padding: '120px' } }, [
          h(Inline, { justify: 'center' }, () => [
            h(Tooltip, { content, side, defaultOpen: true }, () => [h(Button, { label: side })]),
          ]),
        ]),
      )
      await vi.waitFor(() => expect(bubble(content)).toBeDefined())
      const surface = bubble(content) as HTMLElement
      const trigger = [...document.querySelectorAll('button')].at(-1) as HTMLElement
      // Measured between the two boxes, as the React member's test measures it. The gap is the
      // recipe's and not the positioner's own gutter, which is a number of pixels. The wait
      // covers the positioner and the arrival. The positioner rounds to whole pixels, so the
      // gap is within one of the token.
      await vi.waitFor(() => {
        const box = surface.getBoundingClientRect()
        const anchor = trigger.getBoundingClientRect()
        const gaps = {
          top: anchor.top - box.bottom,
          bottom: box.top - anchor.bottom,
          left: anchor.left - box.right,
          right: box.left - anchor.right,
        }
        expect(surface.dataset['side']).toBe(side)
        expect(Math.abs(gaps[side] - offset), side).toBeLessThan(1)
      })
      unmount()
    }
  })
})

/**
 * The recipe caps the bubble at the room beside its trigger, which Zag's positioner measures
 * (`--available-width`). The positioner moves a bubble to the other side of its trigger when
 * the first is short, and does nothing more when both are: in a 375px window a centred
 * trigger leaves about 155px each side.
 */
describe('Tooltip in a narrow window', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  for (const side of ['left', 'right'] as const) {
    it(`stays inside the window when neither side holds it, opened to the ${side}`, async () => {
      await page.viewport(375, 812)
      const content = `Grows out of the ${side} edge of its trigger`
      await mount(() =>
        h(Inline, { justify: 'center' }, () => [
          h(Tooltip, { content, side, defaultOpen: true }, () => [h(Button, { label: side })]),
        ]),
      )
      await vi.waitFor(() => expect(bubble(content)).toBeDefined())
      const surface = bubble(content) as HTMLElement
      const trigger = (document.querySelector('button') as HTMLElement).getBoundingClientRect()
      await vi.waitFor(() => {
        const box = surface.getBoundingClientRect()
        // Placed beside its trigger. Until the positioner has run, the bubble waits at the
        // window's corner, over the trigger's column, where every edge check would pass. The
        // positioner rounds to whole pixels, so the two boxes may share one.
        expect(box.right <= trigger.left + 1 || box.left >= trigger.right - 1).toBe(true)
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth)
      })
      // The text wraps inside the narrower bubble. None of it is cut.
      expect(surface.scrollWidth).toBe(surface.clientWidth)
    })
  }
})
