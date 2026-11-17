import { render } from '@testing-library/react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Table } from '../structure/Table'
import { ContextMenu, type ContextMenuProps } from './ContextMenu'
import type { MenuEntry } from './Menu'

/**
 * ContextMenu in a real browser.
 *
 * No public prop opens it, because the spec has no `open` prop, so reaching
 * the open state is the test: a real press opens the panel at the point.
 * Everything after that is Menu's code, tested in Menu's tests. The other
 * thing only a browser can check is the merge: the trigger has no box, so a
 * wrapped table row is still a table row.
 */

const noop = () => {}

const ENTRIES: MenuEntry[] = [
  { label: 'Assign to me', onSelect: noop },
  { label: 'Snooze', onSelect: noop },
  { kind: 'checkbox', label: 'Watching', checked: false, onCheckedChange: noop },
  { kind: 'separator' },
  { label: 'Delete', tone: 'danger', onSelect: noop },
]

beforeAll(installTestTheme)

const panel = () => document.querySelector('[role="menu"]') as HTMLElement | null

async function summon(surface: Element): Promise<HTMLElement> {
  await userEvent.click(surface as HTMLElement, { button: 'right' })
  await vi.waitFor(() => expect(panel()).not.toBeNull())
  return panel() as HTMLElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ContextMenuProps>(true)
  })
})

describe('the gesture', () => {
  it('opens at the press, reports the change, and closes on Escape', async () => {
    const onOpenChange = vi.fn()
    const { getByText } = render(
      <ContextMenu entries={ENTRIES} onOpenChange={onOpenChange}>
        <div>The ticket surface</div>
      </ContextMenu>,
    )

    const opened = await summon(getByText('The ticket surface'))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    // Menu's grammar on the context gesture: the quiet danger tone and the
    // checkbox entry both come through the shared rows.
    const items = [...opened.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')]
    expect(items.map((item) => item.textContent)).toEqual([
      'Assign to me',
      'Snooze',
      'Watching',
      'Delete',
    ])
    const danger = items.find((item) => item.textContent === 'Delete')
    expect(danger?.getAttribute('data-tone')).toBe('danger')

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('toggles a checkbox entry without dismissing, as Menu’s stay-open rule requires', async () => {
    const onCheckedChange = vi.fn()
    const { getByText } = render(
      <ContextMenu
        entries={[
          { label: 'Assign to me', onSelect: noop },
          { kind: 'checkbox', label: 'Watching', checked: false, onCheckedChange },
        ]}
      >
        <div>The surface</div>
      </ContextMenu>,
    )

    const opened = await summon(getByText('The surface'))
    await userEvent.click(opened.querySelector('[role="menuitemcheckbox"]') as HTMLElement)

    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(panel()).not.toBeNull()
  })

  it('runs a plain command and dismisses, as Menu does', async () => {
    const onSelect = vi.fn()
    const { getByText } = render(
      <ContextMenu entries={[{ label: 'Assign to me', onSelect }]}>
        <div>The surface</div>
      </ContextMenu>,
    )

    const opened = await summon(getByText('The surface'))
    await userEvent.click(opened.querySelector('[role="menuitem"]') as HTMLElement)

    expect(onSelect).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(panel()).toBeNull())
  })
})

/**
 * The sheet, below 30rem (the sheet presentation, with Menu's sheet form
 * unchanged). The same gesture, with the substrate's own timing, opens the
 * shared sheet instead of the press-point popper. The press point no longer
 * affects geometry, and the semantics come from the react-aria lane.
 */
describe('the sheet, below 30rem', () => {
  const sheetPanel = () =>
    document.querySelector('[data-presentation="sheet"]') as HTMLElement | null

  afterEach(async () => {
    await page.viewport(1280, 800)
  })

  it('opens the sheet from the same gesture, with the same rows, and reports the change', async () => {
    await page.viewport(420, 800)
    const onOpenChange = vi.fn()
    const { getByText } = render(
      <ContextMenu entries={ENTRIES} onOpenChange={onOpenChange}>
        <div>The ticket surface</div>
      </ContextMenu>,
    )

    await userEvent.click(getByText('The ticket surface'), { button: 'right' })
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    // The same command list and entries, inside the sheet's own menu.
    const opened = panel() as HTMLElement
    expect(sheetPanel()?.contains(opened)).toBe(true)
    const items = [...opened.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')]
    expect(items.map((item) => item.textContent)).toEqual([
      'Assign to me',
      'Snooze',
      'Watching',
      'Delete',
    ])
    expect(items.find((item) => item.textContent === 'Delete')?.getAttribute('data-tone')).toBe(
      'danger',
    )

    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('shows entries with a submenu in the sheet, flattened', async () => {
    await page.viewport(420, 800)
    const { getByText } = render(
      <ContextMenu
        entries={[
          { label: 'Assign to me', onSelect: noop },
          { kind: 'submenu', label: 'Move to', items: [{ label: 'Backlog', onSelect: noop }] },
        ]}
      >
        <div>The surface</div>
      </ContextMenu>,
    )

    await userEvent.click(getByText('The surface'), { button: 'right' })
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    // The submenu renders as its label followed by its items inline (as
    // `design/components/menu.md` specifies). `sheet-menu.tsx` does the
    // flattening; this test only checks that the member passes the full set.
    const opened = panel() as HTMLElement
    expect(opened.textContent).toContain('Move to')
    const items = [...opened.querySelectorAll('[role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual(['Assign to me', 'Backlog'])
  })

  it('runs a command and dismisses; a checkbox holds the sheet open', async () => {
    await page.viewport(420, 800)
    const onSelect = vi.fn()
    const onCheckedChange = vi.fn()
    const { getByText } = render(
      <ContextMenu
        entries={[
          { label: 'Assign to me', onSelect },
          { kind: 'checkbox', label: 'Watching', checked: false, onCheckedChange },
        ]}
      >
        <div>The surface</div>
      </ContextMenu>,
    )

    await userEvent.click(getByText('The surface'), { button: 'right' })
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())

    await userEvent.click(document.querySelector('[role="menuitemcheckbox"]') as HTMLElement)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(sheetPanel()).not.toBeNull()

    await userEvent.click(document.querySelector('[role="menuitem"]') as HTMLElement)
    expect(onSelect).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())
  })

  it('opens again from a second gesture, because the pinned root never goes stale', async () => {
    await page.viewport(420, 800)
    const { getByText } = render(
      <ContextMenu entries={ENTRIES}>
        <div>The surface</div>
      </ContextMenu>,
    )
    const surface = getByText('The surface')

    await userEvent.click(surface, { button: 'right' })
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(sheetPanel()).toBeNull())

    await userEvent.click(surface, { button: 'right' })
    await vi.waitFor(() => expect(sheetPanel()).not.toBeNull())
  })

  it('keeps the press-point popper with presentation="popover"', async () => {
    await page.viewport(420, 800)
    const { getByText } = render(
      <ContextMenu entries={ENTRIES} presentation="popover">
        <div>The surface</div>
      </ContextMenu>,
    )
    await summon(getByText('The surface'))
    expect(sheetPanel()).toBeNull()
    expect(panel()?.getAttribute('data-side')).toBeTruthy()
  })
})

describe('the merge', () => {
  it('has no box of its own, so a wrapped row is still a row', async () => {
    const { container } = render(
      <Table label="Tickets">
        <Table.Head>
          <Table.Row>
            <Table.Header>Ticket</Table.Header>
            <Table.Header>Subject</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          <ContextMenu entries={ENTRIES}>
            <Table.Row>
              <Table.Cell>T-1041</Table.Cell>
              <Table.Cell>Login loop after password reset</Table.Cell>
            </Table.Row>
          </ContextMenu>
        </Table.Body>
      </Table>,
    )

    // The trigger span drops out of layout: the row it wraps lays out as a row
    // of the table's grid, with headers over cells.
    const surface = container.querySelector('tbody span') as HTMLElement
    expect(getComputedStyle(surface).display).toBe('contents')

    const row = surface.querySelector('tr') as HTMLElement
    const cells = [...row.querySelectorAll('td')]
    const headers = [...container.querySelectorAll('th')]
    expect(cells).toHaveLength(2)
    expect(row.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(cells[0]?.getBoundingClientRect().left).toBeCloseTo(
      headers[0]?.getBoundingClientRect().left ?? Number.NaN,
      0,
    )

    // The gesture still works on the row's own area.
    await summon(row)
    expect(panel()).not.toBeNull()
  })
})

/**
 * An agent chooses an entry through the bridge, as the spec's `agent` fence declares
 * (`design/components/context-menu.md`, Agent): without the gesture, by Menu's ids, running the
 * entry's own handler, and closing a menu a person opened when the entry is a command.
 */
describe('an agent', () => {
  it('reads the surface and its entries, and chooses without opening the menu', async () => {
    const bridge = createAgentBridge()
    try {
      const watch = vi.fn()
      const assign = vi.fn()
      render(
        <ContextMenu
          entries={[
            { label: 'Assign to me', onSelect: assign },
            { kind: 'checkbox', label: 'Watching', checked: false, onCheckedChange: watch },
            { kind: 'submenu', label: 'Move to', items: [{ label: 'Billing', onSelect: noop }] },
            { label: 'Delete', tone: 'danger', onSelect: noop },
          ]}
        >
          <div>The ticket surface</div>
        </ContextMenu>,
      )
      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({
        member: 'ContextMenu',
        name: 'The ticket surface',
        state: {
          open: false,
          entries: [
            { id: 'Assign to me', label: 'Assign to me' },
            { id: 'Watching', label: 'Watching' },
            { id: 'Move to / Billing', label: 'Billing' },
            { id: 'Delete', label: 'Delete', destructive: true },
          ],
        },
      })
      const toggled = await bridge.act([{ id: member?.id, action: 'choose', value: 'Watching' }])
      expect(toggled.results[0]).toMatchObject({ ok: true })
      expect(watch).toHaveBeenCalledWith(true)
      expect(panel()).toBeNull()
      // A destructive entry waits for a person, and with no one to ask it does not run.
      const asked = await bridge.act([{ id: member?.id, action: 'choose', value: 'Delete' }])
      expect(asked.results[0]).toMatchObject({ ok: false, error: { code: 'needs-confirmation' } })
    } finally {
      bridge.dispose()
    }
  })

  it('closes a menu a person opened when it chooses a command', async () => {
    const bridge = createAgentBridge()
    try {
      const assign = vi.fn()
      const onOpenChange = vi.fn()
      const { getByText } = render(
        <ContextMenu
          entries={[{ label: 'Assign to me', onSelect: assign }]}
          onOpenChange={onOpenChange}
        >
          <div>The ticket surface</div>
        </ContextMenu>,
      )
      await summon(getByText('The ticket surface'))
      const member = bridge.snapshot().members.find((each) => each.member === 'ContextMenu')
      expect(member?.state['open']).toBe(true)
      const { results } = await bridge.act([
        { id: member?.id, action: 'choose', value: 'Assign to me' },
      ])
      expect(results[0]).toMatchObject({ ok: true, changed: { open: { from: true, to: false } } })
      expect(assign).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenLastCalledWith(false)
      await vi.waitFor(() => expect(panel()).toBeNull())
    } finally {
      bridge.dispose()
    }
  })
})
