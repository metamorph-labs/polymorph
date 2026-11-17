'use client'

import { Children, useEffect, useRef, useState, type ReactNode } from 'react'

import { followEnd, jumpToEnd, memberAttr, useAgentMember } from '@polymorph/react'

import { Button } from '../controls/Button'
import styles from '@polymorph/recipes/ai/chat-thread.module.css'

/**
 * A scrolling conversation log that follows the newest turn
 * (`design/components/chat-thread.md`). It shows every turn in a scroll
 * region, follows the newest one while a reply arrives, and lets the reader
 * stop and resume following.
 *
 * ChatThread is the only member of the tier that owns a scroll region. It is
 * allowed for the same reason the scroll map in `scroll-area.md` gives Table
 * and CodeBlock theirs: a conversation outgrows any box, and it must be read
 * from the bottom while it grows. The page cannot be the scroller, because a
 * composer pinned under the page scroller would scroll away. So the thread
 * scrolls inside itself and the composer stays in place (ConversationPage's
 * anatomy).
 *
 * **The reader controls following.** The thread follows the newest turn only
 * while the reader is at the bottom. When they scroll up to re-read, it stops
 * moving and offers one control, jump to latest, to return. A thread that
 * pulled the reader down on every token would be unreadable. This is also why
 * this member does the announcing: one `log` region around every turn, with
 * additions only, so a reply is announced once when it appears and not on
 * every token.
 *
 * The app writes the empty state (Timeline's rule). `empty` is shown when
 * there are no turns. It is an EmptyState or a Hero with the app's own text,
 * never text this member writes.
 */

export interface ChatThreadMessages {
  /** The label of the button that scrolls to the newest turn. */
  jumpToLatest: string
}

export interface ChatThreadProps {
  /** The turns, as ChatMessages in order. */
  children?: ReactNode
  /** The log's accessible name, such as "Conversation" in the app's language. */
  label: string
  /** Shown in place of the turns while there are none, such as an EmptyState or a Hero. */
  empty?: ReactNode
  /** Whether a reply is arriving, which sets `aria-busy` on the log. */
  streaming?: boolean
  /** The thread's only built-in text (generic English default), which localized hosts replace. */
  messages?: ChatThreadMessages
}

export function ChatThread({
  children,
  label,
  empty,
  streaming = false,
  messages = { jumpToLatest: 'Jump to latest' },
}: ChatThreadProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [detached, setDetached] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // `toArray`, not `count`, because `count` counts a conditional turn that is
  // `null` in this render. A thread holding one `null` is empty.
  const noTurns = Children.toArray(children).length === 0

  /**
   * Following is the engine's `followEnd`, which LogView follows by too. While
   * the reader is at the bottom, a turn that grows or arrives keeps the bottom
   * in view. A reader who scrolls up stops following, and nothing moves until
   * they press the jump control.
   *
   * It runs again when the column mounts. A thread that starts empty has no
   * column to observe, and following must begin with the first turn.
   */
  useEffect(
    () =>
      followEnd(viewport.current, list.current, (state) => {
        setDetached(state.detached)
        setOverflowing(state.overflowing)
      }),
    [noTurns],
  )

  function jump() {
    jumpToEnd(viewport.current)
  }

  // An agent reads whether a reply is arriving and finds the turns within the log. The jump
  // control moves the person's reading position, which an agent has no use for, so it is
  // withheld: it stays in the tree while hidden, where an agent would find it.
  const jumpRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'ChatThread',
    element: () => viewport.current,
    state: () => ({ streaming }),
    actions: {},
    withholds: () => jumpRef.current,
  })

  return (
    <div
      className={styles.root}
      data-state={detached ? 'detached' : undefined}
      data-streaming={streaming ? '' : undefined}
      {...memberAttr('ChatThread')}
    >
      <div
        ref={viewport}
        className={styles.viewport}
        // The part hook the conformance runner locates the log by, so its role
        // and attributes are checked rather than used to find it.
        data-chat-thread-part="viewport"
        // A log, so additions are announced. Only additions, so a turn that
        // grows token by token is announced once, when it appears, and the
        // reader reads the rest at their own pace. Busy while a reply is
        // arriving, which tells the reader it is not finished.
        role="log"
        aria-label={label}
        aria-relevant="additions"
        aria-busy={streaming ? true : undefined}
        // CodeBlock's rule: a scrollable region must be reachable by keyboard,
        // so it is a tab stop only while it can scroll.
        tabIndex={overflowing ? 0 : undefined}
      >
        {noTurns ? (
          <div className={styles.empty}>{empty}</div>
        ) : (
          <div ref={list} className={styles.list}>
            {children}
          </div>
        )}
      </div>

      {/* The jump control, shown only when useful, because a reader at the
          bottom has nowhere to jump. It is always in the tree. The stylesheet
          shows it on the reader's state (`data-state="detached"`), so the
          recipe keys on that state. It is hidden with `display: none`, which
          removes the button from the tab order and the accessibility tree
          together. It floats over the bottom of the thread, where the newest
          turn would be. */}
      <div ref={jumpRef} className={styles.jump}>
        <Button
          variant="outline"
          tone="neutral"
          size="sm"
          icon="down"
          label={messages.jumpToLatest}
          onClick={jump}
        />
      </div>
    </div>
  )
}
