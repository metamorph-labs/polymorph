import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The law for Menubar's keyboard model, its one tab stop, the hand-off between
 * neighbouring menus, the pointer rule and the phone form
 * (`design/components/menubar.md`), which every web shell's Menubar test calls
 * with a mount of its own. A contract statement opens one menu from one title
 * and reads one part (`docs/conformance.md`); the hand-off moves between two
 * menus, a key's effect depends on the document's direction, and the phone
 * form depends on the viewport, so the law reads them itself.
 *
 * The law focuses a title from a script and reads `document.activeElement`,
 * because Tab does not stop on every element in WebKit. It waits for each
 * reading, because a menu substrate moves focus into a panel a frame after it
 * opens.
 */

/** A command, as the law passes it, in the shape of Menu's `MenuItemEntry`. */
export interface MenubarLawCommand {
  label: string
  disabled?: boolean
  onSelect: () => void
}

/** An entry, in the shape of Menu's `MenuEntry`. */
export type MenubarLawEntry =
  | MenubarLawCommand
  | {
      kind: 'checkbox'
      label: string
      checked: boolean
      onCheckedChange: (checked: boolean) => void
    }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: MenubarLawCommand[] }

/** A title and its menu, in the shape of the member's `MenubarMenu`. */
export interface MenubarLawMenu {
  label: string
  disabled?: boolean
  entries: MenubarLawEntry[]
}

export interface MenubarLawMount {
  readonly menus: MenubarLawMenu[]
}

export interface MenubarLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts a Menubar labelled `Document` with the menus given. */
  mount(options: MenubarLawMount): Promise<unknown>
}

/** A bar of five titles. Insert is disabled, between two titles that are not. */
function document_() {
  const command = (label: string, disabled?: boolean): MenubarLawCommand => ({
    label,
    disabled,
    onSelect: vi.fn<() => void>(),
  })
  const save = command('Save')
  const undo = command('Undo')
  const ruler = vi.fn<(checked: boolean) => void>()
  const menus: MenubarLawMenu[] = [
    {
      label: 'File',
      entries: [
        command('New'),
        {
          kind: 'submenu',
          label: 'Open recent',
          items: [command('Quarterly plan'), command('Launch checklist')],
        },
        { kind: 'separator' },
        save,
      ],
    },
    {
      label: 'Edit',
      entries: [undo, command('Redo', true), command('Copy'), command('Paste')],
    },
    { label: 'Insert', disabled: true, entries: [command('Table')] },
    {
      label: 'View',
      entries: [
        { kind: 'checkbox', label: 'Ruler', checked: true, onCheckedChange: ruler },
        command('Zoom in'),
      ],
    },
    { label: 'Help', entries: [command('About')] },
  ]
  return { menus, save: save.onSelect, undo: undo.onSelect, ruler }
}

const bar = () => document.querySelector<HTMLElement>('[role="menubar"]') as HTMLElement

const titles = () => [...bar().querySelectorAll<HTMLElement>('[data-menubar-part="title"]')]

const title = (label: string) =>
  titles().find((element) => element.textContent === label) as HTMLElement

/** The menus that are open, by the name each takes from its title. */
const opened = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[data-member="menubar"][role="menu"][data-state="open"]',
    ),
  ].map((panel) => harness.nameOf(panel))

const panel = () =>
  document.querySelector<HTMLElement>(
    '[data-member="menubar"][role="menu"][data-state="open"]',
  ) as HTMLElement

/**
 * The current item, as the text it shows: a title's or a row's label. As the
 * conformance runner reads it, the current item is the focused element, or the
 * element its `aria-activedescendant` names, because a Zag menu that has just
 * opened focuses its list and names the highlighted row.
 */
function focused(): string | null {
  const active = document.activeElement as HTMLElement | null
  const named = active?.getAttribute('aria-activedescendant')
  const current = named ? (document.getElementById(named) ?? active) : active
  return current?.textContent ?? null
}

/** The labels of the titles with `tabindex="0"`. */
const stops = () =>
  titles()
    .filter((element) => element.getAttribute('tabindex') === '0')
    .map((element) => element.textContent)

const key = async (name: string) => {
  await userEvent.keyboard(name === ' ' ? ' ' : `{${name}}`)
}

/** A moment in which a member that was going to open a menu has opened it. */
const beat = () => new Promise<void>((resolve) => setTimeout(resolve, 150))

/** Two frames, in which a member that moves focus after a menu opens has moved it. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/**
 * Waits until the current item is the one labelled, and then for the member
 * to settle, because a menu that names its row first gives the row real focus
 * a frame later, and a key pressed in between reaches the list.
 */
async function on(label: string) {
  await vi.waitFor(() => expect(focused()).toBe(label))
  await frames()
}

export function menubarLaw({ shell, mount }: MenubarLaw): void {
  describe(`${shell} Menubar — the row's keys, the hand-off, the pointer and the phone form`, () => {
    beforeAll(installTestTheme)

    afterEach(async () => {
      document.documentElement.removeAttribute('dir')
      await page.viewport(1280, 800)
    })

    async function mounted() {
      const held = document_()
      await mount({ menus: held.menus })
      await vi.waitFor(() => expect(stops()).toHaveLength(1))
      return held
    }

    /** Focuses a title from a script, as a press or Tab would leave it. */
    async function focus(label: string) {
      title(label).focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(title(label)))
    }

    /** Opens a title's menu from the keyboard and waits for focus on the row it opens on. */
    async function openWith(label: string, opener: string, row: string) {
      await focus(label)
      await key(opener)
      await vi.waitFor(() => expect(opened()).toEqual([label]))
      await on(row)
    }

    /* -------------------------------------------------------------------- */
    /* Roles, names and the tab stop                                         */
    /* -------------------------------------------------------------------- */

    it('is a menubar named by its label, whose titles each open a menu named by the title', async () => {
      await mounted()
      expect(harness.roleOf(bar())).toBe('menubar')
      expect(harness.nameOf(bar())).toBe('Document')
      for (const element of titles()) {
        expect(harness.roleOf(element)).toBe('menuitem')
        expect(element.getAttribute('aria-haspopup')).toBe('menu')
        expect(element.getAttribute('aria-expanded')).toBe('false')
      }
      await openWith('Edit', 'ArrowDown', 'Undo')
      expect(harness.roleOf(panel())).toBe('menu')
      expect(title('Edit').getAttribute('aria-expanded')).toBe('true')
    })

    it('has one tab stop, on the first title, which moves with focus and is never on a disabled title', async () => {
      await mounted()
      expect(stops()).toEqual(['File'])
      const insert = title('Insert')
      expect(
        insert.hasAttribute('disabled') || insert.getAttribute('aria-disabled') === 'true',
      ).toBe(true)
      await focus('View')
      await vi.waitFor(() => expect(stops()).toEqual(['View']))
    })

    /* -------------------------------------------------------------------- */
    /* Along the row                                                         */
    /* -------------------------------------------------------------------- */

    it('moves along the row with ArrowRight and ArrowLeft, passing over a disabled title and stopping at each end', async () => {
      await mounted()
      await focus('File')
      for (const label of ['Edit', 'View', 'Help', 'Help']) {
        await key('ArrowRight')
        await vi.waitFor(() => expect(focused()).toBe(label))
      }
      for (const label of ['View', 'Edit', 'File', 'File']) {
        await key('ArrowLeft')
        await vi.waitFor(() => expect(focused()).toBe(label))
      }
      expect(opened()).toEqual([])
    })

    it('goes to the first and the last title with Home and End, and to a title by its first letter', async () => {
      await mounted()
      await focus('Edit')
      await key('End')
      await on('Help')
      await key('Home')
      await on('File')
      await userEvent.keyboard('v')
      await on('View')
      await userEvent.keyboard('h')
      await on('Help')
      // Insert is disabled, so its letter moves nowhere.
      await userEvent.keyboard('i')
      await beat()
      expect(focused()).toBe('Help')
    })

    it('starts at the right edge and mirrors the arrows in a right-to-left document', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      await mounted()
      const file = title('File').getBoundingClientRect()
      const edit = title('Edit').getBoundingClientRect()
      expect(file.left).toBeGreaterThan(edit.left)

      await focus('File')
      await key('ArrowLeft')
      await on('Edit')
      await key('ArrowRight')
      await on('File')

      // An open menu hands over the same way.
      await openWith('File', 'ArrowDown', 'New')
      await key('ArrowLeft')
      await vi.waitFor(() => expect(opened()).toEqual(['Edit']))
      await on('Undo')
    })

    /* -------------------------------------------------------------------- */
    /* Opening and closing                                                   */
    /* -------------------------------------------------------------------- */

    for (const opener of ['ArrowDown', 'Enter', ' ']) {
      it(`opens a menu on its first entry with ${opener === ' ' ? 'Space' : opener}, and Escape returns focus to its title`, async () => {
        await mounted()
        await openWith('Edit', opener, 'Undo')
        await key('Escape')
        await vi.waitFor(() => expect(opened()).toEqual([]))
        await vi.waitFor(() => expect(document.activeElement).toBe(title('Edit')))
        expect(stops()).toEqual(['Edit'])
      })
    }

    it('opens a menu on its last enabled entry with ArrowUp', async () => {
      await mounted()
      await openWith('Edit', 'ArrowUp', 'Paste')
    })

    it('runs a chosen command once, closes its menu and returns focus to its title', async () => {
      const { undo } = await mounted()
      await openWith('Edit', 'ArrowDown', 'Undo')
      await key('Enter')
      await vi.waitFor(() => expect(opened()).toEqual([]))
      expect(undo).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(document.activeElement).toBe(title('Edit')))
    })

    it('runs a command chosen with the pointer once, and closes its menu', async () => {
      const { save } = await mounted()
      await userEvent.click(title('File'))
      await vi.waitFor(() => expect(opened()).toEqual(['File']))
      const row = [...panel().querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (element) => element.textContent === 'Save',
      ) as HTMLElement
      await userEvent.click(row)
      await vi.waitFor(() => expect(opened()).toEqual([]))
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('toggles a checkbox entry and leaves its menu open', async () => {
      const { ruler } = await mounted()
      await openWith('View', 'ArrowDown', 'Ruler')
      const row = [...panel().querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
        (element) => element.textContent === 'Ruler',
      ) as HTMLElement
      expect(harness.roleOf(row)).toBe('menuitemcheckbox')
      expect(row.getAttribute('aria-checked')).toBe('true')
      await key('Enter')
      await vi.waitFor(() => expect(ruler).toHaveBeenCalledWith(false))
      expect(ruler).toHaveBeenCalledTimes(1)
      await beat()
      expect(opened()).toEqual(['View'])
    })

    it('opens no menu from a disabled title', async () => {
      await mounted()
      await userEvent.click(title('Insert'), { force: true })
      await beat()
      expect(opened()).toEqual([])
    })

    /* -------------------------------------------------------------------- */
    /* The hand-off                                                          */
    /* -------------------------------------------------------------------- */

    it('hands the bar to the next and the previous menu with ArrowRight and ArrowLeft, and stops at each end', async () => {
      await mounted()
      await openWith('Edit', 'ArrowDown', 'Undo')

      await key('ArrowRight')
      await vi.waitFor(() => expect(opened()).toEqual(['View']))
      await on('Ruler')
      expect(title('Edit').getAttribute('aria-expanded')).toBe('false')
      expect(title('View').getAttribute('aria-expanded')).toBe('true')

      await key('ArrowLeft')
      await vi.waitFor(() => expect(opened()).toEqual(['Edit']))
      await on('Undo')

      await key('ArrowLeft')
      await vi.waitFor(() => expect(opened()).toEqual(['File']))
      await on('New')

      // File is the first title, so the menu stays open where it is.
      await key('ArrowLeft')
      await beat()
      expect(opened()).toEqual(['File'])
      expect(focused()).toBe('New')
    })

    it('enters a submenu with ArrowRight and closes it with ArrowLeft before it hands the bar over', async () => {
      await mounted()
      await openWith('File', 'ArrowDown', 'New')
      await key('ArrowDown')
      await on('Open recent')

      await key('ArrowRight')
      await on('Quarterly plan')
      expect(opened()).toContain('File')

      await key('ArrowLeft')
      await on('Open recent')
      expect(opened()).toEqual(['File'])

      // From a command inside the submenu, ArrowRight hands the bar to the next menu.
      await key('ArrowRight')
      await on('Quarterly plan')
      await key('ArrowRight')
      await vi.waitFor(() => expect(opened()).toEqual(['Edit']))
      await on('Undo')
    })

    /* -------------------------------------------------------------------- */
    /* The pointer                                                           */
    /* -------------------------------------------------------------------- */

    it('opens the menu of a title the pointer moves onto only while a menu is open', async () => {
      await mounted()
      await userEvent.hover(title('Edit'))
      await beat()
      expect(opened()).toEqual([])

      await userEvent.click(title('File'))
      await vi.waitFor(() => expect(opened()).toEqual(['File']))
      await userEvent.hover(title('Edit'))
      await vi.waitFor(() => expect(opened()).toEqual(['Edit']))
      await userEvent.hover(title('Insert'))
      await beat()
      expect(opened()).toEqual(['Edit'])
      await userEvent.hover(title('Help'))
      await vi.waitFor(() => expect(opened()).toEqual(['Help']))
    })

    /* -------------------------------------------------------------------- */
    /* A phone's width                                                       */
    /* -------------------------------------------------------------------- */

    it("becomes one Menu behind one Button at a phone's width, each menu a group, with no sideways scroll", async () => {
      await page.viewport(375, 812)
      const { menus, save } = document_()
      await mount({ menus })

      const button = await vi.waitFor(() => {
        const found = [...document.querySelectorAll<HTMLElement>('button')].find(
          (element) => harness.nameOf(element) === 'Document',
        )
        expect(found).toBeDefined()
        return found as HTMLElement
      })
      expect(document.querySelector('[role="menubar"]')).toBeNull()
      expect(button.getAttribute('aria-haspopup')).toBe('menu')
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

      await userEvent.click(button)
      const list = await vi.waitFor(() => {
        const found = document.querySelector<HTMLElement>('[data-member="menu"][role="menu"]')
        expect(found).not.toBeNull()
        return found as HTMLElement
      })
      // Each title is its group's label, and a disabled menu is its label alone.
      for (const label of ['File', 'Edit', 'Insert', 'View', 'Help']) {
        expect(list.textContent).toContain(label)
      }
      const rows = [...list.querySelectorAll('[role^="menuitem"]')].map((row) => row.textContent)
      expect(rows).toContain('Save')
      expect(rows).toContain('Undo')
      expect(rows).not.toContain('Table')

      const row = [...list.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (element) => element.textContent === 'Save',
      ) as HTMLElement
      await userEvent.click(row)
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    })
  })
}
