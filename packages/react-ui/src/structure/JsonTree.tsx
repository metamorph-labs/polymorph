'use client'

import { useRef, useState, type ReactNode } from 'react'

import {
  Icon,
  jsonTreeBranches,
  jsonTreeExpanded,
  memberAttr,
  setJsonTreeBranch,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/structure/json-tree.module.css'

/**
 * Browsable view of an arbitrary JSON value (`design/components/json-tree.md`).
 * Objects and arrays collapse and leaves are coloured by type. Used for response
 * bodies.
 *
 * It shows *one value*, while Table shows records the product understands. It
 * never reshapes or edits the data, so the only interactive part is the toggle.
 *
 * Not `role="tree"`, on purpose: that role promises roving focus and the full
 * arrow-key model, and doing it badly is worse than a disclosure list. Nested
 * `<ul>`s announce depth and count, and `<button aria-expanded>` gives Tab and
 * Enter natively.
 */

export interface JsonTreeProps {
  /**
   * Any JSON value; `undefined` and other non-JSON values render as their
   * `String()` form rather than crashing a page that already has a bug.
   */
  data: unknown
  /** The tree's accessible name, such as "Response body" rather than "JSON". */
  label: string
  /**
   * Levels open at mount (`0` all closed, `Infinity` for payloads known to be
   * small); uncontrolled afterwards, because browsing is not app state.
   */
  defaultDepth?: number
}

type Kind = 'string' | 'number' | 'boolean' | 'null'

/** One name per drawable shape; everything not a container is a leaf. */
function kindOf(value: unknown): Kind {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      // undefined, functions, symbols and bigints mean the page already has a
      // bug. Show the string form in the muted tone instead of crashing.
      return 'null'
  }
}

function spell(value: unknown, kind: Kind): string {
  if (kind === 'string') return JSON.stringify(value)
  return String(value)
}

const isContainer = (value: unknown): value is Record<string, unknown> | unknown[] =>
  typeof value === 'object' && value !== null

/** `[…] 12 items` / `{…} 3 keys`: the collapsed summary, and the toggle's name. */
function summarize(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) {
    return `[…] ${value.length} ${value.length === 1 ? 'item' : 'items'}`
  }
  const size = Object.keys(value).length
  return `{…} ${size} ${size === 1 ? 'key' : 'keys'}`
}

function Leaf({ name, value }: { name?: string; value: unknown }) {
  const kind = kindOf(value)
  return (
    <li className={styles.row}>
      {name === undefined ? null : (
        <span className={styles.key}>
          {name}
          <span className={styles.colon}>:</span>
        </span>
      )}
      <span className={styles.value} data-kind={kind}>
        {spell(value, kind)}
      </span>
    </li>
  )
}

function Branch({
  name,
  value,
  depth,
  defaultDepth,
}: {
  name?: string
  value: Record<string, unknown> | unknown[]
  depth: number
  defaultDepth: number
}) {
  const [open, setOpen] = useState(depth < defaultDepth)

  // `{}` and `[]` render as leaves. There is nothing to expand, so there is no
  // toggle, because a button that expands into nothing is misleading.
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value)
  if (entries.length === 0) {
    return (
      <li className={styles.row}>
        {name === undefined ? null : (
          <span className={styles.key}>
            {name}
            <span className={styles.colon}>:</span>
          </span>
        )}
        <span className={styles.summary}>{Array.isArray(value) ? '[]' : '{}'}</span>
      </li>
    )
  }

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.chevron} aria-hidden="true">
          <Icon name="next" size="sm" />
        </span>
        {name === undefined ? null : (
          <span className={styles.key}>
            {name}
            <span className={styles.colon}>:</span>
          </span>
        )}
        <span className={styles.summary}>{summarize(value)}</span>
      </button>
      {open ? (
        <ul className={styles.children}>
          {entries.map(([key, entry]) => (
            <Entry
              key={key}
              name={key}
              value={entry}
              depth={depth + 1}
              defaultDepth={defaultDepth}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function Entry({
  name,
  value,
  depth,
  defaultDepth,
}: {
  name?: string
  value: unknown
  depth: number
  defaultDepth: number
}): ReactNode {
  return isContainer(value) ? (
    <Branch name={name} value={value} depth={depth} defaultDepth={defaultDepth} />
  ) : (
    <Leaf name={name} value={value} />
  )
}

export function JsonTree({ data, label, defaultDepth = 1 }: JsonTreeProps) {
  // The spec's `agent` fence. Each branch holds whether it is open, so the tree
  // reads its branches from its own toggles in the document, by the recipe's
  // classes, and `expand` and `collapse` press a toggle, as a person does.
  const tree = useRef<HTMLUListElement>(null)
  useAgentMember({
    member: 'JsonTree',
    element: () => tree.current,
    state: () => ({
      expanded: jsonTreeExpanded(tree.current, styles.toggle, styles.key),
      branches: jsonTreeBranches(tree.current, styles.toggle, styles.key),
    }),
    actions: {
      expand: {
        argument: 'id',
        run: (id) => setJsonTreeBranch(tree.current, styles.toggle, styles.key, id, true),
      },
      collapse: {
        argument: 'id',
        run: (id) => setJsonTreeBranch(tree.current, styles.toggle, styles.key, id, false),
      },
    },
  })

  return (
    <ul ref={tree} className={styles.root} aria-label={label} {...memberAttr('JsonTree')}>
      <Entry value={data} depth={0} defaultDepth={defaultDepth} />
    </ul>
  )
}
