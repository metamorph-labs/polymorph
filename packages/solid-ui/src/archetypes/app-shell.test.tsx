import { getByRole } from '@testing-library/dom'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { appShellTopLaw } from '@polymorph/conformance/app-shell-top'
import { installTestTheme } from '@polymorph/engine/testing'

import { createSignal } from 'solid-js'

import { solidAdapter } from '../conformance/solid'
import { mount } from '../mount'
import AppShell from './AppShell'
import AppShellNavItem from './AppShellNavItem'

/**
 * AppShell in the Solid shell: the navigation on top
 * (`design/archetypes/app-shell.md`, Navigation on top), as
 * `@polymorph/conformance/app-shell-top` states it for every web shell.
 */
appShellTopLaw({ shell: 'Solid', adapter: solidAdapter })

/**
 * The drawer below the breakpoint, from the keyboard (`design/archetypes/app-shell.md`, A11y):
 * its button says whether it is open and which region it opens, Escape closes it, the frame
 * behind it is out of reach while it is open, and a window that grows past the breakpoint
 * closes it.
 */
describe('AppShell — the drawer, from the keyboard (Solid)', () => {
  const CLOSED = 'drawer closed — below the breakpoint, the rail behind the topbar’s menu button'

  beforeAll(installTestTheme)
  beforeEach(async () => {
    await page.viewport(600, 800)
  })
  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  async function opened() {
    const mounted = await solidAdapter.mount('AppShell', { state: CLOSED })
    const root = mounted.root.querySelector('[data-member="app-shell"]') as HTMLElement
    const menu = await vi.waitFor(() => getByRole(root, 'button', { name: 'Open navigation' }))
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(menu)
    await vi.waitFor(() => expect(root.hasAttribute('data-drawer')).toBe(true))
    return { mounted, root, menu }
  }

  it('says whether it is open, and which region it opens', async () => {
    const { mounted, root, menu } = await opened()
    try {
      const rail = root.querySelector('nav') as HTMLElement
      expect(rail.id).not.toBe('')
      expect(menu.getAttribute('aria-controls')).toBe(rail.id)
      expect(menu.getAttribute('aria-expanded')).toBe('true')
    } finally {
      mounted.unmount()
    }
  })

  it('closes on Escape, and gives focus back to its button', async () => {
    const { mounted, root, menu } = await opened()
    try {
      await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('NAV'))
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(root.hasAttribute('data-drawer')).toBe(false))
      await vi.waitFor(() => expect(document.activeElement).toBe(menu))
    } finally {
      mounted.unmount()
    }
  })

  it('leaves only the rail and the scrim reachable while it is open', async () => {
    const { mounted, root } = await opened()
    const behind = () =>
      [
        root.querySelector('a[href="#content"]'),
        root.querySelector('header'),
        root.querySelector('main'),
      ].map((element) => (element as HTMLElement).inert)
    try {
      expect(behind()).toEqual([true, true, true])
      expect((root.querySelector('nav') as HTMLElement).inert).toBe(false)
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(behind()).toEqual([false, false, false]))
    } finally {
      mounted.unmount()
    }
  })

  it('closes when the window grows past the breakpoint, where there is no drawer', async () => {
    const { mounted, root } = await opened()
    try {
      await page.viewport(1280, 800)
      await vi.waitFor(() => expect(root.hasAttribute('data-drawer')).toBe(false))
      expect((root.querySelector('main') as HTMLElement).inert).toBe(false)
    } finally {
      mounted.unmount()
    }
  })

  it('is a region the skip link moves focus into, which is a stop only while it holds that focus', async () => {
    const mounted = await solidAdapter.mount('AppShell', { state: CLOSED })
    const address = location.href
    try {
      const main = mounted.root.querySelector('main') as HTMLElement
      expect(main.id).toBe('content')
      expect(main.hasAttribute('tabindex')).toBe(false)
      const skip = mounted.root.querySelector('a[href="#content"]') as HTMLElement
      skip.focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(document.activeElement).toBe(main))
      expect(main.getAttribute('tabindex')).toBe('-1')
      skip.focus()
      expect(main.hasAttribute('tabindex')).toBe(false)
    } finally {
      history.replaceState(null, '', address)
      mounted.unmount()
    }
  })
})

/**
 * A page change under the app's router (`design/archetypes/app-shell.md`, Routing): the shell
 * moves focus to the new page's heading, which a screen reader reads, and does nothing for the
 * first page or while the page is loading. The page here is one heading, `Settings`, and the key changes
 * under it.
 */
describe('AppShell — a new page (Solid)', () => {
  beforeAll(installTestTheme)

  const announcer = () => document.querySelector('[data-member="app-shell"] [role="status"]')
  const heading = () => document.querySelector('[data-member="app-shell"] h1') as HTMLElement
  const link = () => document.querySelector('[data-member="app-shell"] nav a') as HTMLElement

  it('does nothing for the first page, and arrives at the next', async () => {
    const shell = await mountPages()
    link().focus()
    await new Promise((settle) => setTimeout(settle, 100))
    expect(document.activeElement).toBe(link())
    expect(announcer()?.textContent).toBe('')

    await shell.set({ transitionKey: '/settings' })
    await vi.waitFor(() => expect(document.activeElement).toBe(heading()))
    // A screen reader reads the focused heading, so the region stays quiet.
    expect(announcer()?.textContent).toBe('')
    shell.unmount()
  })

  it('waits for a page that is loading', async () => {
    const shell = await mountPages()
    link().focus()
    await shell.set({ transitionKey: '/settings', pending: true })
    await new Promise((settle) => setTimeout(settle, 100))
    expect(document.activeElement).toBe(link())
    await shell.set({ pending: false })
    await vi.waitFor(() => expect(document.activeElement).toBe(heading()))
    shell.unmount()
  })

  it('arrives at a page that starts loading just after it changed', async () => {
    const shell = await mountPages()
    link().focus()
    await shell.set({ transitionKey: '/settings' })
    await shell.set({ pending: true })
    await new Promise((settle) => setTimeout(settle, 100))
    expect(document.activeElement).toBe(link())
    await shell.set({ pending: false })
    await vi.waitFor(() => expect(document.activeElement).toBe(heading()))
    shell.unmount()
  })

  it('leaves focus where the reader moved it while the page loaded, and says the title', async () => {
    const shell = await mountPages()
    link().focus()
    await shell.set({ transitionKey: '/settings', pending: true })
    await new Promise((settle) => setTimeout(settle, 100))
    const frame = document.querySelector('[data-member="app-shell"]') as HTMLElement
    const toggle = getByRole(frame, 'button', { name: 'Collapse sidebar' })
    toggle.focus()
    await shell.set({ pending: false })
    await vi.waitFor(() => expect(announcer()?.textContent).toBe('Settings'))
    expect(document.activeElement).toBe(toggle)
    shell.unmount()
  })
})

/** A shell whose page the test changes, as the app's router would. */
async function mountPages() {
  const [transitionKey, setTransitionKey] = createSignal('/tickets')
  const [pending, setPending] = createSignal(false)
  const mounted = await mount(() => (
    <AppShell
      sidebar={<AppShellNavItem icon="inbox" label="Inbox" href="#inbox" />}
      transitionKey={transitionKey()}
      pending={pending()}
    >
      <h1>Settings</h1>
    </AppShell>
  ))
  return {
    async set(next: { transitionKey?: string; pending?: boolean }) {
      if (next.transitionKey !== undefined) setTransitionKey(next.transitionKey)
      if (next.pending !== undefined) setPending(next.pending)
      await Promise.resolve()
    },
    unmount: mounted.unmount,
  }
}
