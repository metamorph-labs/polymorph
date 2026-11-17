import { type ComponentStates } from '@polymorph/react'
import { Timeline, type TimelineEvent, type TimelineTone } from './Timeline'

/** States fixture, from `design/components/timeline.md`'s States table. */

const HISTORY: TimelineEvent[] = [
  { title: 'Ticket opened', time: '3 days ago', icon: 'add', tone: 'info' },
  {
    title: 'Assigned to Ada Okonkwo',
    time: '2 days ago',
    detail: 'Moved out of the Platform queue.',
    icon: 'user',
  },
  {
    title: 'Escalated to urgent',
    time: '4 hours ago',
    detail: 'Second customer reported the same failure.',
    icon: 'warning',
    tone: 'danger',
  },
  { title: 'Replied to the customer', time: '20 minutes ago', icon: 'comment', tone: 'accent' },
]

/** The same events with no icon roles, for the plain-dot column. */
const DOTS: TimelineEvent[] = HISTORY.map(({ title, time }) => ({ title, time }))

const TONES: TimelineTone[] = ['neutral', 'accent', 'info', 'success', 'warning', 'danger']

const EVERY_TONE: TimelineEvent[] = TONES.map((tone) => ({
  title: `A ${tone} event`,
  time: 'just now',
  icon: 'tag',
  tone,
}))

export const states: ComponentStates = {
  component: 'Timeline',

  entries: [
    {
      name: 'a history — mixed marks and tones',
      render: () => <Timeline events={HISTORY} label="Ticket history" />,
      expect: { 'aria-label': 'Ticket history' },
    },
    {
      name: 'dots only — no role on any event',
      render: () => <Timeline events={DOTS} label="Ticket history" />,
    },
    {
      name: 'every tone',
      render: () => <Timeline events={EVERY_TONE} label="Every tone" />,
      expect: { 'aria-label': 'Every tone' },
    },
    {
      name: 'detail — with and without',
      render: () => <Timeline events={HISTORY.slice(1, 3)} label="Ticket history" />,
    },
    {
      name: 'one event — nothing to join it to',
      render: () => <Timeline events={HISTORY.slice(0, 1)} label="Ticket history" />,
    },
    {
      name: 'empty — the page tells that story, not the list',
      render: () => <Timeline events={[]} label="Ticket history" />,
      rendersNothing: true,
    },
  ],

  /*
   * No pseudo-class states, because nothing in a record of the past can be
   * pressed. Instead, every tone value, to show each has a recipe and not only a
   * type.
   *
   * `neutral` is absent on purpose: it is the default, sets no attribute, and
   * uses the base rule, so listing it would force a selector against the
   * convention.
   */
  requiredSelectors: [
    '[data-mark="dot"]',
    '[data-mark="icon"]',
    '[data-tone="accent"]',
    '[data-tone="info"]',
    '[data-tone="success"]',
    '[data-tone="warning"]',
    '[data-tone="danger"]',
  ],
}
