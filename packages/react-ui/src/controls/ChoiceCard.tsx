'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { useId, useRef, useState, type ReactNode } from 'react'

import { Icon, type IconRole, memberAttr, useAgentMember, useDirection } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/choice-card.module.css'
import { useArrowSelection } from './radio-arrows'

/**
 * Radio or checkbox options as cards with room for a description
 * (`design/components/choice-card.md`). Each card has space for an icon, a label and a line of
 * explanatory copy, so the user can compare options before choosing.
 *
 * It is not Card, because choosing is not navigating. It borrows Card's *geometry* (border,
 * radius, padding) but deliberately not its elevation. A choice sits in the page, and its hover is
 * the selection treatment's ghost wash (`design/components/README.md`), never Card's lift. It is
 * not RadioGroup/CheckboxGroup either. The semantics are the same but the canvas is bigger, so use
 * this member when the answers need describing and the layout is a grid. It is not a button grid,
 * because a ChoiceCard holds state and performs no action.
 *
 * One component has two prop shapes, discriminated on `mode`, so unlawful pairings
 * (`mode: 'single'` returning `string[]`) cannot be expressed in the types. `mode` is required
 * rather than defaulted, so each call site states whether it offers one choice or several.
 */

export interface ChoiceCardOption {
  value: string
  label: string
  /** A second line under the label, as in Combobox's two-line items. */
  description?: string
  icon?: IconRole
  disabled?: boolean
}

export type ChoiceCardProps = {
  /** Items render from data (Radio's law). */
  options: ChoiceCardOption[]
  /** The group's accessible name (`aria-label` on the root). */
  label: string
  /** The maximum column count. The container resolves the actual count on Grid's scale (`grid.md`). */
  columns?: 1 | 2 | 3
  disabled?: boolean
} & (
  | { mode: 'single'; value?: string; defaultValue?: string; onChange?: (value: string) => void }
  | {
      mode: 'multiple'
      value?: string[]
      defaultValue?: string[]
      onChange?: (values: string[]) => void
    }
)

export function ChoiceCard(props: ChoiceCardProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  const { options, label, columns = 1, disabled = false } = props
  const generated = useId()

  // The member holds the value when the caller is uncontrolled, and the substrates are controlled
  // by it in both modes, as Checkbox's is. There are two holders because hooks cannot be called
  // inside the mode branch. Only the active one is read.
  const [singleMirror, setSingleMirror] = useState<string | undefined>(
    props.mode === 'single' ? props.defaultValue : undefined,
  )
  const [multipleMirror, setMultipleMirror] = useState<string[]>(
    props.mode === 'multiple' ? (props.defaultValue ?? []) : [],
  )
  // The active mode's value. Radix's radio group is controlled by the single one, so the member
  // holds the value in both modes and an agent's choice reaches the cards in both forms.
  const singleCurrent = props.mode === 'single' ? (props.value ?? singleMirror) : undefined
  const multipleCurrent = props.mode === 'multiple' ? (props.value ?? multipleMirror) : []

  /**
   * An agent's choice, by ids in both modes. Single takes exactly one id, because the choice
   * cannot be cleared, and reports it as a person's press does. Multiple sets the whole selection
   * of the enabled options in options order, as CheckboxGroup's does, and a disabled option keeps
   * what it holds, because a person cannot change it either.
   */
  function choose(chosen: readonly string[]) {
    if (props.mode === 'single') {
      const [only] = chosen
      if (only === undefined || chosen.length !== 1) {
        throw new Error('A single-choice ChoiceCard takes exactly one id.')
      }
      if (only === singleCurrent) return
      setSingleMirror(only)
      props.onChange?.(only)
      return
    }
    const next = options
      .filter((option) =>
        disabled || option.disabled === true
          ? multipleCurrent.includes(option.value)
          : chosen.includes(option.value),
      )
      .map((option) => option.value)
    if (
      next.length === multipleCurrent.length &&
      next.every((each) => multipleCurrent.includes(each))
    )
      return
    setMultipleMirror(next)
    props.onChange?.(next)
  }

  const rootRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'ChoiceCard',
    element: () => rootRef.current,
    state: () => ({
      value:
        props.mode === 'single'
          ? singleCurrent === undefined
            ? []
            : [singleCurrent]
          : multipleCurrent,
      options: options.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
      mode: props.mode,
      disabled,
    }),
    actions: { choose: { argument: 'ids', run: (chosen) => choose(chosen) } },
  })

  /**
   * One card, with either control inside. The whole surface is a real `<label>` for its visually
   * hidden control, so the entire card toggles. The control is named by `aria-labelledby` pointing
   * at the label line only, so the description stays in `aria-describedby` and is not part of the
   * name. This is CheckboxGroup's rule, kept here even though the description sits *inside* the
   * label element.
   */
  function card(option: ChoiceCardOption, index: number, checked: boolean, control: ReactNode) {
    const optionDisabled = disabled || option.disabled === true

    return (
      <label
        key={option.value}
        className={styles.option}
        data-state={checked ? 'checked' : 'unchecked'}
        data-disabled={optionDisabled ? '' : undefined}
      >
        {control}
        {option.icon === undefined ? null : (
          <span className={styles.icon}>
            <Icon name={option.icon} size="md" />
          </span>
        )}
        <span className={styles.label} id={`${generated}-option-${index}-label`}>
          {option.label}
        </span>
        {option.description === undefined ? null : (
          <span className={styles.description} id={`${generated}-option-${index}-description`}>
            {option.description}
          </span>
        )}
        {/* The selection treatment requires an indicator that is not colour alone. The glyph
            renders only when checked, in space the copy column always reserves, so nothing
            shifts. It is decorative, because the control's `aria-checked` carries the state. */}
        {checked ? (
          <span className={styles.glyph}>
            <Icon name="confirm" size="md" />
          </span>
        ) : null}
      </label>
    )
  }

  const describedBy = (option: ChoiceCardOption, index: number) =>
    option.description === undefined ? undefined : `${generated}-option-${index}-description`

  // Selection follows arrow-key focus even on a very short key press (`radio-arrows.ts`). Only the
  // single mode's radios use it. The multiple mode's boxes do not respond to arrow keys.
  const arrows = useArrowSelection()

  if (props.mode === 'single') {
    const current = singleCurrent

    return (
      <RadioGroupPrimitive.Root
        ref={rootRef}
        dir={dir}
        className={styles.grid}
        data-columns={String(columns)}
        value={current ?? null}
        defaultValue={props.defaultValue}
        onValueChange={(next) => {
          setSingleMirror(next)
          props.onChange?.(next)
        }}
        disabled={disabled}
        // Radix sets `data-disabled` on the root itself, as in RadioGroup.
        aria-label={label}
        {...memberAttr('ChoiceCard')}
      >
        {options.map((option, index) =>
          card(
            option,
            index,
            current === option.value,
            <RadioGroupPrimitive.Item
              className={styles.control}
              value={option.value}
              disabled={option.disabled}
              aria-labelledby={`${generated}-option-${index}-label`}
              aria-describedby={describedBy(option, index)}
              {...arrows}
            />,
          ),
        )}
      </RadioGroupPrimitive.Root>
    )
  }

  const current = multipleCurrent
  // Bound here, where the mode is narrowed. Otherwise the closure below would see the whole union
  // and require a value that is both string and string[].
  const onCheckedValuesChange = props.onChange

  function toggle(optionValue: string, checked: boolean) {
    // Built fresh from `options`, in options order. The result is a filter over the options, so
    // click order never affects it (the same rule as CheckboxGroup).
    const next = options
      .filter((option) => (option.value === optionValue ? checked : current.includes(option.value)))
      .map((option) => option.value)
    setMultipleMirror(next)
    onCheckedValuesChange?.(next)
  }

  return (
    <div
      ref={rootRef}
      role="group"
      className={styles.grid}
      data-columns={String(columns)}
      data-disabled={disabled ? '' : undefined}
      aria-label={label}
      {...memberAttr('ChoiceCard')}
    >
      {options.map((option, index) => {
        const optionDisabled = disabled || option.disabled === true
        return card(
          option,
          index,
          current.includes(option.value),
          <CheckboxPrimitive.Root
            className={styles.control}
            checked={current.includes(option.value)}
            onCheckedChange={(next) => toggle(option.value, next === true)}
            disabled={optionDisabled}
            aria-labelledby={`${generated}-option-${index}-label`}
            aria-describedby={describedBy(option, index)}
          />,
        )
      })}
    </div>
  )
}
