import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a RecordButton draws and reports
 * (`design/components/record-button.md`, Behaviour), which every web shell's
 * RecordButton test calls with a mount of its own. A contract statement starts
 * from a fixture entry and changes no prop (`docs/conformance.md`), and an
 * `activates` statement holds when any handler runs. This law reads what the
 * grammar cannot state: which handler a press calls in each state, that a
 * press changes nothing until the application does, where focus is when the
 * application starts recording, and what the meter says and does not announce.
 *
 * It clicks the Button and focuses it from a script, because Tab passes over
 * buttons in WebKit.
 */

/** The props the law mounts a RecordButton with. */
export interface RecordButtonLawProps {
  label: string
  stopLabel: string
  recording?: boolean
  elapsed?: number
  level?: number
  locale?: string
  onStart?: () => void
  onStop?: () => void
}

/** What the law sets on the RecordButton after it mounts, as the application does. */
export interface RecordButtonState {
  recording: boolean
  elapsed: number
}

export interface MountedRecordButton {
  /** Sets props on the RecordButton, as its parent's state would. */
  set(next: Partial<RecordButtonState>): void | Promise<void>
}

export interface RecordButtonLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one RecordButton with these props. A prop the law leaves out is not passed. */
  mount(props: RecordButtonLawProps): Promise<MountedRecordButton>
}

const LABELS = { label: 'Record a voice message', stopLabel: 'Stop recording' }

const root = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="record-button"]')
  if (element === null) throw new Error('no RecordButton rendered')
  return element
}
const button = () => root().querySelector('button') as HTMLButtonElement
const meter = () => root().querySelector<HTMLElement>('[data-record-button-part="meter"]')
const mark = () => meter()?.querySelector<HTMLElement>('[aria-hidden="true"]') ?? null

/** The halo's scale, from its computed transform: `none` is the full size. */
const haloScale = (): number => {
  const transform = getComputedStyle(mark() as HTMLElement, '::before').transform
  if (transform === 'none') return 1
  const [scale = '1'] = transform.replace(/^matrix\(/, '').split(',')
  return Number.parseFloat(scale)
}

export function recordButtonLaw({ shell, mount }: RecordButtonLaw): void {
  describe(`${shell} RecordButton — what it draws and reports`, () => {
    beforeAll(installTestTheme)

    it('names the Button for what a press does, and never as a pressed toggle', async () => {
      const held = await mount({ ...LABELS })
      expect(getByRole(root(), 'button', { name: 'Record a voice message' })).toBe(button())
      expect(button().hasAttribute('aria-pressed')).toBe(false)

      await held.set({ recording: true })
      await vi.waitFor(() => expect(button().getAttribute('aria-label')).toBe('Stop recording'))
      expect(button().hasAttribute('aria-pressed')).toBe(false)
      expect(root().getAttribute('data-state')).toBe('recording')
    })

    it('reports a press as a start, and draws nothing new until the app records', async () => {
      const started = vi.fn()
      const stopped = vi.fn()
      await mount({ ...LABELS, onStart: started, onStop: stopped })

      await userEvent.click(button())
      expect(started).toHaveBeenCalledTimes(1)
      expect(stopped).not.toHaveBeenCalled()
      // The application owns the recording, so the press alone changes no state.
      expect(root().hasAttribute('data-state')).toBe(false)
      expect(meter()).toBeNull()
      expect(button().getAttribute('aria-label')).toBe('Record a voice message')
    })

    it('reports a press while recording as a stop', async () => {
      const started = vi.fn()
      const stopped = vi.fn()
      await mount({ ...LABELS, recording: true, elapsed: 4, onStart: started, onStop: stopped })

      await userEvent.click(button())
      expect(stopped).toHaveBeenCalledTimes(1)
      expect(started).not.toHaveBeenCalled()
    })

    it('keeps focus on the Button when the app starts and stops recording', async () => {
      const held = await mount({ ...LABELS })
      const pressed = button()
      pressed.focus()
      expect(document.activeElement).toBe(pressed)

      await held.set({ recording: true, elapsed: 0 })
      await vi.waitFor(() => expect(meter()).not.toBeNull())
      expect(button()).toBe(pressed)
      expect(document.activeElement).toBe(pressed)

      await held.set({ recording: false })
      await vi.waitFor(() => expect(meter()).toBeNull())
      expect(document.activeElement).toBe(pressed)
    })

    it('draws the time beside the mark while recording, in no live region', async () => {
      const held = await mount({ ...LABELS, recording: true, elapsed: 75, level: 0.5 })

      expect(meter()?.textContent).toBe('1:15')
      expect(mark()?.getAttribute('aria-hidden')).toBe('true')
      // The time is text a reader can reach, and it is not announced as it moves.
      expect(meter()?.closest('[aria-hidden="true"]')).toBeNull()
      expect(
        root().querySelector('[aria-live], [role="status"], [role="log"], [role="timer"]'),
      ).toBeNull()

      await held.set({ elapsed: 76 })
      await vi.waitFor(() => expect(meter()?.textContent).toBe('1:16'))
    })

    it('draws only the mark until the app counts a second', async () => {
      await mount({ ...LABELS, recording: true })
      expect(mark()).not.toBeNull()
      expect(meter()?.textContent).toBe('')
    })

    it('writes the time in the locale’s numerals', async () => {
      await mount({ ...LABELS, recording: true, elapsed: 75, locale: 'ar-EG' })
      expect(meter()?.textContent).toBe('١:١٥')
    })

    it('draws the level as the halo’s size, the whole mark at the full level', async () => {
      await mount({ ...LABELS, recording: true, elapsed: 3, level: 1 })
      await vi.waitFor(() => expect(haloScale()).toBeCloseTo(1, 2))
    })

    it('draws a silent input with the halo hidden under the dot, and still says it records', async () => {
      await mount({ ...LABELS, recording: true, elapsed: 3, level: 0 })
      // A third of the mark is the dot's own size.
      await vi.waitFor(() => expect(haloScale()).toBeCloseTo(1 / 3, 2))
      expect(root().getAttribute('data-state')).toBe('recording')
      expect(button().getAttribute('aria-label')).toBe('Stop recording')
      expect(meter()?.textContent).toBe('0:03')
    })
  })
}
