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
  portal,
  run,
  text,
  when,
  words,
  type Expr,
  type Node,
} from '../dsl'
import {
  BROWSER_LANGUAGE,
  DAY_NAME,
  LANGUAGE,
  readBrowserLanguage,
  SEGMENT_SHARED,
  segmentHandlers,
  segmentRow,
  type SegmentField,
} from '../date-field'

/** The report range, June 1 → 14, from the spec's example. */
const REPORT = {
  start: js('new CalendarDate(2026, 6, 1)'),
  end: js('new CalendarDate(2026, 6, 14)'),
}

/** The fields' options for the engine's segment model: a date's parts, in the locale's order. */
const options = (locale: string) =>
  `{ locale: ${locale}, parts: ['year', 'month', 'day'] as const }`

/** The range the field starts from: the controlled range, else the default. */
const SUPPLIED = 'value !== undefined ? value : defaultValue'

/** A range as text, both ends in ISO form, so a change that moves neither end reports nothing. */
const rangeText = (range: Expr) =>
  `((given) => (given === null || given === undefined ? '' : \`\${given.start.toString()}/\${given.end.toString()}\`))(${range})`

const half = (name: 'start' | 'end'): SegmentField => ({
  draft: `${name}Draft`,
  options: 'fieldOptions',
  commit: `${name}Commit`,
  segments: `${name}Segments`,
  keys: `${name}Keys`,
  input: `${name}Input`,
  editable: '!disabled',
  invalid: 'fieldInvalid',
  open: 'if (!disabled) api.setOpen(true)',
})

const START = half('start')
const END = half('end')

/** `open` or `closed`, for the sheet's scrim, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/** The popup's content: the range grid, which starts from the committed range. */
const grid: Node = member(
  'DateRangePickerRangeCalendar',
  {
    value: 'range',
    minValue: 'minValue',
    maxValue: 'maxValue',
    isDateUnavailable: 'isDateUnavailable',
    // The field's locale, so the grid and the fields never read two.
    locale: 'language',
    firstDayOfWeek: 'firstDayOfWeek',
    disabled: 'disabled',
    messages: 'say',
    label: 'say.chooseRange',
  },
  {
    on: {
      commit: run('choose($event)'),
      anchorChange: run('anchored = $event'),
    },
  },
)

/** The popup's attributes the member sets over the machine's: named, and present through its exit. */
const PANEL_ATTRS = {
  hidden: 'undefined',
  'aria-labelledby': 'undefined',
  'aria-describedby': 'undefined',
  'aria-label': 'say.chooseRange',
}

/** One day of the range grid, as the range's part it is: its start, its middle or its end. */
const DAY = [
  '(date: zag.DateValue) => {',
  'const cell = api.getDayTableCellState({ value: date });',
  'const off = disabled || cell.invalid;',
  'const refused = isDateUnavailable?.(date as zag.CalendarDate) === true;',
  // The anchored preview is the range being made; without one, the committed range, or the
  // anchor alone, which is both ends of a one-day range.
  'const start = previewing ? cell.firstInHoveredRange : cell.firstInRange;',
  'const end = previewing ? cell.lastInHoveredRange : api.value.length === 1 ? cell.firstInRange : cell.lastInRange;',
  'const inside = (previewing ? cell.inHoveredRange : cell.inRange) || start || end;',
  'return { date, cell, off, unavailable: refused, outside: cell.outsideRange, selectable: !off && !refused, inside, start, end, middle: inside && !start && !end, name: dayName(date, cell.valueText, cell.today, inside) }',
  '}',
].join(' ')

/**
 * DateRangePicker (`design/components/date-range-picker.md`): a date range
 * field, two segmented dates in one frame, with one range grid in a popup.
 *
 * The two fields are the engine's segment model over two drafts the member
 * holds (`date-field.ts`), as DatePicker's one field is. A range is reported
 * through `change` once both ends are filled, and `null` once a filled end is
 * erased; a half-entered range is never reported. A typed end outside the
 * bounds, or an end before the start, marks the field invalid.
 *
 * Zag's popover machine owns the popup, as it does DatePicker's. Its grid is
 * an internal part on Zag's date-picker machine, inline, in range mode: the
 * first choice anchors the start, the arrows extend the highlighted span from
 * it, and the second choice commits the end, which fills both fields and
 * closes the popup. Escape is two-stage: with an anchor set, the popover's
 * Escape is held, and the grid cancels the span, keeping the committed range;
 * the next Escape closes. Space chooses a day as Enter does, as React Aria's
 * grid has it.
 *
 * The cells carry `data-range-start`, `data-range-middle` and
 * `data-range-end` instead of `data-selected`. React Aria limits a span to
 * the run of available days around its anchor; Zag's machine does not, so a
 * span drawn across a refused day still commits.
 */
export default describeMember({
  member: 'DateRangePicker',
  dir: 'controls',
  recipe: 'controls/date-range-picker',
  recipes: { triggerAnchor: 'overlays/trigger-anchor', sheet: 'overlays/sheet' },
  types: {
    DateRange: '{ start: CalendarDate; end: CalendarDate }',
    DateRangePickerMessages:
      'CalendarMessages & { showCalendar: string; clear: string; chooseRange: string; empty?: string; start?: string; end?: string }',
  },
  uses: ['CalendarDate', 'CalendarMessages'],
  defaults: {
    clearable: 'false',
    size: lit('md'),
    disabled: 'false',
    invalid: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  state: {
    ...BROWSER_LANGUAGE,
    startDraft: `dateFieldDraft((${SUPPLIED})?.start, ${options(LANGUAGE)})`,
    endDraft: `dateFieldDraft((${SUPPLIED})?.end, ${options(LANGUAGE)})`,
    // What the reader has typed into the focused segment since it took focus.
    typed: "''",
    // The range last reported or supplied, as text, so an edit that changes nothing reports nothing.
    reported: rangeText(SUPPLIED),
    // Whether the grid has a start anchored and no end yet, which holds the popup's Escape.
    anchored: 'false',
  },
  derived: {
    // `empty`, `start` and `end` are optional, so a host's messages written before them keep
    // their English.
    say: "{ empty: 'Empty', start: 'Start date', end: 'End date', ...(messages ?? { previousMonth: 'Previous month', nextMonth: 'Next month', showCalendar: 'Show calendar', clear: 'Clear', chooseRange: 'Choose a date range' }) }",
    language: LANGUAGE,
    // The sheet form under `'auto'` and below the threshold; `'popover'` keeps the anchored panel.
    sheeting: "presentation === 'auto' && phone",
    fieldOptions: options('language'),
    startSegments: 'fieldSegments(startDraft, fieldOptions)',
    endSegments: 'fieldSegments(endDraft, fieldOptions)',
    // Both ends as dates, or `null` while either is not filled.
    rangeOf:
      '(start: ReturnType<typeof dateFieldDraft>, end: ReturnType<typeof dateFieldDraft>): DateRange | null => { const from = dateFieldValue(start, fieldOptions); const to = dateFieldValue(end, fieldOptions); return from === null || to === null ? null : { start: calendarDateOf(from), end: calendarDateOf(to) } }',
    range: 'rangeOf(startDraft, endDraft)',
    bounds: '{ min: minValue, max: maxValue, unavailable: isDateUnavailable }',
    // An end outside the bounds, or an end before the start, which React Aria marks on both halves.
    fieldInvalid:
      'invalid || dateOutOfBounds(dateFieldValue(startDraft, fieldOptions), bounds) || dateOutOfBounds(dateFieldValue(endDraft, fieldOptions), bounds) || (range !== null && range.end.compare(range.start) < 0)',
    showClear: 'clearable && range !== null && !disabled',
    report:
      "(start: ReturnType<typeof dateFieldDraft>, end: ReturnType<typeof dateFieldDraft>): void => { startDraft = start; endDraft = end; const after = rangeOf(start, end); const text = after === null ? '' : `${after.start.toString()}/${after.end.toString()}`; if (text !== reported) { reported = text; emit('change', after) } }",
    startCommit: '(next: ReturnType<typeof dateFieldDraft>): void => report(next, endDraft)',
    endCommit: '(next: ReturnType<typeof dateFieldDraft>): void => report(startDraft, next)',
    // A committed span fills both fields and closes the popup.
    choose:
      '(next: DateRange): void => { report(dateFieldDraft(next.start, fieldOptions), dateFieldDraft(next.end, fieldOptions)); api.setOpen(false) }',
    // Clearing empties both fields, and focus moves to the first segment, as the button leaves.
    clear:
      "(): void => { report({}, {}); field?.querySelector<HTMLElement>('[data-segment]')?.focus() }",
    ...SEGMENT_SHARED,
    ...segmentHandlers(START),
    ...segmentHandlers(END),
  },
  machine: {
    of: 'popover',
    context: {
      defaultOpen: 'defaultOpen',
      // The sheet is modal: the machine traps focus in it and hides the page behind it.
      modal: 'sheeting',
      // The popup's end meets the field's end, two pixels below it: the grid is wider than the field.
      positioning: "{ placement: 'bottom-end' as const, offset: { mainAxis: 2 } }",
      // The caller's id names the field, which the machine finds as its anchor.
      ids: 'id === undefined ? undefined : { anchor: id }',
      // The one focus hand-off: the grid's focused day, its one tab stop.
      initialFocusEl:
        '() => (sheetPanel ?? panel)?.querySelector<HTMLElement>(\'[tabindex="0"]\') ?? null',
    },
    events: {
      // The first stage of Escape: with an anchor set, the popup stays and the grid cancels the span.
      onEscapeKeyDown: { run: 'anchored && details.preventDefault()' },
    },
  },
  // The spec's `agent` fence. The member holds the two drafts, so `set` and `clear` write them
  // through `report`, which reports `change`, and the machine owns the open state. The engine
  // reads the range as one text, start and end joined by `/`, refusing any in another form, an
  // end before its start, and a day the field does not allow. The field's buttons and the grid
  // in the popup are the picker's own parts, so the member withholds two regions: the field, and
  // the popup while it is open.
  agent: {
    on: 'field',
    state: {
      value: "range === null ? '' : `${range.start.toString()}/${range.end.toString()}`",
      open: 'api.open',
      disabled: 'disabled',
      invalid: 'fieldInvalid',
    },
    actions: {
      set: {
        argument: 'text',
        run: '((next) => report(dateFieldDraft(next.start, fieldOptions), dateFieldDraft(next.end, fieldOptions)))(agentDateRange(value, bounds))',
      },
      clear: 'report({}, {})',
      open: 'api.setOpen(true)',
      close: 'api.setOpen(false)',
    },
    withholds: '[field, sheetPanel ?? panel]',
  },
  presence: {
    // The anchored panel's recipe animates it; the sheet's panel and scrim play their bindings.
    present: { open: 'api.open && !sheeting', ref: 'panel' },
    sheetPresent: {
      open: 'api.open && sheeting',
      ref: 'sheetPanel',
      binding: 'sheet.panel',
      sheetSide: 'bottom',
    },
    scrimPresent: { open: 'api.open && sheeting', ref: 'scrim', binding: 'dialog.scrim' },
  },
  effects: [
    // The browser's language, after mount. A date's draft does not follow the locale's clock.
    readBrowserLanguage(),
    // The trigger's ARIA moves onto the Button, and focus returns to it when the popup closes.
    { watch: 'api.open', run: 'syncTriggerAnchor(anchor, api.getTriggerProps(), api.open)' },
    // A controlled range the caller changes is shown, unless it clears drafts the reader is still
    // filling in: an empty range leaves partial drafts as they are.
    {
      watch: 'value',
      mount: false,
      run: `value !== undefined && (value !== null || range !== null) && ((startDraft = dateFieldDraft(value?.start, fieldOptions)), (endDraft = dateFieldDraft(value?.end, fieldOptions)), (reported = ${rangeText('value')}))`,
    },
  ],
  statics: { controlKind: "'group'" },
  template: [
    el(
      'div',
      {
        part: 'field',
        class: ['field'],
        ref: 'field',
        spread: ['api.getAnchorProps()'],
        attrs: {
          role: lit('group'),
          'aria-label': 'ariaLabel',
          'aria-labelledby': 'ariaLabelledby',
          'aria-describedby': 'ariaDescribedby',
          'aria-disabled': when('disabled', lit('true')),
          'data-size': 'size',
          'data-disabled': flag('disabled'),
          'data-invalid': flag('fieldInvalid'),
          'data-state': "api.open ? 'open' : 'closed'",
          ...identity('DateRangePicker'),
        },
      },
      [
        segmentRow(START, { key: 'start', half: 'say.start', attrs: { 'data-size': 'size' } }),
        // A visual separator only: each segment's name says which end it belongs to.
        el('span', { part: 'dash', class: ['dash'], attrs: { 'aria-hidden': lit('true') } }, [
          words('–'),
        ]),
        segmentRow(END, { key: 'end', half: 'say.end', attrs: { 'data-size': 'size' } }),
        el('span', { class: ['spacer'] }),
        // Each end in ISO form, under its own name, because one name cannot carry two values.
        cond('startName !== undefined', [
          el('input', {
            attrs: {
              type: lit('hidden'),
              name: 'startName',
              value: "range?.start.toString() ?? ''",
              disabled: when('disabled', 'true'),
            },
          }),
        ]),
        cond('endName !== undefined', [
          el('input', {
            attrs: {
              type: lit('hidden'),
              name: 'endName',
              value: "range?.end.toString() ?? ''",
              disabled: when('disabled', 'true'),
            },
          }),
        ]),
        cond('showClear', [
          el(
            'button',
            {
              part: 'clear',
              class: ['clear'],
              attrs: { type: lit('button'), 'aria-label': 'say.clear' },
              on: { click: run('clear()') },
            },
            [member('Icon', { name: lit('clear'), size: 'size' })],
          ),
        ]),
        // The machine's trigger is an anchor around the Button; its ARIA moves onto the Button.
        el(
          'span',
          {
            part: 'trigger',
            class: ['triggerAnchor.anchor'],
            spread: ['anchorProps(api.getTriggerProps())'],
            ref: 'anchor',
          },
          [
            member('Button', {
              variant: lit('ghost'),
              tone: lit('neutral'),
              size: 'size',
              iconOnly: 'true',
              icon: lit('calendar'),
              label: 'say.showCalendar',
              disabled: 'disabled',
            }),
          ],
        ),
      ],
    ),
    portal(
      cond('present', [
        el('div', { spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['content'],
              spread: ['api.getContentProps()'],
              attrs: { ...PANEL_ATTRS, ...identity('DateRangePicker') },
              // The recipe reads the anchored origin under Radix's name; Zag's positioner
              // sets it as its own variable, which the panel inherits.
              geometry: { '--radix-popover-content-transform-origin': "'var(--transform-origin)'" },
              ref: 'panel',
            },
            [grid],
          ),
        ]),
      ]),
      // The sheet: a press on the scrim is outside the panel, so the machine closes it.
      cond('scrimPresent', [
        el('div', { class: ['sheet.scrim'], attrs: { 'data-state': SHEET_STATE }, ref: 'scrim' }),
      ]),
      cond('sheetPresent', [
        el('div', { class: ['sheet.positioner'] }, [
          el(
            'div',
            {
              class: ['sheet.panel'],
              spread: ['api.getContentProps()'],
              attrs: {
                ...PANEL_ATTRS,
                'aria-modal': lit('true'),
                'data-presentation': lit('sheet'),
              },
              ref: 'sheetPanel',
            },
            [
              // The sheet's panel is the shared anatomy, so the member's identity goes on
              // the one element inside it that the member owns.
              el(
                'div',
                { part: 'sheetBody', class: ['sheetBody'], attrs: identity('DateRangePicker') },
                [grid],
              ),
            ],
          ),
        ]),
      ]),
    ),
  ],
  parts: [
    {
      name: 'RangeCalendar',
      public: false,
      purpose:
        "the popup's month grid, Calendar's anatomy with the range's cells, on Zag's date-picker machine in range mode",
      props: {
        value: {
          type: 'DateRange | null',
          doc: 'The committed range, which the grid starts from.',
        },
        minValue: { type: 'CalendarDate', optional: true },
        maxValue: { type: 'CalendarDate', optional: true },
        isDateUnavailable: { type: '(date: CalendarDate) => boolean', optional: true },
        locale: { type: 'string', optional: true },
        firstDayOfWeek: { type: '0 | 1 | 2 | 3 | 4 | 5 | 6', optional: true },
        disabled: { type: 'boolean' },
        messages: { type: 'CalendarMessages' },
        label: { type: 'string', doc: "The grid's name, before the month on screen." },
        onCommit: { type: '(range: DateRange) => void', optional: true },
        onAnchorChange: { type: '(anchored: boolean) => void', optional: true },
      },
      state: {
        // The direction the visible month last moved, so the incoming grid enters from that side.
        travel: "'next'",
        // The first day of the month on screen, as ISO text, which orders as dates do.
        shownMonth: "''",
        // Whether the next value change is the cancel restoring the committed range. That change
        // is not a choice, so it commits nothing and the popup stays open.
        restoring: 'false',
      },
      derived: {
        // The member's locale, which it resolves and always passes.
        language: "locale ?? 'en-US'",
        english: "language.toLowerCase().startsWith('en')",
        // Today is the reader's today, in the reader's time zone.
        zone: 'Intl.DateTimeFormat().resolvedOptions().timeZone',
        named: "[label, api.visibleRangeText.formatted].filter(Boolean).join(', ')",
        // React Aria's words for a day, in English only (`DAY_NAME`): a day in the range is
        // selected, as each day of a RangeCalendar's highlighted range is.
        dayName: DAY_NAME,
        // Whether the reader is extending a span from an anchor, which the cells draw as the range.
        previewing:
          'api.value.length === 1 && api.weeks.some((week) => week.some((date) => api.getDayTableCellState({ value: date }).inHoveredRange))',
        dayOf: DAY,
        weeks: 'api.weeks.map((week) => week.map((date) => dayOf(date)))',
        // The first stage of Escape: the span in progress is cancelled, the committed range kept,
        // and focus stays on the day it was on. The machine reports the restored value as a
        // change, which `restoring` marks.
        cancel:
          '(): void => { if (api.value.length !== 1) return; const at = api.focusedValue; restoring = true; if (value === null) api.clearValue({ focus: false }); else api.setValue([value.start, value.end]); api.setFocusedValue(at) }',
      },
      machine: {
        of: 'date-picker',
        context: {
          inline: 'true',
          selectionMode: "'range' as const",
          locale: 'language',
          timeZone: 'zone',
          defaultValue: 'value === null ? undefined : [value.start, value.end]',
          min: 'minValue',
          max: 'maxValue',
          startOfWeek: 'firstDayOfWeek',
          disabled: 'disabled',
          isDateUnavailable:
            'isDateUnavailable === undefined ? undefined : (date) => isDateUnavailable?.(date as zag.CalendarDate) === true',
        },
        events: {
          // The second choice commits the span, start first. The cancel's restored value is not a
          // choice. The machine reports a change after it is sent, at once in some adapters and
          // in a microtask in Solid's, so the flag is cleared here rather than in `cancel`.
          onValueChange: {
            run: "restoring ? (restoring = false) : details.value.length === 2 && emit('commit', { start: details.value[0] as zag.CalendarDate, end: details.value[1] as zag.CalendarDate })",
          },
          onVisibleRangeChange: {
            run: "((travel = shownMonth !== '' && details.visibleRange.start.toString() < shownMonth ? 'previous' : 'next'), (shownMonth = details.visibleRange.start.toString()))",
          },
        },
      },
      effects: [
        // The month on screen at mount, which the first move is measured from.
        { run: 'shownMonth = api.visibleRange.start.toString()' },
        // Whether a start is anchored, which holds the popup's first Escape.
        { watch: 'api.value.length', run: "emit('anchorChange', api.value.length === 1)" },
      ],
      template: el(
        'div',
        {
          part: 'root',
          class: ['root'],
          spread: ['api.getContentProps()'],
          attrs: {
            // The machine's content is the grid; it is always shown and never a tab stop itself.
            hidden: 'undefined',
            tabindex: 'undefined',
            'data-state': 'undefined',
            role: lit('application'),
            'aria-label': 'named',
          },
        },
        [
          el('div', { part: 'header', class: ['header'] }, [
            member(
              'Button',
              {
                variant: lit('ghost'),
                tone: lit('neutral'),
                size: lit('sm'),
                iconOnly: 'true',
                icon: lit('previous'),
                label: 'messages.previousMonth',
                disabled: 'disabled || api.getPrevTriggerProps().disabled === true',
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
                label: 'messages.nextMonth',
                disabled: 'disabled || api.getNextTriggerProps().disabled === true',
              },
              { on: { click: run('api.goToNext()') } },
            ),
          ]),
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
              on: { keydown: run('cancel()', "$event.key === 'Escape'") },
            },
            [
              // Hidden from assistive software: each day's name already says its weekday.
              el('thead', { attrs: { 'aria-hidden': lit('true') } }, [
                el('tr', {}, [
                  each('api.weekDays', 'weekday', 'weekday.long', [
                    el('th', { attrs: { scope: lit('col'), 'aria-label': 'weekday.long' } }, [
                      el('span', { attrs: { 'aria-hidden': lit('true') } }, [
                        text('weekday.short'),
                      ]),
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
                          // Days of the neighbouring months hold the columns and nothing else.
                          [el('td', {})],
                          [
                            el(
                              'td',
                              {
                                class: ['cell'],
                                attrs: {
                                  role: lit('gridcell'),
                                  'aria-disabled': when('!day.selectable', lit('true')),
                                  'aria-selected': when('day.inside', lit('true')),
                                },
                              },
                              [
                                el(
                                  'div',
                                  {
                                    part: 'day',
                                    class: ['day'],
                                    spread: [
                                      'api.getDayTableCellTriggerProps({ value: day.date })',
                                    ],
                                    attrs: {
                                      'data-calendar-part': lit('day'),
                                      // The full date, in the locale's words.
                                      'aria-label': 'day.name',
                                      'aria-current': when('day.cell.today', lit('date')),
                                      // One tab stop, on the focused day; a day the grid cannot
                                      // choose is no stop at all.
                                      tabindex: 'day.off ? undefined : day.cell.focused ? 0 : -1',
                                      'data-selected': 'undefined',
                                      'data-range-start': flag('day.start'),
                                      'data-range-middle': flag('day.middle'),
                                      'data-range-end': flag('day.end'),
                                      'data-today': flag('day.cell.today'),
                                      'data-unavailable': flag('day.unavailable'),
                                      'data-disabled': flag('day.off'),
                                    },
                                    on: {
                                      // Focus arriving on a day makes it the machine's focused
                                      // day, so the arrow keys move from where focus is.
                                      focus: run('api.setFocusedValue(day.date)'),
                                      // Space chooses the day, as Enter does: the day's own press.
                                      keydown: run(
                                        '($event.preventDefault(), ($event.currentTarget as HTMLElement).click())',
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
    },
  ],
  states: [
    {
      name: 'empty',
      props: { 'aria-label': 'Report range' },
      expect: { 'data-state': 'closed', 'data-size': 'md' },
    },
    {
      name: 'range filled',
      props: { defaultValue: REPORT, 'aria-label': 'Report range' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'open with range',
      props: { defaultOpen: true, defaultValue: REPORT, 'aria-label': 'Report range, open' },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'one-day range',
      props: {
        defaultOpen: true,
        defaultValue: {
          start: js('new CalendarDate(2026, 6, 8)'),
          end: js('new CalendarDate(2026, 6, 8)'),
        },
        'aria-label': 'Report range, one day',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'out-of-range typed',
      props: {
        defaultValue: REPORT,
        maxValue: js('new CalendarDate(2026, 6, 10)'),
        'aria-label': 'Report range, past the last allowed day',
      },
      expect: { 'data-invalid': '' },
    },
    {
      // The pair is marked: an end before the start is invalid on both halves.
      name: 'reversed typed',
      props: {
        defaultValue: {
          start: js('new CalendarDate(2026, 6, 14)'),
          end: js('new CalendarDate(2026, 6, 1)'),
        },
        'aria-label': 'Report range, reversed',
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'unavailable inside',
      props: {
        defaultOpen: true,
        defaultValue: REPORT,
        isDateUnavailable: js(
          '(date: { month: number; day: number }) => date.month === 6 && date.day >= 20 && date.day <= 22',
        ),
        'aria-label': 'Report range, with blackout days',
      },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'clearable',
      props: { clearable: true, defaultValue: REPORT, 'aria-label': 'Report range' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'invalid',
      props: { invalid: true, 'aria-label': 'Report range, required' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: REPORT, 'aria-label': 'Report range' },
      expect: { 'data-disabled': '' },
    },
  ],
})
