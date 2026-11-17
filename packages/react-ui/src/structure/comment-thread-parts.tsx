'use client'

import { createContext, useContext, useId, type ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/comment-thread.module.css'

/**
 * CommentThread's root and its comment. The comment needs a browser's React:
 * it names its article with ids from `useId`, and it reads the thread's words
 * from a context. `CommentThread.tsx` is the member: it attaches the part to
 * the root in a module a server can evaluate.
 */

/** The words the member writes itself, for every comment in the thread. */
export interface CommentThreadMessages {
  /** Shown after the time of an edited comment. */
  edited: string
  /** The name of a comment's list of replies. */
  replies: string
}

const DEFAULT_MESSAGES: CommentThreadMessages = { edited: 'Edited', replies: 'Replies' }

/** The thread's words, read by every comment in it, at any level. */
const Messages = createContext<CommentThreadMessages>(DEFAULT_MESSAGES)

export interface CommentThreadProps {
  /** Names the list for a reader: "Comments", not "Thread". */
  label: string
  /** The words the member writes itself, for every comment in the thread. English by default. */
  messages?: CommentThreadMessages
  /** `CommentThread.Comment`s, in the order they are read. */
  children?: ReactNode
}

export function CommentThreadRoot({
  label,
  messages = DEFAULT_MESSAGES,
  children,
}: CommentThreadProps) {
  return (
    <Messages.Provider value={messages}>
      {/* The role is written because a browser drops a list's semantics when
          its markers are removed, and this list draws none. */}
      <ol className={styles.thread} role="list" aria-label={label} {...memberAttr('CommentThread')}>
        {children}
      </ol>
    </Messages.Provider>
  )
}

export interface CommentThreadCommentProps {
  /** The author's name, drawn first. With the time it names the comment's article. */
  author: string
  /** An Avatar with the author's name, drawn in a column one md Avatar wide. */
  avatar?: ReactNode
  /** When it was written: a RelativeTime, or text the app has formatted. */
  time?: ReactNode
  /** The comment was changed after it was posted: the head says so after the time. */
  edited?: boolean
  /** Labels after the head's words: Badges such as "Internal note" or "Resolved". */
  meta?: ReactNode
  /** The app's controls for this comment: ghost neutral sm Buttons, or a Menu. */
  actions?: ReactNode
  /** The replies, as `CommentThread.Comment`s, drawn indented under the comment. */
  replies?: ReactNode
  /** The body: Text, Markdown or the app's own nodes, and a row of AttachmentChips. */
  children?: ReactNode
}

export function CommentThreadComment({
  author,
  avatar,
  time,
  edited = false,
  meta,
  actions,
  replies,
  children,
}: CommentThreadCommentProps) {
  const messages = useContext(Messages)
  const id = useId()
  const authorId = `${id}-author`
  const timeId = `${id}-time`

  return (
    <li className={styles.comment}>
      {/* Named by the author and the time, so a reader moving by article hears
          who wrote it and when. */}
      <article
        className={styles.entry}
        aria-labelledby={time === undefined ? authorId : `${authorId} ${timeId}`}
      >
        {avatar === undefined ? null : <span className={styles.mark}>{avatar}</span>}
        <div className={styles.body}>
          <div className={styles.head}>
            <span className={styles.author} id={authorId}>
              {author}
            </span>
            {time === undefined ? null : (
              <span className={styles.time} id={timeId}>
                {time}
              </span>
            )}
            {edited ? <span className={styles.edited}>{messages.edited}</span> : null}
            {meta === undefined ? null : <span className={styles.meta}>{meta}</span>}
          </div>
          <div className={styles.content}>{children}</div>
          {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}
        </div>
      </article>
      {/* A second list inside the item, so a reply is reached as a reply. A
          reply's own replies nest here too, and the recipe draws them at the
          second level. */}
      {replies === undefined ? null : (
        <ol className={styles.replies} role="list" aria-label={messages.replies}>
          {replies}
        </ol>
      )}
    </li>
  )
}
