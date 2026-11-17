import { cond, describeMember, each, el, type FixtureChild, fx, identity, lit, text } from '../dsl'

/** The subjects of three tickets that match "invoice". */
const RESULTS = [
  { id: 'T-1041', subject: 'Refund for invoice 2026-118 was sent twice' },
  { id: 'T-1039', subject: 'Invoice address shows the old office' },
  { id: 'T-1032', subject: 'Export of last year’s invoices times out' },
]

/** A table cell, and a row of the fixture's table: a ticket and its subject, marked. */
const cell = (children: readonly FixtureChild[]): FixtureChild =>
  fx('TableCell', {}, { default: children })
const result = (id: string, subject: string): FixtureChild =>
  fx(
    'TableRow',
    {},
    { default: [cell([id]), cell([fx('Highlight', { text: subject, query: 'invoice' })])] },
  )

/**
 * Highlight (`design/components/highlight.md`): the parts of a text that match a
 * search, marked. The engine's `highlightRuns` cuts the text into runs, the same
 * function the React member calls, so every framework marks the same characters.
 */
export default describeMember({
  member: 'Highlight',
  dir: 'structure',
  recipe: 'structure/highlight',
  derived: {
    runs: 'highlightRuns(text, { query, ranges, locale })',
  },
  // An empty text has no runs, and nothing renders.
  template: cond('runs.length > 0', [
    el('span', { class: ['highlight'], attrs: { ...identity('Highlight') } }, [
      each(
        'runs',
        'run',
        'index',
        [
          cond(
            'run.marked',
            [
              // No role, so a mark is not announced at each match: the text is read once.
              el('mark', { class: ['mark'], attrs: { role: lit('presentation') } }, [
                text('run.text'),
              ]),
            ],
            [text('run.text')],
          ),
        ],
        'index',
      ),
    ]),
  ]),
  states: [
    {
      name: 'a query — every occurrence marked, whatever its case',
      props: { text: 'Invoice 2026-118 replaces the draft invoice', query: 'invoice' },
    },
    {
      name: 'several terms',
      props: { text: 'Northwind renewed its 2026 support plan', query: ['north', '2026'] },
    },
    {
      name: 'ranges from a search engine',
      props: {
        text: 'Refunds are running for the March invoices',
        ranges: [
          [0, 7],
          [12, 19],
        ],
      },
    },
    {
      name: 'no match — the text as it is',
      props: { text: 'Billing address updated', query: 'invoice' },
    },
    {
      name: 'case folded in the page’s locale',
      props: { text: 'İSTANBUL OFİSİ', query: 'istanbul', locale: 'tr' },
    },
    {
      name: 'in a sentence — the font and size of the text around it',
      many: {
        within: { member: 'Text', props: { size: 'sm', tone: 'secondary' } },
        each: [],
        also: [
          'Matched in the subject: ',
          fx('Highlight', { text: 'Invoice address shows the old office', query: 'office' }),
        ],
      },
    },
    {
      name: 'in a Table cell',
      many: {
        within: { member: 'Table', props: { label: 'Tickets that match “invoice”' } },
        each: [],
        also: [
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
                      fx('TableHeader', {}, { default: ['Subject'] }),
                    ],
                  },
                ),
              ],
            },
          ),
          fx('TableBody', {}, { default: RESULTS.map((row) => result(row.id, row.subject)) }),
        ],
      },
    },
    {
      name: 'in an Alert — the weight marks it on the same wash',
      many: {
        within: { member: 'Alert', props: { tone: 'warning', title: 'Two tickets match' } },
        each: [],
        also: [
          fx('Highlight', { text: 'Refund for invoice 2026-118 was sent twice', query: 'refund' }),
        ],
      },
    },
  ],
})
