import { memberAttr } from '@polymorph/react'

import { Skeleton } from '../structure/Skeleton'
import styles from '@polymorph/recipes/ai/streaming-text.module.css'

/**
 * Plain text still arriving, with a steady caret (`design/components/streaming-text.md`).
 * It shows an unfinished model reply: the words received so far and a mark
 * where the next one will appear.
 *
 * StreamingText is a relative of Text for the case Text cannot handle: a
 * paragraph that has not ended yet. It is not Markdown. It keeps whitespace
 * and renders no structure, for a reply the app knows is prose (a one-line
 * answer, a status sentence, a transcript). Text that can contain a heading
 * or a fence belongs to Markdown. It is not Skeleton. A skeleton stands for
 * content whose shape is known and whose arrival is not. This is content
 * arriving in pieces, and it uses Skeleton's bar only while nothing has
 * arrived.
 *
 * The caret does not blink. A blink is an ambient loop with no pattern in the
 * motion catalogue (`design/motion/motion.md`). A steady mark signals "still
 * arriving" as well as a flashing one, without being the only moving thing on
 * the page while the reader reads. The growing text is the signal.
 *
 * No `'use client'` directive, because nothing here calls a hook or takes a
 * handler. ChatThread announces arrivals through a `log` region around every
 * turn, not this paragraph, so a reader hears a reply once instead of every
 * token twice.
 */

export type StreamingTextSize = 'sm' | 'md'

export interface StreamingTextProps {
  /** The text received so far, verbatim, with whitespace and line breaks kept as content. */
  children: string
  /** Whether more is coming, which shows the caret and sets `aria-busy` on the root. */
  streaming?: boolean
  /** The text step (Text's `sm` or `md`), for the same reason Text has two. */
  size?: StreamingTextSize
}

export function StreamingText({ children, streaming = false, size = 'md' }: StreamingTextProps) {
  // Nothing has arrived yet. The skeleton bar takes the place of the first
  // line, at exactly that step's line box (Skeleton's rule), so the page does
  // not shift when the first word replaces it.
  const pending = streaming && children === ''

  return (
    <div
      className={styles.root}
      data-size={size}
      data-state={streaming ? 'streaming' : undefined}
      data-pending={pending ? '' : undefined}
      aria-busy={streaming ? true : undefined}
      {...memberAttr('StreamingText')}
    >
      {pending ? (
        <Skeleton shape="text" textStep={size} width={9} />
      ) : (
        <p className={styles.text}>
          {children}
          {streaming ? <span className={styles.caret} aria-hidden="true" /> : null}
        </p>
      )}
    </div>
  )
}
