import { cond, describeMember, each, el, flag, identity, js, lit, text, when } from '../dsl'

/** The value as a list of thumbs: one for a single slider, two for a range. */
const thumbs = (value: string) =>
  `(${value} === undefined ? undefined : Array.isArray(${value}) ? [...${value}] : [${value}])`

/** What the member reports: a number, or the pair for a range. */
const reported =
  'range ? [details.value[0] ?? min, details.value[1] ?? min] : (details.value[0] ?? min)'

/** Slider (`design/components/slider.md`): a value, or a range, on a track. */
export default describeMember({
  member: 'Slider',
  dir: 'controls',
  recipe: 'controls/slider',
  defaults: {
    min: '0',
    max: '100',
    step: '1',
    showValue: 'false',
    formatValue: 'String',
    disabled: 'false',
    invalid: 'false',
    range: 'false',
  },
  statics: { controlKind: lit('group') },
  machine: {
    of: 'slider',
    context: {
      value: thumbs('value'),
      defaultValue: `${thumbs('defaultValue')} ?? (range ? [min, min] : [min])`,
      min: 'min',
      max: 'max',
      step: 'step',
      disabled: 'disabled',
      invalid: 'invalid',
      // Each thumb announces its formatted value, from the formatter the readout uses.
      getAriaValueText: '(details) => formatValue(details.value)',
    },
    events: {
      onValueChange: { emit: 'change', payload: reported },
      onValueChangeEnd: { emit: 'commit', payload: reported },
    },
  },
  derived: { spoken: 'api.value.map((value) => formatValue(value))' },
  // The spec's `agent` fence. An agent moves a thumb through the machine, which snaps the
  // number to the step, keeps it within the range and the other thumb, and emits `change`
  // and then `commit`, as a key press does.
  agent: {
    on: 'root',
    element: 'root?.querySelector(\'[role="slider"]\')',
    state: {
      value: 'api.value[0] ?? min',
      high: 'range ? (api.value[1] ?? min) : null',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: {
      set: { argument: 'number', run: 'api.setThumbValue(0, value)' },
      'set-high': {
        argument: 'number',
        run: `(() => {
          if (!range) throw new Error('A single slider has one value, which set moves.')
          api.setThumbValue(1, value)
        })()`,
      },
    },
  },
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        // Horizontal only; the attribute lets the recipe branch if a vertical slider is specified.
        'data-orientation': lit('horizontal'),
        ...identity('Slider'),
      },
    },
    [
      // Hidden from assistive software: each thumb's `aria-valuetext` is the accessible value.
      cond('showValue', [
        el('span', { class: ['readout'], attrs: { 'aria-hidden': lit('true') } }, [
          text("spoken.join('–')"),
        ]),
      ]),
      el(
        'div',
        {
          part: 'control',
          class: ['control'],
          spread: ['api.getRootProps()', 'api.getControlProps()'],
        },
        [
          el('div', { part: 'track', class: ['track'], spread: ['api.getTrackProps()'] }, [
            el('div', { part: 'range', class: ['range'], spread: ['api.getRangeProps()'] }),
          ]),
          each(
            'api.value',
            '_thumb',
            'index',
            [
              el('div', {
                part: 'thumb',
                class: ['thumb'],
                spread: ['api.getThumbProps({ index })'],
                attrs: {
                  // Named by the caller; Zag would point at a label element this member does not draw.
                  'aria-label': 'ariaLabel',
                  'aria-labelledby': 'ariaLabelledby',
                  'aria-describedby': 'ariaDescribedby',
                  'aria-required': 'ariaRequired',
                  'aria-invalid': when('invalid', 'true'),
                  // Only the held thumb grows.
                  'data-state':
                    "Object(api.getThumbProps({ index }))['data-dragging'] === '' ? 'dragging' : undefined",
                },
              }),
            ],
            'index',
          ),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'rest',
      props: { defaultValue: 40, 'aria-label': 'Volume' },
      expect: { 'data-orientation': 'horizontal', 'data-disabled': null },
    },
    {
      name: 'zero / full — the two ends of the fill',
      many: {
        within: { member: 'Stack', props: { gap: 5 } },
        each: [
          { props: { defaultValue: 0, 'aria-label': 'Empty' } },
          { props: { defaultValue: 100, 'aria-label': 'Full' } },
        ],
      },
    },
    { name: 'stepped', props: { defaultValue: 40, step: 10, 'aria-label': 'Sample rate' } },
    { name: 'with readout', props: { defaultValue: 40, showValue: true, 'aria-label': 'Volume' } },
    {
      name: 'formatted — one formatter writes the readout and the spoken value',
      props: {
        defaultValue: 40,
        showValue: true,
        formatValue: js('(value: number) => `${value}%`'),
        'aria-label': 'Opacity',
      },
    },
    {
      name: 'range — two thumbs, the fill between them',
      props: { range: true, defaultValue: [20, 60], 'aria-label': 'Price range' },
    },
    {
      name: 'range with readout — both values, an en dash between',
      props: { range: true, defaultValue: [20, 60], showValue: true, 'aria-label': 'Price range' },
    },
    {
      name: 'invalid',
      props: { defaultValue: 90, invalid: true, 'aria-label': 'Budget' },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { defaultValue: 40, disabled: true, 'aria-label': 'Locked' },
      expect: { 'data-disabled': '' },
    },
  ],
})
