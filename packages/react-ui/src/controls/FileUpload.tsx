'use client'

import { useRef, useState, type DragEvent } from 'react'

import {
  type ControlKind,
  dataAttrs,
  type FileRejection,
  type FileRejectionReason,
  formatBytes,
  gateFiles,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import { Progress } from '../structure/Progress'
import { Button } from './Button'
import styles from '@polymorph/recipes/controls/file-upload.module.css'

/**
 * Dropzone plus a file list with upload states (`design/components/file-upload.md`).
 *
 * **The app owns the network.** This component renders the `files` and statuses it is given, and
 * requests actions through `onFilesAdd`, `onRemove` and `onRetry`. It never uploads, never retries
 * by itself, and never writes the text for a failure. This applies Combobox's async approach to
 * files: loading, done and error are display states of a *surface*, not fetch logic inside the
 * vocabulary.
 *
 * The zone is a real `<button>`. Drag-and-drop is an enhancement on top of it, never the only way
 * to add files. So `accept`, `multiple` and `maxSize` are enforced *here* rather than left to the
 * hidden picker. The picker applies only `accept` and `multiple`, a drop applies none, and the
 * rules must not depend on how the file was added.
 */

export type FileUploadStatus = 'uploading' | 'done' | 'error'

/**
 * The gate and the size format are the engine's (`gateFiles`, `formatBytes`), so every
 * framework's FileUpload refuses the same files for the same reasons and writes the same sizes.
 */
export { formatBytes, gateFiles }
export type { FileRejection, FileRejectionReason }

export interface FileUploadItem {
  id: string
  name: string
  /** Bytes. Rendered as the row's meta line when the app knows it. */
  size?: number
  status: FileUploadStatus
  /** 0–100, for `uploading`. */
  progress?: number
  /** The app's text for a failure. The vocabulary never writes one. */
  message?: string
}

export interface FileUploadProps {
  /** All control and announcement text, localized by the application. */
  messages?: {
    retry: string
    remove: (name: string) => string
    progress: (name: string) => string
    announcement: (file: FileUploadItem) => string
    formatSize: (bytes: number) => string
  }
  /** Always controlled, because the list and what happens to it are the app's state. */
  files?: FileUploadItem[]
  /** Only files that passed the gate (`accept`, `maxSize`, `multiple`), from the picker or a drop. */
  onFilesAdd: (files: File[]) => void
  /**
   * The counterpart of `onFilesAdd`: every file the gate refused, and why.
   *
   * `file-upload.md` requires a rejection to be "a *visible row*, never a silent drop", and rows
   * only come from `files`, which the app owns. So the component refuses the file and returns it
   * with a reason, and the app renders the refusal as an `error` row in its own words.
   *
   * **Required.** If it were optional, the spec's main guarantee would be optional too. A field
   * that sets `maxSize` and passes no `onReject` would silently drop an oversized file, with no
   * row, no message and no event, and the user would see a chosen file fail to appear. The
   * component cannot write the row itself, because the text and the list belong to the app, and
   * it must not hide the refusal. So the handler is required.
   */
  onReject: (rejections: FileRejection[]) => void
  onRemove: (id: string) => void
  /** When supplied, `error` rows offer a retry. */
  onRetry?: (id: string) => void
  /** The native syntax (`.pdf`, `image/*`, `application/pdf`), applied to drops too. */
  accept?: string
  /** When `false`, a drop of several files keeps the first that passes and refuses the rest. */
  multiple?: boolean
  /** The app's size ceiling, in bytes. A file over it never reaches `onFilesAdd`. */
  maxSize?: number
  title?: string
  hint?: string
  disabled?: boolean
  invalid?: boolean
  /** Set on the hidden picker, for a native form post. */
  name?: string
  /** Set by FormField. Set it directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * The announcement for a finished row. An upload in progress announces nothing, because a progress
 * bar that announced itself would interrupt everything else on the page. A failure includes the
 * app's message, never an explanation written here.
 */
function announcementFor(file: FileUploadItem): string {
  if (file.status === 'done') return `${file.name} uploaded`
  if (file.status === 'error') {
    return file.message === undefined
      ? `${file.name} failed`
      : `${file.name} failed: ${file.message}`
  }
  return ''
}

export function FileUpload({
  messages = {
    retry: 'Retry',
    remove: (name: string) => `Remove ${name}`,
    progress: (name: string) => `${name} upload progress`,
    announcement: announcementFor,
    formatSize: formatBytes,
  },
  files = [],
  onFilesAdd,
  onReject,
  onRemove,
  onRetry,
  accept,
  multiple = true,
  maxSize,
  title = 'Drop files or click to browse',
  hint,
  disabled = false,
  invalid = false,
  name,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: FileUploadProps) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const [dragover, setDragover] = useState(false)

  /** The picker and drops both end here, so the same three rules apply to both. */
  function add(list: FileList | null): void {
    if (disabled || list === null || list.length === 0) return
    const { accepted, rejected } = gateFiles(Array.from(list), { accept, multiple, maxSize })
    // No callback receives an empty list, because "some files arrived" and "none did" are
    // different events.
    if (accepted.length > 0) onFilesAdd(accepted)
    if (rejected.length > 0) onReject(rejected)
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>): void {
    event.preventDefault()
    setDragover(false)
    add(event.dataTransfer.files)
  }

  /*
   * An agent reads the files the application lists, and removes or retries one by its id, as
   * the row's Buttons ask the application. It adds no file: a file is on a person's disk, and
   * the zone opens the person's picker. The rows' Buttons are the member's own parts, so it
   * withholds them.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  const zoneRef = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'FileUpload',
    element: () => zoneRef.current,
    state: () => ({
      files: files.map((file) => ({ ...file })),
      rows: files.map((file) => ({ id: file.id, label: file.name })),
      disabled,
      invalid,
    }),
    actions: {
      remove: { argument: 'id', run: (id) => onRemove(id) },
      retry: {
        argument: 'id',
        run: (id) => {
          if (onRetry === undefined) throw new Error('The field offers no retry.')
          if (files.find((file) => file.id === id)?.status !== 'error') {
            throw new Error('Only a failed upload is retried.')
          }
          onRetry(id)
        },
      },
    },
    withholds: () => rootRef.current,
  })

  return (
    <div
      ref={rootRef}
      className={styles.root}
      // Mirrored from the zone so the root reports the field's state. Switch's row does the same
      // for the same reason.
      {...dataAttrs({ state: dragover ? 'dragover' : 'idle', disabled, invalid })}
      {...memberAttr('FileUpload')}
    >
      <button
        ref={zoneRef}
        type="button"
        className={styles.zone}
        onClick={() => pickerRef.current?.click()}
        onDragOver={(event) => {
          // Without this the browser navigates to the file instead of dropping it.
          event.preventDefault()
          if (!disabled) setDragover(true)
        }}
        onDragLeave={(event) => {
          // Moving between the zone's own children also fires `dragleave`. Only a pointer that has
          // actually left the zone ends the state.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragover(false)
        }}
        onDrop={handleDrop}
        disabled={disabled}
        {...dataAttrs({ state: dragover ? 'dragover' : 'idle', disabled, invalid })}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={required}
        aria-invalid={invalid ? true : undefined}
      >
        <Icon name="upload" size="lg" />
        <span className={styles.title}>{title}</span>
        {hint === undefined ? null : <span className={styles.hint}>{hint}</span>}
      </button>

      {/* The picker itself, opened by the zone. `display: none` keeps it out of the tab order
          and the accessibility tree, where the button already stands for it. A hidden input
          still posts its files with the form. */}
      <input
        ref={pickerRef}
        type="file"
        className={styles.picker}
        accept={accept}
        multiple={multiple}
        name={name}
        disabled={disabled}
        tabIndex={-1}
        onChange={(event) => {
          add(event.target.files)
          // Cleared so choosing the same file twice in a row is still a change.
          event.target.value = ''
        }}
      />

      {files.length === 0 ? null : (
        <ul className={styles.list}>
          <MotionPresence>
            {files.map((file) => (
              <MotionSurface
                key={file.id}
                as="li"
                binding="fileupload.row"
                layoutBinding="fileupload.reflow"
                className={styles.row}
                data-status={file.status}
              >
                <span className={styles.rowIcon}>
                  <Icon name="document" />
                </span>

                <span className={styles.details}>
                  <span className={styles.name}>{file.name}</span>
                  {file.size === undefined ? null : (
                    <span className={styles.meta}>{messages.formatSize(file.size)}</span>
                  )}
                  {file.status === 'error' && file.message !== undefined ? (
                    <span className={styles.message}>{file.message}</span>
                  ) : null}
                </span>

                {file.status === 'uploading' ? (
                  <span className={styles.trailing}>
                    <span className={styles.progress}>
                      <Progress value={file.progress ?? 0} label={messages.progress(file.name)} />
                    </span>
                    <span className={styles.percent}>{`${Math.round(file.progress ?? 0)}%`}</span>
                  </span>
                ) : null}

                {file.status === 'done' ? (
                  // Decorative, because the status is in `data-status` and the live region has
                  // already announced it.
                  <span className={styles.done}>
                    <Icon name="success" />
                  </span>
                ) : null}

                {file.status === 'error' && onRetry !== undefined ? (
                  <Button
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    iconOnly
                    icon="refresh"
                    label={messages.retry}
                    onClick={() => onRetry(file.id)}
                  />
                ) : null}

                {/* Shown for every status, because cancelling an upload in progress is the same
                    request as removing a finished one. */}
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  iconOnly
                  icon="close"
                  label={messages.remove(file.name)}
                  onClick={() => onRemove(file.id)}
                />
              </MotionSurface>
            ))}
          </MotionPresence>
        </ul>
      )}

      {/*
       * One region for the whole list, with one node per file inside it.
       *
       * This structure sets the announcement policy. A polite region announces when its contents
       * *change*, and a non-atomic region announces only the node that changed. So a finished
       * file produces one announcement, not the whole list again. A list that arrives already
       * finished announces nothing, because nothing changed after the region rendered. The content
       * is derived from `files` rather than stored, so there is no second copy of the state.
       */}
      <span className={styles.reader} aria-live="polite">
        {files.map((file) => (
          <span key={file.id}>{messages.announcement(file)}</span>
        ))}
      </span>
    </div>
  )
}

/**
 * Named by association. The zone is a button, and a `<label for>` pointing at it would compete
 * with the button's own accessible name. So FormField points its label at the zone with
 * `aria-labelledby` instead.
 */
FileUpload.controlKind = 'group' satisfies ControlKind
