import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  js,
  lit,
  member,
  render,
  slot,
  type FixtureChild,
  type FixtureInstance,
  type Node,
  type StateEntry,
} from '../dsl'

/**
 * The page's breakpoint in rem: below it the page draws one pane. A breakpoint
 * is geometry, not theme (`docs/layout.md`), and the page measures itself
 * because the member must know which arrangement to render, which a container
 * query cannot tell it.
 */
const ONE_PANE_BELOW_REM = 48

/** The list's share of the split, and the two panes' content floors in px (`split-pane.md`). */
const LIST_RATIO = 0.32
const LIST_MIN_PX = 240
const DETAIL_MIN_PX = 420

/** The hook each part carries, which the engine's focus rule and the law read. */
const part = (name: string) => ({ 'data-master-detail-page-part': lit(name) })

/** What the page draws: the arrangement, and in it whether a detail is given. */
const DRAWN = "narrow ? (selected ? 'detail' : 'list') : selected ? 'split-detail' : 'split'"

/** The list pane: a region named for the list, focusable from a script, hidden while the detail is drawn alone. */
const listPane = (hidden: boolean): Node =>
  el(
    'section',
    {
      part: 'list',
      class: ['list'],
      attrs: {
        'aria-label': 'listLabel',
        tabindex: lit('-1'),
        ...(hidden ? { hidden: 'selected' } : {}),
        ...part('list'),
      },
    },
    [slot('list')],
  )

/** The detail, which scrolls under the way back. */
const detailBody = el('div', { part: 'scroll', class: ['scroll'] }, [slot('detail')])

const noop = js('() => {}')

const TONE = { Open: 'accent', Waiting: 'warning', Closed: 'neutral' } as const

const TICKETS: readonly {
  subject: string
  from: string
  time: string
  status: keyof typeof TONE
}[] = [
  { subject: 'Login loop after password reset', from: 'Ada Okafor', time: '2m', status: 'Open' },
  { subject: 'Invoice shows the wrong currency', from: 'Bao Tran', time: '1h', status: 'Waiting' },
  {
    subject: 'Export finishes but the file is empty',
    from: 'Carmen Ruiz',
    time: '3h',
    status: 'Open',
  },
  { subject: 'Cannot invite a teammate', from: 'Dev Patel', time: '1d', status: 'Closed' },
  {
    subject: 'Webhook retries stop after one failure',
    from: 'Ewa Nowak',
    time: '2d',
    status: 'Open',
  },
  { subject: 'Two-factor codes arrive late', from: 'Femi Adeyemi', time: '4d', status: 'Waiting' },
]

/** Thirty tickets: the six, five times over. */
const MANY = Array.from({ length: 30 }, (_, index) => TICKETS[index % TICKETS.length]!)

const tickets = (items: typeof TICKETS, current: number | null): FixtureChild[] => [
  fx(
    'List',
    { label: 'Tickets' },
    {
      default: items.map((ticket, index) =>
        fx(
          'ListItem',
          {
            title: ticket.subject,
            description: ticket.from,
            meta: ticket.time,
            current: index === current,
            onSelect: noop,
          },
          { trailing: [fx('Badge', { tone: TONE[ticket.status] }, { default: [ticket.status] })] },
        ),
      ),
    },
  ),
]

/** The second ticket's detail: a heading, its meta, its body and its actions. */
const DETAIL: FixtureChild[] = [
  fx(
    'Stack',
    { gap: 4 },
    {
      default: [
        fx('Heading', { level: 2 }, { default: ['Invoice shows the wrong currency'] }),
        fx(
          'Inline',
          { gap: 2, align: 'center' },
          {
            default: [
              fx('Badge', { tone: 'warning' }, { default: ['Waiting'] }),
              fx(
                'Text',
                { size: 'sm', tone: 'secondary' },
                { default: ['Bao Tran · opened an hour ago'] },
              ),
            ],
          },
        ),
        fx(
          'Text',
          {},
          {
            default: [
              'The March invoice for the Lisbon workspace is in US dollars. The workspace bills in euros, and the previous invoices were right.',
            ],
          },
        ),
        fx(
          'Inline',
          { gap: 3 },
          {
            default: [
              fx('Button', { variant: 'soft', icon: 'mail', label: 'Reply', onClick: noop }),
              fx('Button', {
                variant: 'ghost',
                tone: 'neutral',
                label: 'Close ticket',
                onClick: noop,
              }),
            ],
          },
        ),
      ],
    },
  ),
]

const PAGE = {
  title: 'Support',
  description: 'Every ticket customers have opened, newest first.',
  listLabel: 'Tickets',
  emptyState: {
    icon: 'inbox',
    title: 'No ticket selected',
    description: 'Pick a ticket in the list to read it here.',
  },
  backLabel: 'All tickets',
  onBack: noop,
}

/**
 * The page fills a region, so each entry renders inside the recipe's
 * fixed-height harness, and a narrow entry inside the one of a phone's width.
 */
const boxed = (instance: FixtureInstance, phone = false): StateEntry['many'] => ({
  within: { element: 'div', class: [phone ? 'phone' : 'harness'] },
  each: [instance],
})

/**
 * MasterDetailPage (`design/archetypes/master-detail-page.md`): a list of
 * items of one kind beside the detail of the selected one, filling the region
 * it is given.
 *
 * The page's own width decides the arrangement, not the window's: at or above
 * `48rem` the list and the detail are SplitPane's two panes, and below it the
 * page draws one pane, the list while nothing is selected and the detail
 * under the way back while a detail is given. The width is measured on mount
 * and on every resize of the page. The list stays in the document, hidden,
 * while the detail is drawn alone.
 *
 * Focus moves only when the element that held it is no longer drawn: the
 * page records whether the last element to take focus was in its body, and
 * after it draws a change the engine's `masterDetailFocus` moves focus to the
 * way back or to the list. A page that mounts with a detail moves nothing.
 */
export default describeMember({
  member: 'MasterDetailPage',
  dir: 'archetypes',
  recipe: 'archetypes/master-detail-page',
  uses: ['EmptyStateProps'],
  state: { narrow: 'false', held: 'false', selected: 'Boolean(slots.detail)' },
  derived: {
    measure: `() => { if (root === null) return; const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; narrow = root.getBoundingClientRect().width < ${ONE_PANE_BELOW_REM} * rem }`,
  },
  effects: [
    { run: 'measure()', resize: ['root'] },
    // Whether a detail is given, held as state and set after each change of the slot. The
    // template reads the state, because Angular reads a slot from the document, and a page
    // whose template read the slot would not draw again when the caller's detail came or went.
    { watch: 'Boolean(slots.detail)', run: 'selected = Boolean(slots.detail)' },
    // Whether the last element to take focus was inside the body, read after a change.
    { listen: 'focusin', run: 'held = masterDetailHolds(body, $event)' },
    // After the document holds the change: the state above is set by an effect, and an effect
    // that follows it can run before the framework has drawn it.
    {
      watch: DRAWN,
      mount: false,
      run: 'afterRender(() => masterDetailFocus(body, held))',
    },
  ],
  template: el(
    'div',
    {
      part: 'root',
      class: ['page'],
      ref: 'root',
      attrs: {
        'data-layout': "narrow ? 'single' : 'split'",
        'data-pane': "narrow ? (selected ? 'detail' : 'list') : undefined",
        ...identity('MasterDetailPage'),
      },
    },
    [
      member(
        'PageHeader',
        { title: 'title', description: 'description' },
        { slots: { actions: [slot('actions')] }, slotWhen: { actions: 'slots.actions' } },
      ),
      el('div', { part: 'body', class: ['body'], ref: 'body' }, [
        cond(
          'narrow',
          [
            listPane(true),
            cond('selected', [
              el('div', { part: 'detail', class: ['detail'], attrs: part('detail') }, [
                el('div', { part: 'back', class: ['back'], attrs: part('back') }, [
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
                detailBody,
              ]),
            ]),
          ],
          [
            member(
              'SplitPane',
              {
                label: 'listLabel',
                defaultRatio: String(LIST_RATIO),
                startMin: String(LIST_MIN_PX),
                endMin: String(DETAIL_MIN_PX),
              },
              {
                slots: {
                  start: [listPane(false)],
                  end: [
                    el('div', { part: 'detail', class: ['detail'], attrs: part('detail') }, [
                      cond(
                        'selected',
                        [detailBody],
                        [
                          el('div', { part: 'empty', class: ['empty'] }, [
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
                        ],
                      ),
                    ]),
                  ],
                },
              },
            ),
          ],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'an item selected — the list beside its detail',
      many: boxed({
        props: PAGE,
        slots: {
          actions: [fx('Button', { icon: 'add', label: 'New ticket', onClick: noop })],
          list: tickets(TICKETS, 1),
          detail: DETAIL,
        },
      }),
    },
    {
      name: 'nothing selected — the list beside the empty state',
      many: boxed({ props: PAGE, slots: { list: tickets(TICKETS, null) } }),
    },
    {
      name: 'a long list — the list pane scrolls and the detail stays',
      many: boxed({ props: PAGE, slots: { list: tickets(MANY, 1), detail: DETAIL } }),
    },
    {
      name: 'narrow, an item selected — the detail alone under the way back',
      many: boxed({ props: PAGE, slots: { list: tickets(TICKETS, 1), detail: DETAIL } }, true),
    },
    {
      name: 'narrow, nothing selected — the list alone',
      many: boxed({ props: PAGE, slots: { list: tickets(TICKETS, null) } }, true),
    },
  ],
})
