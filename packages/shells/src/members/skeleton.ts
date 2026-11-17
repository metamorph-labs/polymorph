import { describeMember, el, fx, identity, lit, when } from '../dsl'

const STEPS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const

/** Skeleton (`design/components/skeleton.md`): a placeholder that holds the layout while content arrives. */
export default describeMember({
  member: 'Skeleton',
  dir: 'structure',
  recipe: 'structure/skeleton',
  types: {
    SkeletonShape: "NonNullable<SkeletonProps['shape']>",
  },
  defaults: { shape: lit('text') },
  derived: {
    // A text skeleton is the line box of its step, `md` when none is given; other shapes have none.
    step: "shape === 'text' ? (textStep ?? 'md') : undefined",
    // A circle's width is its `size`; the other shapes fill what holds them unless told otherwise.
    span: "shape === 'circle' ? undefined : (width ?? 'full')",
    named: 'label !== undefined',
  },
  template: el('div', {
    class: ['skeleton'],
    attrs: {
      'data-shape': 'shape',
      'data-text-step': 'step',
      'data-width': 'span === undefined ? undefined : String(span)',
      'data-size': 'size === undefined ? undefined : String(size)',
      // A named region is a status; an unnamed grey box means nothing to a screen reader.
      role: when('named', lit('status')),
      'aria-label': 'label',
      'aria-hidden': when('!named', 'true'),
      ...identity('Skeleton'),
    },
  }),
  states: [
    { name: 'text, default step', expect: { 'data-shape': 'text' } },
    {
      name: 'text steps — each is the line box it stands in for',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: STEPS.map((step) => ({ props: { textStep: step, width: 10 } })),
      },
    },
    {
      name: 'rect',
      props: { shape: 'rect', size: 8, width: 10 },
      expect: { 'data-shape': 'rect' },
    },
    { name: 'circle', props: { shape: 'circle', size: 7 }, expect: { 'data-shape': 'circle' } },
    {
      name: 'a loading row, the way a page would use it',
      many: {
        within: { member: 'Inline', props: { gap: 4 } },
        each: [{ props: { shape: 'circle', size: 7 } }],
        also: [
          fx(
            'Stack',
            { gap: 2, justify: 'center' },
            {
              default: [
                fx('Skeleton', { textStep: 'md', width: 10 }),
                fx('Skeleton', { textStep: 'sm', width: 9 }),
              ],
            },
          ),
        ],
      },
    },
    {
      name: 'a named region',
      props: { label: 'Loading tickets' },
      expect: { role: 'status', 'aria-label': 'Loading tickets', 'aria-hidden': null },
    },
  ],
})
