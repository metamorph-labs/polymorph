import { cond, describeMember, el, flag, identity, js, lit, when } from '../dsl'
import {
  BROWSER_LANGUAGE,
  LANGUAGE,
  readBrowserLanguage,
  SEGMENT_SHARED,
  segmentHandlers,
  segmentRow,
  type SegmentField,
} from '../date-field'

/** The start of business hours, the spec's own example. */
const NINE = js('new Time(9, 0)')

/**
 * The field's options for the engine's segment model: the locale orders the
 * segments and names the day periods, the granularity drops the minute, and
 * `hourCycle` overrides the locale's clock. Written out once more for the
 * draft's first value, which is made before any derived value.
 */
const options = (locale: string) =>
  `{ locale: ${locale}, parts: granularity === 'hour' ? (['hour'] as const) : (['hour', 'minute'] as const), hourCycle }`

/** The value the field starts from: the controlled value, else the default. */
const SUPPLIED = 'value !== undefined ? value : defaultValue'

const FIELD: SegmentField = {
  draft: 'draft',
  options: 'fieldOptions',
  commit: 'commit',
  segments: 'segments',
  keys: 'segmentKeys',
  input: 'segmentInput',
  editable: '!disabled && !readOnly',
  readOnly: 'readOnly',
  invalid: 'invalid',
}

/**
 * TimeInput (`design/components/time-input.md`): a time of day, entered in
 * segments, with no popup. It is DatePicker's segmented entry on its own.
 *
 * React renders React Aria's time field. This member renders the engine's
 * segment model over a draft it holds (`date-field.ts`): each segment is a
 * spinbutton the arrows step and digits fill, and the draft becomes a `Time`
 * once every segment it shows is filled, which the member reports through
 * `change`; erasing a segment of a whole time reports `null`. A supplied
 * value's seconds are kept, never set to zero. The field is a group, named
 * by FormField's label through association.
 */
export default describeMember({
  member: 'TimeInput',
  dir: 'controls',
  recipe: 'controls/time-input',
  types: { TimeInputMessages: '{ empty: string }' },
  defaults: {
    granularity: lit('minute'),
    size: lit('md'),
    disabled: 'false',
    readOnly: 'false',
    invalid: 'false',
  },
  state: {
    ...BROWSER_LANGUAGE,
    draft: `timeDraft(${SUPPLIED}, ${options(LANGUAGE)})`,
    // What the reader has typed into the focused segment since it took focus.
    typed: "''",
    // The value last reported or supplied, as text, so an edit that changes nothing reports nothing.
    reported: `(${SUPPLIED})?.toString() ?? ''`,
  },
  derived: {
    say: "messages ?? { empty: 'Empty' }",
    language: LANGUAGE,
    fieldOptions: options('language'),
    segments: 'fieldSegments(draft, fieldOptions)',
    // The supplied value, whose seconds a new time keeps.
    kept: `(${SUPPLIED}) ?? null`,
    current: 'timeFieldValue(draft, fieldOptions, kept)',
    commit:
      "(next: ReturnType<typeof timeDraft>): void => { draft = next; const after = timeFieldValue(next, fieldOptions, kept); const text = after?.toString() ?? ''; if (text !== reported) { reported = text; emit('change', after) } }",
    ...SEGMENT_SHARED,
    ...segmentHandlers(FIELD),
  },
  // The spec's `agent` fence. The member holds the draft, so `set` and `clear` write it through
  // `commit`, which reports `change`. The engine reads the time, refusing text in another form
  // and a time finer than the field's segments, and a read-only field refuses both actions.
  agent: {
    on: 'field',
    state: {
      value: "current?.toString() ?? ''",
      disabled: 'disabled',
      invalid: 'invalid',
      readonly: 'readOnly',
    },
    actions: {
      set: {
        argument: 'text',
        run: `(() => {
          if (readOnly) throw new Error('The field is read-only.')
          commit(timeDraft(agentTime(value, granularity), fieldOptions))
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The field is read-only.')
        commit({})
      })()`,
    },
  },
  effects: [
    // The browser's language, after mount; a 12-hour draft holds a day period, so it is made again.
    readBrowserLanguage(`draft = timeDraft(${SUPPLIED}, ${options(LANGUAGE)})`),
    // A controlled value the caller changes is shown, unless it clears a draft the reader is
    // still filling in: an empty value leaves a partial draft as it is.
    {
      watch: 'value',
      mount: false,
      run: "value !== undefined && (value !== null || current !== null) && ((draft = timeDraft(value, fieldOptions)), (reported = value?.toString() ?? ''))",
    },
  ],
  statics: { controlKind: "'group'" },
  template: el(
    'div',
    {
      part: 'field',
      class: ['field'],
      // The group an agent's handle names.
      ref: 'field',
      attrs: {
        role: lit('group'),
        id: 'id',
        'aria-label': 'ariaLabel',
        'aria-labelledby': 'ariaLabelledby',
        'aria-describedby': 'ariaDescribedby',
        'aria-disabled': when('disabled', lit('true')),
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        'data-readonly': flag('readOnly'),
        ...identity('TimeInput'),
      },
    },
    [
      segmentRow(FIELD, { key: 'time' }),
      // The time in `Time`'s own ISO form, under `name`.
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
    ],
  ),
  states: [
    { name: 'empty', props: { 'aria-label': 'Opens at' }, expect: { 'data-size': 'md' } },
    {
      name: 'filled',
      props: { defaultValue: NINE, 'aria-label': 'Opens at' },
      expect: { 'data-size': 'md' },
    },
    { name: '24-hour', props: { hourCycle: 24, defaultValue: NINE, 'aria-label': 'Opens at' } },
    {
      name: 'locale cycle',
      props: { locale: 'de-DE', defaultValue: NINE, 'aria-label': 'Öffnet um' },
    },
    {
      name: 'hour only',
      props: { granularity: 'hour', defaultValue: NINE, 'aria-label': 'Quiet hours from' },
    },
    {
      name: 'readOnly',
      props: { readOnly: true, defaultValue: NINE, 'aria-label': 'Opens at' },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'invalid',
      props: { invalid: true, 'aria-label': 'Opens at, required' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: NINE, 'aria-label': 'Opens at' },
      expect: { 'data-disabled': '' },
    },
  ],
})
