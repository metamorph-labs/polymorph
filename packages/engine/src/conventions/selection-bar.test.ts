import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  followSelectionBar,
  placeSelectionBar,
  placeTokenList,
  visibleViewport,
  type ViewportBox,
} from './selection-bar'

/**
 * Where a bar at a selection and a list at a token go, against the window the
 * test runs in. A coarse pointer is a stub of `matchMedia`, and a virtual
 * keyboard a stub of `visualViewport` that is shorter than the window, because
 * no engine here has a touch screen or a keyboard to open.
 */

const EDGE = 8
const GAP = 4

/** A bar as the recipe draws it: fixed at the corner the placement writes, from 0, its edge named. */
function bar(width = 200, height = 40): HTMLElement {
  const element = document.createElement('div')
  element.style.cssText = [
    'position: fixed',
    '--pm-selection-bar-x: 0px',
    '--pm-selection-bar-y: 0px',
    'top: var(--pm-selection-bar-y)',
    'left: var(--pm-selection-bar-x)',
    `width: ${width}px`,
    `height: ${height}px`,
    `--pm-selection-bar-edge: ${EDGE}px`,
  ].join(';')
  document.body.append(element)
  return element
}

const box = (top: number, bottom: number, left = 100, right = 160): ViewportBox => ({
  top,
  bottom,
  left,
  right,
})

const height = () => document.documentElement.clientHeight
const width = () => document.documentElement.clientWidth

/** The pointer is coarse, as on a touch screen. */
function coarse() {
  const real = window.matchMedia.bind(window)
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    query === '(pointer: coarse)'
      ? ({ ...real(query), matches: true } as MediaQueryList)
      : real(query),
  )
}

/** The part of the window a person sees is `seen` tall, as with a virtual keyboard open. */
function keyboardOpen(seen: number): void {
  const fake = Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    width: width(),
    height: seen,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
  })
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake })
}

const realViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')

afterEach(() => {
  vi.restoreAllMocks()
  if (realViewport === undefined) delete (window as { visualViewport?: unknown }).visualViewport
  else Object.defineProperty(window, 'visualViewport', realViewport)
  document.body.replaceChildren()
})

describe('the selection bar', () => {
  it('sits centred above the selection, inside the window', () => {
    const element = bar()
    placeSelectionBar(element, box(300, 320, 10, 30))
    const at = element.getBoundingClientRect()
    expect(element.dataset['side']).toBe('top')
    expect(at.bottom).toBe(300 - EDGE)
    expect(at.left).toBe(EDGE)
  })

  it('goes below with no room above, and to the selection’s visible top when neither side has room', () => {
    const element = bar()
    placeSelectionBar(element, box(20, 60))
    expect(element.dataset['side']).toBe('bottom')
    expect(element.getBoundingClientRect().top).toBe(60 + EDGE)
    // A selection taller than the window.
    placeSelectionBar(element, box(-500, height() + 500))
    const at = element.getBoundingClientRect()
    expect(at.top).toBe(EDGE)
    expect(at.bottom).toBeLessThanOrEqual(height() - EDGE)
  })

  it('goes below on a coarse pointer, above when there is no room below, and never past the bottom', () => {
    coarse()
    const element = bar()
    placeSelectionBar(element, box(200, 220))
    expect(element.dataset['side']).toBe('bottom')
    placeSelectionBar(element, box(300, height() - 10))
    expect(element.dataset['side']).toBe('top')
    expect(element.getBoundingClientRect().bottom).toBe(300 - EDGE)
    placeSelectionBar(element, box(-500, height() + 500))
    const at = element.getBoundingClientRect()
    expect(at.bottom).toBe(height() - EDGE)
    expect(at.top).toBeGreaterThanOrEqual(EDGE)
  })

  it('stays inside the part of the window a person sees, and is as wide as that allows', () => {
    keyboardOpen(400)
    expect(visibleViewport(window).bottom).toBe(400)
    const element = bar()
    placeSelectionBar(element, box(380, 600))
    expect(element.getBoundingClientRect().bottom).toBeLessThanOrEqual(400 - EDGE)
    expect(element.style.getPropertyValue('--pm-selection-bar-room')).toBe(
      `${width() - EDGE * 2}px`,
    )
  })

  it('hides itself while the selection is outside the element it is given, and comes back', () => {
    const scroller = document.createElement('div')
    scroller.style.cssText =
      'position: absolute; top: 100px; left: 0; width: 300px; height: 100px; overflow: hidden'
    document.body.append(scroller)
    const element = bar()
    placeSelectionBar(element, box(250, 270), scroller)
    expect(element.hasAttribute('data-outside')).toBe(true)
    placeSelectionBar(element, box(150, 170), scroller)
    expect(element.hasAttribute('data-outside')).toBe(false)
    // A selection that runs out of the box is placed at the part it shows.
    placeSelectionBar(element, box(150, 900), scroller)
    expect(element.getBoundingClientRect().top).toBeLessThan(200)
  })

  it('follows the visual viewport as it moves and resizes', () => {
    const fake = new EventTarget()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => Object.assign(fake, { offsetLeft: 0, offsetTop: 0, width: width(), height: 400 }),
    })
    const place = vi.fn()
    const stop = followSelectionBar(bar(), place)
    fake.dispatchEvent(new Event('resize'))
    fake.dispatchEvent(new Event('scroll'))
    expect(place).toHaveBeenCalledTimes(2)
    stop()
    fake.dispatchEvent(new Event('resize'))
    expect(place).toHaveBeenCalledTimes(2)
  })
})

describe('the list at a token', () => {
  /** A field's root, with a list in it drawn as the recipe draws it. */
  function field(): { root: HTMLElement; panel: HTMLElement } {
    const root = document.createElement('div')
    root.style.cssText = 'position: absolute; top: 40px; left: 20px; width: 500px; height: 80px'
    const panel = document.createElement('div')
    panel.style.cssText = [
      'position: fixed',
      '--pm-rich-text-input-x: 0px',
      '--pm-rich-text-input-y: 0px',
      'top: var(--pm-rich-text-input-y)',
      'left: var(--pm-rich-text-input-x)',
      'width: min(var(--pm-rich-text-input-field), 300px)',
      'height: 160px',
      'max-height: var(--pm-rich-text-input-room, none)',
      `--pm-rich-text-input-gap: ${GAP}px`,
    ].join(';')
    root.append(panel)
    document.body.append(root)
    return { root, panel }
  }

  it('sits under the token’s line at the token’s start, kept inside the field', () => {
    const { root, panel } = field()
    placeTokenList(panel, root, box(60, 80, 100, 110))
    const at = panel.getBoundingClientRect()
    expect(panel.dataset['placement']).toBe('below')
    expect(at.top).toBe(80 + GAP)
    expect(at.left).toBe(100)
    placeTokenList(panel, root, box(60, 80, 400, 410))
    expect(panel.getBoundingClientRect().right).toBe(520)
  })

  it('goes above the token when a keyboard leaves less room below it', () => {
    keyboardOpen(300)
    const { root, panel } = field()
    placeTokenList(panel, root, box(240, 260, 100, 110))
    const at = panel.getBoundingClientRect()
    expect(panel.dataset['placement']).toBe('above')
    expect(at.bottom).toBe(240 - GAP)
    expect(at.top).toBeGreaterThanOrEqual(0)
  })

  it('is no taller than the room on its side', () => {
    keyboardOpen(200)
    const { root, panel } = field()
    placeTokenList(panel, root, box(90, 110, 100, 110))
    const at = panel.getBoundingClientRect()
    expect(at.top).toBeGreaterThanOrEqual(0)
    expect(at.bottom).toBeLessThanOrEqual(200)
  })
})
