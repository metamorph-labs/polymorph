import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'

import { TAB_PASSES_BUTTONS } from './engines'
import { harness } from './harness'
import type { MountAdapter } from './run'

/**
 * The law for the name tip (`design/components/button.md`), which every web
 * shell's test calls with its mount adapter. An icon-only Button shows its
 * label on hover after the Tooltip's delay and on keyboard focus, in the
 * Tooltip's bubble; a labelled Button shows none; a Button inside a Tooltip
 * shows only the Tooltip; the members that draw Button's icon-only box without
 * the Button member show their names the same way; and over a modal Dialog the
 * tip is drawn above the panel and its scrim while focus stays in the panel.
 *
 * It holds the four statements of WCAG 1.4.13 the tip makes: it is not
 * announced twice, Escape dismisses it and leaves a Dialog around the button
 * open, the pointer may move onto it, and it stays until it is dismissed or
 * the pointer and focus leave. A contract statement cannot say any of it: a
 * hover is not a statement, and the tip adds no attribute a statement could
 * read.
 *
 * Each case mounts a states fixture entry by the name every shell gives it.
 * The words are the entries' own labels, which no machine formats, so no case
 * depends on the browser's locale.
 */

export interface NameTipLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  readonly adapter: MountAdapter
}

/** The page's one bubble, while a tip shows. */
const tip = () => document.querySelector<HTMLElement>('body > [popover]')

/** A token's computed length, read through an element that is sized by it. */
function tokenLength(name: string): string {
  const probe = document.createElement('div')
  probe.style.height = `var(${name})`
  document.body.append(probe)
  const length = getComputedStyle(probe).height
  probe.remove()
  return length
}

/** A token's computed colour, read through an element that is painted with it. */
function tokenColor(name: string): string {
  const probe = document.createElement('div')
  probe.style.backgroundColor = `var(${name})`
  document.body.append(probe)
  const color = getComputedStyle(probe).backgroundColor
  probe.remove()
  return color
}

/** An element at the window's bottom-left corner, where no entry reaches. */
function corner(): HTMLElement {
  const element = document.createElement('div')
  element.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 8px; height: 8px'
  document.body.append(element)
  return element
}

/** Moves the real pointer to the corner, whatever covers it. */
async function restPointer(): Promise<void> {
  const element = corner()
  await userEvent.hover(element, { force: true })
  element.remove()
}

/** Two frames: the tip a focus opens is placed a frame after the focus. */
const frames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/**
 * Fakes the hover timer once the skip delay of a tip an earlier case closed has passed. The skip
 * delay is read from the real clock, which stays real.
 */
async function fakeTimersAfterSkip(): Promise<void> {
  vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, TOOLTIP_SKIP_DELAY_MS))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

/** Hovers `element` and runs the hover delay on the fake clock. */
async function hoverAndWait(element: Element): Promise<void> {
  await userEvent.hover(element)
  await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
}

function find<T extends Element>(scope: ParentNode, selector: string): T {
  const element = scope.querySelector<T>(selector)
  if (element === null) throw new Error(`the entry draws no ${selector}`)
  return element
}

export function nameTipLaw({ shell, adapter }: NameTipLaw): void {
  describe(`${shell}: the name tip`, () => {
    const unmounts: (() => void)[] = []

    /** Mounts an entry below the window's top edge, where a tip has room above the control. */
    async function mount(
      member: string,
      state: string,
      overrides?: Readonly<Record<string, string>>,
    ): Promise<HTMLElement> {
      const { root, unmount } = await adapter.mount(member, { state, overrides })
      unmounts.push(unmount)
      root.style.paddingTop = '96px'
      return root
    }

    const extras: Element[] = []

    /**
     * Moves focus to `target` with a key, from a plain button before `root` whose handler for
     * that key puts focus there: an arrow key as a roving toolbar moves focus, or Enter as a
     * trigger does whose dialog focuses its first control. It reaches a button on every engine,
     * where Tab does not (`TAB_PASSES_BUTTONS`).
     */
    async function focusWithKey(
      root: HTMLElement,
      target: HTMLElement,
      key: 'ArrowRight' | 'Enter' = 'ArrowRight',
    ): Promise<void> {
      const from = document.createElement('button')
      from.textContent = 'From'
      from.addEventListener('keydown', (event) => {
        if (event.key !== key) return
        event.preventDefault()
        target.focus()
      })
      root.before(from)
      extras.push(from)
      from.focus()
      await userEvent.keyboard(`{${key}}`)
      expect(document.activeElement).toBe(target)
    }

    beforeAll(installTestTheme)

    afterEach(async () => {
      vi.useRealTimers()
      await restPointer()
      for (const unmount of unmounts.splice(0)) unmount()
      for (const extra of extras.splice(0)) extra.remove()
      await frames()
    })

    it('an icon-only Button shows its label after the delay on hover, in the Tooltip’s bubble', async () => {
      const root = await mount('Button', 'icon-only')
      const button = find<HTMLButtonElement>(root, 'button[aria-label="Edit"]')
      await fakeTimersAfterSkip()
      await userEvent.hover(button)
      await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS - 1)
      expect(tip()).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      const bubble = tip() as HTMLElement
      expect(bubble.textContent).toBe('Edit')
      // For the eye only: the button's name stays its own, and nothing describes it twice.
      expect(bubble.getAttribute('aria-hidden')).toBe('true')
      expect(button.hasAttribute('aria-describedby')).toBe(false)
      // In the top layer, painted with the Tooltip's values, the Tooltip's gap above the button.
      expect(bubble.matches(':popover-open')).toBe(true)
      expect(getComputedStyle(bubble).backgroundColor).toBe(tokenColor('--pm-bg-inverse'))
      expect(bubble.dataset.side).toBe('top')
      const gap = button.getBoundingClientRect().top - bubble.getBoundingClientRect().bottom
      expect(`${Math.round(gap)}px`).toBe(tokenLength('--pm-space-2'))
      await restPointer()
      expect(tip()).toBeNull()
    })

    it('an icon-only Button shows its label when a key that moves focus puts focus on it', async () => {
      const root = await mount('Button', 'icon-only')
      const button = find<HTMLButtonElement>(root, 'button[aria-label="Edit"]')
      await focusWithKey(root, button)
      await vi.waitFor(() => expect(tip()?.textContent).toBe('Edit'))
      button.blur()
      expect(tip()).toBeNull()
    })

    it('an icon-only Button shows no tip for focus a script gives after Enter', async () => {
      const root = await mount('Button', 'icon-only')
      await focusWithKey(root, find<HTMLButtonElement>(root, 'button[aria-label="Edit"]'), 'Enter')
      await frames()
      expect(tip()).toBeNull()
    })

    it('not announced twice: the name is the aria-label alone, and the bubble is hidden and referred to by nothing', async () => {
      const hint = document.createElement('p')
      hint.id = 'name-tip-law-hint'
      hint.textContent = 'Opens the editor.'
      document.body.append(hint)
      extras.push(hint)
      const root = await mount('Button', 'icon-only', { 'aria-describedby': hint.id })
      const button = find<HTMLButtonElement>(root, 'button[aria-label="Edit"]')
      await fakeTimersAfterSkip()
      await hoverAndWait(button)
      const bubble = tip() as HTMLElement
      expect(bubble.textContent).toBe('Edit')
      expect(harness.nameOf(button)).toBe('Edit')
      expect(bubble.getAttribute('aria-hidden')).toBe('true')
      expect(bubble.getAttribute('role')).toBeNull()
      expect(bubble.id).toBe('')
      // The app's description is untouched, and nothing names or describes the button by the tip.
      expect(button.getAttribute('aria-describedby')).toBe(hint.id)
      expect(button.hasAttribute('aria-labelledby')).toBe(false)
    })

    it('hoverable: the tip stays while the pointer crosses the gap onto it', async () => {
      const root = await mount('Button', 'icon-only')
      const button = find<HTMLButtonElement>(root, 'button[aria-label="Edit"]')
      await fakeTimersAfterSkip()
      await hoverAndWait(button)
      const bubble = tip() as HTMLElement
      const box = bubble.getBoundingClientRect()
      const gap = document.createElement('div')
      gap.style.cssText = `position: fixed; left: ${box.left}px; top: ${box.bottom}px; width: ${box.width}px; height: ${button.getBoundingClientRect().top - box.bottom}px`
      document.body.append(gap)
      extras.push(gap)
      await userEvent.hover(gap)
      expect(tip()).toBe(bubble)
      await userEvent.hover(bubble, { force: true })
      expect(tip()).toBe(bubble)
      await restPointer()
      expect(tip()).toBeNull()
    })

    it('persistent: the tip stays while the pointer rests or focus stays, with no time limit', async () => {
      const root = await mount('Button', 'icon-only')
      const button = find<HTMLButtonElement>(root, 'button[aria-label="Edit"]')
      await fakeTimersAfterSkip()
      await hoverAndWait(button)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(tip()).not.toBeNull()
      await restPointer()
      expect(tip()).toBeNull()
      vi.useRealTimers()
      await focusWithKey(root, button)
      await vi.waitFor(() => expect(tip()).not.toBeNull())
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(tip()).not.toBeNull()
      button.blur()
      expect(tip()).toBeNull()
    })

    it('a labelled Button shows no tip on hover or keyboard focus', async () => {
      const root = await mount('Button', 'size md')
      const button = find<HTMLButtonElement>(root, 'button')
      await fakeTimersAfterSkip()
      await hoverAndWait(button)
      expect(tip()).toBeNull()
      vi.useRealTimers()
      await focusWithKey(root, button)
      await frames()
      expect(tip()).toBeNull()
    })

    it('an icon-only Button inside a Tooltip shows only the Tooltip', async () => {
      const root = await mount('Tooltip', 'closed — hover or focus the trigger')
      await fakeTimersAfterSkip()
      await hoverAndWait(find(root, 'button[aria-label="Archive"]'))
      vi.useRealTimers()
      await vi.waitFor(() =>
        expect(document.querySelector('[data-member="tooltip"]')?.textContent).toContain(
          'Archive this ticket',
        ),
      )
      expect(tip()).toBeNull()
    })

    for (const [member, state, selector, label] of [
      ['SplitButton', 'solid accent — the default default', 'button', 'More resolve options'],
      ['CopyButton', 'rest', 'button', 'Copy install command'],
      ['AvatarButton', 'initials — named by the action, not the person', 'button', 'Account menu'],
      ['Pagination', 'with addresses — every page but the current one is a link', 'a', 'Next page'],
    ] as const) {
      it(`${member} shows “${label}” on hover`, async () => {
        const root = await mount(member, state)
        await fakeTimersAfterSkip()
        await hoverAndWait(find(root, `${selector}[aria-label="${label}"]`))
        expect(tip()?.textContent).toBe(label)
      })
    }

    it('CopyButton shows no tip while its confirmation shows', async () => {
      const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
      try {
        const root = await mount('CopyButton', 'rest')
        const button = find<HTMLButtonElement>(root, 'button[aria-label="Copy install command"]')
        await fakeTimersAfterSkip()
        await hoverAndWait(button)
        expect(tip()).not.toBeNull()
        await userEvent.click(button)
        await vi.waitFor(() => expect(button.dataset.state).toBe('copied'))
        expect(tip()).toBeNull()
        // The pointer leaves and comes back while the glyph still confirms.
        await restPointer()
        await hoverAndWait(button)
        expect(button.dataset.state).toBe('copied')
        expect(tip()).toBeNull()
      } finally {
        write.mockRestore()
      }
    })

    it.skipIf(TAB_PASSES_BUTTONS)(
      'Pagination’s arrow drawn as a link shows its label when Tab reaches it',
      async () => {
        const root = await mount(
          'Pagination',
          'with addresses — every page but the current one is a link',
        )
        find<HTMLElement>(root, 'a[aria-label="Page 5"]').focus()
        await userEvent.keyboard('{Tab}')
        expect(document.activeElement).toBe(find(root, 'a[aria-label="Next page"]'))
        await vi.waitFor(() => expect(tip()?.textContent).toBe('Next page'))
      },
    )

    describe('in a modal Dialog', () => {
      const panel = () => find<HTMLElement>(document, '[data-member="dialog"][role="dialog"]')
      const close = () => find<HTMLElement>(panel(), 'button[aria-label="Close"]')

      /** Mounts the open Dialog after a press elsewhere, so the focus it gives opens no tip. */
      async function openDialog(): Promise<void> {
        const elsewhere = corner()
        await userEvent.click(elsewhere, { force: true })
        elsewhere.remove()
        await mount('Dialog', 'open md — the panel itself, at the size it defaults to')
        await vi.waitFor(() => expect(panel().contains(document.activeElement)).toBe(true))
        // The panel's entrance ends before its box is read.
        await new Promise((resolve) => setTimeout(resolve, 600))
      }

      it('draws the close button’s tip above the panel and the scrim, and focus stays in the panel', async () => {
        await openDialog()
        const focused = document.activeElement
        await fakeTimersAfterSkip()
        await hoverAndWait(close())
        const bubble = tip() as HTMLElement
        expect(bubble.textContent).toBe('Close')
        expect(bubble.matches(':popover-open')).toBe(true)
        expect(document.activeElement).toBe(focused)
        // The bubble crosses the panel's top edge: its top is over the scrim, its foot over the
        // panel. Hit testing finds the bubble at both while it takes pointer events, so it is
        // drawn over both.
        const box = bubble.getBoundingClientRect()
        const edge = panel().getBoundingClientRect().top
        expect(box.top).toBeLessThan(edge)
        expect(box.bottom).toBeGreaterThan(edge)
        const x = box.left + box.width / 2
        bubble.style.pointerEvents = 'auto'
        try {
          expect(document.elementFromPoint(x, box.top + 1)).toBe(bubble)
          expect(document.elementFromPoint(x, box.bottom - 1)).toBe(bubble)
        } finally {
          bubble.style.pointerEvents = ''
        }
        // It takes no pointer events itself, so a press reaches what is under it.
        expect(document.elementFromPoint(x, box.bottom - 1)).not.toBe(bubble)
      })

      it('dismissible: Escape on a tip the pointer opened closes the tip, and the Dialog stays open', async () => {
        await openDialog()
        const focused = document.activeElement
        await fakeTimersAfterSkip()
        await hoverAndWait(close())
        expect(tip()).not.toBeNull()
        vi.useRealTimers()
        await userEvent.keyboard('{Escape}')
        expect(tip()).toBeNull()
        await frames()
        expect(panel().isConnected).toBe(true)
        expect(document.activeElement).toBe(focused)
      })

      it.skipIf(TAB_PASSES_BUTTONS)(
        'dismissible: Tab to the close button shows its tip, Escape closes the tip and the Dialog stays open, and a second Escape closes the Dialog',
        async () => {
          await openDialog()
          for (let step = 0; step < 6 && document.activeElement !== close(); step += 1) {
            await userEvent.keyboard('{Tab}')
          }
          expect(document.activeElement).toBe(close())
          await vi.waitFor(() => expect(tip()?.textContent).toBe('Close'))
          await userEvent.keyboard('{Escape}')
          expect(tip()).toBeNull()
          await frames()
          expect(panel().isConnected).toBe(true)
          expect(document.activeElement).toBe(close())
          await userEvent.keyboard('{Escape}')
          await vi.waitFor(() =>
            expect(document.querySelector('[data-member="dialog"][role="dialog"]')).toBeNull(),
          )
        },
      )

      it('a Dialog opened with Enter shows no tip on the close button it focuses, and the first Escape closes it', async () => {
        const root = await mount('Dialog', 'plain')
        find<HTMLElement>(root, 'button').focus()
        await userEvent.keyboard('{Enter}')
        await vi.waitFor(() => expect(document.activeElement).toBe(close()))
        await frames()
        expect(tip()).toBeNull()
        await userEvent.keyboard('{Escape}')
        await vi.waitFor(() =>
          expect(document.querySelector('[data-member="dialog"][role="dialog"]')).toBeNull(),
        )
      })
    })
  })
}
