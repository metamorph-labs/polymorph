import { getByRole, queryAllByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for MasterDetailPage's two arrangements and where its focus goes
 * (`design/archetypes/master-detail-page.md`, Behaviour), which every web
 * shell's MasterDetailPage test calls with a mount of its own. A contract
 * statement starts from a fixture entry and changes no prop, and the grammar
 * cannot state a width (`docs/conformance.md`). So the law mounts the page in
 * a host of a width it sets, and changes the width, the detail and the
 * current item itself, as the application and the window around the page
 * would.
 *
 * The law focuses a button from a script and reads `document.activeElement`,
 * because Tab passes over buttons in WebKit. It waits for each reading,
 * because a shell draws a change a moment after it is made, and the page
 * moves focus after it draws.
 */

/** The names of the list's items, in order. */
export const MASTER_DETAIL_ITEMS = ['Alpha', 'Bravo', 'Charlie'] as const

export type MasterDetailItem = (typeof MASTER_DETAIL_ITEMS)[number]

/** What the law sets on the page and its host. */
export interface MasterDetailLawProps {
  /** The host's width in px. */
  width: number
  /** Whether the page has a detail. */
  detail: boolean
  /** The item the list marks current, or `null` for none. */
  current: MasterDetailItem | null
  /** Whether the list's items are buttons, or text that takes no focus. */
  buttons: boolean
}

export interface MasterDetailLawMount {
  /** The props the page mounts with. */
  readonly props: MasterDetailLawProps
  /** The page's `onBack`. */
  readonly onBack: () => void
}

export interface MountedMasterDetail {
  /** Sets props on the page and its host, as the application and the window would. */
  set(next: Partial<MasterDetailLawProps>): void | Promise<void>
}

export interface MasterDetailLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts, in a host `width` px wide and 480px high, one MasterDetailPage
   * titled `Support`, with `listLabel` `Tickets`, `backLabel` `All tickets`,
   * `emptyState` `{ title: 'No ticket selected' }` and `onBack`. Its header's
   * `actions` are one `<button type="button">` named `New ticket`. Its `list`
   * is a `<ul>` with an `<li>` for each of `MASTER_DETAIL_ITEMS`, which holds
   * a `<button type="button">` named for the item while `buttons` holds, with
   * `aria-current="true"` on the one `current` names, and the name as text
   * otherwise. While `detail` holds, its `detail` is an `<h2>` `Bravo` over a
   * `<button type="button">` named `Reply`; otherwise it has none.
   */
  mount(options: MasterDetailLawMount): Promise<MountedMasterDetail>
}

/** Above the page's breakpoint (48rem), and below it. */
const WIDE = 1000
const NARROW = 400

const page = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="master-detail-page"]')
  if (element === null) throw new Error('the MasterDetailPage rendered nothing')
  return element
}

const part = (name: string) =>
  page().querySelector<HTMLElement>(`[data-master-detail-page-part="${name}"]`)

const listPane = () => part('list') as HTMLElement

const back = () => part('back')?.querySelector<HTMLElement>('button') ?? null

/** A button of the page by its name, among the ones that are drawn. */
const button = (name: string): HTMLElement => {
  const found = [...page().querySelectorAll<HTMLElement>('button')].find(
    (element) => element.textContent?.trim() === name && element.closest('[hidden]') === null,
  )
  if (found === undefined) throw new Error(`no button named ${name} is drawn`)
  return found
}

const box = (element: Element) => element.getBoundingClientRect()

/** Two frames, in which a page that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

export function masterDetailLaw({ shell, mount }: MasterDetailLaw): void {
  describe(`${shell} MasterDetailPage — its two arrangements and where focus goes`, () => {
    beforeAll(installTestTheme)

    let outside: HTMLElement[] = []

    afterEach(() => {
      for (const element of outside) element.remove()
      outside = []
    })

    /** The page with a spy in `onBack`, drawn in the arrangement its width decides. */
    async function draw(props: Partial<MasterDetailLawProps> = {}) {
      const onBack = vi.fn<() => void>()
      const held: MasterDetailLawProps = {
        width: WIDE,
        detail: false,
        current: null,
        buttons: true,
        ...props,
      }
      const mounted = await mount({ props: { ...held }, onBack })
      await arranged(held)
      return {
        onBack,
        async set(next: Partial<MasterDetailLawProps>) {
          Object.assign(held, next)
          await mounted.set(next)
          await arranged(held)
        },
      }
    }

    /** Waits until the page draws the arrangement its props decide. */
    async function arranged({ width, detail }: MasterDetailLawProps) {
      const layout = width < 768 ? 'single' : 'split'
      await vi.waitFor(() => {
        expect(page().getAttribute('data-layout')).toBe(layout)
        if (layout === 'single') {
          expect(page().getAttribute('data-pane')).toBe(detail ? 'detail' : 'list')
        } else {
          expect(page().hasAttribute('data-pane')).toBe(false)
        }
        expect(queryByRole(page(), 'heading', { level: 2, name: 'Bravo' }) !== null).toBe(detail)
      })
    }

    /** Focuses an element from a script, as a press or Tab would leave it. */
    async function focus(element: HTMLElement) {
      element.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(element))
    }

    /** A button of the document outside the page, as the shell's sidebar holds one. */
    function elsewhere(): HTMLElement {
      const element = document.createElement('button')
      element.type = 'button'
      element.textContent = 'Elsewhere'
      document.body.append(element)
      outside.push(element)
      return element
    }

    /* ---------------------------------------------------------------------- */
    /* The arrangements                                                       */
    /* ---------------------------------------------------------------------- */

    it('draws the list beside the detail at width, with the split named for the list', async () => {
      await draw({ detail: true, current: 'Bravo' })
      const list = getByRole(page(), 'region', { name: 'Tickets' })
      expect(list).toBe(listPane())
      const detail = getByRole(page(), 'heading', { level: 2, name: 'Bravo' })
      expect(box(detail).left).toBeGreaterThan(box(list).right)
      expect(getByRole(page(), 'separator', { name: 'Tickets' })).toBeTruthy()
      expect(back()).toBeNull()
      expect(queryAllByRole(page(), 'heading', { level: 1 })).toHaveLength(1)
    })

    it('draws the empty state beside the list while nothing is selected', async () => {
      await draw()
      const empty = page().querySelector<HTMLElement>('[data-member="empty-state"]')
      expect(empty?.textContent).toContain('No ticket selected')
      expect(box(empty as HTMLElement).left).toBeGreaterThan(box(listPane()).right)
    })

    it('draws the list alone below the breakpoint while nothing is selected', async () => {
      await draw({ width: NARROW })
      expect(queryByRole(page(), 'separator')).toBeNull()
      expect(page().querySelector('[data-member="empty-state"]')).toBeNull()
      expect(listPane().hidden).toBe(false)
      expect(back()).toBeNull()
    })

    it('draws the detail alone under the way back below the breakpoint, and keeps the list hidden', async () => {
      const { onBack } = await draw({ width: NARROW, detail: true, current: 'Bravo' })
      expect(queryByRole(page(), 'separator')).toBeNull()
      expect(listPane().hidden).toBe(true)
      expect(queryByRole(page(), 'region', { name: 'Tickets' })).toBeNull()
      const way = getByRole(page(), 'button', { name: 'All tickets' })
      expect(way).toBe(back())
      const heading = getByRole(page(), 'heading', { level: 2, name: 'Bravo' })
      expect(way.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      await userEvent.click(way)
      expect(onBack).toHaveBeenCalledTimes(1)
    })

    it('announces nothing of its own', async () => {
      await draw({ detail: true, current: 'Bravo' })
      const channels = page().querySelectorAll(
        '[aria-live], [role="status"], [role="alert"], [role="log"]',
      )
      expect(channels).toHaveLength(0)
    })

    /* ---------------------------------------------------------------------- */
    /* Focus                                                                  */
    /* ---------------------------------------------------------------------- */

    it('moves no focus when an item is picked in the split', async () => {
      const { set } = await draw()
      const bravo = button('Bravo')
      await focus(bravo)
      await set({ detail: true, current: 'Bravo' })
      await frames()
      expect(document.activeElement).toBe(bravo)
    })

    it('moves focus to the way back when the detail replaces the list', async () => {
      const { set } = await draw({ width: NARROW })
      await focus(button('Bravo'))
      await set({ detail: true, current: 'Bravo' })
      await vi.waitFor(() => expect(document.activeElement).toBe(back()))
    })

    it('moves focus to the current item when the list returns', async () => {
      const { set } = await draw({ width: NARROW, detail: true, current: 'Bravo' })
      await focus(back() as HTMLElement)
      await set({ detail: false })
      await vi.waitFor(() => expect(document.activeElement).toBe(button('Bravo')))
    })

    it('moves focus to the list’s first item when the list returns with none current', async () => {
      const { set } = await draw({ width: NARROW, detail: true, current: 'Bravo' })
      await focus(back() as HTMLElement)
      await set({ detail: false, current: null })
      await vi.waitFor(() => expect(document.activeElement).toBe(button('Alpha')))
    })

    it('moves focus to the list pane when the list returns with nothing that takes focus', async () => {
      const { set } = await draw({ width: NARROW, detail: true, buttons: false })
      await focus(back() as HTMLElement)
      await set({ detail: false })
      await vi.waitFor(() => expect(document.activeElement).toBe(listPane()))
      expect(listPane().getAttribute('tabindex')).toBe('-1')
    })

    it('moves focus to the list when the detail goes from the split with focus in it', async () => {
      const { set } = await draw({ detail: true, current: 'Bravo' })
      await focus(button('Reply'))
      await set({ detail: false, current: null })
      await vi.waitFor(() => expect(document.activeElement).toBe(button('Alpha')))
    })

    it('moves no focus when the page mounts with a detail', async () => {
      const before = elsewhere()
      await focus(before)
      await draw({ width: NARROW, detail: true, current: 'Bravo' })
      await frames()
      expect(document.activeElement).toBe(before)
    })

    it('leaves focus that is outside the page’s body where it is', async () => {
      const { set } = await draw({ width: NARROW })
      const action = button('New ticket')
      await focus(action)
      await set({ detail: true, current: 'Bravo' })
      await frames()
      expect(document.activeElement).toBe(action)
      // Focus that left the page and then fell to the document's body was
      // not lost from the page's body, so the page leaves it there.
      await focus(elsewhere())
      outside.splice(0).forEach((element) => element.remove())
      await set({ detail: false })
      await frames()
      expect(document.activeElement).toBe(document.body)
    })

    it('moves focus from the detail to the way back when the page narrows', async () => {
      const { set } = await draw({ detail: true, current: 'Bravo' })
      await focus(button('Reply'))
      await set({ width: NARROW })
      await vi.waitFor(() => expect(document.activeElement).toBe(back()))
    })

    it('moves focus from the way back to the current item when the page widens', async () => {
      const { set } = await draw({ width: NARROW, detail: true, current: 'Bravo' })
      await focus(back() as HTMLElement)
      await set({ width: WIDE })
      await vi.waitFor(() => expect(document.activeElement).toBe(button('Bravo')))
    })

    it('keeps focus on the list’s current item when the page narrows with nothing selected', async () => {
      const { set } = await draw({ current: 'Bravo' })
      await focus(button('Bravo'))
      await set({ width: NARROW })
      await vi.waitFor(() => expect(document.activeElement).toBe(button('Bravo')))
    })
  })
}
