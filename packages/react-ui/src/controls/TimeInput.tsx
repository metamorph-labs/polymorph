'use client'

import { getLocalTimeZone, type Time, toCalendarDateTime, today } from '@internationalized/date'
import { useRef } from 'react'
import { I18nProvider, useLocale, useTimeField } from 'react-aria'
import { useTimeFieldState } from 'react-stately'

import {
  agentTime,
  type ControlSize,
  dataAttrs,
  dataFlag,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { Segment, type SegmentStyles } from './date-segments'
import styles from '@polymorph/recipes/controls/time-input.module.css'

/**
 * A segmented time-of-day field with no popup (`design/components/time-input.md`).
 *
 * It is DatePicker's segmented entry on its own. There is no popup, because a time has
 * no month grid to help pick it. It is not DatePicker at another granularity: a datetime
 * uses DatePicker's own granularity, as one field and one value. This member is the
 * time of day alone, for example business hours starting at 09:00 on any date. It is
 * not a duration either: `Time` is a point on the clock, not an amount of time. An SLA's
 * "4 hours" is a DurationInput.
 *
 * There is deliberately no icon. DatePicker's `calendar` glyph is a button that opens
 * the calendar. A clock icon next to segments would look like a control but open
 * nothing, which would mislead users.
 */

export interface TimeInputProps {
  /**
   * `@internationalized/date`'s `Time`: a plain time of day with no date and no time
   * zone, never a JS `Date` (Calendar's law). The field edits down to its granularity.
   * Finer fields in a supplied value (seconds on a `Time` the app built) are kept
   * unchanged, never silently set to zero.
   */
  value?: Time | null
  defaultValue?: Time | null
  onChange?: (value: Time | null) => void
  /**
   * The segment list: `'minute'` is `[hh] [mm]`, and `'hour'` drops the minute segment.
   * Seconds are not offered, because no known screen edits them, and options are added
   * only when needed.
   */
  granularity?: 'hour' | 'minute'
  /**
   * The locale decides by default, and this prop overrides it. `12` renders the
   * dayPeriod segment, and `24` never does.
   */
  hourCycle?: 12 | 24
  /** Sets the segment order, the day period names and the separator. */
  locale?: string
  size?: ControlSize
  disabled?: boolean
  /** Keeps segments focusable and selectable, but arrows and digits do not edit. */
  readOnly?: boolean
  invalid?: boolean
  /** Serializes the ISO-8601 time in `Time`'s own format, such as `"09:30:00"`. */
  name?: string
  id?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

// This member's classes for the shared segment component (`date-segments.tsx`).
const segmentStyles: SegmentStyles = {
  segments: styles.segments,
  segment: styles.segment,
  separator: styles.separator,
}

/**
 * `locale` is applied through a provider, for the same reason as in Calendar. React
 * Aria's formatters read the locale from context, so passing it only to the field state
 * would order the segments but leave the day periods in the app's language.
 */
export function TimeInput(props: TimeInputProps) {
  const { locale: appLocale } = useLocale()

  return (
    <I18nProvider locale={props.locale ?? appLocale}>
      <TimeField {...props} />
    </I18nProvider>
  )
}

function TimeField({
  value,
  defaultValue,
  onChange,
  granularity = 'minute',
  hourCycle,
  size = 'md',
  disabled = false,
  readOnly = false,
  invalid = false,
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: TimeInputProps) {
  const { locale: resolvedLocale } = useLocale()
  const fieldRef = useRef<HTMLDivElement>(null)

  const shared = {
    value,
    defaultValue,
    onChange,
    granularity,
    hourCycle,
    isDisabled: disabled,
    isReadOnly: readOnly,
    /*
     * Passed only when the app sets it, as in DatePicker. React Aria treats any
     * `isInvalid`, including `false`, as the caller owning validity. A time field has no
     * range of its own to check, but the conditional spread is the shared pattern, and
     * it stays correct if this field ever gets one.
     */
    ...(invalid ? { isInvalid: true } : {}),
    isRequired: required,
    name,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
  }

  const state = useTimeFieldState({ ...shared, locale: resolvedLocale })
  const { fieldProps, inputProps } = useTimeField(shared, state, fieldRef)

  /*
   * An agent reads the time in `Time`'s own form and sets or clears it through React Aria's own
   * value, so `onChange` reports it as it reports a person's entry, controlled or not. Text in
   * another form, or a time finer than the field's segments, is refused, and a read-only field
   * refuses both actions, as its segments edit nothing.
   */
  function writable(): void {
    if (readOnly) throw new Error('The field is read-only.')
  }
  useAgentMember({
    member: 'TimeInput',
    element: () => fieldRef.current,
    state: () => ({
      value: state.value === null ? '' : state.timeValue.toString(),
      disabled,
      invalid,
      readonly: readOnly,
    }),
    actions: {
      set: {
        argument: 'text',
        run: (text) => {
          writable()
          // The field's segments hold a time on today's date, as React Aria writes a `Time` into
          // them, and it reports the `Time` alone.
          state.setValue(
            toCalendarDateTime(today(getLocalTimeZone()), agentTime(text, granularity)),
          )
        },
      },
      clear: () => {
        writable()
        state.setValue(null)
      },
    },
  })

  return (
    <div
      {...fieldProps}
      ref={fieldRef}
      className={styles.field}
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('readonly', readOnly)}
      {...memberAttr('TimeInput')}
    >
      {/* The segments are the whole control. `date-picker.md` treats the segments as the
          primary input and the calendar as an aid. Here the calendar is absent, and entry
          works the same without it. */}
      <div className={styles.segments}>
        {state.segments.map((segment, index) => (
          <Segment
            key={`${segment.type}-${index}`}
            segment={segment}
            state={state}
            disabled={disabled}
            styles={segmentStyles}
          />
        ))}
      </div>

      {/* The substrate's own serialization: ISO-8601 time under `name`. */}
      {inputProps.name == null ? null : <input {...inputProps} />}
    </div>
  )
}

/**
 * FormField names the group, not a labelable element. `<label for>` cannot target a
 * `role="group"` div, so the field is named by association.
 */
TimeInput.controlKind = 'group' as const
