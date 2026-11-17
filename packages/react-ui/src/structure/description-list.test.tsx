import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { installTestTheme } from '@polymorph/engine/testing'
import { Badge } from './Badge'
import { DescriptionList, type DescriptionListProps } from './DescriptionList'

/**
 * DescriptionList, in a real browser.
 *
 * The semantics: a real `<dl>` with one `<dt>` before each `<dd>`, which list
 * navigation announces. And it is read-only: nothing is focusable (a row with a
 * control is a SettingsRow).
 */

beforeAll(installTestTheme)

const ITEMS: DescriptionListProps['items'] = [
  { term: 'Status', detail: 'Open' },
  { term: 'Priority', detail: 'Urgent' },
  { term: 'Assignee', detail: 'Ada Okonkwo' },
  { term: 'Raised', detail: '3 days ago' },
]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DescriptionListProps>(true)
  })
})

describe('the semantics', () => {
  it('renders a real dl with one dt per dd, in the order given', () => {
    const { container } = render(<DescriptionList items={ITEMS} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe('DL')
    expect(root.querySelectorAll('dt')).toHaveLength(4)
    expect(root.querySelectorAll('dd')).toHaveLength(4)
    expect([...root.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
      'Status',
      'Priority',
      'Assignee',
      'Raised',
    ])
    // Reading order matches visual order: each name directly before its value.
    for (const term of root.querySelectorAll('dt')) {
      expect(term.nextElementSibling?.tagName).toBe('DD')
    }
  })

  it('wraps every pair in its own div, which is valid dl grouping', () => {
    const { container } = render(<DescriptionList items={ITEMS} orientation="horizontal" />)
    const root = container.firstElementChild as HTMLElement
    for (const pair of root.children) {
      expect(pair.tagName).toBe('DIV')
      expect([...pair.children].map((part) => part.tagName)).toEqual(['DT', 'DD'])
    }
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<DescriptionList items={[]} />)
    expect(container.firstElementChild).toBeNull()
  })
})

describe('details accept members, terms are strings', () => {
  it('lets a member keep its own type inside a dd', () => {
    const { container } = render(
      <DescriptionList
        items={[{ term: 'Status', detail: <Badge tone="warning">Waiting</Badge> }]}
      />,
    )
    const detail = container.querySelector('dd') as HTMLElement
    expect(detail.querySelector('[data-tone="warning"]')).toBeTruthy()
    expect(screen.getByText('Waiting')).toBeTruthy()
  })
})

describe('read-only content', () => {
  it('offers nothing to click and nothing to focus', () => {
    render(<DescriptionList items={ITEMS} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it('sets the horizontal grid with a content-sized term column', () => {
    const { container } = render(<DescriptionList items={ITEMS} orientation="horizontal" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset['orientation']).toBe('horizontal')
    expect(getComputedStyle(root).display).toBe('grid')
    // The pair wrappers use `display: contents`, so dt and dd sit on the grid's
    // two tracks.
    expect(getComputedStyle(root.firstElementChild as HTMLElement).display).toBe('contents')
  })
})
