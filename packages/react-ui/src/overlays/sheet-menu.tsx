'use client'

import { useMemo, useRef, type RefObject } from 'react'
import { useMenu, useMenuItem } from 'react-aria'
import { Item, useTreeState, type Key, type TreeState } from 'react-stately'

import { Icon, memberAttr } from '@polymorph/react'
import { Kbd } from '../structure/Kbd'
import type {
  MenuCheckboxEntry,
  MenuEntry,
  MenuItemEntry,
  MenuLabelEntry,
  MenuLeafEntry,
} from './Menu'
import { SheetSurface } from './sheet'

/**
 * Menu's row grammar for the sheet (the sheet presentation,
 * `design/components/README.md`). It is the react-aria counterpart of
 * `menu-rows.tsx`, written beside it rather than as a lane inside it, for a
 * structural reason. A Radix part is a ready-made component that the parts
 * record can point at. A react-aria row is a hook call (`useMenuItem` with its
 * own ref against shared tree state), and a `ComponentType` indirection cannot
 * pass state and refs it does not know about. The entry kinds, order and
 * affordances are the same. Styles stay member-owned as in `menu-rows.tsx`
 * (the laws check a member's own stylesheet in source), so each member passes
 * its own classes.
 *
 * Radix dropdown-menu ties its menu semantics to its popper, so this lane
 * provides them through react-aria (the sheet presentation; the
 * focus-management boundary in `design/components/README-substrates.md`, which
 * assigns in-panel semantics to react-aria): `role="menu"`, roving focus,
 * typeahead and Escape. The sheet cannot ship without them. Selection
 * dismisses (for menus, the sheet presentation's dismissal list includes
 * selection). Checkbox entries stay open on toggle, as on the popper lane, and
 * the substrate is configured for that (`shouldCloseOnSelect: false`).
 *
 * Two deliberate mechanics:
 *
 *  - **Label and separator entries are outside the collection.** react-aria's
 *    `Section` is a wrapping group, but Menu's grammar is positional: a `label`
 *    entry is a row among rows, as Radix renders it. So the collection holds
 *    only the actionable entries, and the static rows are interleaved in the
 *    same `<ul>`. Keyboard navigation walks collection keys and never sees
 *    them, and the DOM order, which the cascade's `nth-child` rules and the
 *    reader both use, matches the Radix lane's.
 *  - **Checkbox rows set role and state by hand.** The tree uses
 *    `selectionMode: 'none'` because most entries are commands, and react-aria
 *    derives `menuitemcheckbox` only from a collection-wide selection mode.
 *    The override follows Radix: `role="menuitemcheckbox"` and `aria-checked`
 *    on the row, with the toggle going through the entry's `onCheckedChange`.
 *    So state is announced and the check glyph stays decorative, per Menu's
 *    accessibility rules.
 *
 * Submenu entries are flattened here (as `design/components/menu.md`
 * specifies). A submenu is a named group of commands, and the sheet already
 * has a form for that: the entry renders as its `label` followed by its items
 * inline, the label+group form. Touch users pay no navigation cost. A drill-in
 * (a second surface inside the sheet) is not offered, and a cascading popover
 * from a sheet is not allowed. A **disabled** submenu keeps the popper's
 * semantics (the sheet presentation requires semantics to carry over). In the
 * popper the submenu's row is visible and its items are unreachable and never
 * shown. So here the label row still renders (adaptation never hides content
 * the wide form shows, `docs/layout.md`) and the items do not render at all.
 * Rendering them disabled would announce n disabled commands where the popper
 * announces one disabled group.
 *
 * Not a member and not exported to consumers, like `trigger-anchor.tsx`.
 */

/** The classes a member's stylesheet must provide for this lane. The names are Menu's. */
export interface SheetMenuStyles {
  /** The scrolling `<ul role="menu">`: the member's sheet-list recipe, with its safe-area rule. */
  sheetList: string | undefined
  item: string | undefined
  checkbox: string | undefined
  check: string | undefined
  glyph: string | undefined
  label: string | undefined
  hint: string | undefined
  separator: string | undefined
  groupLabel: string | undefined
}

export interface SheetMenuProps {
  open: boolean
  /**
   * The owning member's name, set on the `<ul>` below as its identity attribute
   * (`data-member`). It is required rather than defaulted. The panel around it
   * is `sheet.tsx`'s shared box, so this list is the only element on the lane
   * that belongs to a member. Without the name, the exceptions seam could not
   * address the surface, with no warning, and only below `30rem`.
   */
  member: string
  /**
   * The full grammar, including submenus, which this surface flattens (as
   * `design/components/menu.md` specifies; the header explains why).
   */
  entries: MenuEntry[]
  /** Called on scrim press, Escape, and selection of a command entry. */
  onDismiss: () => void
  /** The `<ul role="menu">`'s id, which the trigger's `aria-controls` names while open. */
  id?: string
  /** An accessible name, when the member has a meaningful one (SplitButton's `menuLabel`). */
  label?: string
  /** The trigger span's id, if any; names the menu as the popper lane's `aria-labelledby` does. */
  labelledBy?: string
  styles: SheetMenuStyles
}

/** The actionable entries, which the collection holds. */
type ActionableEntry = MenuItemEntry | MenuCheckboxEntry

function isActionable(entry: MenuLeafEntry): entry is ActionableEntry {
  return entry.kind === undefined || entry.kind === 'item' || entry.kind === 'checkbox'
}

/**
 * Flattens submenus (menu.md's sheet cell). A submenu entry becomes its label
 * followed by its items inline, the label+group form, so everything after this
 * uses the flat-list code unchanged. The submenu's `icon` has no place in that
 * form and is dropped. A disabled submenu contributes only its label row (the
 * header explains why).
 */
function flatten(entries: MenuEntry[]): MenuLeafEntry[] {
  return entries.flatMap((entry): MenuLeafEntry[] => {
    if (entry.kind !== 'submenu') return [entry]
    const label: MenuLabelEntry = { kind: 'label', label: entry.label }
    return entry.disabled === true ? [label] : [label, ...entry.items]
  })
}

export function SheetMenu({
  open,
  member,
  entries,
  onDismiss,
  id,
  label,
  labelledBy,
  styles,
}: SheetMenuProps) {
  return (
    <SheetSurface open={open} onDismiss={onDismiss}>
      <SheetMenuList
        member={member}
        entries={entries}
        onDismiss={onDismiss}
        id={id}
        label={label}
        labelledBy={labelledBy}
        styles={styles}
      />
    </SheetSurface>
  )
}

/**
 * Inside the presence boundary, so the collection state mounts and unmounts
 * with the sheet. A reopened menu starts fresh, as a remounted Radix content
 * does.
 */
function SheetMenuList({
  member,
  entries,
  onDismiss,
  id,
  label,
  labelledBy,
  styles,
}: {
  member: string
  entries: MenuEntry[]
  onDismiss: () => void
  id?: string
  label?: string
  labelledBy?: string
  styles: SheetMenuStyles
}) {
  const listRef = useRef<HTMLUListElement>(null)

  const rows = useMemo(() => flatten(entries), [entries])
  const actionable = useMemo(() => rows.filter(isActionable), [rows])
  const byKey = useMemo(
    () => new Map<Key, ActionableEntry>(actionable.map((entry) => [entry.label, entry])),
    [actionable],
  )

  const state = useTreeState<ActionableEntry>({
    selectionMode: 'none',
    disabledKeys: actionable.filter((entry) => entry.disabled === true).map((entry) => entry.label),
    children: actionable.map((entry) => (
      <Item key={entry.label} textValue={entry.label}>
        {entry.label}
      </Item>
    )),
  })

  const { menuProps } = useMenu<ActionableEntry>(
    {
      // Radix's keyboard-open behaviour, used however the menu opens. The
      // sheet is mostly used by touch, and with focus already on the first row,
      // a keyboard user saves one arrow key.
      autoFocus: 'first',
      onClose: onDismiss,
      onAction: (key: Key) => {
        const entry = byKey.get(key)
        if (entry === undefined) return
        if (entry.kind === 'checkbox') entry.onCheckedChange(!entry.checked)
        else entry.onSelect()
      },
      ...(id === undefined ? {} : { id }),
      ...(label === undefined ? {} : { 'aria-label': label }),
      ...(labelledBy === undefined ? {} : { 'aria-labelledby': labelledBy }),
    },
    state,
    listRef,
  )

  return (
    /*
     * The identity attribute (`data-member`) goes on the surface the member
     * owns. The panel around this list is `sheet.tsx`'s box, used by every
     * member with a sheet, so naming it would assign a shared surface to one
     * member. Popover follows the same rule, and Select's sheet lane marks its
     * own `<ul>` for the same reason. This list belongs to the member: it has
     * the member's `sheetList` class, and every row in it is styled from the
     * member's own stylesheet. So an exception addressed to that member applies
     * here and inherits down, as on the popper lane.
     */
    <ul {...menuProps} ref={listRef} className={styles.sheetList} {...memberAttr(member)}>
      {rows.map((entry, index) => {
        if (entry.kind === 'separator') {
          // A positional list, so a separator can only be keyed by index.
          // `role` is set because an `li` inside a menu otherwise has no role.
          return <li key={`separator-${index}`} role="separator" className={styles.separator} />
        }
        if (entry.kind === 'label') {
          return (
            <li key={`label-${entry.label}`} role="presentation" className={styles.groupLabel}>
              {entry.label}
            </li>
          )
        }
        return <SheetMenuRow key={entry.label} entry={entry} state={state} styles={styles} />
      })}
    </ul>
  )
}

/** One row, styled exactly as on the member's Radix lane. */
function SheetMenuRow({
  entry,
  state,
  styles,
}: {
  entry: ActionableEntry
  state: TreeState<ActionableEntry>
  styles: SheetMenuStyles
}) {
  const ref = useRef<HTMLLIElement>(null)
  const checkbox = entry.kind === 'checkbox'

  const { menuItemProps, labelProps, isFocused, isDisabled } = useMenuItem(
    {
      key: entry.label,
      // The popper lane's stay-open rule: several checkboxes can be toggled in
      // one open.
      // Command entries use the substrate's default, which closes.
      ...(checkbox ? { shouldCloseOnSelect: false } : {}),
    },
    state,
    ref as RefObject<HTMLLIElement>,
  )

  return (
    <li
      {...menuItemProps}
      // After the spread, on purpose: this row declares the checkbox entry's
      // role and state (see the header), using Radix's attributes, which the
      // stylesheets already key on.
      {...(checkbox ? { role: 'menuitemcheckbox', 'aria-checked': entry.checked } : {})}
      ref={ref}
      className={checkbox ? `${styles.item} ${styles.checkbox}` : styles.item}
      data-highlighted={isFocused ? '' : undefined}
      data-disabled={isDisabled ? '' : undefined}
      {...(checkbox
        ? { 'data-state': entry.checked ? 'checked' : 'unchecked', 'data-menu-part': 'checkbox' }
        : { 'data-tone': entry.tone ?? 'neutral' })}
    >
      {checkbox ? (
        /* Select's check column: the space is reserved whether or not checked. */
        <span className={styles.check}>
          {entry.checked ? <Icon name="confirm" size="sm" /> : null}
        </span>
      ) : entry.icon === undefined ? null : (
        <span className={styles.glyph}>
          <Icon name={entry.icon} size="sm" />
        </span>
      )}
      <span {...labelProps} className={styles.label}>
        {entry.label}
      </span>
      {!checkbox && entry.kbd !== undefined ? (
        <span className={styles.hint}>
          <Kbd>{entry.kbd}</Kbd>
        </span>
      ) : null}
    </li>
  )
}
