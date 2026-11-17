'use client'

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react'

import { type ControlKind, dataAttrs, dataFlag, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/otp-input.module.css'

/**
 * A verification-code field drawn as separate digit cells (`design/components/otp-input.md`).
 *
 * It is for the two-factor step: typically six cells and one code. It is built by hand
 * with no substrate. The published `@radix-ui/react-one-time-password-field` is pre-1.0
 * (0.1.16 when evaluated), which fails the substrates' stability bar
 * (`design/components/README-substrates.md`). That package would have to render the same
 * DOM as below anyway.
 *
 * It is not PasswordInput, because the code is never masked. The code is not secret from
 * the person typing it, it expires in minutes, and it exists only to be copied. Masking
 * would increase the copying errors this field exists to prevent. It is not Input
 * `type="number"`, because a code is a string of digits, not a quantity: there is no
 * stepping, no min/max, and leading zeros matter.
 *
 * **Single input.** One real `<input>` covers the group and is invisible. Each cell
 * draws one character of its value. This is the accessible structure: one value with one
 * name, one tab stop and one label, and screen readers announce the digits natively. Six
 * inputs would mean six tab stops and six labels announced during entry, with focus
 * jumping between them. The platform works the same way: `autoComplete="one-time-code"`
 * and WebOTP both write one value into one input, and FormField's `<label for>` has one
 * target. The caret stays at the end. Arrows, Home and End do nothing, because a code is
 * typed in order, not edited in the middle. Corrections use Backspace.
 */

export type OTPLength = 4 | 6

export interface OTPInputProps {
  /** The code length, 4 or 6, which are the lengths real code systems use. */
  length?: OTPLength
  /** Digits only. Every write path filters and truncates to `length`. */
  value?: string
  defaultValue?: string
  /** Never reports a non-digit. */
  onChange?: (value: string) => void
  /**
   * Fires once, after `onChange`, when the code becomes full. Apps that want to verify
   * without a Verify button submit from here.
   */
  onComplete?: (code: string) => void
  /** Usually set by FormField, for example for "That code didn't match". */
  invalid?: boolean
  disabled?: boolean
  /** Set directly on the real input, so no hidden input is needed. */
  name?: string
  id?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/** Every write path goes through this, so `onChange` only ever reports digits. */
function sanitize(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length)
}

export function OTPInput({
  length = 6,
  value,
  defaultValue,
  onChange,
  onComplete,
  invalid = false,
  disabled = false,
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: OTPInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uncontrolled, setUncontrolled] = useState(() => sanitize(defaultValue ?? '', length))
  const [focused, setFocused] = useState(false)
  const code = sanitize(value ?? uncontrolled, length)

  /**
   * The caret cell is at index `value.length`. When full it is the LAST cell, because a
   * focused control must show focus and the caret has nowhere further to go.
   */
  const caretIndex = code.length === length ? length - 1 : code.length

  // The code is read only so the bridge keeps it out of every output: it is secret, and no
  // action writes it, because a person types the code they were sent.
  useAgentMember({
    member: 'OTPInput',
    element: () => inputRef.current,
    state: () => ({ value: code, disabled, invalid }),
    actions: {},
    secret: ['value'],
  })

  function commit(next: string) {
    setUncontrolled(next)
    if (next !== code) onChange?.(next)
    // After `onChange`, only when the code becomes full, never on a re-render of a
    // field that was already full.
    if (next.length === length && code.length < length) onComplete?.(next)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    commit(sanitize(event.target.value, length))
  }

  /**
   * Paste is filtered to digits, truncated to `length`, and fills from the first cell,
   * replacing the existing value. A pasted code is complete, and pasting into the middle
   * is a mistake, not an intent.
   */
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    commit(sanitize(event.clipboardData.getData('text'), length))
  }

  /** Arrows and Home/End do nothing, because the caret stays at the end. */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
    }
  }

  /** A click anywhere puts the caret at the end, so every part of the group behaves the same. */
  function pinCaret(event: SyntheticEvent<HTMLInputElement>) {
    const node = event.currentTarget
    if (node.selectionStart !== code.length || node.selectionEnd !== code.length) {
      node.setSelectionRange(code.length, code.length)
    }
  }

  return (
    <div className={styles.root} {...dataAttrs({ invalid, disabled })} {...memberAttr('OTPInput')}>
      {/*
       * Real, invisible, and covering the group, with transparent text and caret. Never
       * `display: none`, because it must stay focusable and receive every pointer event.
       * `one-time-code` is all iOS autofill needs. Chromium's WebOTP also needs the app
       * to call `navigator.credentials.get({ otp })`. That is app code, outside the
       * vocabulary, and the single input lets it work without extra handling. A code
       * must never be autocorrected (PasswordInput's list).
       */}
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={code}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onSelect={pinCaret}
        onFocus={(event) => {
          setFocused(true)
          pinCaret(event)
        }}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        name={name}
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        maxLength={length}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={required}
        aria-invalid={invalid ? true : undefined}
      />

      {/* The visible cells: one drawn character per cell, presentational only. The
          input's value is the code, so nothing here needs announcing. The caret cell
          (`caretIndex` above) is marked only while the field has focus. */}
      {Array.from({ length }, (_, index) => {
        const digit = code[index]
        return (
          <span
            key={index}
            className={styles.cell}
            aria-hidden="true"
            {...dataFlag('filled', digit !== undefined)}
            {...dataFlag('caret', focused && index === caretIndex)}
          >
            {digit === undefined ? null : (
              <span key={`${index}-${digit}`} className={styles.digit}>
                {digit}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

OTPInput.controlKind = 'field' satisfies ControlKind
