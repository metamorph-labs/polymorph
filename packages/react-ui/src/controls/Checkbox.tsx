'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { useRef, useState } from 'react'

import { type ControlKind, Icon, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/checkbox.module.css'

/**
 * Boolean (or indeterminate) choice (`design/components/checkbox.md`). Radix supplies the
 * semantics. There is one size, because a checkbox is glyph-scale and density scales its row
 * rather than the box.
 *
 * With a `label`, the root is the row and the row is the hit target. Without one, as in a Table
 * selection cell where the cell is the target, the root *is* the box. This avoids wrapping a 16px
 * control in a 28px row inside a dense table. Either way, the box keeps a target-floor hit area
 * through a pseudo-element that takes no layout space (`checkbox.module.css`).
 */

export type CheckedState = boolean | 'indeterminate'

export interface CheckboxProps {
  /**
   * Visible inline label. Omit it only where the context labels the box, and then `aria-label` is
   * required.
   */
  label?: string
  checked?: CheckedState
  defaultChecked?: CheckedState
  onCheckedChange?: (checked: CheckedState) => void
  disabled?: boolean
  /** Usually set by FormField. */
  invalid?: boolean
  name?: string
  value?: string
  id?: string
  'aria-label'?: string
  /**
   * The id of a label elsewhere on the page, such as `SettingsRow`'s one label for a whole row.
   */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

function stateName(checked: CheckedState): 'checked' | 'unchecked' | 'indeterminate' {
  if (checked === 'indeterminate') return 'indeterminate'
  return checked ? 'checked' : 'unchecked'
}

export function Checkbox({
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  invalid = false,
  name,
  value,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: CheckboxProps) {
  // The member holds the value, and Radix is always controlled by it: by `checked` when the
  // caller gives it, and by the member's own state when not. So one setter changes the value in
  // both forms, for a person's press through Radix and for an agent's action, and the row root
  // carries the box's state attribute, which the states fixture asserts on. A native
  // `form.reset()` reaches the setter too, through Radix's reset listener.
  const [own, setOwn] = useState<CheckedState>(defaultChecked ?? false)
  const current = checked ?? own
  const change = (next: CheckedState) => {
    if (next === current) return
    if (checked === undefined) setOwn(next)
    onCheckedChange?.(next)
  }

  const boxRef = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'Checkbox',
    element: () => boxRef.current,
    state: () => ({ checked: current === 'indeterminate' ? 'mixed' : current, disabled }),
    actions: { check: () => change(true), uncheck: () => change(false) },
  })

  const box = (
    <CheckboxPrimitive.Root
      ref={boxRef}
      id={id}
      className={styles.box}
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
      // Mirrored so the row label can render the required marker. A row-labelled field has no
      // field-level label row, so FormField has nowhere to put the ` *`. Without this, only
      // column-labelled fields would show the marker.
      data-required={required ? '' : undefined}
      aria-invalid={invalid ? true : undefined}
      data-invalid={invalid ? '' : undefined}
      {...memberAttr('Checkbox')}
    >
      <CheckboxPrimitive.Indicator className={styles.indicator}>
        <Icon name={current === 'indeterminate' ? 'indeterminate' : 'confirm'} size="sm" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (label === undefined) return box

  return (
    <label
      className={styles.row}
      data-state={stateName(current)}
      data-disabled={disabled ? '' : undefined}
      data-invalid={invalid ? '' : undefined}
      data-required={required ? '' : undefined}
      {...memberAttr('Checkbox')}
    >
      {box}
      <span className={styles.label}>{label}</span>
    </label>
  )
}

Checkbox.controlKind = 'row-labelled' satisfies ControlKind
