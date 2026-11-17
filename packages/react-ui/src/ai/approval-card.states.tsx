'use client'

import { type ComponentStates } from '@polymorph/react'
import { CodeBlock } from '../structure/CodeBlock'
import { ApprovalCard } from './ApprovalCard'

/** States fixture, from `design/components/approval-card.md`'s States table. */

const noop = () => {}

export const states: ComponentStates = {
  component: 'ApprovalCard',

  entries: [
    {
      name: 'asking — the question, the details and two answers',
      render: () => (
        <ApprovalCard
          title="Run the migration against the staging database?"
          description="The agent wants to apply three pending migrations. It will run them in order and stop at the first failure."
          onApprove={noop}
          onDeny={noop}
        >
          <CodeBlock>pnpm db:migrate --env staging</CodeBlock>
        </ApprovalCard>
      ),
      expect: { 'data-tone': 'warning', 'data-decision': null, 'data-state': null },
    },
    {
      name: 'danger — something that cannot be undone',
      render: () => (
        <ApprovalCard
          tone="danger"
          title="Delete the build directory?"
          description="This removes dist/ and everything under it."
          onApprove={noop}
          onDeny={noop}
          approveLabel="Delete"
          denyLabel="Keep"
        >
          <CodeBlock>rm -rf dist</CodeBlock>
        </ApprovalCard>
      ),
      expect: { 'data-tone': 'danger' },
    },
    {
      name: 'pending — the answer is on its way',
      render: () => (
        <ApprovalCard
          title="Run the migration against the staging database?"
          onApprove={noop}
          onDeny={noop}
          pending="approved"
        />
      ),
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'allowed — the record, the actions gone',
      render: () => (
        <ApprovalCard
          title="Run the migration against the staging database?"
          onApprove={noop}
          onDeny={noop}
          decision="approved"
        >
          <CodeBlock>pnpm db:migrate --env staging</CodeBlock>
        </ApprovalCard>
      ),
      expect: { 'data-decision': 'approved' },
    },
    {
      name: 'denied',
      render: () => (
        <ApprovalCard
          tone="danger"
          title="Delete the build directory?"
          onApprove={noop}
          onDeny={noop}
          decision="denied"
        />
      ),
      expect: { 'data-decision': 'denied' },
    },
    {
      name: 'title only — the question is the whole card',
      render: () => (
        <ApprovalCard
          title="Open the pull request in the browser?"
          onApprove={noop}
          onDeny={noop}
        />
      ),
    },
  ],

  /*
   * The buttons' states belong to Button. The card's own states are props
   * (tone, decision, pending). The required selectors are the ones the
   * stylesheet keys beyond the base and the entries assert: both tones and both
   * decisions.
   */
  requiredSelectors: [
    '[data-tone="warning"]',
    '[data-tone="danger"]',
    '[data-decision="approved"]',
    '[data-decision="denied"]',
  ],
}
