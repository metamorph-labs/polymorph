'use client'

import { createCalendar } from '@internationalized/date'
import { useRef } from 'react'
import { useDateField, useDateSegment } from 'react-aria'
import { useDateFieldState, type DateFieldState, type DateSegment } from 'react-stately'

import { type ControlSize } from '@polymorph/react'

/**
 * The segment components shared by the date and time fields. DatePicker, TimeInput and
 * DateRangePicker use the same segments, so the behaviour is written here once instead of three
 * times.
 *
 * The styling is deliberately *not* shared. Every member passes its own stylesheet's classes,
 * because the completeness law checks each member's own CSS module source. This is also why
 * DatePicker restates Input's container instead of composing it. The row has one implementation,
 * and each member owns its recipe.
 */

/**
 * The three classes a segment row needs from its member's own stylesheet.
 * `undefined` is allowed because CSS-module lookups are index-signature reads under
 * `noUncheckedIndexedAccess`. A missing class renders as no class, and the selectors law catches
 * a stylesheet that lost one.
 */
export interface SegmentStyles {
  segments: string | undefined
  segment: string | undefined
  separator: string | undefined
}

/**
 * One segment, or the locale's own separator between two.
 *
 * Validity belongs to the *field*, not to a segment. This follows from React Aria, and is not an
 * omission. `useDateFieldState` clamps each segment to its calendar's range as it is typed, so a
 * `31` in February is never entered and no segment is ever invalid on its own. Only the value can
 * be wrong, and the value carries `data-invalid`.
 *
 * `empty` is what an unfilled segment says as its value, where the host gives a word for it.
 * Without one, the segment says React Aria's word, which React Aria says in the page's locale.
 * A segment React Aria draws with no value text (a text box on iOS, which VoiceOver cannot focus
 * as a spinbutton) keeps none.
 */
export function Segment({
  segment,
  state,
  disabled,
  styles,
  empty,
}: {
  segment: DateSegment
  state: DateFieldState
  disabled: boolean
  styles: SegmentStyles
  empty?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { segmentProps } = useDateSegment(segment, state, ref)
  const said =
    empty !== undefined && segment.isPlaceholder && segmentProps['aria-valuetext'] != null
      ? { 'aria-valuetext': empty }
      : {}

  if (segment.type === 'literal') {
    return (
      <span className={styles.separator} aria-hidden="true">
        {segment.text}
      </span>
    )
  }

  return (
    <div
      {...segmentProps}
      {...said}
      ref={ref}
      className={styles.segment}
      data-segment={segment.type}
      data-placeholder={segment.isPlaceholder ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
    >
      {segment.text}
    </div>
  )
}

/**
 * A date-segment row. `useDateFieldState` needs the resolved locale and the field props together,
 * and the recipes style the row. A segment row is Input's content, laid out as digits rather than
 * text.
 *
 * DatePicker renders one row and DateRangePicker renders two. The range halves carry `name`
 * (React Aria injects `startName`/`endName`), so the row also renders React Aria's hidden
 * serialization input when one is requested: ISO-8601, `useDateField`'s `inputProps` unchanged.
 */
export function DateSegments({
  fieldProps,
  locale,
  size,
  disabled,
  styles,
  empty,
}: {
  fieldProps: Parameters<typeof useDateField>[0]
  locale: string
  size: ControlSize
  disabled: boolean
  styles: SegmentStyles
  /** What an unfilled segment says as its value, where the host gives it (`Segment`). */
  empty?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const state = useDateFieldState({ ...fieldProps, locale, createCalendar })
  const { fieldProps: rowProps, inputProps } = useDateField(fieldProps, state, ref)

  return (
    <div {...rowProps} ref={ref} className={styles.segments} data-size={size}>
      {state.segments.map((segment, index) => (
        <Segment
          key={`${segment.type}-${index}`}
          segment={segment}
          state={state}
          disabled={disabled}
          styles={styles}
          empty={empty}
        />
      ))}
      {inputProps.name == null ? null : <input {...inputProps} />}
    </div>
  )
}
