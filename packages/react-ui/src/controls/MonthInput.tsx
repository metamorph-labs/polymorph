'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocale } from 'react-aria'

import {
  agentMonth,
  type ControlSize,
  dataAttrs,
  dataFlag,
  type DateFieldDraft,
  type DateFieldOptions,
  type DateFieldSegment,
  eraseSegment,
  fieldSegments,
  memberAttr,
  monthDraft,
  monthFieldValue,
  monthOutOfBounds,
  segmentValueText,
  stepSegment,
  typeIntoSegment,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/month-input.module.css'

/**
 * A segmented month-and-year field with no popup (`design/components/month-input.md`).
 *
 * It is DatePicker's segmented entry with the month and the year segments only, for a
 * card's expiry or a billing month.
 *
 * It is not DatePicker at another granularity. DatePicker's value is a day, and React
 * Aria's date field cannot show a month without its day. So every web renderer, this
 * one included, draws the engine's segment model (`@polymorph/engine`'s
 * `fieldSegments`, `stepSegment`, `typeIntoSegment`, `eraseSegment`), the model the
 * generated vocabularies draw DatePicker and TimeInput with.
 *
 * There is no popup and no icon, as on TimeInput. No surveyed screen picks a month
 * from a grid: a card's expiry is typed from the card.
 */

/** Every word the field says that `Intl` cannot supply. */
export interface MonthInputMessages {
  /** What an unfilled segment says as its value. */
  empty: string
}

const DEFAULT_MESSAGES: MonthInputMessages = { empty: 'Empty' }

export interface MonthInputProps {
  /**
   * A month as `YYYY-MM`, the form `<input type="month">` reports, or `null` while a
   * segment is empty. Text that is not a month shows as empty.
   */
  value?: string | null
  defaultValue?: string | null
  /** Called with `YYYY-MM` once both segments are filled, and with `null` once one is erased. */
  onChange?: (value: string | null) => void
  /** The first month the field accepts, as `YYYY-MM`. An earlier month marks the field invalid. */
  min?: string
  /** The last month the field accepts, as `YYYY-MM`. A later month marks the field invalid. */
  max?: string
  /** Sets the segment order, the separator and the month's name. */
  locale?: string
  size?: ControlSize
  disabled?: boolean
  /** Keeps segments focusable, but arrows and digits do not edit. */
  readOnly?: boolean
  invalid?: boolean
  /** Serializes the month as `YYYY-MM`, as `<input type="month">` does. */
  name?: string
  id?: string
  /** Defaults to generic English. Localized hosts pass strings from their catalog. */
  messages?: MonthInputMessages
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/** The parts the field edits. The locale orders them. */
const PARTS = ['year', 'month'] as const

/** The segment's part as the locale names it ("month"): its name inside the field's. */
function segmentName(type: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'dateTimeField' }).of(type) ?? type
  } catch {
    return type
  }
}

/** Focus moves to the segment `step` places away in the field, and stays put at either end. */
function moveSegment(from: HTMLElement, step: number): void {
  const all = [
    ...(from.closest('[role="group"]')?.querySelectorAll<HTMLElement>('[data-segment]') ?? []),
  ]
  all[all.indexOf(from) + step]?.focus()
}

export function MonthInput({
  value,
  defaultValue,
  onChange,
  min,
  max,
  locale,
  size = 'md',
  disabled = false,
  readOnly = false,
  invalid = false,
  name,
  id,
  messages = DEFAULT_MESSAGES,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: MonthInputProps) {
  // The app's locale (React Aria's provider, else the browser's), as the other date fields read it.
  const { locale: appLocale } = useLocale()
  const language = locale ?? appLocale
  const options = useMemo<DateFieldOptions>(() => ({ locale: language, parts: PARTS }), [language])
  const uid = useId()

  const supplied = value !== undefined ? value : defaultValue
  const [draft, setDraft] = useState<DateFieldDraft>(() => monthDraft(supplied))
  /*
   * The draft as the handlers read it. Keys arrive faster than renders, so each handler reads
   * the draft the previous key left, not the one the last render saw.
   */
  const latest = useRef(draft)
  // What the reader has typed into the focused segment since it took focus.
  const typed = useRef('')
  // The value last reported or supplied, so an edit that changes nothing reports nothing.
  const reported = useRef(monthFieldValue(monthDraft(supplied)) ?? '')

  const current = monthFieldValue(draft)
  const fieldInvalid = invalid || monthOutOfBounds(current, { min, max })
  const editable = !disabled && !readOnly

  const commit = (next: DateFieldDraft): void => {
    latest.current = next
    setDraft(next)
    const after = monthFieldValue(next)
    if ((after ?? '') !== reported.current) {
      reported.current = after ?? ''
      onChange?.(after)
    }
  }

  /*
   * A controlled value the caller changes is shown, unless it clears a draft the reader is still
   * filling in: an empty value leaves a partial draft as it is. The first render already shows it.
   */
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (value === undefined) return
    if (value === null && monthFieldValue(latest.current) === null) return
    const next = monthDraft(value)
    latest.current = next
    setDraft(next)
    reported.current = monthFieldValue(next) ?? ''
  }, [value])

  /** A key typed into a segment. Says whether focus moved on, so a run of text stops there. */
  const typeKey = (target: HTMLElement, segment: DateFieldSegment, key: string): boolean => {
    if (segment.type === 'literal') return false
    const next = typeIntoSegment(latest.current, segment.type, typed.current, key, options)
    typed.current = next.typed
    commit(next.draft)
    if (next.advance) moveSegment(target, 1)
    return next.advance
  }

  /*
   * ArrowLeft and ArrowRight move between segments, reversed in a right-to-left document.
   * ArrowUp and ArrowDown step the segment and wrap at its ends. A digit types into it and moves
   * on once no further digit could fit. Backspace and Delete erase its last digit, and in an empty
   * segment move back. A read-only or disabled field moves focus and edits nothing.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>, segment: DateFieldSegment): void => {
    if (segment.type === 'literal') return
    const target = event.currentTarget
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      typed.current = ''
      const forward =
        (event.key === 'ArrowRight') === (getComputedStyle(target).direction !== 'rtl')
      moveSegment(target, forward ? 1 : -1)
      return
    }
    if (event.ctrlKey || event.metaKey || event.key === 'Tab') return
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      typed.current = ''
      if (editable) {
        commit(stepSegment(latest.current, segment.type, event.key === 'ArrowUp' ? 1 : -1, options))
      }
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      typed.current = ''
      if (!editable) return
      if (latest.current[segment.type] === undefined) moveSegment(target, -1)
      else commit(eraseSegment(latest.current, segment.type, options))
      return
    }
    if (event.key.length !== 1) return
    event.preventDefault()
    if (editable) typeKey(target, segment, event.key)
  }

  const segments = fieldSegments(draft, options)

  /*
   * An agent reads the month as `YYYY-MM` and sets or clears it through the member's own draft,
   * so `onChange` reports it as it reports a person's entry, controlled or not. Text in another
   * form, or a month outside `min` and `max`, is refused, and a read-only field refuses both
   * actions, as its segments edit nothing.
   */
  const fieldRef = useRef<HTMLDivElement>(null)
  function writable(): void {
    if (readOnly) throw new Error('The field is read-only.')
  }
  useAgentMember({
    member: 'MonthInput',
    element: () => fieldRef.current,
    state: () => ({ value: current ?? '', disabled, invalid: fieldInvalid, readonly: readOnly }),
    actions: {
      set: {
        argument: 'text',
        run: (text) => {
          writable()
          commit(monthDraft(agentMonth(text, { min, max })))
        },
      },
      clear: () => {
        writable()
        commit({})
      },
    },
  })

  /*
   * Text that arrives without a key a keyboard names (a phone's keyboard): each character,
   * typed. React's `onBeforeInput` is not the browser's `beforeinput`, so the row listens to the
   * browser's event itself, again after each render so the listener reads that render's segments.
   */
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = row.current
    if (element === null) return
    const listen = (event: Event) => {
      const target =
        event.target instanceof HTMLElement ? event.target.closest('[data-segment]') : null
      if (!(target instanceof HTMLElement)) return
      event.preventDefault()
      if (!editable) return
      const segment = segments.find((each) => each.type === target.dataset['segment'])
      if (segment === undefined) return
      for (const key of (event as InputEvent).data ?? '') {
        if (typeKey(target, segment, key)) break
      }
    }
    element.addEventListener('beforeinput', listen)
    return () => element.removeEventListener('beforeinput', listen)
  })

  return (
    <div
      ref={fieldRef}
      role="group"
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled ? 'true' : undefined}
      className={styles.field}
      {...dataAttrs({ size, disabled, invalid: fieldInvalid })}
      {...dataFlag('readonly', readOnly)}
      {...memberAttr('MonthInput')}
    >
      <div ref={row} className={styles.segments}>
        {segments.map((segment, at) =>
          segment.type === 'literal' ? (
            <span key={`month-literal-${at}`} className={styles.separator} aria-hidden="true">
              {segment.text}
            </span>
          ) : (
            <div
              key={`month-${segment.type}-${at}`}
              className={styles.segment}
              role="spinbutton"
              id={`${uid}-month-${segment.type}`}
              aria-label={segmentName(segment.type, language)}
              aria-labelledby={
                labelledBy ? `${labelledBy} ${uid}-month-${segment.type}` : undefined
              }
              aria-describedby={describedBy}
              aria-valuenow={segment.placeholder ? undefined : segment.value}
              aria-valuemin={segment.min}
              aria-valuemax={segment.max}
              aria-valuetext={segmentValueText(segment, language, messages.empty)}
              aria-required={required ? 'true' : undefined}
              aria-readonly={readOnly ? 'true' : undefined}
              aria-disabled={disabled ? 'true' : undefined}
              aria-invalid={fieldInvalid ? 'true' : undefined}
              // Editable text, so a phone shows its keyboard. The handlers write every change.
              contentEditable={editable ? 'true' : undefined}
              suppressContentEditableWarning
              inputMode="numeric"
              spellCheck="false"
              tabIndex={disabled ? undefined : 0}
              data-segment={segment.type}
              data-placeholder={segment.placeholder ? '' : undefined}
              data-disabled={disabled ? '' : undefined}
              onFocus={() => {
                typed.current = ''
              }}
              onKeyDown={(event) => onKeyDown(event, segment)}
            >
              {segment.text}
            </div>
          ),
        )}
      </div>

      {/* The month as `YYYY-MM`, under `name`. */}
      {name === undefined ? null : (
        <input type="hidden" name={name} value={current ?? ''} disabled={disabled || undefined} />
      )}
    </div>
  )
}

/**
 * FormField names the group, not a labelable element. `<label for>` cannot target a
 * `role="group"` div, so the field is named by association.
 */
MonthInput.controlKind = 'group' as const
