'use client'

import { useRef, useState } from 'react'

import { Kbd } from '../structure/Kbd'
import { Input } from './Input'
import styles from '@polymorph/recipes/controls/search-input.module.css'
import { agentFill, type ControlSize, memberAttr, useAgentMember } from '@polymorph/react'

/**
 * An Input preset for searching (`design/components/search-input.md`).
 *
 * Every search box in the product is the same. The `search` glyph and `clearable` are
 * set here and not exposed, so screens do not decide whether a search box is clearable.
 *
 * There is no debounce. When to filter is product logic: a local array can filter on
 * every keystroke, and a server-backed search should not. A component that decided this
 * would be choosing latency for screens it knows nothing about.
 */

export interface SearchInputProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  size?: ControlSize
  disabled?: boolean
  /**
   * A hint such as `⌘K`. Display only. Menu's `kbd` rule applies here too, and the
   * vocabulary never binds a global shortcut.
   */
  shortcut?: string
  /** The clear button's accessible name, passed to Input. Defaults to `Clear`. */
  clearLabel?: string
  /** Required unless a FormField supplies a label. Search boxes rarely have visible labels. */
  'aria-label'?: string
  /**
   * Names the field from a label elsewhere on the page, such as `SettingsRow`'s row label,
   * which is one label for a whole row rather than one per control.
   */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  id?: string
  name?: string
}

export function SearchInput({
  value,
  defaultValue,
  onChange,
  placeholder = 'Search…',
  size = 'md',
  disabled = false,
  shortcut,
  clearLabel,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  id,
  name,
}: SearchInputProps) {
  const [focused, setFocused] = useState(false)
  const [mirror, setMirror] = useState(defaultValue ?? '')
  const current = value ?? mirror

  // The hint gives way to the clear button instead of sharing the same space. Once the
  // field has a value, clearing it is more useful than a reminder of the shortcut.
  const showShortcut = shortcut !== undefined && current === '' && !focused && !disabled

  // One search box is one member: this one registers and withholds the Input it draws. An
  // agent writes through the field as typing does (`agentFill`), so the Input's change path
  // runs and `onChange` is called in either form.
  const rootRef = useRef<HTMLSpanElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  useAgentMember({
    member: 'SearchInput',
    element: () => fieldRef.current,
    state: () => ({ value: current, disabled }),
    actions: {
      fill: { argument: 'text', run: (text) => agentFill(fieldRef.current, text) },
      clear: () => agentFill(fieldRef.current, ''),
    },
    withholds: () => rootRef.current,
  })

  return (
    <span
      ref={rootRef}
      className={styles.search}
      data-shortcut={showShortcut ? '' : undefined}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      {...memberAttr('SearchInput')}
    >
      <Input
        type="search"
        icon="search"
        clearable
        controlRef={fieldRef}
        clearLabel={clearLabel}
        size={size}
        disabled={disabled}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onChange={(next) => {
          setMirror(next)
          onChange?.(next)
        }}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        id={id}
        name={name}
        trailing={
          showShortcut ? (
            // Decorative. If the app binds the shortcut, the app's own help announces it.
            <span className={styles.hint} aria-hidden="true">
              <Kbd>{shortcut}</Kbd>
            </span>
          ) : undefined
        }
      />
    </span>
  )
}
