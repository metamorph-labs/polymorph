import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The law for the words a Zag machine wrote where a person hears them, which
 * every web shell calls with a mount of its own (`docs/shells.md`). The
 * members generated from a description are built on Zag's machines, whose
 * names and value texts are fixed English; the React members take theirs from
 * React Aria, which says them in the page's locale. Each word is a member's
 * own now, so a host translates it:
 *
 * - NumberInput's steppers are named by `messages.increment` and
 *   `messages.decrement` (`design/components/number-input.md`, Icons), which
 *   the description passes to its machine as its translations, and its field
 *   carries no role description (A11y).
 * - ColorInput's plane and rails are named and valued by `messages`
 *   (`design/components/color-input.md`, A11y).
 * - Combobox and MultiSelect do without the announcement their machine makes
 *   on Apple platforms, which says ", selected" in English after a chosen
 *   option (`design/components/combobox.md`, A11y).
 *
 * The React shell holds the host's words alone: its defaults are React Aria's
 * (`defaultsFromReactAria`), and React Aria's combobox keeps its own
 * announcement on Apple platforms, in the page's locale. The generated shells
 * hold the English defaults too, which are their machine's words as it wrote
 * them, and the announcement's absence.
 */

/** The members the law mounts. */
export type MachineWordsMember = 'NumberInput' | 'ColorInput' | 'Combobox' | 'MultiSelect'

export interface MachineWordsLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one member with these props, after any the test mounted before it.
   * A prop the law leaves out is not passed.
   */
  mount(member: MachineWordsMember, props: Record<string, unknown>): Promise<unknown>
  /**
   * Whether the members' defaults are React Aria's words in the page's
   * locale, as the React members' are: the law then holds the host's words.
   */
  readonly defaultsFromReactAria?: boolean
}

/** The member last mounted under this `data-member`. */
function last(member: string): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)].at(-1)
  if (element === undefined) throw new Error(`no ${member} is on the page`)
  return element
}

/** NumberInput's steppers, down then up, as they are drawn. */
function steppers(): HTMLButtonElement[] {
  const buttons = [...last('number-input').querySelectorAll<HTMLButtonElement>('button')]
  if (buttons.length !== 2) throw new Error(`the NumberInput drew ${buttons.length} steppers`)
  return buttons
}

/** ColorInput's open picker's range inputs: the plane's two channels, then each rail's. */
async function sliders(count: number): Promise<HTMLInputElement[]> {
  return vi.waitFor(
    () => {
      const found = [...document.querySelectorAll<HTMLInputElement>('input[type="range"]')]
      if (found.length !== count) throw new Error(`the picker drew ${found.length} sliders`)
      return found
    },
    { timeout: 2000, interval: 25 },
  )
}

/** A colour with an alpha channel, so the picker draws both rails. */
const COLOUR = '#8864f0cc'

const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
]

/**
 * Makes the page read as an Apple platform, as Zag's `isApple` reads it, for
 * the duration of a test, and returns the restore. A browser on another
 * platform would otherwise never take the branch the law holds.
 */
function onApple(): () => void {
  const restores: (() => void)[] = []
  const agent = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData
  if (agent !== undefined && !/^Mac/i.test(agent.platform)) {
    Object.defineProperty(agent, 'platform', { value: 'macOS', configurable: true })
    restores.push(() => Reflect.deleteProperty(agent, 'platform'))
  }
  if (agent === undefined && !/^Mac/i.test(navigator.platform)) {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    restores.push(() => Reflect.deleteProperty(navigator, 'platform'))
  }
  return () => {
    for (const restore of restores) restore()
  }
}

/** The member's field: the element of its own that holds its combobox input. */
function field(member: string): HTMLInputElement {
  const input = [...document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)]
    .map((element) => element.querySelector<HTMLInputElement>('input[role="combobox"]'))
    .filter((found) => found !== null)
    .at(-1)
  if (input === undefined) throw new Error(`no ${member} field is on the page`)
  return input
}

/**
 * What every live region outside the member's elements says: Zag's announcer
 * is one, added to the body. The member's own regions are in its field.
 */
function spokenOutside(member: string): string[] {
  const own = [...document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)]
  return [...document.querySelectorAll<HTMLElement>('[aria-live], [role="alert"], [role="status"]')]
    .filter((region) => !own.some((element) => element.contains(region)))
    .map((region) => (region.textContent ?? '').trim())
    .filter((text) => text !== '')
}

/** A number as a value text writes it, or as a range input's value rounds it. */
const NUMBER = String.raw`\d+(?:\.\d+)?`

export function machineWordsLaw({
  shell,
  mount,
  defaultsFromReactAria = false,
}: MachineWordsLaw): void {
  describe(`${shell} — the words a machine wrote, in the member’s own`, () => {
    beforeAll(installTestTheme)

    let restore: (() => void) | undefined
    afterEach(() => {
      restore?.()
      restore = undefined
    })

    it('names NumberInput’s steppers in the host’s words from messages', async () => {
      await mount('NumberInput', {
        'aria-label': 'Sièges',
        defaultValue: 5,
        messages: { increment: 'Augmenter', decrement: 'Diminuer' },
      })
      await vi.waitFor(() =>
        expect(steppers().map((button) => harness.nameOf(button))).toEqual([
          'Diminuer',
          'Augmenter',
        ]),
      )
    })

    it('names and values ColorInput’s sliders in the host’s words from messages', async () => {
      const given: [number, number][] = []
      const rails = new Map<string, number>()
      await mount('ColorInput', {
        pickerLabel: 'Choisir la couleur',
        'aria-label': 'Couleur',
        alpha: true,
        defaultValue: COLOUR,
        defaultOpen: true,
        messages: {
          plane: 'Saturation et luminosité',
          planeValue: (saturation: number, brightness: number) => {
            given.push([saturation, brightness])
            return `saturation ${saturation}, luminosité ${brightness}`
          },
          hue: 'Teinte',
          alpha: 'Opacité',
          railValue: (name: string, value: number) => {
            rails.set(name, value)
            return `${value} : ${name}`
          },
        },
      })
      const [saturation, brightness, hue, alpha] = await sliders(4)
      if (!saturation || !brightness || !hue || !alpha)
        throw new Error('the picker drew no sliders')
      // Each value the words are given is the slider's, which a range input rounds to its step.
      const near = (value: number | undefined, input: HTMLInputElement) =>
        expect(Math.abs((value ?? Number.NaN) - Number(input.value))).toBeLessThanOrEqual(1)
      const [s, b] = given.at(-1) ?? []
      near(s, saturation)
      near(b, brightness)
      expect(harness.nameOf(saturation)).toBe('Saturation et luminosité')
      expect(saturation.getAttribute('aria-valuetext')).toBe(`saturation ${s}, luminosité ${b}`)
      near(rails.get('Teinte'), hue)
      expect(harness.nameOf(hue)).toBe('Teinte')
      expect(hue.getAttribute('aria-valuetext')).toBe(`${rails.get('Teinte')} : Teinte`)
      near(rails.get('Opacité'), alpha)
      expect(harness.nameOf(alpha)).toBe('Opacité')
      expect(alpha.getAttribute('aria-valuetext')).toBe(`${rails.get('Opacité')} : Opacité`)
    })

    if (defaultsFromReactAria) return

    it('names NumberInput’s steppers in its machine’s English words by default', async () => {
      await mount('NumberInput', { 'aria-label': 'Seats', defaultValue: 5 })
      await vi.waitFor(() =>
        expect(steppers().map((button) => harness.nameOf(button))).toEqual([
          'decrease value',
          'increment value',
        ]),
      )
    })

    it('gives NumberInput’s field no role description, so it is heard as the text field it is', async () => {
      await mount('NumberInput', { 'aria-label': 'Seats', defaultValue: 5 })
      const field = last('number-input').querySelector<HTMLInputElement>(
        'input:not([type="hidden"])',
      )
      if (field === null) throw new Error('the NumberInput drew no field')
      expect(field.hasAttribute('aria-roledescription')).toBe(false)
      expect(harness.roleOf(field)).toBe('textbox')
    })

    it('names and values ColorInput’s sliders in its machine’s English words by default', async () => {
      await mount('ColorInput', {
        pickerLabel: 'Choose highlight colour',
        'aria-label': 'Highlight colour',
        alpha: true,
        defaultValue: COLOUR,
        defaultOpen: true,
      })
      const [saturation, brightness, hue, alpha] = await sliders(4)
      if (!saturation || !brightness || !hue || !alpha)
        throw new Error('the picker drew no sliders')
      expect(harness.nameOf(saturation)).toBe('saturation and brightness')
      expect(saturation.getAttribute('aria-valuetext')).toMatch(
        new RegExp(`^saturation ${NUMBER}, brightness ${NUMBER}$`),
      )
      expect(harness.nameOf(hue)).toBe('hue')
      expect(hue.getAttribute('aria-valuetext')).toMatch(new RegExp(`^hue ${NUMBER}$`))
      expect(harness.nameOf(alpha)).toBe('alpha')
      expect(alpha.getAttribute('aria-valuetext')).toMatch(new RegExp(`^alpha ${NUMBER}$`))
    })

    for (const member of ['Combobox', 'MultiSelect'] as const) {
      it(`says nothing of ${member}’s highlighted option outside the member on an Apple platform`, async () => {
        restore = onApple()
        const value =
          member === 'Combobox' ? { defaultValue: 'grace' } : { defaultValue: ['grace'] }
        await mount(member, {
          options: PEOPLE,
          'aria-label': 'Assignee',
          defaultOpen: true,
          ...value,
        })
        const name = member === 'Combobox' ? 'combobox' : 'multi-select'
        field(name).focus()
        // The highlight moves onto the chosen option and off it, as the arrows move it.
        for (const key of ['{ArrowDown}', '{ArrowUp}', '{ArrowUp}', '{ArrowDown}']) {
          await userEvent.keyboard(key)
        }
        // Zag's announcer writes its words a moment after it adds its region.
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(spokenOutside(name)).toEqual([])
      })
    }
  })
}
