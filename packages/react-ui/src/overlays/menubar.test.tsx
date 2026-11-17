import { render } from '@testing-library/react'
import { page } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { menubarLaw } from '@polymorph/conformance/menubar'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/menubar.module.css'
import { Menubar, type MenubarMenu, type MenubarProps } from './Menubar'

/**
 * What a browser settles for Menubar beyond its law: the open menu is Menu's
 * panel, under its title and at its start edge, and the row of a long bar
 * scrolls inside its box. The keys, the tab stop, the hand-off between menus,
 * the pointer rule and the phone form are the law's
 * (`@polymorph/conformance/menubar`), which this file calls for React.
 */

beforeAll(installTestTheme)

afterEach(async () => {
  await page.viewport(1280, 800)
})

const noop = () => {}

const MENUS: MenubarMenu[] = [
  { label: 'File', entries: [{ label: 'New', onSelect: noop }] },
  { label: 'Edit', entries: [{ label: 'Undo', onSelect: noop }] },
]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<MenubarProps>(true)
  })
})

describe('the open menu is Menu’s panel', () => {
  it('draws the panel with Menu’s recipe, under its title and at its start edge', async () => {
    render(<Menubar label="Document" menus={MENUS} defaultOpen="Edit" />)
    const panel = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-menubar-part="panel"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    const title = document.querySelector<HTMLElement>('[data-state="open"][role="menuitem"]')
    expect(title?.textContent).toBe('Edit')
    // Menu's panel class, composed: the overlay surface and its inset.
    expect(getComputedStyle(panel).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    await expect
      .poll(() => {
        const at = panel.getBoundingClientRect()
        const from = (title as HTMLElement).getBoundingClientRect()
        return Math.abs(at.left - from.left) < 1 && at.top >= from.bottom
      })
      .toBe(true)
  })
})

describe('a long row', () => {
  it('scrolls inside its box, and the page does not scroll sideways', () => {
    const many = Array.from({ length: 12 }, (_, at) => ({
      label: `Menu ${at + 1}`,
      entries: [{ label: 'Command', onSelect: noop }],
    }))
    const { container } = render(
      <div className={styles.harness}>
        <Menubar label="Document" menus={many} />
      </div>,
    )
    const bar = container.querySelector<HTMLElement>('[role="menubar"]') as HTMLElement
    expect(bar.scrollWidth).toBeGreaterThan(bar.clientWidth)
    expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(
      (container.firstElementChild as HTMLElement).getBoundingClientRect().right + 1,
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  })
})

/**
 * An agent chooses an entry through the bridge, as the spec's `agent` fence declares
 * (`design/components/menubar.md`, Agent): by an id that begins with its title, without opening
 * its menu, running the entry's own handler, and closing a menu that is open.
 */
describe('an agent', () => {
  it('chooses by title and label, closes the open menu, and refuses a disabled title', async () => {
    const bridge = createAgentBridge()
    try {
      const create = vi.fn()
      const undo = vi.fn()
      render(
        <Menubar
          label="Document"
          defaultOpen="Edit"
          menus={[
            {
              label: 'File',
              entries: [
                { label: 'New', onSelect: create },
                {
                  kind: 'submenu',
                  label: 'Open recent',
                  items: [{ label: 'Plan', onSelect: noop }],
                },
              ],
            },
            { label: 'Edit', entries: [{ label: 'Undo', onSelect: undo }] },
            { label: 'Insert', disabled: true, entries: [{ label: 'Table', onSelect: noop }] },
          ]}
        />,
      )
      await vi.waitFor(() =>
        expect(document.querySelector('[data-menubar-part="panel"]')).not.toBeNull(),
      )
      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({
        member: 'Menubar',
        name: 'Document',
        state: {
          open: true,
          entries: [
            { id: 'File / New', label: 'New' },
            { id: 'File / Open recent / Plan', label: 'Plan' },
            { id: 'Edit / Undo', label: 'Undo' },
            { id: 'Insert / Table', label: 'Table', disabled: true },
          ],
        },
      })

      const chosen = await bridge.act([{ id: member?.id, action: 'choose', value: 'File / New' }])
      expect(chosen.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: true, to: false } },
      })
      expect(create).toHaveBeenCalledOnce()
      expect(undo).not.toHaveBeenCalled()
      await vi.waitFor(() =>
        expect(document.querySelector('[data-menubar-part="panel"]')).toBeNull(),
      )

      const refused = await bridge.act([
        { id: member?.id, action: 'choose', value: 'Insert / Table' },
      ])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
    } finally {
      bridge.dispose()
    }
  })

  it('closes the open menu', async () => {
    const bridge = createAgentBridge()
    try {
      render(<Menubar label="Document" menus={MENUS} defaultOpen="File" />)
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'close' }])
      expect(results[0]).toMatchObject({ ok: true, changed: { open: { from: true, to: false } } })
      await vi.waitFor(() =>
        expect(document.querySelector('[data-menubar-part="panel"]')).toBeNull(),
      )
    } finally {
      bridge.dispose()
    }
  })
})

menubarLaw({
  shell: 'React',
  mount({ menus }) {
    render(<Menubar label="Document" menus={menus} />)
    return Promise.resolve()
  },
})
