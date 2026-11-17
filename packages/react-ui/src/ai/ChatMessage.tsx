import type { ReactNode } from 'react'

import { Icon, memberAttr } from '@polymorph/react'

import { Avatar } from '../structure/Avatar'
import styles from '@polymorph/recipes/ai/chat-message.module.css'

/**
 * One turn of a conversation (`design/components/chat-message.md`). It shows
 * the speaker, the time, the content and the outcome.
 *
 * `role` picks one of two layouts, and the caller cannot override it. The
 * reader's turn is a bubble at the end edge, because it is short and visibly
 * something they sent. The model's turn is full-width prose with a mark at the
 * start edge. It is the page's content, not a speech balloon, and a Markdown
 * reply with a heading and a table does not belong in a rounded bubble. A
 * system notice is neither. It is a centred line in the muted step, for
 * messages about the thread itself.
 *
 * The caller composes the body. Markdown, StreamingText, a ToolCall, an
 * ApprovalCard, a row of AttachmentChips or a SourceList go in `children`, in
 * reading order, and the message decides only the frame. `actions` is the
 * hover row (copy, regenerate, rate). It appears on hover and on focus, always
 * on touch, and is never the only way to do anything: a reader who cannot
 * hover reaches the same buttons in the tab order.
 *
 * No `'use client'` directive, because nothing here calls a hook or takes a
 * handler. The actions are the app's Buttons, and ChatThread owns the
 * announcements.
 */

export type ChatRole = 'user' | 'assistant' | 'system'
export type ChatMessageStatus = 'streaming' | 'complete' | 'stopped' | 'error'

export interface ChatMessageProps {
  /** The speaker's role, which sets the layout and is the only frame choice the caller makes. */
  role: ChatRole
  /** The speaker's name, used as the article's accessible name and first in the meta row. */
  author: string
  /** The speaker's picture, replaced by the reader's initials or the model's mark when absent. */
  avatar?: string
  /** The time, preformatted by the app (Timeline's rule for time). */
  time?: string
  /** The turn's status, where `complete` is the rest state and sets no attribute. */
  status?: ChatMessageStatus
  /** The app's text for `stopped` or `error`, such as "Stopped" or "Something went wrong". */
  statusMessage?: string
  /** The hover row of `ghost/neutral/sm iconOnly` Buttons, such as copy, regenerate and helpful. */
  actions?: ReactNode
  /** The turn's content, in reading order. */
  children: ReactNode
}

export function ChatMessage({
  role,
  author,
  avatar,
  time,
  status = 'complete',
  statusMessage,
  actions,
  children,
}: ChatMessageProps) {
  const settled = status === 'stopped' || status === 'error'

  return (
    <article
      className={styles.message}
      data-role={role}
      // A complete turn is the rest state and has no `data-status`.
      data-status={status === 'complete' ? undefined : status}
      aria-label={author}
      aria-busy={status === 'streaming' ? true : undefined}
      {...memberAttr('ChatMessage')}
    >
      {role === 'system' ? null : (
        <span className={styles.mark}>
          {role === 'assistant' && avatar === undefined ? (
            // The model's mark: the `model` icon in an accent circle. It is
            // decorative, because `author` names the article.
            <span className={styles.model} aria-hidden="true">
              <Icon name="model" size="sm" />
            </span>
          ) : (
            <Avatar name={author} src={avatar} size="md" />
          )}
        </span>
      )}

      <div className={styles.body}>
        {role === 'system' ? null : (
          <div className={styles.meta}>
            <span className={styles.author}>{author}</span>
            {time === undefined ? null : <span className={styles.time}>{time}</span>}
          </div>
        )}

        <div className={styles.content}>{children}</div>

        {settled && statusMessage !== undefined ? (
          // Text, not only a colour, with a glyph that matches it.
          <p className={styles.notice}>
            <span className={styles.noticeGlyph}>
              <Icon name={status === 'error' ? 'error' : 'warning'} size="sm" />
            </span>
            {statusMessage}
          </p>
        ) : null}

        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
      </div>
    </article>
  )
}
