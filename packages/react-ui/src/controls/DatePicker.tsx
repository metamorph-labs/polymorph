'use client'

import { toCalendarDate, type CalendarDate, type CalendarDateTime } from '@internationalized/date'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { I18nProvider, useDatePicker, useLocale } from 'react-aria'
import { useDatePickerState } from 'react-stately'

import {
  agentDate,
  agentDateTime,
  type ControlSize,
  dataAttrs,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import { SheetSurface, usePhoneViewport } from '../overlays/sheet'
import { TriggerAnchor } from '../overlays/trigger-anchor'
import { Button } from './Button'
import {
  Calendar,
  CALENDAR_MESSAGES,
  type CalendarMessages,
  dateUnavailableAdapter,
  weekStartName,
  type FirstDayOfWeek,
} from './Calendar'
import { DateSegments, type SegmentStyles } from './date-segments'
import styles from '@polymorph/recipes/controls/date-picker.module.css'

/**
 * A date *field* with segmented entry and a calendar popup (`design/components/date-picker.md`).
 *
 * **The field works without the popup.** Segments are the primary input. Arrow keys increment
 * them, typed digits fill them, and a keyboard user never has to open a grid. That is what
 * justifies the vocabulary's most expensive dependency (`design/components/README-substrates.md`)
 * instead of spending 36 KB to render a text box.
 *
 * Focus: this is the *one* allowed focus hand-off under the focus boundary (same file). The
 * segments hold DOM focus while the field is in use. Opening the popup deliberately moves focus
 * into the calendar's roving tab stop, and Escape returns it. Radix manages the overlay's focus on
 * open and close, so there is one focus manager, as everywhere else.
 */

/**
 * Every name the picker uses that `Intl` cannot supply, localizable by passing (WCAG 3.1.2).
 * Calendar's two names are included, because the popup is a Calendar and one catalog entry should
 * reach both.
 */
export interface DatePickerMessages extends CalendarMessages {
  showCalendar: string
  clear: string
  /** The popup's accessible name. */
  chooseDate: string
  /** What an unfilled segment says as its value. Default: React Aria's `Empty`, in the locale. */
  empty?: string
}

const DEFAULT_MESSAGES: DatePickerMessages = {
  ...CALENDAR_MESSAGES,
  showCalendar: 'Show calendar',
  clear: 'Clear',
  chooseDate: 'Choose a date',
}

interface DatePickerBaseProps {
  minValue?: CalendarDate
  maxValue?: CalendarDate
  isDateUnavailable?: (date: CalendarDate) => boolean
  /** Orders the segments as well as naming the months. */
  locale?: string
  firstDayOfWeek?: FirstDayOfWeek
  /** Input's clear button. Clearing returns the segments to their placeholders. */
  clearable?: boolean
  size?: ControlSize
  disabled?: boolean
  invalid?: boolean
  /** Serializes ISO-8601, at the granularity. */
  name?: string
  id?: string
  /** Opens on mount, for galleries and tests. Screens let the user open it. */
  defaultOpen?: boolean
  /** Defaults to generic English. Localized hosts pass strings from their catalog. */
  messages?: DatePickerMessages
  /** Set by FormField. Set it directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
  /**
   * `'auto'` shows the popup as a sheet below `30rem` (the conventions' sheet presentation), with
   * Calendar unchanged inside it. `'popover'` keeps the popover at every width. There is no
   * always-sheet value (`docs/layout.md`). The segments stay the primary input at every width, and
   * the field itself never becomes a sheet.
   */
  presentation?: 'auto' | 'popover'
}

export interface DateOnlyPickerProps extends DatePickerBaseProps {
  granularity?: 'day'
  value?: CalendarDate | null
  defaultValue?: CalendarDate | null
  onChange?: (value: CalendarDate | null) => void
}

/**
 * A time field adds segments, not a new component, and a datetime is the same mechanism with more
 * segments. Time granularities append `time-input.md`'s segments after the date segments. The
 * popup stays a month grid. It sets the date part and leaves the time unchanged (React Aria merges
 * them). The hour cycle follows the locale here. Only TimeInput offers the `hourCycle` override.
 */
export interface DateTimePickerProps extends DatePickerBaseProps {
  granularity: 'hour' | 'minute'
  /**
   * `CalendarDateTime`: the same package's datetime type, without a time zone, never a JS `Date`
   * (Calendar's law). The value type follows the granularity, and React Aria enforces the match at
   * runtime instead of inventing a midnight time.
   */
  value?: CalendarDateTime | null
  defaultValue?: CalendarDateTime | null
  onChange?: (value: CalendarDateTime | null) => void
}

/** Slider's pattern for a value whose type depends on a discriminant. */
export type DatePickerProps = DateOnlyPickerProps | DateTimePickerProps

// This member's classes for the shared segment row (`date-segments.tsx`).
const segmentStyles: SegmentStyles = {
  segments: styles.segments,
  segment: styles.segment,
  separator: styles.separator,
}

/**
 * `locale` is a provider, for the same reason as in Calendar. React Aria's formatters read the
 * locale from context, so a value passed only to the field state would order the segments but
 * leave every name in the app's language.
 */
export function DatePicker(props: DatePickerProps) {
  const { locale: appLocale } = useLocale()

  return (
    <I18nProvider locale={props.locale ?? appLocale}>
      <DateField {...props} />
    </I18nProvider>
  )
}

function DateField({
  value,
  defaultValue,
  onChange,
  minValue,
  maxValue,
  isDateUnavailable,
  locale,
  firstDayOfWeek,
  granularity = 'day',
  clearable = false,
  size = 'md',
  disabled = false,
  invalid = false,
  name,
  id,
  defaultOpen,
  messages = DEFAULT_MESSAGES,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
  presentation = 'auto',
}: DatePickerProps) {
  const { locale: resolvedLocale } = useLocale()
  const groupRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  /**
   * The sheet breakpoint, resolved once (date-picker.md's sheet cell). Under `'auto'`, the popup
   * becomes the shared sheet below `30rem`. `'popover'` keeps the popover at every width. The field
   * itself never becomes a sheet.
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  const shared = {
    value,
    defaultValue,
    /*
     * The union narrows through the granularity discriminant. At `'day'` React Aria emits
     * `CalendarDate`, and at time granularities `CalendarDateTime`. Each branch's handler receives
     * exactly its own type, so the discriminant guarantees that this widening is safe.
     */
    onChange: onChange as ((value: CalendarDate | CalendarDateTime | null) => void) | undefined,
    minValue,
    maxValue,
    isDateUnavailable: dateUnavailableAdapter(isDateUnavailable),
    granularity,
    isDisabled: disabled,
    /*
     * Only when the app sets it. React Aria reads *any* `isInvalid`, including `false`, as "the
     * caller handles validity" and silently drops its own range checking. A value past `maxValue`
     * would then render as valid. The conditional spread keeps `minValue`/`maxValue` effective.
     */
    ...(invalid ? { isInvalid: true } : {}),
    isRequired: required,
    id,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    ...(weekStartName(firstDayOfWeek) === undefined
      ? {}
      : { firstDayOfWeek: weekStartName(firstDayOfWeek) }),
  }

  const state = useDatePickerState({ ...shared, defaultOpen })
  const { groupProps, fieldProps, isInvalid } = useDatePicker(shared, state, groupRef)

  const showClear = clearable && state.value !== null && !disabled

  /*
   * An agent reads the value as ISO text at the granularity and sets it through React Aria's own
   * value, so `onChange` reports it as it reports a person's entry, controlled or not. Text in
   * another form, or a day the field does not allow, is refused. It clears the value, and opens
   * and closes the popup. The field's buttons and the calendar in the popup are the picker's own
   * parts, so the member withholds two regions: the field, and the popup with its calendar while
   * it is open.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'DatePicker',
    element: () => groupRef.current,
    state: () => ({
      value: state.value === null ? '' : state.value.toString(),
      open: state.isOpen,
      disabled,
      invalid: invalid || isInvalid,
    }),
    actions: {
      set: {
        argument: 'text',
        run: (text) => {
          const bounds = { min: minValue, max: maxValue, unavailable: isDateUnavailable }
          state.setValue(
            granularity === 'day'
              ? agentDate(text, bounds)
              : agentDateTime(text, bounds, granularity),
          )
        },
      },
      clear: () => state.setValue(null),
      open: () => state.setOpen(true),
      close: () => state.setOpen(false),
    },
    withholds: () => [groupRef.current, panelRef.current ?? document.getElementById(panelId)],
  })

  /**
   * Focus return for the sheet: one restorer for every close, deferred by one frame. The deferral
   * is needed because selection retargets the calendar's own focus sync. Choosing a day makes it
   * React Aria's focused cell, and that effect runs after this component's (the sheet subtree
   * commits after the field). A restore in the same commit would be overwritten, and focus would be
   * lost with the closing panel. The popover path does not have this problem, because Radix's
   * `onCloseAutoFocus` fires after everything else. The deferral reproduces that timing. The anchor
   * span is queried the same way `TriggerAnchor` queries it. In the sheet path the anchor's own
   * restore is not enabled (no `open` prop), so there is exactly one restorer.
   */
  const anchorRef = useRef<HTMLSpanElement>(null)
  const restoreArmed = useRef(false)
  useEffect(() => {
    if (state.isOpen) {
      restoreArmed.current = sheeting
      return
    }
    if (!restoreArmed.current) return
    restoreArmed.current = false
    requestAnimationFrame(() => {
      const control = anchorRef.current?.querySelector('button')
      if (control instanceof HTMLElement) control.focus()
    })
  }, [state.isOpen, sheeting])

  const calendarTrigger = (
    <Button
      variant="ghost"
      tone="neutral"
      size={size}
      iconOnly
      icon="calendar"
      label={messages.showCalendar}
      disabled={disabled}
    />
  )

  /*
    Wired from the state rather than spread from `useDatePicker`'s `calendarProps`. Those props
    carry a `DateValue` where the vocabulary uses `CalendarDate`, and an `autoFocus` that this
    component handles itself (each path's hand-off below). `setDateValue` closes the popup on a
    choice. At a time granularity it also merges: the grid sets the date part and leaves the time
    unchanged, because React Aria combines the chosen day with the existing time value. The same
    wiring serves both paths, because the sheet is a different container around the same calendar.
  */
  const calendar = (
    <Calendar
      value={state.dateValue === null ? null : toCalendarDate(state.dateValue)}
      onChange={(date) => {
        if (date !== null) state.setDateValue(date)
      }}
      minValue={minValue}
      maxValue={maxValue}
      isDateUnavailable={isDateUnavailable}
      locale={locale}
      firstDayOfWeek={firstDayOfWeek}
      messages={messages}
      aria-label={messages.chooseDate}
    />
  )

  const field = (
    <div
      {...groupProps}
      ref={groupRef}
      className={styles.field}
      {...dataAttrs({
        size,
        disabled,
        invalid: invalid || isInvalid,
        state: state.isOpen ? 'open' : 'closed',
      })}
      {...memberAttr('DatePicker')}
    >
      <DateSegments
        fieldProps={fieldProps}
        locale={resolvedLocale}
        size={size}
        disabled={disabled}
        styles={segmentStyles}
        empty={messages.empty}
      />

      {name === undefined ? null : (
        <input
          type="hidden"
          name={name}
          value={state.value === null ? '' : state.value.toString()}
          disabled={disabled || undefined}
        />
      )}

      {showClear ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={messages.clear}
          onKeyDown={keepKeysFromField}
          onClick={() => {
            state.setValue(null)
            focusFirstSegment(groupRef.current)
          }}
        >
          <Icon name="clear" size={size} />
        </button>
      ) : null}

      {/* Inside the field, with the clear slot's geometry, because the button belongs to the
          field, not beside it. In the sheet path there is no Radix root to wire the trigger, so
          the anchor sets the attributes itself, as Menu does. Focus returns through the same span
          on every close, which is this member's restore rule. The anchor keeps Enter and Space
          from the field's press handler, so they reach the button and open the popup through
          the same click a pointer press makes. */}
      {sheeting ? (
        <TriggerAnchor
          ref={anchorRef}
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          aria-controls={state.isOpen ? panelId : undefined}
          onClick={() => {
            if (!disabled) state.setOpen(!state.isOpen)
          }}
          onKeyDown={keepKeysFromField}
        >
          {calendarTrigger}
        </TriggerAnchor>
      ) : (
        <PopoverPrimitive.Trigger asChild>
          <TriggerAnchor open={state.isOpen} onKeyDown={keepKeysFromField}>
            {calendarTrigger}
          </TriggerAnchor>
        </PopoverPrimitive.Trigger>
      )}
    </div>
  )

  if (sheeting) {
    return (
      <>
        {field}
        {/*
          The sheet (date-picker.md's cell, using the conventions' sheet presentation), with
          Calendar unchanged inside it. The popup takes focus deliberately (the one allowed
          hand-off), so the sheet keeps its focus trap and identifies itself as a named dialog,
          modal while shown. Escape dismisses through the shared sheet and the anchor restores focus
          to the trigger. Selection closes through `setDateValue`, as in the popover.
        */}
        <SheetSurface
          open={state.isOpen}
          onDismiss={() => state.setOpen(false)}
          role="dialog"
          aria-modal
          aria-label={messages.chooseDate}
        >
          <SheetHandOff id={panelId} className={styles.sheetBody} member="DatePicker">
            {calendar}
          </SheetHandOff>
        </SheetSurface>
      </>
    )
  }

  return (
    <PopoverPrimitive.Root open={state.isOpen} onOpenChange={state.setOpen}>
      <PopoverPrimitive.Anchor asChild>{field}</PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        {/* End-aligned, because the grid is wider than the field, and aligning its end with the
            trigger keeps it near the pointer that opened it. */}
        <PopoverPrimitive.Content
          ref={panelRef}
          className={styles.content}
          side="bottom"
          align="end"
          sideOffset={2}
          aria-label={messages.chooseDate}
          onOpenAutoFocus={(event) => {
            // The focus hand-off. Radix would focus the first tabbable element, the previous-month
            // button, and the user would land one control before the grid. The calendar is a
            // roving tab stop by design, so its single focusable descendant *is* the focused day.
            event.preventDefault()
            const day = (event.currentTarget as HTMLElement).querySelector('[tabindex="0"]')
            if (day instanceof HTMLElement) day.focus()
          }}
          {...memberAttr('DatePicker')}
        >
          {calendar}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * Stops Enter and Space on a button inside the field from reaching the field's press handler.
 *
 * `useDatePicker` makes the whole field pressable (`usePress`), so that a press anywhere on it
 * moves focus to a segment. That handler acts on Enter and Space from every element inside the
 * field and prevents their default action. On a native button the default action is the click the
 * browser fires on Enter keydown and on Space keyup. Without this handler, the calendar trigger and
 * the clear button do nothing from the keyboard. React Aria's own buttons are not affected, because
 * each one is a `usePress` responder that stops the key's propagation before the field receives
 * it. This handler does the same for this member's native buttons, and the browser's click then
 * runs the handler a pointer press runs.
 *
 * A key handler is used because React Aria's button hook cannot reach the trigger. The trigger is
 * Button, whose closed props take neither a ref nor `useButton`'s DOM props. `usePress` on the
 * anchor around it would also handle the pointer path: it stops the pointer events the field uses
 * to place focus, and it opens the popup a second time beside Radix's click. The segments do not
 * use this handler, so Enter, digits and Alt+ArrowDown in a segment keep React Aria's behaviour.
 * Exported for the range picker, whose field is pressable for the same reason.
 */
export function keepKeysFromField(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
}

/**
 * Focus after a clear: the field's first segment, as Input's clear returns focus to its input.
 * The clear button unmounts once the value is empty, so without this a keyboard clear would leave
 * focus on the page body. Exported for the range picker's clear.
 */
export function focusFirstSegment(field: HTMLElement | null): void {
  const segment = field?.querySelector('[data-segment]')
  if (segment instanceof HTMLElement) segment.focus()
}

/**
 * The sheet's opening focus hand-off: the popover's `onOpenAutoFocus`, unchanged, as a mount
 * effect. The calendar is a roving tab stop by design, so its single focusable descendant *is* the
 * focused day. Child effects run before the shared sheet's fallback, so the day already has focus
 * when the sheet checks (sheet.tsx). Exported for the range picker, whose spec reuses this
 * member's hand-off unchanged.
 */
export function SheetHandOff({
  id,
  className,
  member,
  children,
}: {
  id: string
  className: string | undefined
  /** The picker this panel belongs to. A portalled surface carries its own member name. */
  member: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const day = ref.current?.querySelector('[tabindex="0"]')
    if (day instanceof HTMLElement) day.focus()
  }, [])

  return (
    <div ref={ref} id={id} className={className} {...memberAttr(member)}>
      {children}
    </div>
  )
}

/**
 * FormField names the *group*, not a labelable element. `<label for>` cannot target a
 * `role="group"` div, so the field is named by association.
 */
DatePicker.controlKind = 'group' as const
