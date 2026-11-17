import { cond, describeMember, el, identity, lit, member, text } from '../dsl'

/**
 * Meter (`design/components/meter.md`): a measured value in a known range,
 * such as storage used of a quota. The bar is Progress's. The member picks the
 * fill's tone from the thresholds the app passes, reading the value as given,
 * and draws the value clamped to the range. Under the bar, a glyph named by
 * `messages` says the band, and the app's `valueText` is the words a reader
 * sees, hidden there because the meter's `aria-valuetext` says them.
 */
export default describeMember({
  member: 'Meter',
  dir: 'structure',
  recipe: 'structure/meter',
  types: {
    // The status glyph's names, localized by passing both keys or none.
    MeterMessages: `{
      /** The glyph's name past \`warning\`: "High". */
      warning: string
      /** The glyph's name past \`danger\`: "Critical". */
      danger: string
    }`,
  },
  defaults: {
    min: '0',
    max: '100',
    messages: "() => ({ warning: 'High', danger: 'Critical' })",
  },
  derived: {
    // Clamped, because a bar cannot show more than full or less than empty.
    shown: 'Math.min(max, Math.max(min, value))',
    ratio: 'max > min ? (shown - min) / (max - min) : 0',
    // The band reads the value as given, and danger wins where the bands overlap.
    tone: "danger !== undefined && value >= danger ? 'danger' : warning !== undefined && value >= warning ? 'warning' : 'accent'",
  },
  template: el(
    'div',
    { part: 'meter', class: ['meter'], attrs: { 'data-tone': 'tone', ...identity('Meter') } },
    [
      el(
        'div',
        {
          part: 'track',
          class: ['track'],
          attrs: {
            role: lit('meter'),
            'aria-label': 'label',
            'aria-valuenow': 'shown',
            'aria-valuemin': 'min',
            'aria-valuemax': 'max',
            'aria-valuetext': 'valueText',
          },
        },
        [
          // Scaled, not sized: a transform moves no layout. The ratio is data, which no token holds.
          el('div', {
            part: 'fill',
            class: ['fill'],
            geometry: { transform: '`scaleX(${ratio})`' },
          }),
        ],
      ),
      cond("tone !== 'accent' || valueText !== undefined", [
        el('div', { part: 'readout', class: ['readout'] }, [
          // The second channel: a glyph whose shape and name say the band, after the meter.
          cond("tone !== 'accent'", [
            el('span', { part: 'status', class: ['status'] }, [
              member('Icon', {
                name: "tone === 'danger' ? 'error' : 'warning'",
                size: lit('sm'),
                label: "tone === 'danger' ? messages.danger : messages.warning",
              }),
            ]),
          ]),
          // Hidden, because the meter's `aria-valuetext` already says it.
          cond('valueText !== undefined', [
            el('span', { part: 'value', class: ['value'], attrs: { 'aria-hidden': lit('true') } }, [
              text('valueText'),
            ]),
          ]),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'below its thresholds',
      props: {
        label: 'Storage used',
        value: 30,
        max: 50,
        warning: 40,
        danger: 45,
        valueText: '30 GB of 50 GB',
      },
      expect: { 'data-tone': 'accent' },
    },
    {
      name: 'between its thresholds — warning',
      props: {
        label: 'Storage used',
        value: 42,
        max: 50,
        warning: 40,
        danger: 45,
        valueText: '42 GB of 50 GB',
      },
      expect: { 'data-tone': 'warning' },
    },
    {
      name: 'above its thresholds — danger',
      props: {
        label: 'Storage used',
        value: 48,
        max: 50,
        warning: 40,
        danger: 45,
        valueText: '48 GB of 50 GB',
      },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'at min',
      props: { label: 'Seats taken', value: 0, max: 20, valueText: '0 of 20 seats' },
      expect: { 'data-tone': 'accent' },
    },
    {
      name: 'at max — the budget is spent',
      props: {
        label: 'Budget spent',
        value: 2000,
        max: 2000,
        danger: 2000,
        valueText: '€2,000 of €2,000',
      },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'outside the range is clamped, and its band still holds',
      props: { label: 'Allowance used', value: 130, danger: 100, valueText: 'Over by 30 GB' },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'without the value text',
      props: { label: 'Cold share', value: 62 },
      expect: { 'data-tone': 'accent' },
    },
    {
      name: 'danger without the value text — the glyph alone',
      props: { label: 'Queue depth', value: 92, danger: 85 },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'messages — the glyph named in another language',
      props: {
        label: 'Speicher belegt',
        value: 42,
        max: 50,
        warning: 40,
        danger: 45,
        valueText: '42 GB von 50 GB',
        messages: { warning: 'Hoch', danger: 'Kritisch' },
      },
      expect: { 'data-tone': 'warning' },
    },
  ],
})
