import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned, DATA_ATTRS } from '@polymorph/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '../controls/Button'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Alert, type AlertProps } from './Alert'

/**
 * Alert, in a real browser.
 *
 * Two behaviours. The tone decides politeness: warnings and errors interrupt,
 * info and success do not. And `onDismiss` fires after the row has closed, with
 * timing from the binding, so it must be zero at `none` or the ✕ would seem to
 * do nothing for a moment.
 */

beforeAll(installTestTheme)

/*
 * The temperament is set explicitly. Half the assertions depend on a motion
 * duration, and an inherited attribute would depend on the previous test file.
 */
beforeEach(() => {
  document.documentElement.setAttribute(DATA_ATTRS.motion, 'standard')
})

afterEach(() => {
  document.documentElement.removeAttribute(DATA_ATTRS.motion)
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<AlertProps>(true)
  })
})

describe('politeness follows the tone', () => {
  it('uses the status role for info and success', () => {
    render(<Alert title="Sandbox mode">Nothing here reaches a customer.</Alert>)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('interrupts for warning and danger', () => {
    render(<Alert tone="danger">Two fields need attention.</Alert>)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('exposes its tone as an attribute for the recipe', () => {
    render(<Alert tone="warning">Storage almost full.</Alert>)
    expect(screen.getByRole('alert').dataset['tone']).toBe('warning')
  })

  it('has no state attribute at rest', () => {
    render(<Alert tone="info">Sandbox mode.</Alert>)
    expect(screen.getByRole('status').hasAttribute('data-state')).toBe(false)
  })
})

describe('the body', () => {
  it('takes a title and copy, and neither is a heading', () => {
    render(
      <Alert tone="success" title="Import finished">
        All 1,284 tickets came across.
      </Alert>,
    )
    expect(screen.getByText('Import finished')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('draws the tone glyph, and omits it when icon is false', () => {
    const { container, unmount } = render(<Alert tone="danger">Two fields need attention.</Alert>)
    expect(container.querySelector('svg')).not.toBeNull()
    unmount()

    const bare = render(
      <Alert tone="danger" icon={false}>
        Two fields need attention.
      </Alert>,
    )
    expect(bare.container.querySelector('svg')).toBeNull()
  })

  it('renders no ✕ without onDismiss', () => {
    render(<Alert tone="info">Sandbox mode.</Alert>)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('draws content with no title, and an empty title as none', () => {
    render(
      <Alert tone="warning" title="">
        Replies are delayed while the mail queue catches up.
      </Alert>,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Replies are delayed while the mail queue catches up.')
    expect(alert.querySelector('p')).toBeNull()
  })

  it('draws a title alone with no body under it', () => {
    render(<Alert tone="danger" title="The changes could not be saved" />)
    const title = screen.getByText('The changes could not be saved')
    expect(screen.getByRole('alert').contains(title)).toBe(true)
    // Nothing follows the title in the body, so no empty body adds its gap.
    expect(title.nextElementSibling).toBeNull()
  })
})

/**
 * An Alert is drawn only while it has something to say, so a screen can draw it always and bind
 * its title to a message that is empty while there is none (`design/components/alert.md`).
 */
describe('an Alert with nothing to say', () => {
  it('renders nothing with no title and no content, whatever else it is given', () => {
    const { container, rerender } = render(<Alert tone="danger" />)
    expect(container.firstElementChild).toBeNull()

    rerender(
      <Alert
        tone="danger"
        title=""
        onDismiss={() => {}}
        action={<Button variant="soft" tone="accent" size="sm" label="Retry" />}
        secondaryAction={<Button variant="ghost" tone="neutral" size="sm" label="Discard" />}
      />,
    )
    expect(container.firstElementChild).toBeNull()

    // The values React draws nothing for are no content either.
    for (const nothing of [null, false, true, '']) {
      rerender(<Alert tone="info">{nothing}</Alert>)
      expect(container.firstElementChild, String(nothing)).toBeNull()
    }
  })

  it('draws once its title arrives, with its role from the first render that draws it', async () => {
    const { container, rerender } = render(<Alert tone="danger" title="" />)
    const seen: MutationRecord[] = []
    const observer = new MutationObserver((records) => seen.push(...records))
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role'],
    })
    try {
      rerender(<Alert tone="danger" title="The changes could not be saved" />)
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toBe('The changes could not be saved')
      await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0))
      // The root arrives in one insertion, already holding its role and its words, so a screen
      // reader announces it as it announces an Alert mounted in response to an event.
      expect(seen.map((record) => record.type)).toEqual(['childList'])
      expect([...(seen[0]?.addedNodes ?? [])]).toEqual([alert])
    } finally {
      observer.disconnect()
    }
  })

  it('is not listed for an agent until it has something to say', () => {
    const bridge = createAgentBridge()
    try {
      const { rerender } = render(<Alert tone="danger" title="" onDismiss={() => {}} />)
      expect(bridge.snapshot().members).toEqual([])

      rerender(<Alert tone="danger" title="The changes could not be saved" onDismiss={() => {}} />)
      expect(bridge.snapshot().members).toEqual([
        expect.objectContaining({
          member: 'Alert',
          state: { tone: 'danger', title: 'The changes could not be saved', dismissible: true },
        }),
      ])

      rerender(<Alert tone="danger" title="" onDismiss={() => {}} />)
      expect(bridge.snapshot().members).toEqual([])
    } finally {
      bridge.dispose()
    }
  })
})

describe('dismissal: the Alert animates, the app unmounts', () => {
  it('closes the row first and reports the dismissal after', async () => {
    const onDismiss = vi.fn()
    render(
      <Alert tone="info" title="New shortcuts" onDismiss={onDismiss}>
        Press ⌘K to jump to a ticket.
      </Alert>,
    )

    /*
     * `fireEvent`, not the pointer harness. The test asserts that nothing has
     * been reported yet, and the departure is only 143ms. A real pointer's round
     * trip can take longer under a loaded suite, so the press and the assertion
     * happen in the same tick.
     */
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    // The row is closing and the caller has not been told yet. The CSS keys the
    // collapse off this `data-state`.
    expect(screen.getByRole('status').dataset['state']).toBe('closed')
    expect(onDismiss).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('reports it immediately when the theme has no motion at all', async () => {
    document.documentElement.setAttribute(DATA_ATTRS.motion, 'none')
    const onDismiss = vi.fn()
    render(
      <Alert tone="info" onDismiss={onDismiss}>
        Press ⌘K to jump to a ticket.
      </Alert>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    // No wait. At `none` the binding's durations are zero.
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('leaves focus where it was, because the Alert is not modal', async () => {
    render(
      <>
        <Button label="Somewhere else" />
        <Alert tone="info" onDismiss={() => {}}>
          Press ⌘K to jump to a ticket.
        </Alert>
      </>,
    )
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    // Focus is set from the keyboard: WebKit does not focus a button on pointer
    // press (the macOS convention), and the case under test is a reader whose
    // focus is on the control.
    dismiss.focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(dismiss)
  })
})

describe('the actions', () => {
  it('takes one action, and it is the caller’s button', async () => {
    const onClick = vi.fn()
    render(
      <Alert
        tone="warning"
        title="Storage almost full"
        action={
          <Button variant="soft" tone="accent" size="sm" label="Upgrade plan" onClick={onClick} />
        }
      >
        You are at 92% of your plan.
      </Alert>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('takes a second action after the first, and both are the caller’s buttons', async () => {
    const onApply = vi.fn()
    const onDiscard = vi.fn()
    render(
      <Alert
        tone="info"
        title="Imported fields need review"
        action={<Button variant="soft" tone="accent" size="sm" label="Apply" onClick={onApply} />}
        secondaryAction={
          <Button variant="ghost" tone="neutral" size="sm" label="Discard" onClick={onDiscard} />
        }
      >
        Three ticket fields came across under new names.
      </Alert>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('puts both actions in one row, the first action first', () => {
    render(
      <Alert
        tone="info"
        action={<Button variant="soft" tone="accent" size="sm" label="Apply" />}
        secondaryAction={<Button variant="ghost" tone="neutral" size="sm" label="Discard" />}
      >
        Three ticket fields came across under new names.
      </Alert>,
    )
    const apply = screen.getByRole('button', { name: 'Apply' })
    const discard = screen.getByRole('button', { name: 'Discard' })
    expect(apply.parentElement).toBe(discard.parentElement)
    expect(apply.compareDocumentPosition(discard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.skipIf(TAB_PASSES_BUTTONS)(
    'keeps the focus order: the first action, the second, then the ✕',
    async () => {
      render(
        <Alert
          tone="info"
          onDismiss={() => {}}
          action={<Button variant="soft" tone="accent" size="sm" label="Apply" />}
          secondaryAction={<Button variant="ghost" tone="neutral" size="sm" label="Discard" />}
        >
          Three ticket fields came across under new names.
        </Alert>,
      )
      screen.getByRole('button', { name: 'Apply' }).focus()
      await userEvent.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Discard' }))
      await userEvent.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss' }))
    },
  )
})

/**
 * An agent dismisses an Alert through the bridge, as the spec's `agent` fence declares
 * (`design/components/alert.md`, Agent). The ✕ is withheld, and the application's actions stay
 * an agent's.
 */
describe('an agent', () => {
  it('dismisses as the ✕ does, and the step ends once onDismiss has run', async () => {
    const bridge = createAgentBridge()
    try {
      const onDismiss = vi.fn()
      render(
        <Alert
          tone="danger"
          title="Two fields need attention"
          onDismiss={onDismiss}
          action={<Button variant="soft" tone="accent" size="sm" label="Review" />}
        >
          The due date is in the past.
        </Alert>,
      )
      const { members } = bridge.snapshot()
      const alert = members.find((member) => member.member === 'Alert')
      expect(alert).toMatchObject({
        state: { tone: 'danger', title: 'Two fields need attention', dismissible: true },
        actions: [{ name: 'dismiss' }],
      })
      // The application's action is listed within the Alert, and the ✕ is not listed.
      expect(
        members
          .filter((member) => member.member === 'Button')
          .map((member) => [member.name, member.within]),
      ).toEqual([['Review', alert?.id]])

      // The danger tone colours the message, so no person is asked.
      const { results } = await bridge.act([{ id: alert?.id, action: 'dismiss' }])
      expect(results[0]).toMatchObject({ ok: true })
      expect(onDismiss).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('alert').dataset['state']).toBe('closed')
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to dismiss an Alert that has no ✕', async () => {
    const bridge = createAgentBridge()
    try {
      render(<Alert title="Sandbox mode">Nothing here reaches a customer.</Alert>)
      const [alert] = bridge.snapshot().members
      expect(alert?.state['dismissible']).toBe(false)
      const { results } = await bridge.act([{ id: alert?.id, action: 'dismiss' }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
    } finally {
      bridge.dispose()
    }
  })

  it('ends the step when the application removes the Alert before the ✕ has played', async () => {
    const bridge = createAgentBridge()
    try {
      const onDismiss = vi.fn()
      const { unmount } = render(
        <Alert title="New keyboard shortcuts" onDismiss={onDismiss}>
          Press the key to jump to a ticket.
        </Alert>,
      )
      const [alert] = bridge.snapshot().members
      const step = bridge.act([{ id: alert?.id, action: 'dismiss' }])
      // The departure has begun, and the application removes the Alert before it ends.
      await vi.waitFor(() => expect(screen.getByRole('status').dataset['state']).toBe('closed'))
      unmount()
      const { results } = await step
      expect(results[0]).toMatchObject({ ok: true })
      expect(onDismiss).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
