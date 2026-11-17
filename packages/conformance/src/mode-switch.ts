import { getAllByRole, getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { getModePreference, setMode, STORAGE_KEYS, teardownTheme } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a ModeSwitch shows and what a choice does
 * (`design/components/mode-switch.md`, Behaviour), which every web shell's
 * ModeSwitch test calls with a mount of its own. A contract statement starts
 * from one fixture entry and reads one part (`docs/conformance.md`). This law
 * reads what the grammar cannot state: the document's mode after a press, a
 * change made by another caller, two switches on one page, and the operating
 * system's mode changing while `system` is applied.
 *
 * Each test starts from a document with no mode applied and nothing stored,
 * and leaves it that way.
 */

export type ModeSwitchLawValue = 'light' | 'dark' | 'system'

/** What the law sets on a ModeSwitch. */
export interface ModeSwitchLawProps {
  /** The choice, while the application holds it. `undefined` hands it to the document. */
  value: ModeSwitchLawValue | undefined
  disabled: boolean
}

export interface ModeSwitchLawMount {
  /** The group's accessible name, which tells two switches apart. */
  readonly label: string
  /** The props the switch mounts with. */
  readonly props: ModeSwitchLawProps
  /** Its `messages`, or `undefined` for the defaults. */
  readonly messages: { light: string; dark: string; system: string } | undefined
  /** Its `onChange`. */
  readonly onChange: (value: ModeSwitchLawValue) => void
}

export interface MountedModeSwitch {
  /** Sets props on the switch, as its parent's state would. */
  set(next: Partial<ModeSwitchLawProps>): void | Promise<void>
}

export interface ModeSwitchLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one ModeSwitch with the label, props and handler given, beside any already mounted. */
  mount(options: ModeSwitchLawMount): Promise<MountedModeSwitch>
}

const DARK_QUERY = '(prefers-color-scheme: dark)'
const root = document.documentElement

/** The ModeSwitch the law mounted with this label. */
const group = (label = 'Appearance') => getByRole(document.body, 'radiogroup', { name: label })

/** The segment named `name` in the switch labelled `label`. */
const segment = (name: string, label?: string) =>
  getByRole(group(label), 'radio', { name }) as HTMLElement

/** The name of the checked segment in the switch labelled `label`. */
function checked(label?: string): string | null {
  const found = getAllByRole(group(label), 'radio').find(
    (radio) => radio.getAttribute('aria-checked') === 'true',
  )
  return found?.textContent?.trim() ?? null
}

/** A `prefers-color-scheme` query the law turns. Every other query is the browser's. */
function stubScheme(dark: boolean): { turn(next: boolean): void } {
  const listeners = new Set<() => void>()
  let matches = dark
  const browser = window.matchMedia.bind(window)
  vi.stubGlobal('matchMedia', (query: string) =>
    query === DARK_QUERY
      ? {
          media: query,
          get matches() {
            return matches
          },
          addEventListener: (_: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        }
      : browser(query),
  )
  return {
    turn(next) {
      matches = next
      for (const listener of [...listeners]) listener()
    },
  }
}

export function modeSwitchLaw({ shell, mount }: ModeSwitchLaw): void {
  describe(`${shell} ModeSwitch — what it shows and what a choice does`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      teardownTheme()
      vi.unstubAllGlobals()
      root.removeAttribute('data-mode')
      localStorage.removeItem(STORAGE_KEYS.mode)
    })

    /** Mounts a switch labelled `label`, with a spy in `onChange`. */
    async function mounted(
      props: Partial<ModeSwitchLawProps> = {},
      label = 'Appearance',
      messages?: ModeSwitchLawMount['messages'],
    ) {
      const onChange = vi.fn<(value: ModeSwitchLawValue) => void>()
      const handle = await mount({
        label,
        messages,
        props: { value: undefined, disabled: false, ...props },
        onChange,
      })
      return { onChange, ...handle }
    }

    it('names its three segments Light, Dark and System, in that order', async () => {
      await mounted()
      expect(getAllByRole(group(), 'radio').map((radio) => radio.textContent?.trim())).toEqual([
        'Light',
        'Dark',
        'System',
      ])
    })

    it('names its segments from the messages it is passed', async () => {
      await mounted({}, 'Apparence', { light: 'Clair', dark: 'Sombre', system: 'Système' })
      expect(
        getAllByRole(group('Apparence'), 'radio').map((radio) => radio.textContent?.trim()),
      ).toEqual(['Clair', 'Sombre', 'Système'])
    })

    it('shows the document’s preference when it holds no value', async () => {
      setMode('dark')
      await mounted()
      expect(checked()).toBe('Dark')
    })

    it('shows System where nothing is stored', async () => {
      await mounted()
      expect(checked()).toBe('System')
    })

    it('sets the mode on a press, stores it, and reports it', async () => {
      setMode('light')
      const { onChange } = await mounted()

      await userEvent.click(segment('Dark'))
      await vi.waitFor(() => expect(checked()).toBe('Dark'))
      expect(root.getAttribute('data-mode')).toBe('dark')
      expect(getModePreference()).toBe('dark')
      expect(localStorage.getItem(STORAGE_KEYS.mode)).toBe('dark')
      expect(onChange).toHaveBeenCalledWith('dark')
    })

    it('follows a mode another caller sets, as a Menu item or a command does', async () => {
      setMode('light')
      await mounted()

      setMode('dark')
      await vi.waitFor(() => expect(checked()).toBe('Dark'))
      setMode('system')
      await vi.waitFor(() => expect(checked()).toBe('System'))
    })

    it('agrees with another ModeSwitch on the page', async () => {
      setMode('light')
      await mounted({}, 'Appearance')
      await mounted({}, 'Theme')

      await userEvent.click(segment('Dark', 'Theme'))
      await vi.waitFor(() => expect(checked('Appearance')).toBe('Dark'))
      expect(checked('Theme')).toBe('Dark')
    })

    it('keeps System chosen while the operating system’s mode changes under it', async () => {
      const scheme = stubScheme(false)
      setMode('system')
      await mounted()
      expect(root.getAttribute('data-mode')).toBe('light')

      scheme.turn(true)
      expect(root.getAttribute('data-mode')).toBe('dark')
      // A frame for the shell to draw what it heard.
      await new Promise((resolve) => requestAnimationFrame(resolve))
      expect(checked()).toBe('System')
      expect(getModePreference()).toBe('system')
    })

    it('shows its value, and not the document’s, while the application holds it', async () => {
      setMode('dark')
      await mounted({ value: 'light' })
      expect(checked()).toBe('Light')
    })

    it('reports a press and sets no mode while the application holds the value', async () => {
      setMode('light')
      const { onChange } = await mounted({ value: 'light' })

      await userEvent.click(segment('Dark'))
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('dark'))
      expect(root.getAttribute('data-mode')).toBe('light')
      expect(getModePreference()).toBe('light')
      // The value is the application's, and it has not changed.
      expect(checked()).toBe('Light')
    })

    it('shows the value the application sets, and the one it puts back', async () => {
      const held = await mounted({ value: 'light' })

      await held.set({ value: 'dark' })
      await vi.waitFor(() => expect(checked()).toBe('Dark'))
      // The save failed, and the application puts the old choice back.
      await held.set({ value: 'light' })
      await vi.waitFor(() => expect(checked()).toBe('Light'))
    })

    it('takes no press while it is disabled', async () => {
      setMode('light')
      const { onChange } = await mounted({ disabled: true })
      for (const radio of getAllByRole(group(), 'radio')) {
        expect((radio as HTMLButtonElement).disabled).toBe(true)
      }
      segment('Dark').click()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      expect(onChange).not.toHaveBeenCalled()
      expect(getModePreference()).toBe('light')
    })
  })
}
