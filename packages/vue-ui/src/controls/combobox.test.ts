import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Combobox from './Combobox.vue'
import { states } from './combobox.states'

/**
 * Combobox in the Vue shell, where it shows what the React member's React Aria
 * hooks show (`packages/react-ui/src/controls/Combobox.tsx`): the scroll edge
 * that asks for the next page. The open list's name, whichever way the field is
 * named, is `@polymorph/conformance/combobox-list`'s, in `combobox-list.test.ts`.
 */

beforeAll(installTestTheme)

const MANY = Array.from({ length: 40 }, (_, at) => ({ value: `p${at}`, label: `Person ${at}` }))

const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]') as HTMLElement

describe('paging', () => {
  it('asks for the next page within 32px of the scroll end, and not before', async () => {
    const onLoadMore = vi.fn()
    await mount(() =>
      h(Combobox, { ariaLabel: 'Assignee', options: MANY, defaultOpen: true, onLoadMore }),
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    const list = listbox()
    await vi.waitFor(() => expect(list.scrollHeight).toBeGreaterThan(list.clientHeight + 100))
    const scrollTo = (fromEnd: number) => {
      list.scrollTop = list.scrollHeight - list.clientHeight - fromEnd
      list.dispatchEvent(new Event('scroll'))
    }
    // One pixel outside the boundary on each side, not 33 and 32. Firefox places a scroll
    // offset on device pixels, so with a fractional pixel ratio an offset asked for in CSS
    // pixels is held to within a pixel, and 32 is read as a little more or a little less.
    scrollTo(34)
    expect(onLoadMore).not.toHaveBeenCalled()
    scrollTo(31)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('draws the line at exactly 32px: 32 asks, and anything more does not', async () => {
    const onLoadMore = vi.fn()
    await mount(() =>
      h(Combobox, { ariaLabel: 'Assignee', options: MANY, defaultOpen: true, onLoadMore }),
    )
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    const list = listbox()
    // The three lengths the member reads, stated on the element. A real scroll offset cannot
    // state them: Firefox holds one to within a pixel, which is why the test above stands a
    // pixel clear of the line. This one holds the line itself, on every engine.
    const lengths = (fromEnd: number) => {
      const state = { scrollHeight: 1000, clientHeight: 200, scrollTop: 800 - fromEnd }
      for (const [name, value] of Object.entries(state)) {
        Object.defineProperty(list, name, { configurable: true, get: () => value })
      }
      list.dispatchEvent(new Event('scroll'))
    }
    lengths(33)
    lengths(32.5)
    expect(onLoadMore).not.toHaveBeenCalled()
    lengths(32)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })
})

describe('the fixture’s typed entries', () => {
  const entry = (name: string) => {
    const found = states.entries.find((candidate) => candidate.name === name)
    if (found === undefined) throw new Error(`no entry "${name}"`)
    return found
  }
  const field = () =>
    document.querySelector<HTMLInputElement>('[role="combobox"]') as HTMLInputElement

  it('open with the query typed, and stay typeable, as React’s entries do', async () => {
    await mount(() => entry('open filtered').render())
    await vi.waitFor(() => expect(listbox()).not.toBeNull())
    expect(field().value).toBe('a')
    await userEvent.type(field(), 'd')
    await vi.waitFor(() => expect(field().value).toBe('ad'))
  })

  it('show no option for a query that matches none', async () => {
    await mount(() => entry('empty results').render())
    await vi.waitFor(() => expect(field().value).toBe('zzzz'))
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0)
  })

  it('keep a custom value editable', async () => {
    await mount(() => entry('custom value').render())
    expect(field().value).toBe('Quarterly review')
    await userEvent.type(field(), ' Q3')
    await vi.waitFor(() => expect(field().value).toBe('Quarterly review Q3'))
  })
})
