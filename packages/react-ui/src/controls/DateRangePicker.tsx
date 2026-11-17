'use client'

import {
  createCalendar,
  getLocalTimeZone,
  isSameDay,
  isToday,
  startOfWeek,
  type CalendarDate,
} from '@internationalized/date'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  I18nProvider,
  useCalendarCell,
  useCalendarGrid,
  useDateFormatter,
  useDateRangePicker,
  useLocale,
  useRangeCalendar,
} from 'react-aria'
import {
  useDateRangePickerState,
  useRangeCalendarState,
  type RangeCalendarState,
} from 'react-stately'

import {
  agentDateRange,
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
  CALENDAR_MESSAGES,
  type CalendarMessages,
  dateUnavailableAdapter,
  weekStartName,
  type FirstDayOfWeek,
} from './Calendar'
import { focusFirstSegment, keepKeysFromField, SheetHandOff } from './DatePicker'
import { DateSegments, type SegmentStyles } from './date-segments'
import styles from '@polymorph/recipes/controls/date-range-picker.module.css'

/**
 * A date range *field* with two segmented entries and a calendar popup
 * (`design/components/date-range-picker.md`). A range changes the value shape, the cell states and
 * the keyboard model together, so it is a separate member rather than a DatePicker mode.
 *
 * Radix owns the overlay and the React Aria hooks own the collection (the focus boundary in
 * `design/components/README-substrates.md`). The one allowed focus hand-off, from trigger to
 * calendar and back, is DatePicker's, unchanged.
 *
 * **No presets.** "Last 30 days" chips are FilterBar's controls, by the same rule as the chart
 * brush: a picker with its own presets would become a second place where range state lives. An
 * app's preset writes *into* this member by setting `value`.
 *
 * React Aria's `allowsNonContiguousRanges` is deliberately not exposed, because a range with gaps
 * is really two values in one. When unavailable dates fall inside the span, React Aria instead
 * limits the range to the contiguous run around the anchor, which reflects what can be selected.
 */

/** The value shape: react-aria's RangeValue, written as a closed type. */
export interface DateRange {
  start: CalendarDate
  end: CalendarDate
}

/**
 * DatePicker's messages, with the popup's name reworded for a range. These are every name the
 * picker uses that `Intl` cannot supply, localizable by passing (WCAG 3.1.2).
 */
export interface DateRangePickerMessages extends CalendarMessages {
  showCalendar: string
  clear: string
  /** The popup's accessible name. */
  chooseRange: string
}

const DEFAULT_MESSAGES: DateRangePickerMessages = {
  ...CALENDAR_MESSAGES,
  showCalendar: 'Show calendar',
  clear: 'Clear',
  chooseRange: 'Choose a date range',
}

export interface DateRangePickerProps {
  /**
   * Both ends or `null`. A half-entered range is never reported. `onChange` fires when the second
   * end is committed, and clearing reports `null`. Uses `CalendarDate`, never `Date` (Calendar's
   * law).
   */
  value?: DateRange | null
  defaultValue?: DateRange | null
  onChange?: (value: DateRange | null) => void
  /**
   * react-aria's validation, forwarded. A typed date outside the bounds marks the field invalid.
   * React Aria marks a reversed pair (end before start) invalid on both halves.
   */
  minValue?: CalendarDate
  maxValue?: CalendarDate
  isDateUnavailable?: (date: CalendarDate) => boolean
  /** Also orders the segments and picks the separators. */
  locale?: string
  firstDayOfWeek?: FirstDayOfWeek
  /** DatePicker's clear button: reports `onChange(null)` and resets both groups to placeholders. */
  clearable?: boolean
  size?: ControlSize
  disabled?: boolean
  invalid?: boolean
  id?: string
  /**
   * Two hidden inputs serialize ISO-8601, as DatePicker does, once per end, because one `name`
   * cannot carry two values.
   */
  startName?: string
  endName?: string
  /** Opens on mount, for galleries and tests. Screens let the user open it. */
  defaultOpen?: boolean
  /** Defaults to generic English. Localized hosts pass strings from their catalog. */
  messages?: DateRangePickerMessages
  /** Set by FormField. Set it directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
  /**
   * Same as DatePicker (`date-picker.md`, the conventions' sheet presentation). `'auto'` shows the
   * popup as a sheet below `30rem`, with RangeCalendar unchanged inside it. `'popover'` keeps the
   * popover at every width. The anchored-range keyboard model, the two-stage Escape and the focus
   * hand-off work the same after re-anchoring.
   */
  presentation?: 'auto' | 'popover'
}

// This member's classes for the shared segment rows (`date-segments.tsx`).
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
export function DateRangePicker(props: DateRangePickerProps) {
  const { locale: appLocale } = useLocale()

  return (
    <I18nProvider locale={props.locale ?? appLocale}>
      <RangeField {...props} />
    </I18nProvider>
  )
}

function RangeField({
  value,
  defaultValue,
  onChange,
  minValue,
  maxValue,
  isDateUnavailable,
  firstDayOfWeek,
  clearable = false,
  size = 'md',
  disabled = false,
  invalid = false,
  id,
  startName,
  endName,
  defaultOpen,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
  presentation = 'auto',
  messages = DEFAULT_MESSAGES,
}: DateRangePickerProps) {
  const { locale: resolvedLocale } = useLocale()
  const groupRef = useRef<HTMLDivElement>(null)
  const weekStart = weekStartName(firstDayOfWeek)
  const panelId = useId()

  /**
   * The sheet breakpoint, resolved once (the spec's presentation row, same as DatePicker). Under
   * `'auto'`, the popup becomes a sheet below `30rem`. `'popover'` keeps the popover at every
   * width. The field itself never becomes a sheet.
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'auto' && phone

  const shared = {
    value,
    defaultValue,
    onChange,
    minValue,
    maxValue,
    isDateUnavailable: dateUnavailableAdapter(isDateUnavailable),
    isDisabled: disabled,
    /*
     * Only when the app sets it, as in DatePicker. React Aria reads *any* `isInvalid`, including
     * `false`, as "the caller handles validity", and would silently drop its own range checking.
     * That includes the reversed-pair check this member relies on.
     */
    ...(invalid ? { isInvalid: true } : {}),
    isRequired: required,
    id,
    startName,
    endName,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    ...(weekStart === undefined ? {} : { firstDayOfWeek: weekStart }),
  }

  const state = useDateRangePickerState({ ...shared, defaultOpen })
  const { groupProps, startFieldProps, endFieldProps, calendarProps } = useDateRangePicker(
    shared,
    state,
    groupRef,
  )

  /*
   * The range grid's state is created here rather than inside the popup, so the Escape check below
   * can read the anchor. `autoFocus` is removed from the props, because the hand-off is done
   * deliberately in `onOpenAutoFocus`. Two focus managers competing for the same cell is the
   * failure the focus boundary exists to prevent.
   */
  const { autoFocus: _autoFocus, ...rangeCalendarProps } = calendarProps
  const rangeState = useRangeCalendarState({
    ...rangeCalendarProps,
    locale: resolvedLocale,
    createCalendar,
  })

  const committed = state.value?.start != null && state.value?.end != null
  const showClear = clearable && committed && !disabled

  /*
   * An agent reads the range as one ISO text, start and end joined by `/`, as the member's value
   * is one range, and sets it through React Aria's own value, so `onChange` reports it as it
   * reports a person's committed range, controlled or not. Text in another form, an end before
   * its start, or a day the field does not allow, is refused. It clears the range, and opens and
   * closes the popup. The field's buttons and the calendar in the popup are the picker's own
   * parts, so the member withholds two regions: the field, and the popup while it is open.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'DateRangePicker',
    element: () => groupRef.current,
    state: () => ({
      value: committed ? `${String(state.value?.start)}/${String(state.value?.end)}` : '',
      open: state.isOpen,
      disabled,
      invalid: invalid || state.isInvalid,
    }),
    actions: {
      set: {
        argument: 'text',
        run: (text) =>
          state.setValue(
            agentDateRange(text, { min: minValue, max: maxValue, unavailable: isDateUnavailable }),
          ),
      },
      clear: () => state.setValue(null),
      open: () => state.setOpen(true),
      close: () => state.setOpen(false),
    },
    withholds: () => [groupRef.current, panelRef.current ?? document.getElementById(panelId)],
  })

  /**
   * Focus return for the sheet, the same as DatePicker and for the same reason. Committing an end
   * retargets the grid's own focus sync to the chosen cell after this component's effects have
   * run. So the restore waits one frame, matching when Radix's `onCloseAutoFocus` runs in the
   * popover path. There is one restorer, because the anchor's own restore is not enabled here.
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

  /* One grid for both paths. The sheet is a different container around the same calendar, and the
     state lives here so the Escape checks below read the same anchor in both. */
  const rangeCalendar = (
    <RangeCalendar
      state={rangeState}
      calendarProps={{ ...rangeCalendarProps, 'aria-label': messages.chooseRange }}
      firstDayOfWeek={firstDayOfWeek}
      disabled={disabled}
      messages={messages}
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
        invalid: invalid || state.isInvalid,
        state: state.isOpen ? 'open' : 'closed',
      })}
      {...memberAttr('DateRangePicker')}
    >
      <DateSegments
        fieldProps={startFieldProps}
        locale={resolvedLocale}
        size={size}
        disabled={disabled}
        styles={segmentStyles}
      />

      {/* A visual separator only. React Aria names the halves for screen readers ("Start Date" /
          "End Date"), so the punctuation carries no meaning. */}
      <span className={styles.dash} aria-hidden="true">
        –
      </span>

      <DateSegments
        fieldProps={endFieldProps}
        locale={resolvedLocale}
        size={size}
        disabled={disabled}
        styles={segmentStyles}
      />

      <span className={styles.spacer} />

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
          field, not beside it. In the sheet path the anchor sets the attributes itself (as in
          DatePicker) and restores focus on every close. The anchor keeps Enter and Space from the
          range field's press handler, as in DatePicker (`keepKeysFromField`). */}
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
          The sheet (the spec's presentation row, using the conventions' sheet presentation), with
          RangeCalendar unchanged inside it. It is a dialog with a focus trap, for DatePicker's
          reason: the popup takes focus deliberately, so the sheet keeps its trap and identifies
          itself as a dialog. Escape is still two-stage. The grid's own handler has already
          cancelled an in-progress range by the time the panel checks, so the check reads the
          anchor from this render. A non-null anchor keeps the sheet open for the cancelling
          press, and the next press closes it.
        */}
        <SheetSurface
          open={state.isOpen}
          onDismiss={() => state.setOpen(false)}
          holdEscape={() => rangeState.anchorDate !== null}
          role="dialog"
          aria-modal
          aria-label={messages.chooseRange}
        >
          <SheetHandOff id={panelId} className={styles.sheetBody} member="DateRangePicker">
            {rangeCalendar}
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
          aria-label={messages.chooseRange}
          onOpenAutoFocus={(event) => {
            // The focus hand-off, the same as DatePicker. The calendar is a roving tab stop, so its
            // single focusable descendant *is* the focused day.
            event.preventDefault()
            const day = (event.currentTarget as HTMLElement).querySelector('[tabindex="0"]')
            if (day instanceof HTMLElement) day.focus()
          }}
          onEscapeKeyDown={(event) => {
            /*
             * Escape is two-stage (as in the chart brush). Stage one belongs to React Aria. With an
             * anchor set, the grid's own handler cancels the range in progress and keeps the
             * committed value, so the popup must not also close on the same press. Radix checks in
             * the document's capture phase, before the grid's handler runs, so this check reads the
             * anchor instead of relying on `defaultPrevented`. Stage two, with no anchor, falls
             * through and closes.
             */
            if (rangeState.anchorDate !== null) event.preventDefault()
          }}
          {...memberAttr('DateRangePicker')}
        >
          {rangeCalendar}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * The popup's grid. It uses Calendar's full anatomy (header, real `<table>`, roving tab stop, no
 * days from other months), with the range cell states below. It is not a public member.
 * `date-range-picker.md` is its spec, and the standalone month grid remains `Calendar`.
 */
function RangeCalendar({
  state,
  calendarProps,
  firstDayOfWeek,
  disabled,
  messages,
}: {
  state: RangeCalendarState
  calendarProps: Parameters<typeof useRangeCalendar>[0]
  firstDayOfWeek: FirstDayOfWeek | undefined
  disabled: boolean
  messages: CalendarMessages
}) {
  const { locale: resolvedLocale } = useLocale()
  const ref = useRef<HTMLDivElement>(null)
  const weekStartsOn = weekStartName(firstDayOfWeek)

  const { calendarProps: rootProps, title } = useRangeCalendar(calendarProps, state, ref)
  const { gridProps, headerProps, weekDays, weeksInMonth } = useCalendarGrid(
    {
      weekdayStyle: 'short',
      ...(weekStartsOn === undefined ? {} : { firstDayOfWeek: weekStartsOn }),
    },
    state,
  )

  /**
   * Full weekday names as the column headers' accessible labels, for Calendar's reason. A screen
   * reader user who hears "M, T, W" across the `<th>`s does not hear weekdays.
   */
  const longWeekday = useDateFormatter({ weekday: 'long', timeZone: state.timeZone })
  const weekdayNames = useMemo(() => {
    const first = startOfWeek(state.visibleRange.start, resolvedLocale, weekStartsOn)
    return [0, 1, 2, 3, 4, 5, 6].map((offset) =>
      longWeekday.format(first.add({ days: offset }).toDate(state.timeZone)),
    )
    // `longWeekday` is a new formatter object on every render, but its output depends only on the
    // dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.visibleRange.start, state.timeZone, resolvedLocale, weekStartsOn])

  /**
   * The direction the month moved, so the incoming grid enters from that side. This restates
   * Calendar's render-time derivation for the same reason: an effect runs after paint, one render
   * too late to set the direction.
   */
  const start = state.visibleRange.start
  const [previousStart, setPreviousStart] = useState(start)
  const [lastTravel, setLastTravel] = useState<'next' | 'previous'>('next')
  const moved = start.compare(previousStart)
  if (moved !== 0) {
    setPreviousStart(start)
    setLastTravel(moved > 0 ? 'next' : 'previous')
  }
  const travel = moved === 0 ? lastTravel : moved > 0 ? 'next' : 'previous'

  return (
    <div {...rootProps} ref={ref} className={styles.root}>
      <div className={styles.header}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconOnly
          icon="previous"
          label={messages.previousMonth}
          disabled={disabled || state.isPreviousVisibleRangeInvalid()}
          onClick={() => state.focusPreviousPage()}
        />
        <span className={styles.title} aria-live="polite">
          {title}
        </span>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          iconOnly
          icon="next"
          label={messages.nextMonth}
          disabled={disabled || state.isNextVisibleRangeInvalid()}
          onClick={() => state.focusNextPage()}
        />
      </div>

      {/* Keyed on the month so the enter animation runs again when the grid is replaced, as in
          Calendar. */}
      <table
        {...gridProps}
        key={`${start.year}-${start.month}`}
        className={styles.grid}
        data-travel={travel}
      >
        <thead {...headerProps}>
          <tr>
            {weekDays.map((day, index) => (
              <th key={weekdayNames[index] ?? day} scope="col" aria-label={weekdayNames[index]}>
                <span aria-hidden="true">{day}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...new Array(weeksInMonth).keys()].map((week) => (
            <tr key={week}>
              {state.getDatesInWeek(week).map((date, index) =>
                date && inVisibleMonth(date, state) ? (
                  <RangeDay key={date.toString()} date={date} state={state} />
                ) : (
                  // Days from neighbouring months invite mis-clicks, so the month ends at its last
                  // day (Calendar's rule).
                  <td key={date ? date.toString() : `empty-${index}`} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Whether the date is in the visible month. The first and last weeks straddle two months. */
function inVisibleMonth(date: CalendarDate, state: RangeCalendarState): boolean {
  return date.compare(state.visibleRange.start) >= 0 && date.compare(state.visibleRange.end) <= 0
}

/**
 * One day of the range grid.
 *
 * The cells carry `data-range-start` / `data-range-middle` / `data-range-end` **instead of**
 * `data-selected`. A range cell states its role in the range, not only that it is selected. The
 * single-date attribute stays Calendar's. A one-day range has both endpoint attributes on one
 * cell. The attributes come from `highlightedRange`, which is also the anchored preview. While
 * selecting, the cells between the anchor and the focused date get the same three attributes,
 * because the preview *is* the range being made.
 */
function RangeDay({ date, state }: { date: CalendarDate; state: RangeCalendarState }) {
  const ref = useRef<HTMLDivElement>(null)
  const { cellProps, buttonProps, isSelected, isDisabled, isUnavailable, isOutsideVisibleRange } =
    useCalendarCell({ date }, state, ref)
  const today = isToday(date, state.timeZone ?? getLocalTimeZone())

  const range = state.highlightedRange
  const isStart = isSelected && range != null && isSameDay(date, range.start)
  const isEnd = isSelected && range != null && isSameDay(date, range.end)

  return (
    <td {...cellProps} className={styles.cell}>
      <div
        {...buttonProps}
        ref={ref}
        className={styles.day}
        // The part hook the conformance runner locates a day by, as in Calendar.
        data-calendar-part="day"
        // Today is not a selection. At an endpoint, the selection styling wins and `aria-current`
        // still marks today.
        aria-current={today ? 'date' : undefined}
        data-range-start={isStart ? '' : undefined}
        data-range-middle={isSelected && !isStart && !isEnd ? '' : undefined}
        data-range-end={isEnd ? '' : undefined}
        data-today={today ? '' : undefined}
        data-unavailable={isUnavailable ? '' : undefined}
        data-disabled={isDisabled ? '' : undefined}
        data-outside-month={isOutsideVisibleRange ? '' : undefined}
      >
        {date.day}
      </div>
    </td>
  )
}

/**
 * FormField names the *group*, not a labelable element. `<label for>` cannot target a
 * `role="group"` div, so the field is named by association. React Aria names the halves
 * "Start Date" / "End Date" within it, so a screen reader announces "Report range, Start Date,
 * month…". The en-dash carries no meaning.
 */
DateRangePicker.controlKind = 'group' as const
