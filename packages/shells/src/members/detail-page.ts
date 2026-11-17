import { cond, describeMember, el, flag, fx, identity, js, lit, member, slot, text } from '../dsl'

const noop = js('() => {}')

const META = [
  fx('Badge', { tone: 'info' }, { default: ['Open'] }),
  fx('Badge', { variant: 'outline', tone: 'danger' }, { default: ['Urgent'] }),
  fx('Avatar', { name: 'Ada Lovelace', size: 'sm' }),
  { element: 'span', children: ['Ada Lovelace'] },
  { element: 'span', children: ['opened 4 minutes ago'] },
]

const TABS = [
  { value: 'conversation', label: 'Conversation' },
  { value: 'events', label: 'Events', count: 12 },
]

/** The aside's cards, a Stat in each. */
const ASIDE = [
  fx(
    'Card',
    {},
    {
      default: [
        fx('Stat', {
          label: 'First response',
          value: '14m',
          delta: { value: '3m', direction: 'down', positive: true },
        }),
      ],
    },
  ),
  fx('Card', {}, { default: [fx('Stat', { label: 'Replies', value: '6' })] }),
]

/** The page's `<h1>`, in both forms of the header. */
const heading = el('h1', { part: 'title', class: ['title'] }, [text('title')])

const body = (words: string) => [fx('Card', {}, { default: [{ element: 'p', children: [words] }] })]

/**
 * The long body of the entry whose aside stays in view: a runbook's sections,
 * each a Heading whose id a TableOfContents item names and two paragraphs.
 * The ids carry the member's name, because a gallery shows every entry on one
 * page.
 */
const RUNBOOK: { id: string; label: string; text: [string, string] }[] = [
  {
    id: 'detail-before',
    label: 'Before you start',
    text: [
      'Rotating the signing keys signs every new token with the new key. Tokens signed with the old key stay valid until they expire, which takes at most one hour.',
      'Book a quiet hour and tell the support team, because a client that caches keys for longer than an hour fails its first request after the rotation.',
    ],
  },
  {
    id: 'detail-generate',
    label: 'Generate the new key',
    text: [
      'Generate the key on the release machine, never on a laptop. The command writes the private half to the vault and prints the public half and its key id.',
      'Check that the printed key id is new. A key id that is already listed means the vault returned an old key, and the rotation stops there.',
    ],
  },
  {
    id: 'detail-publish',
    label: 'Publish the public key',
    text: [
      'Add the public half to the published key set beside the old one. Both keys stay in the set until the old one has signed its last token.',
      'Wait until every region serves the new set. A region that serves the old set rejects tokens signed with the new key.',
    ],
  },
  {
    id: 'detail-switch',
    label: 'Switch the signer',
    text: [
      'Point the signer at the new key id and restart it in one region first. Watch that region for ten minutes before the others.',
      'A rise in rejected tokens means a client reads a cached key set. Point the signer back at the old key id and the rejections stop.',
    ],
  },
  {
    id: 'detail-retire',
    label: 'Retire the old key',
    text: [
      'After an hour no valid token carries the old key id. Remove the old public half from the key set, then delete its private half from the vault.',
      'Record the rotation in the audit log with both key ids and the time of each step.',
    ],
  },
  {
    id: 'detail-undo',
    label: 'Undo a rotation',
    text: [
      'Until the old private half is deleted, a rotation is undone by pointing the signer back at the old key id. After that, a new rotation is the only way back.',
      'Tokens signed with the new key stay valid until they expire, so an undo needs no second outage.',
    ],
  },
]

/**
 * DetailPage (`design/archetypes/detail-page.md`): the full view of one
 * entity. The way back is required and comes before the `<h1>`, so it is the
 * first thing after the skip target. The aside is a column that scrolls with
 * the page, or stays in view beside the main column with `stickyAside`; the
 * body is skipped when the tabs are the body and there is no aside, because
 * an empty grid row still adds a gutter.
 */
export default describeMember({
  member: 'DetailPage',
  dir: 'archetypes',
  recipe: 'archetypes/detail-page',
  defaults: { stickyAside: 'false' },
  template: el('div', { class: ['page'], attrs: { ...identity('DetailPage') } }, [
    el('div', { part: 'back', class: ['back'] }, [
      member(
        'Button',
        {
          variant: lit('ghost'),
          tone: lit('neutral'),
          size: lit('sm'),
          icon: lit('back'),
          label: 'backLabel',
        },
        { on: { click: { emit: 'back' } } },
      ),
    ]),
    el('div', { part: 'header', class: ['header'] }, [
      el('div', { part: 'identity', class: ['identity'] }, [
        cond(
          'slots.titleEdit',
          [
            // PageHeader's title row (`page-header.md`): the InlineEdit is beside the `<h1>` and
            // never inside it, and the page hands it `valueHidden`, because the `<h1>` draws it.
            el('div', { part: 'titleRow', class: ['titleRow'] }, [
              heading,
              el('div', { part: 'titleEdit', class: ['titleEdit'] }, [
                slot('titleEdit', { pass: { valueHidden: 'true' } }),
              ]),
            ]),
          ],
          [heading],
        ),
        cond('slots.meta', [el('div', { part: 'meta', class: ['meta'] }, [slot('meta')])]),
      ]),
      cond('slots.actions', [
        el('div', { part: 'actions', class: ['actions'] }, [slot('actions')]),
      ]),
    ]),
    slot('tabs'),
    cond('slots.default || slots.aside', [
      el(
        'div',
        {
          part: 'body',
          class: ['body'],
          attrs: {
            'data-aside': flag('slots.aside'),
            'data-sticky-aside': flag('slots.aside && stickyAside'),
          },
        },
        [
          el('div', { part: 'main', class: ['main'] }, [slot()]),
          cond('slots.aside', [el('div', { part: 'aside', class: ['aside'] }, [slot('aside')])]),
        ],
      ),
    ]),
  ]),
  states: [
    {
      // No body, because the tabs are the body.
      name: 'everything — back, meta, actions, tabs and an aside',
      props: {
        backLabel: 'Back to inbox',
        onBack: noop,
        title: 'Webhook retries stop after the first 5xx',
      },
      slots: {
        meta: META,
        actions: [
          fx('Button', { variant: 'outline', tone: 'neutral', label: 'Snooze' }),
          fx('Button', { label: 'Reply' }),
        ],
        tabs: [
          fx(
            'Tabs',
            { tabs: TABS },
            {
              default: [
                fx(
                  'TabsContent',
                  { value: 'conversation' },
                  { default: [{ element: 'p', children: ['The conversation.'] }] },
                ),
                fx(
                  'TabsContent',
                  { value: 'events' },
                  { default: [{ element: 'p', children: ['The audit trail.'] }] },
                ),
              ],
            },
          ),
        ],
        aside: ASIDE,
      },
    },
    {
      name: 'no tabs — one body',
      props: { backLabel: 'Back to customers', onBack: noop, title: 'Northwind Traders' },
      slots: { meta: META, aside: ASIDE, default: body('The account.') },
    },
    {
      name: 'no aside — the body takes the width',
      props: {
        backLabel: 'Back to inbox',
        onBack: noop,
        title: 'SSO login loops back to the sign-in page',
      },
      slots: {
        meta: META,
        actions: [fx('Button', { label: 'Reply' })],
        default: body('The conversation.'),
      },
    },
    {
      name: 'minimal — a way back, a name and a body',
      props: { backLabel: 'Back', onBack: noop, title: 'T-2041' },
      slots: { default: body('The conversation.') },
    },
    {
      name: 'an aside that stays in view — a table of contents beside a long body',
      props: {
        backLabel: 'Back to runbooks',
        onBack: noop,
        title: 'Rotate the signing keys',
        stickyAside: true,
      },
      slots: {
        aside: [
          fx('Card', {}, { default: [fx('Stat', { label: 'Last rotated', value: '41 days' })] }),
          fx('TableOfContents', {
            label: 'On this page',
            items: RUNBOOK.map(({ id, label }) => ({ id, label })),
          }),
        ],
        default: [
          fx(
            'Stack',
            { gap: 6 },
            {
              default: RUNBOOK.map((section) =>
                fx(
                  'Stack',
                  { gap: 3 },
                  {
                    default: [
                      fx('Heading', { id: section.id }, { default: [section.label] }),
                      ...section.text.map((words) => fx('Text', {}, { default: [words] })),
                    ],
                  },
                ),
              ),
            },
          ),
        ],
      },
    },
    {
      name: 'a name edited in place — the edit control beside the h1, the meta under it',
      props: { backLabel: 'Back to applications', onBack: noop, title: 'Billing service' },
      slots: {
        titleEdit: [
          fx('InlineEdit', {
            label: 'Application name',
            value: 'Billing service',
            size: 'lg',
            required: true,
            maxLength: 80,
            onCommit: noop,
          }),
        ],
        meta: META,
        actions: [fx('Button', { variant: 'outline', tone: 'neutral', label: 'Open definition' })],
        default: body('The environments.'),
      },
    },
  ],
})
