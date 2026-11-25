import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for where focus goes when a toast that holds it leaves, for which
 * key presses reach a toast, for what the viewport's live regions say and for
 * when its timers wait (`design/components/toast.md`, A11y and Motion), which
 * every web shell's Toast test calls with a mount of its own. A contract
 * statement starts from one fixture entry and reads one part; this law raises
 * several toasts, makes them leave by each route and reads where focus lands,
 * what the regions say and whether a toast is still there.
 *
 * Focus in a leaving toast moves to the next toast, else the previous one, so
 * a reader working down the stack stays in it, whether the toast was dismissed,
 * removed by its owner or evicted by a newer toast. With no toast left it goes
 * back to the element it came from as it entered the notifications, while
 * focus can go to that element, and otherwise to the list F8 focuses. Escape
 * reaches a toast only while focus is in it, and an Escape that something else
 * has handled, or an input method is handling, is not the toast's.
 *
 * A region says a toast as it is raised and when an update changes its words,
 * each time as a new element, so the same words said twice are said twice,
 * and it says nothing as a toast leaves. The timers wait while the window is in
 * the background, and run again once focus has fallen out of the notifications
 * even when the browser sends no `focusout`.
 *
 * The law moves focus onto a card's own control with `focus()` and presses
 * the key with the keyboard harness, because shells order the tab stops of a
 * stack differently and the law is about what the key does.
 */

export interface ToastFocusLawToast {
  readonly title: string
  readonly description?: string
  /** A live toast's id updates it in place. */
  readonly id?: string
  /** Pinned when it is left out. */
  readonly durationMs?: number
  /** The toast's action, whose label names its Button. */
  readonly action?: { readonly label: string; readonly onClick: () => void }
}

export interface ToastFocusLaw {
  /** The shell's name as the law's titles say it: `Svelte`. */
  readonly shell: string
  /** Mounts the shell's toast viewport. */
  mount(): Promise<unknown>
  /**
   * Raises a toast through the shell's store, transient and pinned unless it says a duration,
   * and returns its id.
   */
  raise(toast: ToastFocusLawToast): string
  /** Removes one toast from the shell's store, as the screen that owns it does. */
  remove(id: string): void
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

const sleep = (ms: number) => new Promise((settle) => setTimeout(settle, ms))

/** One of the viewport's live regions. */
function liveRegion(channel: 'polite' | 'assertive'): HTMLElement {
  const region = list()
    ?.closest('[role="region"]')
    ?.querySelector<HTMLElement>(`[aria-live="${channel}"]`)
  if (!region) throw new Error(`the viewport has no ${channel} live region`)
  return region
}

/**
 * What a live region says from now on: its words each time an element is added to it, which
 * is what a screen reader says. Words changed in an element that stays are not counted.
 */
function listen(channel: 'polite' | 'assertive'): { said: () => string[]; stop: () => void } {
  const region = liveRegion(channel)
  const said: string[] = []
  const observer = new MutationObserver((mutations) => {
    const added = mutations.some((mutation) =>
      [...mutation.addedNodes].some(
        (node) => node.nodeType !== Node.COMMENT_NODE && (node.textContent ?? '').trim() !== '',
      ),
    )
    if (added) said.push((region.textContent ?? '').replace(/\s+/g, ' ').trim())
  })
  observer.observe(region, { childList: true, subtree: true })
  return {
    said: () => [...said],
    stop: () => observer.disconnect(),
  }
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
    async function enter(
      titles: readonly ToastFocusLawToast[],
    ): Promise<{ from: HTMLButtonElement; ids: string[] }> {
      const from = before('Edit ticket')
      await law.mount()
      const ids = titles.map((each) => law.raise(each))
      await vi.waitFor(() => expect(open()).toHaveLength(titles.length))
      from.focus()
      await userEvent.keyboard('{F8}')
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(list()))
      return { from, ids }
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

    it('moves focus to the next toast when its owner removes the one that holds it', async () => {
      const { ids } = await enter([{ title: 'Ticket created' }, { title: 'Ticket assigned' }])
      control('Ticket created', 'Dismiss').focus()
      law.remove(ids[0] as string)
      await vi.waitFor(() =>
        expect(document.activeElement, describeActive()).toBe(card('Ticket assigned')),
      )
    })

    it('returns focus to where it was before F8 when its owner removes the last toast', async () => {
      const { from, ids } = await enter([{ title: 'Ticket created' }])
      control('Ticket created', 'Dismiss').focus()
      law.remove(ids[0] as string)
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(from))
    })

    it('moves focus to the next toast when a newer toast evicts the one that holds it', async () => {
      await enter([
        { title: 'Ticket created' },
        { title: 'Ticket assigned' },
        { title: 'Ticket moved' },
        { title: 'Ticket tagged' },
      ])
      control('Ticket created', 'Dismiss').focus()
      law.raise({ title: 'Ticket closed' })
      await vi.waitFor(() =>
        expect(document.activeElement, describeActive()).toBe(card('Ticket assigned')),
      )
      expect(open().some((each) => each.textContent?.includes('Ticket created'))).toBe(false)
    })

    it('returns focus to where it was before F8 when the last toast leaves', async () => {
      const { from } = await enter([{ title: 'Ticket created' }])
      control('Ticket created', 'Dismiss').focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(from))
    })

    it('moves focus to the list when the element it came from has left the page', async () => {
      const { from } = await enter([{ title: 'Ticket created' }])
      from.remove()
      control('Ticket created', 'Dismiss').focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(list()))
    })

    it('moves focus to the list when the element it came from can no longer take it', async () => {
      const { from } = await enter([{ title: 'Ticket created' }])
      from.disabled = true
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
        await sleep(300)
        expect(open(), 'Escape outside the notifications dismissed a toast').toHaveLength(1)
        expect(heard).toHaveBeenCalledTimes(1)
        expect((heard.mock.calls[0]?.[0] as KeyboardEvent).defaultPrevented).toBe(false)
      } finally {
        document.removeEventListener('keydown', heard)
      }
    })

    it('leaves a toast open on an Escape that something in it has handled', async () => {
      await enter([{ title: 'Ticket created' }])
      control('Ticket created', 'Dismiss').focus()
      // A Select or a Menu in a toast's content closes its list on Escape and prevents the
      // key's default, as a Radix layer does from the document.
      const handled = (event: KeyboardEvent) => {
        if (event.key === 'Escape') event.preventDefault()
      }
      document.addEventListener('keydown', handled, true)
      try {
        await userEvent.keyboard('{Escape}')
        await sleep(300)
        expect(open(), 'an Escape something had handled dismissed the toast').toHaveLength(1)
      } finally {
        document.removeEventListener('keydown', handled, true)
      }
    })

    it('leaves a toast open on an Escape that an input method is handling', async () => {
      await enter([{ title: 'Ticket created' }])
      const close = control('Ticket created', 'Dismiss')
      close.focus()
      close.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
          composed: true,
          isComposing: true,
        }),
      )
      await sleep(300)
      expect(open(), 'an Escape an input method was handling dismissed the toast').toHaveLength(1)
    })
  })

  describe(`what the notifications say in ${law.shell}`, () => {
    beforeAll(installTestTheme)
    afterEach(() => law.clear())

    it('says a toast as it is raised, with its action’s label, and nothing as one leaves', async () => {
      await law.mount()
      const polite = listen('polite')
      try {
        law.raise({ title: 'Ticket archived', action: { label: 'Undo', onClick: () => {} } })
        await vi.waitFor(() => expect(polite.said()).toHaveLength(1))
        expect(polite.said()[0]).toContain('Ticket archived')
        expect(polite.said()[0]).toContain('Undo')
        law.raise({ title: 'Ticket assigned', description: 'Sent to the triage queue.' })
        await vi.waitFor(() => expect(polite.said()).toHaveLength(2))
        expect(polite.said()[1]).toContain('Sent to the triage queue.')
        control('Ticket assigned', 'Dismiss').click()
        await vi.waitFor(() => expect(open()).toHaveLength(1))
        await sleep(300)
        expect(polite.said(), 'a toast that left made the region say another').toHaveLength(2)
        expect(liveRegion('polite').textContent).not.toContain('Ticket archived')
      } finally {
        polite.stop()
      }
    })

    it('says two toasts with the same words in a row each', async () => {
      await law.mount()
      const polite = listen('polite')
      try {
        law.raise({ title: 'Ticket saved' })
        await vi.waitFor(() => expect(polite.said()).toHaveLength(1))
        law.raise({ title: 'Ticket saved' })
        await vi.waitFor(() => expect(polite.said()).toHaveLength(2))
        expect(polite.said()[1]).toBe(polite.said()[0])
      } finally {
        polite.stop()
      }
    })

    it('says an update that changes its words, and not one that changes none', async () => {
      await law.mount()
      const polite = listen('polite')
      try {
        law.raise({ id: 'export', title: 'Exporting 1 of 3' })
        await vi.waitFor(() => expect(polite.said()).toHaveLength(1))
        law.raise({ id: 'export', title: 'Exporting 1 of 3' })
        await sleep(300)
        expect(polite.said(), 'an update with the same words was said again').toHaveLength(1)
        law.raise({ id: 'export', title: 'Export ready' })
        await vi.waitFor(() => expect(polite.said()).toHaveLength(2))
        expect(polite.said()[1]).toContain('Export ready')
      } finally {
        polite.stop()
      }
    })
  })

  describe(`when the timers wait in ${law.shell}`, () => {
    beforeAll(installTestTheme)
    afterEach(() => law.clear())

    it('holds a toast while the window is in the background', async () => {
      await law.mount()
      law.raise({ title: 'Ticket saved', durationMs: 300 })
      await vi.waitFor(() => expect(open()).toHaveLength(1))
      window.dispatchEvent(new FocusEvent('blur'))
      try {
        await sleep(900)
        expect(open(), 'the timer ran while the window was in the background').toHaveLength(1)
      } finally {
        window.dispatchEvent(new FocusEvent('focus'))
      }
      await vi.waitFor(() => expect(open()).toHaveLength(0), { timeout: 3000 })
    })

    it('runs the timers again when focus falls out of the notifications with no focusout', async () => {
      const from = pageButton('Edit ticket')
      try {
        await law.mount()
        const id = law.raise({
          title: 'Ticket archived',
          action: { label: 'Undo', onClick: () => {} },
        })
        await vi.waitFor(() => expect(open()).toHaveLength(1))
        from.focus()
        await userEvent.keyboard('{F8}')
        control('Ticket archived', 'Undo').focus()
        // A browser need not send a `focusout` when the element that holds focus leaves the
        // page, so none reaches the viewport here.
        const silence = (event: Event) => event.stopImmediatePropagation()
        window.addEventListener('focusout', silence, true)
        try {
          // The update takes the action away, and focus with it, and gives the toast a time.
          law.raise({ id, title: 'Ticket archived', durationMs: 300 })
          await vi.waitFor(() =>
            expect(document.activeElement, describeActive()).toBe(document.body),
          )
        } finally {
          window.removeEventListener('focusout', silence, true)
        }
        await vi.waitFor(() => expect(open()).toHaveLength(0), { timeout: 3000 })
      } finally {
        from.remove()
      }
    })
  })
}
