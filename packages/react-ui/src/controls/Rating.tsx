'use client'

import { useRef, useState } from 'react'

import {
  type ControlKind,
  dataAttrs,
  Icon,
  memberAttr,
  type RatingMark,
  ratingModel,
  ratingPress,
  roveRating,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/rating.module.css'

/**
 * A score as a row of marks (`design/components/rating.md`).
 *
 * Set, it is a radio group: one radio per mark, named for the value it sets ("3 stars"), so a
 * form posts the value a native group would. A press on the mark the rating holds clears it.
 * Shown (`readOnly`), it is one image named by a sentence ("Rating: 4.3 out of 5"), because a
 * fraction is no radio's value, and it draws the mark the fraction lands in part filled.
 *
 * It is not RadioGroup, whose options are labelled rows that never clear. It is not
 * SegmentedControl, which always holds a value and is not submitted. It is not Meter, which
 * measures a quantity against a limit. Thumbs up and down under a reply are two pressed
 * Buttons, not a rating out of two.
 *
 * The marks are the member's own: Radix's radio group neither clears nor stops at the ends,
 * and both are this member's rules. Every key, press and fill comes from the engine's
 * `ratingModel`, `ratingPress` and `roveRating`, so each framework's Rating behaves alike.
 */

/**
 * The words the member writes itself, which a locale replaces. Pass both keys or neither, so
 * one Rating never mixes two languages. The numbers arrive already written in the locale's
 * digits.
 */
export interface RatingMessages {
  /** A mark's name, from the value it sets and that value's numeral: "3 stars". */
  mark: (value: number, numeral: string) => string
  /** The shown rating's name, one sentence: "Rating: 4.3 out of 5". */
  shown: (label: string, value: string, max: string) => string
}

export type RatingSize = 'sm' | 'md' | 'lg'

export interface RatingProps {
  /**
   * The rating's name. A control's group is named by it ("Rate this answer") unless a FormField
   * names it, and a shown rating's sentence starts with it ("Average rating").
   */
  label: string
  /**
   * What the rating holds. A control holds a whole number from 1 to `max`, or `null` for no
   * rating. A shown rating holds any value from 0 to `max`, drawn to one decimal place.
   */
  value?: number | null
  defaultValue?: number | null
  /** The value a press or a key chose, or `null` when a press cleared it. Never called for a shown rating. */
  onChange?: (value: number | null) => void
  /** The number of marks: a whole number from 2 to 10. Default 5. */
  max?: number
  /** Shows the rating as an image a reader reads and cannot change. */
  readOnly?: boolean
  disabled?: boolean
  invalid?: boolean
  /** The marks' size: the icon sizes. A control's hit targets stay one size. */
  size?: RatingSize
  /** Posts the value as a whole number, or nothing when the rating holds none. */
  name?: string
  /** Writes the numerals of the marks' names and the shown sentence. Defaults to the page's own. */
  locale?: string
  messages?: RatingMessages
  id?: string
  /** Wired by FormField, which names the group with its label. */
  'aria-labelledby'?: string
  'aria-describedby'?: string
  /** A required rating cannot be cleared by a press. */
  'aria-required'?: boolean
}

/** A mark's drawing: the outline, and a filled copy over it cut to the share the value covers. */
function Glyph({ mark, size }: { mark: RatingMark; size: RatingSize }) {
  return (
    <span className={styles.glyph}>
      <Icon name="rating" size={size} />
      <span
        className={styles.fill}
        style={mark.share === undefined ? undefined : { inlineSize: mark.share }}
      >
        <Icon name="rating" size={size} />
      </span>
    </span>
  )
}

export function Rating({
  label,
  value,
  defaultValue,
  onChange,
  max,
  readOnly = false,
  disabled = false,
  invalid = false,
  size = 'md',
  name,
  locale,
  messages,
  id,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: RatingProps) {
  // What the rating holds while the caller does not hold it.
  const [mirror, setMirror] = useState<number | null>(defaultValue ?? null)
  const model = ratingModel({
    value: value === undefined ? mirror : value,
    label,
    max,
    readOnly,
    locale,
    messages,
  })

  // A choice is reported only when it changes what the rating holds.
  const settle = (next: number | null) => {
    if (next === model.value) return
    setMirror(next)
    onChange?.(next)
  }

  // An agent chooses a mark, or clears the rating, as a press does: only a mark a person can
  // press, never on a shown rating, and never empty when the rating is required.
  const rootRef = useRef<HTMLSpanElement>(null)
  function pressable() {
    if (readOnly) throw new Error('The rating is shown and takes no press.')
  }
  useAgentMember({
    member: 'Rating',
    element: () => rootRef.current,
    state: () => ({ value: model.value, max: model.max, readonly: readOnly, disabled, invalid }),
    actions: {
      set: {
        argument: 'number',
        run: (next) => {
          pressable()
          if (!Number.isInteger(next) || next < 1 || next > model.max) {
            throw new Error(`A rating is a whole number from 1 to ${model.max}.`)
          }
          settle(next)
        },
      },
      clear: () => {
        pressable()
        if (required === true) throw new Error('A required rating keeps its mark.')
        settle(null)
      },
    },
  })

  // The posted value. A disabled control posts nothing, as a disabled field does.
  const field =
    name === undefined ? null : (
      <input
        type="hidden"
        name={name}
        value={model.value === null ? '' : String(model.value)}
        disabled={disabled && !readOnly}
      />
    )

  if (readOnly) {
    // One image: a fraction is no radio's value, and five glyphs read out one by one say nothing.
    return (
      <span
        ref={rootRef}
        id={id}
        role="img"
        aria-label={model.sentence}
        aria-describedby={describedBy}
        className={styles.rating}
        data-size={size}
        data-readonly=""
        {...memberAttr('Rating')}
      >
        {model.marks.map((mark) => (
          <span key={mark.value} className={styles.mark} data-fill={mark.fill}>
            <Glyph mark={mark} size={size} />
          </span>
        ))}
        {field}
      </span>
    )
  }

  // One tab stop: the mark the rating holds, or the first.
  const stop = model.value ?? 1

  return (
    <span
      ref={rootRef}
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required={required === true ? true : undefined}
      aria-invalid={invalid ? true : undefined}
      className={styles.rating}
      {...dataAttrs({ size, disabled, invalid })}
      {...memberAttr('Rating')}
    >
      {model.marks.map((mark) => (
        <button
          key={mark.value}
          type="button"
          role="radio"
          aria-checked={mark.value === model.value}
          aria-label={mark.name}
          disabled={disabled}
          tabIndex={mark.value === stop ? 0 : -1}
          className={styles.mark}
          data-fill={mark.fill}
          onClick={() => settle(ratingPress(mark.value, model.value, required === true))}
          onKeyDown={(event) => roveRating(event, settle)}
        >
          <Glyph mark={mark} size={size} />
        </button>
      ))}
      {field}
    </span>
  )
}

// Column-labelled and named by `aria-labelledby`, as RadioGroup is: a `role="radiogroup"`
// element is not labelable, so `<label for>` would name nothing.
Rating.controlKind = 'group' satisfies ControlKind
