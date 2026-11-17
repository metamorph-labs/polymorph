'use client'

import { useMemo, useRef, type FocusEvent, type MouseEvent } from 'react'
import { useButton, useLocale, useNumberField } from 'react-aria'
import { useNumberFieldState } from 'react-stately'

import {
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  memberAttr,
  useAgentMember,
  type ValueFormat,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/number-input.module.css'

/**
 * A field that holds, formats and steps a number (`design/components/number-input.md`).
 *
 * It formats values as the chart tier does. The boundary comes from `input.md`: Input's
 * `onChange` returns a string for every `type`, including `number`. Once the app holds
 * the value as a number, formats it or steps it, it should use this member. It is not
 * Input `type="number"`, which is still allowed for raw strings. It is not Slider, which
 * is for values where the approximate position matters more than the digits. It is not
 * Stepper, which shows progress through a sequence. The stepper buttons here share the
 * word but not the member.
 *
 * Behaviour comes from React Aria `useNumberField`, with locale-aware parsing based on
 * Intl. `onChange` reports **committed numbers, never unparsed text**. Typed text is
 * parsed and clamped on commit (blur, Enter), and the steppers commit on each step.
 * `NaN` is never reported: the substrate uses `NaN` for empty, and this member converts
 * it to `null` at the prop boundary.
 *
 * Scrubbing and the mouse wheel are not supported. Wheel-to-increment takes over page
 * scrolling when the pointer pauses over a field, and changes the value when the user
 * only meant to scroll past. The substrate has its own focus-gated wheel handling, and
 * `isWheelDisabled` below turns it off.
 */

/**
 * The chart tier's `ValueFormat` (`docs/charts.md`), minus the styles an editable field
 * cannot round-trip. Those are removed from the type rather than warned about in
 * development, so they cannot be written:
 *
 * - `'date'`: a number field has no date to format.
 * - `'compact'`: the installed parser reads "1.2K" as 1.2 and drops the multiplier, so a
 *   compact field would corrupt the value it displays. Display-only surfaces may use
 *   compact. Editable ones may not.
 *
 * `granularity` applies only to `'date'`, so it is removed too.
 */
export interface NumberFormat extends Omit<ValueFormat, 'style' | 'granularity'> {
  style?: Exclude<ValueFormat['style'], 'date' | 'compact'> // 'decimal' | 'percent' | 'currency'
}

export interface NumberInputProps {
  /** `null` is the empty field. */
  value?: number | null
  defaultValue?: number | null
  /** Reports committed numbers only, never unparsed text and never `NaN`. */
  onChange?: (value: number | null) => void
  /** Typed values are clamped at commit. The steppers snap to the step and stop at the limits. */
  min?: number
  max?: number
  step?: number
  /**
   * The chart tier's format descriptor, limited to what an editable field can parse back.
   * It formats the displayed text only. The committed value is always the raw number.
   * Raw `Intl.NumberFormatOptions` are not accepted.
   */
  format?: NumberFormat
  /** Fires after the commit settles, so touched validation reads the committed number. */
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void
  /**
   * Affixes as defined in `input.md`: strings only, muted, and `aria-hidden`. Use
   * `format` first. Affixes are for units Intl cannot format ("/mo", "per seat").
   */
  prefix?: string
  suffix?: string
  size?: ControlSize
  placeholder?: string
  disabled?: boolean
  /** Hides the steppers, because a value that cannot be edited cannot be stepped. */
  readOnly?: boolean
  invalid?: boolean
  id?: string
  /** Posts the **plain number** on a hidden input, never the formatted text. */
  name?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/**
 * Maps the descriptor to Intl options. It copies the chart tier's mapping
 * (`numberOptions` in the chart engine's `format.ts`, `@polymorph/engine/charts`), minus
 * the branches the type already removes. Copying it keeps the two tiers formatting numbers
 * the same way without the field importing the chart engine's runtime.
 */
function intlOptions(format: NumberFormat | undefined): Intl.NumberFormatOptions {
  const digits = format?.maximumFractionDigits
  switch (format?.style) {
    case 'percent':
      // Intl semantics: the input is a ratio and the formatter multiplies by 100.
      return { style: 'percent', maximumFractionDigits: digits ?? 0 }
    case 'currency':
      return {
        style: 'currency',
        currency: format.currency ?? 'USD',
        ...(digits === undefined ? {} : { maximumFractionDigits: digits }),
      }
    default:
      return digits === undefined ? {} : { maximumFractionDigits: digits }
  }
}

export function NumberInput({
  value,
  defaultValue,
  onChange,
  min,
  max,
  step,
  format,
  onBlur,
  onFocus,
  prefix,
  suffix,
  size = 'md',
  placeholder,
  disabled = false,
  readOnly = false,
  invalid = false,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: NumberInputProps) {
  const { locale } = useLocale()
  const inputRef = useRef<HTMLInputElement>(null)
  const incrementRef = useRef<HTMLButtonElement>(null)
  const decrementRef = useRef<HTMLButtonElement>(null)

  const formatOptions = useMemo(() => intlOptions(format), [format])

  const shared = {
    /*
     * This member uses `null` for empty and the substrate uses `NaN`. The conversion
     * happens here in both directions so neither leaks out. `undefined` stays
     * `undefined`, because passing `NaN` for an absent `value` would make every field
     * controlled and empty.
     */
    ...(value === undefined ? {} : { value: value ?? NaN }),
    ...(defaultValue === undefined ? {} : { defaultValue: defaultValue ?? NaN }),
    onChange: (next: number) => onChange?.(Number.isNaN(next) ? null : next),
    minValue: min,
    maxValue: max,
    step,
    formatOptions,
    isDisabled: disabled,
    isReadOnly: readOnly,
    /*
     * Passed only when the app sets it, as in DatePicker. React Aria treats any
     * `isInvalid`, including `false`, as the caller owning validity, and then drops its
     * own range checking.
     */
    ...(invalid ? { isInvalid: true } : {}),
    isRequired: required,
    id,
    placeholder,
    /*
     * The substrate types its focus events as `Element`. They always fire from this
     * field's `<input>`, so the cast is safe. The public props keep Input's types
     * (`FocusEvent<HTMLInputElement>`) instead of widening to the substrate's.
     */
    onBlur:
      onBlur === undefined
        ? undefined
        : (event: FocusEvent<Element>) => onBlur(event as FocusEvent<HTMLInputElement>),
    onFocus:
      onFocus === undefined
        ? undefined
        : (event: FocusEvent<Element>) => onFocus(event as FocusEvent<HTMLInputElement>),
    /* Disables the wheel. The spec names this prop so the choice is documented. */
    isWheelDisabled: true,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
  }

  const state = useNumberFieldState({ ...shared, locale })
  const { groupProps, inputProps, incrementButtonProps, decrementButtonProps } = useNumberField(
    shared,
    state,
    inputRef,
  )

  /*
   * The substrate's stepper props are press props (`AriaButtonProps`). `useButton`
   * turns them into DOM props and keeps the press-and-hold repeat, the exclusion from
   * the Tab order and the disabling at the limits.
   */
  const { buttonProps: incrementDom } = useButton(incrementButtonProps, incrementRef)
  const { buttonProps: decrementDom } = useButton(decrementButtonProps, decrementRef)

  /*
   * An agent commits a number as a typed commit does: held within `min` and `max`, and reported
   * through `onChange` only when it differs from the committed number, which the substrate's own
   * setter compares. `NaN` is the substrate's empty field, which `onChange` reports as `null`. A
   * read-only field takes no typing, so it refuses both actions.
   */
  function commitNumber(next: number) {
    if (readOnly) throw new Error('The field is read-only.')
    state.setNumberValue(next)
  }
  useAgentMember({
    member: 'NumberInput',
    element: () => inputRef.current,
    state: () => ({
      value: Number.isNaN(state.numberValue) ? null : state.numberValue,
      disabled,
      invalid,
      readonly: readOnly,
    }),
    actions: {
      set: {
        argument: 'number',
        run: (next) => commitNumber(Math.min(Math.max(next, min ?? -Infinity), max ?? Infinity)),
      },
      clear: () => commitNumber(NaN),
    },
  })

  /** Clicking the root focuses the input, as in Input, except on parts that are controls. */
  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea')) return
    event.preventDefault()
    inputRef.current?.focus()
  }

  return (
    <div
      {...groupProps}
      className={styles.field}
      onMouseDown={handleMouseDown}
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('readonly', readOnly)}
      {...memberAttr('NumberInput')}
    >
      {prefix !== undefined ? (
        <span className={styles.affix} aria-hidden="true">
          {prefix}
        </span>
      ) : null}

      <input {...inputProps} ref={inputRef} className={styles.input} />

      {suffix !== undefined ? (
        <span className={styles.affix} aria-hidden="true">
          {suffix}
        </span>
      ) : null}

      {/* Step **down** then step **up** in reading order, like a number line in the
          reading direction. RTL reverses both. Not rendered under readOnly, following
          the clear button's rule: a value that cannot be edited cannot be stepped. */}
      {readOnly ? null : (
        <div className={styles.steppers}>
          <button {...decrementDom} ref={decrementRef} className={styles.stepper}>
            <Icon name="down" size={size} />
          </button>
          <button {...incrementDom} ref={incrementRef} className={styles.stepper}>
            <Icon name="up" size={size} />
          </button>
        </div>
      )}

      {/* The plain number under `name`, using react-aria's mechanism, so a server
          that expects 1234.56 never receives "$1,234.56". */}
      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={Number.isNaN(state.numberValue) ? '' : state.numberValue}
          disabled={disabled || undefined}
        />
      )}
    </div>
  )
}
