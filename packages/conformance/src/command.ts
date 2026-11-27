import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { MountAdapter, MountProps } from './run'

/**
 * The law for what a Command's status region says (`design/components/command.md`,
 * A11y), which every web shell's Command test calls with its mount adapter.
 * A contract's `announces` statement reads one fixture entry's words
 * (`docs/conformance.md`). This law reads the words in each state the region
 * has, by default and in a host's words from `spoken`, with what `spoken` is
 * given.
 *
 * It mounts the fixture entry that opens the palette on four commands and sets
 * the props under test over it, because a palette is open only while its
 * launcher holds it open.
 */

const STATE = 'open'

export interface CommandLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

/** What `spoken` is given. */
interface CommandStatus {
  loading: boolean
  count: number
}

/** The status region of the palette mounted last, whose panel is the last on the page. */
function status(): HTMLElement {
  const element = [
    ...document.querySelectorAll<HTMLElement>('[data-member="command"] [role="status"]'),
  ].at(-1)
  if (element === undefined) throw new Error('the Command drew no status region')
  return element
}

/** Waits until the status region says `expected`. */
async function says(expected: string): Promise<void> {
  await vi.waitFor(() => expect(status().textContent?.trim()).toBe(expected), {
    timeout: 2000,
    interval: 25,
  })
}

/** A host's words in French, and what it was given, last call last. */
function french() {
  const given: CommandStatus[] = []
  const spoken = ({ loading, count }: CommandStatus) => {
    given.push({ loading, count })
    if (loading) return 'Chargement des commandes…'
    return count === 1 ? '1 commande' : `${count} commandes`
  }
  return { given, spoken }
}

export function commandLaw({ shell, adapter }: CommandLaw): void {
  describe(`${shell} Command — what its status region says`, () => {
    beforeAll(installTestTheme)

    const unmounts: (() => void)[] = []
    afterEach(() => {
      for (const unmount of unmounts.splice(0)) unmount()
    })

    async function mount(overrides: MountProps['overrides'] = {}): Promise<void> {
      const { unmount } = await adapter.mount('Command', { state: STATE, overrides })
      unmounts.push(unmount)
    }

    it('says how many commands are shown, in English by default', async () => {
      await mount()
      await says('4 commands')
    })

    it('says the commands are loading, in English by default', async () => {
      await mount({ loading: true })
      await says('Loading commands…')
    })

    it('says emptyMessage when nothing is shown', async () => {
      await mount({ items: [] })
      await says('No results')
    })

    it('says the host’s count from spoken, given how many commands are shown', async () => {
      const host = french()
      await mount({ spoken: host.spoken })
      await says('4 commandes')
      expect(host.given.at(-1)).toEqual({ loading: false, count: 4 })
      expect(status().textContent).not.toMatch(/commands/)
    })

    it('says the host’s loading sentence from spoken, given that the commands load', async () => {
      const host = french()
      await mount({ spoken: host.spoken, loading: true })
      await says('Chargement des commandes…')
      expect(host.given.at(-1)).toEqual({ loading: true, count: 4 })
    })

    it('gives spoken the count the query leaves', async () => {
      const host = french()
      await mount({ spoken: host.spoken })
      await says('4 commandes')
      const input = [
        ...document.querySelectorAll<HTMLInputElement>('[data-member="command"] input'),
      ].at(-1)
      if (input === undefined) throw new Error('the Command drew no field')
      await userEvent.type(input, 'archive')
      await says('1 commande')
      expect(host.given.at(-1)).toEqual({ loading: false, count: 1 })
    })

    it('says emptyMessage, not the host’s count, when nothing is shown', async () => {
      const host = french()
      await mount({ spoken: host.spoken, items: [], emptyMessage: 'Aucune commande' })
      await says('Aucune commande')
      expect(host.given.some((given) => !given.loading && given.count === 0)).toBe(false)
    })
  })
}
