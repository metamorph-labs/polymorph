import { getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for InlineEdit's opening, saving, cancelling, waiting and failing
 * (`design/components/inline-edit.md`, Behaviour), which every web shell's
 * InlineEdit test calls with a mount of its own. A contract statement starts
 * from a fixture entry and changes no prop (`docs/conformance.md`), and its
 * `commits` effect reads a field that stays in the document. This law types,
 * saves and cancels as a reader does, changes the props as the application
 * around the member does while a save waits for a server, and measures the
 * row in both forms.
 *
 * The law focuses a button from a script and reads `document.activeElement`,
 * because Tab passes over buttons in WebKit. It waits for focus, because a
 * shell moves focus a moment after the change that draws the field or the
 * text.
 */

/** What the law sets on the member after it mounts. */
export interface InlineEditLawProps {
  value: string
  /** Whether the field is open, while the application holds it. `undefined` hands it to the member. */
  editing: boolean | undefined
  pending: boolean
  error: string | undefined
  required: boolean
  size: 'sm' | 'md' | 'lg'
}

export interface InlineEditLawMount {
  /** The props the member mounts with. */
  readonly props: InlineEditLawProps
  readonly defaultEditing: boolean
  /** The member's two handlers. */
  readonly onCommit: (value: string) => void
  readonly onEditingChange: (editing: boolean) => void
}

export interface MountedInlineEdit {
  /** Sets props on the member, as its parent's state would. */
  set(next: Partial<InlineEditLawProps>): void | Promise<void>
}

export interface InlineEditLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one InlineEdit labelled `Project name` with the props and handlers given. */
  mount(options: InlineEditLawMount): Promise<MountedInlineEdit>
}

const VALUE = 'Acme billing'
const ERROR = 'A project named Acme payments already exists.'

const root = () => document.querySelector<HTMLElement>('[data-member="inline-edit"]') as HTMLElement
const editControl = () =>
  getByRole<HTMLButtonElement>(document.body, 'button', { name: 'Edit Project name' })
const field = () => getByRole<HTMLInputElement>(document.body, 'textbox', { name: 'Project name' })
const button = (name: string) => getByRole<HTMLButtonElement>(document.body, 'button', { name })
const isOpen = () => root().hasAttribute('data-editing')

/** The text the edit control is described by: the value beside it. */
function described(control: HTMLElement): string {
  const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim()
}

/** Two frames, in which a shell that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

export function inlineEditLaw({ shell, mount }: InlineEditLaw): void {
  describe(`${shell} InlineEdit — opening, saving, cancelling, a save that waits, and its height`, () => {
    beforeAll(installTestTheme)

    let outside: HTMLElement[] = []

    afterEach(() => {
      for (const element of outside) element.remove()
      outside = []
    })

    /** A text field of the page around the member, at the end of the body. */
    function pageField(): HTMLInputElement {
      const input = document.createElement('input')
      input.setAttribute('aria-label', 'Elsewhere')
      document.body.append(input)
      outside.push(input)
      return input
    }

    /**
     * The member with a spy in each handler. `held` makes the application hold
     * the open state, as an app whose save waits for a server does: the
     * member's request to open or close is passed back as `editing`.
     */
    async function project({
      props = {},
      defaultEditing = false,
      held = false,
    }: { props?: Partial<InlineEditLawProps>; defaultEditing?: boolean; held?: boolean } = {}) {
      const onCommit = vi.fn<(value: string) => void>()
      const onEditingChange = vi.fn<(editing: boolean) => void>()
      const mounted: { member?: MountedInlineEdit } = {}
      mounted.member = await mount({
        props: {
          value: VALUE,
          editing: held ? false : undefined,
          pending: false,
          error: undefined,
          required: false,
          size: 'md',
          ...props,
        },
        defaultEditing,
        onCommit,
        onEditingChange: (next) => {
          onEditingChange(next)
          if (held) void mounted.member?.set({ editing: next })
        },
      })
      await vi.waitFor(() => expect(root()).toBeTruthy())
      const set = async (next: Partial<InlineEditLawProps>) => {
        await mounted.member?.set(next)
        await frames()
      }
      return { set, onCommit, onEditingChange }
    }

    /** Focuses an element from a script, as a press or Tab would leave it. */
    async function focus(element: HTMLElement) {
      element.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(element))
    }

    /** Opens the field from the edit control, with Enter, and waits for focus in it. */
    async function open() {
      await focus(editControl())
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement).toBe(field()))
    }

    const onEditControl = () => vi.waitFor(() => expect(document.activeElement).toBe(editControl()))

    /* ---------------------------------------------------------------------- */
    /* Names                                                                  */
    /* ---------------------------------------------------------------------- */

    it('names the edit control from the label and describes it by the value beside it', async () => {
      await project()
      expect(described(editControl())).toBe(VALUE)
      expect(queryByRole(document.body, 'textbox')).toBeNull()
    })

    /* ---------------------------------------------------------------------- */
    /* Opening                                                                */
    /* ---------------------------------------------------------------------- */

    it('opens the field from the edit control with focus in it and all of its text selected', async () => {
      const { onEditingChange } = await project()
      await open()
      const input = field()
      expect(input.value).toBe(VALUE)
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, VALUE.length])
      expect(onEditingChange.mock.calls).toEqual([[true]])
    })

    it('takes no focus when it mounts open', async () => {
      await project({ defaultEditing: true })
      await frames()
      expect(isOpen()).toBe(true)
      expect(document.activeElement).not.toBe(field())
    })

    it('moves focus into the field when the app opens it, with all of its text selected', async () => {
      const { set } = await project({ held: true })
      await set({ editing: true })
      await vi.waitFor(() => expect(document.activeElement).toBe(field()))
      expect([field().selectionStart, field().selectionEnd]).toEqual([0, VALUE.length])
    })

    /* ---------------------------------------------------------------------- */
    /* Saving                                                                 */
    /* ---------------------------------------------------------------------- */

    it('saves a changed text with Enter, once and as typed, then closes and returns focus to the edit control', async () => {
      const { set, onCommit, onEditingChange } = await project()
      await open()
      await userEvent.keyboard('Acme payments ')
      await userEvent.keyboard('{Enter}')
      await onEditControl()
      expect(onCommit.mock.calls).toEqual([['Acme payments ']])
      expect(onEditingChange.mock.calls).toEqual([[true], [false]])

      // The application passes the saved value, which the edit control is now described by.
      await set({ value: 'Acme payments' })
      await vi.waitFor(() => expect(described(editControl())).toBe('Acme payments'))
    })

    it('saves from the save control as Enter does', async () => {
      const { onCommit } = await project()
      await open()
      await userEvent.keyboard('Acme payments')
      await userEvent.click(button('Save'))
      await onEditControl()
      expect(onCommit.mock.calls).toEqual([['Acme payments']])
    })

    it('reports nothing for an unchanged text, and closes the field', async () => {
      const { onCommit, onEditingChange } = await project()
      await open()
      await userEvent.keyboard('{Enter}')
      await onEditControl()
      expect(onCommit).not.toHaveBeenCalled()
      expect(onEditingChange.mock.calls).toEqual([[true], [false]])
    })

    it('cannot save a blank text when the value is required', async () => {
      const { onCommit } = await project({ props: { required: true } })
      await open()
      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(field().value).toBe(''))
      expect(button('Save').disabled).toBe(true)
      expect(field().getAttribute('aria-required')).toBe('true')
      await userEvent.keyboard('   {Enter}')
      await frames()
      expect(onCommit).not.toHaveBeenCalled()
      expect(isOpen()).toBe(true)
    })

    /* ---------------------------------------------------------------------- */
    /* Cancelling and leaving                                                 */
    /* ---------------------------------------------------------------------- */

    it('cancels with Escape: nothing is reported, the value stays, and the next opening starts from it', async () => {
      const { onCommit, onEditingChange } = await project()
      await open()
      await userEvent.keyboard('Something else')
      await userEvent.keyboard('{Escape}')
      await onEditControl()
      expect(onCommit).not.toHaveBeenCalled()
      expect(onEditingChange.mock.calls).toEqual([[true], [false]])
      expect(described(editControl())).toBe(VALUE)

      await open()
      expect(field().value).toBe(VALUE)
    })

    it('cancels from the cancel control as Escape does', async () => {
      const { onCommit } = await project()
      await open()
      await userEvent.keyboard('Something else')
      await userEvent.click(button('Cancel'))
      await onEditControl()
      expect(onCommit).not.toHaveBeenCalled()
    })

    it('neither saves nor cancels when focus leaves the field', async () => {
      const { onCommit, onEditingChange } = await project()
      const elsewhere = pageField()
      await open()
      await userEvent.keyboard('Acme payments')
      await focus(elsewhere)
      await frames()
      expect(isOpen()).toBe(true)
      expect(field().value).toBe('Acme payments')
      expect(onCommit).not.toHaveBeenCalled()
      expect(onEditingChange.mock.calls).toEqual([[true]])
    })

    /* ---------------------------------------------------------------------- */
    /* A save that waits                                                      */
    /* ---------------------------------------------------------------------- */

    it('stays open after a save while the app holds it, and holds still while the save is in flight', async () => {
      const { set, onCommit, onEditingChange } = await project({ held: true })
      await open()
      await userEvent.keyboard('Acme payments')
      await userEvent.keyboard('{Enter}')
      expect(onCommit.mock.calls).toEqual([['Acme payments']])
      await frames()
      expect(isOpen()).toBe(true)

      await set({ pending: true })
      const input = field()
      expect(input.readOnly).toBe(true)
      expect(document.activeElement).toBe(input)
      expect(button('Save').getAttribute('aria-busy')).toBe('true')
      expect(button('Cancel').disabled).toBe(true)

      // Neither key sends a second save or abandons the first.
      await userEvent.keyboard('{Enter}')
      await userEvent.keyboard('{Escape}')
      await frames()
      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(onEditingChange.mock.calls).toEqual([[true]])
      expect(isOpen()).toBe(true)

      // The save succeeds: the app closes the field and passes the saved value.
      await set({ pending: false, editing: false, value: 'Acme payments' })
      await onEditControl()
      expect(described(editControl())).toBe('Acme payments')
    })

    it('keeps the reader’s text after a failed save, moves focus to the field, and ties the error to it', async () => {
      const { set } = await project({ held: true })
      await open()
      await userEvent.keyboard('Acme payments')
      // Pressed from the keyboard on the save control, so focus is on it when the save fails.
      await focus(button('Save'))
      await userEvent.keyboard('{Enter}')
      await set({ pending: true })
      await set({ pending: false, error: ERROR })

      await vi.waitFor(() => expect(document.activeElement).toBe(field()))
      const input = field()
      expect(input.value).toBe('Acme payments')
      expect(input.getAttribute('aria-invalid')).toBe('true')
      const message = (input.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id))
        .find((element) => element?.textContent?.includes(ERROR))
      expect(message, 'the error is one of the field’s descriptions').toBeTruthy()
      expect(
        message?.closest('[aria-live="polite"]'),
        'the error is in a polite region',
      ).toBeTruthy()
    })

    it('leaves focus where it is when the app closes the field while focus is elsewhere', async () => {
      const { set } = await project({ held: true })
      const elsewhere = pageField()
      await open()
      await focus(elsewhere)
      await set({ editing: false })
      await frames()
      expect(isOpen()).toBe(false)
      expect(document.activeElement).toBe(elsewhere)
    })

    /* ---------------------------------------------------------------------- */
    /* The row's height                                                       */
    /* ---------------------------------------------------------------------- */

    for (const size of ['sm', 'md', 'lg'] as const) {
      it(`keeps the row's height when the field opens and closes, at ${size}`, async () => {
        await project({ props: { size } })
        const reading = root().getBoundingClientRect().height
        await open()
        const editing = root().getBoundingClientRect().height
        expect(Math.abs(editing - reading), `${reading} then ${editing}`).toBeLessThan(0.5)
        await userEvent.keyboard('{Escape}')
        await onEditControl()
        expect(Math.abs(root().getBoundingClientRect().height - reading)).toBeLessThan(0.5)
      })
    }
  })
}
