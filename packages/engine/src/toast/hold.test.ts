import { afterEach, describe, expect, it, vi } from 'vitest'

import { holdToastTimers, toastClock, toastTimeLeft } from './hold'

/**
 * When a viewport's timers wait, and how much of a card's reading window is left when they
 * run again. The viewports' own tests check the hold through focus and the pointer; these check
 * the window in the background and the clock.
 */

/** A task later, after the window's `blur` has been read. */
const task = () => new Promise<void>((settle) => setTimeout(settle, 0))

function viewport(): { region: HTMLElement; holds: boolean[]; release: () => void } {
  const region = document.createElement('div')
  document.body.append(region)
  const holds: boolean[] = []
  const release = holdToastTimers(region, (held) => holds.push(held))
  return {
    region,
    holds,
    release: () => {
      release()
      region.remove()
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('holdToastTimers', () => {
  it('holds the timers while the window has lost focus to another application', async () => {
    const { holds, release } = viewport()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    window.dispatchEvent(new FocusEvent('blur'))
    await task()
    expect(holds).toEqual([true])
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    window.dispatchEvent(new FocusEvent('focus'))
    expect(holds).toEqual([true, false])
    release()
  })

  it('runs the timers while focus is in a frame on the page', async () => {
    const { holds, release } = viewport()
    // The window sends `blur` as a frame inside it takes focus, and the document still has it.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    window.dispatchEvent(new FocusEvent('blur'))
    await task()
    expect(holds).toEqual([])
    release()
  })

  it('holds the timers while the page is hidden, from the start', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { holds, release } = viewport()
    expect(holds).toEqual([true])
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(holds).toEqual([true, false])
    release()
  })

  it('reads nothing after it is released', async () => {
    const { holds, release } = viewport()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    window.dispatchEvent(new FocusEvent('blur'))
    release()
    await task()
    expect(holds).toEqual([])
  })
})

describe('toastTimeLeft', () => {
  it('gives a whole window for a new revision, and the time that was left after a hold', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const clock = toastClock()
    expect(toastTimeLeft(clock, 0, 5000, true)).toBe(5000)
    // Held 2 s in: the timer that waits out the hold is given what is left.
    now.mockReturnValue(3000)
    expect(toastTimeLeft(clock, 0, 5000, false)).toBe(3000)
    // The hold took 10 s, and none of it is taken off.
    now.mockReturnValue(13000)
    expect(toastTimeLeft(clock, 0, 5000, true)).toBe(3000)
    // An update in place starts a whole window again.
    now.mockReturnValue(14000)
    expect(toastTimeLeft(clock, 1, 5000, true)).toBe(5000)
  })

  it('never gives a time below zero', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0)
    const clock = toastClock()
    toastTimeLeft(clock, 0, 1000, true)
    now.mockReturnValue(5000)
    expect(toastTimeLeft(clock, 0, 1000, true)).toBe(0)
  })
})
