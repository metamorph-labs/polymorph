'use client'

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'

import {
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/inline-edit.module.css'
import { Button } from './Button'
import { Input } from './Input'

/**
 * A value shown as text, edited in place (`design/components/inline-edit.md`).
 *
 * The text becomes a field where it stands, and goes back to text when the reader saves or
 * cancels. It is not a form: a change that needs a second field or a confirmation goes in a
 * Dialog. The member composes Input and three Buttons and owns what an application cannot do with
 * them: focus into the field and back to the edit control, Enter and Escape, the save in flight,
 * and the error.
 *
 * Leaving the field neither saves nor cancels. A save on leaving sends a request the reader did not
 * ask for, and a cancel on leaving loses what they typed.
 *
 * The application holds a save that waits for a server: it holds `editing`, shows the wait with
 * `pending`, and closes the field when the save succeeds. A handler cannot hand a promise back to
 * an Angular member, so `pending` is a prop in every framework.
 */

/**
 * The strings the member says for itself, localized by passing them (WCAG 3.1.2). Pass every key,
 * so one member never mixes two languages.
 */
export interface InlineEditMessages {
  /** The edit control's accessible name, made from the field's label. */
  edit: (label: string) => string
  /** The save control's accessible name. */
  save: string
  /** The cancel control's accessible name. */
  cancel: string
}

const DEFAULT_MESSAGES: InlineEditMessages = {
  edit: (label) => `Edit ${label}`,
  save: 'Save',
  cancel: 'Cancel',
}

export interface InlineEditProps {
  /** The saved value, drawn as text. The app owns it, so after a save it passes the new value. */
  value: string
  /**
   * The reader saved a changed text, reported as typed. An uncontrolled field closes at once. A
   * controlled one (`editing`) stays open until the app closes it. Not called for an unchanged text.
   */
  onCommit: (value: string) => void
  /** Names the field ("Project name") and, through `messages.edit`, the edit control. */
  label: string
  /** Controlled: whether the field is open. The app closes it once a save succeeds. */
  editing?: boolean
  /** Uncontrolled: whether the field is open when the member mounts. It takes no focus then. */
  defaultEditing?: boolean
  /** The reader opened the field, cancelled, or saved an unchanged text. */
  onEditingChange?: (editing: boolean) => void
  /** A save is in flight: the field is read-only, save is busy and cancel is disabled. */
  pending?: boolean
  /** Drawn, muted, in place of an empty value, and the empty field's placeholder. */
  placeholder?: string
  /** The app's message for a failed save, drawn under the field while it is open. */
  error?: string
  /** A blank text cannot be saved: the save control is disabled and Enter does nothing. */
  required?: boolean
  maxLength?: number
  /** The edit control is disabled. The value stays as it is. */
  disabled?: boolean
  size?: ControlSize
  /**
   * Another element beside the member draws the value, as a page's `<h1>` does: the member draws
   * its edit control and its field, and the value describes the edit control without being drawn.
   * A page's `titleEdit` sets it.
   */
  valueHidden?: boolean
  /** Omit for the English defaults; localized hosts pass their own. */
  messages?: InlineEditMessages
  /** The id of a label elsewhere that names the field, as SettingsRow's row label does. */
  'aria-labelledby'?: string
  /** The id of a description of the field and the edit control, as SettingsRow's. */
  'aria-describedby'?: string
}

export function InlineEdit({
  value,
  onCommit,
  label,
  editing,
  defaultEditing = false,
  onEditingChange,
  pending = false,
  placeholder,
  error,
  required = false,
  maxLength,
  disabled = false,
  size = 'md',
  valueHidden = false,
  messages = DEFAULT_MESSAGES,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
}: InlineEditProps) {
  const uid = useId()
  const valueId = `${uid}-value`
  const errorId = `${uid}-error`

  const [mirror, setMirror] = useState(defaultEditing)
  const open = editing ?? mirror
  const [draft, setDraft] = useState(value)

  // Each opening starts from the value, however the field was opened. The draft is made again in
  // the render that opens the field, so its first frame never shows the last opening's text.
  const [openedFor, setOpenedFor] = useState(open)
  if (open !== openedFor) {
    setOpenedFor(open)
    if (open) setDraft(value)
  }

  const root = useRef<HTMLDivElement>(null)
  // Whether focus was last inside the member. Focus that leaves with a removed element sends no
  // event to another element, so the flag stays set and the edit control takes focus back.
  const within = useRef(false)
  // The mode and the wait the effects below last acted on. A mount is no change, so a member that
  // mounts open takes no focus, and StrictMode's second run of an effect changes nothing.
  const shown = useRef(open)
  const waited = useRef(pending)

  const refused = required && draft.trim() === ''
  const invalid = open && error !== undefined && error !== ''

  const setOpen = (next: boolean) => {
    setMirror(next)
    onEditingChange?.(next)
  }

  function commit() {
    if (pending || refused) return
    if (draft === value) {
      setOpen(false)
      return
    }
    onCommit(draft)
    // A controlled field is the app's to close, once its save has succeeded.
    if (editing === undefined) setOpen(false)
  }

  function cancel() {
    if (pending) return
    setOpen(false)
  }

  /*
   * One value is one member: this one registers and withholds the Input and the Buttons it
   * draws. Its element is the control a person reaches, the edit control or the open field.
   * An agent's save writes the text into the field and saves it by the rules a person's save
   * keeps, and refuses what a person cannot do: a save from the closed form, a blank required
   * text, and a save or a cancel while a save is in flight.
   */
  useAgentMember({
    member: 'InlineEdit',
    element: () => root.current?.querySelector('input') ?? root.current?.querySelector('button'),
    state: () => ({
      value,
      editing: open,
      pending,
      error: invalid ? (error ?? '') : '',
      disabled,
    }),
    actions: {
      edit: () => {
        if (!open) setOpen(true)
      },
      save: {
        argument: 'text',
        run: (text) => {
          if (!open) throw new Error('The field is closed: edit opens it.')
          if (pending) throw new Error('A save is in flight.')
          if (required && text.trim() === '') throw new Error('The field is required.')
          setDraft(text)
          if (text === value) {
            setOpen(false)
            return
          }
          onCommit(text)
          if (editing === undefined) setOpen(false)
        },
      },
      cancel: () => {
        if (pending) throw new Error('A save is in flight.')
        if (open) setOpen(false)
      },
    },
    withholds: () => root.current,
  })

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    // Enter on a Button presses it. Enter that ends an IME composition is the composition's.
    if (
      event.key === 'Enter' &&
      event.target instanceof HTMLInputElement &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      commit()
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && !event.currentTarget.contains(next)) within.current = false
  }

  // Opening puts focus in the field with all of its text selected; closing puts it back on the
  // edit control when it was in the member.
  useEffect(() => {
    if (shown.current === open) return
    shown.current = open
    const node = root.current
    if (node === null) return
    if (open) {
      const input = node.querySelector('input')
      input?.focus()
      input?.select()
    } else if (within.current) {
      node.querySelector('button')?.focus()
    }
  }, [open])

  // A save that ends with the field still open has failed, so focus goes to the field, where the
  // reader corrects the text beside the error.
  useEffect(() => {
    if (waited.current === pending) return
    waited.current = pending
    if (pending || !open || !within.current) return
    root.current?.querySelector('input')?.focus()
  }, [pending, open])

  const fieldDescribedBy =
    [invalid ? errorId : undefined, describedBy].filter((id) => id !== undefined).join(' ') ||
    undefined

  return (
    <div
      ref={root}
      className={styles.root}
      onFocus={() => {
        within.current = true
      }}
      onBlur={handleBlur}
      {...dataAttrs({ size, disabled })}
      {...dataFlag('editing', open)}
      {...memberAttr('InlineEdit')}
    >
      {open ? (
        <div className={styles.panel} data-inline-edit-part="panel" onKeyDown={handleKeyDown}>
          <div className={styles.row}>
            <div className={styles.field}>
              <Input
                size={size}
                value={draft}
                onChange={setDraft}
                placeholder={placeholder}
                maxLength={maxLength}
                readOnly={pending}
                disabled={disabled}
                invalid={invalid}
                aria-label={labelledBy === undefined ? label : undefined}
                aria-labelledby={labelledBy}
                aria-describedby={fieldDescribedBy}
                aria-required={required ? true : undefined}
              />
            </div>
            <Button
              variant="soft"
              tone="accent"
              size={size}
              iconOnly
              icon="confirm"
              label={messages.save}
              loading={pending}
              disabled={disabled || refused}
              onClick={commit}
            />
            <Button
              variant="ghost"
              tone="neutral"
              size={size}
              iconOnly
              icon="close"
              label={messages.cancel}
              disabled={disabled || pending}
              onClick={cancel}
            />
          </div>
          {/* Rendered empty with the row, so a message that arrives after a failed save is
              announced: focus stays in the field, where its description is not read again. */}
          <div aria-live="polite">
            {invalid ? (
              <p className={styles.error} id={errorId}>
                {/* Decorative, because `aria-invalid` and the message convey the state. */}
                <span className={styles.glyph}>
                  <Icon name="error" size="sm" />
                </span>
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* Hidden, it draws nothing and is not read where it stands, and it still describes the
              edit control, because a description reads a hidden element it names. */}
          <span
            className={styles.value}
            id={valueId}
            hidden={valueHidden || undefined}
            {...dataFlag('placeholder', value === '')}
          >
            {value === '' ? placeholder : value}
          </span>
          <Button
            variant="ghost"
            tone="neutral"
            size={size}
            iconOnly
            icon="edit"
            label={messages.edit(label)}
            disabled={disabled}
            aria-describedby={describedBy === undefined ? valueId : `${valueId} ${describedBy}`}
            onClick={() => setOpen(true)}
          />
        </>
      )}
    </div>
  )
}
