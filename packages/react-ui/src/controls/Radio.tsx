'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { useRef, useState } from 'react'

import styles from '@polymorph/recipes/controls/radio-group.module.css'
import { type ControlKind, memberAttr, useAgentMember, useDirection } from '@polymorph/react'
import { useArrowSelection } from './radio-arrows'

/**
 * Picks one value from a few options that are all visible (`design/components/radio.md`).
 *
 * Items render from data rather than from children, as in Select and Menu. Free-form
 * children would let each call site make its own layout decisions, and the caller only
 * needs to decide which options exist.
 *
 * There is no `null` and no clear action. A radio group renders with a choice or with
 * nothing chosen yet. A clearable single choice is `Select` with an `emptyOption`. Two
 * components that both mean "none selected" would be two ways to express one state.
 */

export interface RadioOption {
  value: string
  label: string
  disabled?: boolean
}

export type RadioOrientation = 'vertical' | 'horizontal'

export interface RadioGroupProps {
  options: RadioOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /** Horizontal is for three short labels at most. Guidance, not enforcement. */
  orientation?: RadioOrientation
  invalid?: boolean
  disabled?: boolean
  name?: string
  id?: string
  /** Wired by FormField, because the group's question is the field's label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export function RadioGroup({
  options,
  value,
  defaultValue,
  onChange,
  orientation = 'vertical',
  invalid = false,
  disabled = false,
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: RadioGroupProps) {
  // The direction of the place the member is in, which Radix would otherwise take to be
  // left-to-right.
  const rootRef = useRef<HTMLDivElement>(null)
  const dir = useDirection(rootRef)
  // Arrow-key selection that also works for a quick tap (`radio-arrows.ts`).
  const arrows = useArrowSelection()

  // The member holds the value, and Radix is always controlled by it: by `value` when the caller
  // gives it, and by the member's own state when not, with `null` while nothing is chosen. So one
  // setter changes the value in both forms, for a person's press through Radix and for an agent's
  // choice, and `onChange` reports both the same way.
  const [own, setOwn] = useState<string | null>(defaultValue ?? null)
  const current = value === undefined ? own : value
  const change = (next: string) => {
    if (next === current) return
    if (value === undefined) setOwn(next)
    onChange?.(next)
  }

  useAgentMember({
    member: 'RadioGroup',
    element: () => rootRef.current,
    state: () => ({
      value: current,
      options: options.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
      disabled,
      invalid,
    }),
    actions: { choose: { argument: 'id', run: (choice) => change(choice) } },
  })

  return (
    <RadioGroupPrimitive.Root
      ref={rootRef}
      id={id}
      dir={dir}
      className={styles.group}
      value={current}
      defaultValue={defaultValue}
      onValueChange={change}
      disabled={disabled}
      name={name}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required={required}
      aria-invalid={invalid ? true : undefined}
      // Radix writes `data-disabled` and `data-orientation` on the root itself.
      data-invalid={invalid ? '' : undefined}
      // Exposed as state, not to draw a marker. A group is column-labelled, so
      // FormField's label row shows the ` *`. Unlike Checkbox, this member does not
      // draw it.
      data-required={required ? '' : undefined}
      orientation={orientation}
      {...memberAttr('RadioGroup')}
    >
      {options.map((option) => (
        <label className={styles.row} key={option.value}>
          <RadioGroupPrimitive.Item
            className={styles.circle}
            value={option.value}
            disabled={option.disabled}
            {...arrows}
          >
            <RadioGroupPrimitive.Indicator className={styles.dot} />
          </RadioGroupPrimitive.Item>
          <span className={styles.label}>{option.label}</span>
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

// Column-labelled, but named by `aria-labelledby`, because a `role="radiogroup"` div
// is not a labelable element and `<label for>` would name nothing.
RadioGroup.controlKind = 'group' satisfies ControlKind
