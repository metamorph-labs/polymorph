import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { SectionNav, type SectionNavProps } from './SectionNav'

/**
 * SectionNav, in a real browser.
 *
 * The claims here are the ones hand-rolled section navigation gets wrong: the
 * current page is marked for a screen reader, a click reaches the app's router
 * and a modified click stays the browser's, and a narrow column wraps the row
 * without scrolling sideways.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const ITEMS = [
  { label: 'Users', href: '#users' },
  { label: 'Groups', href: '#groups' },
  { label: 'Roles', href: '#roles' },
  { label: 'Sessions', href: '#sessions' },
]

const nav = () => screen.getByRole('navigation', { name: 'Identity sections' })
const link = (name: string) => screen.getByRole('link', { name })

/**
 * Dispatches a click on a link and reports whether the member took it from the
 * browser. The watch is on the document, so it runs after React's handler and
 * reads what the member decided. It then cancels the click itself: a modified
 * click the member leaves alone would open a tab the test cannot close. A
 * listener on the link would run before React's, and the member would see a
 * click that is already cancelled and leave it for that reason alone.
 */
function taken(target: HTMLElement, init: MouseEventInit = {}): boolean {
  let prevented = false
  const watch = (event: MouseEvent) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', watch)
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  document.removeEventListener('click', watch)
  return prevented
}

const PAGES = [
  { label: 'Users', href: '/identity/users' },
  { label: 'Groups', href: '/identity/groups/' },
  { label: 'Roles', href: '/identity/roles' },
]

const current = () =>
  [...nav().querySelectorAll('[aria-current="page"]')].map((item) => item.textContent)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SectionNavProps>(true)
  })
})

describe('the row', () => {
  it('is a navigation landmark, named by `label`, around a list of links', () => {
    render(<SectionNav label="Identity sections" items={ITEMS} />)
    expect(nav().querySelectorAll('ul > li > a')).toHaveLength(4)
    expect(link('Groups').getAttribute('href')).toBe('#groups')
  })

  it('marks the item whose href is `current`, and only that one', () => {
    render(<SectionNav label="Identity sections" items={ITEMS} current="#roles" />)
    expect(link('Roles').getAttribute('aria-current')).toBe('page')
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('matches `current` on the page it names: a trailing slash, a query and a hash are not part of it', () => {
    const { rerender } = render(
      <SectionNav label="Identity sections" items={PAGES} current="/identity/users/" />,
    )
    expect(current()).toEqual(['Users'])
    rerender(
      <SectionNav label="Identity sections" items={PAGES} current="/identity/users?page=2#top" />,
    )
    expect(current()).toEqual(['Users'])
    // The slash may be on the item instead.
    rerender(<SectionNav label="Identity sections" items={PAGES} current="/identity/groups" />)
    expect(current()).toEqual(['Groups'])
    // A page below an item's own is the router's knowledge, and is not matched.
    rerender(<SectionNav label="Identity sections" items={PAGES} current="/identity/users/42" />)
    expect(current()).toEqual([])
  })

  it('matches a `current` written with its origin, as `location.href` is', () => {
    const { rerender } = render(
      <SectionNav
        label="Identity sections"
        items={PAGES}
        current="https://app.example.com/identity/users?page=2#top"
      />,
    )
    expect(current()).toEqual(['Users'])
    rerender(
      <SectionNav
        label="Identity sections"
        items={[{ label: 'Home', href: '/' }, ...PAGES]}
        current="HTTPS://App.Example.com"
      />,
    )
    expect(current()).toEqual(['Home'])
  })

  it('marks an item written with an origin only for a `current` with the same one', () => {
    const items = [
      { label: 'Docs', href: 'https://docs.example.com/identity/users' },
      { label: 'Users', href: 'https://app.example.com/identity/users/' },
    ]
    const { rerender } = render(
      <SectionNav
        label="Identity sections"
        items={items}
        current="https://app.example.com/identity/users"
      />,
    )
    expect(current()).toEqual(['Users'])
    // With no origin in `current` there is nothing to compare an item's with, and a link
    // to another site with the same path must not be marked.
    rerender(<SectionNav label="Identity sections" items={items} current="/identity/users" />)
    expect(current()).toEqual([])
  })

  it('prefers the item with exactly the `current` href, where items differ only by a query', () => {
    const ranges = [
      { label: 'This week', href: '/reports?range=week' },
      { label: 'This month', href: '/reports?range=month' },
    ]
    const { rerender } = render(
      <SectionNav label="Identity sections" items={ranges} current="/reports?range=month" />,
    )
    expect(current()).toEqual(['This month'])
    // Without an exact match the page is all there is to compare, and one item is marked.
    rerender(<SectionNav label="Identity sections" items={ranges} current="/reports/" />)
    expect(current()).toEqual(['This week'])
  })

  it('compares an href that is only a hash as it is written', () => {
    render(<SectionNav label="Identity sections" items={ITEMS} current="#roles" />)
    expect(current()).toEqual(['Roles'])
  })

  it('draws two items that share an href, and marks one of them', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const twice = [
      { label: 'Overview', href: '/identity' },
      { label: 'Summary', href: '/identity' },
    ]
    render(<SectionNav label="Identity sections" items={twice} current="/identity" />)
    expect(nav().querySelectorAll('a')).toHaveLength(2)
    expect(current()).toEqual(['Overview'])
    // React reports two children with one key as an error.
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('marks no item when `current` is absent or names no item', () => {
    const { rerender } = render(<SectionNav label="Identity sections" items={ITEMS} />)
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0)
    rerender(<SectionNav label="Identity sections" items={ITEMS} current="#elsewhere" />)
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('draws the current item in the selection colours, and the others without a fill', () => {
    render(<SectionNav label="Identity sections" items={ITEMS} current="#users" />)
    const probe = document.createElement('div')
    probe.style.cssText = 'color: var(--pm-selection-text); background: var(--pm-selection-bg)'
    document.body.append(probe)
    const selection = getComputedStyle(probe)
    const current = getComputedStyle(link('Users'))
    expect(current.backgroundColor).toBe(selection.backgroundColor)
    expect(current.color).toBe(selection.color)
    expect(getComputedStyle(link('Groups')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    probe.remove()
  })
})

describe('routing', () => {
  it('hands a click to `onNavigate` with the href, and stops the browser', async () => {
    const onNavigate = vi.fn()
    const before = window.location.hash
    render(<SectionNav label="Identity sections" items={ITEMS} onNavigate={onNavigate} />)
    await userEvent.click(link('Groups'))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#groups')
    expect(window.location.hash).toBe(before)
  })

  it('routes a click on the current item too, because it is the way back to its page', async () => {
    const onNavigate = vi.fn()
    render(
      <SectionNav
        label="Identity sections"
        items={ITEMS}
        current="#users"
        onNavigate={onNavigate}
      />,
    )
    await userEvent.click(link('Users'))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#users')
  })

  it('leaves a click with a modifier key to the browser', () => {
    const onNavigate = vi.fn()
    render(<SectionNav label="Identity sections" items={ITEMS} onNavigate={onNavigate} />)
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      expect(taken(link('Roles'), init), JSON.stringify(init)).toBe(false)
    }
    expect(onNavigate).not.toHaveBeenCalled()
    // The same dispatch without a modifier is the app's, so the loop above tests the member.
    expect(taken(link('Roles'))).toBe(true)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#roles')
  })

  it('activates an item from the keyboard', async () => {
    const onNavigate = vi.fn()
    render(<SectionNav label="Identity sections" items={ITEMS} onNavigate={onNavigate} />)
    link('Sessions').focus()
    await userEvent.keyboard('{Enter}')
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#sessions')
  })
})

describe('a narrow column', () => {
  it('wraps the row and does not scroll sideways', () => {
    render(
      <div data-testid="column" style={{ inlineSize: '240px' }}>
        <SectionNav label="Identity sections" items={ITEMS} />
      </div>,
    )
    const column = screen.getByTestId('column')
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
    const tops = new Set(
      [...nav().querySelectorAll('a')].map((item) => item.getBoundingClientRect().top),
    )
    expect(tops.size).toBeGreaterThan(1)
  })

  it('clips a label wider than the row, and keeps it inside the column', () => {
    render(
      <div data-testid="column" style={{ inlineSize: '240px' }}>
        <SectionNav
          label="Identity sections"
          items={[
            {
              label: 'Delegated administration approvals awaiting a second reviewer',
              href: '#approvals',
            },
          ]}
        />
      </div>,
    )
    const column = screen.getByTestId('column')
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth)
    const item = link('Delegated administration approvals awaiting a second reviewer')
    expect(item.getBoundingClientRect().right).toBeLessThanOrEqual(
      column.getBoundingClientRect().right,
    )
  })
})

/**
 * An agent follows a page's link through the bridge, as the spec's `agent` fence declares
 * (`design/components/section-nav.md`, Agent): the press goes to the routing seam as a person's
 * does.
 */
describe('an agent', () => {
  it('reads the pages and the current one, and follows a page through onNavigate', async () => {
    const bridge = createAgentBridge()
    try {
      const onNavigate = vi.fn()
      render(
        <SectionNav
          label="Identity sections"
          items={[...PAGES, { label: 'Users again', href: '/identity/users' }]}
          current="/identity/groups"
          onNavigate={onNavigate}
        />,
      )
      const [sections] = bridge.snapshot().members
      expect(sections).toMatchObject({
        member: 'SectionNav',
        name: 'Identity sections',
        state: {
          current: '/identity/groups/',
          // The second item that shares an `href` is not a choice of its own.
          items: [
            { id: '/identity/users', label: 'Users' },
            { id: '/identity/groups/', label: 'Groups' },
            { id: '/identity/roles', label: 'Roles' },
          ],
        },
      })
      const { results } = await bridge.act([
        { id: sections?.id, action: 'choose', value: '/identity/roles' },
      ])
      expect(results[0]).toMatchObject({ ok: true })
      expect(onNavigate).toHaveBeenCalledWith('/identity/roles')
    } finally {
      bridge.dispose()
    }
  })
})
