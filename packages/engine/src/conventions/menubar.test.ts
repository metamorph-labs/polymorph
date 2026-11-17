import { afterEach, describe, expect, it } from 'vitest'

import {
  menubarEdge,
  menubarEntries,
  menubarHandOff,
  menubarNeighbour,
  menubarOpens,
  menubarStep,
  menubarStop,
  roveMenubar,
  type MenubarKeyEvent,
} from './menubar'

/**
 * Menubar's keyboard model, which every framework's Menubar runs
 * (`design/components/menubar.md`). Insert is disabled, between two enabled
 * titles.
 */
const TITLES = [
  { label: 'File' },
  { label: 'Edit' },
  { label: 'Insert', disabled: true },
  { label: 'Format' },
  { label: 'Help' },
]

afterEach(() => {
  document.documentElement.removeAttribute('dir')
  document.body.replaceChildren()
})

describe('menubarStep — the title a key moves to', () => {
  it('moves along the row with the arrows, passing over a disabled title', () => {
    expect(menubarStep('ArrowRight', 0, TITLES, 'ltr')).toBe(1)
    expect(menubarStep('ArrowRight', 1, TITLES, 'ltr')).toBe(3)
    expect(menubarStep('ArrowLeft', 3, TITLES, 'ltr')).toBe(1)
  })

  it('stops at either end and stays on the title it started from', () => {
    expect(menubarStep('ArrowRight', 4, TITLES, 'ltr')).toBe(4)
    expect(menubarStep('ArrowLeft', 0, TITLES, 'ltr')).toBe(0)
  })

  it('mirrors the arrows in a right-to-left document', () => {
    expect(menubarStep('ArrowLeft', 0, TITLES, 'rtl')).toBe(1)
    expect(menubarStep('ArrowRight', 1, TITLES, 'rtl')).toBe(0)
  })

  it('goes to the first and the last enabled title with Home and End', () => {
    const ends = [{ label: 'A', disabled: true }, ...TITLES, { label: 'Z', disabled: true }]
    expect(menubarStep('Home', 3, ends, 'ltr')).toBe(1)
    expect(menubarStep('End', 1, ends, 'ltr')).toBe(5)
  })

  it('moves to the next title that starts with a typed character, wrapping', () => {
    expect(menubarStep('f', 0, TITLES, 'ltr')).toBe(3)
    expect(menubarStep('F', 3, TITLES, 'ltr')).toBe(0)
    expect(menubarStep('h', 0, TITLES, 'ltr')).toBe(4)
  })

  it('passes over a disabled title when typing, and takes no key that matches nothing', () => {
    expect(menubarStep('i', 0, TITLES, 'ltr')).toBeUndefined()
    expect(menubarStep('q', 0, TITLES, 'ltr')).toBeUndefined()
  })

  it('takes no key the bar does not move with', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Tab', 'Escape', 'Shift']) {
      expect(menubarStep(key, 0, TITLES, 'ltr'), key).toBeUndefined()
    }
  })
})

describe('menubarStop — the one tab stop', () => {
  it('is the first enabled title until focus has been in the bar', () => {
    expect(menubarStop(TITLES, null)).toBe('File')
    expect(menubarStop([{ label: 'File', disabled: true }, ...TITLES.slice(1)], null)).toBe('Edit')
  })

  it('is the title focus was last on while it stays enabled', () => {
    expect(menubarStop(TITLES, 'Format')).toBe('Format')
    expect(menubarStop(TITLES, 'Insert')).toBe('File')
    expect(menubarStop(TITLES, 'Gone')).toBe('File')
  })

  it('is nothing when every title is disabled', () => {
    expect(menubarStop([{ label: 'File', disabled: true }], null)).toBeNull()
  })
})

describe('menubarOpens — the keys that open a menu, and where focus lands', () => {
  it('opens on the first entry with ArrowDown, Enter and Space, and on the last with ArrowUp', () => {
    expect(menubarOpens('ArrowDown')).toBe('first')
    expect(menubarOpens('Enter')).toBe('first')
    expect(menubarOpens(' ')).toBe('first')
    expect(menubarOpens('ArrowUp')).toBe('last')
    expect(menubarOpens('ArrowRight')).toBeUndefined()
  })
})

describe('menubarHandOff — the neighbour an open menu hands over to', () => {
  it('opens the next or the previous enabled title from an entry', () => {
    expect(menubarHandOff('ArrowRight', 1, TITLES, 'ltr', 'entry')).toBe(3)
    expect(menubarHandOff('ArrowLeft', 3, TITLES, 'ltr', 'entry')).toBe(1)
    expect(menubarHandOff('ArrowLeft', 1, TITLES, 'rtl', 'entry')).toBe(3)
  })

  it('stays in the menu at either end of the row', () => {
    expect(menubarHandOff('ArrowLeft', 0, TITLES, 'ltr', 'entry')).toBeUndefined()
    expect(menubarHandOff('ArrowRight', 4, TITLES, 'ltr', 'entry')).toBeUndefined()
  })

  it('leaves the key that enters a submenu, and the key that closes one, to the menu', () => {
    expect(menubarHandOff('ArrowRight', 0, TITLES, 'ltr', 'submenu-row')).toBeUndefined()
    expect(menubarHandOff('ArrowLeft', 1, TITLES, 'ltr', 'submenu')).toBeUndefined()
    expect(menubarHandOff('ArrowLeft', 1, TITLES, 'rtl', 'submenu-row')).toBeUndefined()
    // The other key of each place hands over.
    expect(menubarHandOff('ArrowLeft', 1, TITLES, 'ltr', 'submenu-row')).toBe(0)
    expect(menubarHandOff('ArrowRight', 0, TITLES, 'ltr', 'submenu')).toBe(1)
  })

  it('takes no key that does not point along the row', () => {
    expect(menubarHandOff('ArrowDown', 0, TITLES, 'ltr', 'entry')).toBeUndefined()
  })
})

describe('menubarEntries — the one Menu of the phone form', () => {
  it('draws each menu as a group under its title, with a separator between groups', () => {
    const entries = menubarEntries([
      { label: 'File', entries: [{ label: 'New' }] },
      { label: 'Insert', disabled: true, entries: [{ label: 'Table' }] },
      { label: 'Help', entries: [{ label: 'About' }] },
    ])
    expect(entries).toEqual([
      { kind: 'label', label: 'File' },
      { label: 'New' },
      { kind: 'separator' },
      { kind: 'label', label: 'Insert' },
      { kind: 'separator' },
      { kind: 'label', label: 'Help' },
      { label: 'About' },
    ])
  })
})

/* The document ------------------------------------------------------------ */

/** A bar of the titles, each a button with the title hook, Edit's menu open. */
function bar(): { root: HTMLElement; titles: HTMLButtonElement[] } {
  const root = document.createElement('div')
  root.setAttribute('role', 'menubar')
  const titles = TITLES.map((title) => {
    const button = document.createElement('button')
    button.setAttribute('data-menubar-part', 'title')
    button.textContent = title.label
    button.disabled = title.disabled === true
    button.setAttribute('aria-expanded', String(title.label === 'Edit'))
    root.append(button)
    return button
  })
  document.body.append(root)
  return { root, titles }
}

/** A menu panel with two rows, the last a submenu row, and a submenu panel inside it. */
function panel(): { list: HTMLElement; rows: HTMLElement[]; inner: HTMLElement } {
  const list = document.createElement('div')
  list.setAttribute('role', 'menu')
  const rows = ['Undo', 'Disabled', 'Find'].map((label) => {
    const row = document.createElement('div')
    row.setAttribute('role', 'menuitem')
    row.tabIndex = -1
    row.textContent = label
    list.append(row)
    return row
  })
  rows[1]?.setAttribute('aria-disabled', 'true')
  rows[2]?.setAttribute('aria-haspopup', 'menu')
  const submenu = document.createElement('div')
  submenu.setAttribute('role', 'menu')
  const inner = document.createElement('div')
  inner.setAttribute('role', 'menuitem')
  inner.tabIndex = -1
  submenu.append(inner)
  list.append(submenu)
  document.body.append(list)
  return { list, rows, inner }
}

const keyOn = (
  key: string,
  target: EventTarget,
  currentTarget: EventTarget = target,
): MenubarKeyEvent & { prevented: boolean } => {
  const event = {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target,
    currentTarget,
    prevented: false,
    preventDefault() {
      event.prevented = true
    },
  }
  return event
}

describe('roveMenubar — a key on a title', () => {
  it('focuses the title the key moves to and takes the key', () => {
    const { titles } = bar()
    titles[1]?.focus()
    const event = keyOn('ArrowRight', titles[1] as HTMLElement)
    expect(roveMenubar(event)).toBe(true)
    expect(event.prevented).toBe(true)
    expect(document.activeElement).toBe(titles[3])
  })

  it('follows the document direction', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    const { titles } = bar()
    titles[0]?.focus()
    expect(roveMenubar(keyOn('ArrowLeft', titles[0] as HTMLElement))).toBe(true)
    expect(document.activeElement).toBe(titles[1])
  })

  it('leaves a key that opens a menu, and a key with a modifier, to the browser', () => {
    const { titles } = bar()
    const down = keyOn('ArrowDown', titles[0] as HTMLElement)
    expect(roveMenubar(down)).toBe(false)
    expect(down.prevented).toBe(false)
    expect(roveMenubar({ ...keyOn('End', titles[0] as HTMLElement), metaKey: true })).toBe(false)
  })
})

describe('menubarNeighbour — a key in an open menu', () => {
  it('names the neighbour of the title whose menu is open', () => {
    const { root } = bar()
    const { list, rows } = panel()
    expect(menubarNeighbour(keyOn('ArrowRight', rows[0] as HTMLElement, list), root)).toBe(3)
    expect(menubarNeighbour(keyOn('ArrowLeft', rows[0] as HTMLElement, list), root)).toBe(0)
  })

  it('reads a submenu row and a submenu from the focused element', () => {
    const { root } = bar()
    const { list, rows, inner } = panel()
    expect(menubarNeighbour(keyOn('ArrowRight', rows[2] as HTMLElement, list), root)).toBe(
      undefined,
    )
    expect(menubarNeighbour(keyOn('ArrowLeft', inner, list), root)).toBeUndefined()
    expect(menubarNeighbour(keyOn('ArrowRight', inner, list), root)).toBe(3)
  })

  it('reads a submenu that is not inside the panel when it is given the panel', () => {
    const { root } = bar()
    const { list, inner } = panel()
    const elsewhere = document.createElement('div')
    elsewhere.setAttribute('role', 'menu')
    elsewhere.append(inner)
    document.body.append(elsewhere)
    expect(menubarNeighbour(keyOn('ArrowLeft', inner, elsewhere), root, list)).toBeUndefined()
    expect(menubarNeighbour(keyOn('ArrowRight', inner, elsewhere), root, list)).toBe(3)
  })
})

describe('menubarEdge — the row a key opens a menu at', () => {
  it('is the first or the last enabled row of the panel itself', () => {
    const { list, rows } = panel()
    expect(menubarEdge(list, 'first')).toBe(rows[0])
    expect(menubarEdge(list, 'last')).toBe(rows[2])
    expect(menubarEdge(null, 'first')).toBeUndefined()
  })
})
