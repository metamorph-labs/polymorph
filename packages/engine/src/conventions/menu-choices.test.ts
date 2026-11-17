import { describe, expect, it, vi } from 'vitest'

import {
  chooseMenuEntry,
  chooseMenubarEntry,
  menuChoices,
  menubarChoices,
  type MenuChoiceEntry,
} from './menu-choices'

/**
 * What an agent chooses among in a menu (`design/components/menu.md`, Agent):
 * the same ids in every renderer, and a choice that runs as a person's does.
 */

const ENTRIES = (spies: { assign: () => void; remove: () => void; watch: (on: boolean) => void }) =>
  [
    { kind: 'label', label: 'This ticket' },
    { label: 'Assign to me', onSelect: spies.assign },
    { kind: 'separator' },
    { kind: 'checkbox', label: 'Watch', checked: false, onCheckedChange: spies.watch },
    {
      kind: 'submenu',
      label: 'Move to',
      items: [
        { kind: 'label', label: 'Queues' },
        { label: 'Billing', onSelect: () => {} },
      ],
    },
    {
      kind: 'submenu',
      label: 'Snooze until',
      disabled: true,
      items: [{ label: 'Tomorrow', onSelect: () => {} }],
    },
    { label: 'Merge into…', disabled: true, onSelect: () => {} },
    { label: 'Delete', tone: 'danger', onSelect: spies.remove },
    { label: 'Delete', tone: 'danger', onSelect: () => {} },
  ] satisfies MenuChoiceEntry[]

const spies = () => ({ assign: vi.fn(), remove: vi.fn(), watch: vi.fn() })

describe('menuChoices', () => {
  it('lists each command and checkbox entry, a submenu’s by its path, with its marks', () => {
    expect(menuChoices(ENTRIES(spies()))).toEqual([
      { id: 'Assign to me', label: 'Assign to me' },
      { id: 'Watch', label: 'Watch' },
      { id: 'Move to / Billing', label: 'Billing' },
      { id: 'Snooze until / Tomorrow', label: 'Tomorrow', disabled: true },
      { id: 'Merge into…', label: 'Merge into…', disabled: true },
      { id: 'Delete', label: 'Delete', destructive: true },
      { id: 'Delete (2)', label: 'Delete', destructive: true },
    ])
  })
})

describe('chooseMenuEntry', () => {
  it('runs a command and reports it, and toggles a checkbox entry and does not', () => {
    const calls = spies()
    const entries = ENTRIES(calls)
    expect(chooseMenuEntry(entries, 'Assign to me')).toBe(true)
    expect(calls.assign).toHaveBeenCalledOnce()
    expect(chooseMenuEntry(entries, 'Watch')).toBe(false)
    expect(calls.watch).toHaveBeenCalledWith(true)
    expect(chooseMenuEntry(entries, 'Delete')).toBe(true)
    expect(calls.remove).toHaveBeenCalledOnce()
  })

  it('throws for an id that names no entry', () => {
    expect(() => chooseMenuEntry(ENTRIES(spies()), 'This ticket')).toThrow(
      'No menu entry has the id "This ticket".',
    )
  })
})

/** A Menubar's entries (`design/components/menubar.md`, Agent): each id begins with its title. */
describe('menubarChoices and chooseMenubarEntry', () => {
  const menus = (calls: ReturnType<typeof spies>) => [
    { label: 'Ticket', entries: ENTRIES(calls) },
    { label: 'Insert', disabled: true, entries: [{ label: 'Table', onSelect: calls.assign }] },
  ]

  it('lists every menu’s entries under its title, and disables a disabled menu’s', () => {
    expect(menubarChoices(menus(spies()))).toEqual([
      { id: 'Ticket / Assign to me', label: 'Assign to me' },
      { id: 'Ticket / Watch', label: 'Watch' },
      { id: 'Ticket / Move to / Billing', label: 'Billing' },
      { id: 'Ticket / Snooze until / Tomorrow', label: 'Tomorrow', disabled: true },
      { id: 'Ticket / Merge into…', label: 'Merge into…', disabled: true },
      { id: 'Ticket / Delete', label: 'Delete', destructive: true },
      { id: 'Ticket / Delete (2)', label: 'Delete', destructive: true },
      { id: 'Insert / Table', label: 'Table', disabled: true },
    ])
  })

  it('runs the entry an id names, as chooseMenuEntry does', () => {
    const calls = spies()
    expect(chooseMenubarEntry(menus(calls), 'Ticket / Assign to me')).toBe(true)
    expect(calls.assign).toHaveBeenCalledOnce()
    expect(chooseMenubarEntry(menus(calls), 'Ticket / Watch')).toBe(false)
    expect(calls.watch).toHaveBeenCalledWith(true)
    expect(() => chooseMenubarEntry(menus(calls), 'Assign to me')).toThrow(
      'No menu entry has the id "Assign to me".',
    )
  })
})
