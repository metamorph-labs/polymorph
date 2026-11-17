import { getAllByRole, getByRole, queryByRole } from '@testing-library/dom'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { MountAdapter } from './run'

/**
 * The law for AppShell's navigation on top (`design/archetypes/app-shell.md`,
 * Navigation on top), which every web shell's AppShell test calls with its
 * own adapter. A contract statement reads attributes, names and handlers, and
 * not a box (`docs/conformance.md`), so the law reads where the parts are
 * drawn, from the two states fixture entries with `navigation="top"`.
 *
 * The recipe lays the row out, the same file in every shell. What a shell
 * adds is the attribute the recipe keys on and the collapse it does not draw.
 * A shell that left either out fails here.
 *
 * The window is set for each test, because the row exists from the drawer
 * breakpoint (48rem) up and the drawer below it.
 */

const ROW = 'navigation on top — the rail’s items lead the topbar'
const GROUPED = 'navigation on top, grouped — a rule between the groups'

/** Above the drawer breakpoint, and below it. */
const WIDE = 1280
const NARROW = 600

export interface AppShellTopLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

const box = (element: Element) => element.getBoundingClientRect()

interface Frame {
  root: HTMLElement
  nav: HTMLElement
  bar: HTMLElement
  /** The nav's own items, in document order. */
  items: HTMLElement[]
}

export function appShellTopLaw({ shell, adapter }: AppShellTopLaw): void {
  describe(`${shell} AppShell — the navigation on top`, () => {
    beforeAll(installTestTheme)

    let unmount: (() => void) | undefined

    beforeEach(async () => {
      await page.viewport(WIDE, 800)
    })

    afterEach(async () => {
      unmount?.()
      unmount = undefined
      await page.viewport(WIDE, 800)
    })

    async function draw(state: string): Promise<Frame> {
      const mounted = await adapter.mount('AppShell', { state })
      unmount = mounted.unmount
      const root = mounted.root.querySelector<HTMLElement>('[data-member="app-shell"]')
      expect(root, 'the entry draws an AppShell').not.toBeNull()
      const frame = root as HTMLElement
      const nav = getByRole(frame, 'navigation', { name: 'Primary' })
      return {
        root: frame,
        nav,
        bar: frame.querySelector('header') as HTMLElement,
        items: [...nav.querySelectorAll<HTMLElement>('a[href], button')].filter(
          (item) => box(item).width > 0,
        ),
      }
    }

    it('lays the navigation at the start of the top row, and the topbar continues it', async () => {
      const { root, nav, bar, items } = await draw(ROW)
      expect(root.dataset['navigation']).toBe('top')

      // One landmark, before the topbar in the document, as in the rail layout.
      expect(getAllByRole(root, 'navigation')).toHaveLength(1)
      expect(nav.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      expect(box(nav).top).toBeCloseTo(box(bar).top, 0)
      expect(box(nav).bottom).toBeCloseTo(box(bar).bottom, 0)
      expect(box(nav).right).toBeLessThanOrEqual(box(bar).left + 1)

      expect(items).toHaveLength(3)
      for (const item of items)
        expect(box(item).top).toBeCloseTo(box(items[0] as HTMLElement).top, 0)
      expect(items[0]?.getAttribute('aria-current')).toBe('page')

      const main = getByRole(root, 'main')
      expect(box(main).left).toBeCloseTo(box(root).left, 0)
      expect(box(main).width).toBeCloseTo(box(root).width, 0)
    })

    it('draws no collapse toggle, because a row has no rail to narrow', async () => {
      const { root, items } = await draw(ROW)
      expect(root.hasAttribute('data-collapsed')).toBe(false)
      expect(queryByRole(root, 'button', { name: /sidebar/ })).toBeNull()
      for (const item of items) expect(box(item).width).toBeGreaterThan(box(item).height)
    })

    it('flattens each group into the row, with a rule between groups, and keeps its name', async () => {
      const { root, items } = await draw(GROUPED)
      const platform = getByRole(root, 'group', { name: 'Platform' })
      const workspace = getByRole(root, 'group', { name: 'Workspace' })

      // The overline is removed, as in the collapsed rail, and the rule draws the boundary.
      const overline = platform.firstElementChild as HTMLElement
      expect(overline.textContent).toBe('Platform')
      expect(getComputedStyle(overline).display).toBe('none')
      expect(getComputedStyle(workspace).borderInlineStartWidth).toBe('1px')
      expect(getComputedStyle(platform).borderInlineStartWidth).toBe('0px')

      expect(items).toHaveLength(5)
      for (const item of items)
        expect(box(item).top).toBeCloseTo(box(items[0] as HTMLElement).top, 0)
    })

    it('is the drawer the rail becomes below the breakpoint', async () => {
      const { root, nav } = await draw(ROW)
      await page.viewport(NARROW, 800)

      await vi.waitFor(() => expect(getComputedStyle(nav).position).toBe('fixed'))
      await vi.waitFor(() => expect(getComputedStyle(nav).visibility).toBe('hidden'))

      await userEvent.click(
        await vi.waitFor(() => getByRole(root, 'button', { name: 'Open navigation' })),
      )
      await vi.waitFor(() => expect(root.hasAttribute('data-drawer')).toBe(true))
      await vi.waitFor(() => expect(document.activeElement).toBe(nav))

      // Down the drawer, as in the rail.
      const [first, second] = [...nav.querySelectorAll<HTMLElement>('a[href], button')].filter(
        (item) => box(item).width > 0,
      )
      expect(box(second as HTMLElement).top).toBeGreaterThan(box(first as HTMLElement).top)
      expect(box(second as HTMLElement).left).toBeCloseTo(box(first as HTMLElement).left, 0)
    })
  })
}
