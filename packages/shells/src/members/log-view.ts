import {
  cond,
  describeMember,
  each,
  el,
  flag,
  identity,
  lit,
  member,
  run,
  text,
  when,
  type Node,
} from '../dsl'

/** A build's output: plain lines, a warning and two errors, as React's fixture has it. */
const BUILD = [
  { id: 'b1', text: '> relay@2.4.0 build' },
  { id: 'b2', text: '> vite build' },
  { id: 'b3', text: 'vite v6.3.5 building for production...' },
  { id: 'b4', text: '1284 modules transformed.' },
  {
    id: 'b5',
    level: 'warning',
    text: "src/legacy/chart.ts (14:3): 'Chart' is defined but never used.",
  },
  { id: 'b6', text: 'dist/index.html                 0.48 kB  gzip:   0.31 kB' },
  { id: 'b7', text: 'dist/assets/index-4f2a9c.css   38.12 kB  gzip:   7.90 kB' },
  {
    id: 'b8',
    level: 'error',
    text: "src/inbox/InboxPage.tsx (88:17): Property 'assignee' does not exist on type 'Ticket'.",
  },
  { id: 'b9', level: 'error', text: 'Build failed in 4.21s.' },
]

/** A service's logs: every line has a time, a level and the service that wrote it. */
const SERVICES = [
  {
    id: 's1',
    time: '14:24:01.118',
    level: 'info',
    source: 'svc-web',
    text: 'GET / 200 96ms cache=edge',
  },
  {
    id: 's2',
    time: '14:24:03.402',
    level: 'warning',
    source: 'svc-api',
    text: 'slow query 1840ms: SELECT id, status FROM orders WHERE status = $1',
  },
  {
    id: 's3',
    time: '14:24:05.733',
    level: 'info',
    source: 'svc-worker',
    text: 'job billing.settle done in 412ms attempts=1',
  },
  {
    id: 's4',
    time: '14:24:08.019',
    level: 'error',
    source: 'svc-api',
    text: 'pg: connection reset by peer (pool=replica attempt=1)',
  },
  {
    id: 's5',
    time: '14:24:09.250',
    level: 'info',
    source: 'svc-web',
    text: 'GET /api/session 200 12ms',
  },
]

/** Forty lines of a deploy, more than the harness holds. */
const DEPLOY = Array.from({ length: 40 }, (_, at) => ({
  id: `d${at + 1}`,
  time: `+${String(at * 3).padStart(3, '0')}s`,
  text: `step ${at + 1} of 40: uploaded packages/relay/dist/chunk-${at + 1}.js`,
}))

/** Lines with no break in them and a table whose columns line up, wider than any box. */
const WIDE = [
  { id: 'w1', text: 'PID   USER     %CPU  %MEM  COMMAND' },
  { id: 'w2', text: '4120  relay    12.4   3.1  node dist/server.js --port 8080 --workers 4' },
  { id: 'w3', text: '4188  relay     0.3   0.4  node dist/worker.js --queue jobs-prod' },
  { id: 'w4', level: 'warning', text: `signing_key=whsec_${'JBSWY3DPEHPK3PXP'.repeat(8)}` },
]

/**
 * One line: its level's marker, the word a screen reader hears for the level,
 * its time, its source and its text. The space after the time, the source and
 * the word is read, so a screen reader never runs them into the text.
 */
const line: Node = el(
  'li',
  { part: 'line', class: ['line'], attrs: { 'data-level': 'line.level' } },
  [
    // The marker is for the eye, and the hidden word says the same to a screen reader.
    el('span', { part: 'marker', class: ['marker'], attrs: { 'aria-hidden': lit('true') } }, [
      cond('line.level !== undefined', [member('Icon', { name: 'line.level', size: lit('sm') })]),
    ]),
    cond('line.level !== undefined', [
      el('span', { class: ['spoken'] }, [text("messages[line.level] + ' '")]),
    ]),
    cond('line.time !== undefined', [
      el('span', { part: 'time', class: ['time'] }, [text("line.time + ' '")]),
    ]),
    // The line's own text is an element of its own, so no renderer adds a space before it.
    el('span', { part: 'text', class: ['text'] }, [
      cond('line.source !== undefined', [
        el('span', { part: 'source', class: ['source'] }, [text("line.source + ' '")]),
      ]),
      el('span', { part: 'message' }, [text('line.text')]),
    ]),
  ],
)

/**
 * LogView (`design/components/log-view.md`): lines of output that arrive over
 * time, on CodeBlock's code surface, with the view held at the newest line
 * while the reader is there.
 *
 * Following is the engine's `followEnd`, ChatThread's rule. While the reader
 * is at the end, a line that arrives keeps the end in view. A reader who
 * scrolls up stops it, and nothing moves until they press the jump control,
 * which calls `jumpToEnd`. The list is always in the tree, so the follow is
 * attached once, at mount.
 *
 * The log announces nothing on its own (`aria-live="off"`): lines can arrive
 * faster than speech, and a polite queue that falls behind delays every other
 * announcement on the page. The application draws every line it passes, and
 * trims the old ones itself.
 */
export default describeMember({
  member: 'LogView',
  dir: 'structure',
  recipe: 'structure/log-view',
  types: {
    // One line of the log.
    LogLine: `{
      /** Unique in the log and the same on every render: the line's key. */
      id: string
      /** The line as it was written. Whitespace is content. */
      text: string
      /** How serious the line is, drawn as a marker and read as a word. */
      level?: 'info' | 'warning' | 'error'
      /** When the line was written, already formatted by the application. */
      time?: string
      /** What wrote the line, such as a service, a process or a build step. */
      source?: string
    }`,
    // The words the member writes itself, localized by passing every key or none.
    LogViewMessages: `{
      /** The label of the button that returns the reader to the newest line. */
      jumpToLatest: string
      /** Read before a line whose level is \`info\`. */
      info: string
      /** Read before a line whose level is \`warning\`. */
      warning: string
      /** Read before a line whose level is \`error\`. */
      error: string
    }`,
  },
  defaults: {
    streaming: 'false',
    wrap: 'true',
    messages:
      "() => ({ jumpToLatest: 'Jump to latest', info: 'info', warning: 'warning', error: 'error' })",
  },
  state: { detached: 'false', overflowing: 'false' },
  effects: [
    {
      run: 'followEnd(viewport, list, (state) => { detached = state.detached; overflowing = state.overflowing })',
      release: 'ran()',
    },
  ],
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      attrs: {
        // The reader's own state, which shows the jump control; absent at rest.
        'data-state': when('detached', lit('detached')),
        'data-streaming': flag('streaming'),
        'data-wrap': flag('wrap'),
        ...identity('LogView'),
      },
    },
    [
      // A log that announces nothing on its own; busy while lines are coming; a tab stop only
      // while it can scroll.
      el(
        'div',
        {
          part: 'viewport',
          class: ['viewport'],
          ref: 'viewport',
          attrs: {
            'data-log-view-part': lit('viewport'),
            role: lit('log'),
            'aria-label': 'label',
            'aria-live': lit('off'),
            'aria-busy': when('streaming', 'true'),
            tabindex: when('overflowing', lit('0')),
          },
        },
        [
          // A list, as Diff's lines are; the role is written out because a list without markers
          // loses it in WebKit.
          el('ol', { part: 'lines', class: ['lines'], ref: 'list', attrs: { role: lit('list') } }, [
            each('lines', 'line', 'line.id', [line]),
            // StreamingText's steady caret, inside the list so the follow sees it arrive, and
            // hidden from assistive technology, which reads `aria-busy` instead.
            cond('streaming', [
              el('li', { part: 'end', class: ['end'], attrs: { 'aria-hidden': lit('true') } }, [
                el('span', { class: ['caret'] }),
              ]),
            ]),
          ]),
        ],
      ),
      // Always in the tree; the recipe shows it on `data-state="detached"`, and `display: none`
      // keeps it out of the tab order and the accessibility tree otherwise.
      // The backing is a raised surface under the transparent outline Button, which floats over
      // lines of text.
      el('div', { part: 'jump', class: ['jump'] }, [
        el('span', { part: 'backing', class: ['backing'] }, [
          member(
            'Button',
            {
              variant: lit('outline'),
              tone: lit('neutral'),
              size: lit('sm'),
              icon: lit('down'),
              label: 'messages.jumpToLatest',
            },
            { on: { click: run('jumpToEnd(viewport)') } },
          ),
        ]),
      ]),
    ],
  ),
  states: [
    {
      name: 'build output — plain lines, a warning and two errors',
      props: { label: 'Build output', lines: BUILD },
      expect: { 'data-state': null, 'data-streaming': null, 'data-wrap': '' },
    },
    {
      name: 'service logs — a time, a level and a source on every line',
      props: { label: 'Service logs', lines: SERVICES },
    },
    {
      name: 'streaming — more lines coming, a caret after the last',
      props: { label: 'Build output', lines: BUILD.slice(0, 4), streaming: true },
      expect: { 'data-streaming': '' },
    },
    {
      name: 'waiting — streaming with no lines yet',
      props: { label: 'Build output', lines: [], streaming: true },
      expect: { 'data-streaming': '' },
    },
    {
      // ScrollArea's harness pattern: a fixed-height box for the log to fill.
      name: 'in a box — the log scrolls inside itself, held at the newest line',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [{ props: { label: 'Deploy log', lines: DEPLOY } }],
      },
    },
    {
      name: 'unwrapped — long lines scroll the log sideways',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [{ props: { label: 'Process list', lines: WIDE, wrap: false } }],
      },
    },
    {
      name: 'narrow — long lines wrap in a phone’s column',
      many: {
        within: { element: 'div', class: ['harnessNarrow'] },
        each: [{ props: { label: 'Process list', lines: WIDE } }],
      },
    },
  ],
})
