import { type ComponentStates } from '@polymorph/react'
import { Badge } from './Badge'
import { DescriptionList, type DescriptionListItem } from './DescriptionList'

/** States fixture, from `design/components/description-list.md`'s States table. */

const TICKET_META: DescriptionListItem[] = [
  { term: 'Status', detail: 'Open' },
  { term: 'Priority', detail: 'Urgent' },
  { term: 'Assignee', detail: 'Ada Okonkwo' },
  { term: 'Raised', detail: '3 days ago' },
]

export const states: ComponentStates = {
  component: 'DescriptionList',

  entries: [
    {
      name: 'ticket meta — the aside register',
      render: () => <DescriptionList items={TICKET_META} />,
      expect: { 'data-orientation': 'vertical' },
    },
    {
      name: 'horizontal — a term column beside the details',
      render: () => <DescriptionList items={TICKET_META} orientation="horizontal" />,
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'member detail — a value is often a member, not a sentence',
      render: () => (
        <DescriptionList
          items={[
            { term: 'Status', detail: <Badge tone="warning">Waiting</Badge> },
            { term: 'Priority', detail: 'Normal' },
          ]}
        />
      ),
    },
    {
      name: 'single pair',
      render: () => <DescriptionList items={[{ term: 'Status', detail: 'Open' }]} />,
    },
    {
      name: 'empty — EmptyState owns that sentence',
      render: () => <DescriptionList items={[]} />,
      rendersNothing: true,
    },
  ],

  /*
   * Only the orientation, because nothing here is pressed, hovered or focused
   * (as in Timeline).
   */
  requiredSelectors: ['[data-orientation="horizontal"]'],
}
