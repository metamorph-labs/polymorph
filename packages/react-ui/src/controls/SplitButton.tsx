'use client'

import * as MenuPrimitive from '@radix-ui/react-dropdown-menu'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

import {
  agentPress,
  chooseMenuEntry,
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  type IconRole,
  type LawfulVariants,
  memberAttr,
  menuChoices,
  useAgentMember,
  useDirection,
} from '@polymorph/react'
import type { MenuEntry, MenuPresentation } from '../overlays/Menu'
import { menuRows, type MenuRowParts, type MenuRowStyles } from '../overlays/menu-rows'
import { usePhoneViewport } from '../overlays/sheet'
import { SheetMenu, type SheetMenuStyles } from '../overlays/sheet-menu'
import styles from '@polymorph/recipes/controls/split-button.module.css'

/**
 * A default command plus a menu of variants (`design/components/split-button.md`).
 *
 * The default action takes one press, and the variants are behind the chevron. It is
 * built entirely from existing pieces: the primary half uses Button's recipe, and the
 * menu half uses the installed dropdown with Menu's panel and rows.
 *
 * It is not two Buttons placed together. It is one control group with one variant, one
 * tone, one size and one disabled state, and the halves never differ. It is not a Menu
 * with a bigger trigger. The primary is a real default the user can press without opening
 * anything. If there is no real default, use a Menu behind an `overflow` Button. It is not
 * for opposites. The entries are variants of the label's verb, and a command that
 * contradicts the primary belongs in a different control.
 *
 * Two variants are excluded, as recorded in the grid below. **ghost**: a split needs a
 * visible seam, and ghost has no fill and no border, so the divider would separate
 * nothing. A ghost trigger with commands is a Menu. **danger**: a destructive primary
 * with similar commands a hairline away is easy to misclick, and destructive actions
 * should be slowed down by ConfirmDialog, not sped up by a chevron. A destructive variant
 * belongs inside the menu as a `tone: 'danger'` entry.
 */

/** The allowed variant and tone pairs as a type, encoded as Button encodes its own. */
export interface SplitButtonGrid {
  solid: 'accent'
  soft: 'accent'
  outline: 'neutral' | 'accent'
}

/**
 * The lawful cells as data, the same table as `SplitButtonGrid`. The registry
 * reads it, so the native contracts take the pair as one lawful cell.
 */
export const SPLIT_BUTTON_GRID = {
  solid: ['accent'],
  soft: ['accent'],
  outline: ['neutral', 'accent'],
} as const satisfies { [V in keyof SplitButtonGrid]: readonly SplitButtonGrid[V][] }

export type SplitButtonAppearance = LawfulVariants<SplitButtonGrid>

export type SplitButtonProps = SplitButtonAppearance & {
  /** The primary half's visible text, as in Button, truncated with an ellipsis on overflow. */
  label: string
  /** The primary half's handler. Disconnected while `loading` (Button's double-submit rule). */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  /** A leading icon on the primary half (as in Button). */
  icon?: IconRole
  /** Menu entries exactly as `menu.md` defines them, with every entry kind supported. */
  entries: MenuEntry[]
  /**
   * The chevron half's accessible name ("More resolve options"). It is `iconOnly`, and an
   * unnamed second button would be an unexplained tab stop. Required, because the member
   * has no built-in text (as with PasswordInput's `toggleLabel`).
   */
  menuLabel: string
  size?: ControlSize
  /** Disables the whole group, because the halves never differ. */
  disabled?: boolean
  /**
   * Shows the spinner in the primary half's icon slot, following the conventions' loading
   * rule, and the layout stays the same. The chevron is disabled too. One running command
   * is the whole group's state, and starting a variant while it runs would be the
   * double-submit bug Button prevents, at group level.
   */
  loading?: boolean
  /** Opens on mount. For galleries and tests; screens let the user open it. */
  defaultOpen?: boolean
  /**
   * The menu half's presentation, as in Menu (`menu.md`; the conventions' sheet
   * presentation). `'auto'` shows the panel as a sheet below `30rem`, and `'popover'`
   * keeps the popper. The control group itself never changes, because the halves are
   * Buttons, and Buttons have no phone-specific form.
   */
  presentation?: MenuPresentation
}

/** The rows' primitive parts, from the same dropdown Menu uses. */
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

/** The rows' classes, one by one, from this member's own stylesheet. */
const ROW_STYLES: MenuRowStyles = {
  item: styles.item,
  checkbox: styles.checkbox,
  check: styles.check,
  glyph: styles.rowGlyph,
  label: styles.rowLabel,
  hint: styles.hint,
  separator: styles.separator,
  groupLabel: styles.groupLabel,
  content: styles.content,
}

/** The same classes for the react-aria sheet version, from this member's stylesheet. */
const SHEET_STYLES: SheetMenuStyles = {
  sheetList: styles.sheetList,
  item: styles.item,
  checkbox: styles.checkbox,
  check: styles.check,
  glyph: styles.rowGlyph,
  label: styles.rowLabel,
  hint: styles.hint,
  separator: styles.separator,
  groupLabel: styles.groupLabel,
}

export function SplitButton({
  variant = 'solid',
  tone = 'accent',
  label,
  onClick,
  icon,
  entries,
  menuLabel,
  size = 'md',
  disabled = false,
  loading = false,
  defaultOpen,
  presentation = 'auto',
}: SplitButtonProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  const shared = dataAttrs({ variant, tone, size, disabled })

  /**
   * Mirrored for both versions (as in Menu), so the panel's open state is kept when the
   * viewport crosses the breakpoint. The popper version passes it to Radix as a
   * controlled pair that behaves like the uncontrolled root. The sheet version uses it to
   * drive the shared sheet.
   */
  const [open, setOpen] = useState(defaultOpen ?? false)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  /**
   * One handle for the whole group, named by the primary half, as a person sees one control.
   * A press is the primary's own click (`agentPress`), so a loading group ignores it as it
   * ignores a person's. An agent chooses a variant by its id without opening the menu, and the
   * entry's own handler runs, as Menu's choice does; a command closes a menu that is open. While
   * a command runs the chevron is disabled, so a variant is refused and the menu does not open.
   */
  const running = () => {
    if (loading) throw new Error('A command is running; its variants wait until it ends.')
  }
  useAgentMember({
    member: 'SplitButton',
    element: () => primaryRef.current,
    state: () => ({ disabled, loading, open, entries: menuChoices(entries) }),
    actions: {
      press: () => agentPress(primaryRef.current),
      choose: {
        argument: 'id',
        run: (id) => {
          running()
          if (chooseMenuEntry(entries, id) && open) setOpen(false)
        },
      },
      open: () => {
        running()
        setOpen(true)
      },
      close: () => setOpen(false),
    },
  })

  /**
   * The sheet breakpoint, resolved once. Submenus are also shown in the sheet, flattened
   * (menu.md, `sheet-menu.tsx`).
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  /**
   * Radix restores focus to the chevron in the popper version, and the sheet version must
   * do the same. This is an effect on purpose (as in TriggerAnchor). A synchronous
   * `focus()` in the dismiss handler would run while the sheet's focus containment is
   * still active, and focus would be pulled back into the closing panel.
   */
  const sheetWasOpen = useRef(false)
  useEffect(() => {
    if (sheeting && open) {
      sheetWasOpen.current = true
      return
    }
    if (!sheetWasOpen.current) return
    sheetWasOpen.current = false
    chevronRef.current?.focus()
  }, [sheeting, open])

  const chevron = (
    <button
      type="button"
      ref={chevronRef}
      className={styles.chevron}
      disabled={disabled || loading}
      aria-label={menuLabel}
      {...shared}
      {...dataFlag('icon-only', true)}
      {...(sheeting
        ? {
            // The attributes Radix's trigger would set, written by hand for the sheet
            // version: the same popup attributes and the same ArrowDown opening.
            'aria-haspopup': 'menu' as const,
            'aria-expanded': open,
            'aria-controls': open ? menuId : undefined,
            'data-state': open ? 'open' : 'closed',
            onClick: () => setOpen(!open),
            onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
              event.preventDefault()
              setOpen(true)
            },
          }
        : {})}
    >
      <Icon name="expand" size={size} />
    </button>
  )

  return (
    <MenuPrimitive.Root dir={dir} open={sheeting ? false : open} onOpenChange={setOpen}>
      <span className={styles.group} {...shared} {...memberAttr('SplitButton')}>
        {/*
         * Both halves compose Button's recipe instead of copying it, as Link's button
         * variant does: the composed `.button` class plus Button's data attributes. So
         * rest, hover, active, disabled and loading are Button's own styles with no copy
         * to drift. They hover and press independently, because each is its own element
         * and only the half under the pointer responds.
         */}
        <button
          ref={primaryRef}
          type="button"
          className={styles.primary}
          disabled={disabled}
          aria-busy={loading ? true : undefined}
          onClick={loading ? undefined : onClick}
          {...dataAttrs({ variant, tone, size, disabled, state: loading ? 'loading' : undefined })}
        >
          {loading ? (
            <span className={styles.spinner}>
              <Icon name="loading" size={size} />
            </span>
          ) : icon !== undefined ? (
            <span className={styles.glyph}>
              <Icon name={icon} size={size} />
            </span>
          ) : null}
          <span className={styles.label}>{label}</span>
        </button>

        {/* The seam: 1px, full height, visual only. Its colour is one the halves already
            use, chosen by the group's variant in the stylesheet. */}
        <span className={styles.seam} aria-hidden="true" />

        {/*
         * A real second button, one tab stop after the primary, so the default comes
         * before its variants. Square at the control height (Button's `iconOnly` style,
         * through the same data attributes). While the group loads it is really
         * `disabled`, not a silent no-op. In the sheet version the chevron is not
         * wrapped in a Trigger, because there is no popper to anchor, and it sets the
         * same attributes by hand.
         */}
        {sheeting ? chevron : <MenuPrimitive.Trigger asChild>{chevron}</MenuPrimitive.Trigger>}
      </span>

      {sheeting ? null : (
        <MenuPrimitive.Portal>
          {/* Menu's whole panel, anchored to the group's end edge where the chevron is,
              at the standard anchored-surface offset. */}
          <MenuPrimitive.Content
            className={styles.content}
            side="bottom"
            align="end"
            sideOffset={2}
            {...memberAttr('SplitButton')}
          >
            {menuRows(entries, PARTS, ROW_STYLES)}
          </MenuPrimitive.Content>
        </MenuPrimitive.Portal>
      )}

      {/* Below `30rem` under `presentation="auto"`, this uses Menu's sheet (`menu.md`;
          the conventions' sheet presentation). The panel becomes a sheet and the
          anchoring rules do not apply. Entries and semantics are unchanged. */}
      {sheeting ? (
        <SheetMenu
          open={open}
          member="SplitButton"
          id={menuId}
          label={menuLabel}
          entries={entries}
          onDismiss={() => setOpen(false)}
          styles={SHEET_STYLES}
        />
      ) : null}
    </MenuPrimitive.Root>
  )
}
