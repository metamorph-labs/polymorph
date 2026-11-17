'use client'

import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import {
  chooseMenubarEntry,
  memberAttr,
  menubarChoices,
  menubarEdge,
  menubarEntries,
  menubarNeighbour,
  menubarOpens,
  menubarStop,
  roveMenubar,
  useAgentMember,
  useDirection,
  type MenubarEnd,
} from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/menubar.module.css'
import { Button } from '../controls/Button'
import { Menu, type MenuEntry } from './Menu'
import { menuRows, type MenuRowParts, type MenuRowStyles } from './menu-rows'
import { usePhoneViewport } from './sheet'

/**
 * An application's command menus in one row (`design/components/menubar.md`).
 * Each menu has a title, as a desktop application's File, Edit and View do.
 *
 * A Menubar holds commands. A title never navigates: moving between pages is
 * AppShell's, SectionNav's or Tabs' job, with links in a `nav`. Most screens
 * need no Menubar. It suits an editor, a canvas or a document tool whose
 * commands are too many for one Menu.
 *
 * Each menu is Menu's: the same entries, drawn by the same rows with Menu's
 * recipe. The bar's keys, its one tab stop and the hand-off between
 * neighbouring menus are the engine's menubar model, which every framework's
 * Menubar runs.
 */

/** One title of the bar and the menu it opens. */
export interface MenubarMenu {
  /** The title, which also names its menu. Each title of a bar is its own. */
  label: string
  /** Menu's entries: commands, checkboxes, separators, group labels and one level of submenu. */
  entries: MenuEntry[]
  /** Passed over by the keys and opened by nothing, as Menu passes over a disabled command. */
  disabled?: boolean
}

export interface MenubarProps {
  /** Names the bar, and the one Button the bar becomes at a phone's width. */
  label: string
  menus: MenubarMenu[]
  /** The title whose menu is open on mount, for galleries and tests; screens let the user open it. */
  defaultOpen?: string
}

/** The dropdown parts the shared rows render with, as Menu passes them. */
const PARTS: MenuRowParts = {
  Item: MenuPrimitive.Item,
  CheckboxItem: MenuPrimitive.CheckboxItem,
  ItemIndicator: MenuPrimitive.ItemIndicator,
  Separator: MenuPrimitive.Separator,
  Label: MenuPrimitive.Label,
  Sub: MenuPrimitive.Sub,
  SubTrigger: MenuPrimitive.SubTrigger,
  SubContent: MenuPrimitive.SubContent,
  Portal: MenuPrimitive.Portal,
}

/**
 * The rows' classes, one by one, from this member's own stylesheet, each of
 * which composes Menu's class of the same name.
 */
const ROW_STYLES: MenuRowStyles = {
  item: styles.item,
  checkbox: styles.checkbox,
  check: styles.check,
  glyph: styles.glyph,
  label: styles.label,
  hint: styles.hint,
  separator: styles.separator,
  groupLabel: styles.groupLabel,
  content: styles.content,
}

export function Menubar({ label, menus, defaultOpen }: MenubarProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  const phone = usePhoneViewport()

  // The title whose menu is open. One menu is open at most, so the bar holds it, not each menu.
  const [open, setOpen] = useState<string | null>(defaultOpen ?? null)
  // The title focus was last on, which holds the bar's one tab stop.
  const [last, setLast] = useState<string | null>(defaultOpen ?? null)
  // Where focus goes in the next menu to open: the end a key asked for, or the panel itself for
  // a menu the pointer opened. `null` leaves it to Radix, which focuses a panel as it mounts.
  const pending = useRef<MenubarEnd | 'panel' | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const panels = useRef(new Map<string, HTMLDivElement>())

  /*
   * Radix focuses a panel when it mounts. A panel whose exit is still playing
   * when its title opens again does not mount again, and the panel focus was
   * in is leaving, so focus would fall to the page. After the frame in which
   * Radix has focused a panel that did mount, focus goes where the key or the
   * pointer asked, unless it is in the open panel already.
   */
  useEffect(() => {
    const asked = pending.current
    pending.current = null
    if (open === null || asked === null) return
    const frame = requestAnimationFrame(() => {
      const panel = panels.current.get(open)
      if (panel === undefined) return
      const active = document.activeElement
      const inside = active !== panel && panel.contains(active)
      if (asked === 'last') menubarEdge(panel, 'last')?.focus({ preventScroll: true })
      else if (inside) return
      else if (asked === 'first') menubarEdge(panel, 'first')?.focus({ preventScroll: true })
      else if (active !== panel) panel.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  // An agent chooses an entry by its id, which begins with its title, without opening its menu,
  // and the entry's own `onSelect` (or a checkbox entry's `onCheckedChange`) runs, as for a
  // person's choice. A command closes the menu that is open, as a person's does, and so does
  // `close`. The bar names the menubar by `label`.
  useAgentMember({
    member: 'Menubar',
    element: () => bar.current,
    state: () => ({ open: open !== null, entries: menubarChoices(menus) }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          if (chooseMenubarEntry(menus, id)) setOpen(null)
        },
      },
      close: () => setOpen(null),
    },
  })

  if (phone) {
    // A phone has no room for the row. The bar becomes one Menu behind one Button, with each
    // menu a group under its title, and Menu draws it as its sheet at this width.
    return (
      <div className={styles.collapsed} {...memberAttr('Menubar')}>
        <Menu
          trigger={<Button variant="ghost" tone="neutral" iconOnly icon="overflow" label={label} />}
          items={menubarEntries(menus)}
        />
      </div>
    )
  }

  const stop = menubarStop(menus, last)

  function show(title: string) {
    setOpen(title)
    setLast(title)
  }

  function onTitleKey(event: KeyboardEvent<HTMLButtonElement>, title: string) {
    if (roveMenubar(event)) return
    const at = menubarOpens(event.key)
    if (at === undefined) return
    pending.current = at
    // Radix opens on ArrowDown, Enter and Space, with focus on the first entry, and not on
    // ArrowUp.
    if (at === 'first') return
    event.preventDefault()
    show(title)
  }

  function onTitlePointer(event: PointerEvent<HTMLButtonElement>, menu: MenubarMenu) {
    // The desktop convention: while one menu is open, the title a mouse moves onto opens its
    // own. A touch has no hover, so a tap opens a title as a press does.
    if (event.pointerType !== 'mouse' || menu.disabled === true) return
    if (open === null || open === menu.label) return
    pending.current = 'panel'
    show(menu.label)
  }

  function onPanelKey(event: KeyboardEvent<HTMLDivElement>) {
    // A key the panel's own rows took, such as the one that opens or closes a submenu.
    if (event.defaultPrevented) return
    const to = menubarNeighbour(event, bar.current)
    const next = to === undefined ? undefined : menus[to]
    if (next === undefined) return
    event.preventDefault()
    pending.current = 'first'
    show(next.label)
  }

  return (
    <div
      ref={bar}
      role="menubar"
      aria-label={label}
      className={styles.bar}
      {...memberAttr('Menubar')}
    >
      {menus.map((menu) => (
        <MenuPrimitive.Root
          key={menu.label}
          dir={dir}
          // Not modal, so the other titles still take the pointer while a menu is open.
          modal={false}
          open={open === menu.label}
          onOpenChange={(next) => {
            if (next) show(menu.label)
            // A menu that closes because another opened leaves that one open.
            else setOpen((now) => (now === menu.label ? null : now))
          }}
        >
          <MenuPrimitive.Trigger
            className={styles.title}
            role="menuitem"
            data-menubar-part="title"
            disabled={menu.disabled}
            tabIndex={menu.label === stop ? 0 : -1}
            onFocus={() => setLast(menu.label)}
            onKeyDown={(event) => onTitleKey(event, menu.label)}
            onPointerEnter={(event) => onTitlePointer(event, menu)}
          >
            {menu.label}
          </MenuPrimitive.Trigger>

          <MenuPrimitive.Portal>
            {/* Menu's panel, under its title and at its start edge, at the anchored-surface
                offset. Radix names it by its title. */}
            <MenuPrimitive.Content
              ref={(node) => {
                if (node === null) panels.current.delete(menu.label)
                else panels.current.set(menu.label, node)
              }}
              className={styles.content}
              data-menubar-part="panel"
              side="bottom"
              align="start"
              sideOffset={2}
              {...memberAttr('Menubar')}
              onKeyDown={onPanelKey}
              onCloseAutoFocus={(event) => {
                // Focus returns to the title unless another title's menu is open and has it.
                // Radix asks after the render that closed this menu, so the bar shows it.
                const other = bar.current?.querySelector('[aria-expanded="true"]')
                if (other !== null && other !== undefined) event.preventDefault()
              }}
            >
              {menuRows(menu.entries, PARTS, ROW_STYLES)}
            </MenuPrimitive.Content>
          </MenuPrimitive.Portal>
        </MenuPrimitive.Root>
      ))}
    </div>
  )
}
