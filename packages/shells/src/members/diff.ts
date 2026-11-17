import {
  cond,
  describeMember,
  each,
  el,
  fx,
  identity,
  js,
  lit,
  member,
  run,
  text,
  type FixtureChild,
  type Node,
} from '../dsl'

const CONFIGURATION = {
  workspace: 'relay-eu',
  region: 'eu-west-1',
  retention: { days: 30, archive: true, tiers: ['hot', 'warm'] },
  sync: { interval: 300, batch: 500, retries: 5, backoff: 'exponential' },
  notifications: { email: true, digest: 'daily', channels: ['#support', '#on-call'] },
  limits: { seats: 25, projects: 100, storageGb: 500 },
  features: { audit: true, sso: false, exports: true },
}

/** A governed payload as an app passes it: formatted text, one key per line. */
const CONFIGURATION_BEFORE = JSON.stringify(CONFIGURATION, null, 2)
const CONFIGURATION_AFTER = JSON.stringify(
  { ...CONFIGURATION, sync: { ...CONFIGURATION.sync, retries: 8 } },
  null,
  2,
)

/** A list of ids is compared with one id on each line. */
const GRANTS_BEFORE = ['tickets.read', 'tickets.write', 'billing.read', 'reports.export'].join('\n')
const GRANTS_AFTER = [
  'tickets.read',
  'tickets.write',
  'payments.refund',
  'reports.export',
  'members.manage',
].join('\n')

const BODY_BEFORE = ['Hi Ada,', 'Your export is ready.', 'Thanks'].join('\n')
const BODY_AFTER = [
  'Hello Ada,',
  'Your export failed and will run again tonight.',
  'Thank you for your patience',
].join('\n')

/** Lines with no break in them: a callback URL and its signing key. */
const ENDPOINT_BEFORE = [
  'callback=https://hooks.example.org/v1/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge',
  'signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
].join('\n')
const ENDPOINT_AFTER = [
  'callback=https://hooks.example.org/v2/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge',
  'signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
].join('\n')

/** A table cell, and a row of the fixture's table: a ticket and what changed in its status. */
const cell = (children: readonly FixtureChild[]): FixtureChild =>
  fx('TableCell', {}, { default: children })
const ticket = (id: string, before: string, after: string): FixtureChild =>
  fx('TableRow', {}, { default: [cell([id]), cell([fx('Diff', { before, after })])] })

/** The hidden word a screen reader hears before a value or a line, with the space after it. */
const spoken = (word: string): Node => el('span', { class: ['spoken'] }, [text(`${word} + ' '`)])

const MISSING_LABEL = "display === 'lines' && label === undefined"

/** A row's key: its kind and its line, which no other row of the diff shares. */
const ROW_KEY =
  "row.kind === 'removed' ? `r${row.beforeLine}` : `${row.kind === 'added' ? 'a' : 's'}${row.afterLine}`"

/** One line of the lines form: its marker, the word a screen reader hears, and its text. */
const row: Node = el(
  'li',
  {
    part: 'row',
    class: ['row'],
    attrs: { 'data-kind': "row.kind === 'same' ? undefined : row.kind" },
  },
  [
    // `+` and `−` are drawn for the eye. The hidden word says the same to a screen reader.
    el('span', { part: 'marker', class: ['marker'], attrs: { 'aria-hidden': lit('true') } }, [
      text("row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ''"),
    ]),
    cond("row.kind !== 'same'", [
      spoken("(row.kind === 'added' ? messages.added : messages.removed)"),
    ]),
    el('span', { part: 'text', class: ['text'] }, [text('row.text')]),
  ],
)

/** The id of a collapsed run's lines, which its Button names while they show. */
const RUN_ID = '`${uid}-run-${piece.key}`'
const RUN_OPEN = 'opened.includes(piece.key)'

/**
 * A collapsed run: one row whose Button says how many unchanged lines it
 * holds, and the lines under it once it is pressed. The Button stays where it
 * is when the lines appear, so focus stays on it.
 */
const collapsed: Node = el('li', { part: 'run', class: ['run'] }, [
  el('div', { class: ['fold'] }, [
    member(
      'Button',
      {
        variant: lit('ghost'),
        tone: lit('neutral'),
        size: lit('sm'),
        icon: `${RUN_OPEN} ? 'collapse' : 'expand'`,
        label: 'messages.unchanged(piece.rows.length)',
        expanded: RUN_OPEN,
        'aria-controls': `${RUN_OPEN} ? ${RUN_ID} : undefined`,
      },
      {
        on: {
          click: run(
            `opened = ${RUN_OPEN} ? opened.filter((key) => key !== piece.key) : [...opened, piece.key]`,
          ),
        },
      },
    ),
  ]),
  cond(RUN_OPEN, [
    el('ol', { part: 'lines', class: ['rows'], attrs: { id: RUN_ID, role: lit('list') } }, [
      each('piece.rows', 'row', ROW_KEY, [row]),
    ]),
  ]),
])

/**
 * The lines form: a named region holding one list of rows. A list, not a
 * table: a row is one statement, "added" and the line, and a list reads it in
 * one stop and says how many rows there are. The role is written out because
 * a list without markers loses it in WebKit.
 */
const lines: Node = el(
  'section',
  { class: ['lines'], attrs: { 'aria-label': 'label', ...identity('Diff') } },
  [
    el('ol', { part: 'rows', class: ['rows'], attrs: { role: lit('list') } }, [
      each('runs', 'piece', 'piece.key', [
        cond('piece.collapsed', [collapsed], [each('piece.rows', 'row', ROW_KEY, [row])]),
      ]),
    ]),
  ],
)

/** The inline form's root: phrasing content, so it sits in a paragraph, a title or a cell. */
const inline = (children: readonly Node[]): Node =>
  el('span', { class: ['inline'], attrs: { ...identity('Diff') } }, children)

const oldValue: Node = el('del', { part: 'before', class: ['before'] }, [text('old')])
const newValue: Node = el('ins', { part: 'after', class: ['after'] }, [text('next')])

/**
 * Diff (`design/components/diff.md`): a value that changed, shown as what it
 * was and what it is. The inline form is a short value in a sentence or a
 * cell: the old value struck through, an arrow, the new value, and hidden
 * words so a screen reader hears "from Draft to Active". The lines form
 * compares two texts line by line through the engine's `diffLines` and
 * `diffRuns`, which the React member renders too, so every framework finds
 * the same changes and collapses the same unchanged lines. Which collapsed
 * runs are open is the member's own state, by each run's place in the diff.
 */
export default describeMember({
  member: 'Diff',
  dir: 'structure',
  recipe: 'structure/diff',
  types: {
    // The words the member writes itself, localized by passing every key or none, so one
    // Diff never mixes two languages. The count is a function, because plural rules belong
    // to the application's catalog.
    DiffMessages: `{
      /** Read before the old value of a value that changed: "from". */
      from: string
      /** Read between the old value and the new one: "to". */
      to: string
      /** Read before a value, or a line, that only the new side has. */
      added: string
      /** Read before a value, or a line, that only the old side has. */
      removed: string
      /** A collapsed run's Button. */
      unchanged: (count: number) => string
    }`,
  },
  defaults: {
    display: lit('inline'),
    context: '3',
    messages:
      "() => ({ from: 'from', to: 'to', added: 'added', removed: 'removed', unchanged: (count: number) => `${count} unchanged ${count === 1 ? 'line' : 'lines'}` })",
  },
  // The collapsed runs the reader has opened, by key.
  state: { opened: '[] as number[]' },
  derived: {
    // An empty value draws nothing a reader can see, so it reads as a missing one.
    old: "before ?? ''",
    next: "after ?? ''",
    runs: "display === 'lines' ? diffRuns(diffLines(old, next), context) : []",
  },
  effects: [
    {
      watch: MISSING_LABEL,
      run: `devWarning(${MISSING_LABEL}, 'Diff: the \`lines\` form is a region, and a region needs a name; pass \`label\`.')`,
    },
  ],
  // Neither side has a value, so there is nothing to show and nothing changed.
  template: cond("old !== '' || next !== ''", [
    cond(
      "display === 'lines'",
      [lines],
      'old === next',
      [inline([text('next')])],
      "old === ''",
      [
        // Nothing else marks an addition for the eye: the new value is not struck or coloured.
        inline([
          spoken('messages.added'),
          el('span', { part: 'sign', class: ['sign'], attrs: { 'aria-hidden': lit('true') } }, [
            text(lit('+')),
          ]),
          newValue,
        ]),
      ],
      "next === ''",
      [inline([spoken('messages.removed'), oldValue])],
      [
        // The arrow is for the eye, and the two hidden words say what it means.
        inline([
          spoken('messages.from'),
          oldValue,
          el('span', { part: 'arrow', class: ['arrow'], attrs: { 'aria-hidden': lit('true') } }, [
            text(lit('→')),
          ]),
          el('span', { class: ['spoken'] }, [text("' ' + messages.to + ' '")]),
          newValue,
        ]),
      ],
    ),
  ]),
  states: [
    {
      name: 'a changed value — the old one struck through, then the new one',
      props: { before: 'Draft', after: 'Active' },
    },
    { name: 'an addition — only a new value', props: { after: 'Ada Okonkwo' } },
    { name: 'a removal — only an old value', props: { before: 'Ada Okonkwo', after: null } },
    { name: 'no change — the value as plain text', props: { before: 'Active', after: 'Active' } },
    {
      name: 'in a sentence — the font and size of the text around it',
      many: {
        within: { member: 'Text' },
        each: [],
        also: [
          'The owner changed: ',
          fx('Diff', { before: 'Ada Okonkwo', after: 'Grace Hopper' }),
          '.',
        ],
      },
    },
    {
      name: 'in an Alert — on the tone’s wash',
      many: {
        within: { member: 'Alert', props: { tone: 'warning', title: 'The project was renamed' } },
        each: [],
        also: ['Name: ', fx('Diff', { before: 'apollo', after: 'apollo-eu' })],
      },
    },
    {
      name: 'in a Table cell',
      many: {
        within: { member: 'Table', props: { label: 'Ticket changes' } },
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
                      fx('TableHeader', {}, { default: ['Status'] }),
                    ],
                  },
                ),
              ],
            },
          ),
          fx(
            'TableBody',
            {},
            { default: [ticket('T-1041', 'Waiting', 'Closed'), ticket('T-1039', 'Open', 'Open')] },
          ),
        ],
      },
    },
    {
      name: 'lines — one change in a long text, the unchanged runs collapsed',
      props: {
        display: 'lines',
        label: 'Workspace configuration',
        before: CONFIGURATION_BEFORE,
        after: CONFIGURATION_AFTER,
      },
      expect: { 'aria-label': 'Workspace configuration' },
    },
    {
      name: 'lines — a list of ids, one on each line',
      props: {
        display: 'lines',
        label: 'Granted operations',
        before: GRANTS_BEFORE,
        after: GRANTS_AFTER,
      },
    },
    {
      name: 'lines — every line changed',
      props: { display: 'lines', label: 'Message body', before: BODY_BEFORE, after: BODY_AFTER },
    },
    {
      name: 'lines — every line kept, with an infinite context',
      props: {
        display: 'lines',
        label: 'Workspace configuration',
        before: CONFIGURATION_BEFORE,
        after: CONFIGURATION_AFTER,
        context: js('Infinity'),
      },
    },
    {
      name: 'lines — a new text, every line added',
      props: { display: 'lines', label: 'Granted operations', after: GRANTS_AFTER },
    },
    {
      name: 'lines — long lines wrap in a narrow box',
      many: {
        within: { element: 'div', class: ['harnessNarrow'] },
        each: [
          {
            props: {
              display: 'lines',
              label: 'Webhook endpoint',
              before: ENDPOINT_BEFORE,
              after: ENDPOINT_AFTER,
            },
          },
        ],
      },
    },
  ],
})
