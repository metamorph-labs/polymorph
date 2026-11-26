import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for the value a Select shows while its application holds it
 * (`design/components/select.md`, The value), which every web shell's Select
 * test calls with a mount of its own.
 *
 * `null` is the value that means nothing is chosen. Without `emptyOption` the
 * trigger then shows its placeholder; with it, the empty choice. An
 * application clears a choice by setting `null`, as a form does when it resets
 * after a save, and the trigger, the list and the hidden field follow it, in
 * the anchored list and in the phone's sheet. A contract statement reads one
 * part of a fresh mount, so it cannot state what a Select shows after the
 * application changes the value it holds; this law does.
 *
 * The law waits for each reading, because a shell commits a change a moment
 * after the event.
 */

export interface SelectValueLawMount {
  /** The value the application holds when the Select mounts. */
  readonly value: string | null
  readonly placeholder: string | undefined
  readonly emptyOption: string | undefined
  /** The hidden field's name. */
  readonly name: string
  readonly onChange: (value: string | null) => void
}

export interface MountedSelect {
  /** Sets the value the application holds, as its state would. */
  set(value: string | null): void | Promise<void>
}

export interface SelectValueLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts one closed Select with `aria-label="Priority"`, the options Urgent,
   * High and Normal (`OPTIONS`), presentation `auto`, and the value, the
   * placeholder or the empty choice, the name and the handler given. A prop
   * the law leaves `undefined` is not passed.
   */
  mount(options: SelectValueLawMount): Promise<MountedSelect>
}

/** The options the law's Select lists. */
export const SELECT_VALUE_LAW_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
]

const PLACEHOLDER = 'Choose a priority'
const EMPTY = 'Any priority'
const NAME = 'priority'

/** Below the sheet presentation's threshold, `30rem`. */
const NARROW = 420
const WIDE = 1280

const trigger = () =>
  document.querySelector<HTMLElement>('button[data-member="select"]') as HTMLElement

/** The words the trigger shows. */
const shown = () => trigger().textContent?.trim() ?? ''

const field = () => document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${NAME}"]`)

const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]

/** The labels of the options the open list marks chosen. */
const checked = () =>
  options()
    .filter((option) => option.getAttribute('data-state') === 'checked')
    .map((option) => option.textContent?.trim() ?? '')

const sheet = () => document.querySelector('[data-presentation="sheet"]')

/** Holds that the trigger shows the placeholder, in its placeholder state, and the field is empty. */
async function showsPlaceholder() {
  await vi.waitFor(() => expect(shown()).toBe(PLACEHOLDER))
  expect(trigger().hasAttribute('data-placeholder')).toBe(true)
  expect(field()?.value).toBe('')
}

/** Holds that the trigger shows `label` as a value, and the field submits `value`. */
async function showsValue(label: string, value: string) {
  await vi.waitFor(() => expect(shown()).toBe(label))
  expect(trigger().hasAttribute('data-placeholder')).toBe(false)
  expect(field()?.value).toBe(value)
}

/** Opens the list with a press on the trigger, as a reader does, and waits for its options. */
async function open() {
  await vi.waitFor(() => expect(trigger()).not.toBeNull())
  await userEvent.click(trigger())
  await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
}

/** Presses the option with this label, and waits for the list to close. */
async function choose(label: string) {
  const option = options().find((each) => each.textContent?.trim() === label)
  if (option === undefined) throw new Error(`no option ${label}`)
  await userEvent.click(option)
  await vi.waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
  await vi.waitFor(() => expect(options()).toHaveLength(0))
}

export function selectValueLaw({ shell, mount }: SelectValueLaw): void {
  describe(`${shell} Select — the value its application holds`, () => {
    beforeAll(installTestTheme)

    afterEach(async () => {
      await page.viewport(WIDE, 800)
    })

    async function select(
      value: string | null,
      choice: { placeholder?: string; emptyOption?: string } = { placeholder: PLACEHOLDER },
    ) {
      const onChange = vi.fn<(value: string | null) => void>()
      const { set } = await mount({
        value,
        placeholder: choice.placeholder,
        emptyOption: choice.emptyOption,
        name: NAME,
        onChange,
      })
      await vi.waitFor(() => expect(trigger()).not.toBeNull())
      return { set: async (next: string | null) => set(next), onChange }
    }

    it('shows its placeholder for null, with no empty choice to show', async () => {
      await select(null)
      await showsPlaceholder()
      await open()
      expect(checked()).toEqual([])
    })

    it('reports a choice without making it while the application holds null', async () => {
      const { onChange } = await select(null)
      await open()
      await choose('High')
      expect(onChange).toHaveBeenLastCalledWith('high')
      await showsPlaceholder()
    })

    it('shows the placeholder again when the application clears a chosen value with null', async () => {
      const { set, onChange } = await select(null)
      await open()
      await choose('High')
      expect(onChange).toHaveBeenLastCalledWith('high')
      // A form takes the choice, saves, and resets.
      await set('high')
      await showsValue('High', 'high')
      await set(null)
      await showsPlaceholder()
      await open()
      expect(checked()).toEqual([])
    })

    it('shows the placeholder again in the phone sheet when the application clears its value', async () => {
      await page.viewport(NARROW, 800)
      const { set, onChange } = await select(null)
      await showsPlaceholder()
      await open()
      await vi.waitFor(() => expect(sheet()).not.toBeNull())
      await choose('Normal')
      expect(onChange).toHaveBeenLastCalledWith('normal')
      await set('normal')
      await showsValue('Normal', 'normal')
      await set(null)
      await showsPlaceholder()
      await open()
      await vi.waitFor(() => expect(sheet()).not.toBeNull())
      expect(checked()).toEqual([])
    })

    it('shows the empty choice for null when it offers one, before and after a value', async () => {
      const { set } = await select(null, { emptyOption: EMPTY })
      await vi.waitFor(() => expect(shown()).toBe(EMPTY))
      expect(trigger().hasAttribute('data-placeholder')).toBe(false)
      expect(field()?.value).toBe('')
      await set('urgent')
      await showsValue('Urgent', 'urgent')
      await set(null)
      await vi.waitFor(() => expect(shown()).toBe(EMPTY))
      expect(trigger().hasAttribute('data-placeholder')).toBe(false)
      expect(field()?.value).toBe('')
      await open()
      expect(checked()).toEqual([EMPTY])
    })
  })
}
