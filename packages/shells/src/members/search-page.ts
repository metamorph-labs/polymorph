import {
  cond,
  describeMember,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  node,
  render,
  run,
  slot,
  type FixtureChild,
  type Node,
} from '../dsl'

const noop = js('() => {}')

const TICKETS = [
  {
    title: 'Webhook retries stop after the first 5xx',
    description: 'T-1019 · Northwind · open',
    meta: '2h',
    href: '#t-1019',
  },
  {
    title: 'Webhook signature fails after rotating the secret',
    description: 'T-0987 · Contoso · waiting on the customer',
    meta: '3d',
    href: '#t-0987',
  },
  {
    title: 'Duplicate webhook deliveries during the outage',
    description: 'T-0952 · Fabrikam · solved',
    meta: '2w',
    href: '#t-0952',
  },
]

const ARTICLES = [
  {
    title: 'Retrying failed webhook deliveries',
    description: 'Help centre · updated last month',
    href: '#a-retries',
  },
  {
    title: 'Verifying webhook signatures',
    description: 'Help centre · updated in March',
    href: '#a-signatures',
  },
]

const options = (...labels: string[]) =>
  labels.map((label) => ({ value: label.toLowerCase(), label }))

const select = (label: string, emptyOption: string, choices: string[], more = {}) =>
  fx('Select', {
    size: 'sm',
    'aria-label': label,
    emptyOption,
    options: options(...choices),
    ...more,
  })

/** Four `sm` Selects, the filter row the page's measure is set against. */
const SELECTS = [
  select('Kind', 'Any kind', ['Tickets', 'Articles']),
  select('Status', 'Any status', ['Open', 'Waiting', 'Solved']),
  select('Assignee', 'Anyone', ['Me', 'My team', 'Unassigned']),
  select('Updated', 'Any time', ['Today', 'This week', 'This month']),
]

const FIELD = [
  fx('SearchInput', {
    'aria-label': 'Search the workspace',
    placeholder: 'Search tickets and articles…',
    defaultValue: 'webhook',
  }),
]

/** A FormField whose Input submits from its trailing Button, `loading` while a search runs. */
const submitted = (loading = false): FixtureChild[] => [
  fx(
    'FormField',
    { label: 'Search the workspace' },
    {
      default: [
        fx(
          'Input',
          { name: 'q', defaultValue: 'webhook' },
          {
            trailing: [
              fx('Button', {
                type: 'submit',
                variant: 'ghost',
                tone: 'neutral',
                size: 'sm',
                icon: 'search',
                label: 'Search',
                loading,
              }),
            ],
          },
        ),
      ],
    },
  ),
]

const NOTHING = {
  icon: 'search',
  title: 'Nothing matches that search',
  description: 'Check the spelling, or search with fewer filters.',
  secondaryAction: node(
    fx('Button', { variant: 'ghost', tone: 'neutral', label: 'Clear filters' }),
  ),
}

const TICKET_LIST = fx(
  'List',
  { label: 'Tickets' },
  { default: TICKETS.map((ticket) => fx('ListItem', ticket)) },
)

/** Two groups of results, each a Heading over a List; the tickets load further windows. */
const GROUPS: FixtureChild[] = [
  fx(
    'Stack',
    { gap: 3 },
    {
      default: [
        fx('Heading', {}, { default: ['Tickets'] }),
        TICKET_LIST,
        fx('CursorPagination', {
          mode: 'append',
          label: 'Tickets',
          hasPrevious: false,
          hasNext: true,
          onNext: noop,
        }),
      ],
    },
  ),
  fx(
    'Stack',
    { gap: 3 },
    {
      default: [
        fx('Heading', {}, { default: ['Articles'] }),
        fx(
          'List',
          { label: 'Articles' },
          { default: ARTICLES.map((article) => fx('ListItem', article)) },
        ),
      ],
    },
  ),
]

/** The field, then the filter row when there is one. The landmark is the same either way. */
const query: Node[] = [
  slot('search'),
  cond('slots.filters', [
    member('Inline', { gap: '3', wrap: 'true' }, { slots: { default: [slot('filters')] } }),
  ]),
]

const landmark = {
  role: lit('search'),
  'aria-label': 'searchLabel',
  'data-search-page-part': lit('search'),
}

/**
 * SearchPage (`design/archetypes/search-page.md`): the page for a query and
 * its results. The field and its filters are a `search` landmark named
 * `searchLabel`, which is a real `<form>` while the caller handles `submit`,
 * so Enter submits once and the browser stays on the page. The results region
 * is `aria-busy` while `pending`, and holds the EmptyState drawn from
 * `emptyState` while `empty`. The swap moves no focus and plays no motion.
 */
export default describeMember({
  member: 'SearchPage',
  dir: 'archetypes',
  recipe: 'archetypes/search-page',
  uses: ['EmptyStateProps'],
  defaults: { empty: 'false', pending: 'false' },
  derived: {
    // The page owns the submit, so the browser never navigates.
    submit: "(event: Event) => { event.preventDefault(); emit('submit') }",
  },
  template: el(
    'div',
    {
      class: ['page'],
      attrs: {
        'data-empty': flag('empty'),
        'data-pending': flag('pending'),
        ...identity('SearchPage'),
      },
    },
    [
      member(
        'PageHeader',
        { title: 'title', description: 'description' },
        { slots: { actions: [slot('actions')] }, slotWhen: { actions: 'slots.actions' } },
      ),
      cond(
        'listening.submit',
        [
          el(
            'form',
            {
              part: 'search',
              class: ['search'],
              attrs: { ...landmark, novalidate: 'true' },
              on: { submit: run('submit($event)') },
            },
            query,
          ),
        ],
        [el('div', { part: 'search', class: ['search'], attrs: landmark }, query)],
      ),
      el(
        'div',
        {
          part: 'results',
          class: ['results'],
          attrs: {
            'aria-busy': 'pending ? true : undefined',
            'data-search-page-part': lit('results'),
          },
        },
        [
          cond(
            'empty',
            [
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
            ],
            [slot()],
          ),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'before a query — the field and the filters, nothing below them',
      props: {
        title: 'Search',
        description: 'Find tickets and help articles across the workspace.',
        searchLabel: 'Workspace',
        emptyState: NOTHING,
      },
      slots: {
        search: [
          fx('SearchInput', {
            'aria-label': 'Search the workspace',
            placeholder: 'Search tickets and articles…',
          }),
        ],
        filters: SELECTS,
      },
    },
    {
      name: 'results in groups — a heading over each kind',
      props: { title: 'Search', searchLabel: 'Workspace', emptyState: NOTHING },
      slots: { search: FIELD, filters: SELECTS, default: GROUPS },
    },
    {
      name: 'one list of results — the filter row counts them',
      props: { title: 'Search', searchLabel: 'Workspace', emptyState: NOTHING },
      slots: {
        search: FIELD,
        filters: [
          fx(
            'FilterBar',
            { isFiltered: true, onClear: noop, resultCount: { shown: 3 } },
            {
              default: [
                select('Kind', 'Any kind', ['Tickets', 'Articles'], { defaultValue: 'tickets' }),
              ],
            },
          ),
        ],
        default: [TICKET_LIST],
      },
    },
    {
      name: 'nothing found — the way out is a secondary action',
      props: { empty: true, title: 'Search', searchLabel: 'Workspace', emptyState: NOTHING },
      slots: { search: FIELD, filters: SELECTS, default: GROUPS },
      expect: { 'data-empty': '' },
    },
    {
      name: 'searching — the last results stay, marked busy',
      props: {
        pending: true,
        title: 'Search',
        searchLabel: 'Workspace',
        onSubmit: noop,
        emptyState: NOTHING,
      },
      slots: { search: submitted(true), default: GROUPS },
      expect: { 'data-pending': '' },
    },
    {
      name: 'submitted with a button — Enter and the Button submit the form',
      props: { title: 'Search', searchLabel: 'Workspace', onSubmit: noop, emptyState: NOTHING },
      slots: { search: submitted(), filters: SELECTS, default: GROUPS },
    },
  ],
})
