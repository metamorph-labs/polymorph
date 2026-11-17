import { cond, describeMember, el, fx, identity, lit, text } from '../dsl'

const paragraph = (words: string) => ({ element: 'p', children: [words] })

/*
 * Where the separator sits between other content, the entry lists it in `also`
 * with that content, in order, and `each` is empty: `each` renders first.
 */

/** Separator (`design/components/separator.md`): a thin line that divides content. */
export default describeMember({
  member: 'Separator',
  dir: 'structure',
  recipe: 'structure/separator',
  types: {
    SeparatorOrientation: "NonNullable<SeparatorProps['orientation']>",
  },
  defaults: { orientation: lit('horizontal') },
  template: cond(
    'label !== undefined',
    [
      // Not decorative: the word is content and is read out. The rules either side are borders.
      el(
        'div',
        {
          class: ['labelled'],
          attrs: { 'data-orientation': lit('horizontal'), ...identity('Separator') },
        },
        [
          el('span', { part: 'rule', class: ['rule'] }),
          el('span', { part: 'label', class: ['label'] }, [text('label')]),
          el('span', { part: 'rule', class: ['rule'] }),
        ],
      ),
    ],
    [
      // Decorative, because the line only shows a grouping the DOM already has.
      el('div', {
        class: ['separator'],
        attrs: {
          'data-orientation': 'orientation',
          'aria-hidden': lit('true'),
          ...identity('Separator'),
        },
      }),
    ],
  ),
  states: [
    { name: 'horizontal', expect: { 'data-orientation': 'horizontal' } },
    {
      name: 'vertical',
      props: { orientation: 'vertical' },
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'between two things composition cannot separate',
      many: {
        within: { member: 'Stack', props: { gap: 4 } },
        each: [],
        also: [
          paragraph('Everything above this line is one thought.'),
          fx('Separator'),
          paragraph('Everything below it is another.'),
        ],
      },
    },
    {
      name: 'in a toolbar row',
      many: {
        within: { member: 'Inline', props: { gap: 3, align: 'center' } },
        each: [],
        also: [
          { element: 'span', children: ['Cut'] },
          { element: 'span', children: ['Copy'] },
          fx('Separator', { orientation: 'vertical' }),
          { element: 'span', children: ['Undo'] },
        ],
      },
    },
    {
      name: 'no margins of its own — the gap is the parent’s',
      many: {
        within: { member: 'Stack', props: { gap: 7 } },
        each: [],
        also: [
          paragraph('A wider gap around the same separator.'),
          fx('Separator'),
          paragraph('Spacing is one decision, made in one place.'),
        ],
      },
    },
    {
      name: 'labelled — the word is content, the flanking rules stay silent',
      props: { label: 'OR' },
      expect: { 'data-orientation': 'horizontal', 'aria-hidden': null },
    },
  ],
})
