import {
  cond,
  describeMember,
  each,
  el,
  flag,
  fx,
  identity,
  js,
  member,
  slot,
  type FixtureChild,
  type Node,
} from '../dsl'

const STATS = [
  {
    label: 'Open tickets',
    value: '128',
    delta: { value: '8%', direction: 'down', positive: true },
    // The chart tier's smallest member, inside its tile: the trend beside the number.
    spark: [141, 138, 144, 136, 132, 135, 129, 131, 126, 128],
  },
  { label: 'First response', value: '14m', icon: 'time' },
  { label: 'Satisfaction', value: '91%', delta: { value: '3pts', direction: 'down' } },
]

/** Two weeks of Relay's queue, as calendar dates, so no time zone shifts them. */
const DAYS = Array.from({ length: 14 }, (_, index) => ({
  day: `2026-07-${String(index + 1).padStart(2, '0')}`,
  opened: [28, 34, 31, 45, 39, 22, 18][index % 7] ?? 30,
  resolved: [25, 30, 33, 41, 37, 20, 16][index % 7] ?? 28,
}))

/**
 * The primary panel's content, as React's fixture draws it: two series at the
 * default height, inside a panel that gives the surface and the heading.
 */
const VOLUME: FixtureChild = fx('LineChart', {
  data: DAYS,
  series: [
    { key: 'opened', label: 'Opened' },
    { key: 'resolved', label: 'Resolved' },
  ],
  x: { key: 'day', scale: 'time', label: 'Day' },
  label: 'Tickets opened and resolved by day',
})

/** The same chart before its rows arrive: its first-load skeleton. */
const VOLUME_LOADING: FixtureChild = fx('LineChart', {
  data: [],
  loading: true,
  series: [
    { key: 'opened', label: 'Opened' },
    { key: 'resolved', label: 'Resolved' },
  ],
  x: { key: 'day', scale: 'time', label: 'Day' },
  label: 'Tickets opened and resolved by day',
})

const row = (ticket: string, updated: string): FixtureChild =>
  fx(
    'TableRow',
    {},
    {
      default: [
        fx('TableCell', {}, { default: [ticket] }),
        fx('TableCell', { numeric: true }, { default: [updated] }),
      ],
    },
  )

/** The recent tickets, in a Table. */
const TICKETS: FixtureChild[] = [
  fx(
    'Table',
    { label: 'Recent tickets' },
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
                    fx('TableHeader', {}, { default: ['Ticket'] }),
                    fx('TableHeader', { numeric: true }, { default: ['Updated'] }),
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
            default: [
              row('Webhook retries stop after the first 5xx', '4m ago'),
              row('SSO login loops back to the sign-in page', '26m ago'),
            ],
          },
        ),
      ],
    },
  ),
]

const panel = (title: string | undefined, content: FixtureChild[]): FixtureChild =>
  fx('DashboardPanel', title === undefined ? {} : { title }, { default: content })

/**
 * The page header, with each slot passed only when the caller filled it. The InlineEdit of the
 * title takes `valueHidden` here as well as in PageHeader: Solid makes a member in the slot it
 * is read from, and Dashboard reads its own to ask whether it is filled, so the InlineEdit is
 * made in Dashboard's slot and takes that slot's props.
 */
const header: Node = member(
  'PageHeader',
  { title: 'title', description: 'description' },
  {
    slots: {
      titleEdit: [slot('titleEdit', { pass: { valueHidden: 'true' } })],
      actions: [slot('actions')],
    },
    slotWhen: { titleEdit: 'slots.titleEdit', actions: 'slots.actions' },
  },
)

/**
 * Dashboard (`design/archetypes/dashboard.md`): the overview screen, with
 * named, fixed regions rather than a widget canvas. The stat row takes data,
 * not nodes, so it stays a row of Stats, each in a Card, with the columns set
 * by the count. `Dashboard.Panel` is a named region: a Card with an `h2`.
 */
export default describeMember({
  member: 'Dashboard',
  dir: 'archetypes',
  recipe: 'archetypes/dashboard',
  uses: ['StatProps'],
  template: el('div', { part: 'page', class: ['page'], attrs: identity('Dashboard') }, [
    header,
    // The count sets the columns, so two stats do not sit in a four-column grid.
    cond('stats !== undefined && stats.length > 0', [
      el(
        'div',
        { part: 'stats', class: ['stats'], attrs: { 'data-count': 'String(stats.length)' } },
        [
          // By position and label: no spec makes a label unique, and Svelte throws on a repeated key.
          each(
            'stats',
            'stat',
            '`${at}-${stat.label}`',
            [
              member(
                'Card',
                {},
                {
                  slots: {
                    default: [
                      member('Stat', {
                        label: 'stat.label',
                        value: 'stat.value',
                        numeric: 'stat.numeric',
                        icon: 'stat.icon',
                        delta: 'stat.delta',
                        deltaLabel: 'stat.deltaLabel',
                        trend: 'stat.trend',
                        spark: 'stat.spark',
                        sparkLabel: 'stat.sparkLabel',
                        description: 'stat.description',
                        footer: 'stat.footer',
                        loading: 'stat.loading',
                        loadingLabel: 'stat.loadingLabel',
                      }),
                    ],
                  },
                },
              ),
            ],
            'at',
          ),
        ],
      ),
    ]),
    el(
      'div',
      { part: 'body', class: ['body'], attrs: { 'data-secondary': flag('slots.secondary') } },
      [
        el('div', { part: 'primary', class: ['primary'] }, [slot('primary')]),
        cond('slots.secondary', [
          el('div', { part: 'secondary', class: ['secondary'] }, [slot('secondary')]),
        ]),
      ],
    ),
  ]),
  parts: [
    {
      name: 'Panel',
      public: true,
      purpose: 'a named region: a Card with its heading',
      props: {
        title: {
          type: 'string',
          optional: true,
          doc: "Rendered as an `h2` with the system's section-heading recipe.",
        },
        children: { type: 'ReactNode' },
      },
      // The title is Card's, so the section-heading recipe is written once, in Card's recipe.
      template: member('Card', { title: 'title' }, { slots: { default: [slot()] } }),
    },
  ],
  states: [
    {
      name: 'three stats, a table and a narrow column',
      props: { title: 'Overview', description: 'The last seven days.', stats: STATS },
      slots: {
        primary: [panel('Ticket volume', [VOLUME]), panel('Recent tickets', TICKETS)],
        secondary: [
          panel('On call', [{ element: 'p', children: ['Ada Lovelace, until Friday.'] }]),
          panel('Backlog', [{ element: 'p', children: ['1,204 conversations.'] }]),
        ],
      },
    },
    {
      name: 'four stats',
      props: { title: 'Overview', stats: [...STATS, { label: 'Escalations', value: '17' }] },
      slots: { primary: [panel('Recent tickets', TICKETS)] },
    },
    {
      name: 'no second column — the primary takes the width',
      props: { title: 'Overview', stats: STATS.slice(0, 2) },
      slots: { primary: [panel('Recent tickets', TICKETS)] },
    },
    {
      name: 'a panel with no title, and no stats at all',
      props: { title: 'Overview' },
      slots: { primary: [panel(undefined, TICKETS)] },
    },
    {
      name: 'a title edited in place — the overview of one environment the reader names',
      props: { title: 'Staging', stats: STATS.slice(0, 2) },
      slots: {
        titleEdit: [
          fx('InlineEdit', {
            label: 'Environment name',
            value: 'Staging',
            size: 'lg',
            required: true,
            onCommit: js('() => {}'),
          }),
        ],
        primary: [panel('Recent tickets', TICKETS)],
      },
    },
    {
      name: 'the numbers loading — each card keeps its label and its height',
      props: { title: 'Overview', stats: STATS.map((stat) => ({ ...stat, loading: true })) },
      slots: { primary: [panel('Ticket volume', [VOLUME_LOADING])] },
    },
  ],
})
