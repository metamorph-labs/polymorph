import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { ChoiceCard, type ChoiceCardOption, type ChoiceCardProps } from './ChoiceCard'

/**
 * ChoiceCard, in a real browser.
 *
 * The browser tests cover what Radix and the label anatomy do together. The whole card surface
 * toggles its visually hidden control. Each mode keeps its own keyboard model: roving arrows for a
 * single choice, and one tab stop per option for multiple choice. The glyph appears on exactly the
 * checked card. The description is announced with its option and is never part of its name.
 */

beforeAll(installTestTheme)

const PLANS: ChoiceCardOption[] = [
  { value: 'starter', label: 'Starter', description: 'For side projects and solo queues' },
  { value: 'team', label: 'Team', description: 'Shared inboxes for up to 20 agents' },
  { value: 'scale', label: 'Scale', description: 'SSO, audit log, unlimited agents' },
]

const CHANNELS: ChoiceCardOption[] = [
  { value: 'email', label: 'Email' },
  { value: 'inapp', label: 'In-app' },
  { value: 'chat', label: 'Chat' },
]

const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLButtonElement
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLButtonElement
const cardOf = (control: HTMLElement) => control.closest('label') as HTMLLabelElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ChoiceCardProps>(true)
  })
})

describe('mode="single"', () => {
  it('is a radiogroup that can render with nothing chosen', () => {
    render(<ChoiceCard mode="single" options={PLANS} label="Plan" />)
    const root = screen.getByRole('radiogroup')
    expect(root.getAttribute('aria-label')).toBe('Plan')
    for (const option of PLANS) {
      expect(cardOf(radio(option.label)).dataset['state']).toBe('unchecked')
    }
  })

  it('selects from the whole card surface, because the label is the hit target', async () => {
    const onChange = vi.fn()
    render(<ChoiceCard mode="single" options={PLANS} onChange={onChange} label="Plan" />)
    await userEvent.click(cardOf(radio('Team')))
    expect(onChange).toHaveBeenLastCalledWith('team')
    expect(cardOf(radio('Team')).dataset['state']).toBe('checked')
  })

  it('moves selection between cards with arrows (roving focus)', async () => {
    render(<ChoiceCard mode="single" options={PLANS} defaultValue="starter" label="Plan" />)
    radio('Starter').focus()
    // A plain tap on purpose. Radix selects on arrow-driven focus using a flag it clears on keyup,
    // and automation releases the key instantly, which can happen before the focus handler runs.
    // `radio-arrows.ts` ties the selection to the focus itself, so no hold is needed. The tap below
    // runs into the race instead of avoiding it.
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(document.activeElement).toBe(radio('Team')))
    // The card's state follows Radix's value through an effect, so the test waits for it instead
    // of reading it with the focus.
    await vi.waitFor(() => expect(cardOf(radio('Team')).dataset['state']).toBe('checked'))
  })

  it('selects on the arrow even when the key is up before the focus has moved', async () => {
    const onChange = vi.fn()
    render(
      <ChoiceCard
        mode="single"
        options={PLANS}
        defaultValue="starter"
        onChange={onChange}
        label="Plan"
      />,
    )
    const starter = radio('Starter')
    starter.focus()
    // Keydown and keyup back to back. The keyup arrives before Radix's deferred focus move, so the
    // race happens every time instead of occasionally.
    const arrow = { key: 'ArrowRight', bubbles: true }
    starter.dispatchEvent(new KeyboardEvent('keydown', arrow))
    starter.dispatchEvent(new KeyboardEvent('keyup', arrow))
    await vi.waitFor(() => expect(document.activeElement).toBe(radio('Team')))
    await vi.waitFor(() => expect(cardOf(radio('Team')).dataset['state']).toBe('checked'))
    expect(onChange).toHaveBeenCalledWith('team')
  })

  it('is never clearable once chosen', async () => {
    render(<ChoiceCard mode="single" options={PLANS} defaultValue="team" label="Plan" />)
    await userEvent.click(cardOf(radio('Team')))
    expect(cardOf(radio('Team')).dataset['state']).toBe('checked')
  })

  it('shows the glyph on exactly the checked card', () => {
    render(<ChoiceCard mode="single" options={PLANS} defaultValue="team" label="Plan" />)
    // PLANS carry no per-option icon, so the only svg a card can hold is the
    // `confirm` glyph.
    expect(cardOf(radio('Team')).querySelectorAll('svg')).toHaveLength(1)
    expect(cardOf(radio('Starter')).querySelectorAll('svg')).toHaveLength(0)
    expect(cardOf(radio('Scale')).querySelectorAll('svg')).toHaveLength(0)
  })
})

describe('mode="multiple"', () => {
  it.skipIf(TAB_PASSES_BUTTONS)(
    'is a named group where every card is its own tab stop and arrows do nothing',
    async () => {
      render(<ChoiceCard mode="multiple" options={CHANNELS} label="Notification channels" />)
      expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Notification channels')

      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(box('Email'))
      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(box('In-app'))
      await userEvent.keyboard('{ArrowDown}')
      // Arrow keys neither move between nor change options, the same rule as CheckboxGroup.
      expect(document.activeElement).toBe(box('In-app'))
    },
  )

  it('reports checked values in options order, and [] is an answer', async () => {
    const onChange = vi.fn()
    render(
      <ChoiceCard
        mode="multiple"
        options={CHANNELS}
        onChange={onChange}
        label="Notification channels"
      />,
    )
    await userEvent.click(cardOf(box('In-app')))
    expect(onChange).toHaveBeenLastCalledWith(['inapp'])
    await userEvent.click(cardOf(box('Email')))
    // Clicked second but reported first, because the value is a filter over the options.
    expect(onChange).toHaveBeenLastCalledWith(['email', 'inapp'])

    await userEvent.click(cardOf(box('Email')))
    await userEvent.click(cardOf(box('In-app')))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('follows a controlled value without owning it', async () => {
    const onChange = vi.fn()
    render(
      <ChoiceCard
        mode="multiple"
        options={CHANNELS}
        value={['chat']}
        onChange={onChange}
        label="Notification channels"
      />,
    )
    expect(cardOf(box('Chat')).dataset['state']).toBe('checked')
    await userEvent.click(cardOf(box('Email')))
    expect(onChange).toHaveBeenLastCalledWith(['email', 'chat'])
    // Controlled, so nothing changes until the owner re-renders.
    expect(cardOf(box('Email')).dataset['state']).toBe('unchecked')
  })
})

describe('the description is announced with its option', () => {
  it('wires each description to its own control and keeps it out of the name', () => {
    render(<ChoiceCard mode="single" options={PLANS} label="Plan" />)
    const control = radio('Team')
    const id = control.getAttribute('aria-describedby') as string
    expect(document.getElementById(id)?.textContent).toBe('Shared inboxes for up to 20 agents')
    // The name is the label line only. The card is one <label>, but `aria-labelledby` keeps the
    // description out of the option's name.
    expect(screen.queryByRole('radio', { name: /Shared inboxes/ })).toBeNull()
  })
})

describe('disabled, per option and whole', () => {
  it('marks the card and disables its control', () => {
    // Asserted rather than clicked, as in Radio's tests. The label forwards its click to a
    // natively disabled control, and that native disabling is what this checks.
    render(
      <ChoiceCard
        mode="multiple"
        options={[
          { value: 'email', label: 'Email' },
          { value: 'webhook', label: 'Webhook', disabled: true },
        ]}
        label="Notification channels"
      />,
    )
    expect(cardOf(box('Webhook')).hasAttribute('data-disabled')).toBe(true)
    expect(box('Webhook').disabled).toBe(true)
    expect(cardOf(box('Email')).hasAttribute('data-disabled')).toBe(false)
  })

  it('disables every card with the group', () => {
    render(<ChoiceCard mode="single" options={PLANS} disabled label="Plan" />)
    for (const option of PLANS) {
      expect(radio(option.label).disabled).toBe(true)
      expect(cardOf(radio(option.label)).hasAttribute('data-disabled')).toBe(true)
    }
  })
})

describe('an agent', () => {
  /**
   * The bridge waits for the member to render, and React holds every update
   * inside a test's `act` scope until the scope ends. An agent's steps run on
   * a page, outside one.
   */
  async function asAgent<T>(run: () => Promise<T>): Promise<T> {
    const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const was = scope.IS_REACT_ACT_ENVIRONMENT
    scope.IS_REACT_ACT_ENVIRONMENT = false
    try {
      return await run()
    } finally {
      scope.IS_REACT_ACT_ENVIRONMENT = was
    }
  }

  /** The application around a controlled single choice: it holds `value` and sets it. */
  function Held({ onChange }: { onChange: (next: string) => void }) {
    const [value, setValue] = useState('starter')
    return (
      <ChoiceCard
        mode="single"
        options={PLANS}
        label="Billing plan"
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    )
  }

  it('chooses one id in the single mode, in both forms, and refuses two', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      render(<ChoiceCard mode="single" options={PLANS} label="Plan" onChange={free} />)
      render(<Held onChange={held} />)
      const [plan, billing] = bridge.snapshot().members
      expect(plan).toMatchObject({
        member: 'ChoiceCard',
        name: 'Plan',
        state: { value: [], mode: 'single', disabled: false },
        actions: [{ name: 'choose', argument: 'ids' }],
      })

      // Uncontrolled: the member holds the value, and the card shows it.
      const chosen = await asAgent(() =>
        bridge.act([{ id: plan?.id, action: 'choose', value: ['team'] }]),
      )
      expect(chosen.results[0]).toEqual({
        ok: true,
        id: plan?.id,
        changed: { value: { from: [], to: ['team'] } },
      })
      expect(free).toHaveBeenLastCalledWith('team')
      const group = screen.getByRole('radiogroup', { name: 'Plan' })
      expect(within(group).getByRole('radio', { name: 'Team' }).getAttribute('aria-checked')).toBe(
        'true',
      )

      // Controlled: the action calls the handler, and the application's value is what renders.
      await asAgent(() => bridge.act([{ id: billing?.id, action: 'choose', value: ['scale'] }]))
      expect(held).toHaveBeenLastCalledWith('scale')
      expect(bridge.snapshot().members[1]?.state['value']).toEqual(['scale'])

      // A single choice takes exactly one id: it cannot be cleared, and two are not one.
      for (const value of [[], ['starter', 'scale']]) {
        const { results } = await bridge.act([{ id: plan?.id, action: 'choose', value }])
        expect(results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      }
      expect(free).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('sets the whole selection in the multiple mode, in options order', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <ChoiceCard
          mode="multiple"
          options={[...CHANNELS, { value: 'webhook', label: 'Webhook', disabled: true }]}
          defaultValue={['email']}
          label="Notification channels"
          onChange={onChange}
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member?.state).toMatchObject({ value: ['email'], mode: 'multiple' })
      const { results } = await asAgent(() =>
        bridge.act([{ id: member?.id, action: 'choose', value: ['chat', 'inapp'] }]),
      )
      expect(results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: ['email'], to: ['inapp', 'chat'] } },
      })
      expect(onChange).toHaveBeenLastCalledWith(['inapp', 'chat'])
      expect(box('Email').getAttribute('aria-checked')).toBe('false')
      expect(box('Chat').getAttribute('aria-checked')).toBe('true')
    } finally {
      bridge.dispose()
    }
  })
})
