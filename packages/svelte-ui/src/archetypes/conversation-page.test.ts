import { tick } from 'svelte'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render as mountComponent } from '../mount'
import ConversationPageHarness from '../testing/ConversationPageHarness.svelte'
import { live } from '../testing/live.svelte'

/**
 * ConversationPage's one decision in Svelte is geometry
 * (`design/archetypes/conversation-page.md`): the composer sits under the
 * thread at the bottom of the region, and the page's own width puts the aside
 * beside the thread above `48rem` and behind a Drawer below it, with nothing
 * dropped. Widening closes the drawer, so narrowing again shows it closed.
 */

beforeAll(installTestTheme)

const page = () =>
  document.querySelector<HTMLElement>('[data-member="conversation-page"]') as HTMLElement

/**
 * The page in a box of the given width and 480px high, with an aside when `aside` holds
 * (`testing/ConversationPageHarness.svelte`). The box's width is `box.width`.
 */
async function render(width: number, aside = true) {
  const box = live({ width, aside })
  const { host } = await mountComponent(ConversationPageHarness, box)
  return { box, host }
}

const text = (words: string) =>
  [...document.querySelectorAll('p')].find((element) => element.textContent === words) ?? null

describe('ConversationPage arranges the aside by its own width', () => {
  it('puts the composer under the thread, at the bottom of the region', async () => {
    const { host } = await render(900, false)
    expect(page().hasAttribute('data-aside')).toBe(false)
    const thread = (text('thread') as HTMLElement).getBoundingClientRect()
    const composer = (text('composer') as HTMLElement).getBoundingClientRect()
    expect(composer.top).toBeGreaterThan(thread.bottom)
    expect(composer.bottom).toBeGreaterThan(
      (host.firstElementChild as HTMLElement).getBoundingClientRect().bottom - 60,
    )
  })

  it('sits beside the thread when the page is wide', async () => {
    await render(1000)
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('split'))
    const separator = document.querySelector('[role="separator"]')
    expect(separator?.getAttribute('aria-label')).toBe('Artifact')
    const thread = (text('thread') as HTMLElement).getBoundingClientRect()
    const artifact = (text('artifact') as HTMLElement).getBoundingClientRect()
    expect(artifact.left).toBeGreaterThan(thread.right)
    expect(page().querySelector('[data-member="page-header"] button')).toBeNull()
  })

  it('moves into a drawer when the page is narrow, and nothing is lost', async () => {
    await render(600)
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('drawer'))
    expect(document.querySelector('[role="separator"]')).toBeNull()
    expect(text('artifact')).toBeNull()
    const toggle = page().querySelector<HTMLButtonElement>(
      '[data-member="page-header"] button',
    ) as HTMLButtonElement
    await userEvent.click(toggle)
    await vi.waitFor(() => {
      const dialog = document.querySelector('[data-member="drawer"]')
      expect(dialog?.getAttribute('role')).toBe('dialog')
      expect(dialog?.textContent).toContain('Artifact')
      expect(text('artifact')).not.toBeNull()
    })
  })

  it('closes the drawer when the page widens, so narrowing again shows it closed', async () => {
    const { box } = await render(600)
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('drawer'))
    await userEvent.click(
      page().querySelector<HTMLButtonElement>('[data-member="page-header"] button') as HTMLElement,
    )
    await vi.waitFor(() => expect(document.querySelector('[data-member="drawer"]')).not.toBeNull())
    box.width = 1000
    await tick()
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('split'))
    box.width = 600
    await tick()
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('drawer'))
    await new Promise((settle) => setTimeout(settle, 50))
    expect(document.querySelector('[data-member="drawer"]')).toBeNull()
  })
})
