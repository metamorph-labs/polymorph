import { page } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { MountAdapter } from './run'

/**
 * The law for DetailPage's aside that stays in view
 * (`design/archetypes/detail-page.md`, The aside that stays in view), which
 * every web shell's DetailPage test calls with its own adapter. A contract
 * statement reads attributes, names and handlers, and not a box
 * (`docs/conformance.md`), so the law reads where the aside is drawn as the
 * page scrolls, from the states fixture entry with `stickyAside`.
 *
 * The recipe keeps the aside in view, the same file in every shell. What a
 * shell adds is the attribute the recipe keys on, and only while there is an
 * aside and the prop holds. A shell that left it out, or set it by default,
 * fails here.
 *
 * The entry is mounted in the document, so the window is the box that
 * scrolls, and the window is set for each test: the aside is beside the main
 * column on a page of 44rem and wider, and under it below that.
 */

const STICKY = 'an aside that stays in view — a table of contents beside a long body'
const PLAIN = 'no tabs — one body'

/** A window where the page has two columns, one where it has one, and a short one. */
const WIDE = 1280
const NARROW = 600
const TALL = 600
const SHORT = 360

export interface DetailPageAsideLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

const box = (element: Element) => element.getBoundingClientRect()

interface Drawn {
  root: HTMLElement
  main: HTMLElement
  aside: HTMLElement
  /** The page's own top inset, `--pm-page-padding-y`, which the aside stops at. */
  inset: number
}

export function detailPageAsideLaw({ shell, adapter }: DetailPageAsideLaw): void {
  describe(`${shell} DetailPage — the aside that stays in view`, () => {
    beforeAll(installTestTheme)

    let unmount: (() => void) | undefined

    afterEach(async () => {
      unmount?.()
      unmount = undefined
      window.scrollTo(0, 0)
      await page.viewport(WIDE, TALL)
    })

    async function draw(state: string, width: number, height: number): Promise<Drawn> {
      await page.viewport(width, height)
      const mounted = await adapter.mount('DetailPage', { state })
      unmount = mounted.unmount
      const root = mounted.root.querySelector<HTMLElement>('[data-member="detail-page"]')
      expect(root, 'the entry draws a DetailPage').not.toBeNull()
      const body = (root as HTMLElement).querySelector<HTMLElement>('[data-aside]')
      expect(body, 'the entry has an aside').not.toBeNull()
      const [main, aside] = [...(body as HTMLElement).children] as HTMLElement[]
      return {
        root: root as HTMLElement,
        main: main as HTMLElement,
        aside: aside as HTMLElement,
        inset: Number.parseFloat(getComputedStyle(root as HTMLElement).paddingTop),
      }
    }

    /** Scrolls the window by `by` and resolves once the main column has moved with it. */
    async function scrollBy(main: HTMLElement, by: number): Promise<void> {
      const before = box(main).top
      window.scrollTo(0, window.scrollY + by)
      await vi.waitFor(() => expect(box(main).top).toBeCloseTo(before - by, 0))
    }

    it('keeps the aside beside the main column, the page’s inset below the window’s top, as the page scrolls', async () => {
      const { main, aside, inset } = await draw(STICKY, WIDE, TALL)
      expect(inset).toBeGreaterThan(0)
      const rest = box(aside).top
      expect(box(aside).left).toBeGreaterThanOrEqual(box(main).right)

      await scrollBy(main, 400)
      await vi.waitFor(() => expect(box(aside).top).toBeCloseTo(inset, 0))
      expect(box(aside).top).toBeGreaterThan(rest - 400)
      expect(box(aside).bottom).toBeLessThanOrEqual(window.innerHeight)
      expect(box(aside).left).toBeGreaterThanOrEqual(box(main).right)

      // Back at the top, it is where it rests.
      await scrollBy(main, -400)
      expect(box(aside).top).toBeCloseTo(rest, 0)
    })

    it('is never taller than the window, and scrolls inside itself to reach the rest', async () => {
      const { main, aside, inset } = await draw(STICKY, WIDE, SHORT)
      await scrollBy(main, 300)
      await vi.waitFor(() => expect(box(aside).top).toBeCloseTo(inset, 0))

      expect(box(aside).height).toBeLessThanOrEqual(window.innerHeight - inset * 2 + 1)
      expect(aside.scrollHeight).toBeGreaterThan(aside.clientHeight)

      // The last link is reached by Tab, which scrolls the aside to show it.
      const links = [...aside.querySelectorAll<HTMLAnchorElement>('a[href]')]
      const last = links[links.length - 1] as HTMLAnchorElement
      expect(box(last).bottom).toBeGreaterThan(box(aside).bottom)
      last.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(last))
      await vi.waitFor(() => expect(box(last).bottom).toBeLessThanOrEqual(box(aside).bottom + 1))
      expect(box(last).top).toBeGreaterThanOrEqual(box(aside).top - 1)
      expect(box(aside).bottom).toBeLessThanOrEqual(window.innerHeight)
    })

    it('scrolls with the page at its full height where the aside is under the main column', async () => {
      const { main, aside } = await draw(STICKY, NARROW, TALL)
      expect(box(aside).top).toBeGreaterThanOrEqual(box(main).bottom)
      expect(getComputedStyle(aside).position).toBe('static')
      expect(aside.scrollHeight).toBeLessThanOrEqual(aside.clientHeight)

      const rest = box(aside).top
      await scrollBy(main, 300)
      expect(box(aside).top).toBeCloseTo(rest - 300, 0)
    })

    it('leaves an aside without the prop to scroll with the page', async () => {
      const { root, aside } = await draw(PLAIN, WIDE, TALL)
      const body = aside.parentElement as HTMLElement
      expect(body.hasAttribute('data-sticky-aside')).toBe(false)
      expect(getComputedStyle(aside).position).toBe('static')
      expect(root.querySelector('[data-sticky-aside]')).toBeNull()
    })
  })
}
