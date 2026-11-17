import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import ChatMessage from './ChatMessage.vue'
import ChatThread from './ChatThread.vue'

/**
 * ChatThread's follow in Vue (`design/components/chat-thread.md`), which needs
 * a real scroll container and no contract statement can state. A thread at the
 * bottom scrolls to the new bottom when turns arrive, a thread that started
 * empty begins following with its first turn, and a reader who scrolls up stops
 * the follow until the jump control returns them.
 */

beforeAll(installTestTheme)

const turn = (index: number) =>
  h(
    ChatMessage,
    {
      key: index,
      role: index % 2 === 0 ? 'user' : 'assistant',
      author: index % 2 === 0 ? 'You' : 'Pilot',
    },
    { default: () => [h('p', `Turn ${index}. `.repeat(8))] },
  )

/** A thread in a 480 × 240 box, with as many turns as `count` holds. */
async function thread(first: number) {
  const count = ref(first)
  const { host } = await mount(() =>
    h('div', { style: { inlineSize: '480px', blockSize: '240px' } }, [
      h(
        ChatThread,
        { label: 'Conversation' },
        {
          default: () => Array.from({ length: count.value }, (_, at) => turn(at)),
          empty: () => [h('p', 'Ask anything')],
        },
      ),
    ]),
  )
  const root = host.querySelector<HTMLElement>('[data-member="chat-thread"]') as HTMLElement
  const port = root.querySelector<HTMLElement>('[role="log"]') as HTMLElement
  return { count, root, port }
}

const atBottom = (port: HTMLElement) => port.scrollHeight - port.scrollTop - port.clientHeight <= 24

describe('ChatThread follows the newest turn', () => {
  it('begins with the first turn of a thread that started empty', async () => {
    const { count, port } = await thread(0)
    expect(port.textContent).toContain('Ask anything')
    expect(port.hasAttribute('tabindex')).toBe(false)
    count.value = 8
    await nextTick()
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
      expect(port.getAttribute('tabindex')).toBe('0')
    })
  })

  it('stays at the bottom as turns arrive', async () => {
    const { count, root, port } = await thread(6)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    count.value = 8
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
    })
    expect(root.hasAttribute('data-state')).toBe(false)
  })

  it('stops once the reader scrolls up, and the jump control returns them', async () => {
    const { count, root, port } = await thread(6)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    port.scrollTop = 0
    await vi.waitFor(() => expect(root.getAttribute('data-state')).toBe('detached'))
    const before = port.scrollTop
    count.value = 8
    await new Promise((settle) => setTimeout(settle, 50))
    expect(port.scrollTop).toBe(before)

    const jump = root.querySelector<HTMLButtonElement>('button') as HTMLButtonElement
    expect(jump.getAttribute('aria-label') ?? jump.textContent).toContain('Jump to latest')
    await userEvent.click(jump)
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    await vi.waitFor(() => expect(root.hasAttribute('data-state')).toBe(false))
  })
})
