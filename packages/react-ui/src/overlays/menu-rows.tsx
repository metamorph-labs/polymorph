'use client'

import type { ComponentType, ReactNode } from 'react'

import { Icon } from '@polymorph/react'
import { Kbd } from '../structure/Kbd'
import type { MenuEntry, MenuLeafEntry, MenuSubmenuEntry } from './Menu'

/**
 * Menu's row grammar, rendered with any Radix menu-family primitive. It
 * follows `controls/date-segments.tsx`: shared structure, member-owned styles.
 *
 * `menu.md` owns the entry union, and two other members use it: ContextMenu
 * (the `@radix-ui/react-context-menu` wrapper around the same menu core) and
 * SplitButton (the installed dropdown behind a chevron). Their rows must match
 * Menu's: same entry kinds, same order, same affordances. A copy per member
 * would drift in three places. So the JSX is written once, and Menu's own
 * popper lane renders through it too. Each member passes its own primitive
 * parts and its own stylesheet's classes. The laws check a member's own
 * stylesheet in source, so the styles cannot be shared the way the structure
 * is.
 *
 * Not a member and not exported to consumers, like `trigger-anchor.tsx`.
 */

/**
 * The classes a member's stylesheet must provide for the rows. The names are
 * Menu's; the values use the css-modules declaration's `string | undefined`.
 */
export interface MenuRowStyles {
  item: string | undefined
  checkbox: string | undefined
  check: string | undefined
  glyph: string | undefined
  label: string | undefined
  hint: string | undefined
  separator: string | undefined
  groupLabel: string | undefined
  /** The submenu's panel, using the same panel recipe. */
  content: string | undefined
}

/**
 * The primitive parts a Radix menu family exposes, at the props these rows
 * use. It is structural on purpose: dropdown-menu and context-menu ship the
 * same parts under two namespaces, and the rows must work with either.
 */
export interface MenuRowParts {
  Item: ComponentType<{
    className?: string
    disabled?: boolean
    onSelect?: (event: Event) => void
    'data-tone'?: string
    children?: ReactNode
  }>
  CheckboxItem: ComponentType<{
    className?: string
    'data-menu-part'?: string
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    disabled?: boolean
    onSelect?: (event: Event) => void
    children?: ReactNode
  }>
  ItemIndicator: ComponentType<{ children?: ReactNode }>
  Separator: ComponentType<{ className?: string }>
  Label: ComponentType<{ className?: string; children?: ReactNode }>
  Sub: ComponentType<{ children?: ReactNode }>
  SubTrigger: ComponentType<{
    className?: string
    disabled?: boolean
    'data-tone'?: string
    children?: ReactNode
  }>
  SubContent: ComponentType<{ className?: string; sideOffset?: number; children?: ReactNode }>
  Portal: ComponentType<{ children?: ReactNode }>
}

/** One row, rendered the same everywhere; Menu's `leaf`, unchanged. */
function leaf(
  entry: MenuLeafEntry,
  index: number,
  parts: MenuRowParts,
  styles: MenuRowStyles,
): ReactNode {
  if (entry.kind === 'separator') {
    // The primitive's separator, not the vocabulary's, because inside a menu
    // the divider is semantic (`role="separator"`). Entries are a positional
    // list, so a separator can only be keyed by index.
    return <parts.Separator key={`separator-${index}`} className={styles.separator} />
  }

  if (entry.kind === 'label') {
    return (
      <parts.Label key={`label-${entry.label}`} className={styles.groupLabel}>
        {entry.label}
      </parts.Label>
    )
  }

  if (entry.kind === 'checkbox') {
    return (
      <parts.CheckboxItem
        key={entry.label}
        className={`${styles.item} ${styles.checkbox}`}
        // The part hook the conformance runner locates a toggle row by, so its
        // role and `aria-checked` are checked rather than assumed.
        data-menu-part="checkbox"
        checked={entry.checked}
        onCheckedChange={entry.onCheckedChange}
        disabled={entry.disabled}
        // Radix closes on select by default. Preventing it lets several
        // checkboxes be toggled while the menu stays open (Menu's stay-open rule).
        onSelect={(event) => event.preventDefault()}
      >
        {/* Select's check column: the space is reserved whether or not checked. */}
        <span className={styles.check}>
          <parts.ItemIndicator>
            <Icon name="confirm" size="sm" />
          </parts.ItemIndicator>
        </span>
        <span className={styles.label}>{entry.label}</span>
      </parts.CheckboxItem>
    )
  }

  return (
    <parts.Item
      key={entry.label}
      className={styles.item}
      disabled={entry.disabled}
      onSelect={entry.onSelect}
      data-tone={entry.tone ?? 'neutral'}
    >
      {entry.icon === undefined ? null : (
        <span className={styles.glyph}>
          <Icon name={entry.icon} size="sm" />
        </span>
      )}
      <span className={styles.label}>{entry.label}</span>
      {entry.kbd === undefined ? null : (
        <span className={styles.hint}>
          <Kbd>{entry.kbd}</Kbd>
        </span>
      )}
    </parts.Item>
  )
}

/** One nested level, Menu's `submenu` unchanged; the type forbids a second. */
function submenu(entry: MenuSubmenuEntry, parts: MenuRowParts, styles: MenuRowStyles): ReactNode {
  return (
    <parts.Sub key={entry.label}>
      <parts.SubTrigger className={styles.item} disabled={entry.disabled} data-tone="neutral">
        {entry.icon === undefined ? null : (
          <span className={styles.glyph}>
            <Icon name={entry.icon} size="sm" />
          </span>
        )}
        <span className={styles.label}>{entry.label}</span>
        {/* An affordance, not decoration: a row that opens another list shows
            that before it is hovered. It sits where a `kbd` hint would. */}
        <span className={styles.hint}>
          <Icon name="next" size="sm" />
        </span>
      </parts.SubTrigger>

      <parts.Portal>
        {/* The same panel recipe, offset by 2px (the anchored-surface constant),
            because a submenu is anchored to a real row. */}
        <parts.SubContent className={styles.content} sideOffset={2}>
          {entry.items.map((item, index) => leaf(item, index, parts, styles))}
        </parts.SubContent>
      </parts.Portal>
    </parts.Sub>
  )
}

/** Every entry kind `menu.md` defines, in the order the entries were given. */
export function menuRows(
  entries: MenuEntry[],
  parts: MenuRowParts,
  styles: MenuRowStyles,
): ReactNode[] {
  return entries.map((entry, index) =>
    entry.kind === 'submenu' ? submenu(entry, parts, styles) : leaf(entry, index, parts, styles),
  )
}
