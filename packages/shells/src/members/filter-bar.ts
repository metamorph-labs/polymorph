import { cond, describeMember, el, flag, fx, identity, js, lit, member, slot, text } from '../dsl'

const noop = js('() => {}')

const STATUS = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'solved', label: 'Solved' },
]

const PRIORITY = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
]

const SEARCH = [fx('SearchInput', { size: 'sm', shortcut: '⌘K', 'aria-label': 'Search tickets' })]

const select = (options: typeof STATUS, emptyOption: string, label: string, more = {}) =>
  fx('Select', { size: 'sm', options, emptyOption, 'aria-label': label, ...more })

/**
 * FilterBar (`design/components/filter-bar.md`): search and filters over an
 * Inline, with a clear button that exists exactly while something is
 * filtered, and a politely announced result count.
 */
export default describeMember({
  member: 'FilterBar',
  dir: 'structure',
  recipe: 'structure/filter-bar',
  types: {
    // `total` is omitted when unknown: a cursor-paged list holds one window.
    FilterResultCount: '{ shown: number; total?: number }',
    // All keys or none, so one row never mixes two languages.
    FilterBarMessages: '{ clear: string; resultCount: (count: FilterResultCount) => string }',
  },
  defaults: {
    messages:
      "() => ({ clear: 'Clear filters', resultCount: ({ shown, total }: FilterResultCount) => total === undefined ? `${shown} results` : `${shown} of ${total} results` })",
  },
  // The spec's `agent` fence. The clear Button is the bar's own part, so it is withheld and
  // `clear` stands in its place. The search and the filters are the application's members.
  agent: {
    on: 'root',
    state: {
      filtered: 'isFiltered',
      'result-count': "resultCount === undefined ? '' : messages.resultCount(resultCount)",
    },
    actions: {
      clear: `(() => {
        if (!isFiltered) throw new Error('Nothing is filtered, so there is nothing to clear.')
        emit('clear')
      })()`,
    },
    withholds: 'clearRegion',
  },
  template: el(
    'div',
    {
      ref: 'root',
      class: ['bar'],
      attrs: { 'data-filtered': flag('isFiltered'), ...identity('FilterBar') },
    },
    [
      member(
        'Inline',
        { gap: '3', align: lit('center'), wrap: 'true' },
        {
          slots: {
            default: [
              slot('search'),
              slot(),
              // Only while there is something to clear; a permanent one would say filters are set.
              cond('isFiltered', [
                // Wrapped, so the entrance animation targets this button and no Select trigger.
                el('span', { part: 'clear', class: ['clear'], ref: 'clearRegion' }, [
                  member(
                    'Button',
                    {
                      variant: lit('ghost'),
                      tone: lit('neutral'),
                      size: lit('sm'),
                      icon: lit('clear'),
                      label: 'messages.clear',
                    },
                    { on: { click: { emit: 'clear' } } },
                  ),
                ]),
              ]),
              cond('resultCount !== undefined', [
                // Polite: the region holds only the count, which changes only with the numbers.
                el(
                  'span',
                  { part: 'count', class: ['count'], attrs: { 'aria-live': lit('polite') } },
                  [text('messages.resultCount(resultCount)')],
                ),
              ]),
            ],
          },
        },
      ),
    ],
  ),
  states: [
    {
      name: 'nothing set — no offer to clear what nobody filtered',
      props: { isFiltered: false, onClear: noop },
      slots: { search: SEARCH, default: [select(STATUS, 'Any status', 'Status')] },
      expect: { 'data-filtered': null },
    },
    {
      name: 'filtered — the clear affordance arrives',
      props: { isFiltered: true, onClear: noop },
      slots: {
        search: SEARCH,
        default: [select(STATUS, 'Any status', 'Status', { defaultValue: 'open' })],
      },
      expect: { 'data-filtered': '' },
    },
    {
      name: 'with a count, which is what a reader hears when it changes',
      props: { isFiltered: true, onClear: noop, resultCount: { shown: 4, total: 27 } },
      slots: {
        search: SEARCH,
        default: [
          select(STATUS, 'Any status', 'Status'),
          select(PRIORITY, 'Any priority', 'Priority'),
        ],
      },
    },
    {
      name: 'search alone',
      props: { isFiltered: false, onClear: noop },
      slots: { search: SEARCH },
    },
    {
      name: 'enough controls to wrap',
      props: { isFiltered: true, onClear: noop, resultCount: { shown: 4, total: 27 } },
      slots: {
        search: SEARCH,
        default: [
          select(STATUS, 'Any status', 'Status'),
          select(PRIORITY, 'Any priority', 'Priority'),
          select(STATUS, 'Any assignee', 'Assignee'),
          select(PRIORITY, 'Any channel', 'Channel'),
        ],
      },
    },
  ],
})
