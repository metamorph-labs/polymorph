'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { type ControlSize, Icon, memberAttr, useAgentMember, useDevWarning } from '@polymorph/react'
import { SheetSurface, usePhoneViewport } from '../overlays/sheet'
import { Tree, type TreeItem, type TreeMessages } from '../structure/Tree'
import styles from '@polymorph/recipes/controls/tree-select.module.css'

/**
 * Picks one node of a hierarchy, in a field (`design/components/tree-select.md`).
 *
 * It is Select's field with the Tree member in its popup. The trigger is
 * Select's, and the popup's rows, keys and loading are Tree's, so an
 * application that browses a hierarchy with Tree picks from it by passing the
 * same items. It is not Select, whose options are one flat list, and it has no
 * search, because a lazily loaded hierarchy is searched by the application's
 * server, not by the member. From the spec:
 *
 *  - **Choosing closes.** Enter, Space or a press on a node's row chooses it,
 *    closes the popup and returns focus to the trigger. Opening a branch
 *    chooses nothing, as on Tree.
 *  - **Opening shows the chosen node.** The branches above it open, and focus
 *    goes to it.
 *  - **The empty choice is built in**, as Select's is: `emptyOption` is the
 *    first top-level item, and choosing it reports `null`.
 *
 * Radix Popover places and dismisses the popup, which is modal while open, as
 * Select's list is. The shared sheet replaces it below `30rem`.
 */

export interface TreeSelectProps {
  /** Names the tree in the popup, as Tree's `label` does: "Organization units". FormField names the field. */
  label: string
  /** Tree's items: the top level, each branch holding the level under it. */
  items: TreeItem[]
  /** The open branches by id. Controlled when given; without it the member holds the set. */
  expanded?: ReadonlySet<string>
  /** The branches open at first, while the member holds the set. */
  defaultExpanded?: ReadonlySet<string>
  /** Called with the next set of open branches, controlled or not. */
  onExpandedChange?: (next: ReadonlySet<string>) => void
  /** The top level is loading, as an item's `loading` says of its own level. */
  loading?: boolean
  /** The top level has more items than `items` holds: a last row asks for them. */
  hasMore?: boolean
  /** Called with a branch's id, or `null` for the top level, when a reader asks for more. */
  onLoadMore?: (parentId: string | null) => void
  /**
   * The chosen node's id. Controlled when given. `null` is no node, and the
   * empty choice when `emptyOption` is set.
   */
  value?: string | null
  /** The node chosen at first, while the member holds the choice. */
  defaultValue?: string
  /** Called with the id of the node a reader chooses, and `null` for the empty choice. */
  onChange?: (id: string | null) => void
  /**
   * What the trigger shows while the chosen node is not in `items`, because its
   * level is not loaded. A node in `items` is shown by its own label.
   */
  valueLabel?: string
  /**
   * Labels a selectable empty choice, drawn as the first top-level item.
   * Choosing it reports `null`, and the trigger shows this label as a value.
   */
  emptyOption?: string
  /** Muted, and shown while no node is chosen. Cannot be combined with `emptyOption`. */
  placeholder?: string
  size?: ControlSize
  invalid?: boolean
  disabled?: boolean
  /** A hidden field that submits the chosen id, or the empty string for none and the empty choice. */
  name?: string
  id?: string
  /** Opens on mount. For galleries and tests; screens let the reader open it. */
  defaultOpen?: boolean
  /**
   * `'auto'` shows the popup as a sheet below `30rem`, as Select's. `'popover'`
   * keeps the anchored popup at every width.
   */
  presentation?: 'auto' | 'popover'
  /** Tree's strings, passed to the tree in the popup. Omit for Tree's English defaults. */
  messages?: TreeMessages
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/** The member's own set of open branches without `defaultExpanded`: every branch closed. */
const NONE_EXPANDED: ReadonlySet<string> = new Set()

/** A node, and the ids of the branches above it from the top level down. */
interface Found {
  node: TreeItem
  above: string[]
}

/**
 * The node with this id and the branches above it, or `null` when no level the
 * application has passed holds it. A node's branches are in `items` whenever
 * the node is, because each level is nested in the branch above it.
 */
function find(items: readonly TreeItem[], id: string): Found | null {
  for (const item of items) {
    if (item.id === id) return { node: item, above: [] }
    const under = item.children === undefined ? null : find(item.children, id)
    if (under !== null) return { node: under.node, above: [item.id, ...under.above] }
  }
  return null
}

/**
 * The open branches with every branch above the chosen node added, so the node
 * is drawn when the popup opens. The same set when nothing is added.
 */
function revealed(
  items: readonly TreeItem[],
  open: ReadonlySet<string>,
  chosen: string | null,
): ReadonlySet<string> {
  const found = chosen === null ? null : find(items, chosen)
  if (found === null || found.above.every((id) => open.has(id))) return open
  return new Set([...open, ...found.above])
}

/**
 * Every node the application has passed, at every level, as an agent's choices,
 * in the order the tree draws them. A disabled node is disabled, and so is every
 * node under a disabled branch, because the tree draws that branch closed.
 */
function choicesOf(
  items: readonly TreeItem[],
  off = false,
): { id: string; label: string; disabled?: true }[] {
  return items.flatMap((item) => {
    const shut = off || item.disabled === true
    return [
      { id: item.id, label: item.label, ...(shut ? { disabled: true as const } : {}) },
      ...(item.children === undefined ? [] : choicesOf(item.children, shut)),
    ]
  })
}

/**
 * Where focus goes when the popup opens: the chosen node when it is drawn, else
 * the first row, which is Tree's tab stop before focus has been in the tree. It
 * is read from the document, so it does not wait for the tree to set its stop.
 */
function focusOpening(panel: Element | null) {
  const row =
    panel?.querySelector<HTMLElement>(
      '[role="treeitem"][aria-selected="true"]:not([aria-disabled="true"])',
    ) ?? panel?.querySelector<HTMLElement>('[role="treeitem"]:not([aria-disabled="true"])')
  row?.focus()
}

/**
 * Whether a key or a press inside the popup chose the chosen node again. Tree
 * reports nothing for it, and the popup still closes, as Select's does. It reads
 * Tree's attributes: the row a press lands on, the chevron, and `aria-selected`,
 * which only an enabled item that is not a "load more" row can carry as `true`.
 */
function choseAgain(event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>): boolean {
  const target = event.target as Element
  if ('key' in event) {
    if (event.key !== 'Enter' && event.key !== ' ') return false
    if (event.altKey || event.ctrlKey || event.metaKey) return false
    return target.closest('[role="treeitem"]')?.getAttribute('aria-selected') === 'true'
  }
  if (target.closest('[data-tree-part="toggle"]') !== null) return false
  const row = target.closest('[data-tree-part="row"]')?.parentElement
  return row?.getAttribute('aria-selected') === 'true'
}

export function TreeSelect({
  label,
  items,
  expanded,
  defaultExpanded,
  onExpandedChange,
  loading = false,
  hasMore = false,
  onLoadMore,
  value,
  defaultValue,
  onChange,
  valueLabel,
  emptyOption,
  placeholder,
  size = 'md',
  invalid = false,
  disabled = false,
  name,
  id,
  defaultOpen,
  presentation = 'auto',
  messages,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: TreeSelectProps) {
  const offersEmpty = emptyOption !== undefined
  useDevWarning(
    offersEmpty && placeholder !== undefined,
    'TreeSelect: `placeholder` and `emptyOption` are mutually exclusive — a placeholder is the ' +
      'absence of a value and the empty choice is one. `emptyOption` wins; drop the placeholder.',
  )

  const uid = useId()
  const panelId = `${uid}-panel`
  // The empty choice's item id, made for this instance, so no application id
  // can be the same. It is mapped to `null` on the way out and back on the way in.
  const emptyId = `${uid}-empty`

  const [ownValue, setOwnValue] = useState<string | null>(defaultValue ?? null)
  const chosen = value === undefined ? ownValue : value

  // The member holds the open branches while the popup is closed, and the
  // popup's Tree is told them, so a reader finds them as they left them.
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(() => {
    const start = defaultExpanded ?? NONE_EXPANDED
    return defaultOpen === true ? revealed(items, start, chosen) : start
  })
  const branches = expanded ?? ownExpanded

  const [isOpen, setIsOpen] = useState(defaultOpen ?? false)
  const open = isOpen && !disabled

  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone
  const triggerRef = useRef<HTMLButtonElement>(null)

  /**
   * Focus returns to the trigger whenever the sheet closes, as Radix returns it
   * for the popover. It runs in an effect, after the sheet's focus containment
   * is released, which a focus moved at dismiss time would lose to (Select does
   * the same).
   */
  const restoreToTrigger = useRef(false)
  useEffect(() => {
    if (open) {
      restoreToTrigger.current = sheeting
      return
    }
    if (!restoreToTrigger.current) return
    restoreToTrigger.current = false
    triggerRef.current?.focus()
  }, [open, sheeting])

  function changeExpanded(next: ReadonlySet<string>) {
    // The member's own set follows every change, whoever holds the set, as Tree's does.
    setOwnExpanded(next)
    onExpandedChange?.(next)
  }

  /** Opening shows the chosen node: the branches above it open in the same render as the popup. */
  function setOpen(next: boolean) {
    if (next && !open) {
      const shown = revealed(items, branches, chosen)
      if (shown !== branches) changeExpanded(shown)
    }
    setIsOpen(next)
  }

  function choose(reported: string | null) {
    setOwnValue(reported)
    onChange?.(reported)
    setOpen(false)
  }

  /*
   * An agent chooses a node by its id without opening the popup, among every node the
   * application has passed, through the member's own value, so `onChange` reports it as it
   * reports a person's choice, controlled or not. A node in a level the application has not
   * loaded cannot be chosen. The empty choice's id is the empty string, which `onChange` reports
   * as `null`. Choosing the chosen node reports nothing, as in Select. The Tree in the popup is
   * the member's own part, so the member withholds the popup: the popover's panel, or the sheet's
   * body, which carries the panel's id.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'TreeSelect',
    element: () => triggerRef.current,
    state: () => ({
      value: chosen === null ? (offersEmpty ? '' : null) : chosen,
      options: [...(offersEmpty ? [{ id: '', label: emptyOption }] : []), ...choicesOf(items)],
      open,
      disabled,
      invalid,
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (picked) => {
          const next = picked === '' ? null : picked
          if (next !== chosen) choose(next)
        },
      },
      open: () => setOpen(true),
      close: () => setOpen(false),
    },
    withholds: () => panelRef.current ?? document.getElementById(panelId),
  })

  const found = chosen === null ? null : find(items, chosen)
  const placeholderShown = chosen === null && !offersEmpty
  const shown =
    chosen === null ? (emptyOption ?? placeholder ?? '') : (found?.node.label ?? valueLabel ?? '')

  const trigger = (
    <button
      type="button"
      ref={triggerRef}
      id={id}
      className={styles.trigger}
      role="combobox"
      aria-haspopup="tree"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required={required}
      aria-invalid={invalid ? true : undefined}
      disabled={disabled}
      data-size={size}
      data-state={open ? 'open' : 'closed'}
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-placeholder={placeholderShown ? '' : undefined}
      // The popover's trigger toggles through Radix. The sheet's has no Radix root.
      onClick={sheeting ? () => setOpen(!open) : undefined}
      // ArrowDown and ArrowUp open it, as they open Select. Enter and Space are the button's click.
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        if (!disabled) setOpen(true)
      }}
      {...memberAttr('TreeSelect')}
    >
      <span className={styles.value}>{shown}</span>
      <span className={styles.chevron} aria-hidden="true">
        <Icon name="expand" size={size} />
      </span>
    </button>
  )

  const hiddenInput =
    name === undefined ? null : (
      <input type="hidden" name={name} value={chosen ?? ''} disabled={disabled || undefined} />
    )

  const tree = (
    <Tree
      label={label}
      items={offersEmpty ? [{ id: emptyId, label: emptyOption }, ...items] : items}
      expanded={branches}
      onExpandedChange={changeExpanded}
      value={chosen ?? (offersEmpty ? emptyId : null)}
      onChange={(picked) => choose(picked === emptyId ? null : picked)}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      messages={messages}
    />
  )

  /** Choosing the chosen node again closes the popup, which Tree reports nothing for. */
  const bodyProps = {
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (choseAgain(event)) setOpen(false)
    },
    onClick(event: MouseEvent<HTMLElement>) {
      if (choseAgain(event)) setOpen(false)
    },
  }

  if (sheeting) {
    return (
      <>
        {trigger}
        {hiddenInput}
        <SheetSurface open={open} onDismiss={() => setOpen(false)}>
          <SheetBody id={panelId} size={size} {...bodyProps}>
            {tree}
          </SheetBody>
        </SheetSurface>
      </>
    )
  }

  return (
    // Modal while open, as Select's list is: focus stays in the tree, so Tab
    // does nothing, and the page behind takes no press. A press outside closes it.
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      {hiddenInput}
      <PopoverPrimitive.Portal>
        {/* Below the trigger and aligned with its start, two pixels off it, as
            Select's panel is. The panel has no role: the tree it holds is the
            popup the trigger's `aria-haspopup` names, where Radix would make
            the panel a dialog. */}
        <PopoverPrimitive.Content
          ref={panelRef}
          id={panelId}
          role={undefined}
          className={styles.content}
          side="bottom"
          align="start"
          sideOffset={2}
          data-size={size}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            focusOpening(event.currentTarget as Element)
          }}
          {...bodyProps}
          {...memberAttr('TreeSelect')}
        >
          {tree}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * The tree in the sheet, with the popover's opening focus as a mount effect.
 * Child effects run before the shared sheet's fallback, so the row already has
 * focus when the sheet checks (sheet.tsx).
 */
function SheetBody({
  id,
  size,
  children,
  onKeyDown,
  onClick,
}: {
  id: string
  size: ControlSize
  children: ReactNode
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onClick: (event: MouseEvent<HTMLElement>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    focusOpening(ref.current)
  }, [])

  return (
    <div
      ref={ref}
      id={id}
      className={styles.sheetBody}
      data-size={size}
      onKeyDown={onKeyDown}
      onClick={onClick}
      {...memberAttr('TreeSelect')}
    >
      {children}
    </div>
  )
}
