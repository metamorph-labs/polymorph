import { cond, describeMember, each, el, flag, identity, lit, run, text, when } from '../dsl'
import { BROWSER_LANGUAGE, LANGUAGE, readBrowserLanguage } from '../date-field'

/** Seven days, the longest inactivity lifetime the surveyed session policies allow. */
const WEEK = 604_800

/** The field's options for the engine's duration arithmetic. */
const options = (locale: string) => `{ units, min, max, locale: ${locale} }`

/** The value the field starts from: the controlled value, else the default. */
const SUPPLIED = 'value !== undefined ? value : (defaultValue ?? null)'

/** The type of one of the field's counts, written so a description's function can name it. */
const SEGMENT = 'ReturnType<typeof durationSegments>[number]'

/** The unit's short word beside its count, hidden because the count says its unit itself. */
const WORD = el('span', { part: 'unit', class: ['unit'], attrs: { 'aria-hidden': lit('true') } }, [
  text('segment.word'),
])

/**
 * DurationInput (`design/components/duration-input.md`): a length of time in
 * whole seconds, entered as counts of days, hours, minutes or seconds.
 *
 * Every renderer draws the counts as spinbuttons and routes their keys to the
 * engine's `durationKey`, so a step carries, a typed count stays under the
 * next unit and a commit is held inside `min` and `max` the same way in every
 * framework. The member holds a draft: a step commits it at once, and typed
 * digits commit when focus leaves the field or on Enter, through the engine's
 * `commitDuration`, which reports nothing when the value is as it was. The
 * field is a group, named by FormField's label through association.
 */
export default describeMember({
  member: 'DurationInput',
  dir: 'controls',
  recipe: 'controls/duration-input',
  types: {
    DurationInputMessages: `{
      /** What an empty count says as its value to assistive software. */
      empty: string
    }`,
  },
  defaults: {
    messages: "() => ({ empty: 'Empty' })",
    size: lit('md'),
    disabled: 'false',
    readOnly: 'false',
    invalid: 'false',
  },
  state: {
    ...BROWSER_LANGUAGE,
    draft: `durationDraft(${SUPPLIED}, ${options(LANGUAGE)})`,
    // What the reader has typed into the focused count since it took focus.
    typed: "''",
    // The value last reported or supplied: what the hidden field posts and a commit compares with.
    reported: `(${SUPPLIED}) as number | null`,
  },
  derived: {
    language: LANGUAGE,
    fieldOptions: options('language'),
    editable: '!disabled && !readOnly',
    segments: 'durationSegments(draft, fieldOptions, messages)',
    posted: 'value !== undefined ? value : reported',
    // Focus moves to the count `by` places away in the field, staying put at either end.
    moveSegment: `(from: EventTarget | null, by: number): void => { if (!(from instanceof HTMLElement)) return; const all = [...(from.closest('[role="group"]')?.querySelectorAll<HTMLElement>('[data-segment]') ?? [])]; all[all.indexOf(from) + by]?.focus() }`,
    // A draft committed: held inside the bounds, drawn, and reported when it changed the value.
    commit: `(next: ReturnType<typeof durationDraft>): void => { const result = commitDuration(next, reported, fieldOptions); draft = result.draft; if (result.changed) { reported = result.value; emit('change', result.value) } }`,
    // What a key does, as the engine decides it.
    act: `(action: ReturnType<typeof durationKey>, from: EventTarget | null): void => { if (action.kind === 'move') { typed = ''; moveSegment(from, action.by) } else if (action.kind === 'type') { typed = action.typed; draft = action.draft; if (action.advance) moveSegment(from, 1) } else if (action.kind === 'step') { typed = ''; commit(action.draft) } else if (action.kind === 'commit') { typed = ''; commit(draft) } }`,
    segmentKeys: `(event: KeyboardEvent, segment: ${SEGMENT}): void => { const action = durationKey(draft, segment.unit, typed, event, { editable, rtl: getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl' }, fieldOptions); if (action.kind === 'pass') return; event.preventDefault(); act(action, event.currentTarget) }`,
    // Text that arrives without a key a keyboard names (a phone's keyboard): each character, typed.
    segmentInput: `(event: Event, segment: ${SEGMENT}): void => { event.preventDefault(); if (!editable) return; const data = (event as InputEvent).data ?? ''; for (const key of data) { const next = typeIntoDuration(draft, segment.unit, typed, key, fieldOptions); typed = next.typed; draft = next.draft; if (next.advance) { moveSegment(event.currentTarget, 1); break } } }`,
    // Focus leaving the field commits what has been typed; a move between its counts does not.
    leave: `(event: FocusEvent): void => { const to = event.relatedTarget; if (to instanceof Node && (event.currentTarget as HTMLElement).contains(to)) return; typed = ''; commit(draft) }`,
  },
  // The spec's `agent` fence. The member holds the draft and the committed value, so `set` and
  // `clear` write them through `commit`, which reports `change`. The engine refuses seconds the
  // segments cannot draw and seconds outside `min` and `max`, and a read-only field refuses both
  // actions.
  agent: {
    on: 'field',
    state: {
      value: 'posted',
      disabled: 'disabled',
      invalid: 'invalid',
      readonly: 'readOnly',
    },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          if (readOnly) throw new Error('The field is read-only.')
          commit(durationDraft(agentDuration(value, fieldOptions), fieldOptions))
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The field is read-only.')
        commit({})
      })()`,
    },
  },
  effects: [
    // The browser's language, after mount.
    readBrowserLanguage(),
    // A controlled value the caller changes replaces what the field shows.
    {
      watch: 'value',
      mount: false,
      run: 'value !== undefined && ((draft = durationDraft(value, fieldOptions)), (reported = value))',
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
        ...identity('DurationInput'),
      },
      on: { focusout: run('leave($event)') },
    },
    [
      el('div', { part: 'segments', class: ['segments'] }, [
        each('segments', 'segment', 'segment.unit', [
          el('div', { part: 'quantity', class: ['quantity'] }, [
            cond('segment.wordFirst', [WORD]),
            el(
              'div',
              {
                part: 'segment',
                class: ['segment'],
                attrs: {
                  role: lit('spinbutton'),
                  id: '`${uid}-${segment.unit}`',
                  // The unit's name, read after the field's name where FormField references one.
                  'aria-label': 'segment.name',
                  'aria-labelledby': when(
                    'ariaLabelledby',
                    '`${ariaLabelledby} ${uid}-${segment.unit}`',
                  ),
                  'aria-describedby': 'ariaDescribedby',
                  'aria-valuenow': 'segment.value',
                  'aria-valuemin': 'segment.min',
                  'aria-valuemax': 'segment.max',
                  'aria-valuetext': 'segment.valueText',
                  'aria-required': when('ariaRequired', lit('true')),
                  'aria-readonly': when('readOnly', lit('true')),
                  'aria-disabled': when('disabled', lit('true')),
                  'aria-invalid': when('invalid', lit('true')),
                  // Editable text, so a phone shows its keyboard; the handlers write every change.
                  contenteditable: "editable ? 'true' : undefined",
                  inputmode: lit('numeric'),
                  spellcheck: lit('false'),
                  tabindex: "disabled ? undefined : '0'",
                  'data-segment': 'segment.unit',
                  'data-placeholder': flag('segment.placeholder'),
                  'data-disabled': flag('disabled'),
                },
                on: {
                  focus: run("typed = ''"),
                  keydown: run('segmentKeys($event, segment)'),
                  beforeinput: run('segmentInput($event, segment)'),
                },
              },
              [text('segment.text')],
            ),
            cond('!segment.wordFirst', [WORD]),
          ]),
        ]),
      ]),
      // The committed value in whole seconds, under `name`.
      cond('name !== undefined', [
        el('input', {
          attrs: {
            type: lit('hidden'),
            name: 'name',
            value: "posted === null ? '' : String(posted)",
            disabled: when('disabled', 'true'),
          },
        }),
      ]),
    ],
  ),
  states: [
    {
      name: 'empty',
      props: { 'aria-label': 'Inactivity lifetime' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'filled',
      props: { defaultValue: WEEK, 'aria-label': 'Inactivity lifetime' },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'days only',
      props: { units: ['days'], defaultValue: 2_592_000, 'aria-label': 'Absolute lifetime' },
    },
    {
      name: 'with seconds',
      props: { units: ['minutes', 'seconds'], defaultValue: 300, 'aria-label': 'Request timeout' },
    },
    {
      name: 'bounded',
      props: { min: 900, max: WEEK, defaultValue: 900, 'aria-label': 'Inactivity lifetime' },
    },
    {
      name: 'remainder',
      props: { units: ['minutes'], defaultValue: 90, 'aria-label': 'Grace period' },
    },
    {
      name: 'locale',
      props: { locale: 'de-DE', defaultValue: 5_400, 'aria-label': 'Inaktivitätsdauer' },
    },
    {
      name: 'sm',
      props: { size: 'sm', defaultValue: WEEK, 'aria-label': 'Inactivity lifetime' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'readOnly',
      props: { readOnly: true, defaultValue: WEEK, 'aria-label': 'Inactivity lifetime' },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'invalid',
      props: { invalid: true, 'aria-label': 'Inactivity lifetime, required' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: WEEK, 'aria-label': 'Inactivity lifetime' },
      expect: { 'data-disabled': '' },
    },
  ],
})
