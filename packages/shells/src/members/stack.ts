import { describeMember, el, fx, identity, lit, slot, spacing } from '../dsl'

const chips = (count = 3) =>
  Array.from({ length: count }, (_, at) => fx('Badge', {}, { default: [`item ${at + 1}`] }))

/** Stack (`design/components/stack.md`): the vertical layout primitive. */
export default describeMember({
  member: 'Stack',
  dir: 'layout',
  recipe: 'layout/layout',
  types: {
    StackAlign: "NonNullable<StackProps['align']>",
    StackElement: "NonNullable<StackProps['as']>",
    StackJustify: "NonNullable<StackProps['justify']>",
  },
  defaults: { align: lit('stretch'), justify: lit('start'), as: lit('div') },
  template: el(
    { expr: 'as' },
    {
      class: ['layout', 'stack'],
      spread: [spacing],
      attrs: { 'data-align': 'align', 'data-justify': 'justify', ...identity('Stack') },
    },
    [slot()],
  ),
  states: [
    { name: 'gap 3', props: { gap: 3 }, slots: { default: chips() }, expect: { 'data-gap': '3' } },
    { name: 'gap 6', props: { gap: 6 }, slots: { default: chips() }, expect: { 'data-gap': '6' } },
    {
      name: 'padded p 5',
      props: { gap: 2, p: 5 },
      slots: { default: chips(2) },
      expect: { 'data-p': '5' },
    },
    {
      name: 'axis override p 5 py 2',
      props: { gap: 2, p: 5, py: 2 },
      slots: { default: chips(2) },
      expect: { 'data-p': '5', 'data-py': '2' },
    },
    {
      name: 'align center, justify between',
      props: { gap: 3, align: 'center', justify: 'between' },
      slots: { default: chips() },
      expect: { 'data-align': 'center', 'data-justify': 'between' },
    },
    {
      name: 'as list',
      props: { as: 'ul', gap: 2 },
      slots: {
        default: [
          { element: 'li', children: ['li one'] },
          { element: 'li', children: ['li two'] },
        ],
      },
    },
    {
      name: 'patched — rung 3',
      props: { gap: 6, patch: { gap: 2 } },
      slots: { default: chips() },
      expect: { 'data-gap': '2' },
    },
  ],
})
