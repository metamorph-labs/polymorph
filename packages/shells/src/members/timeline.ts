import { cond, describeMember, el, each, identity, lit, member, text } from '../dsl'

const HISTORY = [
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
const DOTS = HISTORY.map(({ title, time }) => ({ title, time }))

const EVERY_TONE = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'].map((tone) => ({
  title: `A ${tone} event`,
  time: 'just now',
  icon: 'tag',
  tone,
}))

/**
 * Timeline (`design/components/timeline.md`): a vertical sequence of dated
 * events, read in the order given. The title carries the meaning, so the
 * marker column is hidden from the accessibility tree and a tone only
 * emphasises words already on the page. An empty list renders nothing.
 */
export default describeMember({
  member: 'Timeline',
  dir: 'structure',
  recipe: 'structure/timeline',
  types: {
    TimelineTone: "'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'",
    TimelineEvent:
      '{ title: string; time: string; detail?: string; icon?: IconRole; tone?: TimelineTone }',
  },
  template: cond('events.length > 0', [
    el('ol', { class: ['root'], attrs: { 'aria-label': 'label', ...identity('Timeline') } }, [
      // Keyed by position, an event's only identity: an append-only record never reorders.
      each(
        'events',
        'event',
        'at',
        [
          el(
            'li',
            {
              part: 'event',
              class: ['event'],
              // Neutral is the rest state and sets no attribute.
              attrs: {
                'data-tone':
                  "event.tone === undefined || event.tone === 'neutral' ? undefined : event.tone",
              },
            },
            [
              // Decorative: the recipe draws the rule on this column to reach the next mark.
              el(
                'span',
                { part: 'marker', class: ['marker'], attrs: { 'aria-hidden': lit('true') } },
                [
                  el(
                    'span',
                    {
                      part: 'mark',
                      class: ['mark'],
                      attrs: { 'data-mark': "event.icon === undefined ? 'dot' : 'icon'" },
                    },
                    [
                      cond('event.icon !== undefined', [
                        member('Icon', { name: 'event.icon', size: lit('sm') }),
                      ]),
                    ],
                  ),
                ],
              ),
              el('span', { part: 'copy', class: ['copy'] }, [
                el('span', { part: 'title', class: ['title'] }, [text('event.title')]),
                // The time qualifies the title, so it follows it; the detail comes last.
                el('span', { part: 'time', class: ['time'] }, [text('event.time')]),
                cond('event.detail !== undefined', [
                  el('span', { part: 'detail', class: ['detail'] }, [text('event.detail')]),
                ]),
              ]),
            ],
          ),
        ],
        'at',
      ),
    ]),
  ]),
  states: [
    {
      name: 'a history — mixed marks and tones',
      props: { events: HISTORY, label: 'Ticket history' },
      expect: { 'aria-label': 'Ticket history' },
    },
    { name: 'dots only — no role on any event', props: { events: DOTS, label: 'Ticket history' } },
    {
      name: 'every tone',
      props: { events: EVERY_TONE, label: 'Every tone' },
      expect: { 'aria-label': 'Every tone' },
    },
    {
      name: 'detail — with and without',
      props: { events: HISTORY.slice(1, 3), label: 'Ticket history' },
    },
    {
      name: 'one event — nothing to join it to',
      props: { events: HISTORY.slice(0, 1), label: 'Ticket history' },
    },
    {
      name: 'empty — the page tells that story, not the list',
      props: { events: [], label: 'Ticket history' },
      rendersNothing: true,
    },
  ],
})
