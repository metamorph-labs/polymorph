import { userEvent } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nameTip } from './name-tip'
import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from './tooltip'

/**
 * The name tip (`design/components/button.md`): an icon-only Button's label on
 * hover and keyboard focus. These tests run it on plain buttons with a class
 * that does what the Button's recipe does for it: a fixed box with no popover
 * inset or margin, and the gap as a margin on the edge that faces the button.
 * Each member's own tests run it with the recipe itself.
 */

const STYLE = `
  .tip { position: fixed; inset: auto; margin: 0; padding: 4px 8px; border: 0; pointer-events: none }
  .tip[data-side='top'] { margin-bottom: 8px }
  .tip[data-side='bottom'] { margin-top: 8px }
`

const GAP = 8

let releases: (() => void)[] = []
let rest: HTMLElement

const bubble = () => document.querySelector<HTMLElement>('.tip')

/** A plain button standing for an icon-only Button, with a name tip. */
function tipped(label: string, place = 'left: 200px; top: 200px') {
  const button = document.createElement('button')
  button.setAttribute('aria-label', label)
  button.style.cssText = `position: fixed; ${place}; width: 32px; height: 32px`
  document.body.append(button)
  releases.push(nameTip(button, label, 'tip'))
  return button
}

/** Moves the real pointer to the window's bottom-left corner, where nothing has a tip. */
async function restPointer() {
  await userEvent.hover(rest)
}

/** Runs the hover delay on a fake clock, so what is measured is the timer, not the suite's load. */
async function hoverAndWait(button: HTMLElement) {
  await userEvent.hover(button)
  await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
}

beforeEach(async () => {
  const style = document.createElement('style')
  style.textContent = STYLE
  rest = document.createElement('div')
  rest.style.cssText = 'position: fixed; left: 0; bottom: 0; width: 8px; height: 8px'
  document.body.append(style, rest)
  await restPointer()
})

afterEach(async () => {
  vi.useRealTimers()
  for (const release of releases) release()
  releases = []
  await restPointer()
  document.documentElement.removeAttribute('dir')
  document.body.replaceChildren()
})

describe('before first use', () => {
  it('makes no element until a tip opens', () => {
    tipped('Archive')
    tipped('Delete', 'left: 260px; top: 200px')
    expect(document.querySelectorAll('[popover]')).toHaveLength(0)
  })

  it('gives nothing without a control or a label', () => {
    expect(nameTip(null, 'Archive', 'tip')).toBeTypeOf('function')
    const button = document.createElement('button')
    document.body.append(button)
    const release = nameTip(button, undefined, 'tip')
    button.focus()
    release()
    expect(bubble()).toBeNull()
  })
})

describe('hover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  it('opens after the delay with the label, for the eye only', async () => {
    const button = tipped('Archive')
    await userEvent.hover(button)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS - 1)
    expect(bubble()).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    const tip = bubble()
    expect(tip?.textContent).toBe('Archive')
    // The name stays the button's own, and nothing describes it twice.
    expect(tip?.getAttribute('aria-hidden')).toBe('true')
    expect(tip?.hasAttribute('role')).toBe(false)
    expect(button.hasAttribute('aria-describedby')).toBe(false)
    // In the top layer, so it is drawn over any overlay the button sits in.
    expect(tip?.matches(':popover-open')).toBe(true)
  })

  it('opens the next tip at once while one shows, and within the skip delay after one closes', async () => {
    const one = tipped('Archive')
    const two = tipped('Delete', 'left: 236px; top: 200px')
    const far = tipped('Share', 'left: 600px; top: 400px')
    await hoverAndWait(one)
    const first = bubble()
    await userEvent.hover(two)
    expect(bubble()?.textContent).toBe('Delete')
    // One bubble for the page, which the next tip takes over.
    expect(bubble()).toBe(first)

    await restPointer()
    expect(bubble()).toBeNull()
    await vi.advanceTimersByTimeAsync(TOOLTIP_SKIP_DELAY_MS - 50)
    await userEvent.hover(far)
    expect(bubble()?.textContent).toBe('Share')

    await restPointer()
    await vi.advanceTimersByTimeAsync(TOOLTIP_SKIP_DELAY_MS)
    await userEvent.hover(one)
    expect(bubble()).toBeNull()
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
    expect(bubble()?.textContent).toBe('Archive')
  })

  it('does not open for touch or pen contact', async () => {
    const button = tipped('Archive')
    for (const pointerType of ['touch', 'pen']) {
      button.dispatchEvent(new PointerEvent('pointerenter', { pointerType }))
      await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
      expect(bubble()).toBeNull()
    }
  })

  it('closes when the pointer leaves the button, the bubble and the gap between them', async () => {
    const button = tipped('Archive')
    await hoverAndWait(button)
    const tip = bubble() as HTMLElement
    // The pointer crosses the gap and rests on the bubble (WCAG 1.4.13), which takes no click.
    const box = tip.getBoundingClientRect()
    const target = document.createElement('div')
    target.style.cssText = `position: fixed; left: ${box.left}px; top: ${box.bottom}px; width: ${box.width}px; height: ${GAP}px`
    document.body.append(target)
    await userEvent.hover(target)
    expect(bubble()).not.toBeNull()
    await userEvent.hover(tip, { force: true })
    expect(bubble()).not.toBeNull()
    expect(getComputedStyle(tip).pointerEvents).toBe('none')
    await restPointer()
    expect(bubble()).toBeNull()
  })

  it('cancels a pending tip when the pointer leaves before the delay', async () => {
    const button = tipped('Archive')
    await userEvent.hover(button)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS / 2)
    await restPointer()
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS)
    expect(bubble()).toBeNull()
  })

  it('closes on a press and does not open again until the pointer comes back', async () => {
    const button = tipped('Archive')
    await hoverAndWait(button)
    await userEvent.click(button)
    expect(bubble()).toBeNull()
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS * 2)
    expect(bubble()).toBeNull()
  })

  it('does not open after the delay when the button is pressed first', async () => {
    const button = tipped('Archive')
    await userEvent.hover(button)
    await userEvent.click(button)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS * 2)
    expect(bubble()).toBeNull()
  })
})

describe('keyboard focus', () => {
  it('opens when focus arrives from the keyboard, and closes on blur', async () => {
    const before = document.createElement('button')
    before.textContent = 'Before'
    document.body.append(before)
    before.focus()
    const button = tipped('Archive')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(button)
    await vi.waitFor(() => expect(bubble()?.textContent).toBe('Archive'))
    // Held by focus, the tip stays while the pointer moves elsewhere.
    await userEvent.hover(before)
    expect(bubble()).not.toBeNull()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(bubble()).toBeNull()
  })

  it('does not open for focus a script gives after a pointer press', async () => {
    const elsewhere = document.createElement('button')
    elsewhere.textContent = 'Elsewhere'
    elsewhere.style.cssText = 'position: fixed; left: 400px; top: 400px'
    document.body.append(elsewhere)
    const button = tipped('Archive')
    // A dialog closed by a press returns focus to the button that opened it.
    await userEvent.click(elsewhere)
    button.focus()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(bubble()).toBeNull()
  })

  it('closes when the button is pressed from the keyboard', async () => {
    const button = tipped('Archive')
    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() => expect(bubble()).not.toBeNull())
    expect(document.activeElement).toBe(button)
    await userEvent.keyboard('{Enter}')
    expect(bubble()).toBeNull()
  })
})

describe('Escape', () => {
  it('closes a tip the pointer opened and reaches nothing else, so a Dialog around it stays open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const heard = vi.fn()
    await hoverAndWait(tipped('Archive'))
    expect(bubble()).not.toBeNull()
    document.addEventListener('keydown', heard, { capture: true })
    try {
      await userEvent.keyboard('{Escape}')
      expect(bubble()).toBeNull()
      expect(heard).not.toHaveBeenCalled()
      // Once the tip is closed, the key reaches the page again.
      await userEvent.keyboard('{Escape}')
      expect(heard).toHaveBeenCalledOnce()
    } finally {
      document.removeEventListener('keydown', heard, { capture: true })
    }
  })

  it('closes a tip focus opened and reaches the page, so a Dialog that focused the button closes', async () => {
    const heard = vi.fn()
    tipped('Close')
    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() => expect(bubble()).not.toBeNull())
    document.addEventListener('keydown', heard, { capture: true })
    try {
      await userEvent.keyboard('{Escape}')
      expect(bubble()).toBeNull()
      expect(heard).toHaveBeenCalledOnce()
    } finally {
      document.removeEventListener('keydown', heard, { capture: true })
    }
  })
})

describe('closing for other reasons', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  it('closes when something that holds the button scrolls', async () => {
    const box = document.createElement('div')
    box.style.cssText =
      'position: fixed; left: 100px; top: 100px; width: 200px; height: 200px; overflow: auto'
    const tall = document.createElement('div')
    tall.style.height = '600px'
    const button = document.createElement('button')
    button.style.cssText = 'width: 32px; height: 32px; margin: 60px'
    tall.append(button)
    box.append(tall)
    document.body.append(box)
    releases.push(nameTip(button, 'Archive', 'tip'))
    await hoverAndWait(button)
    expect(bubble()).not.toBeNull()
    box.scrollTop = 20
    await vi.waitFor(() => expect(bubble()).toBeNull())
  })

  it('closes when the function it returned runs, as when the button is disabled or removed', async () => {
    const button = document.createElement('button')
    button.style.cssText = 'position: fixed; left: 200px; top: 200px; width: 32px; height: 32px'
    document.body.append(button)
    const release = nameTip(button, 'Archive', 'tip')
    await hoverAndWait(button)
    expect(bubble()).not.toBeNull()
    release()
    expect(bubble()).toBeNull()
    // The bubble leaves the document when its tip closes.
    expect(document.querySelectorAll('[popover]')).toHaveLength(0)
    await restPointer()
    await userEvent.hover(button)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS * 2)
    expect(bubble()).toBeNull()
  })
})

describe('never twice', () => {
  it('shows nothing for a button inside a Tooltip’s trigger', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const anchor = document.createElement('span')
    anchor.dataset.tooltipPart = 'trigger'
    anchor.style.cssText = 'position: fixed; left: 200px; top: 200px'
    const button = document.createElement('button')
    button.style.cssText = 'width: 32px; height: 32px'
    anchor.append(button)
    document.body.append(anchor)
    releases.push(nameTip(button, 'Archive', 'tip'))
    await hoverAndWait(button)
    expect(bubble()).toBeNull()
  })
})

describe('where it is drawn', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  it('sits centred above the button, the gap away', async () => {
    const button = tipped('Archive this ticket')
    await hoverAndWait(button)
    const tip = bubble() as HTMLElement
    const edges = button.getBoundingClientRect()
    const box = tip.getBoundingClientRect()
    expect(tip.dataset.side).toBe('top')
    expect(edges.top - box.bottom).toBeCloseTo(GAP, 0)
    expect(box.left + box.width / 2).toBeCloseTo(edges.left + edges.width / 2, 0)
  })

  it('goes below the button when the top has no room', async () => {
    const button = tipped('Archive', 'left: 200px; top: 4px')
    await hoverAndWait(button)
    const tip = bubble() as HTMLElement
    expect(tip.dataset.side).toBe('bottom')
    expect(tip.getBoundingClientRect().top - button.getBoundingClientRect().bottom).toBeCloseTo(
      GAP,
      0,
    )
  })

  it('stays inside the window at either edge, in either direction', async () => {
    for (const dir of ['ltr', 'rtl']) {
      document.documentElement.dir = dir
      const start = tipped('Archive this ticket for later', 'left: 0; top: 200px')
      await hoverAndWait(start)
      expect((bubble() as HTMLElement).getBoundingClientRect().left).toBeGreaterThanOrEqual(0)
      const end = tipped('Archive this ticket for later', 'right: 0; top: 300px')
      await userEvent.hover(end)
      expect((bubble() as HTMLElement).getBoundingClientRect().right).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      )
      await restPointer()
      await vi.advanceTimersByTimeAsync(TOOLTIP_SKIP_DELAY_MS)
    }
  })
})
