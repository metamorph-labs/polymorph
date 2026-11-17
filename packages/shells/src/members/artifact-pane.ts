import {
  cond,
  describeMember,
  el,
  fx,
  identity,
  js,
  lit,
  member,
  node,
  render,
  run,
  slot,
  text,
  when,
  type FixtureChild,
  type FixtureValue,
} from '../dsl'

const noop = js('() => {}')

const CODE = `export async function deliver(event: WebhookEvent) {
  return retry(() => post(event), {
    attempts: 5,
    firstDelayMs: 2_000,
    idempotencyKey: event.id,
  })
}
`

/** React's fixture document, in Markdown (`markdown.states`). */
const STRUCTURE =
  '## What changed\n\n1. Retries now carry the original idempotency key.\n2. The backoff cap moved from three attempts to five.\n   - The first retry still fires after two seconds.\n   - Each later one doubles the wait.\n3. A `429` from the receiver is retried; a `410` is not.\n\n### Why it matters\n\nA duplicate delivery is refused rather than applied twice, which is what the ~~old~~ previous behaviour could not promise.'

/** The rendered reading of `STRUCTURE`. */
const PREVIEW = fx('Markdown', {}, { default: [STRUCTURE] })

const ACTIONS = [
  fx('Button', {
    variant: 'ghost',
    tone: 'neutral',
    size: 'sm',
    iconOnly: true,
    icon: 'copy',
    label: 'Copy',
    onClick: noop,
  }),
  fx('Button', {
    variant: 'ghost',
    tone: 'neutral',
    size: 'sm',
    iconOnly: true,
    icon: 'download',
    label: 'Download',
    onClick: noop,
  }),
]

const code = (source: string) => fx('CodeBlock', {}, { default: [source] })

/** Every entry fills a fixed-height box, as the pane fills its own. */
const boxed = (
  props: Readonly<Record<string, FixtureValue>>,
  slots: Readonly<Record<string, readonly FixtureChild[]>> = {},
) => ({
  many: { within: { element: 'div', class: ['harness'] }, each: [{ props, slots }] },
})

/**
 * ArtifactPane (`design/components/artifact-pane.md`): a side pane that shows
 * one artifact a turn produced, with its name, kind, the app's controls and a
 * switch between its views.
 *
 * The body is the pane's only scroll region and a tab stop only while it
 * overflows (CodeBlock's rule), named by the pane's title. It is measured on
 * mount, when the body or its content resizes (a streaming artifact grows in a
 * box of fixed size) and when the shown view changes. The current view is
 * mirrored, so the body knows which view to draw when the switch is not
 * controlled.
 */
export default describeMember({
  member: 'ArtifactPane',
  dir: 'ai',
  recipe: 'ai/artifact-pane',
  types: {
    ArtifactKind: "'code' | 'document' | 'data' | 'preview'",
    ArtifactView: '{ id: string; label: string; content: VNode | string }',
  },
  defaults: { streaming: 'false', closeLabel: lit('Close'), viewsLabel: lit('View') },
  state: { overflowing: 'false', mirror: 'defaultView ?? views?.[0]?.id' },
  derived: {
    titleId: '`${uid}-title`',
    current: 'view ?? mirror',
    switching: 'views !== undefined && views.length > 1',
    shown:
      'views === undefined ? undefined : (views.find((entry) => entry.id === current) ?? views[0])',
    // The mark for each kind: the icon role for that kind of object.
    mark: "kind === undefined ? 'artifact' : ({ code: 'terminal', document: 'document', data: 'table', preview: 'browser' } as const)[kind]",
    choices: '(views ?? []).map((entry) => ({ value: entry.id, label: entry.label }))',
  },
  effects: [
    {
      watch: 'shown?.id',
      resize: ['body', 'body?.firstElementChild'],
      run: 'overflowing = body !== null && body.scrollHeight > body.clientHeight',
    },
  ],
  // The spec's `agent` fence. An agent reads the reading shown and the readings offered, chooses
  // one through the pane's own view and closes the pane as its close control does. The switch and
  // the close Button are the pane's own parts, so they are withheld, each by its wrapper: the
  // header also holds the app's `actions`, which stay an agent's.
  agent: {
    on: 'pane',
    state: {
      view: 'shown?.id ?? null',
      views: '(views ?? []).map((entry) => ({ id: entry.id, label: entry.label }))',
      streaming: 'streaming',
    },
    actions: {
      choose: {
        argument: 'id',
        run: "value !== shown?.id && ((mirror = value), emit('viewChange', value))",
      },
      close: `(() => {
        if (!listening.close) throw new Error('The pane has no close control.')
        emit('close')
      })()`,
    },
    withholds: '[switcher, closer]',
  },
  template: el(
    'section',
    {
      // The pane, which its title names for an agent.
      ref: 'pane',
      class: ['pane'],
      attrs: {
        'aria-labelledby': 'titleId',
        'data-kind': 'kind',
        'data-state': when('streaming', lit('streaming')),
        'aria-busy': when('streaming', 'true'),
        ...identity('ArtifactPane'),
      },
    },
    [
      el('header', { class: ['header'] }, [
        el('span', { class: ['mark'] }, [
          cond(
            'streaming',
            // The spinner's name is the pane's status.
            [member('Spinner', { size: lit('sm'), label: '`${title}: still being written`' })],
            [member('Icon', { name: 'mark', size: lit('sm') })],
          ),
        ]),
        el('div', { class: ['heading'] }, [
          el('h2', { class: ['title'], attrs: { id: 'titleId' } }, [text('title')]),
          cond('meta !== undefined', [el('p', { class: ['meta'] }, [text('meta')])]),
        ]),
        cond('switching', [
          el('div', { ref: 'switcher', class: ['views'] }, [
            member(
              'SegmentedControl',
              { size: lit('sm'), label: 'viewsLabel', options: 'choices', value: 'current' },
              { on: { change: run("(mirror = $event, emit('viewChange', $event))") } },
            ),
          ]),
        ]),
        cond('slots.actions', [el('div', { class: ['actions'] }, [slot('actions')])]),
        // Shown when the caller handles `close`; the app decides whether the pane stays.
        cond('listening.close', [
          el('div', { ref: 'closer', class: ['close'] }, [
            member(
              'Button',
              {
                variant: lit('ghost'),
                tone: lit('neutral'),
                size: lit('sm'),
                iconOnly: 'true',
                icon: lit('close'),
                label: 'closeLabel',
              },
              { on: { click: { emit: 'close' } } },
            ),
          ]),
        ]),
      ]),
      // A group, not a second region: the pane is the landmark, and two landmarks
      // with one name cannot be told apart.
      el(
        'div',
        {
          class: ['body'],
          ref: 'body',
          attrs: {
            'data-view': 'shown?.id',
            tabindex: when('overflowing', '0'),
            role: when('overflowing', lit('group')),
            'aria-labelledby': when('overflowing', 'titleId'),
          },
        },
        [
          el('div', { class: ['content'] }, [
            cond(
              'shown === undefined',
              [slot()],
              "typeof shown.content === 'string'",
              [text('shown.content')],
              [render('shown.content')],
            ),
          ]),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'code — one reading, the app’s controls, close',
      ...boxed(
        { title: 'deliver.ts', kind: 'code', meta: 'TypeScript · 9 lines', onClose: noop },
        { actions: ACTIONS, default: [code(CODE)] },
      ),
    },
    {
      name: 'two readings — the switch between code and preview',
      ...boxed(
        {
          title: 'Release notes',
          kind: 'document',
          meta: 'Markdown · 3 sections',
          onClose: noop,
          views: [
            { id: 'preview', label: 'Preview', content: node(PREVIEW) },
            { id: 'source', label: 'Source', content: node(code(STRUCTURE)) },
          ],
        },
        { actions: ACTIONS },
      ),
    },
    {
      name: 'streaming — still being written',
      ...boxed(
        { title: 'deliver.ts', kind: 'code', streaming: true },
        { default: [code(CODE.slice(0, 120))] },
      ),
    },
    {
      name: 'a long artifact — the body scrolls inside the pane',
      ...boxed(
        { title: 'deliver.ts', kind: 'code', meta: 'TypeScript · 44 lines', onClose: noop },
        { default: [code(`${CODE}\n${CODE}\n${CODE}\n${CODE}`)] },
      ),
    },
    {
      name: 'no kind — the tier’s own mark',
      ...boxed({ title: 'Untitled artifact' }, { default: [PREVIEW] }),
    },
  ],
})
