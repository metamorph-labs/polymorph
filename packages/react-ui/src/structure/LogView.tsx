'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { followEnd, Icon, jumpToEnd, memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/log-view.module.css'

import { Button } from '../controls/Button'

/**
 * Lines of output that follow the newest line (`design/components/log-view.md`).
 * Build output, an agent's console or an audit stream: lines that arrive over
 * time, drawn on CodeBlock's code surface, with the view held at the newest
 * line while the reader is there. It follows by the engine's `followEnd`, the
 * rule ChatThread follows its newest turn by.
 *
 * Not CodeBlock, which shows one finished text to read and copy and does not
 * follow. The application owns the window: it passes the lines it wants shown
 * and trims the old ones. LogView draws every line it is passed. It does not
 * virtualise, parse ANSI colour codes, search or filter.
 */

/** One line of the log. */
export interface LogLine {
  /** Unique in the log and the same on every render: the line's key. */
  id: string
  /** The line as it was written. Whitespace is content. */
  text: string
  /**
   * How serious the line is. A level is drawn as a marker and read as a word,
   * so colour is never the only mark. A line without one is ordinary output.
   */
  level?: 'info' | 'warning' | 'error'
  /** When the line was written, already formatted by the application, such as `14:24:18.204`. */
  time?: string
  /** What wrote the line, such as a service, a process or a build step. */
  source?: string
}

/**
 * The words the member writes itself, localized by passing them (WCAG 3.1.2).
 * Pass every key, so one log never mixes two languages.
 */
export interface LogViewMessages {
  /** The label of the button that returns the reader to the newest line. */
  jumpToLatest: string
  /** Read before a line whose level is `info`. */
  info: string
  /** Read before a line whose level is `warning`. */
  warning: string
  /** Read before a line whose level is `error`. */
  error: string
}

const DEFAULT_MESSAGES: LogViewMessages = {
  jumpToLatest: 'Jump to latest',
  info: 'info',
  warning: 'warning',
  error: 'error',
}

export interface LogViewProps {
  /** The log's accessible name, such as "Build output" in the app's language. */
  label: string
  /** The lines to show, oldest first. The application trims the old ones. */
  lines: LogLine[]
  /** Whether more lines are coming, which draws a caret after the last line and sets `aria-busy`. */
  streaming?: boolean
  /**
   * Whether a long line wraps, which is the default. `false` keeps each line on
   * one row and scrolls the log sideways, for output whose columns line up.
   */
  wrap?: boolean
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: LogViewMessages
}

/**
 * One line: its level's marker, the word a screen reader hears for the level,
 * its time, its source and its text. It is memoised, because a log appends
 * lines, and a line already drawn does not change when a new one arrives.
 */
const Line = memo(function Line({ line, word }: { line: LogLine; word: string | undefined }) {
  return (
    <li className={styles.line} data-level={line.level}>
      {/* The marker is for the eye, and the hidden word says the same to a screen reader. */}
      <span className={styles.marker} aria-hidden="true">
        {line.level === undefined ? null : <Icon name={line.level} size="sm" />}
      </span>
      {word === undefined ? null : <span className={styles.spoken}>{`${word} `}</span>}
      {/* The space after the time and after the source is read, so a screen
          reader never runs them into the text. The time's space hangs at the
          end of its cell and draws nothing; the source's is the gap before the
          text, because the text keeps its whitespace. */}
      {line.time === undefined ? null : <span className={styles.time}>{`${line.time} `}</span>}
      <span className={styles.text}>
        {line.source === undefined ? null : (
          <span className={styles.source}>{`${line.source} `}</span>
        )}
        {/* An element of its own, as every framework's LogView draws it, so
            no template adds a space before the line. */}
        <span>{line.text}</span>
      </span>
    </li>
  )
})

export function LogView({
  label,
  lines,
  streaming = false,
  wrap = true,
  messages = DEFAULT_MESSAGES,
}: LogViewProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const [detached, setDetached] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // The engine's follow, ChatThread's rule: while the reader is at the end, a
  // line that arrives keeps the end in view. A reader who scrolls up stops it,
  // and nothing moves until they press the jump control. The list is always in
  // the tree, so the follow is attached once.
  useEffect(
    () =>
      followEnd(viewport.current, list.current, (state) => {
        setDetached(state.detached)
        setOverflowing(state.overflowing)
      }),
    [],
  )

  return (
    <div
      className={styles.root}
      data-state={detached ? 'detached' : undefined}
      data-streaming={streaming ? '' : undefined}
      data-wrap={wrap ? '' : undefined}
      {...memberAttr('LogView')}
    >
      <div
        ref={viewport}
        className={styles.viewport}
        // The part hook the conformance runner locates the log by, so its role
        // and attributes are checked rather than used to find it.
        data-log-view-part="viewport"
        // A log that announces nothing on its own. Lines can arrive faster than
        // speech, and a polite queue that falls behind delays every other
        // announcement on the page, so the reader reads the log at their own
        // pace and the application announces what a stream came to.
        role="log"
        aria-label={label}
        aria-live="off"
        aria-busy={streaming ? true : undefined}
        // CodeBlock's rule: a scrollable region must be reachable by keyboard,
        // so it is a tab stop only while it can scroll.
        tabIndex={overflowing ? 0 : undefined}
      >
        {/* A list, as Diff's lines are: a line is one statement, and a list
            reads it in one stop and says how many there are. The role is
            written out because a list without markers loses it in WebKit. */}
        <ol ref={list} className={styles.lines} role="list">
          {lines.map((line) => (
            <Line
              key={line.id}
              line={line}
              word={line.level === undefined ? undefined : messages[line.level]}
            />
          ))}
          {/* Where the next line will appear, while one is coming:
              StreamingText's steady caret. It is inside the list, so the
              follow sees it arrive, and hidden from assistive technology,
              which reads `aria-busy` instead and counts only the lines. */}
          {streaming ? (
            <li className={styles.end} aria-hidden="true">
              <span className={styles.caret} />
            </li>
          ) : null}
        </ol>
      </div>

      {/* ChatThread's jump control: always in the tree, shown by the reader's
          own state (`data-state="detached"`), and hidden with `display: none`
          otherwise, which takes it out of the tab order too. It sits on a
          raised backing, because an outline Button is transparent and the
          control floats over lines of text. */}
      <div className={styles.jump}>
        <span className={styles.backing}>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            icon="down"
            label={messages.jumpToLatest}
            onClick={() => jumpToEnd(viewport.current)}
          />
        </span>
      </div>
    </div>
  )
}
