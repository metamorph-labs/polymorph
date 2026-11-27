'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react'
import { useComboBox, useFilter, useListBox, useListBoxSection, useOption } from 'react-aria'
import {
  Item,
  Section,
  useComboBoxState,
  type ComboBoxState,
  type ItemProps,
  type Key,
  type Node,
  type SectionProps,
} from 'react-stately'

import { Icon, memberAttr, useAgentMember, type IconRole } from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import { Kbd } from '../structure/Kbd'
import { Skeleton } from '../structure/Skeleton'
import styles from '@polymorph/recipes/overlays/command.module.css'
import { useModalFocus } from './modal-focus'

/**
 * Command palette (`design/components/command.md`).
 *
 * **Composed, not imported.** `cmdk` is rejected
 * (`design/components/README-substrates.md`, the command palette) because of
 * its own attribute namespace, the Stylelint allowlist edit it would force, and
 * its maintenance. The palette uses two things this repo already has: Dialog's
 * substrate for modality and focus, and the Combobox's collection hooks for the
 * input, the filtered listbox and `aria-activedescendant`. Grouping, loading
 * and empty states come from the existing vocabulary.
 *
 * Unlike a combobox popup, a palette's listbox is always visible, so the
 * collection is held open rather than opened. One effect does that, and it is
 * the only cost of composing instead of importing.
 */

export interface CommandItem {
  id: string
  label: string
  icon?: IconRole
  /** Displays a shortcut without binding it; the app wires keys such as `⌘K`. */
  hint?: string
  /** Partitions the list, in the order the groups first appear. */
  group?: string
  /** Extra terms that match when typed but are never shown. */
  keywords?: string[]
  disabled?: boolean
  onSelect: () => void
}

/**
 * What the status region says while the commands load and once some are shown,
 * given whether they load and how many the query shows. One function rather
 * than two phrases, as Stepper's `spoken`, because the words around a number
 * are grammar and belong to the message catalog.
 */
export type CommandSpoken = (status: { loading: boolean; count: number }) => string

export interface CommandProps {
  /** The app owns the ⌘K binding, because a global hotkey is app policy, not vocabulary. */
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CommandItem[]
  placeholder?: string
  /** The dialog's accessible name; localized hosts replace the default `Command palette`. */
  label?: string
  /**
   * The dismiss key label beside the search field (default `esc`). Hosts
   * localize it because a key legend is text too.
   */
  escapeHint?: string
  /** `false` when the app filters the items itself, as with async command sources. */
  filter?: 'contains' | false
  loading?: boolean
  emptyMessage?: string
  /**
   * The status region's words in the host's language, the localization seam;
   * the default says `Loading commands…` or `4 commands`. With nothing shown,
   * the region says `emptyMessage`.
   */
  spoken?: CommandSpoken
  /** `false` for chained palettes, where the query stays after a command runs. */
  closeOnSelect?: boolean
}

const SKELETON_ROWS = [0, 1, 2]

const defaultSpoken: CommandSpoken = ({ loading, count }) =>
  loading ? 'Loading commands…' : `${count} commands`

export function Command({
  open,
  onOpenChange,
  items,
  placeholder = 'Type a command…',
  label = 'Command palette',
  escapeHint = 'esc',
  filter = 'contains',
  loading = false,
  emptyMessage = 'No results',
  spoken = defaultSpoken,
  closeOnSelect = true,
}: CommandProps) {
  const focus = useModalFocus('primary')

  // An agent chooses a command by its id, open or not, and the command's own `onSelect` runs; a
  // palette that is open then closes unless it chains, as after a person's choice. A close asks
  // the app through `onOpenChange`, which owns the open state. The panel names the palette, and
  // a closed palette has none; the query is the field's, empty while closed.
  const panelRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'Command',
    element: () => panelRef.current,
    state: () => ({
      open,
      items: items.map((item) => ({
        id: item.id,
        label: item.label,
        ...(item.disabled === true ? { disabled: true } : {}),
      })),
      query: panelRef.current?.querySelector('input')?.value ?? '',
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          items.find((item) => item.id === id)?.onSelect()
          if (open && closeOnSelect) onOpenChange(false)
        },
      },
      close: () => open && onOpenChange(false),
    },
  })

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <MotionPresence>
        {open ? (
          <DialogPrimitive.Portal key="command" forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <MotionSurface binding="dialog.scrim" className={styles.scrim} />
            </DialogPrimitive.Overlay>

            {/* The palette sits high, so results grow downward into free space
                instead of moving the panel. */}
            <div className={styles.positioner}>
              <CommandPanel
                panelRef={panelRef}
                focus={focus}
                items={items}
                placeholder={placeholder}
                label={label}
                escapeHint={escapeHint}
                filter={filter}
                loading={loading}
                emptyMessage={emptyMessage}
                spoken={spoken}
                closeOnSelect={closeOnSelect}
                onOpenChange={onOpenChange}
              />
            </div>
          </DialogPrimitive.Portal>
        ) : null}
      </MotionPresence>
    </DialogPrimitive.Root>
  )
}

/**
 * Everything inside the modal, in its own component so the collection state
 * mounts and unmounts with the panel. Otherwise the palette would reopen with
 * the previous query and its results.
 */
function CommandPanel({
  panelRef,
  focus,
  items,
  placeholder,
  label,
  escapeHint,
  filter,
  loading,
  emptyMessage,
  spoken,
  closeOnSelect,
  onOpenChange,
}: {
  /** The palette's, which names it to an agent. */
  panelRef: RefObject<HTMLDivElement | null>
  focus: ReturnType<typeof useModalFocus>
  items: CommandItem[]
  placeholder: string
  label: string
  escapeHint: string
  filter: 'contains' | false
  loading: boolean
  emptyMessage: string
  spoken: CommandSpoken
  closeOnSelect: boolean
  onOpenChange: (open: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listBoxRef = useRef<HTMLUListElement>(null)

  const { contains } = useFilter({ sensitivity: 'base' })
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  /**
   * The collection as elements rather than data, because groups form a tree: a
   * `Section` per run of items sharing a `group`, in first-appearance order, and
   * bare `Item`s for ungrouped items. Keywords go in `textValue`, which the
   * filter reads and nothing renders.
   */
  const children = useMemo(() => partition(items), [items])

  const state = useComboBoxState<CommandItem>({
    children,
    disabledKeys: items.filter((item) => item.disabled === true).map((item) => item.id),
    allowsEmptyCollection: true,
    // No stored selection: an item is a command, and people run the same one
    // twice. Controlled `null` stops the input from being overwritten with the
    // label of the last command.
    value: null,
    onChange: (key: Key | null) => {
      if (key === null) return
      byId.get(String(key))?.onSelect()
      if (closeOnSelect) onOpenChange(false)
    },
    ...(filter === 'contains' ? { defaultFilter: contains } : {}),
    // Focus stays inside a modal, and the list is always on screen, so blur
    // must not close it.
    shouldCloseOnBlur: false,
  })

  const { inputProps, listBoxProps } = useComboBox(
    { inputRef, listBoxRef, popoverRef: panelRef, 'aria-label': placeholder },
    state,
  )

  /**
   * Keeps the list open and an item focused.
   *
   * A palette's listbox has no closed state, because it is the panel. React
   * Aria's combobox closes it on commit and on a query that empties the list,
   * so it is reopened here. The first result is focused whenever nothing is,
   * because Enter must run the top match without an arrow key first. Both are
   * checks on every render rather than effects with dependency lists, which is
   * how react-stately writes its own equivalents.
   */
  useEffect(() => {
    if (!state.isOpen) {
      state.open('first', 'manual')
      return
    }
    if (state.selectionManager.focusedKey == null) {
      const first = firstItemKey(state)
      if (first !== null) state.selectionManager.setFocusedKey(first)
    }
  })

  const query = state.inputValue
  const count = countItems(state)
  const showEmpty = !loading && count === 0

  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      // Radix names its content by `aria-labelledby` whether or not a Title is
      // rendered, so the spec's "Command palette" goes in a hidden title. An
      // `aria-label` would lose to `aria-labelledby`. The name is the same, and
      // no reference points at a missing element.
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        focus.onOpenAutoFocus(event)
        event.preventDefault()
        inputRef.current?.focus()
      }}
      onCloseAutoFocus={focus.onCloseAutoFocus}
      onEscapeKeyDown={(event) => {
        // APG order: Escape clears a non-empty query, and only closes the
        // palette when the query is empty. React Aria has already reverted the
        // input when Radix's document listener runs, so `query` here is the
        // value at the moment Escape was pressed.
        if (query !== '') event.preventDefault()
      }}
    >
      <MotionSurface
        binding="command.panel"
        side="bottom"
        align="center"
        ref={panelRef as RefObject<HTMLElement>}
        className={styles.panel}
        // Radix hides the rest of the page with `aria-hidden` and omits this
        // attribute. Dialog adds it for assistive software that relies on the
        // attribute rather than the hiding, and so does Command.
        aria-modal
        data-loading={loading ? '' : undefined}
        {...memberAttr('Command')}
      >
        <VisuallyHidden>
          <DialogPrimitive.Title>{label}</DialogPrimitive.Title>
        </VisuallyHidden>

        <div className={styles.search}>
          <Icon name="search" size="md" />
          <input
            {...inputProps}
            ref={inputRef}
            className={styles.input}
            placeholder={placeholder}
          />
          <Kbd>{escapeHint}</Kbd>
        </div>

        <div className={styles.body} data-dialog-part="body">
          {/* Keyed on the committed query so the cascade runs again when new
              results arrive. Arrow keys only move the highlight and do not
              change the key, as the spec requires. */}
          <CommandListBox
            key={query}
            options={listBoxProps}
            state={state}
            listBoxRef={listBoxRef}
            byId={byId}
          />

          {loading ? (
            <div className={styles.rows} aria-hidden="true">
              {SKELETON_ROWS.map((row) => (
                <div key={row} className={styles.row}>
                  <Skeleton textStep="sm" />
                </div>
              ))}
            </div>
          ) : null}

          {showEmpty ? (
            <div className={styles.empty} aria-hidden="true">
              {emptyMessage}
            </div>
          ) : null}
        </div>

        <div role="status" aria-live="polite" className={styles.status}>
          {showEmpty ? emptyMessage : spoken({ loading, count })}
        </div>
      </MotionSurface>
    </DialogPrimitive.Content>
  )
}

/**
 * `byId` is threaded rather than read off the collection node.
 *
 * A statically built collection (`<Item>` elements rather than an `items` prop
 * with a render function) has no `value`, so `node.value` is null and a row
 * reading it would render its `textValue` instead of its label. Here
 * `textValue` also contains the keywords, which must never be shown.
 */
function CommandListBox({
  options,
  state,
  listBoxRef,
  byId,
}: {
  options: Parameters<typeof useListBox<CommandItem>>[0]
  state: ComboBoxState<CommandItem>
  listBoxRef: RefObject<HTMLUListElement | null>
  byId: Map<string, CommandItem>
}) {
  const { listBoxProps } = useListBox(options, state, listBoxRef)

  return (
    <ul {...listBoxProps} ref={listBoxRef} className={styles.listbox}>
      {[...state.collection].map((node) =>
        node.type === 'section' ? (
          <CommandGroup key={node.key} node={node} state={state} byId={byId} />
        ) : (
          <CommandRow key={node.key} node={node} state={state} byId={byId} />
        ),
      )}
    </ul>
  )
}

/** Menu's group label, and the `role="group"` that makes it name its rows. */
function CommandGroup({
  node,
  state,
  byId,
}: {
  node: Node<CommandItem>
  state: ComboBoxState<CommandItem>
  byId: Map<string, CommandItem>
}) {
  const { itemProps, headingProps, groupProps } = useListBoxSection({
    heading: node.rendered,
    'aria-label': node['aria-label'],
  })

  return (
    <li {...itemProps} className={styles.section}>
      <span {...headingProps} className={styles.groupLabel}>
        {node.rendered}
      </span>
      <ul {...groupProps} className={styles.group}>
        {[...(state.collection.getChildren?.(node.key) ?? [])].map((child) => (
          <CommandRow key={child.key} node={child} state={state} byId={byId} />
        ))}
      </ul>
    </li>
  )
}

/**
 * One command.
 *
 * The highlight uses the **selection** family, not the accent wash (the
 * selection treatment, `design/components/README.md`), because the active row
 * of a palette is the pending selection that Enter runs. A menu's transient
 * hover keeps the accent wash, and a law keeps the two distinguishable.
 */
function CommandRow({
  node,
  state,
  byId,
}: {
  node: Node<CommandItem>
  state: ComboBoxState<CommandItem>
  byId: Map<string, CommandItem>
}) {
  const ref = useRef<HTMLLIElement>(null)
  const { optionProps, labelProps, isFocused, isDisabled } = useOption(
    { key: node.key },
    state,
    ref,
  )
  const item = byId.get(String(node.key))

  return (
    <li
      {...optionProps}
      ref={ref}
      className={styles.item}
      data-highlighted={isFocused ? '' : undefined}
      data-disabled={isDisabled ? '' : undefined}
    >
      {item?.icon === undefined ? null : (
        <span className={styles.glyph}>
          <Icon name={item.icon} size="sm" />
        </span>
      )}
      <span {...labelProps} className={styles.label}>
        {item?.label ?? node.textValue}
      </span>
      {item?.hint === undefined ? null : (
        <span className={styles.hint}>
          <Kbd>{item.hint}</Kbd>
        </span>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* The collection                                                             */
/* -------------------------------------------------------------------------- */

/** `label` plus the keywords, so matching covers more than the row shows. */
function textValueOf(item: CommandItem): string {
  return item.keywords === undefined ? item.label : `${item.label} ${item.keywords.join(' ')}`
}

/**
 * react-stately's `Item` and `Section` return an element whose props are
 * `unknown`, because the collection builder reads them at runtime rather than
 * through the type. Two named aliases and two casts at that boundary keep the
 * rest of the file typed.
 */
type ItemElement = ReactElement<ItemProps<CommandItem>>
type SectionElement = ReactElement<SectionProps<CommandItem>>

function row(item: CommandItem): ItemElement {
  return (
    <Item key={item.id} textValue={textValueOf(item)}>
      {item.label}
    </Item>
  ) as ItemElement
}

/**
 * Turns items into a collection tree. Consecutive items sharing a `group`
 * become one `Section`, ungrouped items stay at the top level, and the given
 * order is kept. It is not a `groupBy`, because a palette's groups follow the
 * author's order, and re-sorting would mean the vocabulary decides which
 * commands matter.
 */
function partition(items: CommandItem[]): (ItemElement | SectionElement)[] {
  const nodes: (ItemElement | SectionElement)[] = []
  let run: CommandItem[] = []
  let group: string | undefined

  const flush = () => {
    if (run.length === 0) return
    nodes.push(
      (
        <Section key={`group-${group}`} title={group}>
          {run.map(row)}
        </Section>
      ) as SectionElement,
    )
    run = []
  }

  for (const item of items) {
    if (item.group === undefined) {
      flush()
      group = undefined
      nodes.push(row(item))
      continue
    }
    if (item.group !== group) {
      flush()
      group = item.group
    }
    run.push(item)
  }
  flush()

  return nodes
}

/** Sections hold the items, so the collection's own `getFirstKey` is a heading. */
function firstItemKey(state: ComboBoxState<CommandItem>): Key | null {
  for (const node of state.collection) {
    if (node.type !== 'section') {
      if (!state.disabledKeys.has(node.key)) return node.key
      continue
    }
    for (const child of state.collection.getChildren?.(node.key) ?? []) {
      if (!state.disabledKeys.has(child.key)) return child.key
    }
  }
  return null
}

function countItems(state: ComboBoxState<CommandItem>): number {
  let count = 0
  for (const node of state.collection) {
    if (node.type !== 'section') {
      count += 1
      continue
    }
    for (const _child of state.collection.getChildren?.(node.key) ?? []) count += 1
  }
  return count
}
