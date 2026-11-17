import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Meter says and draws (`design/components/meter.md`),
 * which every web shell's Meter test calls with a mount of its own. A contract
 * statement reads one part's role, name or attribute in one fixture entry
 * (`docs/conformance.md`). This law reads what the grammar cannot state: the
 * tone at each side of each threshold, the clamping of a value outside the
 * range, the words heard as the value, the name of the status glyph, and the
 * edge the fill grows from in a right-to-left page.
 */

/** The props the law mounts a Meter with. */
export interface MeterLawProps {
  label: string
  value: number
  min?: number
  max?: number
  warning?: number
  danger?: number
  valueText?: string
  messages?: { warning: string; danger: string }
}

export interface MeterLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one Meter with these props, after any the test mounted before it. A
   * prop the law leaves out is not passed.
   */
  mount(props: MeterLawProps): Promise<unknown>
}

/** The Meter mounted last: a test mounts several, and each mount is added at the end of the body. */
const root = (): HTMLElement => {
  const element = [...document.querySelectorAll<HTMLElement>('[data-member="meter"]')].at(-1)
  if (element === undefined) throw new Error('the Meter rendered nothing')
  return element
}

/** The element that is the meter to assistive technology. */
const meter = (): HTMLElement => {
  const element = root().querySelector<HTMLElement>('[role="meter"]')
  if (element === null) throw new Error('the Meter has no element with role="meter"')
  return element
}

/** The fill: the meter's one child. */
const fill = (): HTMLElement => meter().firstElementChild as HTMLElement

/** The status glyph, a named image after the meter, or `null`. */
const glyph = (): HTMLElement | null => root().querySelector<HTMLElement>('[role="img"]')

const tone = () => root().getAttribute('data-tone')

const THRESHOLDS = { label: 'Storage used', max: 50, warning: 40, danger: 45 } as const

export function meterLaw({ shell, mount }: MeterLaw): void {
  describe(`${shell} Meter — what it says and draws`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    it('is a meter named by its label, with its range and its value', async () => {
      await mount({ label: 'Storage used', value: 30, max: 50 })

      expect(meter().getAttribute('aria-label')).toBe('Storage used')
      expect(meter().getAttribute('aria-valuemin')).toBe('0')
      expect(meter().getAttribute('aria-valuemax')).toBe('50')
      expect(meter().getAttribute('aria-valuenow')).toBe('30')
    })

    it('takes 0 to 100 when no range is given', async () => {
      await mount({ label: 'Cold share', value: 62 })

      expect(meter().getAttribute('aria-valuemin')).toBe('0')
      expect(meter().getAttribute('aria-valuemax')).toBe('100')
    })

    it('picks its tone from the thresholds, each one the first value of its band', async () => {
      const at = async (value: number) => {
        await mount({ ...THRESHOLDS, value })
        return tone()
      }
      expect(await at(39)).toBe('accent')
      expect(await at(40)).toBe('warning')
      expect(await at(44)).toBe('warning')
      expect(await at(45)).toBe('danger')
      expect(await at(50)).toBe('danger')
    })

    it('is accent with no thresholds, and skips a band it is not given', async () => {
      await mount({ label: 'Cold share', value: 99 })
      expect(tone()).toBe('accent')

      await mount({ label: 'Queue depth', value: 70, danger: 85 })
      expect(tone()).toBe('accent')
      await mount({ label: 'Queue depth', value: 92, danger: 85 })
      expect(tone()).toBe('danger')
    })

    it('takes danger where the two bands overlap', async () => {
      await mount({ label: 'Budget spent', value: 90, warning: 95, danger: 80 })
      expect(tone()).toBe('danger')
    })

    it('clamps a value outside the range, and keeps the band of the value it was given', async () => {
      await mount({ label: 'Allowance used', value: 130, danger: 110 })
      expect(meter().getAttribute('aria-valuenow')).toBe('100')
      expect(fill().style.transform).toBe('scaleX(1)')
      expect(tone()).toBe('danger')

      await mount({ label: 'Allowance used', value: -20 })
      expect(meter().getAttribute('aria-valuenow')).toBe('0')
      expect(fill().style.transform).toBe('scaleX(0)')
    })

    it('scales the fill to the value’s share of the range', async () => {
      await mount({ label: 'Temperature', value: 30, min: 20, max: 60 })
      expect(fill().style.transform).toBe('scaleX(0.25)')
    })

    it('says the value in the app’s words, once', async () => {
      await mount({ label: 'Storage used', value: 42, max: 50, valueText: '42 GB of 50 GB' })

      expect(meter().getAttribute('aria-valuetext')).toBe('42 GB of 50 GB')
      // Seen under the bar, and hidden there, because the meter's value already says it.
      const shown = [...root().querySelectorAll('[aria-hidden="true"]')].find(
        (element) => element.textContent === '42 GB of 50 GB',
      )
      expect(shown, 'the words under the bar').toBeDefined()
      expect(root().textContent).toBe('42 GB of 50 GB')
    })

    it('has no value text and no readout without valueText, below every threshold', async () => {
      await mount({ label: 'Cold share', value: 62 })

      expect(meter().hasAttribute('aria-valuetext')).toBe(false)
      expect(root().children).toHaveLength(1)
      expect(root().textContent).toBe('')
    })

    it('names its band with a glyph, never with colour alone', async () => {
      await mount({ ...THRESHOLDS, value: 30 })
      expect(glyph()).toBeNull()

      await mount({ ...THRESHOLDS, value: 42 })
      expect(glyph()?.getAttribute('aria-label')).toBe('High')

      await mount({ ...THRESHOLDS, value: 48 })
      expect(glyph()?.getAttribute('aria-label')).toBe('Critical')

      // The glyph is read after the meter, not inside it.
      expect(meter().contains(glyph())).toBe(false)
      expect(
        meter().compareDocumentPosition(glyph() as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('names the glyph from messages', async () => {
      const messages = { warning: 'Hoch', danger: 'Kritisch' }
      await mount({ ...THRESHOLDS, value: 42, messages })
      expect(glyph()?.getAttribute('aria-label')).toBe('Hoch')

      await mount({ ...THRESHOLDS, value: 48, messages })
      expect(glyph()?.getAttribute('aria-label')).toBe('Kritisch')
    })

    it('grows from the inline start: the left, and the right in a right-to-left page', async () => {
      await mount({ label: 'Storage used', value: 30, max: 50 })
      expect(getComputedStyle(fill()).transformOrigin.startsWith('0px')).toBe(true)

      document.documentElement.setAttribute('dir', 'rtl')
      await mount({ label: 'Storage used', value: 30, max: 50 })
      // The fill's own width, before its scale.
      const width = getComputedStyle(fill()).width
      expect(parseFloat(width)).toBeGreaterThan(0)
      expect(getComputedStyle(fill()).transformOrigin.startsWith(width)).toBe(true)
    })
  })
}
