'use client'

import {
  useCallback,
  useLayoutEffect,
  type ChangeEvent,
  type CompositionEventHandler,
  type FocusEvent,
  type ReactEventHandler,
  type Ref,
} from 'react'

import styles from '@polymorph/recipes/controls/textarea.module.css'
import { agentFill, fitTextarea, memberAttr, useAgentMember, useControlRef } from '@polymorph/react'

/**
 * Multi-line text entry (`design/components/textarea.md`).
 *
 * Input's design extended vertically, with nothing else new: the same container states,
 * focus ring and FormField wiring. It deliberately does not inherit Input's extras. There
 * are no `size` classes (height is `rows`, in line units, which is what a multi-line
 * field needs), no leading icon, no `clearable` and no trailing slot. A long value is
 * edited, not cleared.
 *
 * `autosize` is opt-in rather than the default, for the reason the spec gives: it is
 * behaviour, not a style change. A field that grows while typing moves everything below
 * it, so a form must ask for that.
 *
 * The measurement is the standard one. Height is reset to `auto` before reading
 * `scrollHeight`, otherwise the box could only grow. The detail is `rows`:
 * `min-block-size` still sets the minimum, so `rows` still decides the height and
 * autosize only adds to it.
 *
 * Unlike Input, this needs no separate styled container. Nothing is embedded in the
 * field, so the `<textarea>` can have the border itself.
 *
 * `controlRef` is Input's control seam, typed for the `<textarea>`. The autosizer's ref
 * and the caller's ref are merged, so a field that measures itself still gives the
 * caller the same node it measured, and reads nothing from it on the caller's behalf.
 */

export type TextareaResize = 'vertical' | 'none'

export interface TextareaProps {
  /** The height, in line units. */
  rows?: number
  /** Never horizontal, because column width belongs to the layout, not the user. */
  resize?: TextareaResize
  /**
   * Grows with its content. Opt-in, because a field that grows while typing moves
   * everything below it, and the form decides that, not the field. Implies
   * `resize: 'none'`, because a box that resizes itself and can also be dragged would
   * have two owners for one height.
   */
  autosize?: boolean
  invalid?: boolean
  disabled?: boolean
  readOnly?: boolean
  value?: string
  defaultValue?: string
  onChange?: (value: string, event: ChangeEvent<HTMLTextAreaElement>) => void
  /** For touched validation, as in Input: apps mark a field dirty when focus leaves. */
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void
  /**
   * The native `<textarea>`, like Input's `controlRef`, for an application binding that
   * must read or restore a caret or selection. Merged with the autosizer's ref, so both
   * get the same node, and `null` on unmount.
   */
  controlRef?: Ref<HTMLTextAreaElement>
  /**
   * Native passthrough. Fires when the caret or range moves, by keyboard or pointer.
   * `selectionStart`, `selectionEnd` and `selectionDirection` are on
   * `event.currentTarget`. The member never moves the selection itself.
   */
  onSelect?: ReactEventHandler<HTMLTextAreaElement>
  /**
   * Native passthrough for IME composition start. Composition events arrive as the
   * platform fires them, never suppressed and never repeated as a second change.
   */
  onCompositionStart?: CompositionEventHandler<HTMLTextAreaElement>
  /** Native passthrough for IME composition end. `event.data` is the committed text. */
  onCompositionEnd?: CompositionEventHandler<HTMLTextAreaElement>
  placeholder?: string
  name?: string
  id?: string
  maxLength?: number
  /**
   * Native passthrough, as in Input. For surfaces that have already moved the user,
   * such as a dialog's first field. Never use it to take focus when a page loads.
   */
  autoFocus?: boolean
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  /**
   * Names the field from a label elsewhere on the page, such as `SettingsRow`'s row label,
   * which is one label for a whole row rather than one per control.
   */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export function Textarea({
  rows = 4,
  autosize = false,
  resize = autosize ? 'none' : 'vertical',
  invalid = false,
  disabled = false,
  readOnly = false,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  controlRef,
  onSelect,
  onCompositionStart,
  onCompositionEnd,
  placeholder,
  name,
  id,
  maxLength,
  autoFocus = false,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: TextareaProps) {
  const [boxRef, attach] = useControlRef(controlRef)

  // The measurement is shared with the composer (`autosize.ts`). This member only
  // decides whether to run it.
  const fit = useCallback(() => {
    const box = boxRef.current
    if (!box || !autosize) return
    fitTextarea(box)
  }, [autosize, boxRef])

  // A layout effect, so the first paint already has the right height. Measuring after
  // paint would show one frame of a four-row box holding one line.
  useLayoutEffect(fit, [fit, value, defaultValue])

  // An agent writes through the field as typing does (`agentFill`), so the change handler
  // below runs, the box fits its text and `onChange` is called in either form. The value is
  // read from the field while the caller does not hold it, because the native field holds
  // it then. A read-only field takes no typing, so it refuses both actions.
  function writable(): HTMLTextAreaElement | null {
    if (readOnly) throw new Error('The field is read-only.')
    return boxRef.current
  }
  useAgentMember({
    member: 'Textarea',
    element: () => boxRef.current,
    state: () => ({
      value: value ?? boxRef.current?.value ?? defaultValue ?? '',
      disabled,
      invalid,
      readonly: readOnly,
    }),
    actions: {
      fill: { argument: 'text', run: (text) => agentFill(writable(), text) },
      clear: () => agentFill(writable(), ''),
    },
  })

  return (
    <textarea
      ref={attach}
      id={id}
      className={styles.textarea}
      rows={rows}
      value={value}
      defaultValue={defaultValue}
      onChange={(event) => {
        fit()
        onChange?.(event.target.value, event)
      }}
      onBlur={onBlur}
      onFocus={onFocus}
      onSelect={onSelect}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      placeholder={placeholder}
      name={name}
      maxLength={maxLength}
      autoFocus={autoFocus}
      disabled={disabled}
      readOnly={readOnly}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required={required}
      aria-invalid={invalid ? true : undefined}
      data-resize={resize}
      data-autosize={autosize ? '' : undefined}
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-readonly={readOnly ? '' : undefined}
      {...memberAttr('Textarea')}
    />
  )
}
