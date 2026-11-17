import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { ApprovalCard, type ApprovalCardProps } from './ApprovalCard'

/**
 * ApprovalCard, in a real browser.
 *
 * The tests check three things. Both answers are real buttons that each fire
 * exactly one handler. A decision in flight shows on the pressed button and
 * disables the other. A decided card has no buttons, only the sentence that
 * records the outcome.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ApprovalCardProps>(true)
  })
})

describe('asking', () => {
  it('is a region named by its question, with two answers', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    render(<ApprovalCard title="Run the migration?" onApprove={onApprove} onDeny={onDeny} />)
    expect(screen.getByRole('region', { name: 'Run the migration?' })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onDeny).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onDeny).toHaveBeenCalledTimes(1)
  })

  it('uses the app’s labels for both buttons', () => {
    render(
      <ApprovalCard
        tone="danger"
        title="Delete dist?"
        approveLabel="Delete"
        denyLabel="Keep"
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete' }).dataset['tone']).toBe('danger')
    expect(screen.getByRole('button', { name: 'Keep' }).dataset['variant']).toBe('outline')
  })
})

describe('pending', () => {
  it('shows the decision in flight on the pressed button and disables the other', () => {
    render(
      <ApprovalCard
        title="Run the migration?"
        pending="denied"
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    )
    const deny = screen.getByRole('button', { name: 'Deny' })
    const allow = screen.getByRole('button', { name: 'Allow' })
    expect(deny.getAttribute('aria-busy')).toBe('true')
    expect((allow as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('decided', () => {
  it('shows the outcome and removes the buttons', () => {
    render(
      <ApprovalCard
        title="Run the migration?"
        decision="approved"
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('Allowed')).toBeTruthy()
  })

  it('uses the app’s outcome text', () => {
    render(
      <ApprovalCard
        title="Delete dist?"
        decision="denied"
        messages={{ approved: 'Erlaubt', denied: 'Abgelehnt' }}
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    )
    expect(screen.getByText('Abgelehnt')).toBeTruthy()
  })
})

/**
 * An agent and the ApprovalCard (`design/components/approval-card.md`, Agent): it reads what is
 * asked and the decision, and cannot answer. A person approves what an agent asks to do, so the
 * card's Buttons are withheld from every snapshot, query and step.
 */
describe('an agent', () => {
  it('reads the request and reaches neither answer, by a target or by an id', async () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    render(
      <ApprovalCard
        title="Run the migration against the staging database?"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    )
    const bridge = createAgentBridge({ confirm: () => true })
    try {
      expect(bridge.snapshot().members).toEqual([
        {
          id: expect.any(String),
          member: 'ApprovalCard',
          name: 'Run the migration against the staging database?',
          state: {
            title: 'Run the migration against the staging database?',
            decision: '',
            pending: '',
          },
          actions: [],
        },
      ])
      expect(bridge.query({ member: 'Button' })).toEqual([])
      expect(bridge.query({ name: 'Allow' })).toEqual([])
      const buttons = agentRegistrations().filter(
        (registration) => registration.member === 'Button',
      )
      expect(buttons).toHaveLength(2)
      for (const step of [
        { target: { member: 'Button', name: 'Allow' }, action: 'press' },
        { target: { member: 'Button', name: 'Deny' }, action: 'press' },
        ...buttons.map(({ id }) => ({ id, action: 'press' })),
      ]) {
        const { results } = await bridge.act([step])
        expect(results[0], JSON.stringify(step)).toMatchObject({
          ok: false,
          error: { code: 'unknown-member' },
        })
      }
      expect(onApprove).not.toHaveBeenCalled()
      expect(onDeny).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('reads the decision being sent and the one recorded', () => {
    const bridge = createAgentBridge()
    try {
      const { rerender } = render(
        <ApprovalCard title="Deploy?" pending="approved" onApprove={vi.fn()} onDeny={vi.fn()} />,
      )
      expect(bridge.snapshot().members[0]?.state).toEqual({
        title: 'Deploy?',
        decision: '',
        pending: 'approved',
      })
      rerender(
        <ApprovalCard title="Deploy?" decision="denied" onApprove={vi.fn()} onDeny={vi.fn()} />,
      )
      expect(bridge.snapshot().members[0]?.state).toEqual({
        title: 'Deploy?',
        decision: 'denied',
        pending: '',
      })
    } finally {
      bridge.dispose()
    }
  })
})
