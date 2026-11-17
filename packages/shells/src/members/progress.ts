import { cond, describeMember, el, identity, lit } from '../dsl'

/** What the bar and the ring both are to assistive technology, and their tone. */
const NAMED = {
  'data-tone': 'tone',
  role: lit('progressbar'),
  'aria-label': 'label',
  'aria-valuenow': 'percent',
  'aria-valuemin': '0',
  'aria-valuemax': '100',
  ...identity('Progress'),
}

/** A circle on the dial's own radius, which the recipe strokes. */
const CIRCLE = { cx: lit('50%'), cy: lit('50%'), r: lit('50%') }

/**
 * Progress (`design/components/progress.md`): how much of a task is done, as a
 * bar or, with `shape="ring"`, as a ring at Spinner's sizes. The ring's arc is
 * 100 long, so its dash offset is the part not done.
 */
export default describeMember({
  member: 'Progress',
  dir: 'structure',
  recipe: 'structure/progress',
  types: {
    ProgressTone: "NonNullable<ProgressProps['tone']>",
    ProgressShape: "NonNullable<ProgressProps['shape']>",
  },
  defaults: { tone: lit('accent'), shape: lit('bar'), size: lit('md') },
  // Clamped, because a bar cannot show more than full or less than empty.
  derived: { percent: 'Math.min(100, Math.max(0, value))' },
  template: cond(
    "shape === 'ring'",
    [
      el(
        'div',
        {
          part: 'ring',
          class: ['ring'],
          attrs: { 'data-shape': lit('ring'), 'data-size': 'size', ...NAMED },
        },
        [
          el(
            'svg',
            {
              part: 'dial',
              class: ['dial'],
              attrs: { 'aria-hidden': lit('true'), focusable: lit('false') },
            },
            [
              el('circle', { part: 'groove', class: ['groove'], attrs: CIRCLE }),
              // The offset is data, as the bar's scale is.
              el('circle', {
                part: 'arc',
                class: ['arc'],
                attrs: { ...CIRCLE, pathLength: '100' },
                geometry: { 'stroke-dashoffset': '`${100 - percent}`' },
              }),
            ],
          ),
        ],
      ),
    ],
    [
      el('div', { part: 'track', class: ['track'], attrs: NAMED }, [
        // Scaled, not sized: a transform moves no layout. The ratio is data, which no token holds.
        el('div', {
          part: 'fill',
          class: ['fill'],
          geometry: { transform: '`scaleX(${percent / 100})`' },
        }),
      ]),
    ],
  ),
  states: [
    {
      name: 'nothing done yet',
      props: { value: 0, label: 'Import progress' },
      expect: { 'data-tone': 'accent', 'aria-valuenow': '0', 'data-shape': null },
    },
    {
      name: 'part way',
      props: { value: 33, label: 'Import progress' },
      expect: { 'aria-valuenow': '33' },
    },
    {
      name: 'complete',
      props: { value: 100, label: 'Import progress' },
      expect: { 'aria-valuenow': '100' },
    },
    {
      name: 'danger — over quota, not nearly done',
      props: { value: 80, label: 'Storage used', tone: 'danger' },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'out of range is clamped, because a bar cannot overflow',
      props: { value: 140, label: 'Clamped' },
      expect: { 'aria-valuenow': '100' },
    },
    {
      name: 'renders no text — the caption composes',
      many: {
        within: { member: 'Stack', props: { gap: 2 } },
        each: [{ props: { value: 62, label: 'Migration' } }],
        also: [{ element: 'span', children: ['3 of 5 tables migrated'] }],
      },
    },
    {
      name: 'ring sm',
      props: { value: 25, label: 'Uploading report.pdf', shape: 'ring', size: 'sm' },
      expect: { 'data-shape': 'ring', 'data-size': 'sm', 'aria-valuenow': '25' },
    },
    {
      name: 'ring md — the default size',
      props: { value: 60, label: 'Uploading report.pdf', shape: 'ring' },
      expect: { 'data-shape': 'ring', 'data-size': 'md', 'aria-valuenow': '60' },
    },
    {
      name: 'ring lg, complete',
      props: { value: 100, label: 'Uploading report.pdf', shape: 'ring', size: 'lg' },
      expect: { 'data-shape': 'ring', 'data-size': 'lg', 'aria-valuenow': '100' },
    },
    {
      name: 'ring danger — the task failed',
      props: { value: 80, label: 'Upload failed', shape: 'ring', tone: 'danger' },
      expect: { 'data-shape': 'ring', 'data-tone': 'danger' },
    },
    {
      name: 'ring renders no text — the caption composes',
      many: {
        within: { member: 'Inline', props: { gap: 2 } },
        each: [{ props: { value: 40, label: 'Uploading report.pdf', shape: 'ring', size: 'sm' } }],
        also: [{ element: 'span', children: ['2 of 5 files'] }],
      },
    },
  ],
})
