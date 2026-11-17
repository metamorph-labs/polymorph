import { cond, describeMember, el, fx, identity, lit, member, slot, text, when } from '../dsl'

const INPUT = { path: 'src/webhooks/retry.ts', range: { start: 1, end: 80 } }

const OUTPUT = fx(
  'CodeBlock',
  {},
  { default: ['export const RETRY_CAP = 5\nexport const FIRST_RETRY_MS = 2_000'] },
)

/**
 * ToolCall (`design/components/tool-call.md`): one tool invocation as an
 * expandable row. Zag's collapsible machine owns the disclosure, as it does
 * for Collapsible. A row with nothing inside is not a button: its trigger is
 * disabled and draws no chevron.
 *
 * The status shows twice, the glyph for sighted readers and its text, visually
 * hidden inside the trigger, so the button's name says the status too. `input`
 * renders as a CodeBlock when it is a string and as a JsonTree otherwise.
 */
export default describeMember({
  member: 'ToolCall',
  dir: 'ai',
  recipe: 'ai/tool-call',
  types: {
    ToolCallStatus: "'pending' | 'running' | 'done' | 'error' | 'denied' | 'approval'",
    ToolCallMessages: '{ input: string; output: string; status: Record<ToolCallStatus, string> }',
  },
  defaults: {
    icon: lit('tool'),
    defaultOpen: 'false',
    messages:
      "() => ({ input: 'Input', output: 'Output', status: { pending: 'Pending', running: 'Running', done: 'Done', error: 'Failed', denied: 'Denied', approval: 'Awaiting approval' } })",
  },
  derived: {
    running: "status === 'running'",
    // The slot is read for whether it is filled, never compared with `undefined`: a
    // foundation may answer with a boolean, and `false !== undefined` is true.
    hasBody: 'input !== undefined || Boolean(slots.output) || message !== undefined',
    // The glyph for each status, matching the status text beside it.
    statusIcon:
      "({ pending: 'time', running: 'loading', done: 'success', error: 'error', denied: 'denied', approval: 'help' } as const)[status]",
  },
  machine: {
    of: 'collapsible',
    context: { open: 'open', defaultOpen: 'defaultOpen', disabled: '!hasBody' },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  // The spec's `agent` fence. The machine owns the open state, controlled or not, so an action
  // sets it through the machine and the machine emits `openChange`. A call with nothing inside
  // refuses `expand`, as its trigger is disabled then.
  agent: {
    on: 'trigger',
    state: { status: 'status', expanded: 'api.open' },
    actions: {
      expand: `(() => {
        if (!hasBody) throw new Error('The call has nothing to show.')
        api.setOpen(true)
      })()`,
      collapse: 'api.setOpen(false)',
    },
  },
  template: el(
    'div',
    {
      class: ['card'],
      spread: ['api.getRootProps()'],
      attrs: {
        'data-status': 'status',
        'aria-busy': when('running', 'true'),
        ...identity('ToolCall'),
      },
    },
    [
      // Disabled while there is no body, as Radix's trigger is: the machine only marks it.
      el(
        'button',
        {
          part: 'trigger',
          // The control an agent reads the name of.
          ref: 'trigger',
          class: ['trigger'],
          spread: ['api.getTriggerProps()'],
          attrs: { disabled: '!hasBody' },
        },
        [
          el('span', { class: ['mark'] }, [member('Icon', { name: 'icon', size: lit('sm') })]),
          el('span', { class: ['name'] }, [text('name')]),
          cond('summary !== undefined', [el('span', { class: ['summary'] }, [text('summary')])]),
          el('span', { class: ['trailing'] }, [
            cond('duration !== undefined', [
              el('span', { class: ['duration'] }, [text('duration')]),
            ]),
            el('span', { class: ['status', { name: 'spinning', when: 'running' }] }, [
              member('Icon', { name: 'statusIcon', size: lit('sm') }),
            ]),
            el('span', { class: ['reader'] }, [text('messages.status[status]')]),
            cond('hasBody', [
              el('span', { class: ['chevron'] }, [
                member('Icon', { name: lit('down'), size: lit('sm') }),
              ]),
            ]),
          ]),
        ],
      ),
      cond('hasBody', [
        // The recipe's height keyframes read the measured height under Radix's
        // name, as in Collapsible.
        el(
          'div',
          {
            part: 'content',
            class: ['content'],
            spread: ['api.getContentProps()'],
            geometry: {
              '--radix-collapsible-content-height':
                "Object(api.getContentProps().style)['--height']",
            },
          },
          [
            el('div', { class: ['inner'] }, [
              cond('input !== undefined', [
                el('div', { class: ['section'] }, [
                  el('span', { class: ['heading'] }, [text('messages.input')]),
                  cond(
                    "typeof input === 'string'",
                    [
                      member(
                        'CodeBlock',
                        { label: 'messages.input' },
                        { slots: { default: [text('input')] } },
                      ),
                    ],
                    [
                      member('JsonTree', {
                        data: 'input',
                        label: 'messages.input',
                        defaultDepth: '1',
                      }),
                    ],
                  ),
                ]),
              ]),
              cond('slots.output', [
                el('div', { class: ['section'] }, [
                  el('span', { class: ['heading'] }, [text('messages.output')]),
                  slot('output'),
                ]),
              ]),
              cond('message !== undefined', [el('p', { class: ['message'] }, [text('message')])]),
            ]),
          ],
        ),
      ]),
    ],
  ),
  states: [
    {
      name: 'running — the glyph spins, the row is busy',
      props: {
        name: 'read_file',
        summary: 'src/webhooks/retry.ts',
        status: 'running',
        input: INPUT,
      },
      expect: { 'data-status': 'running', 'aria-busy': 'true' },
    },
    {
      name: 'done — closed, with a duration',
      props: {
        name: 'read_file',
        summary: 'src/webhooks/retry.ts',
        status: 'done',
        duration: '0.4s',
        input: INPUT,
      },
      slots: { output: [OUTPUT] },
      expect: { 'data-status': 'done', 'data-state': 'closed' },
    },
    {
      name: 'done, open — the input as JsonTree, the output as the app composed it',
      props: {
        name: 'read_file',
        summary: 'src/webhooks/retry.ts',
        status: 'done',
        duration: '0.4s',
        input: INPUT,
        defaultOpen: true,
      },
      slots: { output: [OUTPUT] },
      expect: { 'data-state': 'open' },
    },
    {
      name: 'a string input — CodeBlock, a shell command',
      props: {
        name: 'run_command',
        icon: 'terminal',
        summary: 'pnpm test --project ui',
        status: 'done',
        duration: '41s',
        input: 'pnpm test --project ui',
        defaultOpen: true,
      },
    },
    {
      name: 'pending — queued behind the one before it',
      props: {
        name: 'search_web',
        icon: 'network',
        summary: 'webhook idempotency',
        status: 'pending',
      },
      expect: { 'data-status': 'pending' },
    },
    {
      name: 'awaiting approval — the ApprovalCard beside it asks',
      props: {
        name: 'run_command',
        icon: 'terminal',
        summary: 'pnpm db:migrate --env staging',
        status: 'approval',
      },
      expect: { 'data-status': 'approval' },
    },
    {
      name: 'failed — the app’s words, open',
      props: {
        name: 'search_web',
        icon: 'network',
        summary: 'webhook idempotency',
        status: 'error',
        message: 'The search provider returned 429. Retrying is up to you.',
        defaultOpen: true,
      },
      expect: { 'data-status': 'error' },
    },
    {
      name: 'denied',
      props: {
        name: 'run_command',
        icon: 'terminal',
        summary: 'rm -rf dist',
        status: 'denied',
        message: 'Denied by you.',
      },
      expect: { 'data-status': 'denied' },
    },
    {
      name: 'nothing inside — a row, not a button',
      props: { name: 'list_tools', status: 'done', duration: '0.1s' },
    },
  ],
})
