import { getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for a pager the app holds while one of its controls has focus
 * (`design/components/pagination.md` and `cursor-pagination.md`, A11y), which
 * every web shell's Pagination and CursorPagination tests call with a mount of
 * their own. A contract statement starts from a fixture entry and changes no
 * prop (`docs/conformance.md`), so the law changes the pager's props itself, as
 * the application around it would.
 *
 * A hold disables the pager's controls, and a browser takes focus from a
 * control as it is disabled: the page has it, and no control does. Every
 * shell moves focus to the pager's root instead, and gives it back to the
 * control when the hold ends. A shell that left either out fails here.
 *
 * The law presses from the keyboard, because the root draws its ring only
 * when focus came from the keyboard (`:focus-visible`). It focuses a button
 * from a script and reads `document.activeElement`, because Tab passes over
 * buttons in WebKit. It waits for focus, because Firefox and WebKit take focus
 * from a disabled control a moment after it is disabled.
 */

/** What the law sets on the pager after it mounts. */
export interface PagerHold {
  /** The app's hold. */
  disabled: boolean
  /** Pagination: the current page. */
  page: number
  /** CursorPagination: a window is in flight. */
  pending: boolean
  /** CursorPagination: the list has a next window. */
  hasNext: boolean
}

/** What the law sets on a CursorPagination, which has no page. */
export type CursorHold = Omit<PagerHold, 'page'>

export interface MountedPager {
  /** Sets props on the pager, as its parent's state would. */
  set(next: Partial<PagerHold>): void | Promise<void>
}

export interface PagerHoldLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  readonly member: 'Pagination' | 'CursorPagination'
  /**
   * Mounts the member named `Tickets`, not held: a Pagination at page 3 of 7,
   * or a CursorPagination with a window in each direction and none in flight,
   * in its append form when `append` holds. The pager's handlers call `asked`
   * each time it asks for a page or a window.
   */
  mount(options: { append: boolean; asked: () => void }): Promise<MountedPager>
}

const LABEL = 'Tickets'

/** Two frames, in which an engine that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/** A button of the page as it is drawn now: a shell may draw a control again as a new element. */
const button = (name: string) => getByRole<HTMLButtonElement>(document.body, 'button', { name })

export function pagerHoldLaw({ shell, member, mount }: PagerHoldLaw): void {
  describe(`${shell} ${member} — a hold while the pager has focus`, () => {
    beforeAll(installTestTheme)

    let fields: HTMLElement[] = []

    afterEach(() => {
      for (const field of fields) field.remove()
      fields = []
    })

    /**
     * A text field of the page around the pager, at the end of the body. Tab
     * visits a text field in every engine.
     */
    function field(name: string): HTMLInputElement {
      const input = document.createElement('input')
      input.setAttribute('aria-label', name)
      document.body.append(input)
      fields.push(input)
      return input
    }

    /**
     * The pager between two text fields. `onAsk` is what the application does
     * when the pager asks for a page or a window: by default it holds the
     * pager.
     */
    async function page({
      append = false,
      onAsk = { disabled: true },
    }: { append?: boolean; onAsk?: Partial<PagerHold> } = {}) {
      const before = field('Before')
      // The pager cannot ask before it is mounted, so the handler reads the mount when it runs.
      const mounted: { pager?: MountedPager } = {}
      mounted.pager = await mount({ append, asked: () => void mounted.pager?.set(onAsk) })
      const after = field('After')
      const set = mounted.pager.set.bind(mounted.pager)
      const pager = () => getByRole(document.body, 'navigation', { name: LABEL })
      // The control the reader is on: a page that is not the current one, the
      // next direction, or the append form's action.
      const name = member === 'Pagination' ? 'Page 4' : append ? 'Load more' : 'Next'
      return { before, after, set, pager, name, control: button(name) }
    }

    /** Presses the control from the keyboard and waits for the hold to move focus to the pager. */
    async function pressIntoHold(control: HTMLElement, pager: () => HTMLElement) {
      control.focus()
      expect(document.activeElement).toBe(control)
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement).toBe(pager()))
    }

    it('moves focus to the pager when the hold disables the control that has focus', async () => {
      const { control, pager, after } = await page()
      await pressIntoHold(control, pager)

      expect(control.disabled).toBe(true)
      // The root takes focus from a script and is no tab stop.
      expect(pager().getAttribute('tabindex')).toBe('-1')

      // The next Tab goes on from the pager, to what follows it on the page.
      await userEvent.keyboard('{Tab}')
      await vi.waitFor(() => expect(document.activeElement).toBe(after))
    })

    it('draws the shared focus ring on the pager, because focus came from the keyboard', async () => {
      const { control, pager } = await page()
      expect(getComputedStyle(pager()).outlineStyle).toBe('none')
      await pressIntoHold(control, pager)

      const style = getComputedStyle(pager())
      expect(style.outlineStyle).toBe('solid')
      expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThan(0)
    })

    it('returns focus to the control when the hold ends', async () => {
      const { control, pager, name, set } = await page()
      await pressIntoHold(control, pager)

      await set({ disabled: false })
      await vi.waitFor(() => expect(document.activeElement).toBe(button(name)))
      expect(button(name).disabled).toBe(false)
    })

    it('moves nothing when the hold begins and ends while focus is elsewhere', async () => {
      const { control, before, set } = await page()
      // The reader was in the pager and left it before the hold.
      control.focus()
      before.focus()

      await set({ disabled: true })
      await vi.waitFor(() => expect(control.disabled).toBe(true))
      await frames()
      expect(document.activeElement).toBe(before)

      await set({ disabled: false })
      await vi.waitFor(() => expect(control.disabled).toBe(false))
      await frames()
      expect(document.activeElement).toBe(before)
    })

    it('moves nothing when the hold ends after the reader left the pager', async () => {
      const { control, pager, after, name, set } = await page()
      await pressIntoHold(control, pager)
      await userEvent.keyboard('{Tab}')
      await vi.waitFor(() => expect(document.activeElement).toBe(after))

      await set({ disabled: false })
      await vi.waitFor(() => expect(button(name).disabled).toBe(false))
      await frames()
      expect(document.activeElement).toBe(after)
    })

    if (member === 'Pagination') {
      it('keeps the pressed page’s button, and its focus, when it becomes the current page', async () => {
        // No hold here. The hold's rule rests on this: the page a reader presses is the same
        // element once it is the current page, so a hold that begins with the new page
        // disables the element that has focus.
        const { control } = await page({ onAsk: { page: 4 } })
        control.focus()
        await userEvent.keyboard('{Enter}')

        await vi.waitFor(() => expect(control.getAttribute('aria-current')).toBe('page'))
        expect(control.isConnected).toBe(true)
        expect(document.activeElement).toBe(control)
      })

      it('returns focus to the page the reader pressed when the hold begins with that page', async () => {
        // The application sets the page and its hold together, as a list that loads each page does.
        const { control, pager, set } = await page({ onAsk: { page: 4, disabled: true } })
        await pressIntoHold(control, pager)

        await set({ disabled: false })
        await vi.waitFor(() => expect(document.activeElement).toBe(button('Page 4')))
        expect(button('Page 4').getAttribute('aria-current')).toBe('page')
      })

      it('returns focus to the page the reader pressed when the page changes under the hold', async () => {
        const { control, pager, set } = await page()
        await pressIntoHold(control, pager)

        await set({ page: 4 })
        await set({ disabled: false })
        await vi.waitFor(() => expect(document.activeElement).toBe(button('Page 4')))
        expect(button('Page 4').getAttribute('aria-current')).toBe('page')
      })

      it('returns focus to a direction when the page changes under the hold', async () => {
        const { pager, set } = await page()
        await pressIntoHold(button('Next page'), pager)

        await set({ page: 4 })
        await set({ disabled: false })
        await vi.waitFor(() => expect(document.activeElement).toBe(button('Next page')))
      })

      it('stays on the pager when the page the reader pressed is no longer drawn', async () => {
        const { control, pager, set } = await page()
        await pressIntoHold(control, pager)

        // The last of seven pages draws 1, a gap, 6 and 7.
        await set({ page: 7 })
        await set({ disabled: false })
        await vi.waitFor(() => expect(button('Page 6').disabled).toBe(false))
        await frames()
        expect(queryByRole(document.body, 'button', { name: 'Page 4' })).toBeNull()
        expect(document.activeElement).toBe(pager())
      })

      it('stays on the pager when the direction the reader pressed is disabled after the hold', async () => {
        const { pager, set } = await page()
        await pressIntoHold(button('Next page'), pager)

        // The last page has no next page.
        await set({ page: 7 })
        await set({ disabled: false })
        await vi.waitFor(() => expect(button('Page 6').disabled).toBe(false))
        await frames()
        expect(button('Next page').disabled).toBe(true)
        expect(document.activeElement).toBe(pager())
      })
    }

    if (member === 'CursorPagination') {
      it('keeps a busy direction’s focus through the hold, moves it to the pager when the window arrives, and returns it when the hold ends', async () => {
        const { control, pager, name, set } = await page({
          onAsk: { pending: true, disabled: true },
        })
        control.focus()
        await userEvent.keyboard('{Enter}')

        // Busy is not disabled, so the hold takes nothing from the pressed direction.
        await vi.waitFor(() => expect(control.getAttribute('aria-busy')).toBe('true'))
        await frames()
        expect(control.disabled).toBe(false)
        expect(document.activeElement).toBe(control)

        // The window arrives and the hold stays: the direction is disabled now.
        await set({ pending: false })
        await vi.waitFor(() => expect(document.activeElement).toBe(pager()))
        expect(control.disabled).toBe(true)

        await set({ disabled: false })
        await vi.waitFor(() => expect(document.activeElement).toBe(button(name)))
      })

      it('stays on the pager when the direction the reader pressed is disabled after the hold', async () => {
        const { control, pager, name, set } = await page()
        await pressIntoHold(control, pager)

        // The window that arrived is the last one.
        await set({ hasNext: false })
        await set({ disabled: false })
        await vi.waitFor(() => expect(button('Previous').disabled).toBe(false))
        await frames()
        expect(button(name).disabled).toBe(true)
        expect(document.activeElement).toBe(pager())
      })

      it('moves focus to the pager when the hold disables the append form’s action, and returns it when the hold ends', async () => {
        const { control, pager, name, set } = await page({ append: true })
        await pressIntoHold(control, pager)
        expect(control.disabled).toBe(true)

        await set({ disabled: false })
        await vi.waitFor(() => expect(document.activeElement).toBe(button(name)))
      })

      it('stays on the pager when the append form’s action left under the hold', async () => {
        const { control, pager, name, set } = await page({ append: true })
        await pressIntoHold(control, pager)

        // The list runs out under the hold, so there is no action to return to.
        await set({ hasNext: false })
        await vi.waitFor(() => expect(queryByRole(document.body, 'button', { name })).toBeNull())
        await set({ disabled: false })
        await vi.waitFor(() => expect(pager().hasAttribute('data-disabled')).toBe(false))
        await frames()
        expect(document.activeElement).toBe(pager())
      })

      it('takes no focus when the append form’s action leaves, although the app holds the pager', async () => {
        // The list runs out as the hold begins: the action is removed, not disabled, and focus
        // stays with the browser (`cursor-pagination.md`, Load more).
        const { control, pager } = await page({
          append: true,
          onAsk: { hasNext: false, disabled: true },
        })
        control.focus()
        await userEvent.keyboard('{Enter}')

        await vi.waitFor(() => expect(control.isConnected).toBe(false))
        await frames()
        expect(document.activeElement).not.toBe(pager())
      })
    }
  })
}
