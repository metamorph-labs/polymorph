import { cond, describeMember, each, el, identity, lit, member, text, when } from '../dsl'

const RUN = [
  {
    id: 'read',
    title: 'Read the webhook retry code',
    description: 'src/webhooks/retry.ts and its two callers',
    status: 'done',
  },
  {
    id: 'cause',
    title: 'Find why a retry reuses the promo code',
    description: 'The idempotency key is built before the code is applied.',
    status: 'done',
  },
  {
    id: 'fix',
    title: 'Build the idempotency key after the code is applied',
    description: 'Editing src/webhooks/deliver.ts',
    status: 'running',
  },
  { id: 'test', title: 'Run the webhook tests', status: 'pending' },
  { id: 'review', title: 'Open a pull request for review', status: 'pending' },
]

const EVERY_STATUS = [
  { id: 'done', title: 'A step that is done', status: 'done' },
  { id: 'running', title: 'A step that is running', status: 'running' },
  { id: 'error', title: 'A step that failed', status: 'error' },
  { id: 'skipped', title: 'A step that was skipped', status: 'skipped' },
  { id: 'pending', title: 'A step that has not started', status: 'pending' },
]

const FAILED = [
  { id: 'read', title: 'Read the webhook retry code', status: 'done' },
  {
    id: 'test',
    title: 'Run the webhook tests',
    description: 'Three tests failed in deliver.test.ts.',
    status: 'error',
  },
  { id: 'fix', title: 'Fix what the tests found', status: 'skipped' },
  { id: 'review', title: 'Open a pull request for review', status: 'skipped' },
]

const PENDING = RUN.map((step) => ({ ...step, status: 'pending' }))

const DONE = RUN.map((step) => ({ ...step, status: 'done' }))

/** One status's glyph: a branch of its own, so the glyph mounts again and fades in when the status changes. */
const glyph = (icon: string, spinning = false) => [
  el('span', { class: spinning ? ['glyph', 'spinning'] : ['glyph'] }, [
    member('Icon', { name: lit(icon), size: lit('sm') }),
  ]),
]

/**
 * Plan (`design/components/plan.md`): an agent run's steps, each with its
 * status, read at a glance while the run goes on. Nothing in it is pressed or
 * opened, so it binds no machine.
 *
 * The status is never the glyph alone: each step's status words sit visually
 * hidden after its title. One polite status line names the step at the front
 * of the run, so a reader hears the run move once for each step, and a
 * description that changes while a step runs is never announced.
 */
export default describeMember({
  member: 'Plan',
  dir: 'ai',
  recipe: 'ai/plan',
  types: {
    PlanStatus: "'pending' | 'running' | 'done' | 'error' | 'skipped'",
    PlanStep: '{ id: string; title: string; description?: string; status: PlanStatus }',
    PlanMessages: '{ status: Record<PlanStatus, string> }',
  },
  defaults: {
    messages:
      "() => ({ status: { pending: 'Pending', running: 'Running', done: 'Done', error: 'Failed', skipped: 'Skipped' } })",
  },
  derived: {
    // Only the first running step is current, because a list has one current item.
    currentId: "steps.find((step) => step.status === 'running')?.id",
    // The step at the front of the run: the first running step; with none running, the first
    // failed one; with neither, the last one done or skipped. Empty while every step is pending.
    announcement:
      "((front: PlanStep | undefined) => (front === undefined ? '' : `${front.title}, ${messages.status[front.status]}`))(steps.find((step) => step.status === 'running') ?? steps.find((step) => step.status === 'error') ?? [...steps].reverse().find((step) => step.status === 'done' || step.status === 'skipped'))",
  },
  // An empty plan renders nothing: a plan not yet made is the page's to show.
  template: cond('steps.length > 0', [
    el('div', { class: ['root'], attrs: { ...identity('Plan') } }, [
      // The role is written out, because a list without markers loses it in WebKit.
      el(
        'ol',
        { part: 'list', class: ['list'], attrs: { role: lit('list'), 'aria-label': 'label' } },
        [
          each('steps', 'step', 'step.id', [
            el(
              'li',
              {
                part: 'step',
                class: ['step'],
                attrs: {
                  'data-status': 'step.status',
                  'aria-current': when('step.id === currentId', lit('step')),
                  'aria-busy': when("step.status === 'running'", 'true'),
                },
              },
              [
                // Decorative: the status words below say the status.
                el(
                  'span',
                  { part: 'mark', class: ['mark'], attrs: { 'aria-hidden': lit('true') } },
                  [
                    cond(
                      "step.status === 'running'",
                      glyph('loading', true),
                      "step.status === 'done'",
                      glyph('success'),
                      "step.status === 'error'",
                      glyph('error'),
                      "step.status === 'skipped'",
                      glyph('remove'),
                      glyph('time'),
                    ),
                  ],
                ),
                el('span', { part: 'copy', class: ['copy'] }, [
                  el('span', { part: 'title', class: ['title'] }, [text('step.title')]),
                  el('span', { class: ['reader'] }, [text('`, ${messages.status[step.status]}`')]),
                  cond('step.description !== undefined', [
                    el('span', { part: 'description', class: ['description'] }, [
                      text('step.description'),
                    ]),
                  ]),
                ]),
              ],
            ),
          ]),
        ],
      ),
      // The status line holds no description, so a description that changes while a step
      // runs is never announced.
      el('p', { part: 'line', class: ['line'], attrs: { role: lit('status') } }, [
        text('announcement'),
      ]),
    ]),
  ]),
  states: [
    {
      name: 'running — two steps done, one running, two to come',
      props: { label: 'Plan for this run', steps: RUN },
    },
    {
      name: 'every status — one step of each',
      props: { label: 'Every status', steps: EVERY_STATUS },
    },
    {
      name: 'failed — the run stopped, and the rest was skipped',
      props: { label: 'Plan for this run', steps: FAILED },
    },
    {
      name: 'pending — nothing has started',
      props: { label: 'Plan for this run', steps: PENDING },
    },
    {
      name: 'done — every step finished',
      props: { label: 'Plan for this run', steps: DONE },
    },
    {
      name: 'empty — the page tells that story, not the list',
      props: { label: 'Plan for this run', steps: [] },
      rendersNothing: true,
    },
  ],
})
