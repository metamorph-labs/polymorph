import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  lit,
  run,
  slot,
  text,
  type FixtureChild,
} from '../dsl'
import { NAVIGATES_HERE } from './link'

/** The React fixture's `Content`: two badges and a line of prose, composed in a Stack. */
const content: readonly FixtureChild[] = [
  fx(
    'Stack',
    { gap: 3 },
    {
      default: [
        fx(
          'Inline',
          { gap: 2 },
          {
            default: [
              fx('Badge', { tone: 'accent' }, { default: ['Open'] }),
              fx('Badge', {}, { default: ['Billing'] }),
            ],
          },
        ),
        {
          element: 'p',
          children: ['A card is a bounded surface. What goes in it composes freely.'],
        },
      ],
    },
  ),
]

/**
 * Card (`design/components/card.md`): a bordered surface that groups related content. Its
 * `title` is its one heading, in the section-heading recipe Dashboard.Panel draws, at the
 * element `headingLevel` names; a titled section or article is named by it.
 * A caller that listens for `navigate` gets the cover's clicks that would
 * navigate this tab, with the browser's navigation stopped, as Link's caller
 * does (`link.md` §Routing).
 */
export default describeMember({
  member: 'Card',
  dir: 'structure',
  recipe: 'structure/card',
  // The steps are literals, because the generator imports a foundation type (`SpaceStep`) only
  // where a prop's own type names it.
  types: {
    CardElement: "NonNullable<CardProps['as']>",
    CardHeadingLevel: "NonNullable<CardProps['headingLevel']>",

    CardPatch:
      "{ p?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; px?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; py?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; radius?: 'none' | 'sm' | 'md' | 'lg' | 'pill' }",
  },
  defaults: { as: lit('div'), headingLevel: '2' },
  derived: {
    titleId: '`${uid}-title`',
    navigatesHere: NAVIGATES_HERE,
    // The cover's click that would navigate this tab is the app's router's.
    route:
      "(event: MouseEvent): void => { if (href === undefined || !navigatesHere(event)) return; event.preventDefault(); emit('navigate', href) }",
  },
  // The spec's `agent` fence. The element is the cover, which only a linked card draws, so a
  // card without `href` is not listed. A press is the cover's own click, so the router gets it
  // through `navigate`, or the browser follows the link, as for a person's click.
  agent: {
    on: 'cover',
    state: {},
    actions: { press: 'agentPress(cover)' },
  },
  template: el(
    { expr: 'as' },
    {
      class: ['card'],
      attrs: {
        // A titled section or article is named by its title; a div takes no name.
        'aria-labelledby': "title !== undefined && as !== 'div' ? titleId : undefined",
        // The same attribute name Table.Row uses.
        'data-interactive': flag('href !== undefined'),
        'data-p': 'patch?.p === undefined ? undefined : String(patch.p)',
        'data-px': 'patch?.px === undefined ? undefined : String(patch.px)',
        'data-py': 'patch?.py === undefined ? undefined : String(patch.py)',
        'data-radius': 'patch?.radius',
        ...identity('Card'),
      },
    },
    [
      cond('title !== undefined', [
        el(
          // The element and the level are the same number, as on Heading.
          { expr: "headingLevel === 4 ? 'h4' : headingLevel === 3 ? 'h3' : 'h2'" },
          { part: 'title', class: ['title'], attrs: { id: 'titleId' } },
          [text('title')],
        ),
      ]),
      slot(),
      // Last child, so it paints over the content without a z-index: one tab stop and one name.
      cond('href !== undefined', [
        el('a', {
          part: 'cover',
          ref: 'cover',
          class: ['cover'],
          attrs: { href: 'href', 'aria-label': 'label' },
          on: { click: run('route($event)', 'listening.navigate') },
        }),
      ]),
    ],
  ),
  states: [
    { name: 'default', slots: { default: content } },
    {
      name: 'patched padding — rung 3',
      props: { patch: { p: 4 } },
      slots: { default: content },
      expect: { 'data-p': '4' },
    },
    {
      name: 'patched radius — rung 3',
      props: { patch: { radius: 'sm' } },
      slots: { default: content },
      expect: { 'data-radius': 'sm' },
    },
    { name: 'as section', props: { as: 'section' }, slots: { default: content } },
    {
      name: 'titled — one heading, drawn as Dashboard.Panel draws its own',
      props: { title: 'Billing' },
      slots: { default: content },
    },
    {
      name: 'titled section, level 3 — named by its title',
      props: { as: 'section', title: 'Billing', headingLevel: 3 },
      slots: { default: content },
    },
    {
      name: 'a row of them, so the surface reads as one plane',
      many: {
        within: { member: 'Inline', props: { gap: 4, align: 'stretch' } },
        each: [{ slots: { default: content } }, { slots: { default: content } }],
      },
    },
    {
      name: 'linked — one large target, named by its label, without becoming a button',
      props: { href: '#ticket-4182', label: 'Open ticket 4182' },
      slots: { default: content },
      expect: { 'data-interactive': '' },
    },
  ],
})
