import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'
import type { MountAdapter, MountProps } from './run'

/**
 * The law for the names the generated members give where the React member
 * takes a name from React Aria, which says it in the page's locale. Every
 * shell generated from a description calls it with its mount adapter
 * (`docs/shells.md`), and the React shell does not: its names are React
 * Aria's.
 *
 * A description names each of these from the member's own words, so a host
 * that translates those words translates the name:
 *
 * - Command's list is named by `label`, as its panel is
 *   (`design/components/command.md`, A11y). React Aria names it `Suggestions`.
 * - ColorInput's sliders carry no role description, so each is heard as the
 *   slider it is, in the reader's language (`design/components/color-input.md`,
 *   A11y). React Aria calls the plane a `2D slider`.
 * - PhoneInput's list of countries is named by `messages.country`, as its
 *   country's field is (`design/components/phone-input.md`). React Aria names
 *   it `Suggestions`.
 */

export interface DescribedNamesLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

/** The open list last drawn on the page. */
async function list(): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const element = [...document.querySelectorAll<HTMLElement>('[role="listbox"]')].at(-1)
      if (element === undefined) throw new Error('no list is open')
      return element
    },
    { timeout: 2000, interval: 25 },
  )
}

export function describedNamesLaw({ shell, adapter }: DescribedNamesLaw): void {
  describe(`${shell} — the names a description gives in the member’s own words`, () => {
    beforeAll(installTestTheme)

    const unmounts: (() => void)[] = []
    afterEach(() => {
      for (const unmount of unmounts.splice(0)) unmount()
    })

    async function mount(member: string, props: MountProps): Promise<HTMLElement> {
      const { root, unmount } = await adapter.mount(member, props)
      unmounts.push(unmount)
      return root
    }

    it('names Command’s list by its label, by default and in the host’s words', async () => {
      await mount('Command', { state: 'open' })
      expect(harness.nameOf(await list())).toBe('Command palette')
      for (const unmount of unmounts.splice(0)) unmount()

      await mount('Command', { state: 'open', overrides: { label: 'Palette de commandes' } })
      await vi.waitFor(async () =>
        expect(harness.nameOf(await list())).toBe('Palette de commandes'),
      )
    })

    it('gives ColorInput’s sliders no role description', async () => {
      await mount('ColorInput', { state: 'open — the picker popover' })
      const sliders = await vi.waitFor(() => {
        const found = [...document.querySelectorAll<HTMLInputElement>('input[type="range"]')]
        // The plane's two channels and the hue rail.
        expect(found).toHaveLength(3)
        return found
      })
      expect(sliders.filter((slider) => slider.hasAttribute('aria-roledescription'))).toEqual([])
      const heard = sliders.filter((slider) => slider.getAttribute('aria-hidden') !== 'true')
      expect(heard.map((slider) => harness.roleOf(slider))).toEqual(['slider', 'slider'])
    })

    it('names PhoneInput’s list of countries by the word that names its country', async () => {
      const root = await mount('PhoneInput', {
        state: 'empty — the country before the reader chooses one',
      })
      const chevron = root.querySelector<HTMLElement>('button[aria-label="Show countries"]')
      if (chevron === null) throw new Error('the PhoneInput drew no button that shows countries')
      await userEvent.click(chevron)
      expect(harness.nameOf(await list())).toBe('Country calling code')
    })
  })
}
