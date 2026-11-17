'use client'

import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { Icon, dataFlag, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/tree.module.css'
import { Spinner } from './Spinner'
import { useTreeKeyboard } from './tree-keyboard'

/**
 * A hierarchy opened level by level, with one item picked
 * (`design/components/tree.md`).
 *
 * It is not JsonTree, which shows one JSON value and selects nothing, and it is
 * not List or SectionNav, which are flat. From the spec:
 *
 *  - **Opening and selecting are separate acts.** A press on the chevron opens
 *    or closes a branch. A press on the rest of the row selects it. Selection
 *    does not follow focus.
 *  - **The app loads a level.** A branch with `hasChildren` and no `children`
 *    is one the app has not loaded: opening it calls `onExpandedChange`, and
 *    the app passes `loading`, then `children`.
 *  - **The tree holds the open branches unless the caller does**, as DataTable
 *    holds its open rows.
 *
 * It is `role="tree"`, with the whole arrow-key model (`tree-keyboard.ts`).
 */

export interface TreeItem {
  /** Unique in the tree. `onChange`, `onExpandedChange` and `onLoadMore` report it. */
  id: string
  label: string
  /** One supporting line under the label. */
  description?: string
  /** The items under it. An item with one or more is a branch. */
  children?: TreeItem[]
  /**
   * A branch whose items the app loads when it is first opened. With no
   * `children` the branch opens onto nothing until the app passes them.
   */
  hasChildren?: boolean
  /** The branch's level is loading. An open branch draws one busy row under itself. */
  loading?: boolean
  /** The branch has more items than `children` holds: a last row asks for them. */
  hasMore?: boolean
  /** The item takes no key and no press, the arrow keys pass over it, and a branch stays closed. */
  disabled?: boolean
}

/**
 * The strings the tree says for itself, localized by passing them (WCAG 3.1.2).
 * Pass both, so one tree never mixes two languages.
 */
export interface TreeMessages {
  /** What a level says while it loads. */
  loading: string
  /** The row that asks for more of a level. */
  loadMore: string
}

const DEFAULT_MESSAGES: TreeMessages = {
  loading: 'Loading',
  loadMore: 'Load more',
}

/** The uncontrolled expansion's first value without `defaultExpanded`: every branch closed. */
const NONE_EXPANDED: ReadonlySet<string> = new Set()

export interface TreeProps {
  /** Names the tree for a reader: "Organization units", not "Tree". */
  label: string
  /** The top level. */
  items: TreeItem[]
  /** The open branches by id. Controlled when given; without it the tree holds the set. */
  expanded?: ReadonlySet<string>
  /** The branches open at first, while the tree holds the set. */
  defaultExpanded?: ReadonlySet<string>
  /** Called with the next set of open branches, controlled or not. */
  onExpandedChange?: (next: ReadonlySet<string>) => void
  /** The selected item's id. Controlled when given, and `null` selects nothing. */
  value?: string | null
  /** The item selected at first, while the tree holds the selection. */
  defaultValue?: string
  /** Called with the id of the item a reader selects. */
  onChange?: (id: string) => void
  /** The top level is loading, as an item's `loading` says of its own level. */
  loading?: boolean
  /** The top level has more items than `items` holds: a last row asks for them. */
  hasMore?: boolean
  /** Called with a branch's id, or `null` for the top level, when a reader asks for more. */
  onLoadMore?: (parentId: string | null) => void
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: TreeMessages
}

/** What every level of one tree draws with. */
interface Shared {
  open: ReadonlySet<string>
  selected: string | null
  messages: TreeMessages
}

/**
 * The items a reader can see, in the order they are drawn: each item, then the
 * items of the branch under it while that branch is open. A disabled branch is
 * drawn closed, so its items are not seen.
 */
function shownItems(items: readonly TreeItem[], open: ReadonlySet<string>): TreeItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.disabled !== true && open.has(item.id) ? shownItems(item.children ?? [], open) : []),
  ])
}

/** The level a row sits at, as geometry: the recipe indents a row by it. */
const indent = (level: number) => ({ '--pm-tree-level': level }) as CSSProperties

/**
 * The rows of one level: its items, then one row that says the level is
 * loading or asks for more of it. While a level that has more is loading, the
 * row that asks is the busy row, so the row a reader pressed keeps its focus.
 */
function levelRows(
  items: readonly TreeItem[],
  level: number,
  loading: boolean,
  hasMore: boolean,
  moreId: string,
  shared: Shared,
): ReactNode {
  const { messages } = shared
  return (
    <>
      {items.map((item) => (
        <TreeNode key={item.id} item={item} level={level} {...shared} />
      ))}
      {hasMore ? (
        <li
          className={styles.item}
          role="treeitem"
          aria-labelledby={moreId}
          // Never selected, and it says so. Svelte's compiler reads ARIA's role
          // model as asking every treeitem to state its selection, and the DOM
          // is the same in every renderer.
          aria-selected={false}
          aria-busy={loading ? true : undefined}
          data-tree-part="more"
        >
          <div
            className={styles.row}
            data-tree-part="row"
            {...dataFlag('busy', loading)}
            style={indent(level)}
          >
            <span className={styles.slot}>
              {loading ? <Spinner size="sm" label={messages.loading} /> : null}
            </span>
            <span className={styles.text}>
              <span className={styles.more} id={moreId}>
                {loading ? messages.loading : messages.loadMore}
              </span>
            </span>
          </div>
        </li>
      ) : loading ? (
        // Not an item: it takes no focus and no key. The Spinner is the status
        // a screen reader hears, so the same words beside it are hidden from it.
        <li className={styles.item} role="none">
          <div className={styles.row} data-busy="" style={indent(level)}>
            <span className={styles.slot}>
              <Spinner size="sm" label={messages.loading} />
            </span>
            <span className={styles.text}>
              <span className={styles.status} aria-hidden="true">
                {messages.loading}
              </span>
            </span>
          </div>
        </li>
      ) : null}
    </>
  )
}

function TreeNode({ item, level, ...shared }: Shared & { item: TreeItem; level: number }) {
  // The ids are the node's own, not the item's: an `aria-labelledby` value is a
  // list of ids split at spaces, and an item's id may hold one.
  const uid = useId()
  const children = item.children ?? []
  const branch = children.length > 0 || item.hasChildren === true
  const disabled = item.disabled === true
  // A disabled branch is drawn closed: ARIA applies `aria-disabled` to the
  // focusable descendants of an element, and an open branch holds its rows.
  const open = branch && !disabled && shared.open.has(item.id)
  const loading = item.loading === true
  const hasMore = item.hasMore === true
  const selected = !disabled && shared.selected === item.id

  return (
    <li
      className={styles.item}
      role="treeitem"
      aria-labelledby={`${uid}-label`}
      aria-describedby={item.description === undefined ? undefined : `${uid}-description`}
      aria-expanded={branch ? open : undefined}
      // A disabled item cannot be selected, so it says nothing about selection.
      aria-selected={disabled ? undefined : selected}
      aria-disabled={disabled ? true : undefined}
      aria-busy={open && loading ? true : undefined}
      data-tree-item={item.id}
      {...dataFlag('selected', selected)}
      {...dataFlag('disabled', disabled)}
    >
      <div className={styles.row} data-tree-part="row" style={indent(level)}>
        {branch ? (
          <span className={styles.toggle} data-tree-part="toggle" aria-hidden="true">
            <span className={styles.chevron}>
              <Icon name="next" size="sm" />
            </span>
          </span>
        ) : (
          // A leaf keeps the chevron's width, so its label aligns with a branch's.
          <span className={styles.slot} />
        )}
        <span className={styles.text}>
          <span className={styles.label} id={`${uid}-label`}>
            {item.label}
          </span>
          {item.description === undefined ? null : (
            <span className={styles.description} id={`${uid}-description`}>
              {item.description}
            </span>
          )}
        </span>
      </div>
      {open && (children.length > 0 || loading || hasMore) ? (
        <ul className={styles.group} role="group">
          {levelRows(children, level + 1, loading, hasMore, `${uid}-more`, shared)}
        </ul>
      ) : null}
    </li>
  )
}

export function Tree({
  label,
  items,
  expanded,
  defaultExpanded,
  onExpandedChange,
  value,
  defaultValue,
  onChange,
  loading = false,
  hasMore = false,
  onLoadMore,
  messages = DEFAULT_MESSAGES,
}: TreeProps) {
  const uid = useId()
  const root = useRef<HTMLUListElement>(null)
  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded ?? NONE_EXPANDED)
  const [ownValue, setOwnValue] = useState<string | null>(defaultValue ?? null)
  const open = expanded ?? ownExpanded
  const selected = value === undefined ? ownValue : value

  // The tree's own set follows every change, whoever holds the set, so it is
  // current if the caller stops passing `expanded`. DataTable's open rows do
  // the same.
  const toggle = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOwnExpanded(next)
    onExpandedChange?.(next)
  }
  // A reader picks an item and cannot clear the pick, so selecting the
  // selected item again reports nothing.
  const select = (id: string) => {
    if (id === selected) return
    setOwnValue(id)
    onChange?.(id)
  }

  const keyboard = useTreeKeyboard(root, {
    toggle,
    select,
    more(parent) {
      onLoadMore?.(parent)
    },
  })

  // The spec's `agent` fence. The choices are the items a reader can see, so an agent opens a
  // branch before it selects what the branch holds, as a person does. A leaf neither opens nor
  // closes.
  const shown = shownItems(items, open)
  const branch = (id: string) => {
    const item = shown.find((candidate) => candidate.id === id)
    if ((item?.children?.length ?? 0) === 0 && item?.hasChildren !== true) {
      throw new Error(`"${item?.label ?? id}" is not a branch, so it does not open or close.`)
    }
  }
  useAgentMember({
    member: 'Tree',
    element: () => root.current,
    state: () => ({
      value: selected,
      expanded: [...open],
      items: shown.map((item) => ({
        id: item.id,
        label: item.label,
        ...(item.disabled === true ? { disabled: true } : {}),
      })),
      loading,
    }),
    actions: {
      choose: { argument: 'id', run: (id) => select(id) },
      expand: {
        argument: 'id',
        run: (id) => {
          branch(id)
          if (!open.has(id)) toggle(id)
        },
      },
      collapse: {
        argument: 'id',
        run: (id) => {
          branch(id)
          if (open.has(id)) toggle(id)
        },
      },
    },
  })

  return (
    <ul
      ref={root}
      className={styles.root}
      role="tree"
      aria-label={label}
      aria-busy={loading ? true : undefined}
      {...keyboard}
      {...memberAttr('Tree')}
    >
      {levelRows(items, 0, loading, hasMore, `${uid}-more`, { open, selected, messages })}
    </ul>
  )
}
