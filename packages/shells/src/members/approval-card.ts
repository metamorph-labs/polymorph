import { cond, describeMember, el, fx, identity, js, lit, member, slot, text } from '../dsl'

const noop = js('() => {}')

const MIGRATION = 'Run the migration against the staging database?'

/** The command, in a CodeBlock, as React's fixture shows it. */
const command = (line: string) => [fx('CodeBlock', {}, { default: [line] })]

/**
 * ApprovalCard (`design/components/approval-card.md`): an in-thread request
 * to allow an agent action. Undecided, it asks with two buttons; once the app
 * records `decision`, the outcome replaces them, so the thread keeps the
 * record. The app owns the decision: the card reports and renders.
 */
export default describeMember({
  member: 'ApprovalCard',
  dir: 'ai',
  recipe: 'ai/approval-card',
  types: {
    ApprovalDecision: "NonNullable<ApprovalCardProps['decision']>",
    ApprovalTone: "NonNullable<ApprovalCardProps['tone']>",
  },
  defaults: {
    tone: lit('warning'),
    approveLabel: lit('Allow'),
    denyLabel: lit('Deny'),
    messages: "() => ({ approved: 'Allowed', denied: 'Denied' })",
  },
  derived: { titleId: '`${uid}-title`' },
  // The spec's `agent` fence. An agent reads what is asked and whether it is decided or being
  // sent, and runs nothing: a person approves what an agent asks to do, so the card withholds
  // its Buttons and everything else it holds.
  agent: {
    on: 'card',
    state: {
      title: 'title',
      decision: "decision ?? ''",
      pending: "pending ?? ''",
    },
    actions: {},
    withholds: 'card',
  },
  template: el(
    'section',
    {
      class: ['card'],
      // The card names the request and holds what an agent may not reach.
      ref: 'card',
      attrs: {
        'aria-labelledby': 'titleId',
        'data-tone': 'tone',
        'data-decision': 'decision',
        // No `data-state` at rest: it is set only while a decision is in flight.
        'data-state': "pending === undefined ? undefined : 'loading'",
        'aria-busy': "pending === undefined ? undefined : 'true'",
        ...identity('ApprovalCard'),
      },
    },
    [
      el('div', { part: 'head', class: ['head'] }, [
        // Decorative: the title and the tone wash already state the request.
        el('span', { part: 'glyph', class: ['glyph'] }, [
          member('Icon', { name: "tone === 'danger' ? 'error' : 'warning'" }),
        ]),
        el('div', { part: 'copy', class: ['copy'] }, [
          el('p', { part: 'title', class: ['title'], attrs: { id: 'titleId' } }, [text('title')]),
          cond('description !== undefined', [
            el('p', { part: 'description', class: ['description'] }, [text('description')]),
          ]),
        ]),
      ]),
      cond('slots.default', [el('div', { part: 'details', class: ['details'] }, [slot()])]),
      cond(
        'decision === undefined',
        [
          el('div', { part: 'actions', class: ['actions'] }, [
            // The page's one solid button, in the card's tone, so approving the irreversible
            // looks dangerous. Declining never is, so deny is outline.
            member(
              'Button',
              {
                variant: lit('solid'),
                tone: "tone === 'danger' ? 'danger' : 'accent'",
                size: lit('sm'),
                label: 'approveLabel',
                loading: "pending === 'approved'",
                disabled: "pending === 'denied'",
              },
              { on: { click: { emit: 'approve' } } },
            ),
            member(
              'Button',
              {
                variant: lit('outline'),
                tone: lit('neutral'),
                size: lit('sm'),
                label: 'denyLabel',
                loading: "pending === 'denied'",
                disabled: "pending === 'approved'",
              },
              { on: { click: { emit: 'deny' } } },
            ),
          ]),
        ],
        [
          // The outcome as text, with a glyph that matches it.
          el('p', { part: 'outcome', class: ['outcome'] }, [
            el('span', { part: 'outcomeGlyph', class: ['outcomeGlyph'] }, [
              member('Icon', {
                name: "decision === 'approved' ? 'confirm' : 'denied'",
                size: lit('sm'),
              }),
            ]),
            text("decision === 'approved' ? messages.approved : messages.denied"),
          ]),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'asking — the question, the details and two answers',
      props: {
        title: MIGRATION,
        description:
          'The agent wants to apply three pending migrations. It will run them in order and stop at the first failure.',
        onApprove: noop,
        onDeny: noop,
      },
      slots: { default: command('pnpm db:migrate --env staging') },
      expect: { 'data-tone': 'warning', 'data-decision': null, 'data-state': null },
    },
    {
      name: 'danger — something that cannot be undone',
      props: {
        tone: 'danger',
        title: 'Delete the build directory?',
        description: 'This removes dist/ and everything under it.',
        onApprove: noop,
        onDeny: noop,
        approveLabel: 'Delete',
        denyLabel: 'Keep',
      },
      slots: { default: command('rm -rf dist') },
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'pending — the answer is on its way',
      props: { title: MIGRATION, onApprove: noop, onDeny: noop, pending: 'approved' },
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'allowed — the record, the actions gone',
      props: { title: MIGRATION, onApprove: noop, onDeny: noop, decision: 'approved' },
      slots: { default: command('pnpm db:migrate --env staging') },
      expect: { 'data-decision': 'approved' },
    },
    {
      name: 'denied',
      props: {
        tone: 'danger',
        title: 'Delete the build directory?',
        onApprove: noop,
        onDeny: noop,
        decision: 'denied',
      },
      expect: { 'data-decision': 'denied' },
    },
    {
      name: 'title only — the question is the whole card',
      props: { title: 'Open the pull request in the browser?', onApprove: noop, onDeny: noop },
    },
  ],
})
