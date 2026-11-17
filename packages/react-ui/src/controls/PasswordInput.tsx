'use client'

import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'

import {
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { Input } from './Input'
import styles from '@polymorph/recipes/controls/password-input.module.css'

/**
 * An Input preset for passwords, with a reveal toggle (`design/components/password-input.md`).
 *
 * Every password field in the product masks, reveals and autofills the same way. Like
 * SearchInput, it renders an Input inside with these choices fixed.
 *
 * PasswordInput is not a complete form field. Label, description and error come from
 * FormField, as for Input, and this member is only the control row. It also contains no
 * built-in text: the toggle's name is a required prop, because "Show password" is app
 * text in the app's language.
 *
 * Visibility is internal state and cannot be controlled, on purpose. A controlled
 * `visible` prop would let apps put the reveal control somewhere else, and the toggle's
 * placement is what this member exists to fix.
 */

export interface PasswordInputProps {
  /** The toggle's accessible name ("Show password"). The member has no built-in text. */
  toggleLabel: string
  value?: string
  defaultValue?: string
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  size?: ControlSize
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  /**
   * Has a default, unlike Input's plain passthrough, because a password field without one
   * breaks password managers and WCAG 1.3.5. Sign-up flows pass `'new-password'`. Other
   * values belong to other members (one-time codes use OTPInput).
   */
  autoComplete?: 'current-password' | 'new-password'
  name?: string
  id?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * A revealed password is still a secret. While `type="text"` the value must never be
 * sent to a spellcheck service or autocorrected, so this member sets the three
 * attributes directly on its inner node. They are also set while masked: they have no
 * effect on `type="password"`, and setting them once means revealed text is never
 * rendered without them.
 */
function guardSecret(root: HTMLElement | null) {
  const input = root?.querySelector('input')
  if (!input) return
  input.spellcheck = false
  input.setAttribute('autocapitalize', 'off')
  input.setAttribute('autocorrect', 'off')
}

/** The caret position, saved across the render that toggling causes. */
interface Selection {
  start: number | null
  end: number | null
  direction: 'forward' | 'backward' | 'none'
}

export function PasswordInput({
  toggleLabel,
  value,
  defaultValue,
  onChange,
  placeholder,
  size = 'md',
  disabled = false,
  readOnly = false,
  invalid = false,
  autoComplete = 'current-password',
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false)
  const frame = useRef<HTMLSpanElement>(null)
  const held = useRef<Selection | null>(null)

  // Before paint, on mount. React does not manage these attributes, so no later render
  // removes them.
  useLayoutEffect(() => guardSecret(frame.current), [])

  // After toggling. Changing a live input's `type` makes the browser move the selection
  // to the start, but the spec requires value, caret and selection to be kept. The
  // handler below saves the selection across the render. This effect restores it
  // twice, because browsers reset it at two different moments: synchronously with the
  // attribute change (restored here, before paint), and again at the next layout
  // (Chromium's timing, measured in this member's test). The animation-frame callback
  // runs before that frame's paint.
  useLayoutEffect(() => {
    const stored = held.current
    held.current = null
    if (stored === null || stored.start === null || stored.end === null) return
    const node = frame.current?.querySelector('input')
    if (!node) return
    const { start, end, direction } = stored
    const restore = () => node.setSelectionRange(start, end, direction)
    restore()
    const handle = requestAnimationFrame(restore)
    return () => cancelAnimationFrame(handle)
  })

  // The password is read from the field, in either form, and only so the bridge can keep it out
  // of every output: it is secret. No action writes it, and the toggle is not an agent's.
  useAgentMember({
    member: 'PasswordInput',
    element: () => frame.current?.querySelector('input'),
    state: () => ({
      value: frame.current?.querySelector('input')?.value ?? '',
      revealed,
      disabled,
      invalid,
      readonly: readOnly,
    }),
    actions: {},
    secret: ['value'],
  })

  function flip() {
    const input = frame.current?.querySelector('input')
    if (input) {
      held.current = {
        start: input.selectionStart,
        end: input.selectionEnd,
        direction: input.selectionDirection ?? 'none',
      }
    }
    setRevealed((current) => !current)
  }

  return (
    <span
      ref={frame}
      className={styles.password}
      // The member's own attributes, on the root (the spec's Attributes line). Input
      // keeps its own copies on the frame inside. The fixture checks them here, next to
      // `data-state`.
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('readonly', readOnly)}
      data-state={revealed ? 'visible' : 'hidden'}
      {...memberAttr('PasswordInput')}
    >
      <Input
        // Toggling never remounts the input. The same node's `type` changes in place, so
        // the value, caret, selection and the password manager's autocomplete wiring are
        // kept. This member exists to prevent the bug where a remount loses the password
        // on reveal.
        type={revealed ? 'text' : 'password'}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        readOnly={readOnly}
        invalid={invalid}
        autoComplete={autoComplete}
        name={name}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={required}
        trailing={
          <button
            type="button"
            className={styles.toggle}
            // Always rendered, even on an empty field. Unlike `clear`, revealing an
            // empty field makes sense, and a toggle that appears at the first keystroke
            // would shift the layout. A disabled field disables the toggle (the frame
            // keeps its shape). readOnly keeps it enabled, because revealing does not
            // edit, and a read-only generated password is exactly when reveal is needed.
            disabled={disabled}
            // A real toggle button: pressed means revealed, and the name stays the same.
            // Changing it to "Hide password" while `aria-pressed="true"` would announce
            // the state twice and make both harder to understand.
            aria-pressed={revealed}
            aria-label={toggleLabel}
            onClick={flip}
          >
            {/* `visible` while masked (the action is show), `hidden` while revealed (the
                action is mask). Decorative, because `toggleLabel` names the control and
                `aria-pressed` holds the state. */}
            <Icon name={revealed ? 'hidden' : 'visible'} size={size} />
          </button>
        }
      />
    </span>
  )
}
