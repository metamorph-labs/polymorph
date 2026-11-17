import { afterEach, describe, expect, it, vi } from 'vitest'

import { FOLLOW_SLACK_PX, followEnd, jumpToEnd, type FollowState } from './follow'

/**
 * `followEnd` and `jumpToEnd`, which every framework's ChatThread and LogView
 * follow their end by. The region here is plain DOM: a scroll container of a
 * fixed height, and a column inside it that the test grows.
 */

afterEach(() => {
  document.body.replaceChildren()
})

/** A 200px region holding a column of `rows` rows, each 40px tall. */
function region(rows: number) {
  const port = document.createElement('div')
  port.style.cssText = 'height: 200px; width: 300px; overflow: auto;'
  const content = document.createElement('div')
  port.append(content)
  document.body.append(port)
  const grow = (count: number) => {
    for (let at = 0; at < count; at += 1) {
      const row = document.createElement('div')
      row.style.height = '40px'
      content.append(row)
    }
  }
  grow(rows)
  const states: FollowState[] = []
  const stop = followEnd(port, content, (state) => states.push(state))
  return { port, content, grow, states, stop }
}

const atEnd = (port: HTMLElement) =>
  port.scrollHeight - port.scrollTop - port.clientHeight <= FOLLOW_SLACK_PX

const last = (states: FollowState[]) => states[states.length - 1]

describe('followEnd', () => {
  it('starts at the end and reports the region as overflowing', () => {
    const { port, states } = region(10)
    expect(atEnd(port)).toBe(true)
    expect(last(states)).toEqual({ detached: false, overflowing: true })
  })

  it('reports no overflow while the content fits', () => {
    const { states } = region(2)
    expect(last(states)).toEqual({ detached: false, overflowing: false })
  })

  it('reports overflow on the inline axis too, because that region scrolls as well', async () => {
    const { content, states } = region(1)
    const wide = document.createElement('div')
    wide.style.cssText = 'width: 900px; height: 10px;'
    content.append(wide)
    await vi.waitFor(() => expect(last(states)?.overflowing).toBe(true))
  })

  it('moves to the new end as content arrives', async () => {
    const { port, grow } = region(10)
    grow(10)
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(700)
      expect(atEnd(port)).toBe(true)
    })
  })

  it('stays where the reader scrolled, and reports it once', async () => {
    const { port, grow, states } = region(10)
    port.scrollTop = 0
    await vi.waitFor(() => expect(last(states)?.detached).toBe(true))
    const reports = states.length
    grow(10)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(port.scrollTop).toBe(0)
    expect(states).toHaveLength(reports)
  })

  it('follows again once the reader returns to the end', async () => {
    const { port, grow, states } = region(10)
    port.scrollTop = 0
    await vi.waitFor(() => expect(last(states)?.detached).toBe(true))
    port.scrollTop = port.scrollHeight
    await vi.waitFor(() => expect(last(states)?.detached).toBe(false))
    grow(5)
    await vi.waitFor(() => expect(atEnd(port)).toBe(true))
  })

  it('stops observing once it is released', async () => {
    const { port, grow, stop } = region(10)
    stop()
    const before = port.scrollTop
    grow(10)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(port.scrollTop).toBe(before)
  })

  it('does nothing without a region or content', () => {
    const report = vi.fn()
    expect(() => followEnd(null, null, report)()).not.toThrow()
    expect(() => followEnd(document.createElement('div'), undefined, report)()).not.toThrow()
    expect(report).not.toHaveBeenCalled()
  })
})

describe('jumpToEnd', () => {
  it('returns a detached region to its end and follows from that call', async () => {
    const { port, grow, states } = region(10)
    port.scrollTop = 0
    await vi.waitFor(() => expect(last(states)?.detached).toBe(true))

    jumpToEnd(port)
    expect(atEnd(port)).toBe(true)
    expect(last(states)?.detached).toBe(false)

    // Content that arrives before the browser reports the jump's scroll is followed.
    grow(10)
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(700)
      expect(atEnd(port)).toBe(true)
    })
  })

  it('moves a region nothing follows to its end', () => {
    const port = document.createElement('div')
    port.style.cssText = 'height: 100px; overflow: auto;'
    const tall = document.createElement('div')
    tall.style.height = '500px'
    port.append(tall)
    document.body.append(port)
    jumpToEnd(port)
    expect(atEnd(port)).toBe(true)
  })
})
