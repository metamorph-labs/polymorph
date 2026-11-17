import { type ComponentStates } from '@polymorph/react'
import { Plan, type PlanStep } from './Plan'

/** States fixture, from `design/components/plan.md`'s States table. */

const RUN: PlanStep[] = [
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

const EVERY_STATUS: PlanStep[] = [
  { id: 'done', title: 'A step that is done', status: 'done' },
  { id: 'running', title: 'A step that is running', status: 'running' },
  { id: 'error', title: 'A step that failed', status: 'error' },
  { id: 'skipped', title: 'A step that was skipped', status: 'skipped' },
  { id: 'pending', title: 'A step that has not started', status: 'pending' },
]

const FAILED: PlanStep[] = [
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

const PENDING: PlanStep[] = RUN.map((step) => ({ ...step, status: 'pending' }))

const DONE: PlanStep[] = RUN.map((step) => ({ ...step, status: 'done' }))

export const states: ComponentStates = {
  component: 'Plan',

  entries: [
    {
      name: 'running — two steps done, one running, two to come',
      render: () => <Plan label="Plan for this run" steps={RUN} />,
    },
    {
      name: 'every status — one step of each',
      render: () => <Plan label="Every status" steps={EVERY_STATUS} />,
    },
    {
      name: 'failed — the run stopped, and the rest was skipped',
      render: () => <Plan label="Plan for this run" steps={FAILED} />,
    },
    {
      name: 'pending — nothing has started',
      render: () => <Plan label="Plan for this run" steps={PENDING} />,
    },
    {
      name: 'done — every step finished',
      render: () => <Plan label="Plan for this run" steps={DONE} />,
    },
    {
      name: 'empty — the page tells that story, not the list',
      render: () => <Plan label="Plan for this run" steps={[]} />,
      rendersNothing: true,
    },
  ],

  /*
   * Every status is reachable from a prop. Each is listed to check that it has a
   * recipe, not only a type.
   */
  requiredSelectors: [
    '[data-status="pending"]',
    '[data-status="running"]',
    '[data-status="done"]',
    '[data-status="error"]',
    '[data-status="skipped"]',
  ],
}
