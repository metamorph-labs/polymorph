import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { ChatMessage, type ChatMessageProps } from './ChatMessage'

/**
 * ChatMessage, in a real browser.
 *
 * `role` decides the layout, and the tests check it by geometry. A reader's
 * turn sits at the end edge inside a bubble. A model's turn runs the full
 * width with a mark at the start. The tests also check that the hover row is
 * transparent until hovered or focused, and stays in the tab order.
 */

beforeAll(installTestTheme)

const article = () => screen.getByRole('article')

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ChatMessageProps>(true)
  })
})

describe('two layouts chosen by role', () => {
  it('puts the reader at the end edge, in a bubble narrower than the thread', () => {
    const host = document.createElement('div')
    host.style.width = '600px'
    document.body.append(host)
    render(
      <ChatMessage role="user" author="You">
        Short.
      </ChatMessage>,
      { container: host },
    )
    const content = screen.getByText('Short.')
    const bubble = content.getBoundingClientRect()
    expect(bubble.right).toBeGreaterThan(host.getBoundingClientRect().right - 60)
    expect(bubble.width).toBeLessThan(300)
    expect(getComputedStyle(content).borderStyle).toBe('solid')
    host.remove()
  })

  it('gives the model the whole width and a mark at the start', () => {
    const host = document.createElement('div')
    host.style.width = '600px'
    document.body.append(host)
    render(
      <ChatMessage role="assistant" author="Pilot">
        <p>A reply.</p>
      </ChatMessage>,
      { container: host },
    )
    const mark = article().firstElementChild as HTMLElement
    const content = screen.getByText('A reply.')
    expect(mark.getBoundingClientRect().left).toBeLessThan(content.getBoundingClientRect().left)
    expect(content.getBoundingClientRect().right).toBeGreaterThan(500)
    expect(mark.querySelector('svg')).toBeTruthy()
    host.remove()
  })

  it('names the article after its author and says when it is busy', () => {
    render(
      <ChatMessage role="assistant" author="Pilot" status="streaming">
        <p>…</p>
      </ChatMessage>,
    )
    expect(screen.getByRole('article', { name: 'Pilot' })).toBeTruthy()
    expect(article().getAttribute('aria-busy')).toBe('true')
    expect(article().dataset['status']).toBe('streaming')
  })

  it('sets no status once a turn is complete', () => {
    render(
      <ChatMessage role="assistant" author="Pilot">
        <p>Done.</p>
      </ChatMessage>,
    )
    expect(article().hasAttribute('data-status')).toBe(false)
    expect(article().hasAttribute('aria-busy')).toBe(false)
  })

  it('renders a system notice with no mark and no meta', () => {
    render(
      <ChatMessage role="system" author="System">
        Context was summarised.
      </ChatMessage>,
    )
    expect(article().querySelectorAll('svg')).toHaveLength(0)
    expect(screen.queryByText('System')).toBeNull()
    expect(article().getAttribute('aria-label')).toBe('System')
  })
})

describe('the hover row', () => {
  it.skipIf(TAB_PASSES_BUTTONS)('is transparent at rest and still in the tab order', async () => {
    render(
      <ChatMessage
        role="assistant"
        author="Pilot"
        actions={
          <Button variant="ghost" tone="neutral" size="sm" iconOnly icon="copy" label="Copy" />
        }
      >
        <p>A reply.</p>
      </ChatMessage>,
    )
    const copy = screen.getByRole('button', { name: 'Copy' })
    const row = copy.parentElement as HTMLElement
    expect(Number.parseFloat(getComputedStyle(row).opacity)).toBe(0)
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(copy)
    // The row fades in over the control duration, so the test checks the final opacity.
    await vi.waitFor(() => expect(Number.parseFloat(getComputedStyle(row).opacity)).toBe(1))
  })

  it('shows the app’s text for why a turn stopped', () => {
    render(
      <ChatMessage
        role="assistant"
        author="Pilot"
        status="stopped"
        statusMessage="Stopped generating"
      >
        <p>Half.</p>
      </ChatMessage>,
    )
    expect(screen.getByText('Stopped generating')).toBeTruthy()
  })
})
