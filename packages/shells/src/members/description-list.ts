import { cond, describeMember, each, el, fx, identity, lit, node, render, text } from '../dsl'

const TICKET_META = [
  { term: 'Status', detail: 'Open' },
  { term: 'Priority', detail: 'Urgent' },
  { term: 'Assignee', detail: 'Ada Okonkwo' },
  { term: 'Raised', detail: '3 days ago' },
]

/**
 * DescriptionList (`design/components/description-list.md`): label and value
 * pairs describing one entity, as `<dl>`, one `<dt>` and one `<dd>` per pair.
 * A detail is text, or a member's node (a Badge for a status), which keeps its
 * own style. An empty list renders nothing: EmptyState owns that sentence.
 */
export default describeMember({
  member: 'DescriptionList',
  dir: 'structure',
  recipe: 'structure/description-list',
  types: {
    DescriptionListItem: '{ term: string; detail: VNode | string }',
    DescriptionListOrientation: "NonNullable<DescriptionListProps['orientation']>",
  },
  defaults: { orientation: lit('vertical') },
  template: cond('items.length > 0', [
    el(
      'dl',
      {
        class: ['root'],
        attrs: { 'data-orientation': 'orientation', ...identity('DescriptionList') },
      },
      [
        each(
          'items',
          'item',
          'index',
          [
            el('div', { class: ['pair'] }, [
              el('dt', { class: ['term'] }, [text('item.term')]),
              el('dd', { class: ['detail'] }, [
                cond(
                  "typeof item.detail === 'string'",
                  [text('item.detail')],
                  [render('item.detail')],
                ),
              ]),
            ]),
          ],
          'index',
        ),
      ],
    ),
  ]),
  states: [
    {
      name: 'ticket meta — the aside register',
      props: { items: TICKET_META },
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'horizontal — a term column beside the details',
      props: { items: TICKET_META, orientation: 'horizontal' },
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'member detail — a value is often a member, not a sentence',
      props: {
        items: [
          {
            term: 'Status',
            detail: node(fx('Badge', { tone: 'warning' }, { default: ['Waiting'] })),
          },
          { term: 'Priority', detail: 'Normal' },
        ],
      },
    },
    { name: 'single pair', props: { items: [{ term: 'Status', detail: 'Open' }] } },
    {
      name: 'empty — EmptyState owns that sentence',
      props: { items: [] },
      rendersNothing: true,
    },
  ],
})
