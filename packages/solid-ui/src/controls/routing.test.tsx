import { getByRole } from '@testing-library/dom'
import { createSignal } from 'solid-js'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import AppShell from '../archetypes/AppShell'
import AppShellNavItem from '../archetypes/AppShellNavItem'
import { mount } from '../mount'
import Breadcrumbs from '../structure/Breadcrumbs'
import Card from '../structure/Card'
import Link from './Link'

/**
 * The routing seam in the Solid shell (`design/components/link.md` §Routing),
 * as the React members' tests hold it: a caller that passes `onNavigate` gets
 * the clicks that would navigate this tab, with the browser's navigation
 * stopped, and the browser keeps every click that opens a tab or a window.
 * Link, AppShell's rows, Breadcrumbs' crumbs and a linked Card share it, and
 * a new page closes AppShell's small-viewport drawer, because the shell stays
 * mounted under the app's router.
 */

beforeAll(installTestTheme)

/**
 * Dispatches a click on `element` and reports whether the member took the
 * navigation from the browser. A listener on the document hears the click after
 * the member, reads its decision, and then stops the navigation itself, so a
 * click the member leaves alone does not move the runner's page.
 */
function taken(element: Element, init: MouseEventInit = {}): boolean {
  let prevented = false
  const watch = (event: MouseEvent) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', watch)
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
  document.removeEventListener('click', watch)
  return prevented
}

const MODIFIED: MouseEventInit[] = [
  { metaKey: true },
  { ctrlKey: true },
  { shiftKey: true },
  { altKey: true },
  { button: 1 },
]

const SIX = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Northwind', href: '#northwind' },
  { label: 'Support', href: '#support' },
  { label: 'Escalations', href: '#escalations' },
  { label: 'Ticket #4182' },
]

describe('Link', () => {
  it('hands a click that would navigate this tab to the router, in place of the browser', async () => {
    const onNavigate = vi.fn()
    const { host } = await mount(() => (
      <Link href="#tickets" onNavigate={onNavigate}>
        Tickets
      </Link>
    ))
    expect(taken(getByRole(host, 'link', { name: 'Tickets' }))).toBe(true)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#tickets')
  })

  it('leaves a click that opens a tab or a window, and an external link, to the browser', async () => {
    const onNavigate = vi.fn()
    const { host } = await mount(() => (
      <div>
        <Link href="#tickets" onNavigate={onNavigate}>
          Tickets
        </Link>
        <Link href="#status" external onNavigate={onNavigate}>
          Status
        </Link>
      </div>
    ))
    const link = getByRole(host, 'link', { name: 'Tickets' })
    for (const init of MODIFIED) expect(taken(link, init), JSON.stringify(init)).toBe(false)
    expect(taken(getByRole(host, 'link', { name: 'Status' }))).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('lets the browser follow every click when the caller does not listen', async () => {
    const { host } = await mount(() => <Link href="#tickets">Tickets</Link>)
    expect(taken(getByRole(host, 'link', { name: 'Tickets' }))).toBe(false)
  })
})

describe('AppShell.NavItem', () => {
  it('routes a row’s click that would navigate this tab, and still selects', async () => {
    const onNavigate = vi.fn()
    const onSelect = vi.fn()
    const { host } = await mount(() => (
      <AppShellNavItem label="Inbox" href="#inbox" onNavigate={onNavigate} onSelect={onSelect} />
    ))
    const row = getByRole(host, 'link', { name: 'Inbox' })
    expect(taken(row)).toBe(true)
    expect(taken(row, { metaKey: true })).toBe(false)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#inbox')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })
})

describe('Breadcrumbs', () => {
  it('routes a crumb’s click, and leaves a modified one to the browser', async () => {
    const onNavigate = vi.fn()
    const { host } = await mount(() => (
      <Breadcrumbs items={SIX.slice(0, 3)} onNavigate={onNavigate} />
    ))
    const home = getByRole(host, 'link', { name: 'Home' })
    expect(taken(home)).toBe(true)
    expect(taken(home, { ctrlKey: true })).toBe(false)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#home')
  })

  it('routes a crumb chosen from the overflow, and does not also open it', async () => {
    const onNavigate = vi.fn()
    const before = window.location.hash
    await mount(() => <Breadcrumbs items={SIX} defaultOpen onNavigate={onNavigate} />)
    await userEvent.click(
      await vi.waitFor(() => getByRole(document.body, 'menuitem', { name: 'Northwind' })),
    )
    await vi.waitFor(() => expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#northwind'))
    expect(window.location.hash).toBe(before)
  })
})

describe('Card', () => {
  it('routes the cover’s click, and leaves a modified one to the browser', async () => {
    const onNavigate = vi.fn()
    const { host } = await mount(() => (
      <Card href="#ticket" label="Open ticket 4182" onNavigate={onNavigate}>
        Refund
      </Card>
    ))
    const cover = getByRole(host, 'link', { name: 'Open ticket 4182' })
    expect(taken(cover)).toBe(true)
    for (const init of MODIFIED) expect(taken(cover, init), JSON.stringify(init)).toBe(false)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('#ticket')
  })

  it('lets the browser follow every click when the caller passes no onNavigate', async () => {
    const { host } = await mount(() => (
      <Card href="#ticket" label="Open ticket 4182">
        Refund
      </Card>
    ))
    expect(taken(getByRole(host, 'link', { name: 'Open ticket 4182' }))).toBe(false)
  })
})

describe('AppShell — the drawer', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('closes when the page changes', async () => {
    const [key, setKey] = createSignal('/tickets')
    const { host } = await mount(() => (
      <AppShell sidebar={<AppShellNavItem label="Inbox" href="#inbox" />} transitionKey={key()}>
        <p>page</p>
      </AppShell>
    ))
    const root = host.querySelector<HTMLElement>('[data-member="app-shell"]')!
    await page.viewport(600, 800)
    await userEvent.click(
      await vi.waitFor(() => getByRole(host, 'button', { name: 'Open navigation' })),
    )
    await vi.waitFor(() => expect(root.dataset['drawer']).toBe(''))

    setKey('/settings')
    await vi.waitFor(() => expect(root.dataset['drawer']).toBeUndefined())
  })
})
