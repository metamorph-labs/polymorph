'use client'

import { useId, useMemo, useState } from 'react'

import { diffLines, diffRuns, type DiffRow, memberAttr, useDevWarning } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/diff.module.css'

import { Button } from '../controls/Button'

/**
 * A changed value or text, shown as old and new (`design/components/diff.md`).
 * The inline form is a short value in a sentence or a cell: the old value
 * struck through, an arrow, the new value. The lines form compares two texts
 * of several lines, line by line, through the engine's `diffLines`, so every
 * framework's Diff finds the same changes.
 *
 * Not CodeBlock, which shows one text to read and copy, and not JsonTree,
 * which browses one value. It compares and nothing else: no columns side by
 * side, no marks inside a line, no syntax colours, and nothing to accept or
 * edit.
 */

/**
 * The words the member writes itself, localized by passing them (WCAG 3.1.2).
 * Pass every key, so one Diff never mixes two languages.
 */
export interface DiffMessages {
  /** Read before the old value of a value that changed: "from". */
  from: string
  /** Read between the old value and the new one: "to". */
  to: string
  /** Read before a value, or a line, that only the new side has. */
  added: string
  /** Read before a value, or a line, that only the old side has. */
  removed: string
  /** A collapsed run's Button, a function because plural rules belong to the catalog. */
  unchanged: (count: number) => string
}

const DEFAULT_MESSAGES: DiffMessages = {
  from: 'from',
  to: 'to',
  added: 'added',
  removed: 'removed',
  unchanged: (count) => `${count} unchanged ${count === 1 ? 'line' : 'lines'}`,
}

export interface DiffProps {
  /**
   * The old value. Missing, `null` or empty means there was none: with an
   * `after`, the change is an addition.
   */
  before?: string | null
  /**
   * The new value. Missing, `null` or empty means there is none: with a
   * `before`, the change is a removal. Equal sides are no change.
   */
  after?: string | null
  /**
   * `inline` (the default) is a short value inside a sentence or a cell.
   * `lines` compares two texts of several lines, line by line.
   */
  display?: 'inline' | 'lines'
  /** Names the `lines` form, which is a region. The `lines` form needs it; `inline` does not use it. */
  label?: string
  /**
   * In `lines`, the unchanged lines kept beside each change. The unchanged
   * lines past them are one row that says how many it holds and shows them
   * when pressed. `Infinity` keeps every line.
   */
  context?: number
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: DiffMessages
}

/** One line of the lines form: its marker, the word a screen reader hears, and its text. */
function Row({ row, messages }: { row: DiffRow; messages: DiffMessages }) {
  return (
    <li className={styles.row} data-kind={row.kind === 'same' ? undefined : row.kind}>
      {/* `+` and `−` are drawn for the eye. The hidden word says the same to a screen reader. */}
      <span className={styles.marker} aria-hidden="true">
        {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ''}
      </span>
      {row.kind === 'same' ? null : (
        <span className={styles.spoken}>{`${messages[row.kind]} `}</span>
      )}
      <span className={styles.text}>{row.text}</span>
    </li>
  )
}

/** A row's key: its kind and its line, which no other row of the diff shares. */
const rowKey = (row: DiffRow): string =>
  row.kind === 'removed'
    ? `r${row.beforeLine}`
    : `${row.kind === 'added' ? 'a' : 's'}${row.afterLine}`

/**
 * A collapsed run: one row whose Button says how many unchanged lines it
 * holds, and the lines under it once it is pressed. The Button stays where it
 * is when the lines appear, so focus stays on it.
 */
function Run({ rows, messages }: { rows: readonly DiffRow[]; messages: DiffMessages }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className={styles.run}>
      <div className={styles.fold}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          icon={open ? 'collapse' : 'expand'}
          label={messages.unchanged(rows.length)}
          expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((current) => !current)}
        />
      </div>
      {open ? (
        <ol id={id} className={styles.rows} role="list">
          {rows.map((row) => (
            <Row key={rowKey(row)} row={row} messages={messages} />
          ))}
        </ol>
      ) : null}
    </li>
  )
}

function DiffLines({
  before,
  after,
  label,
  context,
  messages,
}: {
  before: string
  after: string
  label: string | undefined
  context: number
  messages: DiffMessages
}) {
  const runs = useMemo(() => diffRuns(diffLines(before, after), context), [before, after, context])
  useDevWarning(
    label === undefined,
    'Diff: the `lines` form is a region, and a region needs a name; pass `label`.',
  )

  return (
    <section className={styles.lines} aria-label={label} {...memberAttr('Diff')}>
      {/* A list, not a table: a row is one statement, "added" and the line, and
          a list reads it in one stop and says how many rows there are. The role
          is written out because a list without markers loses it in WebKit. */}
      <ol className={styles.rows} role="list">
        {runs.map((run) =>
          run.collapsed ? (
            <Run key={`run${run.key}`} rows={run.rows} messages={messages} />
          ) : (
            run.rows.map((row) => <Row key={rowKey(row)} row={row} messages={messages} />)
          ),
        )}
      </ol>
    </section>
  )
}

export function Diff({
  before,
  after,
  display = 'inline',
  label,
  context = 3,
  messages = DEFAULT_MESSAGES,
}: DiffProps) {
  // An empty value draws nothing a reader can see, so it reads as a missing one.
  const old = before ?? ''
  const next = after ?? ''

  // Neither side has a value, so there is nothing to show and nothing changed.
  if (old === '' && next === '') return null

  if (display === 'lines') {
    return (
      <DiffLines before={old} after={next} label={label} context={context} messages={messages} />
    )
  }

  // Phrasing content: a `span` sits in a paragraph, a title or a cell.
  if (old === next)
    return (
      <span className={styles.inline} {...memberAttr('Diff')}>
        {next}
      </span>
    )

  if (old === '') {
    return (
      <span className={styles.inline} {...memberAttr('Diff')}>
        <span className={styles.spoken}>{`${messages.added} `}</span>
        {/* Nothing else marks an addition for the eye: the new value is not struck or coloured. */}
        <span className={styles.sign} aria-hidden="true">
          +
        </span>
        <ins className={styles.after}>{next}</ins>
      </span>
    )
  }

  if (next === '') {
    return (
      <span className={styles.inline} {...memberAttr('Diff')}>
        <span className={styles.spoken}>{`${messages.removed} `}</span>
        <del className={styles.before}>{old}</del>
      </span>
    )
  }

  // A screen reader hears "from Draft to Active". The arrow is for the eye, and
  // the two words say what it means.
  return (
    <span className={styles.inline} {...memberAttr('Diff')}>
      <span className={styles.spoken}>{`${messages.from} `}</span>
      <del className={styles.before}>{old}</del>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <span className={styles.spoken}>{` ${messages.to} `}</span>
      <ins className={styles.after}>{next}</ins>
    </span>
  )
}
