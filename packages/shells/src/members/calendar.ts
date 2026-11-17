import {
  cond,
  describeMember,
  each,
  el,
  flag,
  identity,
  js,
  lit,
  member,
  run,
  text,
  when,
} from '../dsl'

import { BROWSER_LANGUAGE, DAY_NAME, LANGUAGE, readBrowserLanguage } from '../date-field'

/** A fixed date, constructed by the machine's module, so a gallery cell does not change monthly. */
const date = (iso: string) => js(`zag.parse('${iso}') as zag.CalendarDate`)

const JULY = date('2026-07-15')

/** Weekends, the usual shape of a booked-out predicate. */
const weekendsOut = js(
  "(date: zag.CalendarDate) => [0, 6].includes(date.toDate('UTC').getUTCDay())",
)

/**
 * Calendar (`design/components/calendar.md`): a month grid for choosing one
 * date. Zag's date-picker machine, inline, owns the value, the focused day,
 * the visible month, the arrow, Page and Home/End keys and the day names.
 *
 * Every date is the machine's `CalendarDate` (`@internationalized/date`, which
 * the machine re-exports), never a JS `Date`. Month and weekday names come
 * from `Intl` in `locale`, which defaults to `en-US` until the calendar mounts
 * and to the browser's language after, as React Aria's does; the week's first
 * day comes from the locale unless `firstDayOfWeek` names it.
 *
 * The day attributes are React's: `data-disabled` marks a day the calendar
 * cannot choose because it is disabled or outside `minValue`/`maxValue`,
 * `data-unavailable` a day the app's predicate refuses, and a day that is
 * either is never `data-selected`. The machine reads both kinds as one, so the
 * description writes them from the day's own state. Days of the neighbouring
 * months are not rendered: their cells only hold the columns.
 *
 * A day's name is React Aria's: the date, with `Today`, `selected` and the
 * first or last day that can be chosen said in words. The words are English,
 * which React Aria localizes, so a calendar in another language names a day by
 * its date alone rather than in two languages; the cell's `aria-selected` and
 * the day's `aria-current` say the same there. A month button that becomes
 * disabled while it holds focus hands focus to the grid's focused day, as
 * React Aria's calendar does, so focus never falls to the page.
 */
export default describeMember({
  member: 'Calendar',
  dir: 'controls',
  recipe: 'controls/calendar',
  types: {
    FirstDayOfWeek: "NonNullable<CalendarProps['firstDayOfWeek']>",
    CalendarDate: 'zag.CalendarDate',
    CalendarMessages: '{ previousMonth: string; nextMonth: string }',
  },
  defaults: { disabled: 'false' },
  state: {
    ...BROWSER_LANGUAGE,
    // The direction the visible month last moved, so the incoming grid enters from that side.
    travel: "'next'",
    // The first day of the month on screen, as ISO text, which orders as dates do.
    shownMonth: "''",
    // Whether a month button holds focus, or lost it by becoming disabled.
    monthButton: 'false',
  },
  derived: {
    say: "messages ?? { previousMonth: 'Previous month', nextMonth: 'Next month' }",
    language: LANGUAGE,
    english: "language.toLowerCase().startsWith('en')",
    // Today is the reader's today, in the reader's time zone.
    zone: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
    // The calendar's name and the grid's: the caller's name, then the month on screen.
    named: "[ariaLabel, api.visibleRangeText.formatted].filter(Boolean).join(', ')",
    // React Aria's words for a day, in English only (`DAY_NAME`).
    dayName: DAY_NAME,
    monthButtonsOff:
      '`${api.getPrevTriggerProps().disabled === true} ${api.getNextTriggerProps().disabled === true}`',
    dayOf:
      '(date: zag.DateValue) => { const cell = api.getDayTableCellState({ value: date }); const off = disabled || cell.invalid; const refused = isDateUnavailable?.(date as zag.CalendarDate) === true; const selected = cell.selected && !off && !refused; return { date, cell, off, unavailable: refused, outside: cell.outsideRange, selectable: !off && !refused, selected, name: dayName(date, cell.valueText, cell.today, selected) } }',
    weeks: 'api.weeks.map((week) => week.map((date) => dayOf(date)))',
  },
  machine: {
    of: 'date-picker',
    context: {
      inline: 'true',
      locale: 'language',
      timeZone: 'zone',
      value: 'value === undefined ? undefined : value === null ? [] : [value]',
      defaultValue: 'defaultValue == null ? undefined : [defaultValue]',
      min: 'minValue',
      max: 'maxValue',
      focusedValue: 'focusedValue',
      startOfWeek: 'firstDayOfWeek',
      disabled: 'disabled',
      isDateUnavailable:
        'isDateUnavailable === undefined ? undefined : (date) => isDateUnavailable?.(date as zag.CalendarDate) === true',
    },
    events: {
      onValueChange: {
        emit: 'change',
        payload: '(details.value[0] as zag.CalendarDate | undefined) ?? null',
      },
      onFocusChange: { emit: 'focusChange', payload: 'details.focusedValue as zag.CalendarDate' },
      onVisibleRangeChange: {
        run: "((travel = shownMonth !== '' && details.visibleRange.start.toString() < shownMonth ? 'previous' : 'next'), (shownMonth = details.visibleRange.start.toString()))",
      },
    },
  },
  // The spec's `agent` fence. The machine owns the value, controlled or not, so `set` sets it
  // through the machine, which reports `change`, and shows the date's month. The engine reads the
  // text, refusing any that is not a date and a day the calendar does not allow. The month
  // buttons are the calendar's own parts, so the calendar withholds them.
  agent: {
    on: 'root',
    state: { value: "api.value[0]?.toString() ?? ''", disabled: 'disabled' },
    actions: {
      set: {
        argument: 'text',
        run: `(() => {
          const date = agentDate(value, { min: minValue, max: maxValue, unavailable: isDateUnavailable })
          api.setValue([date])
          api.setFocusedValue(date)
        })()`,
      },
    },
    withholds: 'root',
  },
  effects: [
    // The browser's language, after mount.
    readBrowserLanguage(),
    // The month on screen at mount, which the first move is measured from.
    { run: 'shownMonth = api.visibleRange.start.toString()' },
    // A month button that held focus and is now disabled: focus goes to the grid's focused
    // day. Chrome moves focus from a disabled button to the page, and another browser may
    // leave it on the button. The day is found at the next frame, once the new month's grid
    // has replaced the old one in every framework.
    {
      watch: 'monthButtonsOff',
      mount: false,
      run: 'monthButton && ((held) => held === null || held === document.body || (held as HTMLButtonElement).disabled === true)(document.activeElement) && ((monthButton = false), requestAnimationFrame(() => root?.querySelector<HTMLElement>(\'[data-calendar-part="day"][tabindex="0"]\')?.focus()))',
    },
  ],
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      ref: 'root',
      spread: ['api.getContentProps()'],
      attrs: {
        // The machine's content is the calendar; it is always shown and never a tab stop itself.
        hidden: 'undefined',
        tabindex: 'undefined',
        'data-state': 'undefined',
        role: lit('application'),
        'aria-label': 'named',
        'aria-labelledby': 'ariaLabelledby',
        ...identity('Calendar'),
      },
    },
    [
      el(
        'div',
        {
          part: 'header',
          class: ['header'],
          on: {
            focusin: run('monthButton = true'),
            // Focus a button loses by becoming disabled is still the header's to hand on.
            focusout: run('monthButton = ($event.target as HTMLButtonElement).disabled === true'),
          },
        },
        [
          member(
            'Button',
            {
              variant: lit('ghost'),
              tone: lit('neutral'),
              size: lit('sm'),
              iconOnly: 'true',
              icon: lit('previous'),
              label: 'say.previousMonth',
              disabled: 'api.getPrevTriggerProps().disabled === true',
            },
            { on: { click: run('api.goToPrev()') } },
          ),
          // Live, because the grid cannot announce a month change itself.
          el('span', { part: 'title', class: ['title'], attrs: { 'aria-live': lit('polite') } }, [
            text('api.visibleRangeText.formatted'),
          ]),
          member(
            'Button',
            {
              variant: lit('ghost'),
              tone: lit('neutral'),
              size: lit('sm'),
              iconOnly: 'true',
              icon: lit('next'),
              label: 'say.nextMonth',
              disabled: 'api.getNextTriggerProps().disabled === true',
            },
            { on: { click: run('api.goToNext()') } },
          ),
        ],
      ),
      el(
        'table',
        {
          part: 'grid',
          class: ['grid'],
          spread: ['api.getTableProps()'],
          attrs: {
            // Keyed on the month, so the recipe's enter animation runs for each new month.
            key: 'api.visibleRange.start.toString()',
            tabindex: 'undefined',
            'aria-label': 'named',
            'data-travel': 'travel',
          },
        },
        [
          // Hidden from assistive software: each day's name already says its weekday.
          el('thead', { attrs: { 'aria-hidden': lit('true') } }, [
            el('tr', {}, [
              each('api.weekDays', 'weekday', 'weekday.long', [
                el('th', { attrs: { scope: lit('col'), 'aria-label': 'weekday.long' } }, [
                  el('span', { attrs: { 'aria-hidden': lit('true') } }, [text('weekday.short')]),
                ]),
              ]),
            ]),
          ]),
          el('tbody', {}, [
            each(
              'weeks',
              'week',
              'at',
              [
                el('tr', {}, [
                  each('week', 'day', 'day.date.toString()', [
                    cond(
                      'day.outside',
                      [el('td', {})],
                      [
                        el(
                          'td',
                          {
                            class: ['cell'],
                            attrs: {
                              role: lit('gridcell'),
                              'aria-disabled': when('!day.selectable', lit('true')),
                              'aria-selected': when('day.selected', lit('true')),
                            },
                          },
                          [
                            el(
                              'div',
                              {
                                part: 'day',
                                class: ['day'],
                                spread: ['api.getDayTableCellTriggerProps({ value: day.date })'],
                                attrs: {
                                  'data-calendar-part': lit('day'),
                                  // The full date, in the locale's words, with React Aria's.
                                  'aria-label': 'day.name',
                                  // Today is announced, and drawn as a border, never as a fill.
                                  'aria-current': when('day.cell.today', lit('date')),
                                  // One tab stop, on the focused day; a day the calendar cannot
                                  // choose is no stop at all.
                                  tabindex: 'day.off ? undefined : day.cell.focused ? 0 : -1',
                                  'data-selected': flag('day.selected'),
                                  'data-today': flag('day.cell.today'),
                                  'data-unavailable': flag('day.unavailable'),
                                  'data-disabled': flag('day.off'),
                                },
                                on: {
                                  // Focus arriving on a day makes it the machine's focused day,
                                  // so the arrow keys move from where focus is.
                                  focus: run('api.setFocusedValue(day.date)'),
                                  // Space chooses the day, as Enter does.
                                  keydown: run(
                                    '($event.preventDefault(), api.setValue([day.date]))',
                                    "$event.key === ' ' && day.selectable",
                                  ),
                                },
                              },
                              [text('day.date.day')],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ]),
                ]),
              ],
              'at',
            ),
          ]),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'month with selection',
      props: { defaultValue: JULY, 'aria-label': 'Due date' },
      expect: { role: 'application' },
    },
    {
      name: 'today visible',
      props: { 'aria-label': 'Due date, this month' },
      expect: { role: 'application' },
    },
    {
      name: 'min/max bounds',
      props: {
        defaultValue: JULY,
        minValue: date('2026-07-10'),
        maxValue: date('2026-07-20'),
        'aria-label': 'Due date, within a narrow range',
      },
      expect: { role: 'application' },
    },
    {
      name: 'unavailable dates',
      props: {
        defaultValue: JULY,
        isDateUnavailable: weekendsOut,
        'aria-label': 'Due date, weekdays only',
      },
      expect: { role: 'application' },
    },
    {
      name: 'week start override',
      props: { defaultValue: JULY, firstDayOfWeek: 1, 'aria-label': 'Due date, weeks from Monday' },
      expect: { role: 'application' },
    },
    {
      name: 'another locale',
      props: { defaultValue: JULY, locale: 'de-DE', 'aria-label': 'Fälligkeitsdatum' },
      expect: { role: 'application' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: JULY, 'aria-label': 'Due date, unavailable' },
      expect: { role: 'application' },
    },
  ],
})
