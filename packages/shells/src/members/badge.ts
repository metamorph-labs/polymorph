import { cond, describeMember, el, identity, lit, member, slot, text } from '../dsl'

const VARIANTS = ['soft', 'solid', 'outline'] as const
const TONES = ['neutral', 'accent', 'danger', 'warning', 'success', 'info'] as const

/** Badge (`design/components/badge.md`): a short status label. */
export default describeMember({
  member: 'Badge',
  dir: 'structure',
  recipe: 'structure/badge',
  types: {
    BadgeTone: "NonNullable<BadgeProps['tone']>",
    BadgeVariant: "NonNullable<BadgeProps['variant']>",
  },
  defaults: { variant: lit('soft'), tone: lit('neutral'), max: '99', dot: 'false' },
  derived: {
    // The count as drawn: the number, or the cap and a plus sign past it.
    shown: "count === undefined ? '' : count > max ? String(max) + '+' : String(count)",
  },
  template: cond(
    'count !== undefined',
    [
      // `count > 0` is false for `NaN` too: zero, less, or no number draws nothing.
      cond('count > 0', [
        el(
          'span',
          {
            class: ['badge'],
            attrs: {
              'data-variant': 'variant',
              'data-tone': 'tone',
              'data-count': lit(''),
              ...identity('Badge'),
            },
          },
          [text('shown')],
        ),
      ]),
    ],
    'dot',
    [
      el(
        'span',
        {
          class: ['badge'],
          attrs: {
            'data-variant': 'variant',
            'data-tone': 'tone',
            // A dot with no words is hidden; its words are read in its place.
            'aria-hidden': "slotText(slots.default) === '' ? true : undefined",
            'data-dot': lit(''),
            ...identity('Badge'),
          },
        },
        [cond("slotText(slots.default) !== ''", [el('span', { class: ['spoken'] }, [slot()])])],
      ),
    ],
    [
      el(
        'span',
        {
          class: ['badge'],
          attrs: { 'data-variant': 'variant', 'data-tone': 'tone', ...identity('Badge') },
        },
        [
          cond('icon !== undefined', [
            el('span', { class: ['glyph'] }, [member('Icon', { name: 'icon', size: lit('sm') })]),
          ]),
          slot(),
        ],
      ),
    ],
  ),
  states: [
    ...VARIANTS.flatMap((variant) =>
      TONES.map((tone) => ({
        name: `${variant} / ${tone}`,
        props: { variant, tone },
        slots: { default: ['Active'] },
        expect: { 'data-variant': variant, 'data-tone': tone },
      })),
    ),
    {
      name: 'the whole grid at once',
      many: {
        within: { member: 'Inline', props: { gap: 2, wrap: true } },
        each: VARIANTS.flatMap((variant) =>
          TONES.map((tone) => ({ props: { variant, tone }, slots: { default: [tone] } })),
        ),
      },
    },
    { name: 'with an icon', props: { icon: 'time' }, slots: { default: ['Waiting'] } },
    {
      name: 'a count',
      props: { variant: 'solid', tone: 'accent', count: 3 },
      expect: { 'data-count': '' },
    },
    {
      name: 'a count past its cap',
      props: { variant: 'solid', tone: 'accent', count: 128 },
      expect: { 'data-count': '' },
    },
    {
      name: 'a count in every variant',
      many: {
        within: { member: 'Inline', props: { gap: 2 } },
        each: VARIANTS.map((variant) => ({ props: { variant, tone: 'accent', count: 12 } })),
      },
    },
    {
      name: 'a dot',
      props: { tone: 'accent', dot: true },
      slots: { default: ['New'] },
      expect: { 'data-dot': '' },
    },
    {
      name: 'a dot in every tone',
      many: {
        within: { member: 'Inline', props: { gap: 3, align: 'center' } },
        each: TONES.map((tone) => ({ props: { tone, dot: true }, slots: { default: [tone] } })),
      },
    },
  ],
})
