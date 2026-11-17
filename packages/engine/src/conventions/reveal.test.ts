import { cdp } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '../testing'
import { revealInline } from './reveal'

/**
 * `revealInline`, which every framework's Tabs calls to bring the current tab
 * inside a strip that scrolls. The list here is plain DOM with the three
 * things the helper reads: a positioned scroll container, items in a row, and
 * a `scroll-padding`.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-motion')
})

const ITEM = 100
const PORT = 250
const PADDING = 20

/** A 250px list of ten 100px items, below a screen of other content. */
function strip({ dir = 'ltr', count = 10 }: { dir?: 'ltr' | 'rtl'; count?: number } = {}) {
  const spacer = document.createElement('div')
  spacer.style.height = '200vh'
  const list = document.createElement('div')
  list.dir = dir
  list.style.cssText = `position: relative; display: flex; width: ${PORT}px; overflow: auto hidden; scroll-padding-inline: ${PADDING}px`
  const items = Array.from({ length: count }, (_, index) => {
    const item = document.createElement('button')
    item.textContent = String(index + 1)
    item.style.cssText = `flex: none; width: ${ITEM}px; padding: 0; border: 0`
    return item
  })
  list.append(...items)
  document.body.append(spacer, list)
  return { list, items }
}

const box = (element: Element) => element.getBoundingClientRect()

/**
 * Chromium's DevTools session, which the Playwright provider hands a test; its
 * type comes with the provider's Node types, which this package does not load.
 */
const devtools = () =>
  cdp() as unknown as { send(method: string, params: Record<string, unknown>): Promise<unknown> }

/*
 * Playwright opens a DevTools session only in Chromium, so the test that turns
 * on reduced motion through one skips on the other engines. The limit is named
 * for the vocabulary packages in `packages/conformance/src/engines.ts`, which
 * this package cannot import.
 */
declare const __PM_ENGINE__: string
const NO_MEDIA_EMULATION = __PM_ENGINE__ !== 'chromium'

describe('revealInline brings an item inside its list', () => {
  it('scrolls the list to an item past the end edge, clear of the scroll padding', () => {
    const { list, items } = strip()
    const item = items[6] as HTMLElement
    revealInline(list, item, true)
    expect(list.scrollLeft).toBe(7 * ITEM + PADDING - PORT)
    expect(box(item).right).toBe(box(list).right - PADDING)
  })

  it('scrolls back to an item before the start edge', () => {
    const { list, items } = strip()
    list.scrollLeft = 600
    const item = items[2] as HTMLElement
    revealInline(list, item, true)
    expect(list.scrollLeft).toBe(2 * ITEM - PADDING)
    expect(box(item).left).toBe(box(list).left + PADDING)
  })

  it('leaves the list where it is when the item is already inside', () => {
    const { list, items } = strip()
    list.scrollLeft = 300
    const scrollTo = vi.spyOn(list, 'scrollTo')
    // The fifth item spans 400 to 500, and the padded view 320 to 530.
    revealInline(list, items[4], true)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(list.scrollLeft).toBe(300)
  })

  it('stops at the ends of the scroll range, where the padding cannot be kept', () => {
    const { list, items } = strip()
    list.scrollLeft = 300
    revealInline(list, items[0], true)
    expect(list.scrollLeft).toBe(0)
    revealInline(list, items[9], true)
    expect(list.scrollLeft).toBe(10 * ITEM - PORT)
  })

  it('shows the inline-start edge of an item wider than the list', () => {
    const { list, items } = strip()
    const wide = items[3] as HTMLElement
    wide.style.width = '400px'
    revealInline(list, wide, true)
    expect(box(wide).left).toBe(box(list).left + PADDING)
  })

  it('moves the list and never the page', () => {
    const { list, items } = strip()
    expect(box(list).top).toBeGreaterThan(window.innerHeight)
    revealInline(list, items[8], true)
    expect(list.scrollLeft).toBeGreaterThan(0)
    expect(window.scrollY).toBe(0)
  })

  it('does nothing in a list with nothing to scroll', () => {
    const { list, items } = strip({ count: 2 })
    const scrollTo = vi.spyOn(list, 'scrollTo')
    revealInline(list, items[1], true)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('does nothing without a list or an item', () => {
    const { list } = strip()
    expect(() => {
      revealInline(null, null)
      revealInline(list, undefined)
    }).not.toThrow()
    expect(list.scrollLeft).toBe(0)
  })
})

describe('revealInline right to left', () => {
  it('scrolls towards the left for an item past the end edge', () => {
    const { list, items } = strip({ dir: 'rtl' })
    const item = items[6] as HTMLElement
    revealInline(list, item, true)
    // A right-to-left list scrolls from 0 into negative positions.
    expect(list.scrollLeft).toBe(-(7 * ITEM + PADDING - PORT))
    expect(box(item).left).toBe(box(list).left + PADDING)
  })

  it('scrolls back towards the right for an item before the start edge', () => {
    const { list, items } = strip({ dir: 'rtl' })
    list.scrollLeft = -600
    const item = items[2] as HTMLElement
    revealInline(list, item, true)
    expect(box(item).right).toBe(box(list).right - PADDING)
  })

  it('shows the right edge of an item wider than the list', () => {
    const { list, items } = strip({ dir: 'rtl' })
    const wide = items[3] as HTMLElement
    wide.style.width = '400px'
    revealInline(list, wide, true)
    expect(box(wide).right).toBe(box(list).right - PADDING)
  })
})

describe('revealInline takes its motion from the system', () => {
  /** The `behavior` the helper scrolls with, for a move that is not `instant`. */
  function behaviour(): ScrollBehavior | undefined {
    const { list, items } = strip()
    const scrollTo = vi.spyOn(list, 'scrollTo')
    revealInline(list, items[8])
    // `scrollTo` is overloaded, and the mock is typed by its coordinate form.
    const options = scrollTo.mock.calls[0]?.[0] as ScrollToOptions | number | undefined
    return typeof options === 'object' ? options.behavior : undefined
  }

  it('is smooth while the surface duration is above zero', () => {
    expect(behaviour()).toBe('smooth')
  })

  it('is instant when the caller says the move is layout', () => {
    const { list, items } = strip()
    const scrollTo = vi.spyOn(list, 'scrollTo')
    revealInline(list, items[8], true)
    expect(scrollTo).toHaveBeenCalledWith({ left: 9 * ITEM + PADDING - PORT, behavior: 'instant' })
  })

  it('is instant at `none`, where the tokens are 0ms', () => {
    document.documentElement.setAttribute('data-motion', 'none')
    expect(behaviour()).toBe('instant')
  })

  // The first DevTools call opens the session. This project has no setup hook
  // to wait out the start of a full run, when the provider can take longer
  // than the default test timeout to answer, so the test carries the budget
  // the other projects give their setup hooks.
  it.skipIf(NO_MEDIA_EMULATION)(
    'is instant under reduced motion, at any temperament',
    async () => {
      await devtools().send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      try {
        expect(behaviour()).toBe('instant')
      } finally {
        await devtools().send('Emulation.setEmulatedMedia', { features: [] })
      }
    },
    120_000,
  )

  it('is instant without a theme, as the motion engine is still without one', () => {
    for (const sheet of document.querySelectorAll('style')) sheet.disabled = true
    try {
      expect(behaviour()).toBe('instant')
    } finally {
      for (const sheet of document.querySelectorAll('style')) sheet.disabled = false
    }
  })
})
