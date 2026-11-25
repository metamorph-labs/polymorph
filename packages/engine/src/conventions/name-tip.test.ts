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

/**
 * Fakes the timers once the skip delay of a tip an earlier step closed has passed. The skip delay
 * is read from the real clock, which is left real, so a faked clock that ran ahead in an earlier
 * test cannot put the last close in the future.
 */
async function fakeTimersAfterSkip() {
  vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, TOOLTIP_SKIP_DELAY_MS))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
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
  beforeEach(fakeTimersAfterSkip)

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

    // Within the skip delay of that tip closing, the next opens at once.
    await restPointer()
    expect(bubble()).toBeNull()
    await userEvent.hover(far)
    expect(bubble()?.textContent).toBe('Share')

    await restPointer()
    await fakeTimersAfterSkip()
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

/**
 * Moves focus to `target` from the keyboard: Enter on a button whose press puts focus there, as
 * a key that opens a dialog does when the dialog focuses its first control. Tab is not used,
 * because on WebKit it passes over buttons and links (`TAB_PASSES_BUTTONS` in
 * `@polymorph/conformance`); each shell's law reaches a control with Tab where the engine allows.
 */
async function focusByKey(target: HTMLElement) {
  const from = document.createElement('button')
  from.textContent = 'From'
  from.addEventListener('click', () => target.focus())
  document.body.append(from)
  from.focus()
  await userEvent.keyboard('{Enter}')
  expect(document.activeElement).toBe(target)
}

describe('keyboard focus', () => {
  it('opens when a key press moves focus to the button, and closes on blur', async () => {
    const button = tipped('Archive')
    await focusByKey(button)
    await vi.waitFor(() => expect(bubble()?.textContent).toBe('Archive'))
    // Held by focus, the tip stays while the pointer moves elsewhere.
    await userEvent.hover(rest)
    expect(bubble()).not.toBeNull()
    button.blur()
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
    await focusByKey(button)
    await vi.waitFor(() => expect(bubble()).not.toBeNull())
    await userEvent.keyboard('{Enter}')
    expect(bubble()).toBeNull()
  })
})

describe('Escape', () => {
  it('closes a tip the pointer opened and reaches nothing else, so a Dialog around it stays open', async () => {
    await fakeTimersAfterSkip()
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
    await focusByKey(tipped('Close'))
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
  beforeEach(fakeTimersAfterSkip)

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

describe('an icon-only link', () => {
  /** A link standing for Pagination's arrow drawn as a link, with a name tip. */
  function tippedLink() {
    const link = document.createElement('a')
    link.href = '#page-3'
    link.setAttribute('aria-label', 'Next page')
    link.style.cssText = 'position: fixed; left: 200px; top: 200px; width: 32px; height: 32px'
    document.body.append(link)
    releases.push(nameTip(link, 'Next page', 'tip'))
    return link
  }

  it('opens on mouse hover after the delay, as a button does', async () => {
    await fakeTimersAfterSkip()
    const link = tippedLink()
    await userEvent.hover(link)
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS - 1)
    expect(bubble()).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(bubble()?.textContent).toBe('Next page')
    await restPointer()
    expect(bubble()).toBeNull()
  })

  it('opens when a key press moves focus to it, and not for focus a script gives after a press', async () => {
    const elsewhere = document.createElement('button')
    elsewhere.textContent = 'Elsewhere'
    elsewhere.style.cssText = 'position: fixed; left: 400px; top: 400px'
    document.body.append(elsewhere)
    const link = tippedLink()
    await userEvent.click(elsewhere)
    link.focus()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(document.activeElement).toBe(link)
    expect(bubble()).toBeNull()
    link.blur()
    await focusByKey(link)
    await vi.waitFor(() => expect(bubble()?.textContent).toBe('Next page'))
  })

  it('closes when the link is followed from the keyboard', async () => {
    const link = tippedLink()
    link.addEventListener('click', (event) => event.preventDefault())
    await focusByKey(link)
    await vi.waitFor(() => expect(bubble()).not.toBeNull())
    await userEvent.keyboard('{Enter}')
    expect(bubble()).toBeNull()
  })
})

describe('never twice', () => {
  it('shows nothing for a button inside a Tooltip’s trigger', async () => {
    await fakeTimersAfterSkip()
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
  beforeEach(fakeTimersAfterSkip)

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
      await fakeTimersAfterSkip()
    }
  })
})
