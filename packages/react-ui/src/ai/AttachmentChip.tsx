'use client'

import { useRef } from 'react'

import { formatBytes, Icon, type IconRole, memberAttr, useAgentMember } from '@polymorph/react'

import { Button } from '../controls/Button'
import { Link } from '../controls/Link'
import { Spinner } from '../structure/Spinner'
import styles from '@polymorph/recipes/ai/attachment-chip.module.css'

/**
 * A file attached to a prompt, shown as a chip
 * (`design/components/attachment-chip.md`). It appears in the composer, where
 * it can still be removed, and in the sent message, where it cannot.
 *
 * AttachmentChip is FileUpload's row at TagInput's scale. FileUpload's row is a
 * list line with a progress bar and a retry. A chip is a compact object in a
 * row of chips under a prompt, where a progress bar would be wider than the
 * name. It is not a Badge, because a badge is a read-only category. A chip is
 * something the reader added, with a name, a size and, in the composer, a
 * remove button. It is not TagInput's chip either. A tag is a word the reader
 * typed, an attachment is a file they chose, and the two are removed by
 * different gestures.
 *
 * The app owns the network. The chip renders `status` and `message` as given
 * and requests removal through `onRemove`. It never uploads and never writes
 * its own failure text.
 */

export type AttachmentStatus = 'uploading' | 'done' | 'error'

export interface AttachmentChipProps {
  /** The file's name, ellipsed when the row is narrow. */
  name: string
  /** The size in bytes, formatted by the engine's `formatBytes`, as FileUpload's rows are, so sizes match in both places. */
  size?: number
  /** The upload status, where `done` is the rest state. */
  status?: AttachmentStatus
  /** The app's text for a failure, which the chip never writes itself. */
  message?: string
  /** The file's URL, which makes the name a link that opens in a new tab (Link's `external`). */
  href?: string
  /** Shows the remove button when supplied, and is omitted in a sent message, where removal is over. */
  onRemove?: () => void
  /** The remove button's accessible name (default `Remove {name}`), which apps pass to localize. */
  removeLabel?: string
  /** The status announced while the file uploads (default `{name}: uploading`), which apps pass to localize. */
  uploadingLabel?: string
  /** The leading mark, `document` by default, or `table` or `browser` when the app knows the kind. */
  icon?: IconRole
}

export function AttachmentChip({
  name,
  size,
  status = 'done',
  message,
  href,
  onRemove,
  removeLabel,
  uploadingLabel,
  icon = 'document',
}: AttachmentChipProps) {
  // An agent reads the file's name and status and removes the chip as its remove control does.
  // The chip withholds its own parts, the remove Button and the Link its name becomes. A chip
  // with no `onRemove` is a sent file's record, which has nothing to remove.
  const chipRef = useRef<HTMLSpanElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  useAgentMember({
    member: 'AttachmentChip',
    element: () => nameRef.current,
    state: () => ({ name, status }),
    actions: {
      remove: () => {
        if (onRemove === undefined) {
          throw new Error('The chip records a sent file and has no remove control.')
        }
        onRemove()
      },
    },
    withholds: () => chipRef.current,
  })

  return (
    <span
      ref={chipRef}
      className={styles.chip}
      data-status={status}
      {...memberAttr('AttachmentChip')}
    >
      <span className={styles.mark}>
        {status === 'uploading' ? (
          // The spinner's accessible name is the chip's full status text.
          // Swapping the glyph is the visual equivalent.
          <Spinner size="sm" label={uploadingLabel ?? `${name}: uploading`} />
        ) : status === 'error' ? (
          <Icon name="error" size="sm" />
        ) : (
          <Icon name={icon} size="sm" />
        )}
      </span>

      <span className={styles.body}>
        {href === undefined ? (
          <span ref={nameRef} className={styles.name}>
            {name}
          </span>
        ) : (
          <span ref={nameRef} className={styles.name}>
            <Link href={href} external>
              {name}
            </Link>
          </span>
        )}
        {size !== undefined && status !== 'error' ? (
          <span className={styles.meta}>{formatBytes(size)}</span>
        ) : null}
        {status === 'error' && message !== undefined ? (
          <span className={styles.message}>{message}</span>
        ) : null}
      </span>

      {onRemove === undefined ? null : (
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconOnly
          icon="close"
          label={removeLabel ?? `Remove ${name}`}
          onClick={onRemove}
        />
      )}
    </span>
  )
}
