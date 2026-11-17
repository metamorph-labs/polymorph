import { tick } from 'svelte'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import ChatThreadHarness from '../testing/ChatThreadHarness.svelte'
import { live } from '../testing/live.svelte'

/**
 * ChatThread's follow in Svelte (`design/components/chat-thread.md`), which
 * needs a real scroll container and no contract statement can state. A thread
 * at the bottom scrolls to the new bottom when turns arrive, a thread that
 * started empty begins following with its first turn, and a reader who scrolls
 * up stops the follow until the jump control returns them.
 */

beforeAll(installTestTheme)

/**
 * A thread in a 480 × 240 box, with as many turns as `held.count` holds
 * (`testing/ChatThreadHarness.svelte`).
 */
async function thread(first: number) {
  const held = live({ count: first })
  const { host } = await render(ChatThreadHarness, held)
  const root = host.querySelector<HTMLElement>('[data-member="chat-thread"]') as HTMLElement
  const port = root.querySelector<HTMLElement>('[role="log"]') as HTMLElement
  return { held, root, port }
}

const atBottom = (port: HTMLElement) => port.scrollHeight - port.scrollTop - port.clientHeight <= 24

describe('ChatThread follows the newest turn', () => {
  it('begins with the first turn of a thread that started empty', async () => {
    const { held, port } = await thread(0)
    expect(port.textContent).toContain('Ask anything')
    expect(port.hasAttribute('tabindex')).toBe(false)
    held.count = 8
    await tick()
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
      expect(port.getAttribute('tabindex')).toBe('0')
    })
  })

  it('stays at the bottom as turns arrive', async () => {
    const { held, root, port } = await thread(6)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    held.count = 8
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
    })
    expect(root.hasAttribute('data-state')).toBe(false)
  })

  it('stops once the reader scrolls up, and the jump control returns them', async () => {
    const { held, root, port } = await thread(6)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    port.scrollTop = 0
    await vi.waitFor(() => expect(root.getAttribute('data-state')).toBe('detached'))
    const before = port.scrollTop
    held.count = 8
    await new Promise((settle) => setTimeout(settle, 50))
    expect(port.scrollTop).toBe(before)

    const jump = root.querySelector<HTMLButtonElement>('button') as HTMLButtonElement
    expect(jump.getAttribute('aria-label') ?? jump.textContent).toContain('Jump to latest')
    await userEvent.click(jump)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    await vi.waitFor(() => expect(root.hasAttribute('data-state')).toBe(false))
  })
})
