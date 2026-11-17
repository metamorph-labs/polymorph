import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { Button } from '../controls/Button'
import { Menu } from '../overlays/Menu'

import { Table } from '../structure/Table'
import { agentRegistrations, fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { Grid } from '../layout/Grid'
import { Card } from '../structure/Card'
import { Stat } from '../structure/Stat'
import {
  AppShell,
  type AppShellProps,
  type NavGroupProps,
  type NavItemProps,
  type UserCardProps,
} from './AppShell'
import { reactAdapter } from '../conformance/react'
import { states as appShellStates } from './app-shell.states'
import { ListPage, type ListPageProps } from './ListPage'

/**
 * The archetypes, which own the pattern-scoped tokens. These tests check two
 * things. The tokens are declared on the root, so they exist only while the
 * pattern is mounted and a change is a one-line edit. And the hierarchy the
 * slots define is actually enforced.
 */

beforeAll(installTestTheme)

const EMPTY = { title: 'No tickets yet', description: 'Nothing has arrived.' }

function Tickets() {
  return (
    <Table label="Tickets">
      <Table.Body>
        <Table.Row>
          <Table.Cell>T-1041</Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table>
  )
}

function shell(props?: Partial<AppShellProps>) {
  const { container } = render(
    <AppShell sidebar={<Button variant="ghost" tone="neutral" label="Inbox" />} {...props}>
      <p>page</p>
    </AppShell>,
  )
  return container.firstElementChild as HTMLElement
}

function readVar(node: Element, name: string): string {
  return getComputedStyle(node).getPropertyValue(name).trim()
}

/**
 * The value of a pattern token inside its own scope, in pixels.
 *
 * `getPropertyValue` returns the declaration text, which is a `calc()` because
 * these tokens are computed from space tokens. To get the number, the browser
 * must evaluate it, which needs a probe element inside the scope. That is also
 * the only place a scoped token has a value.
 */
function scopedLength(scope: Element, name: string): number {
  const probe = document.createElement('div')
  probe.style.inlineSize = `var(${name})`
  scope.append(probe)
  const value = Number.parseFloat(getComputedStyle(probe).inlineSize)
  probe.remove()
  return value
}

describe('the closed surfaces', () => {
  it('leave no way to style either archetype from a call site', () => {
    assertGoverned<AppShellProps>(true)
    assertGoverned<ListPageProps>(true)
  })
})

describe('AppShell — the pattern scope', () => {
  it('declares its tokens on its own root, and nowhere above it', () => {
    const root = shell()
    for (const token of [
      '--pm-shell-topbar-height',
      '--pm-shell-sidebar-width',
      '--pm-shell-sidebar-width-collapsed',
    ]) {
      expect(readVar(root, token), token).not.toBe('')
      // This is what makes them pattern-scoped: they do not exist on a page with
      // no shell.
      expect(readVar(document.documentElement, token), token).toBe('')
    }
  })

  it('builds the frame from them, so a change is a one-line edit', () => {
    const root = shell()
    const topbar = root.querySelector('header') as HTMLElement
    expect(topbar.getBoundingClientRect().height).toBeCloseTo(
      scopedLength(root, '--pm-shell-topbar-height'),
      0,
    )
    const sidebar = screen.getByRole('navigation', { name: 'Primary' })
    expect(sidebar.getBoundingClientRect().width).toBeCloseTo(
      scopedLength(root, '--pm-shell-sidebar-width'),
      0,
    )
  })

  it('scales them with density, because they are computed from space tokens', () => {
    const root = shell()
    const standard = scopedLength(root, '--pm-shell-sidebar-width')

    root.setAttribute('data-density', 'compact')
    const compact = scopedLength(root, '--pm-shell-sidebar-width')
    expect(compact).toBeLessThan(standard)
    root.removeAttribute('data-density')
  })
})

describe('AppShell — the frame', () => {
  it('puts the landmarks where a reader expects them', () => {
    shell({ topbar: { trailing: <Button size="sm" label="New" /> } })
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
    expect(screen.getByRole('banner')).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
  })

  it('contains no h1, because the page inside it has the only one', () => {
    const root = shell()
    expect(root.querySelector('h1')).toBeNull()
  })

  it('renders the topbar whether or not it was given anything', () => {
    const bare = shell()
    expect(
      (bare.querySelector('header') as HTMLElement).getBoundingClientRect().height,
    ).toBeGreaterThan(0)
  })

  it('starts with a skip link that stays hidden until it is focused', async () => {
    const root = shell()
    const skip = root.querySelector('a') as HTMLAnchorElement
    expect(root.firstElementChild).toBe(skip)
    expect(skip.getAttribute('href')).toBe('#content')
    expect(skip.getBoundingClientRect().top).toBeLessThan(0)

    skip.focus({ focusVisible: true } as FocusOptions)
    await vi.waitFor(() => expect(skip.getBoundingClientRect().top).toBeGreaterThanOrEqual(0))
    expect(getComputedStyle(skip).outlineStyle).toBe('solid')
  })

  it('points the skip link at the content region it names', () => {
    shell()
    expect(screen.getByRole('main').id).toBe('content')
  })
})

describe('AppShell — collapse', () => {
  it('narrows the rail to the collapsed token', () => {
    const root = shell({ defaultCollapsed: true })
    expect(root.dataset['collapsed']).toBe('')
    const sidebar = screen.getByRole('navigation', { name: 'Primary' })
    expect(sidebar.getBoundingClientRect().width).toBeCloseTo(
      scopedLength(root, '--pm-shell-sidebar-width-collapsed'),
      0,
    )
  })

  it('toggles from a real button whose label says what will happen', async () => {
    const onCollapsedChange = vi.fn()
    const root = shell({ onCollapsedChange })
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
    expect(root.dataset['collapsed']).toBe('')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
  })

  it('animates only the width, its one structural change', () => {
    const root = shell()
    const transition = getComputedStyle(root).transitionProperty
    expect(transition).toContain('grid-template-columns')
  })

  it('keeps the rail content visible when it is narrow', () => {
    // The shell hides only its own item's label. In content it did not compose
    // it cannot tell a label from an icon, and hiding the whole nav would make
    // the collapsed rail useless. Adapting that content is the application's
    // job, and `overflow: hidden` clips what does not fit.
    const root = shell({ defaultCollapsed: true })
    const nav = root.querySelector('nav > div') as HTMLElement
    expect(getComputedStyle(nav).opacity).toBe('1')
    expect(getComputedStyle(screen.getByRole('navigation', { name: 'Primary' })).overflow).toBe(
      'hidden',
    )
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeTruthy()
  })

  it('is shown in the fixture with a brand the narrow rail has room for', () => {
    // The brand is the application's content, so the rail cuts a wordmark at both
    // ends. The collapsed entries pass a mark, as an application does.
    const collapsed = appShellStates.entries.filter((entry) => entry.name.includes('collapsed'))
    expect(collapsed.length).toBeGreaterThan(0)
    for (const entry of collapsed) {
      const view = render(<>{entry.render()}</>)
      const rail = screen.getByRole('navigation', { name: 'Primary' })
      // The head row's first child is the brand row, and its child is what the caller passed.
      const brand = rail.firstElementChild?.firstElementChild?.firstElementChild as HTMLElement
      const box = brand.getBoundingClientRect()
      expect(box.width, entry.name).toBeGreaterThan(0)
      expect(box.left, entry.name).toBeGreaterThanOrEqual(rail.getBoundingClientRect().left)
      expect(box.right, entry.name).toBeLessThanOrEqual(rail.getBoundingClientRect().right)
      view.unmount()
    }
  })
})

/**
 * An agent and the shell (`design/archetypes/app-shell.md`, Agent): it collapses and expands the
 * rail through the shell's own toggle in both forms, and reads the drawer. The two toggles are
 * withheld, and the rail's own members are listed within the shell.
 */
describe('AppShell — an agent', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('collapses an uncontrolled and a controlled rail, and reaches neither toggle', async () => {
    const free = vi.fn()
    const held = vi.fn()
    function Held() {
      const [collapsed, setCollapsed] = useState(true)
      return (
        <AppShell
          sidebar={<p>Held rail</p>}
          collapsed={collapsed}
          onCollapsedChange={(next) => {
            held(next)
            setCollapsed(next)
          }}
          messages={{
            primaryNavigation: 'Held',
            expandSidebar: 'Expand',
            collapseSidebar: 'Collapse',
            closeNavigation: 'Close',
            openNavigation: 'Open',
          }}
        >
          <p>page</p>
        </AppShell>
      )
    }
    shell({ onCollapsedChange: free })
    render(<Held />)
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name, member.within])).toEqual([
        ['AppShell', 'Primary', undefined],
        ['Button', 'Inbox', members[0]?.id],
        ['AppShell', 'Held', undefined],
      ])
      const [one, , two] = members
      // The rail holds a Button and no NavItem, so it offers no destination.
      expect(one?.state).toEqual({ collapsed: false, open: false, destinations: [], current: null })
      const collapsed = await bridge.act([{ id: one?.id, action: 'collapse' }])
      expect(collapsed.results[0]).toMatchObject({
        ok: true,
        changed: { collapsed: { from: false, to: true } },
      })
      expect(free).toHaveBeenCalledWith(true)
      const expanded = await bridge.act([{ id: two?.id, action: 'expand' }])
      expect(expanded.results[0]).toMatchObject({
        ok: true,
        changed: { collapsed: { from: true, to: false } },
      })
      expect(held).toHaveBeenCalledWith(false)
      // Each shell's collapse toggle in its rail and drawer button in its topbar.
      const unlisted = agentRegistrations().filter(
        ({ member, id }) => member === 'Button' && !members.some((listed) => listed.id === id),
      )
      expect(unlisted).toHaveLength(4)
      for (const { id } of unlisted) {
        const { results } = await bridge.act([{ id, action: 'press' }])
        expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      }
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to collapse a rail that is a drawer or is not drawn, and reads the drawer', async () => {
    const onCollapsedChange = vi.fn()
    const { unmount } = render(
      <AppShell sidebar={<p>rail</p>} navigation="top" onCollapsedChange={onCollapsedChange}>
        <p>page</p>
      </AppShell>,
    )
    const bridge = createAgentBridge()
    try {
      const refused = async () => {
        const [shellMember] = bridge.snapshot().members
        for (const action of ['collapse', 'expand']) {
          const { results } = await bridge.act([{ id: shellMember?.id, action }])
          expect(results[0]).toMatchObject({
            ok: false,
            error: { code: 'failed', message: expect.stringContaining('no width to change') },
          })
        }
      }
      await refused()
      unmount()
      shell({ onCollapsedChange })
      await page.viewport(600, 800)
      await refused()
      expect(onCollapsedChange).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      await vi.waitFor(() => expect(bridge.snapshot().members[0]?.state['open']).toBe(true))
    } finally {
      bridge.dispose()
    }
  })

  it('opens and closes the drawer as its menu button does, and refuses where there is none', async () => {
    shell()
    const bridge = createAgentBridge()
    try {
      const id = bridge.snapshot().members[0]?.id
      for (const action of ['open', 'close']) {
        const { results } = await bridge.act([{ id, action }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining('There is no drawer here') },
        })
      }
      await page.viewport(600, 800)
      const menu = await vi.waitFor(() => screen.getByRole('button', { name: 'Open navigation' }))
      const opened = await bridge.act([{ id, action: 'open' }])
      expect(opened.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: false, to: true } },
      })
      // Focus follows the drawer into the rail, as after a press on the button.
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('navigation', { name: 'Primary' })),
      )
      const closed = await bridge.act([{ id, action: 'close' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: true, to: false } },
      })
      await vi.waitFor(() => expect(document.activeElement).toBe(menu))
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * An agent and the application's destinations (`design/archetypes/app-shell.md`, Agent): the
 * shell reads its NavItems from its navigation in the document, marks the current one, and goes to
 * one by pressing it. The conformance law runs `go` on every renderer and sees the press; these
 * tests hold what it does not see.
 */
describe('AppShell — an agent goes to a destination', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  /** A rail with two groups whose Settings share a label, links and buttons, and a foot. */
  function Rail({
    current = '/inbox',
    navigation,
    onNavigate,
    onSelect,
  }: {
    /** The `href` of the current item, or `null` for none. */
    current?: string | null
    navigation?: 'rail' | 'top'
    onNavigate?: (href: string) => void
    onSelect?: () => void
  }) {
    return (
      <AppShell
        navigation={navigation}
        sidebar={
          <>
            <AppShell.NavGroup label="Platform">
              <AppShell.NavItem
                icon="inbox"
                label="Inbox"
                href="/inbox"
                current={current === '/inbox'}
                onNavigate={onNavigate}
              />
              <AppShell.NavItem
                icon="archive"
                label="Archive"
                href="/archive"
                current={current === '/archive'}
                onNavigate={onNavigate}
              />
              <AppShell.NavItem icon="settings" label="Settings" onSelect={onSelect} />
            </AppShell.NavGroup>
            <AppShell.NavGroup label="Workspace">
              <AppShell.NavItem icon="settings" label="Settings" />
            </AppShell.NavGroup>
          </>
        }
        sidebarFooter={<AppShell.NavItem icon="user" label="Rowan" href="/profile" />}
      >
        <p>page</p>
      </AppShell>
    )
  }

  const DESTINATIONS = [
    { id: '/inbox', label: 'Inbox' },
    { id: '/archive', label: 'Archive' },
    { id: 'Platform / Settings', label: 'Settings' },
    { id: 'Workspace / Settings', label: 'Settings' },
    { id: '/profile', label: 'Rowan' },
  ]

  it('reads every NavItem, the foot’s included, and marks the current one', () => {
    const { rerender } = render(<Rail />)
    const bridge = createAgentBridge()
    try {
      const [shellMember] = bridge.snapshot().members
      expect(shellMember?.state['destinations']).toEqual(DESTINATIONS)
      expect(shellMember?.state['current']).toBe('/inbox')
      rerender(<Rail current="/archive" />)
      expect(bridge.snapshot().members[0]?.state['current']).toBe('/archive')
      rerender(<Rail current={null} />)
      expect(bridge.snapshot().members[0]?.state['current']).toBeNull()
    } finally {
      bridge.dispose()
    }
  })

  it('reads the same destinations in the rail, along the top and in the drawer, open or closed', async () => {
    const { rerender } = render(<Rail />)
    const bridge = createAgentBridge()
    const read = () => {
      const [shellMember] = bridge.snapshot().members
      return [shellMember?.state['destinations'], shellMember?.state['current']]
    }
    try {
      expect(read()).toEqual([DESTINATIONS, '/inbox'])
      rerender(<Rail navigation="top" />)
      expect(read()).toEqual([DESTINATIONS, '/inbox'])
      await page.viewport(600, 800)
      const nav = document.querySelector('nav[aria-label="Primary"]') as HTMLElement
      await vi.waitFor(() => expect(getComputedStyle(nav).visibility).toBe('hidden'))
      // The closed drawer keeps its items in the document, out of sight.
      expect(read()).toEqual([DESTINATIONS, '/inbox'])
      const id = bridge.snapshot().members[0]?.id
      await bridge.act([{ id, action: 'open' }])
      expect(bridge.snapshot().members[0]?.state['open']).toBe(true)
      expect(read()).toEqual([DESTINATIONS, '/inbox'])
    } finally {
      bridge.dispose()
    }
  })

  it('goes to a link through onNavigate, as a press does', async () => {
    const onNavigate = vi.fn()
    render(<Rail onNavigate={onNavigate} />)
    const bridge = createAgentBridge()
    try {
      const id = bridge.snapshot().members[0]?.id
      const { results } = await bridge.act([{ id, action: 'go', value: '/archive' }])
      expect(results[0]).toMatchObject({ ok: true, id })
      expect(onNavigate).toHaveBeenCalledOnce()
      expect(onNavigate).toHaveBeenCalledWith('/archive')
    } finally {
      bridge.dispose()
    }
  })

  it('goes to a link with no onNavigate through the anchor’s own click, and to a button', async () => {
    const onSelect = vi.fn()
    render(<Rail onSelect={onSelect} />)
    const clicks: { href: string | null; followed: boolean }[] = []
    // Last on the way out, after the shell's own handlers: the click the browser would follow.
    // The test stops the browser there, so the page under test stays.
    const followed = (event: Event) => {
      const link = (event.target as Element).closest('a')
      clicks.push({ href: link?.getAttribute('href') ?? null, followed: !event.defaultPrevented })
      event.preventDefault()
    }
    window.addEventListener('click', followed)
    const bridge = createAgentBridge()
    try {
      const id = bridge.snapshot().members[0]?.id
      const link = await bridge.act([{ id, action: 'go', value: '/profile' }])
      expect(link.results[0]).toMatchObject({ ok: true })
      expect(clicks).toEqual([{ href: '/profile', followed: true }])
      const button = await bridge.act([{ id, action: 'go', value: 'Platform / Settings' }])
      expect(button.results[0]).toMatchObject({ ok: true })
      expect(onSelect).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('click', followed)
      bridge.dispose()
    }
  })

  it('refuses a destination the document marks disabled, and presses nothing', async () => {
    const onNavigate = vi.fn()
    render(<Rail onNavigate={onNavigate} />)
    // A NavItem takes no `disabled`; the mark stands for an item another component draws disabled.
    document.querySelector('a[href="/archive"]')?.setAttribute('aria-disabled', 'true')
    const bridge = createAgentBridge()
    try {
      const [shellMember] = bridge.snapshot().members
      expect(shellMember?.state['destinations']).toContainEqual({
        id: '/archive',
        label: 'Archive',
        disabled: true,
      })
      const { results } = await bridge.act([
        { id: shellMember?.id, action: 'go', value: '/archive' },
      ])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      const unknown = await bridge.act([{ id: shellMember?.id, action: 'go', value: 'Settings' }])
      expect(unknown.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(onNavigate).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * The shell owns its nav item. Button centres its content and has no alignment
 * prop by design, so a stretched Button cannot be a nav row. Under the
 * promotion rule (repeated escape-hatch use for a recurring need means the
 * pattern joins the vocabulary), the shell owns the item as ListPage owns its
 * slots.
 */
describe('AppShell.NavItem', () => {
  function mountItem(node: React.ReactElement): HTMLElement {
    return render(node).container.firstElementChild as HTMLElement
  }

  function rail(props?: Partial<React.ComponentProps<typeof AppShell.NavItem>>) {
    const { container } = render(<AppShell.NavItem icon="inbox" label="Inbox" {...props} />)
    return container.firstElementChild as HTMLElement
  }

  it('has no style escape hatch', () => {
    assertGoverned<NavItemProps>(true)
  })

  it('is a real button, not a div with a click handler', async () => {
    const onSelect = vi.fn()
    rail({ onSelect })
    const item = screen.getByRole('button', { name: 'Inbox' })

    await userEvent.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)

    // A real button handles the keyboard with no extra code.
    item.focus()
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('is start-aligned, which is why it is not a Button', () => {
    const short = rail({ label: 'Inbox' })
    const long = rail({ label: 'Escalations awaiting a second reviewer' })

    const glyphX = (item: HTMLElement) =>
      (item.querySelector('svg') as SVGElement).getBoundingClientRect().left -
      item.getBoundingClientRect().left

    expect(getComputedStyle(short).justifyContent).toBe('flex-start')
    expect(glyphX(short)).toBeCloseTo(glyphX(long), 1)
  })

  it('marks the current page visually and for screen readers', () => {
    const current = rail({ current: true })
    expect(current.dataset['current']).toBe('')
    expect(current.getAttribute('aria-current')).toBe('page')

    const rest = rail()
    expect(rest.hasAttribute('data-current')).toBe(false)
    expect(rest.getAttribute('aria-current')).toBeNull()
    expect(getComputedStyle(current).backgroundColor).not.toBe(
      getComputedStyle(rest).backgroundColor,
    )
  })

  it("gives selection precedence over hover, as Table's rows do", async () => {
    const current = rail({ current: true })
    const before = getComputedStyle(current).backgroundColor
    await userEvent.hover(current)
    expect(getComputedStyle(current).backgroundColor).toBe(before)
  })

  it('truncates a long label instead of wrapping the rail', () => {
    const item = rail({ label: 'Escalations awaiting a second reviewer' })
    const label = item.querySelector('span:nth-of-type(2)') as HTMLElement
    expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
    expect(item.getBoundingClientRect().height).toBeCloseTo(
      rail({ label: 'Inbox' }).getBoundingClientRect().height,
      0,
    )
  })

  /**
   * The root swap (`link.md`). Rail items rendered as buttons cannot be
   * middle-clicked, have their link copied, or be opened in a new tab, and no
   * click handler can provide those.
   */
  it('is a real link when it has an href', async () => {
    const onSelect = vi.fn()
    // A fragment, because this is a real anchor. An absolute path would
    // navigate the test's own iframe away from the runner. That is correct
    // component behaviour, but it breaks the test.
    render(<AppShell.NavItem icon="inbox" label="Inbox" href="#inbox" onSelect={onSelect} />)

    const item = screen.getByRole('link', { name: 'Inbox' })
    expect(item.tagName).toBe('A')
    expect(item.getAttribute('href')).toBe('#inbox')

    // `onSelect` still fires on the link. A router takes the click through
    // `onNavigate` instead, which the next test holds.
    await userEvent.click(item)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('hands a click that would navigate this tab to onNavigate, and leaves the rest to the browser', async () => {
    // `link.md` §Routing: the row keeps its real destination, so a click with a
    // modifier key opens a tab, and only the click that would move this tab is
    // the app's router's.
    const onNavigate = vi.fn()
    const onSelect = vi.fn()
    render(
      <AppShell.NavItem
        icon="inbox"
        label="Inbox"
        href="#inbox"
        onNavigate={onNavigate}
        onSelect={onSelect}
      />,
    )
    const item = screen.getByRole('link', { name: 'Inbox' })
    const decisions: boolean[] = []
    // Hears each click after the row, records whether the row took it, and
    // stops the browser's navigation either way so the runner's page stays.
    const watch = (event: MouseEvent) => {
      decisions.push(event.defaultPrevented)
      event.preventDefault()
    }
    document.addEventListener('click', watch)
    await userEvent.click(item)
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))
    document.removeEventListener('click', watch)

    expect(decisions).toEqual([true, false])
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#inbox')
    // `onSelect` keeps firing on every click, as it did before the seam.
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('has no navigation to route without an href', async () => {
    const onNavigate = vi.fn()
    render(<AppShell.NavItem icon="inbox" label="Inbox" onNavigate={onNavigate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Inbox' }))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('marks the current page in either root', () => {
    render(<AppShell.NavItem label="Inbox" href="#inbox" current />)
    const item = screen.getByRole('link', { name: 'Inbox' })
    expect(item.getAttribute('aria-current')).toBe('page')
    expect(item.dataset['current']).toBe('')
  })

  it('looks the same in either root', () => {
    // Link's semantics with NavItem's recipe. The two roots must look identical,
    // or the rail would shift when an item gained an href.
    const asButton = mountItem(<AppShell.NavItem icon="inbox" label="Inbox" />)
    const asLink = mountItem(<AppShell.NavItem icon="inbox" label="Inbox" href="#inbox" />)

    for (const property of [
      'blockSize',
      'paddingInlineStart',
      'justifyContent',
      'color',
    ] as const) {
      expect(getComputedStyle(asLink)[property], property).toBe(
        getComputedStyle(asButton)[property],
      )
    }
  })

  it('keeps its name when the rail collapses, and only hides the visible label', () => {
    render(
      <AppShell defaultCollapsed sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}>
        <p>page</p>
      </AppShell>,
    )

    // Still findable by name, because the label is clipped, not unmounted.
    // Otherwise the collapsed rail would be unusable.
    const item = screen.getByRole('button', { name: 'Inbox' })
    const label = item.querySelector('span:nth-of-type(2)') as HTMLElement

    expect(label.getBoundingClientRect().width).toBeLessThan(2)
    expect(item.querySelector('svg')).not.toBeNull()
    expect(getComputedStyle(item).justifyContent).toBe('center')
  })

  it('shows a tooltip only when the rail is collapsed', async () => {
    // Screen readers do not need it, because the label is clipped, not
    // unmounted. The tooltip is for sighted pointer users, who would otherwise
    // see only a glyph.
    const bubble = () => document.querySelector('[data-motion-pattern]')

    render(
      <AppShell defaultCollapsed sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}>
        <p>page</p>
      </AppShell>,
    )
    // Focus, not hover, for the same reason Tooltip's own suite uses it: focus
    // is deterministic, and both open the same bubble.
    screen.getByRole('button', { name: 'Inbox' }).focus()
    await vi.waitFor(() => expect(bubble()).not.toBeNull(), { timeout: 3000 })
    expect(bubble()?.textContent).toBe('Inbox')

    // The shell provides the tooltip context itself, so this works without a
    // provider from the caller. Otherwise the frame would throw when it
    // collapses.
    cleanup()

    render(
      <AppShell sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}>
        <p>page</p>
      </AppShell>,
    )
    screen.getByRole('button', { name: 'Inbox' }).focus()
    // When expanded, the label is visible, and a tooltip repeating it is the
    // standard tooltip misuse.
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(bubble()).toBeNull()
  })
})

/**
 * AppShell.NavGroup. A rail is made of labelled sections, as in the spec and
 * the common sidebar composition.
 */
describe('AppShell.NavGroup', () => {
  function grouped(props?: Partial<AppShellProps>) {
    const { container } = render(
      <AppShell
        sidebar={
          <>
            <AppShell.NavGroup label="Platform">
              <AppShell.NavItem icon="inbox" label="Inbox" current />
              <AppShell.NavItem icon="add" label="New ticket" />
            </AppShell.NavGroup>
            <AppShell.NavGroup label="Workspace">
              <AppShell.NavItem icon="settings" label="Settings" />
            </AppShell.NavGroup>
          </>
        }
        {...props}
      >
        <p>page</p>
      </AppShell>,
    )
    return container.firstElementChild as HTMLElement
  }

  it('has no style escape hatch', () => {
    assertGoverned<NavGroupProps>(true)
  })

  it('names its section for screen readers as well as showing it', () => {
    grouped()
    const platform = screen.getByRole('group', { name: 'Platform' })
    expect(platform.textContent).toContain('Platform')
    expect(platform.contains(screen.getByRole('button', { name: 'Inbox' }))).toBe(true)
    expect(platform.contains(screen.getByRole('button', { name: 'Settings' }))).toBe(false)
  })

  it('writes its label in the one section-heading recipe, not a second one', () => {
    grouped()
    const label = screen.getByText('Platform')
    expect(getComputedStyle(label).textTransform).toBe('uppercase')
  })

  it('does not put a heading above the page’s only h1', () => {
    const root = grouped()
    // A rail is not a document outline, and five sections would add five headings.
    expect(root.querySelectorAll('h1, h2, h3')).toHaveLength(0)
  })

  it('removes the label when the rail collapses, and keeps the name', () => {
    grouped({ defaultCollapsed: true })
    // Removed, not clipped, because a heading for a boundary that is no longer
    // drawn would announce a section nobody can see.
    expect(getComputedStyle(screen.getByText('Platform')).display).toBe('none')
    // Assistive technology still gets the structure.
    expect(screen.getByRole('group', { name: 'Platform' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeTruthy()
  })
})

/**
 * AppShell.UserCard: the rail's foot.
 *
 * These tests cover the three reasons it is built in and not composed: two text
 * tiers, truncation in a fixed-width rail, and adapting to the collapse without
 * the application handling it.
 */
describe('AppShell.UserCard', () => {
  const LONG = {
    name: 'Aleksandra Wiśniewska-Kowalczyk',
    detail: 'aleksandra.wisniewska@northwind-logistics.example',
  }

  function railWith(props?: Partial<AppShellProps>) {
    const { container } = render(
      <AppShell
        sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}
        sidebarFooter={
          <AppShell.UserCard
            name="Rowan Ellis"
            detail="rowan@relay.example"
            end={
              <Button
                variant="ghost"
                tone="neutral"
                size="sm"
                iconOnly
                icon="overflow"
                label="Account"
              />
            }
          />
        }
        {...props}
      >
        <p>page</p>
      </AppShell>,
    )
    return container.firstElementChild as HTMLElement
  }

  it('has no style escape hatch', () => {
    assertGoverned<UserCardProps>(true)
  })

  it('gives the two lines two tiers, which a composition cannot reach', () => {
    railWith()
    const name = getComputedStyle(screen.getByText('Rowan Ellis'))
    const detail = getComputedStyle(screen.getByText('rowan@relay.example'))

    // One step smaller and one tone lighter. `Text` stops at `sm` and its lowest
    // tone is `secondary`, so a composed pair would be the same size and nearly
    // the same colour, reading as two names instead of a name and an address.
    expect(Number.parseFloat(detail.fontSize)).toBeLessThan(Number.parseFloat(name.fontSize))
    expect(detail.color).not.toBe(name.color)
  })

  it('truncates both lines instead of letting the rail clip them mid-glyph', () => {
    render(
      <AppShell
        sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}
        sidebarFooter={<AppShell.UserCard {...LONG} />}
      >
        <p>page</p>
      </AppShell>,
    )
    const rail = screen.getByRole('navigation', { name: 'Primary' })
    for (const text of [LONG.name, LONG.detail]) {
      const line = screen.getByText(text)
      expect(getComputedStyle(line).textOverflow, text).toBe('ellipsis')
      // The line stays inside the rail, which is the purpose of the ellipsis.
      expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(
        rail.getBoundingClientRect().right + 1,
      )
    }
  })

  it('is a row, not a control, and the only control is the one in the slot', () => {
    railWith()
    // The footer has one button, the menu trigger. If the row were itself a
    // button, the name would not be selectable and the trigger would be a
    // nested interactive element.
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Rowan Ellis/ })).toBeNull()
  })

  it('adapts to the collapse on its own, which is why it belongs to the shell', () => {
    railWith({ defaultCollapsed: true })

    // The name is clipped, not unmounted, so screen readers still read it.
    const name = screen.getByText('Rowan Ellis')
    expect(name.getBoundingClientRect().width).toBeLessThan(2)

    // The avatar stays and centres in the remaining width. `.userText` is a
    // span, so the row is the nearest div above it.
    const card = name.closest('div') as HTMLElement
    expect(getComputedStyle(card).justifyContent).toBe('center')
    expect(card.querySelector('svg, img, span[data-size]')).not.toBeNull()

    // The control leaves the tab order instead of being clipped to a pixel. An
    // invisible trigger with an off-screen focus ring is what the drawer's
    // `visibility: hidden` also prevents.
    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull()
  })
})

/**
 * The small viewport, the spec's deferred case. Below the reading width, two
 * columns leave only a rail and a narrow gutter, so the rail leaves the grid
 * and becomes a drawer over the content.
 *
 * The breakpoint depends on the viewport, so the tests set the viewport
 * explicitly instead of relying on a default.
 */
describe('AppShell — the drawer', () => {
  const NARROW = 600
  const WIDE = 1280

  async function narrow() {
    await page.viewport(NARROW, 800)
  }

  afterEach(async () => {
    await page.viewport(WIDE, 800)
  })

  it('takes the rail out of the grid and puts it over the page', async () => {
    const root = shell()
    const sidebar = screen.getByRole('navigation', { name: 'Primary' })
    await narrow()

    await vi.waitFor(() => expect(getComputedStyle(sidebar).position).toBe('fixed'))
    // It slides off instead of jumping, so the assertion must wait out the
    // transition. It ends closed, not only out of view.
    await vi.waitFor(() => expect(sidebar.getBoundingClientRect().right).toBeLessThanOrEqual(0))
    await vi.waitFor(() => expect(getComputedStyle(sidebar).visibility).toBe('hidden'))
    expect(root.dataset['drawer']).toBeUndefined()
  })

  it('cannot be reached by keyboard while it is closed', async () => {
    shell()
    const sidebar = screen.getByRole('navigation', { name: 'Primary' })
    await narrow()

    // A rail moved off-screen by a transform keeps its tab order, so a keyboard
    // user could tab into it and lose the focus ring off-screen.
    // `visibility: hidden` removes it from the tab order and the accessibility
    // tree together, which matches the state: the navigation is now behind a
    // button.
    await vi.waitFor(() => expect(screen.queryByRole('navigation')).toBeNull())
    expect(sidebar.isConnected).toBe(true)
  })

  it('moves focus with the drawer, in both directions', async () => {
    shell()
    await narrow()
    const menu = await vi.waitFor(() => screen.getByRole('button', { name: 'Open navigation' }))

    // The rail comes before the topbar in the DOM, so a Tab from the button that
    // opened it would move past the navigation that just opened.
    await userEvent.click(menu)
    // Immediately, not after a frame. The rail is `visibility: hidden` while the
    // drawer is closed, and a transitioned `visibility` would still be hidden
    // when this effect runs. That is why the stylesheet removes it from the
    // transition when opening.
    expect(document.activeElement).toBe(screen.getByRole('navigation', { name: 'Primary' }))

    // Close through the scrim, as a pointer user would. The topbar's own toggle
    // is under the scrim while the drawer is open, as on any phone drawer.
    const [, scrim] = screen.getAllByRole('button', { name: 'Close navigation' })
    await userEvent.click(scrim as HTMLElement)
    await vi.waitFor(
      () =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Open navigation' }),
        ),
      { timeout: 3000 },
    )
  })

  it('offers no collapse toggle, because there is nothing to collapse', async () => {
    shell()
    await narrow()
    await userEvent.click(
      await vi.waitFor(() => screen.getByRole('button', { name: 'Open navigation' })),
    )
    // A strip of glyphs floating over the content is not a useful state.
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /sidebar/ })).toBeNull())
  })

  it('opens from the topbar menu button', async () => {
    const root = shell()
    await narrow()

    const menu = await vi.waitFor(() => screen.getByRole('button', { name: 'Open navigation' }))
    await userEvent.click(menu)
    expect(root.dataset['drawer']).toBe('')
    const sidebar = screen.getByRole('navigation', { name: 'Primary' })
    await vi.waitFor(() => expect(sidebar.getBoundingClientRect().left).toBeCloseTo(0, 0))

    // The label says what the button will do next, as the collapse toggle's
    // does. There are now two such buttons, the toggle and the scrim, because
    // closing the drawer must work by keyboard as well as by tapping beside it.
    expect(screen.getAllByRole('button', { name: 'Close navigation' })).toHaveLength(2)
  })

  it('closes from a real button, not from a div beside it', async () => {
    const root = shell()
    await narrow()
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    // Two buttons now have the same name, the toggle and the scrim, and both do
    // the same thing. Closing must work by keyboard as well as by tapping beside
    // the drawer.
    const [, scrim] = screen.getAllByRole('button', { name: 'Close navigation' })
    await userEvent.click(scrim as HTMLElement)
    expect(root.dataset['drawer']).toBeUndefined()
  })

  it('closes when the page changes, because the reader chose the page from it', async () => {
    // With the app's own router the shell stays mounted from page to page, so
    // a drawer left open would cover the page just chosen. iOS and Android
    // close theirs the same way.
    const frame = (key: string) => (
      <AppShell
        sidebar={<AppShell.NavItem icon="inbox" label="Inbox" href="#inbox" />}
        transitionKey={key}
      >
        <p>page</p>
      </AppShell>
    )
    const { container, rerender } = render(frame('/tickets'))
    const root = container.firstElementChild as HTMLElement
    await narrow()
    await userEvent.click(
      await vi.waitFor(() => screen.getByRole('button', { name: 'Open navigation' })),
    )
    expect(root.dataset['drawer']).toBe('')

    // The same page keeps it open.
    rerender(frame('/tickets'))
    expect(root.dataset['drawer']).toBe('')

    rerender(frame('/settings'))
    expect(root.dataset['drawer']).toBeUndefined()
    // Focus returns to the button that opened it, as when it is closed by hand.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open navigation' })),
    )
  })

  it('is absent from the wide frame', () => {
    shell()
    // Hidden by CSS, not by a JavaScript media query, so the layout decision
    // stays in the stylesheet where a change is a one-line edit. `display: none`
    // removes it from the accessibility tree as well as the screen, so this
    // test checks both.
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull()
    expect(document.querySelector('button[aria-label="Open navigation"]')).not.toBeNull()
  })

  it('puts an overlay opened from the rail above it, so the sheet scrim gets the tap', async () => {
    // The bug this guards against: a drawer-mode rail with a raw z-index and
    // portalled overlays with none would open a menu sheet from the rail
    // underneath the rail. The rail would show through the scrim, and a tap
    // meant to dismiss would land on navigation. The stacking scale fixes the
    // order: the rail uses `--pm-z-shell`, every portalled overlay surface uses
    // `--pm-z-overlay` above it, and a tap over the rail's box goes to the
    // sheet's scrim. The drawer deliberately does not close when the overlay
    // opens, because with the layers in order, closing the reader's context
    // under the sheet would only lose state.
    render(
      <AppShell
        sidebar={
          <Menu
            trigger={<Button variant="ghost" tone="neutral" label="Ticket actions" />}
            items={[{ label: 'Assign to me', onSelect: () => {} }]}
          />
        }
      >
        <p>page</p>
      </AppShell>,
    )
    // 420 is below both the drawer breakpoint (48rem) and the sheet breakpoint
    // (30rem), and the bug needs both at once.
    await page.viewport(420, 800)

    await userEvent.click(
      await vi.waitFor(() => screen.getByRole('button', { name: 'Open navigation' })),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ticket actions' }))

    // The menu uses the sheet presentation (its attributes are defined in
    // `design/components/README.md`) and its scrim is shown.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-presentation="sheet"]')).not.toBeNull(),
    )
    const sheetScrim = document.querySelector('[data-motion-pattern="fade"]') as HTMLElement
    expect(sheetScrim).not.toBeNull()

    const rail = screen.getByRole('navigation', { name: 'Primary' })
    const rect = rail.getBoundingClientRect()
    // Inside the rail's box, well above the bottom sheet's maximum height
    // (66dvh of 800 leaves everything under y≈272 to the scrim).
    await vi.waitFor(() => {
      const at = document.elementFromPoint(rect.left + rect.width / 2, 120)
      expect(at, 'the tap over the rail belongs to the sheet’s scrim').toBe(sheetScrim)
    })
  })
})

/**
 * `navigation="top"` (`app-shell.md` §Navigation on top): the same nav, laid
 * along the frame's top row at frame widths, and the same drawer below the
 * breakpoint. `appShellTopLaw`, below, holds the row, the groups and the
 * drawer. These tests hold what the React frame adds to it.
 */
describe('AppShell — the navigation on top', () => {
  const WIDE = 1280

  beforeEach(async () => {
    await page.viewport(WIDE, 800)
  })

  afterEach(async () => {
    await page.viewport(WIDE, 800)
  })

  const ITEMS = ['Inbox', 'Archive', 'Settings']

  function onTop(props?: Partial<AppShellProps>) {
    const { container, rerender } = render(
      <AppShell
        navigation="top"
        brand={<span>Relay</span>}
        sidebar={ITEMS.map((label, index) => (
          <AppShell.NavItem key={label} icon="inbox" label={label} current={index === 0} />
        ))}
        topbar={{
          leading: <Button size="sm" label="Search" />,
          trailing: <Button size="sm" label="New ticket" />,
        }}
        {...props}
      >
        <p>page</p>
      </AppShell>,
    )
    return { root: container.firstElementChild as HTMLElement, rerender }
  }

  const box = (node: Element) => node.getBoundingClientRect()

  it('leaves a frame without the prop on the rail', () => {
    const root = shell()
    expect(root.hasAttribute('data-navigation')).toBe(false)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(box(nav).left).toBeCloseTo(box(root).left, 0)
    expect(box(nav).height).toBeCloseTo(box(root).height, 0)
  })

  it('draws no collapse, and keeps the value for a return to the rail', () => {
    const { root, rerender } = onTop({ defaultCollapsed: true })
    expect(root.hasAttribute('data-collapsed')).toBe(false)
    // The toggle narrows a rail, and a row has none.
    expect(screen.queryByRole('button', { name: /sidebar/ })).toBeNull()
    const label = screen.getByText('Archive')
    expect(box(label).width).toBeGreaterThan(2)

    rerender(
      <AppShell defaultCollapsed sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}>
        <p>page</p>
      </AppShell>,
    )
    expect(root.dataset['collapsed']).toBe('')
  })

  it('steps hover to the subtle fill, because the bar is on the rail’s hover fill', async () => {
    onTop()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const archive = screen.getByRole('button', { name: 'Archive' })
    await userEvent.hover(archive)
    await vi.waitFor(() =>
      expect(getComputedStyle(archive).backgroundColor).not.toBe(
        getComputedStyle(nav).backgroundColor,
      ),
    )
  })

  it('wraps a row wider than the frame, so every destination stays on screen', async () => {
    // 800 is above the drawer breakpoint (48rem) and narrower than twelve items.
    await page.viewport(800, 800)
    const labels = Array.from({ length: 12 }, (_, index) => `Destination ${index + 1}`)
    const { root } = onTop({
      sidebar: labels.map((label) => <AppShell.NavItem key={label} icon="inbox" label={label} />),
    })
    await vi.waitFor(() =>
      expect(getComputedStyle(root).gridTemplateAreas).toContain('content content'),
    )

    const items = labels.map((label) => box(screen.getByRole('button', { name: label })))
    expect(new Set(items.map((item) => Math.round(item.top))).size).toBeGreaterThan(1)
    for (const item of items) expect(item.right).toBeLessThanOrEqual(window.innerWidth + 1)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    // The topbar keeps its own content beside the wrapped row.
    expect(box(screen.getByRole('button', { name: 'New ticket' })).right).toBeLessThanOrEqual(
      window.innerWidth + 1,
    )
  })
})

/* Where the row and the drawer are drawn, from the fixture's two entries, as every web shell's
   AppShell test states it. */
appShellTopLaw({ shell: 'React', adapter: reactAdapter })

describe('ListPage', () => {
  function page(props?: Partial<ListPageProps>) {
    const { container } = render(
      <ListPage title="Tickets" emptyState={EMPTY} {...props}>
        <Tickets />
      </ListPage>,
    )
    return container.firstElementChild as HTMLElement
  }

  it('declares its own scope on its own root', () => {
    const root = page()
    for (const token of [
      '--pm-page-padding-x',
      '--pm-page-padding-y',
      '--pm-page-max-width',
      '--pm-content-gutter',
    ]) {
      expect(readVar(root, token), token).not.toBe('')
      expect(readVar(document.documentElement, token), token).toBe('')
    }
  })

  it('builds its own padding and spacing from them', () => {
    const root = page()
    const style = getComputedStyle(root)
    expect(Number.parseFloat(style.paddingLeft)).toBeCloseTo(
      scopedLength(root, '--pm-page-padding-x'),
      1,
    )
    expect(Number.parseFloat(style.paddingTop)).toBeCloseTo(
      scopedLength(root, '--pm-page-padding-y'),
      1,
    )
    expect(Number.parseFloat(style.rowGap)).toBeCloseTo(
      scopedLength(root, '--pm-content-gutter'),
      1,
    )
    expect(Number.parseFloat(style.maxWidth)).toBeCloseTo(
      scopedLength(root, '--pm-page-max-width'),
      1,
    )
  })

  it('owns the page’s only h1, through the only PageHeader', () => {
    page({ description: 'Oldest first.' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeTruthy()
    expect(screen.getByText('Oldest first.')).toBeTruthy()
  })

  it('shows the table when there is one, and nothing else', () => {
    const root = page()
    expect(root.dataset['empty']).toBeUndefined()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.queryByText('No tickets yet')).toBeNull()
  })

  it('swaps the body for the empty state and removes the table', () => {
    const root = page({ empty: true })
    expect(root.dataset['empty']).toBe('')
    expect(screen.getByText('No tickets yet')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('cannot be built without an empty state', () => {
    // `emptyState` is required, which enforces the completeness law. Empty
    // states are often skipped, and here they cannot be.
    // @ts-expect-error — the page has no empty state.
    const missing = <ListPage title="Tickets">{null}</ListPage>
    expect(missing).toBeTruthy()
  })

  it('renders no filter row when there are no filters', () => {
    const withFilters = page({ filters: <Button size="sm" label="Filter" /> })
    expect(withFilters.children).toHaveLength(3)
    const without = page()
    expect(without.children).toHaveLength(2)
  })

  /**
   * The summary band (the dashboard block's section cards).
   *
   * It is a slot, not the start of `children`, for two reasons the tests below
   * check. The body is a panel with Card's surface recipe, and cards do not
   * nest. And the band describes the whole collection, not the filtered view.
   */
  describe('the summary band', () => {
    const SUMMARY = (
      <Grid columns={4} gap={6}>
        <Card>
          <Stat label="Open" value="3" trend={{ direction: 'down', label: '−40%' }} />
        </Card>
      </Grid>
    )

    it('sits between the header and the filters', () => {
      const root = page({ summary: SUMMARY, filters: <Button size="sm" label="Filter" /> })
      const [header, summary, , body] = [...root.children] as HTMLElement[]
      expect(header?.tagName).toBe('HEADER')
      expect(summary?.contains(screen.getByText('Open'))).toBe(true)
      expect(body?.contains(screen.getByRole('table'))).toBe(true)
    })

    it('adds nothing when it is not given one', () => {
      // The slot has no wrapper, so an absent summary does not change the page's
      // child count.
      expect(page().children).toHaveLength(2)
      expect(page({ summary: SUMMARY }).children).toHaveLength(3)
    })

    it('sits on the page, not inside the body’s panel, because cards do not nest', () => {
      const root = page({ summary: SUMMARY })
      const body = root.lastElementChild as HTMLElement
      expect(body.contains(screen.getByText('Open'))).toBe(false)
    })

    it('stays through the body swap, because a filter changes the view, not the collection', () => {
      page({ summary: SUMMARY, empty: true })
      expect(screen.getByText('No tickets yet')).toBeTruthy()
      expect(screen.getByText('Open')).toBeTruthy()
      expect(screen.getByText('3')).toBeTruthy()
    })
  })

  it('crossfades in one cell, so a swap does not push the page down', async () => {
    const { container, rerender } = render(
      <ListPage title="Tickets" emptyState={EMPTY}>
        <Tickets />
      </ListPage>,
    )
    const root = container.firstElementChild as HTMLElement
    const slot = root.lastElementChild as HTMLElement

    rerender(
      <ListPage empty title="Tickets" emptyState={EMPTY}>
        <Tickets />
      </ListPage>,
    )

    // Mid-swap both bodies are mounted. Stacked in flow, one would sit above the
    // other and push everything below down for the length of the fade. Sharing a
    // grid cell, they overlap.
    await vi.waitFor(() => expect(slot.children.length).toBe(2))
    const [outgoing, incoming] = [...slot.children] as HTMLElement[]
    expect(outgoing?.getBoundingClientRect().top).toBeCloseTo(
      incoming?.getBoundingClientRect().top ?? 0,
      0,
    )

    await vi.waitFor(() => expect(slot.children.length).toBe(1))
  })

  it('puts the table directly in the body, with no wrapping card', () => {
    const root = page()
    const body = root.lastElementChild?.firstElementChild as HTMLElement
    const style = getComputedStyle(body)
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(style.borderTopWidth).toBe('0px')
  })
})

describe('the two of them together', () => {
  it('compose into a screen with one h1 and every landmark', () => {
    render(
      <AppShell sidebar={<Button variant="ghost" tone="neutral" label="Inbox" />}>
        <ListPage
          title="Tickets"
          actions={<Button icon="add" label="New ticket" />}
          emptyState={EMPTY}
        >
          <Tickets />
        </ListPage>
      </AppShell>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main').contains(screen.getByRole('heading', { level: 1 }))).toBe(true)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('lets the page read the shell’s scope, which is why both files own it', () => {
    render(
      <AppShell sidebar={<Button variant="ghost" tone="neutral" label="Inbox" />}>
        <ListPage title="Tickets" emptyState={EMPTY}>
          <Tickets />
        </ListPage>
      </AppShell>,
    )
    const page = screen.getByRole('main').firstElementChild as HTMLElement
    expect(readVar(page, '--pm-shell-topbar-height')).not.toBe('')
  })
})

/**
 * The page scope steps down in a narrow region (`docs/layout.md`).
 *
 * The window is 1280 for every assertion here. What changes is the width of
 * the shell, and so of the content region the page sits in, which is the
 * container the page queries. A phone is the common case of a narrow region,
 * not its definition. The same page in an 800px desktop window gets the same
 * result, and a media query would give the wrong one.
 *
 * The step is one space token, not a new number. The space scale applies at
 * every width, so responsive values do not become a second set that cannot be
 * changed in one place.
 */
describe('the page scope steps down in a narrow region', () => {
  function pageIn(width: number) {
    const host = fixedWidthHost(width)
    render(
      <AppShell sidebar={<Button variant="ghost" tone="neutral" label="Inbox" />}>
        <ListPage title="Tickets" emptyState={EMPTY}>
          <Tickets />
        </ListPage>
      </AppShell>,
      { container: host },
    )
    const region = host.querySelector('main') as HTMLElement
    return { host, region, root: region.firstElementChild as HTMLElement }
  }

  /**
   * The full inset, measured instead of named.
   *
   * A page with no container ancestor cannot step down, because no container
   * answers the query. So its padding is the archetype's own declaration,
   * whatever that currently is.
   *
   * It is deliberately not named here (as `--pm-space-7`, for example).
   * `pnpm proof`'s churn (b) changes exactly that value, to a roomier page, in
   * the stylesheet that owns the scope, and a named value would fail against a
   * value that is not meant to be permanent. The test checks that a region with
   * room keeps the full inset, not the stepped one, at whatever step the
   * archetype uses.
   */
  function fullInset(): number {
    const { container } = render(
      <ListPage title="Tickets" emptyState={EMPTY}>
        <Tickets />
      </ListPage>,
    )
    const root = container.firstElementChild as HTMLElement
    const inset = Number.parseFloat(getComputedStyle(root).paddingLeft)
    container.remove()
    return inset
  }

  it('keeps the full inset while the region has room for it', () => {
    const { host, root } = pageIn(1200)
    expect(Number.parseFloat(getComputedStyle(root).paddingLeft)).toBeCloseTo(fullInset(), 1)
    host.remove()
  })

  it('reduces the padding by one space step below 40rem', () => {
    const { host, region, root } = pageIn(800)
    // The test is about the region, so it asserts that the region is narrow
    // while the window is not.
    expect(region.getBoundingClientRect().width).toBeLessThan(640)
    expect(window.innerWidth).toBeGreaterThan(640)

    const style = getComputedStyle(root)
    expect(Number.parseFloat(style.paddingLeft)).toBeCloseTo(
      scopedLength(document.body, '--pm-space-6'),
      1,
    )
    expect(Number.parseFloat(style.paddingTop)).toBeCloseTo(
      scopedLength(document.body, '--pm-space-5'),
      1,
    )
    host.remove()
  })

  it('gives two regions different padding at the same time', () => {
    const wide = pageIn(1200)
    const narrow = pageIn(800)
    const inset = (node: HTMLElement) => Number.parseFloat(getComputedStyle(node).paddingLeft)

    expect(inset(narrow.root)).toBeLessThan(inset(wide.root))
    wide.host.remove()
    narrow.host.remove()
  })

  it('still declares the tokens on the page, stepped or not', () => {
    // Red rule 6 still holds after the narrow step. The narrow value is
    // re-declared on the page's own root, in the page's own stylesheet, so a
    // change still has one place to go.
    const { host, root } = pageIn(800)
    for (const token of ['--pm-page-padding-x', '--pm-page-padding-y']) {
      expect(readVar(root, token), token).not.toBe('')
      expect(readVar(document.documentElement, token), token).toBe('')
    }
    host.remove()
  })
})
