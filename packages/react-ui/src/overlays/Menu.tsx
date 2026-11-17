'use client'

import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import {
  chooseMenuEntry,
  memberAttr,
  menuChoices,
  useAgentMember,
  useDirection,
  type IconRole,
} from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/menu.module.css'
import { menuRows, type MenuRowParts, type MenuRowStyles } from './menu-rows'
import { usePhoneViewport } from './sheet'
import { SheetMenu, type SheetMenuStyles } from './sheet-menu'
import { TriggerAnchor } from './trigger-anchor'

/**
 * A command list behind a trigger (`design/components/menu.md`).
 *
 * A Menu holds commands. Moving between pages is NavItem's or Link's job,
 * because a menu of links is navigation hidden behind a button, where people
 * cannot find it.
 *
 * Entries are data, like Select's and RadioGroup's. Children would let each
 * call site invent a row, and every menu row in the product should be the same.
 *
 * Submenus allow **one** nested level, enforced by the type rather than by
 * convention. A menu three levels deep is a navigation tree behind a button,
 * and that content belongs on a page.
 */

export interface MenuItemEntry {
  kind?: 'item'
  label: string
  icon?: IconRole
  /** A displayed shortcut hint, never a binding; the app wires global shortcuts. */
  kbd?: string
  tone?: 'neutral' | 'danger'
  disabled?: boolean
  onSelect: () => void
}

/**
 * A toggle in the list (Radix `CheckboxItem`). It toggles without closing the
 * menu, because people adjust a filter list several items at a time, and
 * closing on each tick would make them reopen it each time. Escape and an
 * outside press still close it. The check uses the leading slot, so a checkbox
 * entry takes no icon.
 */
export interface MenuCheckboxEntry {
  kind: 'checkbox'
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export interface MenuSeparatorEntry {
  kind: 'separator'
}

export interface MenuLabelEntry {
  kind: 'label'
  label: string
}

/** What a submenu may hold, which excludes another submenu. */
export type MenuLeafEntry = MenuItemEntry | MenuCheckboxEntry | MenuSeparatorEntry | MenuLabelEntry

export interface MenuSubmenuEntry {
  kind: 'submenu'
  label: string
  icon?: IconRole
  disabled?: boolean
  items: MenuLeafEntry[]
}

export type MenuEntry = MenuLeafEntry | MenuSubmenuEntry

export type MenuAlign = 'start' | 'end'

export type MenuPresentation = 'auto' | 'popover'

export interface MenuProps {
  /** A governed control, usually a `Button` with `iconOnly icon="overflow"`. */
  trigger: ReactNode
  items: MenuEntry[]
  align?: MenuAlign
  /** Opens on mount, for galleries and tests; screens let the user open it. */
  defaultOpen?: boolean
  /**
   * The controlled pair; uncontrolled is the default. Use it to keep the menu
   * open across several checkbox toggles, or to close it on "apply".
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * `'auto'` uses a sheet below `30rem` (the sheet presentation,
   * `design/components/README.md`), the phone's standard pattern for "choose
   * from these". `'popover'` keeps the popper at every width, for the rare
   * pointer-first embed that needs precision. There is no always-`'sheet'`
   * value, because a bottom sheet does not suit a wide pointer surface, and
   * the closed union rejects it (`docs/layout.md`).
   */
  presentation?: MenuPresentation
}

/**
 * The rows come from the shared grammar in `menu-rows.tsx`, one grammar and
 * one renderer for Menu, ContextMenu and SplitButton; that file's header gives
 * the reasons. Menu passes the dropdown parts and its own stylesheet's
 * classes.
 */
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
 * The rows' classes, one by one, from this member's own stylesheet, because the
 * laws check a member's own stylesheet in source.
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

/**
 * The row classes for the sheet, from this member's own stylesheet, because
 * the laws check a member's own stylesheet in source.
 */
const SHEET_STYLES: SheetMenuStyles = {
  sheetList: styles.sheetList,
  item: styles.item,
  checkbox: styles.checkbox,
  check: styles.check,
  glyph: styles.glyph,
  label: styles.label,
  hint: styles.hint,
  separator: styles.separator,
  groupLabel: styles.groupLabel,
}

export function Menu({
  trigger,
  items,
  align = 'start',
  defaultOpen,
  open: openProp,
  onOpenChange,
  presentation = 'auto',
}: MenuProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  // Mirrored in both modes: the TriggerAnchor needs the open state to set
  // `aria-expanded`, so the uncontrolled copy exists even when the caller
  // controls the state.
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false)
  const open = openProp ?? uncontrolled

  const triggerId = useId()
  const menuId = useId()

  /**
   * The sheet presentation's width threshold, resolved once. Under `'auto'`
   * the panel becomes a sheet below `30rem`; `'popover'` keeps the popper at
   * every width. Submenus also move into the sheet, which flattens them, as
   * `design/components/menu.md` specifies: a submenu renders as its label
   * followed by its items inline, the label+group form. `sheet-menu.tsx` does
   * the flattening.
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  function handleOpenChange(next: boolean) {
    setUncontrolled(next)
    onOpenChange?.(next)
  }

  // An agent chooses an entry by its id without opening the menu, and the entry's own
  // `onSelect` (or a checkbox entry's `onCheckedChange`) runs, as for a person's choice. A
  // command closes a menu that is open, as a person's does. The trigger names the menu.
  const anchorRef = useRef<HTMLSpanElement>(null)
  useAgentMember({
    member: 'Menu',
    element: () => anchorRef.current?.querySelector('button, a[href], [tabindex]'),
    state: () => ({ open, entries: menuChoices(items) }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          if (chooseMenuEntry(items, id) && open) handleOpenChange(false)
        },
      },
      open: () => open || handleOpenChange(true),
      close: () => open && handleOpenChange(false),
    },
  })

  if (sheeting) {
    return (
      <>
        {/*
         * The trigger behaves the same at every width. The span wiring is
         * TriggerAnchor's, as on the popper lane: the ARIA goes on the governed
         * control inside, and focus returns there on close. This component
         * sets the attributes itself, because there is no Radix root to set
         * them. ArrowDown/ArrowUp open the menu, as with Radix's trigger.
         */}
        <TriggerAnchor
          ref={anchorRef}
          open={open}
          id={triggerId}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => handleOpenChange(!open)}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            handleOpenChange(true)
          }}
        >
          {trigger}
        </TriggerAnchor>

        {/* The identity attribute (`data-member`) follows the lane: the
            popper's `Content` carries it below, and the sheet's list carries it
            here. The shared panel around that list belongs to `sheet.tsx` and
            carries no member name. Without this, an exception written for
            `menu` would reach the panel above `30rem` and nothing below it. */}
        <SheetMenu
          open={open}
          member="Menu"
          id={menuId}
          labelledBy={triggerId}
          entries={items}
          onDismiss={() => handleOpenChange(false)}
          styles={SHEET_STYLES}
        />
      </>
    )
  }

  return (
    <MenuPrimitive.Root dir={dir} open={open} onOpenChange={handleOpenChange}>
      {/* Not the governed control directly, because it has no `ref` and no
          `aria-*`, so Radix would anchor to nothing. See `trigger-anchor.tsx`. */}
      <MenuPrimitive.Trigger asChild>
        <TriggerAnchor ref={anchorRef} open={open}>
          {trigger}
        </TriggerAnchor>
      </MenuPrimitive.Trigger>

      <MenuPrimitive.Portal>
        {/* `popper` with the anchored-surface offset constant, as in Select. A
            menu grows out of the control that opened it, so 2px is a seam, not
            a gap. */}
        <MenuPrimitive.Content
          className={styles.content}
          side="bottom"
          align={align}
          sideOffset={2}
          {...memberAttr('Menu')}
        >
          {menuRows(items, PARTS, ROW_STYLES)}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  )
}
