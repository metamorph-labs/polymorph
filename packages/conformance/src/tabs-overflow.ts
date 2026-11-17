import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { SCROLLBARS_ARE_HIDDEN } from './engines'
import type { MountAdapter } from './run'

/**
 * The law for a Tabs strip wider than its container
 * (`design/components/tabs.md`, Overflow), which each generated shell's
 * `tabs.test` calls with its own adapter. The contract grammar has no
 * statement for a scroll position (`docs/conformance.md`), so the law reads
 * real ones, from the states fixture entry that renders the strip in a box
 * narrower than a phone with the current tab past the box's end edge.
 *
 * The recipe does the scrolling, the edge fade and the room for the focus
 * ring, the same file in every shell. What a shell adds is the reveal: its
 * member brings the current tab inside the strip through the engine's
 * `revealInline`. So the law holds every shell to the same positions, and one
 * that left the reveal out fails it.
 *
 * The React shell is not run through it: a press selects on another event
 * there, and its rule is the motion engine's. `packages/react-ui/src/overlays/tabs.test.tsx`
 * holds the same claims for it.
 *
 * Every machine is given the document's direction, and writes it on the root
 * and the list as `dir`: the list's turns the strip, and the root's is the
 * one the recipe reads. So the right-to-left test renders the strip in a
 * document whose root element says `dir="rtl"`.
 */

const STATE = 'wider than its container — the strip scrolls and opens on the current tab'

/**
 * Whether the browser draws the edge fade: the recipe's own `@supports`
 * condition. Without it the recipe shows a thin scrollbar, and the tests that
 * read the fade are skipped.
 */
const FADES = CSS.supports('animation-timeline: scroll()')

export interface TabsOverflowLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

const box = (element: Element) => element.getBoundingClientRect()

/**
 * A press as the page receives it. The test driver's own click first scrolls
 * its target into view, which is the move under test.
 */
function press(element: HTMLElement) {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Kind = type.startsWith('pointer') ? PointerEvent : MouseEvent
    element.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, button: 0 }))
  }
}

/** The nearest ancestor that draws a box: an Angular member's host element draws none. */
function boxed(element: HTMLElement): HTMLElement {
  const parent = element.parentElement as HTMLElement
  return getComputedStyle(parent).display === 'contents' ? boxed(parent) : parent
}

const px = (value: string) => Number.parseFloat(value)

interface Strip {
  /** The element that carries the member's name. */
  member: HTMLElement
  list: HTMLElement
  tabs: HTMLElement[]
  /** The tab the fixture opens on. */
  current: HTMLElement
  /** The box the fixture renders the strip in. */
  container: HTMLElement
  /** The width of the edge fade. */
  fade: number
}

/** The furthest the list scrolls, in either writing direction. */
const range = (list: HTMLElement) => list.scrollWidth - list.clientWidth

/**
 * The list is at the end of its range. Within a pixel, because the range is
 * read from two rounded widths and the browser stops at the real one.
 */
function atEnd(list: HTMLElement) {
  expect(Math.abs(Math.abs(list.scrollLeft) - range(list))).toBeLessThanOrEqual(1)
}

/** The tab is inside the list, clear of both edge fades. */
function shown({ list, fade }: Strip, tab: HTMLElement) {
  expect(box(tab).left).toBeGreaterThanOrEqual(box(list).left + fade - 1)
  expect(box(tab).right).toBeLessThanOrEqual(box(list).right - fade + 1)
}

/**
 * The sliding rule shares its tab's inline extent, to the pixel, and ends at
 * its tab's block end: it is under the tab, on the strip's baseline.
 */
function aligned({ list }: Strip, tab: HTMLElement) {
  const rule = list.querySelector<HTMLElement>(':scope > :not([role="tab"])')
  expect(rule).not.toBeNull()
  expect(Math.round(box(rule as HTMLElement).left)).toBe(Math.round(box(tab).left))
  expect(Math.round(box(rule as HTMLElement).width)).toBe(Math.round(box(tab).width))
  expect(Math.round(box(rule as HTMLElement).bottom)).toBe(Math.round(box(tab).bottom))
}

/**
 * The two mask layers as the browser computes them, with the list's
 * scroll-driven animations applied. The left layer's fade is inside the list
 * when the layer's position is 0, and the right layer's when the layer is as
 * wide as the list. With no mask there is no fade.
 */
function fades(list: HTMLElement) {
  const style = getComputedStyle(list)
  if (style.maskImage === 'none') return { left: false, right: false }
  return {
    left: px(style.maskPosition.split(',')[0] ?? '') === 0,
    right: (style.maskSize.split(',')[1] ?? '').trim().startsWith('100%'),
  }
}

export function tabsOverflowLaw({ shell, adapter }: TabsOverflowLaw): void {
  describe(`${shell} Tabs — a strip wider than its container`, () => {
    beforeAll(installTestTheme)

    let spacer: HTMLElement | undefined

    afterEach(() => {
      spacer?.remove()
      spacer = undefined
      document.documentElement.removeAttribute('dir')
    })

    /**
     * Mounts the entry below a screen of other content, so a member that
     * scrolled the page to its strip would show in `window.scrollY`.
     */
    async function mount(): Promise<Strip> {
      spacer = document.createElement('div')
      spacer.style.height = '200vh'
      document.body.prepend(spacer)

      const { root } = await adapter.mount('Tabs', { state: STATE })
      const list = root.querySelector<HTMLElement>('[data-tabs-part="list"]') as HTMLElement
      const member = list.closest('[data-member="tabs"]') as HTMLElement
      const strip: Strip = {
        member,
        list,
        tabs: [...list.querySelectorAll<HTMLElement>('[data-tabs-part="tab"]')],
        current: list.querySelector<HTMLElement>('[data-state="active"]') as HTMLElement,
        container: boxed(member),
        fade: px(getComputedStyle(list).getPropertyValue('--pm-space-6')),
      }
      // The first placement: the current tab is past the end edge until it is made.
      await vi.waitFor(() => expect(list.scrollLeft).not.toBe(0))
      // The member's resize observer reports once when it starts, a frame after
      // the mount, and places the tab again. A test that scrolls waits it out.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return strip
    }

    it('scrolls inside its container, which stays as wide as it was', async () => {
      const { list, container } = await mount()
      expect(range(list)).toBeGreaterThan(0)
      expect(container.scrollWidth).toBe(container.clientWidth)
      expect(box(list).right).toBe(box(container).right)
    })

    it('opens with the current tab inside the strip, without scrolling the page', async () => {
      const strip = await mount()
      shown(strip, strip.current)
      expect(box(strip.list).top).toBeGreaterThan(window.innerHeight)
      expect(window.scrollY).toBe(0)
    })

    it('brings a pressed tab that the end edge cuts fully inside, as the motion setting says', async () => {
      const strip = await mount()
      const { list, tabs } = strip
      const cut = tabs.find(
        (tab) => box(tab).left < box(list).right && box(tab).right > box(list).right,
      )
      expect(cut, 'one tab straddles the end edge').toBeDefined()
      const scrollTo = vi.spyOn(list, 'scrollTo')

      press(cut as HTMLElement)
      await vi.waitFor(() => expect((cut as HTMLElement).dataset['state']).toBe('active'))
      await vi.waitFor(() => shown(strip, cut as HTMLElement))
      // The member's own move: a new value is travel, so it is smooth.
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    })

    it('scrolls a tab that takes focus into view', async () => {
      const { list, tabs, current } = await mount()
      current.focus()
      await userEvent.keyboard('{End}')
      await vi.waitFor(() => expect(document.activeElement).toBe(tabs.at(-1)))
      await vi.waitFor(() => atEnd(list))

      await userEvent.keyboard('{Home}')
      await vi.waitFor(() => expect(document.activeElement).toBe(tabs[0]))
      await vi.waitFor(() => expect(list.scrollLeft).toBe(0))
    })

    it('keeps the indicator under its tab wherever the strip is scrolled', async () => {
      const strip = await mount()
      for (const position of [0, 60, range(strip.list)]) {
        strip.list.scrollLeft = position
        await vi.waitFor(() => aligned(strip, strip.current))
      }
    })

    it.skipIf(SCROLLBARS_ARE_HIDDEN)(
      'shows a thin scrollbar where there is no fade, and none where the fade replaces it',
      async () => {
        const { list } = await mount()
        expect(getComputedStyle(list).scrollbarWidth).toBe(FADES ? 'none' : 'thin')
      },
    )

    it.skipIf(!FADES)('fades only an edge with more tabs beyond it', async () => {
      const { list } = await mount()
      await vi.waitFor(() => expect(fades(list)).toEqual({ left: true, right: true }))

      list.scrollLeft = 0
      await vi.waitFor(() => expect(fades(list)).toEqual({ left: false, right: true }))

      list.scrollLeft = range(list)
      await vi.waitFor(() => expect(fades(list)).toEqual({ left: true, right: false }))
    })

    it.skipIf(!FADES)(
      'follows a new value right to left, with the fades on the other sides',
      async () => {
        document.documentElement.setAttribute('dir', 'rtl')
        const strip = await mount()
        const { member, list, tabs } = strip
        expect(member.getAttribute('dir')).toBe('rtl')
        // A right-to-left list starts at its right edge, so the tabs beyond it are to the left.
        list.scrollLeft = 0
        await vi.waitFor(() => expect(fades(list)).toEqual({ left: true, right: false }))

        // The last tab is the furthest left, at the end of a range that runs into negative positions.
        const last = tabs.at(-1) as HTMLElement
        press(last)
        await vi.waitFor(() => {
          expect(list.scrollLeft).toBeLessThan(0)
          atEnd(list)
        })
        await vi.waitFor(() => aligned(strip, last))
        expect(fades(list)).toEqual({ left: false, right: true })
      },
    )
  })
}
