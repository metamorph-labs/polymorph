import { CommentThreadComment, CommentThreadRoot } from './comment-thread-parts'
import type { CommentThreadProps } from './comment-thread-parts'

/**
 * Comments on a record, with their replies (`design/components/comment-thread.md`).
 *
 * It is not ChatThread. A ChatThread is a log of the reader and the model that
 * scrolls inside itself, follows the newest turn and announces each turn. A
 * comment thread has many authors, sits in the page, is read from the top and
 * announces nothing. From the spec:
 *
 *  - **The body is the app's.** Mentions, links, attachments and an edit in
 *    place are the app's nodes in a comment's children. The member never
 *    parses them.
 *  - **Two levels.** A reply is a comment in its parent's `replies`. A comment
 *    nested deeper is drawn at the second level, and its markup still nests.
 *  - **Nothing is a live region.** A comment that arrives is the app's to
 *    announce.
 */

export type {
  CommentThreadCommentProps,
  CommentThreadMessages,
  CommentThreadProps,
} from './comment-thread-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read `CommentThread.Comment` from it. A client module's export reaches a
 * server component as a reference with no properties, so a part attached
 * there is `undefined` on a server. The root and the part are the client
 * module's own exports (`comment-thread-parts.tsx`), and this function only
 * renders the root.
 */
export function CommentThread(props: CommentThreadProps) {
  return <CommentThreadRoot {...props} />
}
CommentThread.Comment = CommentThreadComment
