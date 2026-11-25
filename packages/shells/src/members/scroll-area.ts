import { cond, describeMember, el, fx, identity, lit, slot, when, type Node } from '../dsl'

const ROWS = [
  ['Daily digest', 'One summary each morning instead of a notification per reply.'],
  ['Mentions', 'Notify when a teammate mentions you in a ticket.'],
  ['Assignments', 'Notify when a ticket is assigned to you.'],
  ['Escalations', 'Notify when a ticket you follow is escalated.'],
  ['Replies', 'Notify on every customer reply.'],
  ['Snooze returns', 'Notify when a snoozed ticket wakes.'],
  ['Weekly report', 'A summary of the queue every Monday.'],
  ['Quiet hours', 'Silence everything between 20:00 and 07:00.'],
] as const

const SETTINGS_ROWS = fx(
  'Stack',
  { gap: 4 },
  {
    default: ROWS.map(([label, description]) =>
      fx(
        'SettingsRow',
        { label, description },
        { control: [fx('Switch', { defaultChecked: true })] },
      ),
    ),
  },
)

const UNBROKEN = fx(
  'Text',
  { size: 'sm' },
  { default: ['pm_live_9f2c4e8b7a614d3f8c25b1e07d9a3c6f41e8b2d5'] },
)

/** One rail and its thumb, drawn while its axis overflows. */
const rail = (axis: 'vertical' | 'horizontal'): Node =>
  cond(axis === 'vertical' ? 'api.hasOverflowY' : 'api.hasOverflowX', [
    el(
      'div',
      {
        class: ['rail', { name: 'hover', when: 'fades' }, { name: 'always', when: '!fades' }],
        spread: [`api.getScrollbarProps({ orientation: ${lit(axis)} })`],
        attrs: {
          'aria-hidden': lit('true'),
          // A `hover` rail is a state of one element, faded by the recipe.
          'data-state': when(
            'fades',
            `api.getScrollbarState({ orientation: ${lit(axis)} }).hovering || api.getScrollbarState({ orientation: ${lit(axis)} }).scrolling ? 'visible' : 'hidden'`,
          ),
        },
      },
      [
        el('div', {
          class: ['thumb'],
          spread: [`api.getThumbProps({ orientation: ${lit(axis)} })`],
        }),
      ],
    ),
  ])

/**
 * ScrollArea (`design/components/scroll-area.md`): a token-styled scrollbar
 * for a region that already scrolls. Zag's scroll-area machine tracks the
 * overflow on each axis, sizes and moves the thumbs, and pages from the rail.
 *
 * A rail is drawn only while its axis overflows, in both types; `hover` fades
 * it in while the pointer is over the region or it scrolls. The viewport is a
 * tab stop and a named region only while it overflows (CodeBlock's rule). Zag
 * leaves the viewport's axes and the native scrollbar to its renderer, which
 * Radix sets on its own viewport: the axes follow `orientation`, and the native
 * bar is hidden so the drawn rail is the only one.
 */
export default describeMember({
  member: 'ScrollArea',
  dir: 'structure',
  recipe: 'structure/scroll-area',
  types: {
    ScrollAreaOrientation: "NonNullable<ScrollAreaProps['orientation']>",
    ScrollAreaType: "NonNullable<ScrollAreaProps['type']>",
  },
  defaults: { orientation: lit('vertical'), type: lit('always') },
  machine: { of: 'scroll-area', context: {} },
  derived: {
    // A `hover` rail fades in and out; an `always` rail stays while its axis overflows.
    fades: "type === 'hover'",
    overflowing: 'api.hasOverflowX || api.hasOverflowY',
  },
  template: el(
    'div',
    {
      class: ['root'],
      spread: ['api.getRootProps()'],
      attrs: { ...identity('ScrollArea') },
      // The element the member reads its reading direction around.
      ref: 'root',
    },
    [
      el(
        'div',
        {
          class: ['viewport'],
          spread: ['api.getViewportProps()'],
          attrs: {
            tabindex: when('overflowing', '0'),
            role: when('overflowing', lit('region')),
            'aria-label': when('overflowing', 'label'),
          },
          geometry: {
            'overflow-x': "orientation === 'vertical' ? 'hidden' : 'scroll'",
            'overflow-y': "orientation === 'horizontal' ? 'hidden' : 'scroll'",
            'scrollbar-width': "'none'",
          },
        },
        [el('div', { spread: ['api.getContentProps()'] }, [slot()])],
      ),
      ...(['vertical', 'horizontal'] as const).map((axis) =>
        cond(`orientation === 'both' || orientation === ${lit(axis)}`, [rail(axis)]),
      ),
      cond("orientation === 'both'", [
        el('div', {
          class: ['corner'],
          spread: ['api.getCornerProps()'],
          attrs: { 'aria-hidden': lit('true') },
        }),
      ]),
    ],
  ),
  states: [
    {
      name: 'vertical — the rail says more is coming',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [{ props: { label: 'Notification settings' }, slots: { default: [SETTINGS_ROWS] } }],
      },
    },
    {
      name: 'horizontal — wide content in a narrow box',
      many: {
        within: { element: 'div', class: ['harnessNarrow'] },
        each: [
          {
            props: { orientation: 'horizontal', label: 'API key' },
            slots: { default: [UNBROKEN] },
          },
        ],
      },
    },
    {
      name: 'both — two rails and the corner',
      many: {
        within: { element: 'div', class: ['harnessSquare'] },
        each: [
          {
            props: { orientation: 'both', label: 'Notification settings' },
            slots: { default: [fx('Stack', { gap: 4 }, { default: [UNBROKEN, SETTINGS_ROWS] })] },
          },
        ],
      },
    },
    {
      name: 'fits — no rail on a region with nothing more to give',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [
          {
            props: { label: 'Notification settings' },
            slots: {
              default: [
                fx(
                  'SettingsRow',
                  { label: 'Daily digest', description: 'One summary each morning.' },
                  { control: [fx('Switch', { defaultChecked: true })] },
                ),
              ],
            },
          },
        ],
      },
    },
    {
      name: 'hover type — the rail overlays, hidden until the pointer arrives',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [
          {
            props: { type: 'hover', label: 'Notification settings' },
            slots: { default: [SETTINGS_ROWS] },
          },
        ],
      },
    },
  ],
})
