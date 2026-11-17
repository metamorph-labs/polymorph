import { describeMember, el, fx, identity, lit, slot } from '../dsl'

/** Text (`design/components/text.md`): a paragraph of body text. */
export default describeMember({
  member: 'Text',
  dir: 'structure',
  recipe: 'structure/text',
  types: {
    TextSize: "NonNullable<TextProps['size']>",
    TextTone: "NonNullable<TextProps['tone']>",
  },
  defaults: { size: lit('md'), tone: lit('primary') },
  derived: {
    // A count that is not whole reads as the whole number below it; below 1 nothing is cut.
    kept: 'lines === undefined ? 0 : Math.floor(lines)',
    clamped: 'kept >= 1',
  },
  template: el(
    'p',
    {
      class: ['text'],
      attrs: {
        'data-size': 'size',
        'data-tone': 'tone',
        'data-lines': 'clamped ? kept : undefined',
        ...identity('Text'),
      },
      // The count is data, not a design value, so it reaches the recipe as a property.
      geometry: { '--pm-text-clamp': 'clamped ? kept : undefined' },
    },
    [slot()],
  ),
  states: [
    {
      name: 'body',
      slots: {
        default: [
          'A pairing is two JSON files: a system’s eight axes and fonts, a palette’s handful of colour seeds.',
        ],
      },
      expect: { 'data-size': 'md', 'data-tone': 'primary' },
    },
    {
      name: 'secondary sm',
      props: { size: 'sm', tone: 'secondary' },
      slots: { default: ['Everyone who can open a ticket in this workspace.'] },
      expect: { 'data-size': 'sm', 'data-tone': 'secondary' },
    },
    {
      name: 'with emphasis',
      slots: {
        default: [
          'Contrast, coherence and state completeness are ',
          { element: 'strong', children: ['laws'] },
          ', not guidelines.',
        ],
      },
      expect: { 'data-size': 'md', 'data-tone': 'primary' },
    },
    {
      name: 'emphasis inside secondary prose keeps the primary ink',
      props: { size: 'sm', tone: 'secondary' },
      slots: {
        default: [
          'Deviation is either ',
          { element: 'strong', children: ['impossible'] },
          ' or loud.',
        ],
      },
      expect: { 'data-size': 'sm', 'data-tone': 'secondary' },
    },
    {
      name: 'with inline code in it',
      slots: {
        default: [
          'Set ',
          { element: 'code', children: ['pm-system'] },
          ' on the page root and the page repaints.',
        ],
      },
      expect: { 'data-size': 'md', 'data-tone': 'primary' },
    },
    {
      name: 'one line',
      props: { lines: 1 },
      slots: {
        default: [
          'Replies reach the customer by email, stay in the ticket’s history, and are searchable by everyone who can open the ticket in this workspace.',
        ],
      },
      expect: { 'data-lines': '1' },
    },
    {
      name: 'three lines',
      props: { size: 'sm', tone: 'secondary', lines: 3 },
      slots: {
        default: [
          'A pairing is two JSON files: a system’s eight axes and fonts, and a palette’s handful of colour seeds. The engine derives every role from them, checks each text role against each surface it can sit on, and refuses a pairing that fails. A redesign is an edit to one of the two files, and every screen follows it, because no screen names a colour, a length or a font of its own. The laws run on every change, so a pairing that drifts below the contrast floor is caught where it is made.',
        ],
      },
      expect: { 'data-lines': '3' },
    },
    {
      name: 'an id on one line',
      props: { size: 'sm', lines: 1 },
      slots: {
        default: [
          fx(
            'Code',
            {},
            { default: ['9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'] },
          ),
        ],
      },
      expect: { 'data-lines': '1' },
    },
  ],
})
