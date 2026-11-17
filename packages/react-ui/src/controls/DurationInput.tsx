'use client'

import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useLocale } from 'react-aria'

import {
  agentDuration,
  commitDuration,
  type ControlSize,
  dataAttrs,
  dataFlag,
  type DurationDraft,
  durationDraft,
  type DurationFieldOptions,
  durationKey,
  type DurationKeyResult,
  durationSegments,
  type DurationUnit,
  memberAttr,
  typeIntoDuration,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/duration-input.module.css'

/**
 * A segmented field for a length of time (`design/components/duration-input.md`).
 *
 * It holds whole seconds and shows them as counts of days, hours, minutes or seconds, each
 * a spinbutton with its unit's word beside it. It is not TimeInput, which holds a point on
 * the clock, and not NumberInput with the unit in the label, which leaves the reader to
 * work out that 604,800 seconds is seven days. A screen that offers a few fixed lengths uses
 * Select or RadioGroup.
 *
 * The segments are the member's own, because a clock's segments wrap and a duration's
 * carry. Every key goes to the engine's `durationKey`, and every commit to
 * `commitDuration`, so each framework's DurationInput splits, steps, carries and clamps the
 * same way.
 */

export interface DurationInputMessages {
  /** What an empty count says as its value to assistive software. */
  empty: string
}

const DEFAULT_MESSAGES: DurationInputMessages = { empty: 'Empty' }

export interface DurationInputProps {
  /**
   * Whole seconds, and `null` for the empty field. `onChange` reports committed values: a
   * step as it fires, typed digits when focus leaves the field or on Enter, each held inside
   * `min` and `max`.
   */
  value?: number | null
  defaultValue?: number | null
  onChange?: (seconds: number | null) => void
  /** Which counts show, in any order; they are drawn largest first. Days, hours and minutes by default. */
  units?: readonly DurationUnit[]
  /** The fewest seconds a commit holds; `0` by default. */
  min?: number
  /** The most seconds a commit holds; none by default. */
  max?: number
  /** Sets the digits, the unit words and each count's name. */
  locale?: string
  /** The one word the member writes itself. */
  messages?: DurationInputMessages
  size?: ControlSize
  disabled?: boolean
  /** Keeps the counts focusable, but arrows and digits do not edit. */
  readOnly?: boolean
  invalid?: boolean
  /** Posts the committed value as whole seconds, such as `"604800"`. */
  name?: string
  id?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/** Focus moves to the count `by` places away in the field, staying put at either end. */
function moveSegment(from: HTMLElement, by: number) {
  const all = [
    ...(from.closest('[role="group"]')?.querySelectorAll<HTMLElement>('[data-segment]') ?? []),
  ]
  all[all.indexOf(from) + by]?.focus()
}

/**
 * `locale` falls back to React Aria's provider, as TimeInput's does, so an app's
 * `I18nProvider` reaches this field too.
 */
export function DurationInput({
  value,
  defaultValue,
  onChange,
  units,
  min,
  max,
  locale,
  messages = DEFAULT_MESSAGES,
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
}: DurationInputProps) {
  const { locale: appLocale } = useLocale()
  const options: DurationFieldOptions = { units, min, max, locale: locale ?? appLocale }
  const supplied = value === undefined ? (defaultValue ?? null) : value

  const [draft, setDraft] = useState<DurationDraft>(() => durationDraft(supplied, options))
  // The value last reported or supplied: what the hidden field posts and a commit compares with.
  const [reported, setReported] = useState<number | null>(supplied)
  // A controlled value the app changes replaces what the field shows.
  const [controlled, setControlled] = useState(value)
  if (value !== controlled) {
    setControlled(value)
    if (value !== undefined) {
      setReported(value)
      setDraft(durationDraft(value, options))
    }
  }

  const uid = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  // What the reader has typed into the focused count since it took focus.
  const typed = useRef('')

  /*
   * The handlers read the latest render through this ref, and write a new draft into it at
   * once, so several characters in one input event each see the one before. It is updated
   * before paint, and every event that reads it arrives after.
   */
  const editable = !disabled && !readOnly
  const live = useRef({ draft, reported, options, editable, onChange })
  useLayoutEffect(() => {
    live.current = { draft, reported, options, editable, onChange }
  })

  const store = (next: DurationDraft) => {
    live.current.draft = next
    setDraft(next)
  }

  const commit = (next: DurationDraft) => {
    const result = commitDuration(next, live.current.reported, live.current.options)
    store(result.draft)
    if (!result.changed) return
    live.current.reported = result.value
    setReported(result.value)
    live.current.onChange?.(result.value)
  }

  const act = (action: DurationKeyResult, from: HTMLElement) => {
    switch (action.kind) {
      case 'move':
        typed.current = ''
        moveSegment(from, action.by)
        return
      case 'type':
        typed.current = action.typed
        store(action.draft)
        if (action.advance) moveSegment(from, 1)
        return
      case 'step':
        typed.current = ''
        commit(action.draft)
        return
      case 'commit':
        typed.current = ''
        commit(live.current.draft)
        return
      case 'pass':
      case 'hold':
        return
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, unit: DurationUnit) => {
    const from = event.currentTarget
    const action = durationKey(
      live.current.draft,
      unit,
      typed.current,
      event,
      { editable: live.current.editable, rtl: getComputedStyle(from).direction === 'rtl' },
      live.current.options,
    )
    if (action.kind === 'pass') return
    event.preventDefault()
    act(action, from)
  }

  /*
   * Text that arrives without a key a keyboard names (a phone's keyboard), as the native
   * `beforeinput`, because React's `onBeforeInput` is not that event. Every input is
   * stopped, because the counts are written by the field, and each character is typed.
   */
  useEffect(() => {
    const group = groupRef.current
    if (group === null) return
    const onInput = (event: InputEvent) => {
      const from = event.target
      if (!(from instanceof HTMLElement)) return
      const unit = from.dataset['segment'] as DurationUnit | undefined
      if (unit === undefined) return
      event.preventDefault()
      if (!live.current.editable) return
      for (const key of event.data ?? '') {
        const next = typeIntoDuration(
          live.current.draft,
          unit,
          typed.current,
          key,
          live.current.options,
        )
        typed.current = next.typed
        store(next.draft)
        if (next.advance) {
          moveSegment(from, 1)
          break
        }
      }
    }
    group.addEventListener('beforeinput', onInput)
    return () => group.removeEventListener('beforeinput', onInput)
  }, [])

  // Focus leaving the field commits what has been typed; a move between its counts does not.
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return
    }
    typed.current = ''
    commit(live.current.draft)
  }

  const posted = value === undefined ? reported : value

  /*
   * An agent reads the committed seconds and sets or clears them through the member's own
   * commit, so `onChange` reports them as it reports a person's commit, controlled or not.
   * Seconds the segments cannot draw, or seconds outside `min` and `max`, are refused, and a
   * read-only field refuses both actions, as its counts edit nothing.
   */
  function writable(): void {
    if (readOnly) throw new Error('The field is read-only.')
  }
  useAgentMember({
    member: 'DurationInput',
    element: () => groupRef.current,
    state: () => ({ value: posted, disabled, invalid, readonly: readOnly }),
    actions: {
      set: {
        argument: 'number',
        run: (seconds) => {
          writable()
          commit(durationDraft(agentDuration(seconds, live.current.options), live.current.options))
        },
      },
      clear: () => {
        writable()
        commit({})
      },
    },
  })

  return (
    <div
      ref={groupRef}
      role="group"
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      className={styles.field}
      onBlur={onBlur}
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('readonly', readOnly)}
      {...memberAttr('DurationInput')}
    >
      <div className={styles.segments}>
        {durationSegments(draft, options, messages).map((segment) => {
          const word = (
            <span className={styles.unit} aria-hidden="true">
              {segment.word}
            </span>
          )
          const segmentId = `${uid}-${segment.unit}`
          return (
            <div key={segment.unit} className={styles.quantity}>
              {segment.wordFirst ? word : null}
              <div
                role="spinbutton"
                id={segmentId}
                className={styles.segment}
                // The unit's name, read after the field's name where FormField references one.
                aria-label={segment.name}
                aria-labelledby={
                  labelledBy === undefined ? undefined : `${labelledBy} ${segmentId}`
                }
                aria-describedby={describedBy}
                aria-valuenow={segment.value}
                aria-valuemin={segment.min}
                aria-valuemax={segment.max}
                aria-valuetext={segment.valueText}
                aria-required={required || undefined}
                aria-readonly={readOnly || undefined}
                aria-disabled={disabled || undefined}
                aria-invalid={invalid || undefined}
                // Editable text, so a phone shows its keyboard; the handlers write every change.
                contentEditable={editable || undefined}
                suppressContentEditableWarning
                inputMode="numeric"
                spellCheck={false}
                tabIndex={disabled ? undefined : 0}
                data-segment={segment.unit}
                data-placeholder={segment.placeholder ? '' : undefined}
                data-disabled={disabled ? '' : undefined}
                onKeyDown={(event) => onKeyDown(event, segment.unit)}
                onFocus={() => {
                  typed.current = ''
                }}
              >
                {segment.text}
              </div>
              {segment.wordFirst ? null : word}
            </div>
          )
        })}
      </div>

      {/* The committed value in whole seconds, under `name`. */}
      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={posted === null ? '' : String(posted)}
          disabled={disabled}
        />
      )}
    </div>
  )
}

/**
 * FormField names the group, not a labelable element. `<label for>` cannot target a
 * `role="group"` div, so the field is named by association.
 */
DurationInput.controlKind = 'group' as const
