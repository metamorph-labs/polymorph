import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for a toast's timer across a hold (`design/components/toast.md`, Motion), which each
 * framework's Toast test calls with a mount of its own: while the viewport holds the timers the
 * toast stays past its time, and once the hold ends it leaves after the time that was left,
 * not after a whole new window. A contract statement reads attributes and handlers
 * (`docs/conformance.md`), and this law reads time, so it is stated here.
 *
 * The law holds the timers with the pointer, by dispatching `pointermove` on the card and
 * `pointerleave` on the region, because the pointer harness waits for an element to be
 * actionable and a card with little time left is gone before then.
 */

export interface ToastTimerLaw {
  /** The framework's name as the law's titles say it: `Svelte`. */
  readonly shell: string
  /** Mounts the framework's toast viewport. */
  mount(): Promise<unknown>
  /** Raises a toast that leaves after `durationMs`, through the framework's store. */
  raise(title: string, durationMs: number): void
  /** Removes every toast from the framework's store. */
  clear(): void
}

const card = () => document.querySelector<HTMLElement>('[data-member="toast"]')
const sleep = (ms: number) => new Promise<void>((settle) => setTimeout(settle, ms))

/** The window the law gives the toast, and how far into it the pointer arrives. */
const WINDOW_MS = 1200
const BEFORE_HOLD_MS = 800

export function toastTimerLaw(law: ToastTimerLaw): void {
  describe(`a toast's timer in ${law.shell}`, () => {
    beforeAll(installTestTheme)
    afterEach(() => law.clear())

    it('stays while the timers are held, and resumes with the time that was left', async () => {
      await law.mount()
      law.raise('Held', WINDOW_MS)
      await vi.waitFor(() => expect(card()).not.toBeNull())
      await sleep(BEFORE_HOLD_MS)
      card()?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
      await sleep(WINDOW_MS - BEFORE_HOLD_MS + 300)
      expect(card()?.dataset['state'], 'the timer ran while the pointer was on the card').toBe(
        'open',
      )

      // The viewport listens on the region around its list, and `pointerleave` does not bubble.
      const resumed = Date.now()
      card()
        ?.closest('[role="region"]')
        ?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }))
      await vi.waitFor(() => expect(card()?.dataset['state'] ?? 'closed').toBe('closed'), {
        timeout: WINDOW_MS * 2,
        interval: 20,
      })
      // About 400ms were left. A whole new window would take 1200ms.
      expect(Date.now() - resumed).toBeLessThan(WINDOW_MS - 300)
    })
  })
}
