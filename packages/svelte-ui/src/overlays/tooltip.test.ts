import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/svelte'

import { render } from '../mount'
import TooltipHarness from '../testing/TooltipHarness.svelte'

/**
 * Tooltip's delays in the Svelte shell are the engine's, which the React
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
    await render(TooltipHarness, {})
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
