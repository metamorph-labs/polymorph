'use client'

import {
  createCalendar,
  getLocalTimeZone,
  isToday,
  startOfWeek,
  toCalendarDate,
  type CalendarDate,
  type DateValue,
} from '@internationalized/date'
import { useMemo, useRef, useState } from 'react'
import {
  I18nProvider,
  useCalendar,
  useCalendarCell,
  useCalendarGrid,
  useDateFormatter,
  useLocale,
} from 'react-aria'
import { useCalendarState, type CalendarState } from 'react-stately'

import { Button } from './Button'
import styles from '@polymorph/recipes/controls/calendar.module.css'
import { agentDate, memberAttr, useAgentMember } from '@polymorph/react'

/**
 * A month grid for choosing a date (`design/components/calendar.md`).
 *
 * **Intl rules:** every date here is an `@internationalized/date` `CalendarDate`, never a JS
 * `Date`, because a `Date` at a package boundary causes timezone bugs. Month and weekday names
 * come from `Intl.DateTimeFormat`. The week's first day comes from the locale and can be
 * overridden. Navigation mirrors under RTL. Strings the platform cannot supply are props. There
 * is deliberately no translation infrastructure.
 *
 * Single-date selection only. A range changes the value shape, the cell states and the keyboard
 * model together, so it is a separate member (DateRangePicker) rather than a mode.
 */

/** The spec's API uses `0`–`6`. React Aria expects the day name. */
const WEEK_START = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type FirstDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Shared with DatePicker, which orders its segments from the same locale. */
export function weekStartName(day: FirstDayOfWeek | undefined) {
  return day === undefined ? undefined : WEEK_START[day]
}

/**
 * React Aria's predicate takes any `DateValue`. The member's predicate takes only the type it can
 * receive. `granularity` is `'day'` and the value type is `CalendarDate`, so the conversion loses
 * nothing. It converts rather than casts, so the type is narrowed instead of asserted.
 */
export function dateUnavailableAdapter(
  predicate: ((date: CalendarDate) => boolean) | undefined,
): ((date: DateValue) => boolean) | undefined {
  return predicate === undefined ? undefined : (date) => predicate(toCalendarDate(date))
}

/**
 * The two names the platform cannot supply. Month and weekday names come from `Intl`, but
 * "previous month" does not, so it is a prop (WCAG 3.1.2).
 */
export interface CalendarMessages {
  previousMonth: string
  nextMonth: string
}

export const CALENDAR_MESSAGES: CalendarMessages = {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
}

export interface CalendarProps {
  value?: CalendarDate | null
  defaultValue?: CalendarDate | null
  onChange?: (value: CalendarDate | null) => void
  minValue?: CalendarDate
  maxValue?: CalendarDate
  /** App policy, such as booked-out days. Unavailable is not the same as disabled. */
  isDateUnavailable?: (date: CalendarDate) => boolean
  /** Drives names, numbering and the week's first day. Defaults to the app's. */
  locale?: string
  /** Overrides the locale's first day of the week. */
  firstDayOfWeek?: FirstDayOfWeek
  /** Controlled month navigation, for apps that need it. */
  focusedValue?: CalendarDate
  onFocusChange?: (date: CalendarDate) => void
  /** Disables the whole grid. */
  disabled?: boolean
  /** Defaults to generic English. Localized hosts pass strings from their catalog. */
  messages?: CalendarMessages
  /** Names the calendar from outside, as DatePicker's popup does. */
  'aria-label'?: string
  'aria-labelledby'?: string
}

/**
 * Applies the `locale` prop.
 *
 * React Aria's formatting hooks read the locale from *context*, not from the state option. A
 * `locale` passed only to `useCalendarState` would change the week's start but leave the month
 * name in the app's language. So the prop becomes a provider, and the grid reads it back through
 * `useLocale` like any other consumer. The wrapper adds no DOM, so the root is still the calendar.
 */
export function Calendar(props: CalendarProps) {
  const { locale: appLocale } = useLocale()

  return (
    <I18nProvider locale={props.locale ?? appLocale}>
      <CalendarGrid {...props} />
    </I18nProvider>
  )
}

function CalendarGrid({
  value,
  defaultValue,
  onChange,
  minValue,
  maxValue,
  isDateUnavailable,
  firstDayOfWeek,
  focusedValue,
  onFocusChange,
  disabled = false,
  messages = CALENDAR_MESSAGES,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
}: CalendarProps) {
  const { locale: resolvedLocale } = useLocale()
  const weekStartsOn = weekStartName(firstDayOfWeek)

  const shared = {
    value,
    defaultValue,
    onChange,
    minValue,
    maxValue,
    isDateUnavailable: dateUnavailableAdapter(isDateUnavailable),
    focusedValue,
    onFocusChange,
    isDisabled: disabled,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    ...(weekStartsOn === undefined ? {} : { firstDayOfWeek: weekStartsOn }),
  }

  const state = useCalendarState({ ...shared, locale: resolvedLocale, createCalendar })
  const { calendarProps, title } = useCalendar(shared, state)
  const { gridProps, headerProps, weekDays, weeksInMonth } = useCalendarGrid(
    {
      weekdayStyle: 'short',
      ...(weekStartsOn === undefined ? {} : { firstDayOfWeek: weekStartsOn }),
    },
    state,
  )

  /**
   * Full weekday names, used as the column headers' accessible labels. A screen reader user who
   * hears "M, T, W" across the `<th>`s does not hear weekdays. The visible abbreviation stays. Only
   * the accessible name changes.
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
   * The direction the month moved, so the incoming grid enters from that side.
   *
   * It is adjusted *during* render rather than in an effect, which is React's pattern for state
   * derived from a change. An effect runs after paint, and by then the new month has already
   * animated in from the previous direction. `moved` covers the render in which the change
   * happens, and the state covers every render after it.
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

  /*
   * An agent reads the chosen date as ISO text and sets it, through React Aria's own value, so
   * `onChange` reports it as it reports a person's choice, controlled or not. The grid then shows
   * the date's month. Text that is not a date, or a day the calendar does not allow, is refused.
   * The month buttons are the calendar's own parts, so the calendar withholds them.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'Calendar',
    element: () => rootRef.current,
    state: () => ({
      value: state.value === null ? '' : toCalendarDate(state.value).toString(),
      disabled,
    }),
    actions: {
      set: {
        argument: 'text',
        run: (text) => {
          const date = agentDate(text, {
            min: minValue,
            max: maxValue,
            unavailable: isDateUnavailable,
          })
          state.setValue(date)
          state.setFocusedDate(date)
        },
      },
    },
    withholds: () => rootRef.current,
  })

  return (
    <div ref={rootRef} {...calendarProps} className={styles.root} {...memberAttr('Calendar')}>
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
        {/* Live, because the grid cannot announce a month change itself. The cells below just
            show other dates. */}
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

      {/* Keyed on the month so the enter animation runs again. A CSS animation belongs to an
          element, so each month needs a new element. */}
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
                  <CalendarDay key={date.toString()} date={date} state={state} />
                ) : (
                  // Days from neighbouring months invite mis-clicks, so the month ends at its last
                  // day. This cell only holds the column. React Aria returns the neighbouring
                  // month's days for the first and last weeks and can render them greyed out. The
                  // spec says not to render them.
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
function inVisibleMonth(date: CalendarDate, state: CalendarState): boolean {
  return date.compare(state.visibleRange.start) >= 0 && date.compare(state.visibleRange.end) <= 0
}

/**
 * One day.
 *
 * `data-selected` marks the chosen date and stays after the pointer leaves. `:hover` is a
 * temporary wash. They use different token families so that selected and hovered look different,
 * which is the reason the selection roles exist.
 */
function CalendarDay({ date, state }: { date: CalendarDate; state: CalendarState }) {
  const ref = useRef<HTMLDivElement>(null)
  const { cellProps, buttonProps, isSelected, isDisabled, isUnavailable, isOutsideVisibleRange } =
    useCalendarCell({ date }, state, ref)
  const today = isToday(date, state.timeZone ?? getLocalTimeZone())

  return (
    <td {...cellProps} className={styles.cell}>
      <div
        {...buttonProps}
        ref={ref}
        className={styles.day}
        // The part hook the conformance runner locates a day by, so it does not
        // depend on React Aria's table markup.
        data-calendar-part="day"
        // Today is not a selection. It is announced as `aria-current` and drawn as a border, never
        // as a fill.
        aria-current={today ? 'date' : undefined}
        data-selected={isSelected ? '' : undefined}
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
