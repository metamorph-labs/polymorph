import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import '../archetypes/ListPage'
import '../controls/Button'
import '../overlays/Menu'
import type { PolyPaginationElement } from '../structure/Pagination'
import '../structure/Pagination'
import type { PolyTreeElement } from '../structure/Tree'
import '../structure/Tree'
import '../structure/TableCell'
import '../structure/TableRow'
import { mount } from '../mount'

/**
 * What the bridge reads that is more than an attribute's text: a set from a
 * JSON array, an object prop's node fields from children with a dotted slot
 * name, the callbacks a JSON item requires completed with events, a messages
 * catalogue that holds a formatter as a property only, and a structural part
 * written outside its member.
 */

beforeAll(installTestTheme)

afterEach(() => {
  vi.restoreAllMocks()
})

const TREE =
  '[{"id":"engineering","label":"Engineering","children":[{"id":"platform","label":"Platform"}]},{"id":"design","label":"Design"}]'

const expandedRows = () =>
  [...document.querySelectorAll('[role="treeitem"][aria-expanded="true"]')].map((row) =>
    row.textContent?.trim(),
  )

describe('a set', () => {
  it('reads a JSON array of its members from an attribute', async () => {
    const { host } = await mount({
      name: 'set',
      html: `<poly-tree label="Units" items='${TREE}' expanded='["engineering"]'></poly-tree>`,
    })
    const tree = host.querySelector('poly-tree') as PolyTreeElement
    expect(tree.expanded).toEqual(new Set(['engineering']))
    await vi.waitFor(() => expect(expandedRows()).toHaveLength(1))
    expect(expandedRows()[0]).toContain('Engineering')
  })

  it('reads an array set through a property as the set of its items', async () => {
    const { host } = await mount({
      name: 'property',
      html: `<poly-tree label="Units" items='${TREE}'></poly-tree>`,
    })
    const tree = host.querySelector('poly-tree') as unknown as Record<string, unknown>
    tree.expanded = ['engineering']
    expect(tree.expanded).toEqual(new Set(['engineering']))
    await vi.waitFor(() => expect(expandedRows()).toHaveLength(1))
  })
})

describe('an object prop’s node fields', () => {
  it('fills a field from children whose slot names the prop and the field', async () => {
    const { host } = await mount({
      name: 'dotted',
      html: `<poly-list-page title="Tickets" empty empty-state='{"title":"No tickets yet","description":"New ones land here."}'><poly-button slot="empty-state.action" label="New ticket"></poly-button><poly-button slot="empty-state.secondary-action" variant="ghost" label="Import"></poly-button></poly-list-page>`,
    })
    const empty = await vi.waitFor(() => {
      const found = host.querySelector('[data-member="empty-state"]')
      if (found === null) throw new Error('no empty state')
      return found
    })
    expect(empty.textContent).toContain('No tickets yet')
    expect([...empty.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'New ticket',
      'Import',
    ])
  })
})

describe('a JSON item’s required callbacks', () => {
  const MENU = `<poly-menu default-open items='[{"label":"Rename"},{"kind":"checkbox","label":"Wrap lines","checked":false},{"kind":"separator"},{"label":"Archive"}]'><poly-button slot="trigger" label="Actions"></poly-button></poly-menu>`

  it('dispatches each item’s event on the element, with the item and its index', async () => {
    const { host } = await mount({ name: 'menu', html: MENU })
    const menu = host.querySelector('poly-menu') as HTMLElement
    const heard: unknown[] = []
    menu.addEventListener('poly-select', (event) => heard.push((event as CustomEvent).detail))
    menu.addEventListener('poly-checked-change', (event) =>
      heard.push((event as CustomEvent).detail),
    )
    const item = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')][0]
      if (found === undefined) throw new Error('the menu did not open')
      return found
    })
    await userEvent.click(item)
    await vi.waitFor(() => expect(heard).toHaveLength(1))
    expect(heard[0]).toEqual({
      item: { kind: 'checkbox', label: 'Wrap lines', checked: false },
      index: 1,
      value: true,
    })
    ;(menu as unknown as { open: boolean }).open = true
    const archive = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (candidate) => candidate.textContent?.includes('Archive'),
      )
      if (found === undefined) throw new Error('the menu did not open again')
      return found
    })
    await userEvent.click(archive)
    await vi.waitFor(() => expect(heard).toHaveLength(2))
    expect(heard[1]).toEqual({ item: { label: 'Archive' }, index: 3 })
  })

  it('keeps a callback the page gave an item, and leaves the page’s objects unchanged', async () => {
    const { host } = await mount({
      name: 'own',
      html: '<poly-menu default-open><poly-button slot="trigger" label="Actions"></poly-button></poly-menu>',
    })
    const menu = host.querySelector('poly-menu') as unknown as Record<string, unknown> & HTMLElement
    const chosen: string[] = []
    const items = [{ label: 'Rename', onSelect: () => chosen.push('rename') }, { label: 'Archive' }]
    menu.items = items
    expect(items[1]).toEqual({ label: 'Archive' })
    const heard: unknown[] = []
    menu.addEventListener('poly-select', (event) => heard.push((event as CustomEvent).detail))
    const rename = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]
      if (found === undefined) throw new Error('the menu did not open')
      return found
    })
    await userEvent.click(rename)
    await vi.waitFor(() => expect(chosen).toEqual(['rename']))
    expect(heard).toEqual([])
  })
})

describe('a value no attribute can hold', () => {
  it('reads a messages catalogue that holds a formatter through its property only', () => {
    const Pagination = customElements.get('poly-pagination') as unknown as {
      observedAttributes: string[]
    }
    expect(Pagination.observedAttributes).not.toContain('messages')
    expect(Pagination.observedAttributes).toContain('page-count')
    const element = document.createElement('poly-pagination') as PolyPaginationElement
    const messages = { previous: 'Back', next: 'On', page: (page: number) => `Seite ${page}` }
    element.messages = messages
    expect(element.messages).toBe(messages)
  })
})

describe('a structural part outside its member', () => {
  it('renders nothing, and says which member it belongs in', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host } = await mount({
      name: 'stray row',
      html: '<poly-table-row><poly-table-cell>Alone</poly-table-cell></poly-table-row>',
    })
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/<poly-table-row>.*<poly-table>/)),
    )
    expect(host.querySelector('tr')).toBeNull()
  })
})
