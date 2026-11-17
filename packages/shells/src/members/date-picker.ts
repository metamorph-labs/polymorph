import {
  cond,
  describeMember,
  el,
  flag,
  identity,
  js,
  lit,
  member,
  portal,
  run,
  when,
  type Node,
} from '../dsl'
import {
  BROWSER_LANGUAGE,
  LANGUAGE,
  readBrowserLanguage,
  SEGMENT_SHARED,
  segmentHandlers,
  segmentRow,
  type SegmentField,
} from '../date-field'

const JULY = js('new CalendarDate(2026, 7, 15)')
const LATE_JULY = js('new CalendarDate(2026, 7, 28)')

/**
 * The field's options for the engine's segment model: the date's parts, and
 * the hour and the minute at a time granularity, which follow the locale's
 * clock (only TimeInput overrides it). Written out once more for the draft's
 * first value, which is made before any derived value.
 */
const options = (locale: string) =>
  `{ locale: ${locale}, parts: granularity === 'minute' ? (['year', 'month', 'day', 'hour', 'minute'] as const) : granularity === 'hour' ? (['year', 'month', 'day', 'hour'] as const) : (['year', 'month', 'day'] as const) }`

/** The value the field starts from: the controlled value, else the default. */
const SUPPLIED = 'value !== undefined ? value : defaultValue'

const FIELD: SegmentField = {
  draft: 'draft',
  options: 'fieldOptions',
  commit: 'commit',
  segments: 'segments',
  keys: 'segmentKeys',
  input: 'segmentInput',
  editable: '!disabled',
  invalid: 'fieldInvalid',
  // React Aria's shortcut: the calendar opens from a segment, with focus on its focused day.
  open: 'if (!disabled) api.setOpen(true)',
}

/** `open` or `closed`, for the sheet's scrim, whose recipe keys pointer events on it. */
const SHEET_STATE = "api.open ? 'open' : 'closed'"

/** The popup's content: Calendar, verbatim, with the field's date both ways. */
const calendar: Node = member(
  'Calendar',
  {
    value: 'current === null ? null : calendarDateOf(current)',
    minValue: 'minValue',
    maxValue: 'maxValue',
    isDateUnavailable: 'isDateUnavailable',
    // The field's locale, so the grid and the field never read two.
    locale: 'language',
    firstDayOfWeek: 'firstDayOfWeek',
    messages: 'say',
    'aria-label': 'say.chooseDate',
  },
  { on: { change: run('choose($event)') } },
)

/** The popup's attributes the member sets over the machine's: named, and present through its exit. */
const PANEL_ATTRS = {
  hidden: 'undefined',
  'aria-labelledby': 'undefined',
  'aria-describedby': 'undefined',
  'aria-label': 'say.chooseDate',
}

/**
 * DatePicker (`design/components/date-picker.md`): a date field with
 * segmented entry and a Calendar popup.
 *
 * The segments are the primary input: the engine's segment model over a
 * draft the member holds (`date-field.ts`), as TimeInput's are, reported
 * through `change` once every segment is filled. A value outside
 * `minValue`/`maxValue`, or a day `isDateUnavailable` refuses, marks the field
 * invalid, as React Aria does; the field keeps the value rather than moving it
 * inside the bounds.
 *
 * Zag's popover machine owns the popup: the trigger, Escape and a press
 * outside, and the one focus hand-off, onto the calendar's focused day. Its
 * content is the Calendar member, as React's is. Choosing a day sets the
 * draft's date, keeps its time at a time granularity, and closes the popup,
 * which returns focus to the trigger. Under `presentation: 'auto'`, below the
 * sheet presentation's threshold (`phone`), the popup is the shared bottom
 * sheet, modal, with Calendar unchanged inside it.
 */
export default describeMember({
  member: 'DatePicker',
  dir: 'controls',
  recipe: 'controls/date-picker',
  recipes: { triggerAnchor: 'overlays/trigger-anchor', sheet: 'overlays/sheet' },
  types: {
    DatePickerMessages:
      'CalendarMessages & { showCalendar: string; clear: string; chooseDate: string }',
  },
  uses: ['CalendarDate', 'CalendarMessages'],
  defaults: {
    granularity: lit('day'),
    clearable: 'false',
    size: lit('md'),
    disabled: 'false',
    invalid: 'false',
    presentation: lit('auto'),
  },
  media: { phone: 'phone' },
  state: {
    ...BROWSER_LANGUAGE,
    draft: `dateFieldDraft(${SUPPLIED}, ${options(LANGUAGE)})`,
    // What the reader has typed into the focused segment since it took focus.
    typed: "''",
    // The value last reported or supplied, as text, so an edit that changes nothing reports nothing.
    reported: `(${SUPPLIED})?.toString() ?? ''`,
  },
  derived: {
    say: "messages ?? { previousMonth: 'Previous month', nextMonth: 'Next month', showCalendar: 'Show calendar', clear: 'Clear', chooseDate: 'Choose a date' }",
    language: LANGUAGE,
    // The sheet form under `'auto'` and below the threshold; `'popover'` keeps the anchored panel.
    sheeting: "presentation === 'auto' && phone",
    fieldOptions: options('language'),
    segments: 'fieldSegments(draft, fieldOptions)',
    // The supplied value, whose seconds a new datetime keeps.
    kept: `(${SUPPLIED}) ?? null`,
    current: 'dateFieldValue(draft, fieldOptions, kept)',
    fieldInvalid:
      'invalid || dateOutOfBounds(current, { min: minValue, max: maxValue, unavailable: isDateUnavailable })',
    showClear: 'clearable && current !== null && !disabled',
    commit:
      "(next: ReturnType<typeof dateFieldDraft>): void => { draft = next; const after = dateFieldValue(next, fieldOptions, kept); const text = after?.toString() ?? ''; if (text !== reported) { reported = text; emit('change', after) } }",
    // A day chosen in the calendar sets the draft's date and keeps its time, and closes the popup.
    choose:
      '(date: CalendarDate | null): void => { if (date === null) return; commit({ ...draft, year: date.year, month: date.month, day: date.day }); api.setOpen(false) }',
    // Clearing empties every segment, and focus moves to the first, as the button leaves.
    clear:
      "(): void => { commit({}); field?.querySelector<HTMLElement>('[data-segment]')?.focus() }",
    ...SEGMENT_SHARED,
    ...segmentHandlers(FIELD),
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
      // The one focus hand-off: the calendar's focused day, its one tab stop.
      initialFocusEl:
        '() => (sheetPanel ?? panel)?.querySelector<HTMLElement>(\'[tabindex="0"]\') ?? null',
    },
  },
  // The spec's `agent` fence. The member holds the draft, so `set` and `clear` write it through
  // `commit`, which reports `change`, and the machine owns the open state. The engine reads the
  // text at the granularity, refusing any in another form, a day the field does not allow, and a
  // time finer than the field. The field's buttons and the calendar in the popup are the
  // picker's own parts, so the member withholds two regions: the field, and the popup with its
  // calendar while it is open.
  agent: {
    on: 'field',
    state: {
      value: "current?.toString() ?? ''",
      open: 'api.open',
      disabled: 'disabled',
      invalid: 'fieldInvalid',
    },
    actions: {
      set: {
        argument: 'text',
        run: `(() => {
          const bounds = { min: minValue, max: maxValue, unavailable: isDateUnavailable }
          commit(dateFieldDraft(granularity === 'day' ? agentDate(value, bounds) : agentDateTime(value, bounds, granularity), fieldOptions))
        })()`,
      },
      clear: 'commit({})',
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
    // The browser's language, after mount; a 12-hour draft holds a day period, so it is made again.
    readBrowserLanguage(`draft = dateFieldDraft(${SUPPLIED}, ${options(LANGUAGE)})`),
    // The trigger's ARIA moves onto the Button, and focus returns to it when the popup closes.
    { watch: 'api.open', run: 'syncTriggerAnchor(anchor, api.getTriggerProps(), api.open)' },
    // A controlled value the caller changes is shown, unless it clears a draft the reader is
    // still filling in: an empty value leaves a partial draft as it is.
    {
      watch: 'value',
      mount: false,
      run: "value !== undefined && (value !== null || current !== null) && ((draft = dateFieldDraft(value, fieldOptions)), (reported = value?.toString() ?? ''))",
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
          ...identity('DatePicker'),
        },
      },
      [
        segmentRow(FIELD, { key: 'date', attrs: { 'data-size': 'size' } }),
        // ISO-8601 at the granularity, under `name`.
        cond('name !== undefined', [
          el('input', {
            attrs: {
              type: lit('hidden'),
              name: 'name',
              value: "current?.toString() ?? ''",
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
              attrs: { ...PANEL_ATTRS, ...identity('DatePicker') },
              // The recipe reads the anchored origin under Radix's name; Zag's positioner
              // sets it as its own variable, which the panel inherits.
              geometry: { '--radix-popover-content-transform-origin': "'var(--transform-origin)'" },
              ref: 'panel',
            },
            [calendar],
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
                { part: 'sheetBody', class: ['sheetBody'], attrs: identity('DatePicker') },
                [calendar],
              ),
            ],
          ),
        ]),
      ]),
    ),
  ],
  states: [
    {
      name: 'empty',
      props: { 'aria-label': 'Due date' },
      expect: { 'data-state': 'closed', 'data-size': 'md' },
    },
    {
      name: 'filled',
      props: { defaultValue: JULY, 'aria-label': 'Due date' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: ['sm', 'md', 'lg'].map((size) => ({
          props: { size, defaultValue: JULY, 'aria-label': `Due (${size})` },
        })),
      },
    },
    {
      name: 'open',
      props: { defaultOpen: true, defaultValue: JULY, 'aria-label': 'Due date, open on its month' },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'locale order — en-US',
      props: { locale: 'en-US', defaultValue: JULY, 'aria-label': 'Due date (en-US)' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'locale order — de-DE',
      props: { locale: 'de-DE', defaultValue: JULY, 'aria-label': 'Fällig (de-DE)' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'clearable',
      props: { clearable: true, defaultValue: JULY, 'aria-label': 'Due date' },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'out-of-range value',
      props: {
        defaultValue: LATE_JULY,
        maxValue: js('new CalendarDate(2026, 7, 20)'),
        'aria-label': 'Due date, past the last allowed day',
      },
      expect: { 'data-invalid': '' },
    },
    {
      // A time granularity adds time segments after the date, in one field.
      name: 'datetime',
      props: {
        granularity: 'minute',
        defaultValue: js('new CalendarDateTime(2026, 7, 15, 9, 30)'),
        'aria-label': 'Due date and time',
      },
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'invalid',
      props: { invalid: true, 'aria-label': 'Due date, required' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: JULY, 'aria-label': 'Due date' },
      expect: { 'data-disabled': '' },
    },
  ],
})
