import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a MonthInput reports and how its segments take keys
 * (`design/components/month-input.md`), which the React member's test and
 * every generated shell's `month-input.test` call with a mount of their own.
 * A contract statement steps one segment and moves focus. This law reads what
 * the contract grammar cannot state: the `YYYY-MM` text the field reports as
 * digits are typed, a month that wraps without moving its year, the month's
 * name in each segment's value, the locale's order, `min` and `max`, a
 * read-only field, the form value, and a value the application holds.
 *
 * The law focuses a segment from a script and waits for it, because Firefox
 * and WebKit settle focus a frame later than Chromium.
 */

/** What the law sets on the field after it mounts. */
export interface MonthInputLawProps {
  /** The month, while the application holds it. `undefined` hands it to the field. */
  value: string | null | undefined
}

export interface MonthInputLawMount {
  /** The props the field mounts with. */
  readonly props: MonthInputLawProps
  readonly defaultValue: string | undefined
  readonly min: string | undefined
  readonly max: string | undefined
  readonly locale: string
  readonly readOnly: boolean
  readonly name: string | undefined
  readonly onChange: (value: string | null) => void
}

export interface MountedMonthInput {
  /** Sets props on the field, as its parent's state would. */
  set(next: Partial<MonthInputLawProps>): void | Promise<void>
}

export interface MonthInputLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one MonthInput labelled `Expires` with the props and the handler given. */
  mount(options: MonthInputLawMount): Promise<MountedMonthInput>
}

const field = () =>
  document.querySelector<HTMLElement>('[data-member="month-input"]') as HTMLElement

/** The field's segments as they are drawn now: a shell may draw one again as a new element. */
const segments = () => [...field().querySelectorAll<HTMLElement>('[data-segment]')]
const segment = (type: 'month' | 'year') =>
  field().querySelector<HTMLElement>(`[data-segment="${type}"]`) as HTMLElement
const types = () => segments().map((each) => each.getAttribute('data-segment'))
const texts = () => segments().map((each) => each.textContent?.trim())
const focused = () => document.activeElement?.getAttribute('data-segment') ?? null

export function monthInputLaw({ shell, mount }: MonthInputLaw): void {
  describe(`${shell} MonthInput — what it reports and how its segments take keys`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    /** The field, with a spy for its handler, and the application's `set`. */
    async function expires({
      value,
      defaultValue,
      min,
      max,
      locale = 'en-US',
      readOnly = false,
      name,
    }: {
      value?: string | null
      defaultValue?: string
      min?: string
      max?: string
      locale?: string
      readOnly?: boolean
      name?: string
    } = {}) {
      const onChange = vi.fn<(value: string | null) => void>()
      const mounted = await mount({
        props: { value },
        defaultValue,
        min,
        max,
        locale,
        readOnly,
        name,
        onChange,
      })
      await vi.waitFor(() => expect(segments()).toHaveLength(2))
      return { set: mounted.set.bind(mounted), onChange }
    }

    /** Focuses a segment from a script, as a press or Tab would leave it. */
    async function focus(type: 'month' | 'year') {
      segment(type).focus()
      await vi.waitFor(() => expect(focused()).toBe(type))
    }

    const reported = (onChange: ReturnType<typeof vi.fn>) =>
      onChange.mock.calls.map((call) => call[0] as string | null)

    it('orders its two segments as the locale writes a month, with no day', async () => {
      await expires({ defaultValue: '2029-08' })
      expect(types()).toEqual(['month', 'year'])
      expect(texts()).toEqual(['8', '2029'])
      expect(field().textContent).toContain('/')
      expect(field().querySelector('[data-segment="day"]')).toBeNull()
    })

    it('puts the year first in a locale that writes it first', async () => {
      await expires({ defaultValue: '2029-08', locale: 'ja-JP' })
      expect(types()).toEqual(['year', 'month'])
      expect(texts()).toEqual(['2029', '8'])
    })

    it('reports `YYYY-MM` once both segments are filled, and on each digit after that', async () => {
      const { onChange } = await expires()
      expect(segments().every((each) => each.hasAttribute('data-placeholder'))).toBe(true)
      await focus('month')

      // No second digit could follow a 7, so focus moves to the year.
      await userEvent.keyboard('7')
      await vi.waitFor(() => expect(focused()).toBe('year'))
      expect(onChange).not.toHaveBeenCalled()

      await userEvent.keyboard('2029')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2029-07'))
      expect(reported(onChange)).toEqual(['0002-07', '0020-07', '0202-07', '2029-07'])
      expect(texts()).toEqual(['7', '2029'])
    })

    it('waits for a second digit while one could fit, and moves on once none could', async () => {
      const { onChange } = await expires({ defaultValue: '2029-08' })
      await focus('month')

      await userEvent.keyboard('1')
      await vi.waitFor(() => expect(texts()[0]).toBe('1'))
      expect(focused()).toBe('month')

      await userEvent.keyboard('2')
      await vi.waitFor(() => expect(focused()).toBe('year'))
      expect(texts()[0]).toBe('12')
      expect(reported(onChange)).toEqual(['2029-01', '2029-12'])
    })

    it('holds a leading zero until the digit after it', async () => {
      const { onChange } = await expires({ defaultValue: '2029-08' })
      await focus('month')

      await userEvent.keyboard('0')
      await vi.waitFor(() => expect(segment('month').hasAttribute('data-placeholder')).toBe(true))
      expect(reported(onChange)).toEqual([null])

      await userEvent.keyboard('3')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2029-03'))
      expect(focused()).toBe('year')
    })

    it('steps the month with the arrows and wraps it without moving the year', async () => {
      const { onChange } = await expires({ defaultValue: '2029-12' })
      await focus('month')

      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2029-01'))
      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2029-12'))

      await focus('year')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2030-12'))
      expect(focused()).toBe('year')
    })

    it('names each segment by its part and says a month by its number and its name', async () => {
      await expires({ defaultValue: '2029-08' })
      expect(segment('month').getAttribute('role')).toBe('spinbutton')
      expect(segment('month').getAttribute('aria-label')).toBe('month')
      expect(segment('year').getAttribute('aria-label')).toBe('year')
      expect(segment('month').getAttribute('aria-valuetext')).toBe('8 – August')
      expect(segment('month').getAttribute('aria-valuenow')).toBe('8')
      expect(segment('month').getAttribute('aria-valuemin')).toBe('1')
      expect(segment('month').getAttribute('aria-valuemax')).toBe('12')
      expect(segment('year').getAttribute('aria-valuetext')).toBe('2029')
    })

    it('says an unfilled segment is empty', async () => {
      await expires()
      expect(segment('month').getAttribute('aria-valuetext')).toBe('Empty')
      expect(segment('month').hasAttribute('aria-valuenow')).toBe(false)
    })

    it('reports null once a segment of a whole month is erased, and moves back from an empty one', async () => {
      const { onChange } = await expires({ defaultValue: '2029-08' })
      await focus('year')

      await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null))
      expect(reported(onChange)).toEqual(['0202-08', '0020-08', '0002-08', null])
      expect(segment('year').hasAttribute('data-placeholder')).toBe(true)
      expect(texts()[0]).toBe('8')

      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(focused()).toBe('month'))
    })

    it('marks a month outside min and max invalid, and keeps it', async () => {
      const { onChange } = await expires({
        defaultValue: '2026-03',
        min: '2026-03',
        max: '2027-02',
      })
      expect(field().hasAttribute('data-invalid')).toBe(false)
      await focus('month')

      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2026-02'))
      await vi.waitFor(() => expect(field().hasAttribute('data-invalid')).toBe(true))
      for (const each of segments()) expect(each.getAttribute('aria-invalid')).toBe('true')
      expect(texts()).toEqual(['2', '2026'])

      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(field().hasAttribute('data-invalid')).toBe(false))

      await focus('year')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2027-03'))
      await vi.waitFor(() => expect(field().hasAttribute('data-invalid')).toBe(true))
    })

    it('moves focus and edits nothing when read-only', async () => {
      const { onChange } = await expires({ defaultValue: '2029-08', readOnly: true })
      await focus('month')
      expect(segment('month').getAttribute('aria-readonly')).toBe('true')

      await userEvent.keyboard('{ArrowUp}3')
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(focused()).toBe('year'))
      expect(onChange).not.toHaveBeenCalled()
      expect(texts()).toEqual(['8', '2029'])
    })

    it('serializes the month as `YYYY-MM` under its name', async () => {
      await expires({ defaultValue: '2029-08', name: 'expiry' })
      const input = field().querySelector<HTMLInputElement>('input[type="hidden"][name="expiry"]')
      expect(input?.value).toBe('2029-08')
    })

    it('moves between its segments the other way in a right-to-left document', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      await expires({ defaultValue: '2029-08', locale: 'he-IL' })
      expect(types()).toEqual(['month', 'year'])
      await focus('month')

      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => expect(focused()).toBe('year'))
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(focused()).toBe('month'))
    })

    it('shows a value the application holds, and reports nothing when it passes back what it was told', async () => {
      const { set, onChange } = await expires({ value: '2029-08' })
      expect(texts()).toEqual(['8', '2029'])

      await set({ value: '2031-02' })
      await vi.waitFor(() => expect(texts()).toEqual(['2', '2031']))
      expect(onChange).not.toHaveBeenCalled()

      await focus('month')
      await userEvent.keyboard('{ArrowUp}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('2031-03'))
      await set({ value: '2031-03' })
      await vi.waitFor(() => expect(texts()).toEqual(['3', '2031']))
      expect(onChange).toHaveBeenCalledTimes(1)

      // An empty value the application passes clears a whole month.
      await set({ value: null })
      await vi.waitFor(() =>
        expect(segments().every((each) => each.hasAttribute('data-placeholder'))).toBe(true),
      )
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('keeps a month the reader is still filling in when the application passes back the empty value', async () => {
      const { set, onChange } = await expires({ value: '2029-08' })
      await focus('year')

      await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null))
      await set({ value: null })
      // The month the reader left stays, so the year can be typed after it.
      await vi.waitFor(() => expect(texts()).toEqual(['8', 'yyyy']))
      expect(segment('month').hasAttribute('data-placeholder')).toBe(false)
    })
  })
}
