import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The law for the name of a MultiSelect's list (`design/components/multi-select.md`,
 * A11y), which every web shell's test calls with a mount of its own. The list
 * takes the field's own name: the field's `aria-labelledby`, else its
 * `aria-label`, else the labels that name the field. A contract statement names
 * a part from one prop (`docs/conformance.md`), and the last of these is an
 * element outside the member, so the law puts that element in the page: a
 * `<label for>` alone, and the shell's FormField, whose label names the field
 * that way. Each case also reads the field's own name, which the list's equals.
 */

/** The props the law mounts a MultiSelect with. A prop the law leaves out is not passed. */
export interface MultiSelectListLawProps {
  options: { value: string; label: string }[]
  defaultOpen?: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

/** The FormField the law puts a MultiSelect in. */
export interface MultiSelectListLawField {
  label: string
  required: boolean
}

export interface MultiSelectListLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one MultiSelect with these props, after the label elements the law puts in the page. */
  mount(props: MultiSelectListLawProps): Promise<unknown>
  /** Mounts one MultiSelect with these props as the control of the shell's FormField. */
  mountInField(field: MultiSelectListLawField, props: MultiSelectListLawProps): Promise<unknown>
}

const OPTIONS = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
]

/** The id the law gives the field, and the id of the element its `aria-labelledby` names. */
const FIELD_ID = 'multi-select-list-law-field'
const LABEL_ID = 'multi-select-list-law-label'

const WAIT = { timeout: 2000, interval: 25 }

/** The open lists in the page. */
const lists = () => [...document.querySelectorAll<HTMLElement>('[role="listbox"]')]

/** The list of the MultiSelect mounted last, once it is open. */
async function list(): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const element = lists().at(-1)
    if (element === undefined) throw new Error('the MultiSelect drew no open list')
    return element
  }, WAIT)
}

/** The field of the MultiSelect mounted last: its one text entry. */
function field(): HTMLInputElement {
  const element = [...document.querySelectorAll<HTMLElement>('[data-member="multi-select"]')]
    .map((root) => root.querySelector<HTMLInputElement>('input:not([type="hidden"])'))
    .filter((found) => found !== null)
    .at(-1)
  if (element === undefined) throw new Error('the MultiSelect drew no field')
  return element
}

/** Waits until the open list's name is `expected`, and expects the field's to be the same. */
async function named(expected: string): Promise<void> {
  const element = await list()
  await vi.waitFor(() => expect(harness.nameOf(element)).toBe(expected), WAIT)
  expect(harness.nameOf(field())).toBe(expected)
}

export function multiSelectListLaw({ shell, mount, mountInField }: MultiSelectListLaw): void {
  describe(`${shell} MultiSelect — the name of its list`, () => {
    beforeAll(installTestTheme)

    /** The elements the law put in the page, removed after each test. */
    const placed: HTMLElement[] = []
    afterEach(() => {
      for (const element of placed.splice(0)) element.remove()
    })

    /** Puts a `<label for>` that names the field in the page, before the field. */
    function labelFor(words: string): HTMLLabelElement {
      const label = document.createElement('label')
      label.textContent = words
      label.htmlFor = FIELD_ID
      document.body.append(label)
      placed.push(label)
      return label
    }

    /** Puts the element the field's `aria-labelledby` names in the page. */
    function labelledBy(words: string): void {
      const span = document.createElement('span')
      span.id = LABEL_ID
      span.textContent = words
      document.body.append(span)
      placed.push(span)
    }

    it('is the label’s words where only a <label for> names the field', async () => {
      const label = labelFor('Assignee')
      await mount({ options: OPTIONS, defaultOpen: true, id: FIELD_ID })
      expect(field().labels?.[0]).toBe(label)
      await named('Assignee')
    })

    it('is the label’s words inside a FormField', async () => {
      await mountInField(
        { label: 'Assignee', required: false },
        { options: OPTIONS, defaultOpen: true },
      )
      await named('Assignee')
    })

    it('leaves out the required mark a FormField’s label hides, as the field’s name does', async () => {
      await mountInField(
        { label: 'Assignee', required: true },
        { options: OPTIONS, defaultOpen: true },
      )
      await named('Assignee')
    })

    it('says the label’s new words at the next opening once they change', async () => {
      const label = labelFor('Assignee')
      await mount({ options: OPTIONS, id: FIELD_ID })
      field().focus()
      await userEvent.keyboard('{ArrowDown}')
      await named('Assignee')
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(lists()).toHaveLength(0), WAIT)
      label.textContent = 'Watchers'
      await userEvent.keyboard('{ArrowDown}')
      await named('Watchers')
    })

    it('is the field’s aria-label where it has one, over a <label for>', async () => {
      labelFor('Assignee')
      await mount({ options: OPTIONS, defaultOpen: true, id: FIELD_ID, 'aria-label': 'Watchers' })
      await named('Watchers')
    })

    it('is the field’s aria-labelledby where it has one, over a <label for>', async () => {
      labelFor('Assignee')
      labelledBy('Owners')
      await mount({
        options: OPTIONS,
        defaultOpen: true,
        id: FIELD_ID,
        'aria-labelledby': LABEL_ID,
      })
      await named('Owners')
    })

    it('is the field’s aria-labelledby where it has both, as the field’s name is', async () => {
      labelledBy('Owners')
      await mount({
        options: OPTIONS,
        defaultOpen: true,
        'aria-label': 'Watchers',
        'aria-labelledby': LABEL_ID,
      })
      await named('Owners')
    })
  })
}
