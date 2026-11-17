import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  member,
  node,
  render,
  slot,
  type FixtureChild,
} from '../dsl'

const TICKETS = [
  { id: 'T-1041', subject: 'Login loop after password reset', status: 'Open', replies: 4 },
  { id: 'T-1039', subject: 'Invoice shows the wrong currency', status: 'Waiting', replies: 12 },
  { id: 'T-1032', subject: 'Export finishes but the file is empty', status: 'Open', replies: 2 },
  { id: 'T-1027', subject: 'Cannot invite a teammate', status: 'Closed', replies: 7 },
  { id: 'T-1019', subject: 'Webhook retries stop after one failure', status: 'Open', replies: 1 },
] as const

const TONE = { Open: 'accent', Waiting: 'warning', Closed: 'neutral' } as const

const ACTIONS = [
  fx('Button', { variant: 'ghost', tone: 'neutral', icon: 'download', label: 'Export' }),
  fx('Button', { icon: 'add', label: 'New ticket' }),
]

const FILTERS = [
  fx('Input', {
    size: 'sm',
    icon: 'search',
    placeholder: 'Search tickets…',
    'aria-label': 'Search tickets',
  }),
  fx('Select', {
    size: 'sm',
    'aria-label': 'Status',
    placeholder: 'Any status',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'waiting', label: 'Waiting' },
      { value: 'closed', label: 'Closed' },
    ],
  }),
]

const stat = (
  label: string,
  value: string,
  direction: 'up' | 'down',
  change: string,
  primary: string,
  secondary: string,
): FixtureChild =>
  fx(
    'Card',
    {},
    {
      default: [
        fx('Stat', {
          label,
          value,
          trend: { direction, label: change },
          footer: { primary, secondary },
        }),
      ],
    },
  )

/** The summary band: four Cards on the page background, kept through the body swap. */
const SUMMARY = fx(
  'Grid',
  { columns: 4, gap: 6 },
  {
    default: [
      stat(
        'Open tickets',
        '3',
        'down',
        '−40%',
        '2 fewer than last week',
        'Still waiting on someone',
      ),
      stat('Urgent', '1', 'down', '−67%', '2 fewer than last week', 'Triage before anything else'),
      stat(
        'Median response',
        '2h 23m',
        'up',
        '+18%',
        'Slower than last week',
        'Since the last reply',
      ),
      stat(
        'Solved this week',
        '2',
        'down',
        '−33%',
        '1 fewer than last week',
        'Closed in the last seven days',
      ),
    ],
  },
)

const EMPTY = {
  title: 'No tickets yet',
  description: 'When a customer writes in, their ticket will show up here.',
  action: node(fx('Button', { variant: 'soft', icon: 'add', label: 'New ticket' })),
}

const DRY = {
  icon: 'search',
  title: 'No results match',
  description: 'Nothing here answers to those filters.',
  secondaryAction: node(
    fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Clear filters' }),
  ),
}

const cell = (content: FixtureChild, numeric = false): FixtureChild =>
  fx('TableCell', numeric ? { numeric: true } : {}, { default: [content] })

const header = (label: string): FixtureChild => fx('TableHeader', {}, { default: [label] })

const TICKETS_TABLE = fx(
  'Table',
  { label: 'Tickets' },
  {
    default: [
      fx(
        'TableHead',
        {},
        {
          default: [
            fx(
              'TableRow',
              {},
              {
                default: [
                  header('Ticket'),
                  header('Subject'),
                  header('Status'),
                  fx(
                    'TableHeader',
                    { numeric: true, sortable: true, sortDirection: 'desc' },
                    { default: ['Replies'] },
                  ),
                ],
              },
            ),
          ],
        },
      ),
      fx(
        'TableBody',
        {},
        {
          default: TICKETS.map((ticket) =>
            fx(
              'TableRow',
              { interactive: true },
              {
                default: [
                  cell(ticket.id),
                  cell(ticket.subject),
                  cell(fx('Badge', { tone: TONE[ticket.status] }, { default: [ticket.status] })),
                  cell(String(ticket.replies), true),
                ],
              },
            ),
          ),
        },
      ),
    ],
  },
)

/**
 * ListPage (`design/archetypes/list-page.md`): the records screen. Header,
 * summary band, filters and body are slots in a fixed order, so the page
 * cannot be assembled in the wrong one, and `emptyState` is required, so the
 * page always says what it shows with no records.
 *
 * The body swaps between the records and the empty state by
 * `listpage.bodyswap`, a crossfade in one grid cell, each body its own
 * presence; a page that loads empty does not fade in. The empty state is drawn
 * from `emptyState`, an `EmptyStateProps` whose actions are VNodes, each
 * passed to EmptyState's slot only when it is there, because EmptyState draws
 * its actions row whenever an action slot is passed.
 */
export default describeMember({
  member: 'ListPage',
  dir: 'archetypes',
  recipe: 'archetypes/list-page',
  uses: ['EmptyStateProps'],
  defaults: { empty: 'false' },
  presence: {
    recordsPresent: { open: '!empty', ref: 'records', binding: 'listpage.bodyswap' },
    emptyPresent: { open: 'empty', ref: 'nothing', binding: 'listpage.bodyswap' },
  },
  template: el(
    'div',
    { class: ['page'], attrs: { 'data-empty': flag('empty'), ...identity('ListPage') } },
    [
      member(
        'PageHeader',
        { title: 'title', description: 'description' },
        { slots: { actions: [slot('actions')] }, slotWhen: { actions: 'slots.actions' } },
      ),
      // No wrapper: the page's row gap spaces it.
      slot('summary'),
      cond('slots.filters', [
        member('Inline', { gap: '3', wrap: 'true' }, { slots: { default: [slot('filters')] } }),
      ]),
      el('div', { class: ['bodySlot'] }, [
        cond('recordsPresent', [el('div', { class: ['body'], ref: 'records' }, [slot()])]),
        cond('emptyPresent', [
          el('div', { class: ['body'], ref: 'nothing' }, [
            member(
              'EmptyState',
              {
                icon: 'emptyState.icon',
                title: 'emptyState.title',
                description: 'emptyState.description',
              },
              {
                slots: {
                  action: [render('emptyState.action')],
                  secondaryAction: [render('emptyState.secondaryAction')],
                },
                slotWhen: {
                  action: 'emptyState.action !== undefined',
                  secondaryAction: 'emptyState.secondaryAction !== undefined',
                },
              },
            ),
          ]),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'full — header, filters, table',
      props: {
        title: 'Tickets',
        description: 'Everything customers have asked for, oldest first.',
        emptyState: EMPTY,
      },
      slots: { actions: ACTIONS, filters: FILTERS, default: [TICKETS_TABLE] },
    },
    {
      name: 'with a summary band — the numbers before the rows',
      props: { title: 'Tickets', emptyState: EMPTY },
      slots: { actions: ACTIONS, summary: [SUMMARY], filters: FILTERS, default: [TICKETS_TABLE] },
    },
    {
      name: 'summary survives the empty story — a filter changed the view, not the queue',
      props: { empty: true, title: 'Tickets', emptyState: DRY },
      slots: { actions: ACTIONS, summary: [SUMMARY], filters: FILTERS, default: [TICKETS_TABLE] },
      expect: { 'data-empty': '' },
    },
    {
      name: 'no filters — the gutter closes cleanly',
      props: { title: 'Tickets', emptyState: EMPTY },
      slots: { actions: ACTIONS, default: [TICKETS_TABLE] },
    },
    {
      name: 'empty',
      props: { empty: true, title: 'Tickets', emptyState: EMPTY },
      slots: { actions: ACTIONS, filters: FILTERS, default: [TICKETS_TABLE] },
      expect: { 'data-empty': '' },
    },
    {
      name: 'filtered dry — the way out is a secondary action',
      props: { empty: true, title: 'Tickets', emptyState: DRY },
      slots: { actions: ACTIONS, filters: FILTERS, default: [TICKETS_TABLE] },
      expect: { 'data-empty': '' },
    },
  ],
})
