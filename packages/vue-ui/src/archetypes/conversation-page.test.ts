import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import ConversationPage from './ConversationPage.vue'

/**
 * ConversationPage's one decision in Vue is geometry
 * (`design/archetypes/conversation-page.md`): the composer sits under the
 * thread at the bottom of the region, and the page's own width puts the aside
 * beside the thread above `48rem` and behind a Drawer below it, with nothing
 * dropped. Widening closes the drawer, so narrowing again shows it closed.
 */

beforeAll(installTestTheme)

const page = () =>
  document.querySelector<HTMLElement>('[data-member="conversation-page"]') as HTMLElement

/** The page in a box of the given width and 480px high, with an aside when `aside` holds. */
async function render(width: number, aside = true) {
  const box = ref(width)
  const { host } = await mount(() =>
    h('div', { style: { inlineSize: `${box.value}px`, blockSize: '480px' } }, [
      h(
        ConversationPage,
        { title: 'Chat', ...(aside ? { asideLabel: 'Artifact' } : {}) },
        {
          thread: () => [h('p', 'thread')],
          composer: () => [h('p', 'composer')],
          ...(aside ? { aside: () => [h('p', 'artifact')] } : {}),
        },
      ),
    ]),
  )
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
    box.value = 1000
    await nextTick()
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('split'))
    box.value = 600
    await nextTick()
    await vi.waitFor(() => expect(page().getAttribute('data-aside')).toBe('drawer'))
    await new Promise((settle) => setTimeout(settle, 50))
    expect(document.querySelector('[data-member="drawer"]')).toBeNull()
  })
})

describe('the aside’s name', () => {
  it('warns when an aside comes without its name, which React’s types refuse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unmount } = await mount(() =>
      h(
        ConversationPage,
        { title: 'Chat' },
        {
          thread: () => [h('p', 'thread')],
          composer: () => [h('p', 'composer')],
          aside: () => [h('p', 'artifact')],
        },
      ),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('`asideLabel`'))
    unmount()
    warn.mockClear()
    await render(1000)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
