'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { useId, useRef, useState } from 'react'

import { type ControlKind, Icon, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/checkbox-group.module.css'

/**
 * Several independent choices, all visible (`design/components/checkbox-group.md`). It mirrors
 * RadioGroup for multiple choice, so "pick some" and "pick one" work the same way. It has no
 * Radix primitive of its own. The group is a named `role="group"`, and the items are checkboxes
 * that use the same primitive and recipe as the Checkbox member, through composition.
 *
 * This is *not* a RadioGroup with different boxes. A radio group always resolves to one value and
 * moves selection with arrow keys. Here every option is an independent decision, every box is its
 * own tab stop, and `[]` is a valid answer, not an error state. Without it, screens would stack
 * bare Checkboxes with no group name and no group error target.
 */

export interface CheckboxGroupOption {
  value: string
  label: string
  /** A second line under the label, the two-line item layout Combobox and Select share. */
  description?: string
  disabled?: boolean
}

export type CheckboxGroupOrientation = 'vertical' | 'horizontal'

export interface CheckboxGroupProps {
  /** Items render from data, because free-form children invite custom layouts (Radio's law). */
  options: CheckboxGroupOption[]
  value?: string[]
  defaultValue?: string[]
  /**
   * Reports checked values in **options order**, not click order, so the result is stable and
   * comparable. The empty array is a lawful state, unlike Radio's no-null rule, because "none of
   * these" is a real answer to a multi-choice question.
   */
  onChange?: (values: string[]) => void
  /** Horizontal only for ≤3 short labels without descriptions (Radio's guidance, not enforced). */
  orientation?: CheckboxGroupOrientation
  invalid?: boolean
  disabled?: boolean
  /** Set on every box, with each option's `value`, which is the native multi-value form data. */
  name?: string
  id?: string
  /** Set by FormField, because the group's question is the field's label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export function CheckboxGroup({
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
}: CheckboxGroupProps) {
  // The member holds the value when the caller is uncontrolled, and every box is controlled by it,
  // so a person's toggle and an agent's choice change it through the same setter.
  const [mirror, setMirror] = useState<string[]>(defaultValue ?? [])
  const current = value ?? mirror
  const generated = useId()

  function toggle(optionValue: string, checked: boolean) {
    // Built fresh from `options`, in options order. The result is a filter over the options, so
    // click order never affects it.
    const next = options
      .filter((option) => (option.value === optionValue ? checked : current.includes(option.value)))
      .map((option) => option.value)
    setMirror(next)
    onChange?.(next)
  }

  // An agent's choice sets the whole selection of the enabled options, built from `options` in
  // options order as a person's toggle is. A disabled option keeps what it holds, because a
  // person cannot change it either.
  function choose(chosen: readonly string[]) {
    const next = options
      .filter((option) =>
        disabled || option.disabled === true
          ? current.includes(option.value)
          : chosen.includes(option.value),
      )
      .map((option) => option.value)
    if (next.length === current.length && next.every((each) => current.includes(each))) return
    setMirror(next)
    onChange?.(next)
  }

  const rootRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'CheckboxGroup',
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
    actions: { choose: { argument: 'ids', run: (chosen) => choose(chosen) } },
  })

  return (
    <div
      ref={rootRef}
      id={id}
      role="group"
      className={styles.group}
      data-orientation={orientation}
      data-invalid={invalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      // Mirrored from the injected `aria-required`, as on RadioGroup's root. This attribute is the
      // only rendering of it. ARIA does not allow `aria-required` on `role="group"` (it belongs to
      // radiogroup, and axe enforces that). So FormField's marker shows the requirement, and this
      // attribute exposes the state to CSS and tests.
      data-required={required ? '' : undefined}
      // Group-level naming and messages go on the root. `aria-invalid` is a global state, so it is
      // allowed here.
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      {...memberAttr('CheckboxGroup')}
    >
      {options.map((option, index) => {
        const optionDisabled = disabled || option.disabled === true
        const checked = current.includes(option.value)
        const descriptionId =
          option.description === undefined
            ? undefined
            : `${id ?? generated}-option-${index}-description`

        return (
          <div
            key={option.value}
            className={styles.item}
            data-disabled={optionDisabled ? '' : undefined}
          >
            <label
              className={styles.row}
              data-state={checked ? 'checked' : 'unchecked'}
              data-disabled={optionDisabled ? '' : undefined}
            >
              <CheckboxPrimitive.Root
                className={styles.box}
                checked={checked}
                onCheckedChange={(next) => toggle(option.value, next === true)}
                disabled={optionDisabled}
                name={name}
                value={option.value}
                // Per-option help is announced with its own option, never merged into the group's.
                aria-describedby={descriptionId}
              >
                <CheckboxPrimitive.Indicator className={styles.indicator}>
                  {/* `confirm`, from the checkbox recipe. Never `indeterminate` here, because a
                      group of independent choices has no third state. A select-all with mixed
                      children belongs to Table's selection column. */}
                  <Icon name="confirm" size="sm" />
                </CheckboxPrimitive.Indicator>
              </CheckboxPrimitive.Root>
              <span className={styles.label}>{option.label}</span>
            </label>

            {/* Outside the `<label>` on purpose. A wrapping label names its control from all of
                its content, and the description belongs in `aria-describedby`, not in the name. */}
            {option.description === undefined ? null : (
              <span className={styles.description} id={descriptionId}>
                {option.description}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Column-labelled but named by association, the same as RadioGroup. `<label for>` binds only to a
// labelable element, and a `role="group"` div is not one.
CheckboxGroup.controlKind = 'group' satisfies ControlKind
