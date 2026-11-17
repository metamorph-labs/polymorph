'use client'

import {
  useState,
  type ChangeEvent,
  type CompositionEventHandler,
  type FocusEvent,
  type MouseEvent,
  type ReactEventHandler,
  type ReactNode,
  type Ref,
} from 'react'

import {
  agentFill,
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  type IconRole,
  memberAttr,
  useAgentMember,
  useControlRef,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/input.module.css'

/**
 * Single-line text entry (`design/components/input.md`).
 *
 * The visual states are on the *container*, while the focusable element is the native `<input>`
 * inside it. That is why the focus convention has a delegating selector
 * (`conventions/focus.module.css`): the ring must surround the box the user sees as the field, not
 * the transparent element that holds the caret.
 *
 * The same split is why `controlRef` exists (the control seam). A `ref` on this component would
 * point at the frame, but an application binding needs the control inside it, for example a
 * collaboration layer restoring a caret or a form library reading a selection. The member exposes
 * the node and reads nothing from it on the caller's behalf. It never moves or restores a
 * selection, never remounts the control on a controlled change, and passes composition events
 * through as the platform fires them.
 */

/** The types a single-line field may have. Dates belong to DatePicker. */
/**
 * `search` is in the list for SearchInput, which needs it for the `searchbox` role, not for the
 * native decoration. The native decoration is suppressed, because the vocabulary's clear button is
 * the only cancel control.
 *
 * `number` is included because numeric entry belongs to Input, not to a new member. The value
 * stays a string, as in the native input, and NumberInput is the field that parses numbers.
 */
export type InputType = 'text' | 'email' | 'password' | 'url' | 'tel' | 'search' | 'number'

export interface InputProps {
  size?: ControlSize
  /** Leading, decorative. */
  icon?: IconRole
  /** Shows a clear button while the field is non-empty. Clearing fires `onChange('')`. */
  clearable?: boolean
  /** The clear button's accessible name. Defaults to `Clear`. Localized hosts pass their own. */
  clearLabel?: string
  /** Slot for a vocabulary element, such as a Badge or a ghost icon Button. */
  trailing?: ReactNode
  invalid?: boolean
  disabled?: boolean
  readOnly?: boolean
  value?: string
  defaultValue?: string
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void
  /** For touched validation, where apps mark a field dirty on leave. Native passthrough. */
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void
  /**
   * The native `<input>` itself, for an application binding that must read or restore state only
   * the element has, such as a caret or a selection, without a `querySelector` into the frame.
   * Merged with the member's own ref, so both get the same node, and `null` on unmount. Accepts
   * callback and object refs.
   */
  controlRef?: Ref<HTMLInputElement>
  /**
   * Native passthrough: the selection moved (caret or range, by keyboard or pointer).
   * `selectionStart`, `selectionEnd` and `selectionDirection` are on `event.currentTarget`. The
   * member never moves the selection itself. Never fires for `email` or `number`, because the
   * platform gives those types no selection API.
   */
  onSelect?: ReactEventHandler<HTMLInputElement>
  /**
   * Native passthrough for IME composition start. Composition events arrive as the platform fires
   * them, never suppressed and never repeated as a second change, so a binding that must not
   * commit mid-composition can wait between the two.
   */
  onCompositionStart?: CompositionEventHandler<HTMLInputElement>
  /** IME composition end. `event.data` is the committed text. */
  onCompositionEnd?: CompositionEventHandler<HTMLInputElement>
  placeholder?: string
  type?: InputType
  /** `type="number"` only. Native passthrough, so the platform handles clamping and stepping. */
  min?: number
  max?: number
  step?: number
  /**
   * Static text inside the frame, such as a currency mark, a unit or a domain. Strings only,
   * because a node here would duplicate `trailing`. They are `aria-hidden` and not part of the
   * value, so a unit that matters belongs in the label or description. The affix is only its
   * visual form.
   */
  prefix?: string
  suffix?: string
  name?: string
  id?: string
  autoComplete?: string
  /**
   * The text is typed exactly: nothing corrects it, capitalises it or checks its spelling. For
   * text that must match letter for letter, such as a typed confirmation's phrase, because a
   * correction can change it while it is typed.
   */
  exact?: boolean
  maxLength?: number
  /**
   * Native passthrough, for surfaces that already moved the user (a dialog's first field). Never
   * use it to take focus when a page loads.
   */
  autoFocus?: boolean
  /** Set by FormField. Set it directly only when there is no visible label. */
  'aria-label'?: string
  /**
   * The id of a label elsewhere on the page, such as `SettingsRow`'s one label for a whole row.
   */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export function Input({
  size = 'md',
  icon,
  clearable = false,
  clearLabel = 'Clear',
  trailing,
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
  type = 'text',
  min,
  max,
  step,
  prefix,
  suffix,
  name,
  id,
  autoComplete,
  exact = false,
  maxLength,
  autoFocus = false,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: InputProps) {
  const [inputRef, attach] = useControlRef(controlRef)
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '')
  const current = value ?? uncontrolled
  const showClear = clearable && current !== '' && !disabled && !readOnly

  // An agent writes through the field as typing does (`agentFill`), so `handleChange` runs and
  // `onChange` is called in either form. A read-only field takes no typing, so it refuses both
  // actions, and a password field refuses `fill`: a person types a password.
  function writable(): HTMLInputElement | null {
    if (readOnly) throw new Error('The field is read-only.')
    return inputRef.current
  }
  useAgentMember({
    member: 'Input',
    element: () => inputRef.current,
    state: () => ({ value: current, disabled, invalid, readonly: readOnly }),
    actions: {
      fill: {
        argument: 'text',
        run: (text) => {
          if (type === 'password') throw new Error('A person types a password; an agent does not.')
          agentFill(writable(), text)
        },
      },
      clear: () => agentFill(writable(), ''),
    },
  })

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    setUncontrolled(next)
    onChange?.(next, event)
  }

  /**
   * Clearing goes through the DOM rather than around it. React's own value setter plus a bubbled
   * `input` event makes clearing and typing the *same* change path, so a controlled caller, an
   * uncontrolled caller and a form library all receive the event they already handle. Calling
   * `onChange('')` directly would need a SyntheticEvent that cannot be constructed.
   */
  function handleClear() {
    const input = inputRef.current
    if (!input) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
  }

  /** A click on the root focuses the field, except on parts that are controls themselves. */
  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea')) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  return (
    <div
      className={styles.field}
      onMouseDown={handleMouseDown}
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('readonly', readOnly)}
      {...memberAttr('Input')}
    >
      {icon !== undefined ? (
        <span className={styles.leading}>
          <Icon name={icon} size={size} />
        </span>
      ) : null}

      {/* Adornment strength, like the leading icon: beside the value, never competing with it,
          and not part of it. That is why a screen reader never announces the affix as part of the
          field. */}
      {prefix !== undefined ? (
        <span className={styles.affix} aria-hidden="true">
          {prefix}
        </span>
      ) : null}

      <input
        ref={attach}
        className={styles.input}
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        onBlur={onBlur}
        onFocus={onFocus}
        onSelect={onSelect}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        min={min}
        max={max}
        step={step}
        name={name}
        id={id}
        autoComplete={autoComplete}
        autoCorrect={exact ? 'off' : undefined}
        autoCapitalize={exact ? 'off' : undefined}
        spellCheck={exact ? false : undefined}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-required={required}
        aria-invalid={invalid ? true : undefined}
      />

      {suffix !== undefined ? (
        <span className={styles.affix} aria-hidden="true">
          {suffix}
        </span>
      ) : null}

      {showClear ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={clearLabel}
          onClick={handleClear}
        >
          <Icon name="clear" size={size} />
        </button>
      ) : null}

      {trailing !== undefined ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  )
}
