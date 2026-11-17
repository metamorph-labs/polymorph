'use client'

import * as SwitchPrimitive from '@radix-ui/react-switch'
import { useRef, useState } from 'react'

import styles from '@polymorph/recipes/controls/switch.module.css'
import { type ControlKind, memberAttr, useAgentMember } from '@polymorph/react'

/**
 * Immediate on/off setting (`design/components/switch.md`). A choice that waits for
 * submission is a Checkbox plus a submit button. A Switch takes effect when toggled.
 *
 * `data-state` is `on|off` instead of Radix's `checked|unchecked`, because the CSS and
 * the tests read the vocabulary's attribute names (`design/components/README.md`). A
 * two-position thumb is a different concept from a check mark, and naming it as one
 * would spread into every selector.
 */

export interface SwitchProps {
  /**
   * Visible inline label. Omit it only when the context labels the switch, and then
   * `aria-label` is required.
   */
  label?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  name?: string
  value?: string
  id?: string
  'aria-label'?: string
  /**
   * Names the switch from a label elsewhere on the page, such as `SettingsRow`'s row
   * label, which is one label for a whole row rather than one per control.
   */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export function Switch({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  name,
  value,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: SwitchProps) {
  // The member holds the value, and Radix is always controlled by it: by `checked` when the
  // caller gives it, and by the member's own state when not, as Checkbox does. So one setter
  // changes the value in both forms, for a person's press through Radix and for an agent's
  // action, and the track and the row show the state with this vocabulary's values.
  const [own, setOwn] = useState(defaultChecked ?? false)
  const current = checked ?? own
  const state = current ? 'on' : 'off'
  const change = (next: boolean) => {
    if (next === current) return
    if (checked === undefined) setOwn(next)
    onCheckedChange?.(next)
  }

  const trackRef = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'Switch',
    element: () => trackRef.current,
    state: () => ({ checked: current, disabled }),
    actions: { check: () => change(true), uncheck: () => change(false) },
  })

  const track = (
    <SwitchPrimitive.Root
      ref={trackRef}
      id={id}
      className={styles.track}
      checked={current}
      defaultChecked={defaultChecked}
      onCheckedChange={change}
      disabled={disabled}
      name={name}
      value={value}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required={required}
      // Mirrored so the row label can render the marker. A row-labelled field has no
      // field-level label row, so FormField has nowhere to put the ` *`. Without this,
      // only column-labelled fields would show the marker.
      data-required={required ? '' : undefined}
      // Radix spreads the remaining props after its own attributes, so this value
      // reaches the DOM. Checked in `switch.test.tsx`.
      data-state={state}
      {...memberAttr('Switch')}
    >
      <SwitchPrimitive.Thumb className={styles.thumb} data-state={state} />
    </SwitchPrimitive.Root>
  )

  if (label === undefined) return track

  return (
    <label
      className={styles.row}
      data-state={state}
      data-disabled={disabled ? '' : undefined}
      data-required={required ? '' : undefined}
      {...memberAttr('Switch')}
    >
      {track}
      <span className={styles.label}>{label}</span>
    </label>
  )
}

Switch.controlKind = 'row-labelled' satisfies ControlKind
