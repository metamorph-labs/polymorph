import { page, userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { directionLaw } from '@polymorph/conformance/direction'

import { vueAdapter } from './conformance/vue'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the Vue shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'Vue', adapter: vueAdapter, galleries: GALLERIES })

/**
 * A section of a left-to-right page that says `dir="rtl"` (`readDirection` in `@polymorph/engine`):
 * a member reads the direction of the place it is in, and follows it when it changes. The
 * element an entry renders into is the section here.
 */
describe('reading direction — a right-to-left section of a left-to-right page (Vue)', () => {
  beforeAll(installTestTheme)

  it('turns Tabs: the arrow that points left moves to the next tab', async () => {
    const mounted = await vueAdapter.mount('Tabs', {
      state: 'icons and counts — the active tab’s count takes the accent',
    })
    try {
      const root = mounted.root.querySelector('[data-member="tabs"]') as HTMLElement
      expect(root.getAttribute('dir')).toBe('ltr')
      mounted.root.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(root.getAttribute('dir')).toBe('rtl'))
      const [first, second] = [...mounted.root.querySelectorAll<HTMLElement>('[role="tab"]')]
      first?.focus()
      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => expect(document.activeElement).toBe(second))
    } finally {
      mounted.unmount()
    }
  })

  it('turns Rating: the arrow that points left moves to the next mark', async () => {
    const mounted = await vueAdapter.mount('Rating', { state: 'three of five' })
    try {
      mounted.root.setAttribute('dir', 'rtl')
      const marks = [...mounted.root.querySelectorAll<HTMLElement>('[role="radio"]')]
      marks[2]?.focus()
      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => expect(document.activeElement).toBe(marks[3]))
    } finally {
      mounted.unmount()
    }
  })
})

/**
 * Members whose place is not a plain element of their own: Calendar's root is its machine's content
 * part, whose `dir` is the one the member handed the machine, and Menubar's bar is drawn only off a
 * phone's width. Each reads the section around it.
 */
describe('reading direction — places a section reaches (Vue)', () => {
  beforeAll(installTestTheme)

  it("turns Calendar, whose root is its machine's content part", async () => {
    const mounted = await vueAdapter.mount('Calendar', { state: 'month with selection' })
    try {
      const root = mounted.root.querySelector('[data-member="calendar"]') as HTMLElement
      expect(root.getAttribute('dir')).toBe('ltr')
      mounted.root.setAttribute('dir', 'rtl')
      await vi.waitFor(() => expect(root.getAttribute('dir')).toBe('rtl'))
    } finally {
      mounted.unmount()
    }
  })

  it('reads the section once a branch draws the place: Menubar’s bar past a phone’s width', async () => {
    await page.viewport(420, 800)
    const mounted = await vueAdapter.mount('Menubar', {
      state: 'resting — the titles, and no menu open',
    })
    try {
      mounted.root.setAttribute('dir', 'rtl')
      await page.viewport(1280, 800)
      const title = await vi.waitFor(() => {
        const found = mounted.root.querySelector<HTMLElement>('[data-menubar-part="title"]')
        expect(found).not.toBeNull()
        return found as HTMLElement
      })
      await vi.waitFor(() => expect(title.getAttribute('dir')).toBe('rtl'))
    } finally {
      await page.viewport(1280, 800)
      mounted.unmount()
    }
  })
})
