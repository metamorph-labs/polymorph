import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The law for the name of a Combobox's list (`design/components/combobox.md`,
 * A11y), which every web shell's Combobox test calls with a mount of its own.
 * A contract statement names a part from one prop (`docs/conformance.md`), and
 * this name is made from two: `messages.list`, and the field's label where
 * `aria-labelledby` names the field. The law reads the name for each way a
 * field is named: by `aria-label`, by `aria-labelledby`, and by a `<label for>`
 * alone, as FormField names it.
 *
 * The React member's default is React Aria's word, which React Aria says in
 * the locale of its provider, so the React test mounts the field in `en-US`.
 * React Aria also labels the list by the button that opens it, where no
 * reference names the field, so the React list's name ends with the chevron's
 * there (`namedByChevron`). The generated members name it by its word alone.
 */

/** The props the law mounts a Combobox with. A prop the law leaves out is not passed. */
export interface ComboboxListLawProps {
  options: { value: string; label: string }[]
  defaultOpen: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  messages?: { list: string }
}

export interface ComboboxListLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Combobox with these props, after the label element the law puts in the page. */
  mount(props: ComboboxListLawProps): Promise<unknown>
  /**
   * Whether the list's name ends with the chevron's, `Show options`, where no
   * reference names the field: the React member's, through React Aria.
   */
  readonly namedByChevron?: boolean
}

const OPTIONS = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
]

/** The id the law gives the field, and the id of the element that labels it. */
const FIELD_ID = 'combobox-list-law-field'
const LABEL_ID = 'combobox-list-law-label'

/** A host's word for the list, in French. */
const HOST = { list: 'Propositions' }

/** The list of the Combobox mounted last, once it is open. */
async function list(): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const element = [...document.querySelectorAll<HTMLElement>('[role="listbox"]')].at(-1)
      if (element === undefined) throw new Error('the Combobox drew no open list')
      return element
    },
    { timeout: 2000, interval: 25 },
  )
}

export function comboboxListLaw({ shell, mount, namedByChevron = false }: ComboboxListLaw): void {
  /** The list's name where no reference names the field. */
  const alone = (word: string) => (namedByChevron ? `${word} Show options` : word)

  describe(`${shell} Combobox — the name of its list`, () => {
    beforeAll(installTestTheme)

    /** The element that labels the field: a `<label for>` or the target of `aria-labelledby`. */
    let label: HTMLElement | undefined
    afterEach(() => {
      label?.remove()
      label = undefined
    })

    /** Puts the label element in the page, before the field it names. */
    function labelled(element: 'label' | 'span'): void {
      label = document.createElement(element)
      label.textContent = 'Assignee'
      if (element === 'label') label.setAttribute('for', FIELD_ID)
      else label.id = LABEL_ID
      document.body.append(label)
    }

    it('is the list’s word where aria-label names the field', async () => {
      await mount({ options: OPTIONS, defaultOpen: true, 'aria-label': 'Assignee' })
      expect(harness.nameOf(await list())).toBe(alone('Suggestions'))
    })

    it('is the host’s word where aria-label names the field', async () => {
      await mount({ options: OPTIONS, defaultOpen: true, 'aria-label': 'Assignee', messages: HOST })
      expect(harness.nameOf(await list())).toBe(alone('Propositions'))
    })

    it('is the list’s word, then the field’s label, where aria-labelledby names the field', async () => {
      labelled('span')
      await mount({ options: OPTIONS, defaultOpen: true, 'aria-labelledby': LABEL_ID })
      expect(harness.nameOf(await list())).toBe('Suggestions Assignee')
    })

    it('is the host’s word, then the field’s label, where aria-labelledby names the field', async () => {
      labelled('span')
      await mount({
        options: OPTIONS,
        defaultOpen: true,
        'aria-labelledby': LABEL_ID,
        messages: HOST,
      })
      expect(harness.nameOf(await list())).toBe('Propositions Assignee')
    })

    it('is the list’s word where only a label element names the field, as FormField names it', async () => {
      labelled('label')
      await mount({ options: OPTIONS, defaultOpen: true, id: FIELD_ID })
      // The label names the field: the field is the control it labels. A substrate may hide the
      // page outside the open list, the label included, so its name is not computed here.
      expect(document.getElementById(FIELD_ID)).toBe((label as HTMLLabelElement).control)
      expect(harness.nameOf(await list())).toBe(alone('Suggestions'))
    })

    it('is the host’s word where only a label element names the field', async () => {
      labelled('label')
      await mount({ options: OPTIONS, defaultOpen: true, id: FIELD_ID, messages: HOST })
      expect(harness.nameOf(await list())).toBe(alone('Propositions'))
    })
  })
}
