import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a DurationInput reports and draws
 * (`design/components/duration-input.md`), which every web shell's
 * DurationInput test calls with a mount of its own. A contract statement reads
 * one part's role or attribute, or one key's effect on a value
 * (`docs/conformance.md`). This law reads what the grammar cannot state: the
 * seconds the field reports and when, a step that carries into the next count,
 * a typed count that is refused, `min` and `max` holding a commit, a
 * controlled value, the hidden field, a value the counts cannot write, and the
 * words each count says.
 *
 * The law focuses a count from a script and reads `document.activeElement`,
 * because Tab does not stop on every element in WebKit. Focus leaves the field
 * for a button the law puts beside it. Every reading waits, because a shell
 * commits a change a moment after the event.
 */

/** A unit the field shows, as the member's `DurationUnit` names it. */
export type DurationInputLawUnit = 'days' | 'hours' | 'minutes' | 'seconds'

/** The props the law mounts a DurationInput with. A prop the law leaves out is not passed. */
export interface DurationInputLawProps {
  value?: number | null
  defaultValue?: number | null
  units?: readonly DurationInputLawUnit[]
  min?: number
  max?: number
  readOnly?: boolean
  name?: string
  messages?: { empty: string }
}

export interface DurationInputLawMount {
  readonly props: DurationInputLawProps
  readonly onChange: (seconds: number | null) => void
}

export interface MountedDurationInput {
  /** Sets props on the field, as its parent's state would. */
  set(next: Partial<DurationInputLawProps>): void | Promise<void>
}

export interface DurationInputLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one DurationInput with `locale="en-US"`, `aria-label="Inactivity lifetime"`, the
   * props given and the handler, and no other DurationInput.
   */
  mount(options: DurationInputLawMount): Promise<MountedDurationInput>
}

/** Seven days, an inactivity lifetime the surveyed session policies allow. */
const WEEK = 604_800

const field = () =>
  document.querySelector<HTMLElement>('[data-member="duration-input"]') as HTMLElement

/** The counts as they are drawn now: a shell may draw one again as a new element. */
const counts = () => [...field().querySelectorAll<HTMLElement>('[role="spinbutton"]')]
const count = (unit: DurationInputLawUnit) =>
  field().querySelector<HTMLElement>(`[data-segment="${unit}"]`) as HTMLElement

const texts = () => counts().map((element) => element.textContent?.trim())
const read = (attribute: string) => counts().map((element) => element.getAttribute(attribute))
const hidden = () => field().querySelector<HTMLInputElement>('input[type="hidden"]')
const focused = () => document.activeElement?.getAttribute('data-segment') ?? null

/** The unit words drawn beside the counts, hidden from assistive software. */
const words = () =>
  [...field().querySelectorAll<HTMLElement>('[aria-hidden="true"]')].map((element) =>
    element.textContent?.trim(),
  )

let outside: HTMLButtonElement | null = null

/** Moves focus out of the field, to a button beside it, as a reader's Tab or press would. */
async function leave() {
  outside ??= Object.assign(document.createElement('button'), { type: 'button' })
  outside.textContent = 'Save'
  document.body.append(outside)
  outside.focus()
  await vi.waitFor(() => expect(document.activeElement).toBe(outside))
}

export function durationInputLaw({ shell, mount }: DurationInputLaw): void {
  describe(`DurationInput — the ${shell} shell`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
      outside?.remove()
    })

    async function start(props: DurationInputLawProps) {
      const onChange = vi.fn<(seconds: number | null) => void>()
      const mounted = await mount({ props, onChange })
      await vi.waitFor(() => expect(counts().length).toBeGreaterThan(0))
      return { onChange, mounted }
    }

    async function focus(unit: DurationInputLawUnit) {
      count(unit).focus()
      await vi.waitFor(() => expect(focused()).toBe(unit))
    }

    it('names each count by its unit and says its value with the unit’s word', async () => {
      await start({ defaultValue: WEEK })
      expect(read('data-segment')).toEqual(['days', 'hours', 'minutes'])
      await vi.waitFor(() => expect(texts()).toEqual(['7', '0', '0']))
      expect(read('aria-label')).toEqual(['day', 'hour', 'minute'])
      expect(read('aria-valuetext')).toEqual(['7 days', '0 hours', '0 minutes'])
      expect(read('aria-valuenow')).toEqual(['7', '0', '0'])
      // The largest count has no ceiling unless `max` sets one; a smaller one stays under the next.
      expect(read('aria-valuemax')).toEqual([null, '23', '59'])
      expect(words()).toEqual(['days', 'hr', 'min'])
    })

    it('says its empty word while a count is empty', async () => {
      await start({ messages: { empty: 'Leer' } })
      expect(read('aria-valuetext')).toEqual(['Leer', 'Leer', 'Leer'])
      expect(read('aria-valuenow')).toEqual([null, null, null])
      expect(read('data-placeholder')).toEqual(['', '', ''])
    })

    it('steps a count with the arrows and reports the seconds at once', async () => {
      const { onChange } = await start({ defaultValue: WEEK })
      await focus('hours')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(WEEK + 3_600))
      await vi.waitFor(() => expect(texts()).toEqual(['7', '1', '0']))
      expect(focused()).toBe('hours')
    })

    it('carries a step into the next larger count, and borrows from it', async () => {
      const { onChange } = await start({ units: ['hours', 'minutes'], defaultValue: 3_540 })
      await focus('minutes')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(3_600))
      await vi.waitFor(() => expect(texts()).toEqual(['1', '0']))
      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(3_540))
      await vi.waitFor(() => expect(texts()).toEqual(['0', '59']))
    })

    it('reports typed digits when focus leaves the field, and not before', async () => {
      const { onChange } = await start({})
      await focus('minutes')
      await userEvent.keyboard('45')
      await vi.waitFor(() => expect(texts()).toEqual(['––', '––', '45']))
      // A move between the field's own counts is not leaving it.
      await focus('hours')
      expect(onChange).not.toHaveBeenCalled()
      await leave()
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(2_700))
      expect(onChange).toHaveBeenCalledTimes(1)
      // The empty counts read as zero, and the committed value is drawn whole.
      await vi.waitFor(() => expect(texts()).toEqual(['0', '0', '45']))
    })

    it('commits on Enter, where focus stays', async () => {
      const { onChange } = await start({ units: ['minutes'] })
      await focus('minutes')
      await userEvent.keyboard('5{Enter}')
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(300))
      expect(focused()).toBe('minutes')
    })

    it('refuses 90 in the minutes of a field that shows hours: the 9 fills them and focus moves on', async () => {
      const { onChange } = await start({ units: ['hours', 'minutes', 'seconds'] })
      await focus('minutes')
      await userEvent.keyboard('9')
      await vi.waitFor(() => expect(focused()).toBe('seconds'))
      await userEvent.keyboard('0')
      await vi.waitFor(() => expect(texts()).toEqual(['––', '9', '0']))
      await leave()
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(540))
    })

    it('lets the largest count pass the size of the next unit', async () => {
      const { onChange } = await start({ units: ['hours', 'minutes'] })
      await focus('hours')
      await userEvent.keyboard('36')
      await leave()
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(129_600))
      await vi.waitFor(() => expect(texts()).toEqual(['36', '0']))
    })

    it('holds a commit inside min and max, and refuses a digit past max', async () => {
      const { onChange } = await start({ min: 900, max: WEEK })
      expect(read('aria-valuemax')).toEqual(['7', '23', '59'])
      await focus('minutes')
      await userEvent.keyboard('5')
      await leave()
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(900))
      await vi.waitFor(() => expect(texts()).toEqual(['0', '0', '15']))
      // A digit no count of the days reaches under `max` is refused.
      await focus('days')
      await userEvent.keyboard('9')
      await new Promise((resolve) => setTimeout(resolve, 50))
      await vi.waitFor(() => expect(texts()).toEqual(['0', '0', '15']))
      // Seven days and the fifteen minutes already there pass `max`, so the commit holds at it.
      await userEvent.keyboard('7')
      await leave()
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(WEEK))
      await vi.waitFor(() => expect(texts()).toEqual(['7', '0', '0']))
    })

    it('stops the arrows at min and max', async () => {
      const { onChange } = await start({ min: 900, max: WEEK, defaultValue: WEEK })
      await focus('days')
      await userEvent.keyboard('{ArrowUp}')
      await focus('minutes')
      await userEvent.keyboard('{ArrowUp}')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onChange).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(texts()).toEqual(['7', '0', '0']))
      await focus('days')
      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(518_400))
    })

    it('erases with Backspace, moves back from an empty count, and commits null once all are empty', async () => {
      const { onChange } = await start({ units: ['hours', 'minutes'], defaultValue: 5_400 })
      await focus('minutes')
      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(texts()).toEqual(['1', '3']))
      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(texts()).toEqual(['1', '––']))
      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(focused()).toBe('hours'))
      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(texts()).toEqual(['––', '––']))
      expect(onChange).not.toHaveBeenCalled()
      await leave()
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(null))
    })

    it('draws a controlled value, and the value the app sets next', async () => {
      const { onChange, mounted } = await start({ units: ['hours', 'minutes'], value: 3_600 })
      await vi.waitFor(() => expect(texts()).toEqual(['1', '0']))
      await mounted.set({ value: 7_200 })
      await vi.waitFor(() => expect(texts()).toEqual(['2', '0']))
      await focus('hours')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(10_800))
      await mounted.set({ value: 600 })
      await vi.waitFor(() => expect(texts()).toEqual(['0', '10']))
      await mounted.set({ value: null })
      await vi.waitFor(() => expect(texts()).toEqual(['––', '––']))
    })

    it('posts the committed value in whole seconds under its name', async () => {
      await start({ name: 'inactivity', defaultValue: WEEK })
      expect(hidden()?.name).toBe('inactivity')
      expect(hidden()?.value).toBe('604800')
      await focus('days')
      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(hidden()?.value).toBe('518400'))
      await userEvent.keyboard('{Backspace}{Backspace}')
      await focus('hours')
      await userEvent.keyboard('{Backspace}')
      await focus('minutes')
      await userEvent.keyboard('{Backspace}')
      await leave()
      await vi.waitFor(() => expect(hidden()?.value).toBe(''))
    })

    it('keeps a value its counts cannot write until the reader changes them', async () => {
      const { onChange } = await start({ units: ['minutes'], defaultValue: 90, name: 'grace' })
      // Drawn to the nearest minute, half up, and posted as it was given.
      await vi.waitFor(() => expect(texts()).toEqual(['2']))
      expect(hidden()?.value).toBe('90')
      await focus('minutes')
      await leave()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onChange).not.toHaveBeenCalled()
      expect(hidden()?.value).toBe('90')
      await focus('minutes')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(180))
    })

    it('moves focus and edits nothing when read-only', async () => {
      const { onChange } = await start({ readOnly: true, defaultValue: WEEK })
      expect(read('aria-readonly')).toEqual(['true', 'true', 'true'])
      await focus('days')
      await userEvent.keyboard('{ArrowUp}3{Backspace}')
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(focused()).toBe('hours'))
      await leave()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onChange).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(texts()).toEqual(['7', '0', '0']))
    })

    it('moves between counts along the row, staying at its ends, and turns right to left', async () => {
      await start({ defaultValue: WEEK })
      await focus('days')
      await userEvent.keyboard('{ArrowLeft}')
      expect(focused()).toBe('days')
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(focused()).toBe('hours'))
      document.documentElement.setAttribute('dir', 'rtl')
      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => expect(focused()).toBe('minutes'))
      await userEvent.keyboard('{ArrowRight}{ArrowRight}')
      await vi.waitFor(() => expect(focused()).toBe('days'))
    })
  })
}
