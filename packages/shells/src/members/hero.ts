import { cond, describeMember, el, fx, identity, lit, member, slot, text } from '../dsl'

const TITLE = 'One vocabulary. Any number of faces.'

const LEDE =
  'Every design decision is made exactly once, referenced everywhere, verified by law, and safely changeable — by people and by agents.'

/**
 * Hero (`design/components/hero.md`): the large title block that opens a page.
 * It renders the page's `<h1>`, so a page has one Hero or one PageHeader.
 */
export default describeMember({
  member: 'Hero',
  dir: 'structure',
  recipe: 'structure/hero',
  types: {
    HeroAlign: "NonNullable<HeroProps['align']>",
  },
  defaults: { align: lit('start') },
  template: el(
    'section',
    { class: ['hero'], attrs: { 'data-align': 'align', ...identity('Hero') } },
    [
      el('h1', { part: 'title', class: ['title'] }, [text('title')]),
      cond('lede !== undefined', [el('p', { part: 'lede', class: ['lede'] }, [text('lede')])]),
      cond('slots.actions', [
        // Centred through Inline's `justify`, so the recipe holds no descendant rule for it.
        member(
          'Inline',
          { gap: '3', wrap: 'true', justify: "align === 'center' ? 'center' : 'start'" },
          { slots: { default: [slot('actions')] } },
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'opening moment',
      props: { title: TITLE, lede: LEDE },
      slots: {
        actions: [fx('Button', { variant: 'solid', tone: 'accent', label: 'Browse components' })],
      },
      expect: { 'data-align': 'start' },
    },
    {
      name: 'centered',
      props: { align: 'center', title: TITLE, lede: LEDE },
      slots: {
        actions: [
          fx('Button', { variant: 'solid', tone: 'accent', label: 'Browse components' }),
          fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Read the brief' }),
        ],
      },
      expect: { 'data-align': 'center' },
    },
    { name: 'title alone', props: { title: TITLE }, expect: { 'data-align': 'start' } },
  ],
})
