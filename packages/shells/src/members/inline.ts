import { describeMember, el, flag, fx, identity, lit, slot, spacing } from '../dsl'

const tag = (label: string) => fx('Badge', {}, { default: [label] })

/** Inline (`design/components/inline.md`): Stack's horizontal counterpart. */
export default describeMember({
  member: 'Inline',
  dir: 'layout',
  recipe: 'layout/layout',
  types: {
    InlineAlign: "NonNullable<InlineProps['align']>",
    InlineElement: "NonNullable<InlineProps['as']>",
    InlineJustify: "NonNullable<InlineProps['justify']>",
  },
  defaults: { align: lit('center'), justify: lit('start'), as: lit('div'), wrap: 'false' },
  template: el(
    { expr: 'as' },
    {
      class: ['layout', 'inline'],
      spread: [spacing],
      attrs: {
        'data-align': 'align',
        'data-justify': 'justify',
        'data-wrap': flag('wrap'),
        ...identity('Inline'),
      },
    },
    [slot()],
  ),
  states: [
    {
      name: 'control row — mixed heights centre',
      props: { gap: 3 },
      slots: {
        default: [
          fx('Button', { label: 'tall', size: 'lg' }),
          tag('short'),
          fx('Icon', { name: 'settings', label: 'Settings' }),
        ],
      },
      expect: { 'data-align': 'center', 'data-gap': '3' },
    },
    {
      name: 'baseline text run',
      props: { gap: 3, align: 'baseline' },
      slots: { default: [fx('Button', { label: 'tall', size: 'lg' }), tag('short')] },
      expect: { 'data-align': 'baseline' },
    },
    {
      name: 'wrapping tag list',
      props: { gap: 2, wrap: true },
      slots: { default: Array.from({ length: 14 }, (_, at) => tag(`tag ${at + 1}`)) },
      expect: { 'data-wrap': '' },
    },
    {
      name: 'justify between',
      props: { gap: 3, justify: 'between' },
      slots: { default: [tag('left'), tag('right')] },
      expect: { 'data-justify': 'between' },
    },
    {
      name: 'as nav',
      props: { as: 'nav', gap: 4 },
      slots: { default: [tag('Inbox'), tag('Settings')] },
    },
  ],
})
