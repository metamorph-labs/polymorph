'use client'

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  chooseMenuEntry,
  memberAttr,
  menuChoices,
  useAgentMember,
  useDirection,
} from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/context-menu.module.css'
import type { MenuEntry, MenuPresentation } from './Menu'
import { menuRows, type MenuRowParts, type MenuRowStyles } from './menu-rows'
import { usePhoneViewport } from './sheet'
import { SheetMenu, type SheetMenuStyles } from './sheet-menu'

/**
 * Menu's command list on right-click or long-press, at the press point
 * (`design/components/context-menu.md`). It anchors to the point of the press
 * instead of a trigger control. The substrate wraps the same
 * `@radix-ui/react-menu` core that the installed dropdown-menu already uses, so
 * the panel, items and keyboard handling are the ones Menu ships.
 *
 * It does not replace Menu. It offers the same commands faster, and it is
 * **never the only path**. A context menu is invisible until opened, touch
 * reaches it only by long-press, and on a non-interactive surface a keyboard
 * cannot open it at all. Every command here must also be on a visible control.
 * A command that only a right-click can reach is a defect.
 *
 * There is no controlled `open`, on purpose. A context menu opens at a point,
 * and the point exists only in the gesture. With an `open` prop the menu would
 * have no position (the substrate's dev warning names the top-left corner it
 * would fall back to). An app that opens a command list from state uses Menu.
 *
 * **The sheet, below `30rem` (the sheet presentation, with Menu's
 * `presentation` passed through):** the gesture still opens the menu.
 * Long-press is already the touch gesture, and its timing stays the
 * substrate's, not a vocabulary number. The panel becomes the sheet, so the
 * press point no longer affects geometry. On the sheet lane the Radix root is
 * held closed (its public controlled `open`, pinned to `false`) while its
 * trigger still fires `onOpenChange(true)` for each gesture. Every press is a
 * new `false → true` edge, so the pin never goes stale. That edge opens the
 * shared sheet instead, with the entries rendered through react-aria
 * (`sheet-menu.tsx`). At every width, focus returns to where it was when the
 * press began.
 */

export interface ContextMenuProps {
  /**
   * Entries in Menu's grammar (`menu.md`), including submenus; this member
   * does not redefine it.
   */
  entries: MenuEntry[]
  /**
   * The surface: one element, which may be non-interactive, because the
   * trigger is the area, not a control. The member merges into the child
   * instead of wrapping it in a box. A wrapper element around a `Table.Row`
   * would break the table, and the panel anchors to the press point, so the
   * trigger span's rect is never needed.
   */
  children: ReactNode
  /** Notifies apps that pause row hover states or refresh entries on open. */
  onOpenChange?: (open: boolean) => void
  /**
   * Menu's `presentation`, passed through (`menu.md`; the sheet presentation):
   * `'auto'` uses a sheet below `30rem`, and `'popover'` keeps the press-point
   * popper at every width. Like Menu's, the union is closed and has no
   * always-`'sheet'` value.
   */
  presentation?: MenuPresentation
}

/** The rows' primitive parts: the context-menu versions of Menu's parts. */
const PARTS: MenuRowParts = {
  Item: ContextMenuPrimitive.Item,
  CheckboxItem: ContextMenuPrimitive.CheckboxItem,
  ItemIndicator: ContextMenuPrimitive.ItemIndicator,
  Separator: ContextMenuPrimitive.Separator,
  Label: ContextMenuPrimitive.Label,
  Sub: ContextMenuPrimitive.Sub,
  SubTrigger: ContextMenuPrimitive.SubTrigger,
  SubContent: ContextMenuPrimitive.SubContent,
  Portal: ContextMenuPrimitive.Portal,
}

/** The rows' classes, one by one, from this member's own stylesheet. */
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
 * The same classes for the react-aria sheet, from this member's stylesheet,
 * because the laws check a member's own stylesheet in source.
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

export function ContextMenu({
  entries,
  children,
  onOpenChange,
  presentation = 'auto',
}: ContextMenuProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  /**
   * The sheet presentation's width threshold, resolved once. Submenus also
   * move into the sheet, which flattens them (as `design/components/menu.md`
   * specifies; `sheet-menu.tsx`).
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  /**
   * Always controlled on both lanes, so the root never switches modes when the
   * viewport changes. The popper lane mirrors Radix's requests. The sheet lane
   * pins `false` and sends the open edge to the sheet.
   */
  const [radixOpen, setRadixOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  /** Where focus was when the press began; the sheet lane restores it there. */
  const restoreTo = useRef<HTMLElement | null>(null)

  function handleRootOpenChange(next: boolean) {
    if (sheeting) {
      if (!next || sheetOpen) return
      restoreTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setSheetOpen(true)
      onOpenChange?.(true)
      return
    }
    setRadixOpen(next)
    onOpenChange?.(next)
  }

  function dismissSheet() {
    setSheetOpen(false)
    onOpenChange?.(false)
  }

  /**
   * Returns focus to where it was, because the panel has no trigger control.
   * It is an effect on purpose, as in TriggerAnchor. A synchronous `focus()`
   * inside the dismiss handler would run while the sheet's focus containment
   * is still active, and focus would be pulled back into the closing panel.
   */
  useEffect(() => {
    if (sheetOpen || restoreTo.current === null) return
    restoreTo.current.focus()
    restoreTo.current = null
  }, [sheetOpen])

  // An agent chooses an entry by its id without opening the menu, which opens only at a press
  // point, and the entry's own `onSelect` (or a checkbox entry's `onCheckedChange`) runs, as for
  // a person's choice. A command closes a menu that is open, as a person's does. The surface,
  // the area that owns the commands, names the menu.
  const surfaceRef = useRef<HTMLSpanElement>(null)
  useAgentMember({
    member: 'ContextMenu',
    element: () => surfaceRef.current,
    state: () => ({ open: radixOpen || sheetOpen, entries: menuChoices(entries) }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          if (!chooseMenuEntry(entries, id)) return
          if (sheetOpen) dismissSheet()
          else if (radixOpen) handleRootOpenChange(false)
        },
      },
    },
  })

  return (
    <>
      <ContextMenuPrimitive.Root
        dir={dir}
        open={sheeting ? false : radixOpen}
        onOpenChange={handleRootOpenChange}
      >
        {/*
         * The merge. Radix's trigger is one span with the gesture handlers
         * (`contextmenu` and the long-press pointer events, which all bubble).
         * The panel anchors to a virtual point, so the span's geometry is never
         * read. `display: contents` therefore loses nothing the anchor needs
         * (TriggerAnchor needs that geometry, so it cannot use this) and leaves
         * the child unboxed: a wrapped `Table.Row` still renders as a row.
         *
         * The cost: HTML's content model allows no element between `<tbody>`
         * and `<tr>`, so React's dev build logs a nesting warning for that
         * pairing. The DOM is built, not parsed, so there is no
         * foster-parenting. A boxless span drops out of layout and the
         * accessibility tree, and the pairing fixture's axe entry checks that.
         */}
        {/*
         * The identity attribute (`data-member`) appears twice, because this
         * member's two elements are never in the document together. The panel
         * below is the surface an exception styles, but it opens only from a
         * gesture, never from a prop, so a fixture cannot render it. Without
         * this attribute the law would never see the member, and nobody could
         * edit it. The trigger surface is what exists in the closed state.
         */}
        <ContextMenuPrimitive.Trigger
          ref={surfaceRef}
          className={styles.surface}
          {...memberAttr('ContextMenu')}
        >
          {children}
        </ContextMenuPrimitive.Trigger>

        {sheeting ? null : (
          <ContextMenuPrimitive.Portal>
            {/* Menu's panel at the press point, with no `sideOffset`. The 2px
                anchored-surface constant keeps a panel border from merging with
                a trigger border, and a pointer has no border. */}
            <ContextMenuPrimitive.Content className={styles.content} {...memberAttr('ContextMenu')}>
              {menuRows(entries, PARTS, ROW_STYLES)}
            </ContextMenuPrimitive.Content>
          </ContextMenuPrimitive.Portal>
        )}
      </ContextMenuPrimitive.Root>

      {/* Rendered on both lanes, so a sheet opened at phone width stays mounted
          after a rotation past the threshold until it is dismissed. */}
      <SheetMenu
        open={sheetOpen}
        member="ContextMenu"
        entries={entries}
        onDismiss={dismissSheet}
        styles={SHEET_STYLES}
      />
    </>
  )
}
