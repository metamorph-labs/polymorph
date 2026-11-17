import { beforeAll, describe, expect, it } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import Breadcrumbs from './Breadcrumbs.vue'

/**
 * Breadcrumbs keeps its one line inside its container
 * (`design/components/breadcrumbs.md`), as the React member's test holds it. The
 * recipe narrows the crumbs, and it reads the row's markup to do so: an item
 * whose first child is its crumb and whose last is its separator.
 */

beforeAll(installTestTheme)

const FOUR = [
  { label: 'Home', href: '#home' },
  { label: 'Workspaces', href: '#workspaces' },
  { label: 'Support', href: '#support' },
  { label: 'Ticket #4182' },
]

async function draw(width: number) {
  await mount(() =>
    h('div', { 'data-host': '', style: { inlineSize: `${width}px` } }, [
      h(Breadcrumbs, { items: FOUR }),
    ]),
  )
  const host = [...document.querySelectorAll<HTMLElement>('[data-host]')].at(-1) as HTMLElement
  const items = [...host.querySelectorAll('li')]
  return {
    host,
    items,
    widths: items.map((item) => item.getBoundingClientRect().width),
    natural:
      (items.at(-1)?.getBoundingClientRect().right ?? 0) -
      (items[0]?.getBoundingClientRect().left ?? 0),
    clipped: (at: number) => {
      const crumb = items[at]?.firstElementChild as HTMLElement
      return crumb.scrollWidth > crumb.clientWidth
    },
  }
}

describe('a row wider than its container', () => {
  it('narrows the middle crumbs first, and keeps both ends whole', async () => {
    const wide = await draw(1200)
    expect(wide.items.map((_, at) => wide.clipped(at))).toEqual([false, false, false, false])

    const narrow = await draw(Math.floor(wide.natural) - 20)
    const edge = narrow.host.getBoundingClientRect()
    expect(narrow.host.scrollWidth).toBe(narrow.host.clientWidth)
    for (const [at, item] of narrow.items.entries()) {
      const box = item.getBoundingClientRect()
      expect(box.right).toBeLessThanOrEqual(edge.right + 0.5)
      const next = narrow.items[at + 1]?.getBoundingClientRect()
      if (next !== undefined) expect(box.right).toBeLessThanOrEqual(next.left + 0.5)
    }
    expect(narrow.widths[0]).toBeCloseTo(wide.widths[0] ?? 0, 1)
    expect(narrow.widths[3]).toBeCloseTo(wide.widths[3] ?? 0, 1)
    expect([narrow.clipped(1), narrow.clipped(2)]).toEqual([true, true])
  })
})
