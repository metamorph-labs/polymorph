import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { MountAdapter } from './run'

/**
 * The law for a right-to-left document (`readDirection` in `@polymorph/engine`
 * says how a member reads the direction), which each shell's
 * `direction.test` calls with its own adapter and galleries.
 *
 * A recipe mirrors by itself, because it is written in logical properties. A
 * substrate does not: given no direction it writes `dir="ltr"` on the member's
 * root, and the member then runs left to right inside a right-to-left page.
 * So the law renders every states fixture entry of every member in a document
 * whose root says `dir="rtl"`, and no element may say `dir="ltr"`. A member
 * that says it on purpose is in the shell's `leftToRight` list with the
 * reason, and one listed there that no longer says it fails the law.
 *
 * Tabs is then held to what the direction means for it: the first tab is the
 * rightmost, the arrow that points left moves to the next tab, and a member
 * already on the page turns when the document does.
 */

export interface DirectionLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
  /** The shell's galleries: every member with its states fixture entries. */
  readonly galleries: readonly {
    readonly component: string
    readonly entries: readonly { readonly name: string }[]
  }[]
  /** The members that say `dir="ltr"` on purpose, each with the reason. */
  readonly leftToRight?: Readonly<Record<string, string>>
}

/** What an element is, for a failure message: `div[data-member="tabs"]`. */
function named(element: Element): string {
  const tag = element.tagName.toLowerCase()
  for (const attribute of ['data-member', 'role', 'data-part', 'class']) {
    const value = element.getAttribute(attribute)
    if (value) return `${tag}[${attribute}="${value}"]`
  }
  return tag
}

export function directionLaw({ shell, adapter, galleries, leftToRight = {} }: DirectionLaw): void {
  describe(`reading direction — the ${shell} shell`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    for (const gallery of galleries) {
      const reason = leftToRight[gallery.component]
      const title =
        reason === undefined
          ? `${gallery.component} says left-to-right nowhere in a right-to-left document`
          : `${gallery.component} says left-to-right in a right-to-left document: ${reason}`
      it(title, async () => {
        document.documentElement.setAttribute('dir', 'rtl')
        const said: string[] = []
        for (const entry of gallery.entries) {
          const mounted = await adapter.mount(gallery.component, { state: entry.name })
          try {
            // The whole document, so a surface the member portals out is read too.
            for (const element of document.querySelectorAll('[dir="ltr"]')) {
              said.push(`${entry.name}: ${named(element)}`)
            }
          } finally {
            mounted.unmount()
          }
        }
        if (reason === undefined) expect(said).toEqual([])
        else expect(said, 'the listed member no longer says it').not.toEqual([])
      })
    }

    for (const member of Object.keys(leftToRight)) {
      it(`lists ${member}, which the shell ships`, () => {
        expect(galleries.map((gallery) => gallery.component)).toContain(member)
      })
    }

    describe('Tabs', () => {
      const entries = galleries.find((gallery) => gallery.component === 'Tabs')?.entries ?? []
      const tabs = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[role="tab"]')]
      const box = (element: Element) => element.getBoundingClientRect()

      /**
       * The first entry that draws a horizontal strip of three tabs or more,
       * all of them open. With two tabs the arrows cannot tell the directions
       * apart, because either arrow reaches the other tab.
       */
      async function strip() {
        for (const entry of entries) {
          const mounted = await adapter.mount('Tabs', { state: entry.name })
          const root = mounted.root.querySelector('[data-member="tabs"]')
          const drawn = tabs(mounted.root)
          if (
            root?.getAttribute('data-orientation') === 'horizontal' &&
            drawn.length >= 3 &&
            drawn.every((tab) => !tab.hasAttribute('data-disabled'))
          ) {
            return mounted
          }
          mounted.unmount()
        }
        throw new Error('direction: Tabs has no states fixture entry with a horizontal strip')
      }

      it('starts at the right edge and reads leftwards', async () => {
        document.documentElement.setAttribute('dir', 'rtl')
        const mounted = await strip()
        try {
          const [first, second, third] = tabs(mounted.root) as [
            HTMLElement,
            HTMLElement,
            HTMLElement,
          ]
          expect(first.closest('[data-member="tabs"]')?.getAttribute('dir')).toBe('rtl')
          expect(box(first).right).toBeGreaterThan(box(second).right)
          expect(box(second).right).toBeGreaterThan(box(third).right)
        } finally {
          mounted.unmount()
        }
      })

      it('moves to the next tab on the arrow that points left', async () => {
        document.documentElement.setAttribute('dir', 'rtl')
        const mounted = await strip()
        try {
          const [first, second, third] = tabs(mounted.root) as [
            HTMLElement,
            HTMLElement,
            HTMLElement,
          ]
          first.focus()
          await userEvent.keyboard('{ArrowLeft}')
          await vi.waitFor(() => expect(document.activeElement).toBe(second))
          await userEvent.keyboard('{ArrowLeft}')
          await vi.waitFor(() => expect(document.activeElement).toBe(third))
          await userEvent.keyboard('{ArrowRight}')
          await vi.waitFor(() => expect(document.activeElement).toBe(second))
        } finally {
          mounted.unmount()
        }
      })

      it('turns when the document does, while it is on the page', async () => {
        const mounted = await strip()
        try {
          const root = mounted.root.querySelector('[data-member="tabs"]') as HTMLElement
          expect(root.getAttribute('dir')).toBe('ltr')
          document.documentElement.setAttribute('dir', 'rtl')
          await vi.waitFor(() => expect(root.getAttribute('dir')).toBe('rtl'))
          document.documentElement.setAttribute('dir', 'ltr')
          await vi.waitFor(() => expect(root.getAttribute('dir')).toBe('ltr'))
        } finally {
          mounted.unmount()
        }
      })
    })
  })
}
