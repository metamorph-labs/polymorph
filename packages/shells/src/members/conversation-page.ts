import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  js,
  lit,
  member,
  run,
  slot,
  type FixtureChild,
  type FixtureInstance,
  type StateEntry,
} from '../dsl'
import { TURNS } from './chat-thread'

/**
 * The page's breakpoint in rem: below it the page is one column. A breakpoint
 * is geometry, not theme (`docs/layout.md`), and the page measures itself
 * because the member must know which arrangement to render, which a container
 * query cannot tell it.
 */
const ONE_COLUMN_BELOW_REM = 48

/** The two panes' content floors in px (`split-pane.md`). */
const THREAD_MIN_PX = 320
const ASIDE_MIN_PX = 280

const noop = js('() => {}')

/** The thread above the composer: the thread takes the room, the composer what it needs. */
const conversation = el('div', { part: 'conversation', class: ['conversation'] }, [
  el('div', { part: 'thread', class: ['thread'] }, [slot('thread')]),
  el('div', { part: 'composer', class: ['composer'] }, [slot('composer')]),
])

/** Whether the aside is behind the Drawer. */
const DRAWER = 'slots.aside && narrow'

const composer = [
  fx('PromptInput', { label: 'Message', placeholder: 'Ask Pilot anything…', onSubmit: noop }),
]

const CODE = `export async function deliver(event: WebhookEvent) {
  return retry(() => post(event), { attempts: 5, idempotencyKey: event.id })
}`

const ASIDE: FixtureChild[] = [
  fx(
    'ArtifactPane',
    { title: 'deliver.ts', kind: 'code', meta: 'TypeScript · 3 lines', onClose: noop },
    { default: [fx('CodeBlock', {}, { default: [CODE] })] },
  ),
]

/** The page fills a region, so each entry renders inside the recipe's fixed-height harness. */
const boxed = (instance: FixtureInstance): StateEntry['many'] => ({
  within: { element: 'div', class: ['harness'] },
  each: [instance],
})

/**
 * ConversationPage (`design/archetypes/conversation-page.md`): the thread
 * above the composer, filling the region it is given, with the aside beside
 * the thread when there is room and behind a Drawer when there is not.
 *
 * The page's own width decides the arrangement, not the window's: above
 * `48rem` the aside is SplitPane's end pane, and below it the aside sits in a
 * Drawer opened from an outline Button that joins the header's actions. The
 * width is measured on mount and on every resize of the page. The drawer's
 * open state belongs to the narrow arrangement, so widening closes it, and
 * narrowing again does not show it open when nobody pressed anything.
 *
 * React pairs `aside` with `asideLabel` in its props' type, so an aside cannot
 * go unnamed there. A slot and a prop cannot be paired in a type, so an aside
 * without its name is a development warning here.
 */
export default describeMember({
  member: 'ConversationPage',
  dir: 'archetypes',
  recipe: 'archetypes/conversation-page',
  state: { narrow: 'false', asideOpen: 'false' },
  derived: {
    measure: `() => { if (root === null) return; const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; const below = root.getBoundingClientRect().width < ${ONE_COLUMN_BELOW_REM} * rem; narrow = below; if (!below) asideOpen = false }`,
  },
  effects: [
    { run: 'measure()', resize: ['root'] },
    {
      run: "devWarning(Boolean(slots.aside) && asideLabel === undefined, 'ConversationPage: an `aside` needs an `asideLabel`, which names the split’s separator, the drawer and its toggle.')",
    },
  ],
  template: el(
    'div',
    {
      part: 'root',
      class: ['page'],
      ref: 'root',
      attrs: {
        'data-aside': "slots.aside ? (narrow ? 'drawer' : 'split') : undefined",
        ...identity('ConversationPage'),
      },
    },
    [
      member(
        'PageHeader',
        { title: 'title', description: 'description' },
        {
          slots: {
            actions: [
              slot('actions'),
              // The aside's toggle below the breakpoint: outline, because the page's solid
              // button is the application's own action.
              cond(DRAWER, [
                member(
                  'Button',
                  {
                    variant: lit('outline'),
                    tone: lit('neutral'),
                    size: lit('sm'),
                    icon: lit('artifact'),
                    label: "asideLabel ?? ''",
                  },
                  { on: { click: run('asideOpen = true') } },
                ),
              ]),
            ],
          },
          slotWhen: { actions: `slots.actions || (${DRAWER})` },
        },
      ),
      el('div', { part: 'body', class: ['body'] }, [
        cond(
          'slots.aside && !narrow',
          [
            member(
              'SplitPane',
              {
                label: "asideLabel ?? ''",
                defaultRatio: '0.58',
                startMin: String(THREAD_MIN_PX),
                endMin: String(ASIDE_MIN_PX),
              },
              {
                slots: {
                  start: [conversation],
                  end: [el('div', { part: 'aside', class: ['aside'] }, [slot('aside')])],
                },
              },
            ),
          ],
          [conversation],
        ),
      ]),
      cond(DRAWER, [
        member(
          'Drawer',
          {
            side: lit('end'),
            size: lit('lg'),
            title: "asideLabel ?? ''",
            open: 'asideOpen',
          },
          {
            on: { openChange: run('asideOpen = $event') },
            slots: {
              default: [
                el('div', { part: 'drawerAside', class: ['drawerAside'] }, [slot('aside')]),
              ],
            },
          },
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'a conversation — the thread over the composer',
      many: boxed({
        props: {
          title: 'Webhook retries',
          description: 'Pilot can read the workspace and cite what it finds.',
        },
        slots: {
          actions: [
            fx('Button', {
              variant: 'outline',
              tone: 'neutral',
              size: 'sm',
              icon: 'add',
              label: 'New chat',
              onClick: noop,
            }),
          ],
          thread: [fx('ChatThread', { label: 'Conversation' }, { default: TURNS })],
          composer,
        },
      }),
    },
    {
      name: 'with an aside — the artifact beside the thread',
      many: boxed({
        props: { title: 'Webhook retries', asideLabel: 'Artifact' },
        slots: {
          thread: [fx('ChatThread', { label: 'Conversation' }, { default: TURNS })],
          composer,
          aside: ASIDE,
        },
      }),
    },
    {
      name: 'empty — the app’s first words in the thread’s room',
      many: boxed({
        props: { title: 'New chat' },
        slots: {
          thread: [
            fx(
              'ChatThread',
              { label: 'Conversation' },
              {
                empty: [
                  fx('EmptyState', {
                    icon: 'model',
                    title: 'Ask Pilot anything',
                    description:
                      'It can read the workspace, run the tools you allow, and cite what it finds.',
                  }),
                ],
              },
            ),
          ],
          composer,
        },
      }),
    },
  ],
})
