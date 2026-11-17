import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for where a toast is drawn while a finger drags it and after the
 * finger lets go (`design/components/toast.md`), which each generated shell's
 * Toast test calls with a mount of its own. A contract statement reads
 * attributes and handlers (`docs/conformance.md`), and this law reads where
 * the card is drawn, so it is stated here.
 *
 * The recipe places the card from the offset the shell writes on it. A shell
 * that marked the swipe and wrote no offset, or reset the offset as the finger
 * lifted, would pass a test of `data-swipe` alone. The law measures the card's
 * box: it is at the finger during the drag, at rest after a short drag, and
 * at the finger in every frame of its exit after a long one.
 *
 * The law dispatches pointer events on the card, because the pointer harness
 * drags with a mouse and a toast's swipe is the same handlers either way. It
 * waits for each reading, because a shell commits a state change a moment
 * after the event.
 */

export interface ToastSwipeLaw {
  /** The shell's name as the law's titles say it: `Svelte`. */
  readonly shell: string
  /** Mounts the shell's toast viewport. */
  mount(): Promise<unknown>
  /** Raises a toast that stays until it is dismissed, through the shell's store. */
  raise(title: string): void
  /** How many toasts the shell's store holds. */
  held(): number
  /** Removes every toast from the shell's store. */
  clear(): void
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-member="toast"]')]

/** The one card, once its enter has finished and its place is its rest. */
async function cardAtRest(): Promise<{ card: HTMLElement; rest: number }> {
  await vi.waitFor(() => expect(cards()).toHaveLength(1))
  const card = cards()[0] as HTMLElement
  await Promise.all(card.getAnimations().map((animation) => animation.finished))
  return { card, rest: card.getBoundingClientRect().x }
}

const pointer = (card: HTMLElement, type: string, clientX: number) =>
  card.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY: 0 }))

/** How far the card is drawn from its rest, in whole pixels. */
const offset = (card: HTMLElement, rest: number) =>
  Math.round(card.getBoundingClientRect().x - rest)

export function toastSwipeLaw(law: ToastSwipeLaw): void {
  describe(`a swiped toast in ${law.shell}`, () => {
    beforeAll(installTestTheme)
    afterEach(() => law.clear())

    it('returns to rest when the finger lets go short of the threshold', async () => {
      await law.mount()
      law.raise('Let go')
      const { card, rest } = await cardAtRest()

      pointer(card, 'pointerdown', 0)
      pointer(card, 'pointermove', 30)
      await vi.waitFor(() => expect(card.dataset['swipe']).toBe('move'))
      await vi.waitFor(() => expect(offset(card, rest)).toBe(30))

      pointer(card, 'pointerup', 30)
      await vi.waitFor(() => expect(card.dataset['swipe']).toBe('cancel'))
      await vi.waitFor(() => expect(offset(card, rest)).toBe(0))
      expect(card.dataset['state']).toBe('open')
      expect(law.held()).toBe(1)
    })

    it('leaves from where the finger let go past the threshold', async () => {
      await law.mount()
      law.raise('Dragged')
      const { card, rest } = await cardAtRest()

      pointer(card, 'pointerdown', 0)
      pointer(card, 'pointermove', 20)
      pointer(card, 'pointermove', 90)
      await vi.waitFor(() => expect(card.dataset['swipe']).toBe('move'))
      await vi.waitFor(() => expect(offset(card, rest)).toBe(90))

      pointer(card, 'pointerup', 90)
      await vi.waitFor(() => expect(card.dataset['state']).toBe('closed'))
      expect(card.dataset['swipe']).toBe('end')
      // The exit fades the card where it is. An exit that also moved the card would start from
      // the finger too, so the card is measured in every frame until it is removed.
      const drawn = new Set<number>()
      while (card.isConnected) {
        drawn.add(offset(card, rest))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      expect([...drawn]).toEqual([90])
      await vi.waitFor(() => expect(law.held()).toBe(0), { timeout: 3000 })
      await vi.waitFor(() => expect(cards()).toHaveLength(0))
    })
  })
}
