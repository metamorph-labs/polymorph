import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The law for the name of a field's popup list, which MultiSelect's
 * (`multi-select-list.ts`) and Select's (`select-list.ts`) laws run. The list
 * takes the field's own name: the field's `aria-labelledby`, else its
 * `aria-label`, else the labels that name the field. A contract statement names
 * a part from one prop (`docs/conformance.md`), and the last of these is an
 * element outside the member, so the law puts that element in the page: a
 * `<label for>` alone, and the shell's FormField, whose label names the field
 * that way. It reads the list in the anchored panel and in the sheet a narrow
 * window draws.
 */

/** The props the law mounts a member with. A prop the law leaves out is not passed. */
export interface ListNameLawProps {
  options: { value: string; label: string }[]
  defaultOpen?: boolean
  id?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

/** The FormField the law puts a member in. */
export interface ListNameLawField {
  label: string
  required: boolean
}

export interface ListNameLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one member with these props, after the label elements the law puts in the page. */
  mount(props: ListNameLawProps): Promise<unknown>
  /** Mounts one member with these props as the control of the shell's FormField. */
  mountInField(field: ListNameLawField, props: ListNameLawProps): Promise<unknown>
}

/** The member a list's name is read from. */
export interface ListNameMember {
  /** The member's name as the law's titles say it. */
  readonly member: string
  /** Selects the field the labels name, in every mounted member: the last match is the field. */
  readonly field: string
  /**
   * Whether the law also reads the field's own name while the list is open,
   * which the list's equals. A member whose list hides the page outside it
   * while open hides the label with it, and the label's words are then not
   * the field's name for DOM Testing Library: React's Select, through Radix.
   */
  readonly readsField: boolean
  /**
   * Whether the list takes focus once it opens, as Select's does, which the
   * law waits for before it presses Escape: a Zag machine focuses its list a
   * frame after it opens, and an Escape pressed before then reaches the field.
   */
  readonly focusesList: boolean
}

const OPTIONS = [
  { value: 'ada', label: 'Ada Lovelace' },
  { value: 'grace', label: 'Grace Hopper' },
]

/** The id the law gives the field, and the id of the element its `aria-labelledby` names. */
const FIELD_ID = 'list-name-law-field'
const LABEL_ID = 'list-name-law-label'

/** The window the suite runs in (`vitest.config.ts`), and one narrow enough for the sheet. */
const DESKTOP = { width: 1280, height: 800 }
const PHONE = { width: 375, height: 812 }

const WAIT = { timeout: 2000, interval: 25 }

/** The open lists in the page. */
const lists = () => [...document.querySelectorAll<HTMLElement>('[role="listbox"]')]

export function listNameLaw(
  { member, field: fieldSelector, readsField, focusesList }: ListNameMember,
  { shell, mount, mountInField }: ListNameLaw,
): void {
  /** The list of the member mounted last, once it is open. */
  async function list(): Promise<HTMLElement> {
    return vi.waitFor(() => {
      const element = lists().at(-1)
      if (element === undefined) throw new Error(`the ${member} drew no open list`)
      return element
    }, WAIT)
  }

  /** The field of the member mounted last. */
  function field(): HTMLElement {
    const element = [...document.querySelectorAll<HTMLElement>(fieldSelector)].at(-1)
    if (element === undefined) throw new Error(`the ${member} drew no field`)
    return element
  }

  /** Waits until the open list's name is `expected`, and expects the field's to be the same. */
  async function named(expected: string): Promise<void> {
    const element = await list()
    await vi.waitFor(() => expect(harness.nameOf(element)).toBe(expected), WAIT)
    if (readsField) expect(harness.nameOf(field())).toBe(expected)
  }

  describe(`${shell} ${member} — the name of its list`, () => {
    beforeAll(installTestTheme)

    /** The elements the law put in the page, removed after each test. */
    const placed: HTMLElement[] = []
    afterEach(async () => {
      for (const element of placed.splice(0)) element.remove()
      await page.viewport(DESKTOP.width, DESKTOP.height)
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
      expect((field() as HTMLInputElement).labels?.[0]).toBe(label)
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

    it('is the label’s words in the sheet a narrow window draws', async () => {
      await page.viewport(PHONE.width, PHONE.height)
      labelFor('Assignee')
      await mount({ options: OPTIONS, defaultOpen: true, id: FIELD_ID })
      await vi.waitFor(
        () => expect(document.querySelector('[data-presentation="sheet"]')).not.toBeNull(),
        WAIT,
      )
      await named('Assignee')
    })

    it('says the label’s new words at the next opening once they change', async () => {
      const label = labelFor('Assignee')
      await mount({ options: OPTIONS, id: FIELD_ID })
      field().focus()
      await userEvent.keyboard('{ArrowDown}')
      await named('Assignee')
      if (focusesList) {
        const open = await list()
        await vi.waitFor(() => expect(open.contains(document.activeElement)).toBe(true), WAIT)
      }
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(lists()).toHaveLength(0), WAIT)
      label.textContent = 'Watchers'
      field().focus()
      await userEvent.keyboard('{ArrowDown}')
      await named('Watchers')
    })

    it('is the field’s aria-label where it has one alone', async () => {
      await mount({ options: OPTIONS, defaultOpen: true, 'aria-label': 'Watchers' })
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
