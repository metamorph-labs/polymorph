import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what an open list says of how many options it shows, which every
 * web shell calls with a mount of its own: Combobox's and MultiSelect's
 * `messages.options` (`design/components/combobox.md`, A11y), and PhoneInput's
 * `messages.countriesShown` (`design/components/phone-input.md`), which its
 * list of countries says. A contract statement reads the words of an
 * announcement only for a fixture entry, and the count is the options a query
 * leaves, so this law reads the polite status region by default, for one
 * option and for several: the sentence agrees with the count.
 */

/** The members the law mounts. */
export type OptionCountMember = 'Combobox' | 'MultiSelect' | 'PhoneInput'

export interface OptionCountLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one member with these props, after any the test mounted before it.
   * A prop the law leaves out is not passed.
   */
  mount(member: OptionCountMember, props: Record<string, unknown>): Promise<unknown>
}

const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
  { value: 'alan', label: 'Alan Turing' },
]

/** The polite status region of the member last mounted under this `data-member`. */
function status(member: string): HTMLElement {
  const region = [...document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)]
    .map((element) => element.querySelector<HTMLElement>('[role="status"]'))
    .filter((found) => found !== null)
    .at(-1)
  if (region === undefined) throw new Error(`the ${member} has no status region`)
  return region
}

/** Waits until the member's status region says `expected`. */
async function says(member: string, expected: string): Promise<void> {
  await vi.waitFor(
    () => expect((status(member).textContent ?? '').replace(/\s+/g, ' ').trim()).toBe(expected),
    { timeout: 2000, interval: 25 },
  )
}

/** Opens the list of countries of the PhoneInput last mounted, from its chevron. */
async function showCountries(): Promise<void> {
  const root = [...document.querySelectorAll<HTMLElement>('[data-member="phone-input"]')].at(-1)
  const chevron = root?.querySelector<HTMLElement>('button[aria-label="Show countries"]')
  if (chevron === null || chevron === undefined) {
    throw new Error('the PhoneInput drew no button that shows countries')
  }
  await userEvent.click(chevron)
}

export function optionCountLaw({ shell, mount }: OptionCountLaw): void {
  describe(`${shell} — what an open list says of how many options it shows`, () => {
    beforeAll(installTestTheme)

    for (const [member, root] of [
      ['Combobox', 'combobox'],
      ['MultiSelect', 'multi-select'],
    ] as const) {
      it(`says how many options ${member}’s list shows, in English by default`, async () => {
        await mount(member, { options: PEOPLE, defaultOpen: true, 'aria-label': 'Assignee' })
        await says(root, '3 options')
      })

      it(`says one option of ${member}’s in the singular`, async () => {
        await mount(member, {
          options: PEOPLE.slice(0, 1),
          defaultOpen: true,
          'aria-label': 'Assignee',
        })
        await says(root, '1 option')
      })
    }

    it('says how many countries PhoneInput’s list shows, in English by default', async () => {
      await mount('PhoneInput', {
        countries: ['GB', 'FR', 'DE'],
        locale: 'en-US',
        'aria-label': 'Phone',
      })
      await showCountries()
      await says('phone-input', '3 countries')
    })

    it('says one country of PhoneInput’s in the singular', async () => {
      await mount('PhoneInput', { countries: ['GB'], locale: 'en-US', 'aria-label': 'Phone' })
      await showCountries()
      await says('phone-input', '1 country')
    })
  })
}
