import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/svelte'

import { render } from '../mount'
import TooltipBelowTheFoldHarness from '../testing/TooltipBelowTheFoldHarness.svelte'
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

/**
 * A tooltip the keyboard opened stays while its control holds keyboard focus
 * (`design/components/tooltip.md`, A11y): a Tab to a control below the fold
 * scrolls the page a frame after the focus that opened it. The controls are
 * text fields, which Tab reaches in every engine.
 */
describe('Tooltip while the keyboard holds its control', () => {
  afterEach(() => {
    document.scrollingElement?.scrollTo(0, 0)
  })

  async function tabBelow() {
    await render(TooltipBelowTheFoldHarness, {})
    const field = (name: string) =>
      document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`) as HTMLInputElement
    field('Above').focus()
    await userEvent.tab()
    await vi.waitFor(() => expect(document.activeElement).toBe(field('Below')))
    await vi.waitFor(() => expect(bubble('Archive this ticket')).toBeDefined())
    await vi.waitFor(() => expect(document.scrollingElement?.scrollTop).toBeGreaterThan(0))
    // The scroll event comes in the frame after the scroll.
    await new Promise((settle) => setTimeout(settle, 200))
    return { below: field('Below'), after: field('After') }
  }

  it('stays open when the Tab that opened it scrolls the page', async () => {
    const { below } = await tabBelow()
    expect(bubble('Archive this ticket')).toBeDefined()
    const described = below.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(described)?.textContent).toBe('Archive this ticket')
  })

  it('still closes on Escape', async () => {
    await tabBelow()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(bubble('Archive this ticket')).toBeUndefined())
  })

  it('still closes when focus moves on', async () => {
    const { after } = await tabBelow()
    await userEvent.tab()
    await vi.waitFor(() => expect(document.activeElement).toBe(after))
    await vi.waitFor(() => expect(bubble('Archive this ticket')).toBeUndefined())
  })

  it('still closes on a press on its control', async () => {
    const { below } = await tabBelow()
    await userEvent.click(below)
    await vi.waitFor(() => expect(bubble('Archive this ticket')).toBeUndefined())
  })
})
