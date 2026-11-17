import { describeMember, el, fx, identity, lit, member, text } from '../dsl'

/** Spinner (`design/components/spinner.md`): a loading indicator for work of unknown duration. */
export default describeMember({
  member: 'Spinner',
  dir: 'structure',
  recipe: 'structure/spinner',
  defaults: { size: lit('md'), label: lit('Loading') },
  template: el(
    'span',
    {
      class: ['spinner'],
      attrs: { 'data-size': 'size', role: lit('status'), ...identity('Spinner') },
    },
    [
      el('span', { part: 'glyph', class: ['glyph'] }, [
        member('Icon', { name: lit('loading'), size: 'size' }),
      ]),
      // Visually hidden rather than absent: the glyph shows "loading" but has no text.
      el('span', { part: 'label', class: ['label'] }, [text('label')]),
    ],
  ),
  states: [
    { name: 'md — the default', expect: { 'data-size': 'md' } },
    {
      name: 'three sizes',
      many: {
        within: { member: 'Inline', props: { gap: 4, align: 'center' } },
        each: [
          { props: { size: 'sm', label: 'Loading small' } },
          { props: { size: 'md', label: 'Loading medium' } },
          { props: { size: 'lg', label: 'Loading large' } },
        ],
      },
    },
    { name: 'a label that says what is loading', props: { label: 'Fetching tickets' } },
    {
      name: 'takes its colour from where it sits',
      many: {
        within: { member: 'Stack', props: { gap: 3 } },
        each: [],
        // The row nests inside the Stack, so the spinner is written in it.
        also: [
          fx(
            'Inline',
            { gap: 3, align: 'center' },
            {
              default: [
                fx('Spinner', { label: 'Loading' }),
                { element: 'span', children: ['inherits the surrounding text colour'] },
              ],
            },
          ),
        ],
      },
    },
    {
      name: 'owns no layout — centring is the region’s decision',
      many: {
        within: { member: 'Stack', props: { gap: 3, align: 'center' } },
        each: [{ props: { size: 'lg', label: 'Loading the inbox' } }],
      },
    },
  ],
})
