import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { SourceList, type SourceListProps } from './SourceList'
import { SOURCES } from './source-list.states'

/**
 * SourceList, in a real browser.
 *
 * The tests check two things. The list is one ordered list of the sources in
 * the given order, each reachable through exactly one link. The visible number
 * is hidden, so it does not repeat the number the list already announces.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SourceListProps>(true)
  })
})

describe('the list', () => {
  it('is one named ordered list, in the given order', () => {
    render(<SourceList sources={SOURCES} label="Sources" />)
    expect(screen.getByRole('region', { name: 'Sources' })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.querySelector('a')?.textContent)).toEqual([
      'Webhook delivery and retries',
      'Idempotency keys',
      'Incident 2026-08-14: duplicate promo codes on retry',
    ])
  })

  it('gives every source exactly one link, on the title', () => {
    render(<SourceList sources={SOURCES} label="Sources" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links[0]?.getAttribute('href')).toBe(SOURCES[0]?.href)
    expect(links[0]?.getAttribute('target')).toBe('_blank')
  })

  it('hides the visible number, because the list already announces it', () => {
    render(<SourceList sources={SOURCES} label="Sources" />)
    const [first] = screen.getAllByRole('listitem')
    const index = first?.firstElementChild as HTMLElement
    expect(index.textContent).toBe('1')
    expect(index.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders nothing at all with no sources', () => {
    const { container } = render(<SourceList sources={[]} label="Sources" />)
    expect(container.firstElementChild).toBeNull()
  })
})
