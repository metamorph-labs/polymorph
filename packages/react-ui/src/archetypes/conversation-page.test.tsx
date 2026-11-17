import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { ConversationPage, type ConversationPageProps } from './ConversationPage'

/**
 * ConversationPage, in a real browser.
 *
 * The archetype's one decision is geometry, which needs a real browser. The
 * tests check that the thread takes the space above the composer, and that
 * the aside sits beside the thread when the page is wide and in a drawer when
 * it is narrow, with nothing dropped. They also check that the page declares
 * its scope on its own root like every other page.
 */

beforeAll(installTestTheme)

function box(width: number): HTMLElement {
  const host = document.createElement('div')
  host.style.cssText = `width: ${width}px; height: 480px;`
  document.body.append(host)
  return host
}

const page = () => document.querySelector('[data-member="conversation-page"]') as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ConversationPageProps>(true)
  })
})

describe('the geometry', () => {
  it('declares the page scope on its root and composes the one h1', () => {
    const host = box(900)
    render(<ConversationPage title="Chat" thread={<p>thread</p>} composer={<p>composer</p>} />, {
      container: host,
    })
    expect(getComputedStyle(page()).getPropertyValue('--pm-page-padding-x').trim()).not.toBe('')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    host.remove()
  })

  it('puts the composer under the thread, at the bottom of the region', () => {
    const host = box(900)
    render(<ConversationPage title="Chat" thread={<p>thread</p>} composer={<p>composer</p>} />, {
      container: host,
    })
    const thread = screen.getByText('thread').getBoundingClientRect()
    const composer = screen.getByText('composer').getBoundingClientRect()
    expect(composer.top).toBeGreaterThan(thread.bottom)
    expect(composer.bottom).toBeGreaterThan(host.getBoundingClientRect().bottom - 60)
    host.remove()
  })
})

describe('the aside', () => {
  it('sits beside the thread when the page is wide', async () => {
    const host = box(1000)
    render(
      <ConversationPage
        title="Chat"
        thread={<p>thread</p>}
        composer={<p>composer</p>}
        aside={<p>artifact</p>}
        asideLabel="Artifact"
      />,
      { container: host },
    )
    await vi.waitFor(() => expect(page().dataset['aside']).toBe('split'))
    expect(screen.getByRole('separator', { name: 'Artifact' })).toBeTruthy()
    const thread = screen.getByText('thread').getBoundingClientRect()
    const artifact = screen.getByText('artifact').getBoundingClientRect()
    expect(artifact.left).toBeGreaterThan(thread.right)
    expect(screen.queryByRole('button', { name: 'Artifact' })).toBeNull()
    host.remove()
  })

  it('moves into a drawer when the page is narrow, and nothing is lost', async () => {
    const host = box(600)
    render(
      <ConversationPage
        title="Chat"
        thread={<p>thread</p>}
        composer={<p>composer</p>}
        aside={<p>artifact</p>}
        asideLabel="Artifact"
      />,
      { container: host },
    )
    await vi.waitFor(() => expect(page().dataset['aside']).toBe('drawer'))
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByText('artifact')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Artifact' }))
    await vi.waitFor(() => expect(screen.getByRole('dialog', { name: 'Artifact' })).toBeTruthy())
    expect(screen.getByText('artifact')).toBeTruthy()
    host.remove()
  })
})
