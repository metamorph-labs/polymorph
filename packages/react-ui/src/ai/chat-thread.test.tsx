import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { ChatMessage } from './ChatMessage'
import { ChatThread, type ChatThreadProps } from './ChatThread'

/**
 * ChatThread, in a real browser.
 *
 * The main subject is following, which needs a real scroll container. A
 * thread at the bottom scrolls to the new bottom when a turn grows. A thread
 * the reader scrolled up does not, and it offers the control that returns
 * them. The tests also check the semantics: a named log, additions only, and a
 * tab stop only while the log can scroll.
 */

beforeAll(installTestTheme)

/** A box the thread fills, short enough that a few turns overflow it. */
function box(height = 240): HTMLElement {
  const host = document.createElement('div')
  host.style.cssText = `width: 480px; height: ${height}px;`
  document.body.append(host)
  return host
}

const turn = (index: number) => (
  <ChatMessage
    key={index}
    role={index % 2 === 0 ? 'user' : 'assistant'}
    author={index % 2 === 0 ? 'You' : 'Pilot'}
  >
    <p>{`Turn ${index}. `.repeat(8)}</p>
  </ChatMessage>
)

const log = () => screen.getByRole('log', { name: 'Conversation' })

const atBottom = (port: HTMLElement) => port.scrollHeight - port.scrollTop - port.clientHeight <= 24

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ChatThreadProps>(true)
  })
})

describe('the log', () => {
  it('is one named log that announces additions only, and is busy while a reply arrives', () => {
    render(
      <ChatThread label="Conversation" streaming>
        {turn(0)}
      </ChatThread>,
    )
    expect(log().getAttribute('aria-relevant')).toBe('additions')
    expect(log().getAttribute('aria-busy')).toBe('true')
  })

  it('renders the app’s empty slot when there are no turns', () => {
    render(<ChatThread label="Conversation" empty={<p>Ask anything</p>} />)
    expect(screen.getByText('Ask anything')).toBeTruthy()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('is a tab stop only while it overflows', async () => {
    const host = box()
    const { rerender } = render(<ChatThread label="Conversation">{turn(0)}</ChatThread>, {
      container: host,
    })
    await vi.waitFor(() => expect(log().hasAttribute('tabindex')).toBe(false))
    rerender(<ChatThread label="Conversation">{[0, 1, 2, 3, 4, 5].map(turn)}</ChatThread>)
    await vi.waitFor(() => expect(log().getAttribute('tabindex')).toBe('0'))
    host.remove()
  })
})

describe('following', () => {
  it('begins with the first turn of a thread that started empty', async () => {
    // A new chat has no column to observe at mount. Following must attach when
    // the first turn mounts the column, or a new reply never scrolls.
    const host = box()
    const { rerender } = render(<ChatThread label="Conversation" empty={<p>Ask</p>} />, {
      container: host,
    })
    rerender(<ChatThread label="Conversation">{[0, 1, 2, 3, 4, 5, 6, 7].map(turn)}</ChatThread>)
    const port = log()
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
      expect(port.getAttribute('tabindex')).toBe('0')
    })
    host.remove()
  })

  it('starts at the bottom and stays there as a turn grows', async () => {
    const host = box()
    const { rerender } = render(
      <ChatThread label="Conversation">{[0, 1, 2, 3, 4, 5].map(turn)}</ChatThread>,
      { container: host },
    )
    const port = log()
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    rerender(<ChatThread label="Conversation">{[0, 1, 2, 3, 4, 5, 6, 7].map(turn)}</ChatThread>)
    await vi.waitFor(() => {
      expect(port.scrollHeight).toBeGreaterThan(port.clientHeight * 2)
      expect(atBottom(port)).toBe(true)
    })
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull()
    host.remove()
  })

  it('stops following once the reader scrolls up, and offers the jump control', async () => {
    const host = box()
    const { container, rerender } = render(
      <ChatThread label="Conversation">{[0, 1, 2, 3, 4, 5].map(turn)}</ChatThread>,
      { container: host },
    )
    const port = log()
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))

    port.scrollTop = 0
    await vi.waitFor(() =>
      expect((container.firstElementChild as HTMLElement).dataset['state']).toBe('detached'),
    )
    const before = port.scrollTop
    rerender(<ChatThread label="Conversation">{[0, 1, 2, 3, 4, 5, 6, 7].map(turn)}</ChatThread>)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(port.scrollTop).toBe(before)

    await userEvent.click(screen.getByRole('button', { name: 'Jump to latest' }))
    await vi.waitFor(() => expect(atBottom(port)).toBe(true))
    await vi.waitFor(() =>
      expect((container.firstElementChild as HTMLElement).hasAttribute('data-state')).toBe(false),
    )
    host.remove()
  })
})

/**
 * An agent and the thread (`design/components/chat-thread.md`, Agent): it reads whether a reply
 * is arriving. A turn is a ChatMessage, which registers nothing. The jump control is withheld,
 * so the hidden Button is not an agent's.
 */
describe('an agent', () => {
  it('lists the thread, and neither a turn nor the hidden jump control', async () => {
    render(
      <ChatThread label="Conversation" streaming>
        {turn(0)}
        {turn(1)}
      </ChatThread>,
    )
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name, member.within])).toEqual([
        ['ChatThread', 'Conversation', undefined],
      ])
      expect(members[0]?.state).toEqual({ streaming: true })
      const [jump] = agentRegistrations().filter(({ member }) => member === 'Button')
      expect(jump).toBeDefined()
      const { results } = await bridge.act([{ id: jump?.id, action: 'press' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
    } finally {
      bridge.dispose()
    }
  })
})
