import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for where focus goes when a toast that holds it leaves, and for
 * which key presses reach a toast (`design/components/toast.md`, A11y), which
 * every web shell's Toast test calls with a mount of its own. A contract
 * statement starts from one fixture entry and reads one part; this law raises
 * several toasts, dismisses one from the keyboard and reads where focus lands.
 *
 * Focus in a leaving toast moves to the next toast, else the previous one, so
 * a reader working down the stack stays in it. With no toast left it goes back
 * to the element it came from as it entered the notifications, while that
 * element is in the document, and otherwise to the list F8 focuses. Escape
 * reaches a toast only while focus is in it, so a toast never takes Escape
 * from the page or from an open Dialog.
 *
 * The law moves focus onto a card's own control with `focus()` and presses
 * the key with the keyboard harness, because shells order the tab stops of a
 * stack differently and the law is about what the key does.
 */

export interface ToastFocusLawToast {
  readonly title: string
  /** The toast's action, whose label names its Button. */
  readonly action?: { readonly label: string; readonly onClick: () => void }
}

export interface ToastFocusLaw {
  /** The shell's name as the law's titles say it: `Svelte`. */
  readonly shell: string
  /** Mounts the shell's toast viewport. */
  mount(): Promise<unknown>
  /** Raises a toast that stays until it is dismissed, through the shell's store. */
  raise(toast: ToastFocusLawToast): void
  /** Removes every toast from the shell's store. */
  clear(): void
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-member="toast"]')]
const open = () => cards().filter((card) => card.dataset['state'] !== 'closed')
const list = () => document.querySelector<HTMLElement>('[data-toast-part="list"]')

/** The open card whose text holds the title. */
function card(title: string): HTMLElement {
  const found = open().find((each) => each.textContent?.includes(title))
  if (found === undefined) throw new Error(`no open toast says "${title}"`)
  return found
}

/** One of a card's own Buttons, by its accessible name. */
function control(title: string, name: string): HTMLElement {
  const button = [...card(title).querySelectorAll<HTMLElement>('button')].find(
    (each) => each.getAttribute('aria-label') === name || each.textContent?.trim() === name,
  )
  if (button === undefined) throw new Error(`the toast "${title}" has no "${name}" Button`)
  return button
}

/** A plain button outside the notifications, where the reader was before F8. */
function pageButton(label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = label
  document.body.prepend(button)
  return button
}

const describeActive = () => {
  const active = document.activeElement
  if (active === null) return 'nothing'
  if (active === document.body) return 'the body'
  return `<${active.tagName.toLowerCase()}> "${(active.textContent ?? '').trim().slice(0, 40)}"`
}

export function toastFocusLaw(law: ToastFocusLaw): void {
  describe(`focus as a toast leaves in ${law.shell}`, () => {
    const made: HTMLElement[] = []
    const before = (label: string) => {
      const button = pageButton(label)
      made.push(button)
      return button
    }

    beforeAll(installTestTheme)
    afterEach(() => {
      law.clear()
      for (const element of made.splice(0)) element.remove()
    })

    /** Mounts, raises the toasts, and enters the notifications with F8 from a page Button. */
    async function enter(titles: readonly ToastFocusLawToast[]): Promise<HTMLButtonElement> {
      const from = before('Edit ticket')
      await law.mount()
      for (const each of titles) law.raise(each)
      await vi.waitFor(() => expect(open()).toHaveLength(titles.length))
      from.focus()
      await userEvent.keyboard('{F8}')
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(list()))
      return from
    }

    it('moves focus to the next toast when one is dismissed from the keyboard', async () => {
      await enter([{ title: 'Ticket created' }, { title: 'Ticket assigned' }, { title: 'Sent' }])
      control('Ticket created', 'Dismiss').focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(document.activeElement, describeActive()).toBe(card('Ticket assigned')),
      )
    })

    it('moves focus to the previous toast when the last one is dismissed', async () => {
      await enter([{ title: 'Ticket created' }, { title: 'Ticket assigned' }])
      control('Ticket assigned', 'Dismiss').focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() =>
        expect(document.activeElement, describeActive()).toBe(card('Ticket created')),
      )
    })

    it('moves focus on when the action or Escape dismisses a toast', async () => {
      const undo = vi.fn()
      await enter([
        { title: 'Ticket archived', action: { label: 'Undo', onClick: undo } },
        { title: 'Ticket assigned' },
      ])
      control('Ticket archived', 'Undo').focus()
      await userEvent.keyboard('{Enter}')
      expect(undo).toHaveBeenCalledTimes(1)
      const next = await vi.waitFor(() => {
        const assigned = card('Ticket assigned')
        expect(document.activeElement, describeActive()).toBe(assigned)
        return assigned
      })
      expect(next.dataset['state']).toBe('open')
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(open()).toHaveLength(0))
    })

    it('returns focus to where it was before F8 when the last toast leaves', async () => {
      const from = await enter([{ title: 'Ticket created' }])
      control('Ticket created', 'Dismiss').focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(from))
    })

    it('moves focus to the list when the element it came from has left the page', async () => {
      const from = await enter([{ title: 'Ticket created' }])
      from.remove()
      control('Ticket created', 'Dismiss').focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(list()))
    })

    it('leaves Escape to the page while focus is outside the notifications', async () => {
      const field = document.createElement('input')
      field.setAttribute('aria-label', 'Subject')
      document.body.prepend(field)
      made.push(field)
      await law.mount()
      law.raise({ title: 'Ticket created' })
      await vi.waitFor(() => expect(open()).toHaveLength(1))
      const heard = vi.fn()
      document.addEventListener('keydown', heard)
      try {
        field.focus()
        await userEvent.keyboard('{Escape}')
        await new Promise((settle) => setTimeout(settle, 300))
        expect(open(), 'Escape outside the notifications dismissed a toast').toHaveLength(1)
        expect(heard).toHaveBeenCalledTimes(1)
        expect((heard.mock.calls[0]?.[0] as KeyboardEvent).defaultPrevented).toBe(false)
      } finally {
        document.removeEventListener('keydown', heard)
      }
    })
  })
}
