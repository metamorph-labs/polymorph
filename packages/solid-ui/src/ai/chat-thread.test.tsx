import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createSignal, For } from 'solid-js'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import ChatMessage from './ChatMessage'
import ChatThread from './ChatThread'

/**
 * ChatThread's follow in Solid (`design/components/chat-thread.md`), which needs
 * a real scroll container and no contract statement can state. A thread at the
 * bottom scrolls to the new bottom when turns arrive, a thread that started
 * empty begins following with its first turn, and a reader who scrolls up stops
 * the follow until the jump control returns them.
 */

beforeAll(installTestTheme)

const turn = (index: number) => (
  <ChatMessage
    role={index % 2 === 0 ? 'user' : 'assistant'}
    author={index % 2 === 0 ? 'You' : 'Pilot'}
  >
    <p>{`Turn ${index}. `.repeat(8)}</p>
  </ChatMessage>
)

/** A thread in a 480 × 240 box, with as many turns as `count` holds. */
async function thread(first: number) {
  const [count, setCount] = createSignal(first)
  const { host } = await mount(() => (
    <div style={{ 'inline-size': '480px', 'block-size': '240px' }}>
      <ChatThread label="Conversation" empty={<p>Ask anything</p>}>
        <For each={Array.from({ length: count() }, (_, at) => at)}>{(at) => turn(at)}</For>
      </ChatThread>
    </div>
  ))
  const root = host.querySelector<HTMLElement>('[data-member="chat-thread"]') as HTMLElement
  const port = root.querySelector<HTMLElement>('[role="log"]') as HTMLElement
  return { setCount, root, port }
}

const atBottom = (port: HTMLElement) => port.scrollHeight - port.scrollTop - port.clientHeight <= 24

const nextFrame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

describe('ChatThread follows the newest turn', () => {
  it('begins with the first turn of a thread that started empty', async () => {
    const { setCount, port } = await thread(0)
    expect(port.textContent).toContain('Ask anything')
    expect(port.hasAttribute('tabindex')).toBe(false)
    setCount(8)
    await Promise.resolve()
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
      expect(port.getAttribute('tabindex')).toBe('0')
    })
  })

  it('stays at the bottom as turns arrive', async () => {
    const { setCount, root, port } = await thread(6)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    setCount(8)
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
    })
    expect(root.hasAttribute('data-state')).toBe(false)
  })

  it('stops once the reader scrolls up, and the jump control returns them', async () => {
    const { setCount, root, port } = await thread(6)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    // The mount resolves inside a frame whose resize observations are still due, and the
    // first of them follows the bottom again. The reader scrolls after that frame.
    await nextFrame()
    port.scrollTop = 0
    await vi.waitFor(() => expect(root.getAttribute('data-state')).toBe('detached'))
    const before = port.scrollTop
    setCount(8)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(port.scrollTop).toBe(before)

    const jump = root.querySelector<HTMLButtonElement>('button') as HTMLButtonElement
    expect(jump.getAttribute('aria-label') ?? jump.textContent).toContain('Jump to latest')
    await userEvent.click(jump)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    await vi.waitFor(() => expect(root.hasAttribute('data-state')).toBe(false))
  })
})
