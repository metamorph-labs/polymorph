import { assertGoverned } from '@polymorph/react'
import { render, screen } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppShell } from '../archetypes/AppShell'
import { Button } from '../controls/Button'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Banner, type BannerProps } from './Banner'

/**
 * Banner, in a real browser.
 *
 * Three things a fixture cannot settle. Only danger interrupts. The bar keeps
 * its message readable on a narrow frame by moving the action under it. And in
 * an AppShell it takes a row of its own, so the frame under it still ends at
 * the viewport's foot.
 */

beforeAll(installTestTheme)

afterEach(async () => {
  await page.viewport(1280, 800)
})

const banner = () => document.querySelector<HTMLElement>('[data-member="banner"]')!

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<BannerProps>(true)
  })
})

describe('politeness follows the tone', () => {
  it.each(['neutral', 'info', 'warning'] as const)('does not interrupt for %s', (tone) => {
    render(<Banner tone={tone}>Your trial ends in 3 days.</Banner>)
    expect(banner().getAttribute('role')).toBe('status')
    expect(banner().dataset['tone']).toBe(tone)
  })

  it('interrupts for danger only', () => {
    render(<Banner tone="danger">Payments are unavailable.</Banner>)
    expect(screen.getByRole('alert')).toBe(banner())
  })

  it('is neutral unless a tone is given, and a neutral banner draws no glyph', () => {
    render(<Banner>You are viewing Northwind Traders.</Banner>)
    expect(banner().dataset['tone']).toBe('neutral')
    expect(banner().querySelector('svg')).toBeNull()
  })

  it('draws a decorative glyph for a tone', () => {
    render(<Banner tone="warning">Your trial ends in 3 days.</Banner>)
    const glyph = banner().querySelector('svg')
    expect(glyph).not.toBeNull()
    expect(glyph!.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})

describe('the way out and the ✕', () => {
  it('has no ✕ unless the app handles the dismissal', () => {
    render(<Banner tone="danger">Payments are unavailable.</Banner>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('reports the ✕ and leaves the unmount to the app', async () => {
    const onDismiss = vi.fn()
    render(
      <Banner tone="info" onDismiss={onDismiss} dismissLabel="Hide this notice">
        Scheduled maintenance on Sunday.
      </Banner>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Hide this notice' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(banner()).not.toBeNull()
  })

  it('puts the action before the ✕ in the document, which is the focus order', () => {
    render(
      <Banner
        tone="warning"
        action={<Button variant="ghost" tone="neutral" size="sm" label="Upgrade plan" />}
        onDismiss={() => {}}
      >
        Your trial ends in 3 days.
      </Banner>,
    )
    const [action, close] = screen.getAllByRole('button')
    expect(action!.textContent).toBe('Upgrade plan')
    expect(close!.getAttribute('aria-label')).toBe('Dismiss')
    expect(action!.compareDocumentPosition(close!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('the bar', () => {
  const LONG =
    'Replies sent by email are delayed by about twenty minutes while the mail queue catches up.'

  it('runs edge to edge: the width of its container, square, with a rule at its foot', () => {
    render(
      <div style={{ inlineSize: 640 }}>
        <Banner tone="warning">Your trial ends in 3 days.</Banner>
      </div>,
    )
    const style = getComputedStyle(banner())
    expect(banner().getBoundingClientRect().width).toBe(640)
    expect(style.borderTopLeftRadius).toBe('0px')
    expect(style.borderBottomWidth).toBe('1px')
    expect(style.borderTopWidth).toBe('0px')
  })

  it('keeps the message and the action on one row where there is room', () => {
    render(
      <div style={{ inlineSize: 960 }}>
        <Banner
          tone="warning"
          action={<Button variant="ghost" tone="neutral" size="sm" label="Status page" />}
        >
          {LONG}
        </Banner>
      </div>,
    )
    const text = screen.getByText(LONG).getBoundingClientRect()
    const action = screen.getByRole('button').getBoundingClientRect()
    expect(action.left).toBeGreaterThanOrEqual(text.right)
    expect(action.top).toBeLessThan(text.bottom)
  })

  it('moves the action under the message on a narrow frame, and never scrolls sideways', () => {
    render(
      <div style={{ inlineSize: 280 }}>
        <Banner
          tone="warning"
          action={<Button variant="ghost" tone="neutral" size="sm" label="Status page" />}
          onDismiss={() => {}}
        >
          {LONG}
        </Banner>
      </div>,
    )
    const text = screen.getByText(LONG).getBoundingClientRect()
    const action = screen.getByRole('button', { name: 'Status page' }).getBoundingClientRect()
    expect(action.top).toBeGreaterThanOrEqual(text.bottom)
    expect(banner().scrollWidth).toBeLessThanOrEqual(banner().clientWidth)
  })

  it('keeps the glyph and the ✕ beside the first line of a message that wraps', () => {
    render(
      <div style={{ inlineSize: 280 }}>
        <Banner tone="warning" onDismiss={() => {}}>
          {LONG}
        </Banner>
      </div>,
    )
    const text = screen.getByText(LONG).getBoundingClientRect()
    const glyph = banner().querySelector('svg')!.getBoundingClientRect()
    const close = screen.getByRole('button', { name: 'Dismiss' }).getBoundingClientRect()
    const line = parseFloat(getComputedStyle(screen.getByText(LONG)).lineHeight)
    // The message runs over several lines, and it sits between the glyph and the ✕.
    expect(text.height).toBeGreaterThan(line * 2)
    expect(glyph.right).toBeLessThanOrEqual(text.left)
    expect(close.left).toBeGreaterThanOrEqual(text.right)
    // Both are centred on the first line, and neither on the block.
    const firstLine =
      text.top + parseFloat(getComputedStyle(screen.getByText(LONG)).paddingTop) + line / 2
    expect(Math.abs((glyph.top + glyph.bottom) / 2 - firstLine)).toBeLessThanOrEqual(1)
    expect(Math.abs((close.top + close.bottom) / 2 - firstLine)).toBeLessThanOrEqual(1)
  })

  it('puts a one-line message, its action and the ✕ on one centre line', () => {
    render(
      <div style={{ inlineSize: 960 }}>
        <Banner
          tone="info"
          action={<Button variant="ghost" tone="neutral" size="sm" label="Status page" />}
          onDismiss={() => {}}
        >
          Scheduled maintenance on Sunday.
        </Banner>
      </div>,
    )
    const centre = (element: Element) => {
      const box = element.getBoundingClientRect()
      return (box.top + box.bottom) / 2
    }
    const line = centre(screen.getByText('Scheduled maintenance on Sunday.'))
    expect(Math.abs(centre(banner().querySelector('svg')!) - line)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(centre(screen.getByRole('button', { name: 'Status page' })) - line),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(centre(screen.getByRole('button', { name: 'Dismiss' })) - line),
    ).toBeLessThanOrEqual(1)
  })

  it('breaks a string with no spaces instead of widening its container', () => {
    render(
      <div style={{ inlineSize: 280 }}>
        <Banner tone="info">{'snapshot-'.repeat(12)}</Banner>
      </div>,
    )
    expect(banner().scrollWidth).toBeLessThanOrEqual(banner().clientWidth)
    expect(banner().getBoundingClientRect().width).toBe(280)
  })
})

describe('in an AppShell', () => {
  const shell = () => document.querySelector<HTMLElement>('[data-member="app-shell"]')!
  const rect = (selector: string) => shell().querySelector(selector)!.getBoundingClientRect()

  function Frame({ notice }: { notice?: boolean }) {
    return (
      <AppShell
        sidebar={<AppShell.NavItem icon="inbox" label="Inbox" />}
        {...(notice ? { banner: <Banner tone="warning">Your trial ends in 3 days.</Banner> } : {})}
      >
        <p>The page.</p>
      </AppShell>
    )
  }

  it('takes a row across the frame, and the rail and the topbar start under it', async () => {
    await page.viewport(1280, 800)
    render(<Frame notice />)
    const bar = banner().getBoundingClientRect()
    expect(bar.left).toBe(0)
    expect(bar.width).toBe(1280)
    expect(bar.top).toBe(0)
    expect(bar.height).toBeGreaterThan(0)
    expect(rect('nav').top).toBe(bar.bottom)
    expect(rect('header').top).toBe(bar.bottom)
  })

  it('shortens the frame instead of pushing it past the viewport', async () => {
    await page.viewport(1280, 800)
    render(<Frame notice />)
    expect(shell().getBoundingClientRect().height).toBe(800)
    expect(rect('main').bottom).toBe(800)
    expect(rect('nav').bottom).toBe(800)
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(800)
  })

  it('gives the row no height without a banner', async () => {
    await page.viewport(1280, 800)
    render(<Frame />)
    expect(banner()).toBeNull()
    expect(rect('nav').top).toBe(0)
    expect(rect('header').top).toBe(0)
  })

  it('is read before the rail: after the skip link and before the navigation', async () => {
    await page.viewport(1280, 800)
    render(<Frame notice />)
    const skip = shell().querySelector('a')!
    const nav = shell().querySelector('nav')!
    expect(skip.compareDocumentPosition(banner()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(banner().compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sits above the topbar on a phone, across the whole width', async () => {
    await page.viewport(320, 740)
    render(<Frame notice />)
    const bar = banner().getBoundingClientRect()
    expect(bar.top).toBe(0)
    expect(bar.width).toBe(320)
    expect(rect('header').top).toBe(bar.bottom)
    expect(rect('main').bottom).toBe(740)
  })
})

/**
 * An agent dismisses a Banner through the bridge, as the spec's `agent` fence declares
 * (`design/components/banner.md`, Agent). The ✕ is withheld, and the application's action stays
 * an agent's.
 */
describe('an agent', () => {
  it('dismisses as the ✕ does, and lists the application’s action within the Banner', async () => {
    const bridge = createAgentBridge()
    try {
      const onDismiss = vi.fn()
      render(
        <Banner
          tone="warning"
          onDismiss={onDismiss}
          action={<Button variant="soft" tone="accent" size="sm" label="Upgrade" />}
        >
          Your trial ends in three days.
        </Banner>,
      )
      const { members } = bridge.snapshot()
      const notice = members.find((member) => member.member === 'Banner')
      expect(notice).toMatchObject({ state: { tone: 'warning', dismissible: true } })
      expect(
        members
          .filter((member) => member.member === 'Button')
          .map((member) => [member.name, member.within]),
      ).toEqual([['Upgrade', notice?.id]])
      const { results } = await bridge.act([{ id: notice?.id, action: 'dismiss' }])
      expect(results[0]).toMatchObject({ ok: true })
      expect(onDismiss).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to dismiss a Banner whose cause is still true', async () => {
    const bridge = createAgentBridge()
    try {
      render(<Banner tone="danger">Payments are unavailable.</Banner>)
      const [notice] = bridge.snapshot().members
      expect(notice?.state['dismissible']).toBe(false)
      const { results } = await bridge.act([{ id: notice?.id, action: 'dismiss' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
    } finally {
      bridge.dispose()
    }
  })
})
