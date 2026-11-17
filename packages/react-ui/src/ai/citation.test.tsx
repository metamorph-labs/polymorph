import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Citation, type CitationProps } from './Citation'
import { RETRY_SOURCE } from './citation.states'

/**
 * Citation, in a real browser.
 *
 * The mark is primarily a link. The tests check that a reader can reach the
 * source without the preview, that the accessible name includes the title and
 * not only a number, and that HoverCard's preview opens on keyboard focus with
 * the source's three lines and nothing interactive.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CitationProps>(true)
  })
})

describe('a real link to the source', () => {
  it('links to the source in a new tab with a safe rel', () => {
    render(<Citation index={1} source={RETRY_SOURCE} />)
    const mark = screen.getByRole('link', { name: '1. Webhook delivery and retries' })
    expect(mark.getAttribute('href')).toBe(RETRY_SOURCE.href)
    expect(mark.getAttribute('target')).toBe('_blank')
    expect(mark.getAttribute('rel')).toBe('noreferrer')
  })

  it('shows the number and includes the title in its name', () => {
    render(<Citation index={3} source={RETRY_SOURCE} />)
    const mark = screen.getByRole('link')
    expect(mark.textContent).toBe('3')
    expect(mark.getAttribute('aria-label')).toContain('Webhook delivery and retries')
  })
})

describe('the preview', () => {
  it('opens on focus with the title, the host and the passage, and nothing interactive', async () => {
    render(<Citation index={1} source={RETRY_SOURCE} />)
    screen.getByRole('link').focus()
    await vi.waitFor(() => {
      expect(screen.getByText('docs.example.org')).toBeTruthy()
    })
    const panel = document.querySelector('[data-member="hover-card"]') as HTMLElement
    expect(panel.textContent).toContain('Webhook delivery and retries')
    expect(panel.textContent).toContain('exponential backoff')
    expect(panel.querySelectorAll('a, button')).toHaveLength(0)
  })
})
