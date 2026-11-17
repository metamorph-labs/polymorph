import { getByRole } from '@testing-library/dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Countdown draws, when it changes and what it reports
 * (`design/components/countdown.md`), which every web shell's Countdown test
 * calls with a mount of its own. A contract statement reads one part's role,
 * name or attribute (`docs/conformance.md`). This law reads what the grammar
 * cannot state: the digits and the words at a moment, the change on the
 * second of the time left, `onEnd` once, the correction when a hidden
 * document is shown, and no announcement at each second.
 *
 * The clock is faked from before each mount: `setTimeout`, `clearTimeout` and
 * `Date`, and nothing else, so each framework still renders on its own
 * schedule. The law waits for a render with animation frames, which are not
 * faked, because `vi.waitFor` advances a faked clock while it polls.
 */

/** The props the law mounts a Countdown with. A prop the law leaves out is not passed. */
export interface CountdownLawProps {
  until: string
  label: string
  locale?: string
  announce?: boolean
  onEnd?: () => void
}

export interface CountdownLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Countdown with these props, and no other Countdown. */
  mount(props: CountdownLawProps): Promise<unknown>
}

/** Local noon on a fixed day, so no test depends on the date it runs on. */
const NOW = new Date(2026, 7, 7, 12, 0, 0).getTime()

const LABEL = 'Time until the code expires'

/** The moment `ms` after the pinned now, as the ISO string `until` takes. */
const at = (ms: number): string => new Date(NOW + ms).toISOString()

/** The one Countdown on the page, or `null` when it renders nothing. */
const countdown = () => document.querySelector<HTMLElement>('[data-member="countdown"]')

const root = (): HTMLElement => {
  const element = countdown()
  if (element === null) throw new Error('the Countdown rendered nothing')
  return element
}

const timer = (): HTMLElement => getByRole(root(), 'timer')

/** The digits a sighted reader sees: the text hidden from assistive technology. */
const digits = (): string => root().querySelector('[aria-hidden="true"]')?.textContent ?? ''

/** What assistive technology reads in the timer: its text, without the parts hidden from it. */
function heard(element: Element): string {
  let read = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) read += node.textContent ?? ''
    else if (node instanceof Element && node.getAttribute('aria-hidden') !== 'true') {
      node.childNodes.forEach(walk)
    }
  }
  walk(element)
  return read
}

/** Every element of the member that announces: a live region, or a role that is one. */
const regions = (): Element[] =>
  [...root().querySelectorAll('*'), root()].filter((element) => {
    const live = element.getAttribute('aria-live')
    if (live !== null) return live !== 'off'
    return ['status', 'alert', 'log'].includes(element.getAttribute('role') ?? '')
  })

/** A few animation frames, which are not faked, for a framework to render what changed. */
async function frames(count = 3): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((settle) => requestAnimationFrame(() => settle()))
  }
}

/** Moves the faked clock and its timers, then lets the framework render. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await frames()
}

/** Whether the document says it is hidden, as the law sets it. */
let hidden = false

function show(shown: boolean): void {
  hidden = !shown
  document.dispatchEvent(new Event('visibilitychange'))
}

export function countdownLaw({ shell, mount }: CountdownLaw): void {
  describe(`${shell} Countdown — what it draws, when it changes and what it reports`, () => {
    beforeAll(installTestTheme)

    beforeEach(() => {
      // The document is shown unless a test hides it, in every engine the law runs in.
      hidden = false
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      vi.setSystemTime(NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
      // The document's own `hidden` is on its prototype, so removing the law's restores it.
      Reflect.deleteProperty(document, 'hidden')
    })

    it('draws m:ss under an hour, in digits hidden from assistive technology', async () => {
      await mount({ until: at(299_000), label: LABEL, locale: 'en-US' })
      await frames()
      expect(digits()).toBe('4:59')
      expect(timer().getAttribute('datetime')).toBe('PT299S')
      expect(root().hasAttribute('data-ended')).toBe(false)
    })

    it('draws h:mm:ss from an hour', async () => {
      await mount({ until: at(3_725_000), label: LABEL, locale: 'en-US' })
      await frames()
      expect(digits()).toBe('1:02:05')
      expect(heard(timer())).toBe('1 hour, 2 minutes, 5 seconds')
    })

    it('names the timer with its label and says the time in words', async () => {
      await mount({ until: at(299_000), label: LABEL, locale: 'en-US' })
      await frames()
      expect(timer().getAttribute('aria-label')).toBe(LABEL)
      expect(heard(timer())).toBe('4 minutes, 59 seconds')
      expect(heard(timer())).not.toContain(':')
    })

    it('writes the locale’s numerals and words', async () => {
      await mount({ until: at(299_000), label: LABEL, locale: 'ar-EG' })
      await frames()
      expect(digits()).toBe('٤:٥٩')
      expect(heard(timer())).toBe(
        new Intl.ListFormat('ar-EG', { type: 'unit' }).format([
          new Intl.NumberFormat('ar-EG', {
            style: 'unit',
            unit: 'minute',
            unitDisplay: 'long',
          }).format(4),
          new Intl.NumberFormat('ar-EG', {
            style: 'unit',
            unit: 'second',
            unitDisplay: 'long',
          }).format(59),
        ]),
      )
    })

    it('changes on the second of its time left, not a second after it mounted', async () => {
      await mount({ until: at(5_500), label: LABEL, locale: 'en-US' })
      await frames()
      expect(digits()).toBe('0:06')
      await advance(499)
      expect(digits()).toBe('0:06')
      await advance(1)
      expect(digits()).toBe('0:05')
      await advance(1_000)
      expect(digits()).toBe('0:04')
    })

    it('reaches 0:00 at the moment and calls onEnd once', async () => {
      const onEnd = vi.fn()
      await mount({ until: at(2_000), label: LABEL, locale: 'en-US', onEnd })
      await frames()
      expect(onEnd).not.toHaveBeenCalled()

      await advance(1_999)
      expect(digits()).toBe('0:01')
      expect(onEnd).not.toHaveBeenCalled()

      await advance(1)
      expect(digits()).toBe('0:00')
      expect(root().hasAttribute('data-ended')).toBe(true)
      expect(heard(timer())).toBe('0 seconds')
      expect(onEnd).toHaveBeenCalledTimes(1)

      await advance(10_000)
      expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('calls onEnd once after mount for a moment already past, and draws 0:00', async () => {
      const onEnd = vi.fn()
      await mount({ until: at(-5_000), label: LABEL, locale: 'en-US', onEnd })
      await frames()
      expect(digits()).toBe('0:00')
      expect(root().hasAttribute('data-ended')).toBe(true)
      expect(onEnd).toHaveBeenCalledTimes(1)

      await advance(5_000)
      expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('waits while the document is hidden, and reads the clock as soon as it is shown', async () => {
      await mount({ until: at(90_000), label: LABEL, locale: 'en-US' })
      await frames()
      expect(digits()).toBe('1:30')

      show(false)
      await advance(30_000)
      // No second changed while nobody could see it.
      expect(digits()).toBe('1:30')

      // Shown again: the time left is read before any timer fires.
      show(true)
      await frames()
      expect(digits()).toBe('1:00')
      await advance(1_000)
      expect(digits()).toBe('0:59')
    })

    it('still calls onEnd for a moment reached while the document is hidden', async () => {
      const onEnd = vi.fn()
      await mount({ until: at(20_000), label: LABEL, locale: 'en-US', onEnd })
      await frames()
      show(false)
      await advance(20_000)
      expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('announces nothing by default: no live region, and a timer that is not live', async () => {
      await mount({ until: at(70_000), label: LABEL, locale: 'en-US' })
      await frames()
      expect(regions()).toEqual([])
      expect(timer().getAttribute('aria-live') ?? 'off').toBe('off')

      await advance(70_000)
      expect(digits()).toBe('0:00')
      expect(regions()).toEqual([])
    })

    it('with announce, says the time left at one minute and at ten seconds, and not each second', async () => {
      await mount({ until: at(61_000), label: LABEL, locale: 'en-US', announce: true })
      await frames()
      const [status, ...others] = regions()
      expect(others).toEqual([])
      expect(status?.getAttribute('role')).toBe('status')
      // Present and empty from mount, so its first line is announced.
      expect(status?.textContent).toBe('')

      // Each step is the seconds left after it, and the line the region holds then.
      const steps: [number, string][] = [
        [60, `${LABEL}: 1 minute`],
        [59, `${LABEL}: 1 minute`],
        [30, `${LABEL}: 1 minute`],
        [11, `${LABEL}: 1 minute`],
        [10, `${LABEL}: 10 seconds`],
        [9, `${LABEL}: 10 seconds`],
        // The end is not a mark: what it means is the application's to say.
        [0, `${LABEL}: 10 seconds`],
      ]
      let left = 61
      for (const [next, line] of steps) {
        await advance((left - next) * 1_000)
        left = next
        expect(status?.textContent).toBe(line)
      }
      expect(digits()).toBe('0:00')
    })

    it('renders nothing for a value that names no moment', async () => {
      const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await mount({ until: 'not-a-moment', label: LABEL })
        await frames()
        expect(countdown()).toBeNull()

        await mount({ until: '2026-08-07', label: LABEL })
        await frames()
        expect(countdown()).toBeNull()
      } finally {
        warned.mockRestore()
      }
    })
  })
}
