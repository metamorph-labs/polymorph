import { Component, signal } from '@angular/core'
import { getByRole } from '@testing-library/dom'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { AppShell } from '../archetypes/AppShell'
import { AppShellNavItem } from '../archetypes/AppShellNavItem'
import { mountComponent } from '../mount'
import { Breadcrumbs } from '../structure/Breadcrumbs'
import { Card } from '../structure/Card'
import { Link } from './Link'

/**
 * The routing seam in the Angular shell (`design/components/link.md`
 * §Routing), as the React members' tests hold it: a caller that binds
 * `(navigate)` gets the clicks that would navigate this tab, with the
 * browser's navigation stopped, and the browser keeps every click that opens a
 * tab or a window. The output emits the `href` alone, which is all the seam
 * hands over, so it means what it means in React. Link, AppShell's rows,
 * Breadcrumbs' crumbs and a linked Card share it, and a new page closes
 * AppShell's small-viewport drawer, because the shell stays mounted under the
 * app's router.
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

@Component({
  selector: 'test-links',
  imports: [Link],
  template: `<pm-link href="#tickets" (navigate)="routed($event)">Tickets</pm-link>
    <pm-link href="#status" [external]="true" (navigate)="routed($event)">Status</pm-link>
    <pm-link href="#plain">Plain</pm-link>`,
})
class Links {
  readonly routed = vi.fn<(href: string) => void>()
}

@Component({
  selector: 'test-rail',
  imports: [AppShellNavItem],
  template: `<pm-app-shell-nav-item
    label="Inbox"
    href="#inbox"
    (navigate)="routed($event)"
    (select)="selected()"
  />`,
})
class Rail {
  readonly routed = vi.fn<(href: string) => void>()
  readonly selected = vi.fn<() => void>()
}

@Component({
  selector: 'test-trail',
  imports: [Breadcrumbs],
  template: `<pm-breadcrumbs [items]="items" (navigate)="routed($event)" />`,
})
class Trail {
  readonly items = SIX.slice(0, 3)
  readonly routed = vi.fn<(href: string) => void>()
}

@Component({
  selector: 'test-trail-collapsed',
  imports: [Breadcrumbs],
  template: `<pm-breadcrumbs [items]="items" [defaultOpen]="true" (navigate)="routed($event)" />`,
})
class CollapsedTrail {
  readonly items = SIX
  readonly routed = vi.fn<(href: string) => void>()
}

@Component({
  selector: 'test-cards',
  imports: [Card],
  template: `<pm-card href="#ticket" label="Open ticket 4182" (navigate)="routed($event)"
      >Refund</pm-card
    >
    <pm-card href="#plain" label="Open the plain card">Refund</pm-card>`,
})
class Cards {
  readonly routed = vi.fn<(href: string) => void>()
}

@Component({
  selector: 'test-shell',
  imports: [AppShell],
  template: `<pm-app-shell [transitionKey]="key()"
    ><p slot="sidebar">rail</p>
    <p>page</p></pm-app-shell
  >`,
})
class Shell {
  readonly key = signal('/tickets')
}

describe('Link', () => {
  it('hands a click that would navigate this tab to the router, in place of the browser', async () => {
    const { host, ref } = await mountComponent(Links)
    const links = ref.instance as Links
    expect(taken(getByRole(host, 'link', { name: 'Tickets' }))).toBe(true)
    expect(links.routed).toHaveBeenCalledExactlyOnceWith('#tickets')
  })

  it('leaves a click that opens a tab or a window, and an external link, to the browser', async () => {
    const { host, ref } = await mountComponent(Links)
    const links = ref.instance as Links
    const link = getByRole(host, 'link', { name: 'Tickets' })
    for (const init of MODIFIED) expect(taken(link, init), JSON.stringify(init)).toBe(false)
    expect(taken(getByRole(host, 'link', { name: 'Status' }))).toBe(false)
    expect(links.routed).not.toHaveBeenCalled()
  })

  it('lets the browser follow every click when the caller does not bind navigate', async () => {
    const { host } = await mountComponent(Links)
    expect(taken(getByRole(host, 'link', { name: 'Plain' }))).toBe(false)
  })
})

describe('AppShell.NavItem', () => {
  it('routes a row’s click that would navigate this tab, and still selects', async () => {
    const { host, ref } = await mountComponent(Rail)
    const rail = ref.instance as Rail
    const row = getByRole(host, 'link', { name: 'Inbox' })
    expect(taken(row)).toBe(true)
    expect(taken(row, { metaKey: true })).toBe(false)
    expect(rail.routed).toHaveBeenCalledExactlyOnceWith('#inbox')
    expect(rail.selected).toHaveBeenCalledTimes(2)
  })
})

describe('Breadcrumbs', () => {
  it('routes a crumb’s click, and leaves a modified one to the browser', async () => {
    const { host, ref } = await mountComponent(Trail)
    const trail = ref.instance as Trail
    const home = getByRole(host, 'link', { name: 'Home' })
    expect(taken(home)).toBe(true)
    expect(taken(home, { ctrlKey: true })).toBe(false)
    expect(trail.routed).toHaveBeenCalledExactlyOnceWith('#home')
  })

  it('routes a crumb chosen from the overflow, and does not also open it', async () => {
    const before = window.location.hash
    const { ref } = await mountComponent(CollapsedTrail)
    const trail = ref.instance as CollapsedTrail
    await userEvent.click(
      await vi.waitFor(() => getByRole(document.body, 'menuitem', { name: 'Northwind' })),
    )
    await vi.waitFor(() => expect(trail.routed).toHaveBeenCalledExactlyOnceWith('#northwind'))
    expect(window.location.hash).toBe(before)
  })
})

describe('Card', () => {
  it('routes the cover’s click, and leaves a modified one to the browser', async () => {
    const { host, ref } = await mountComponent(Cards)
    const cards = ref.instance as Cards
    const cover = getByRole(host, 'link', { name: 'Open ticket 4182' })
    expect(taken(cover)).toBe(true)
    for (const init of MODIFIED) expect(taken(cover, init), JSON.stringify(init)).toBe(false)
    expect(cards.routed).toHaveBeenCalledExactlyOnceWith('#ticket')
  })

  it('lets the browser follow every click when the caller does not bind navigate', async () => {
    const { host } = await mountComponent(Cards)
    expect(taken(getByRole(host, 'link', { name: 'Open the plain card' }))).toBe(false)
  })
})

describe('AppShell — the drawer', () => {
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('closes when the page changes', async () => {
    const { host, ref } = await mountComponent(Shell)
    const shell = ref.instance as Shell
    const root = host.querySelector<HTMLElement>('[data-member="app-shell"]')!
    await page.viewport(600, 800)
    await userEvent.click(
      await vi.waitFor(() => getByRole(host, 'button', { name: 'Open navigation' })),
    )
    await vi.waitFor(() => expect(root.dataset['drawer']).toBe(''))

    shell.key.set('/settings')
    await vi.waitFor(() => expect(root.dataset['drawer']).toBeUndefined())
  })
})
