import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { directionLaw } from '@polymorph/conformance/direction'

import { solidAdapter } from './conformance/solid'
import { GALLERIES } from './galleries'

/**
 * The reading-direction law for the Solid shell, as
 * `@polymorph/conformance/direction` states it for every shell: no member
 * says left-to-right in a right-to-left document, and Tabs turns with it.
 */
directionLaw({ shell: 'Solid', adapter: solidAdapter, galleries: GALLERIES })

/**
 * A section of a left-to-right page that says `dir="rtl"` (`readDirection` in `@polymorph/engine`):
 * a member reads the direction of the place it is in, and follows it when it changes. The
 * element an entry renders into is the section here.
 */
describe('reading direction — a right-to-left section of a left-to-right page (Solid)', () => {
  beforeAll(installTestTheme)

  it('turns Tabs: the arrow that points left moves to the next tab', async () => {
    const mounted = await solidAdapter.mount('Tabs', {
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
    const mounted = await solidAdapter.mount('Rating', { state: 'three of five' })
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
