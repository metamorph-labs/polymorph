import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * An agent and the React ConfirmDialog (`design/components/confirm-dialog.md`, Agent): it reads
 * the dialog and cancels it, and it cannot confirm. The confirm Button, the phrase field and the
 * Dialog the member draws are withheld, so no snapshot, query or step reaches them; the trigger
 * stays the application's.
 */

beforeAll(installTestTheme)

const withheldIds = (member: string) =>
  agentRegistrations()
    .filter((registration) => registration.member === member)
    .map((registration) => registration.id)

async function opened(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  const view = render(
    <ConfirmDialog
      trigger={<Button variant="ghost" tone="neutral" label="Remove the project" />}
      title="Delete the acme-billing project?"
      description="Its tickets, members and settings are deleted with it."
      confirmLabel="Delete project"
      confirmWith="acme-billing"
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      {...props}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Remove the project' }))
  await vi.waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy())
  return { onConfirm, onOpenChange, unmount: view.unmount }
}

describe('an agent', () => {
  it('lists the ConfirmDialog in place of what it holds, and the trigger outside it', async () => {
    await opened()
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name])).toEqual([
        ['Button', 'Remove the project'],
        ['ConfirmDialog', 'Delete the acme-billing project?'],
      ])
      expect(members[1]).toMatchObject({
        state: { open: true, pending: false },
        actions: [{ name: 'cancel' }],
      })
      expect(bridge.query({ name: 'Delete project' })).toEqual([])
      for (const member of ['Dialog', 'Input', 'FormField']) {
        expect(bridge.query({ member }), member).toEqual([])
      }
    } finally {
      bridge.dispose()
    }
  })

  it('registers no Dialog of its own, open or closed', async () => {
    const { unmount } = await opened()
    expect(withheldIds('Dialog')).toEqual([])
    unmount()
    render(
      <ConfirmDialog
        title="Delete the acme-billing project?"
        description="Its tickets, members and settings are deleted with it."
        confirmLabel="Delete project"
        onConfirm={() => {}}
        open={false}
      />,
    )
    const bridge = createAgentBridge()
    try {
      expect(withheldIds('Dialog')).toEqual([])
      // Closed, the ConfirmDialog is registered and has no panel, so the bridge lists nothing.
      expect(withheldIds('ConfirmDialog')).toHaveLength(1)
      expect(bridge.snapshot().members).toEqual([])
    } finally {
      bridge.dispose()
    }
  })

  it('cannot press the confirm or type the phrase, by a target or by an id', async () => {
    const { onConfirm } = await opened()
    const bridge = createAgentBridge({ confirm: () => true })
    try {
      const field = screen.getByRole('textbox')
      const steps = [
        { target: { member: 'Button', name: 'Delete project' }, action: 'press' },
        { target: { member: 'Input' }, action: 'fill', value: 'acme-billing' },
        { target: { member: 'Dialog' }, action: 'close' },
        ...withheldIds('Input').map((id) => ({ id, action: 'fill', value: 'acme-billing' })),
        ...withheldIds('Button')
          .filter((id) => !bridge.snapshot().members.some((member) => member.id === id))
          .map((id) => ({ id, action: 'press' })),
      ]
      expect(steps.length).toBeGreaterThan(4)
      for (const step of steps) {
        const { results } = await bridge.act([step])
        expect(results[0], JSON.stringify(step)).toMatchObject({
          ok: false,
          error: { code: 'unknown-member' },
        })
      }
      expect(onConfirm).not.toHaveBeenCalled()
      expect(field).toHaveProperty('value', '')
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    } finally {
      bridge.dispose()
    }
  })

  it('cancels as the person’s Cancel does, and is refused while the confirmed action runs', async () => {
    const { onOpenChange, unmount } = await opened({ confirmWith: undefined })
    const bridge = createAgentBridge()
    try {
      const dialog = bridge.snapshot().members.find((member) => member.member === 'ConfirmDialog')
      const { results } = await bridge.act([{ id: dialog?.id, action: 'cancel' }])
      expect(results[0]).toMatchObject({ ok: true, changed: { open: { from: true, to: false } } })
      expect(onOpenChange).toHaveBeenLastCalledWith(false)
      await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    } finally {
      bridge.dispose()
    }

    // A person confirms an action that has not settled: the dialog is pending.
    unmount()
    await opened({ confirmWith: undefined, onConfirm: () => new Promise<void>(() => {}) })
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    const pending = createAgentBridge()
    try {
      const member = pending.snapshot().members.find((each) => each.member === 'ConfirmDialog')
      await vi.waitFor(() =>
        expect(pending.snapshot().members.find((each) => each.id === member?.id)?.state).toEqual({
          open: true,
          pending: true,
        }),
      )
      const { results } = await pending.act([{ id: member?.id, action: 'cancel' }])
      expect(results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('cannot be cancelled') },
      })
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    } finally {
      pending.dispose()
    }
  })
})
