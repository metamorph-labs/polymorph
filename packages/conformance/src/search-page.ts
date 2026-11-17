import { getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a SearchPage does around its query
 * (`design/archetypes/search-page.md`, Behaviour and A11y), which every web
 * shell's SearchPage test calls with a mount of its own. A contract statement
 * starts from a fixture entry, changes no prop, and says that a handler ran but
 * not how often (`docs/conformance.md`). So the law submits the form and
 * counts, sets `empty` and `pending` after the mount as the application around
 * the page would, and reads every state for a live region.
 *
 * It focuses the field from a script and reads `document.activeElement`,
 * because Tab passes over some controls in WebKit. It waits for focus and for
 * each change, because Firefox and WebKit settle a frame later.
 */

/** What the law sets on the page after it mounts. */
export interface SearchPageState {
  empty: boolean
  pending: boolean
}

export interface MountedSearchPage {
  /** Sets props on the page, as its parent's state would. */
  set(next: Partial<SearchPageState>): void | Promise<void>
}

export interface SearchPageLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts a SearchPage titled `Search` whose `searchLabel` is `Workspace`.
   * Its `search` slot is one Input with the `aria-label` `Query`, its children
   * one paragraph reading `Results`, and its `emptyState` is titled `No
   * results`. It starts with `empty` and `pending` false. It is given
   * `onSubmit` only when the law passes one.
   */
  mount(options: { onSubmit?: () => void }): Promise<MountedSearchPage>
}

const LANDMARK = 'Workspace'

const root = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="search-page"]')
  if (element === null) throw new Error('the SearchPage rendered nothing')
  return element
}

const results = (): HTMLElement => {
  const element = root().querySelector<HTMLElement>('[data-search-page-part="results"]')
  if (element === null) throw new Error('the SearchPage drew no results region')
  return element
}

const field = () => getByRole<HTMLInputElement>(document.body, 'textbox', { name: 'Query' })

/** Two frames, in which an engine that moves focus after a change has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/** Every element of the page that a screen reader hears as it changes. */
const LIVE =
  '[aria-live], [role="status"], [role="alert"], [role="log"], [role="progressbar"], [data-member="spinner"]'

export function searchPageLaw({ shell, mount }: SearchPageLaw): void {
  describe(`${shell} SearchPage — the query, its form and its results`, () => {
    beforeAll(installTestTheme)

    it('calls onSubmit once on Enter in the field, and the browser stays on the page', async () => {
      const onSubmit = vi.fn()
      // A submit that reaches the window has passed every handler of the page.
      // The law records whether one prevented it, and then prevents it itself,
      // so a page that lets the browser navigate fails here rather than
      // leaving the test's document.
      const prevented: boolean[] = []
      const guard = (event: Event) => {
        prevented.push(event.defaultPrevented)
        event.preventDefault()
      }
      window.addEventListener('submit', guard)
      try {
        await mount({ onSubmit })
        field().focus()
        await vi.waitFor(() => expect(document.activeElement).toBe(field()))
        await userEvent.keyboard('{Enter}')
        await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        await frames()
        expect(onSubmit).toHaveBeenCalledTimes(1)
        expect(prevented).toEqual([true])
      } finally {
        window.removeEventListener('submit', guard)
      }
    })

    it('is a form, named by searchLabel, when it has onSubmit', async () => {
      await mount({ onSubmit: () => {} })
      const landmark = getByRole(document.body, 'search', { name: LANDMARK })
      expect(landmark.tagName).toBe('FORM')
      expect(landmark.contains(field())).toBe(true)
      expect(root().querySelectorAll('form')).toHaveLength(1)
    })

    it('is the same named landmark and no form without onSubmit, so Enter goes nowhere', async () => {
      await mount({})
      const landmark = getByRole(document.body, 'search', { name: LANDMARK })
      expect(landmark.tagName).not.toBe('FORM')
      expect(landmark.contains(field())).toBe(true)
      expect(root().querySelector('form')).toBeNull()
    })

    it('keeps focus in the field when the results give way to the empty state, and back', async () => {
      const page = await mount({})
      field().focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(field()))

      await page.set({ empty: true })
      await vi.waitFor(() =>
        expect(queryByRole(results(), 'heading', { name: 'No results' })).not.toBeNull(),
      )
      expect(root().hasAttribute('data-empty')).toBe(true)
      expect(results().textContent).not.toContain('Results')
      await frames()
      expect(document.activeElement).toBe(field())

      await page.set({ empty: false })
      await vi.waitFor(() => expect(results().textContent).toContain('Results'))
      expect(root().hasAttribute('data-empty')).toBe(false)
      expect(queryByRole(results(), 'heading', { name: 'No results' })).toBeNull()
      await frames()
      expect(document.activeElement).toBe(field())
    })

    it('marks the results busy while a search runs, and keeps the last results in them', async () => {
      const page = await mount({})
      expect(results().hasAttribute('aria-busy')).toBe(false)

      await page.set({ pending: true })
      await vi.waitFor(() => expect(results().getAttribute('aria-busy')).toBe('true'))
      expect(root().hasAttribute('data-pending')).toBe(true)
      expect(results().textContent).toContain('Results')
      // Only the results are busy: the field stays usable while they load.
      expect(root().querySelectorAll('[aria-busy="true"]')).toHaveLength(1)

      await page.set({ pending: false })
      await vi.waitFor(() => expect(results().hasAttribute('aria-busy')).toBe(false))
      expect(root().hasAttribute('data-pending')).toBe(false)
    })

    it('holds no live region and no spinner of its own, in any state', async () => {
      const page = await mount({ onSubmit: () => {} })
      const states: SearchPageState[] = [
        { empty: false, pending: false },
        { empty: false, pending: true },
        { empty: true, pending: false },
        { empty: true, pending: true },
      ]
      for (const state of states) {
        await page.set(state)
        await vi.waitFor(() => expect(root().hasAttribute('data-empty')).toBe(state.empty))
        await vi.waitFor(() => expect(root().hasAttribute('data-pending')).toBe(state.pending))
        expect(root().querySelector(LIVE), JSON.stringify(state)).toBeNull()
      }
    })
  })
}
