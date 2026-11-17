import { type ComponentStates } from '@polymorph/react'
import { CodeBlock } from '../structure/CodeBlock'
import { ToolCall } from './ToolCall'

/** States fixture, from `design/components/tool-call.md`'s States table. */

const INPUT = { path: 'src/webhooks/retry.ts', range: { start: 1, end: 80 } }

const OUTPUT = (
  <CodeBlock>{`export const RETRY_CAP = 5
export const FIRST_RETRY_MS = 2_000`}</CodeBlock>
)

export const states: ComponentStates = {
  component: 'ToolCall',

  entries: [
    {
      name: 'running — the glyph spins, the row is busy',
      render: () => (
        <ToolCall name="read_file" summary="src/webhooks/retry.ts" status="running" input={INPUT} />
      ),
      expect: { 'data-status': 'running', 'aria-busy': 'true' },
    },
    {
      name: 'done — closed, with a duration',
      render: () => (
        <ToolCall
          name="read_file"
          summary="src/webhooks/retry.ts"
          status="done"
          duration="0.4s"
          input={INPUT}
          output={OUTPUT}
        />
      ),
      expect: { 'data-status': 'done', 'data-state': 'closed' },
    },
    {
      name: 'done, open — the input as JsonTree, the output as the app composed it',
      render: () => (
        <ToolCall
          name="read_file"
          summary="src/webhooks/retry.ts"
          status="done"
          duration="0.4s"
          input={INPUT}
          output={OUTPUT}
          defaultOpen
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'a string input — CodeBlock, a shell command',
      render: () => (
        <ToolCall
          name="run_command"
          icon="terminal"
          summary="pnpm test --project ui"
          status="done"
          duration="41s"
          input="pnpm test --project ui"
          defaultOpen
        />
      ),
    },
    {
      name: 'pending — queued behind the one before it',
      render: () => (
        <ToolCall name="search_web" icon="network" summary="webhook idempotency" status="pending" />
      ),
      expect: { 'data-status': 'pending' },
    },
    {
      name: 'awaiting approval — the ApprovalCard beside it asks',
      render: () => (
        <ToolCall
          name="run_command"
          icon="terminal"
          summary="pnpm db:migrate --env staging"
          status="approval"
        />
      ),
      expect: { 'data-status': 'approval' },
    },
    {
      name: 'failed — the app’s words, open',
      render: () => (
        <ToolCall
          name="search_web"
          icon="network"
          summary="webhook idempotency"
          status="error"
          message="The search provider returned 429. Retrying is up to you."
          defaultOpen
        />
      ),
      expect: { 'data-status': 'error' },
    },
    {
      name: 'denied',
      render: () => (
        <ToolCall
          name="run_command"
          icon="terminal"
          summary="rm -rf dist"
          status="denied"
          message="Denied by you."
        />
      ),
      expect: { 'data-status': 'denied' },
    },
    {
      name: 'nothing inside — a row, not a button',
      render: () => <ToolCall name="list_tools" status="done" duration="0.1s" />,
    },
  ],

  /*
   * Hover and focus come from the pointer and keyboard. Open and closed are
   * required because the body's animation and the chevron's rotation key on
   * the Radix attribute. Every status is listed to check that it has a recipe,
   * not only a type.
   */
  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="open"]',
    '[data-state="closed"]',
    '[data-status="pending"]',
    '[data-status="running"]',
    '[data-status="done"]',
    '[data-status="error"]',
    '[data-status="denied"]',
    '[data-status="approval"]',
  ],
}
