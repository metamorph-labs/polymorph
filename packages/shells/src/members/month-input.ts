import { cond, describeMember, el, flag, identity, lit, when, type FixtureChild } from '../dsl'
import {
  BROWSER_LANGUAGE,
  LANGUAGE,
  readBrowserLanguage,
  SEGMENT_SHARED,
  segmentHandlers,
  segmentRow,
  type SegmentField,
} from '../date-field'

/** A card's expiry, the spec's own example. */
const EXPIRY = '2029-08'

/** The field's options for the engine's segment model: the month and the year, in the locale's order. */
const OPTIONS = "{ locale: language, parts: ['year', 'month'] as const }"

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
  invalid: 'fieldInvalid',
}

const fx = (
  name: string,
  props: Readonly<Record<string, string | boolean>>,
  slots?: Readonly<Record<string, readonly FixtureChild[]>>,
): FixtureChild => ({ member: name, props, ...(slots === undefined ? {} : { slots }) })

/**
 * MonthInput (`design/components/month-input.md`): a month and a year,
 * entered in segments, with no popup: a card's expiry, a billing month.
 *
 * The React member and this one draw the engine's segment model over a draft
 * the member holds (`date-field.ts`), as TimeInput's shells do: each segment
 * is a spinbutton the arrows step and digits fill. The draft becomes a
 * `YYYY-MM` text once both segments are filled, which the member reports
 * through `change`; erasing a segment of a whole month reports `null`. A
 * month outside `min` and `max` marks the field invalid and stays in it. A
 * filled month says its number and its name as its value (`7 – July`). The
 * field is a group, named by FormField's label through association.
 */
export default describeMember({
  member: 'MonthInput',
  dir: 'controls',
  recipe: 'controls/month-input',
  types: { MonthInputMessages: '{ empty: string }' },
  defaults: {
    size: lit('md'),
    disabled: 'false',
    readOnly: 'false',
    invalid: 'false',
  },
  state: {
    ...BROWSER_LANGUAGE,
    draft: `monthDraft(${SUPPLIED})`,
    // What the reader has typed into the focused segment since it took focus.
    typed: "''",
    // The value last reported or supplied, so an edit that changes nothing reports nothing.
    reported: `monthFieldValue(monthDraft(${SUPPLIED})) ?? ''`,
  },
  derived: {
    say: "messages ?? { empty: 'Empty' }",
    language: LANGUAGE,
    fieldOptions: OPTIONS,
    segments: 'fieldSegments(draft, fieldOptions)',
    current: 'monthFieldValue(draft)',
    fieldInvalid: 'invalid || monthOutOfBounds(current, { min, max })',
    commit:
      "(next: ReturnType<typeof monthDraft>): void => { draft = next; const after = monthFieldValue(next); if ((after ?? '') !== reported) { reported = after ?? ''; emit('change', after) } }",
    ...SEGMENT_SHARED,
    ...segmentHandlers(FIELD),
  },
  // The spec's `agent` fence. The member holds the draft, so `set` and `clear` write it through
  // `commit`, which reports `change`. The engine reads the month, refusing text in another form
  // and a month outside `min` and `max`, and a read-only field refuses both actions.
  agent: {
    on: 'field',
    state: {
      value: "current ?? ''",
      disabled: 'disabled',
      invalid: 'fieldInvalid',
      readonly: 'readOnly',
    },
    actions: {
      set: {
        argument: 'text',
        run: `(() => {
          if (readOnly) throw new Error('The field is read-only.')
          commit(monthDraft(agentMonth(value, { min, max })))
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The field is read-only.')
        commit({})
      })()`,
    },
  },
  effects: [
    // The browser's language, after mount. A month's draft does not follow the locale, so it stays.
    readBrowserLanguage(),
    // A controlled value the caller changes is shown, unless it clears a draft the reader is
    // still filling in: an empty value leaves a partial draft as it is.
    {
      watch: 'value',
      mount: false,
      run: "value !== undefined && (value !== null || current !== null) && ((draft = monthDraft(value)), (reported = monthFieldValue(monthDraft(value)) ?? ''))",
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
        'data-invalid': flag('fieldInvalid'),
        'data-readonly': flag('readOnly'),
        ...identity('MonthInput'),
      },
    },
    [
      segmentRow(FIELD, {
        key: 'month',
        valueText: 'segmentValueText(segment, language, say.empty)',
      }),
      // The month as `YYYY-MM`, under `name`.
      cond('name !== undefined', [
        el('input', {
          attrs: {
            type: lit('hidden'),
            name: 'name',
            value: "current ?? ''",
            disabled: when('disabled', 'true'),
          },
        }),
      ]),
    ],
  ),
  states: [
    { name: 'empty', props: { 'aria-label': 'Expires' }, expect: { 'data-size': 'md' } },
    {
      name: 'filled',
      props: { defaultValue: EXPIRY, 'aria-label': 'Expires' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3 } },
        each: ['sm', 'md', 'lg'].map((size) => ({
          props: { size, defaultValue: EXPIRY, 'aria-label': `Expires (${size})` },
        })),
      },
    },
    {
      name: 'out-of-range value',
      props: {
        min: '2026-03',
        max: '2027-02',
        defaultValue: '2026-02',
        'aria-label': 'Billing month, before the first allowed month',
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'locale order — en-US',
      props: { locale: 'en-US', defaultValue: EXPIRY, 'aria-label': 'Expires' },
    },
    {
      name: 'locale order — ja-JP',
      props: { locale: 'ja-JP', defaultValue: EXPIRY, 'aria-label': '有効期限' },
    },
    {
      name: 'right-to-left locale — he-IL',
      props: { locale: 'he-IL', defaultValue: EXPIRY, 'aria-label': 'תוקף' },
    },
    {
      name: 'readOnly',
      props: { readOnly: true, defaultValue: EXPIRY, 'aria-label': 'Expires' },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'invalid',
      props: { invalid: true, 'aria-label': 'Expires, required' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: EXPIRY, 'aria-label': 'Expires' },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'expiry form',
      many: {
        within: { member: 'Inline', props: { gap: 4, align: 'start', wrap: true } },
        each: [],
        also: [
          fx(
            'FormField',
            { label: 'Card number' },
            { default: [fx('Input', { autoComplete: 'cc-number' })] },
          ),
          fx(
            'FormField',
            { label: 'Expires' },
            { default: [fx('MonthInput', { min: '2020-01', name: 'expiry' })] },
          ),
        ],
      },
    },
  ],
})
