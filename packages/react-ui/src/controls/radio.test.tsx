import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { RadioGroup, type RadioGroupProps } from './Radio'
import { tokenColor } from './token-probe'

/**
 * RadioGroup (`design/components/radio.md`).
 *
 * These tests cover two things. The first is the keyboard behaviour Radix supplies,
 * which would otherwise be untested. The second is labelling: `<label for>` cannot
 * target a `role="radiogroup"` div, and that failure is silent, so it needs a test.
 */

beforeAll(installTestTheme)

/*
 * RTL unmounts between tests but does not reset focus. A `Tab` from a detached node
 * goes nowhere. That looks like the arrow keys failing, but the cause is the previous
 * test still holding focus.
 */
beforeEach(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'team', label: 'Team' },
  { value: 'enterprise', label: 'Enterprise' },
]

function mount(props: Partial<RadioGroupProps> = {}) {
  const { container } = render(<RadioGroup options={PLANS} aria-label="Plan" {...props} />)
  return container.firstElementChild as HTMLElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RadioGroupProps>(true)
  })

  it('offers no way to say "nothing selected"', () => {
    // A clearable single choice is Select with an `emptyOption`. Two components that
    // both mean "none" would be two ways to express one state.
    // @ts-expect-error — `null` is not a value a radio group can hold.
    const bad: RadioGroupProps = { options: PLANS, value: null }
    expect(bad.options).toHaveLength(3)
  })
})

describe('choosing', () => {
  it('reports the value that was chosen', async () => {
    const onChange = vi.fn()
    mount({ onChange })
    await userEvent.click(screen.getByRole('radio', { name: 'Team' }))
    expect(onChange).toHaveBeenCalledWith('team')
  })

  /**
   * Roving focus: one tab stop for the group, and arrow keys to move within it. This is
   * what makes a radio group different from three circles with separate tab stops.
   *
   * Radix moves the focus. The selection that follows it comes from `radio-arrows.ts`.
   * Radix selects on arrow focus only while an arrow key is still down, so a tap
   * released before the deferred focus move would not select. The next test uses
   * exactly that tap.
   */
  it('moves between options with the arrow keys, on one tab stop', async () => {
    mount({ defaultValue: 'starter' })

    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Starter' }))

    await userEvent.keyboard('{ArrowDown}')
    // Radix defers the focus move, so the test waits for it.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Team' })),
    )
  })

  it('selects on the arrow even when the key is up before the focus has moved', async () => {
    const onChange = vi.fn()
    mount({ defaultValue: 'starter', onChange })
    const starter = screen.getByRole('radio', { name: 'Starter' })
    starter.focus()
    // A tap whose keyup arrives before Radix's deferred focus move, which is what a
    // busy main thread does to a real `{ArrowDown}`. Radix selects on focus only while
    // its arrow flag is set, and the document keyup has already cleared it. Dispatching
    // both events back to back makes the race certain, and the selection still happens.
    const arrow = { key: 'ArrowDown', bubbles: true }
    starter.dispatchEvent(new KeyboardEvent('keydown', arrow))
    starter.dispatchEvent(new KeyboardEvent('keyup', arrow))
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Team' })),
    )
    // Reported through Radix's change effect, so the test waits for it.
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('team'))
  })

  it('skips an option that cannot be picked', async () => {
    render(
      <RadioGroup
        aria-label="Plan"
        defaultValue="starter"
        options={[
          { value: 'starter', label: 'Starter' },
          { value: 'team', label: 'Team', disabled: true },
          { value: 'enterprise', label: 'Enterprise' },
        ]}
      />,
    )
    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}')

    // Past Team, not onto it. Focus on an option that cannot be picked would be a dead
    // end for the user. Radix defers the focus move, so the test waits for it.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Enterprise' })),
    )
  })

  it('disables every option when the group is disabled', () => {
    // Checked by attribute rather than by clicking. A disabled control is not
    // clickable, so clicking would only show that the driver waits.
    mount({ disabled: true })
    for (const option of screen.getAllByRole('radio')) {
      expect(option).toHaveProperty('disabled', true)
      expect(option.dataset['disabled']).toBe('')
    }
  })
})

describe('labelling', () => {
  it('is named by association inside a FormField, not by `for`', () => {
    // `<label for>` binds only to a labelable element, and a radiogroup div is not one.
    // Without association the label renders and looks right but names nothing.
    render(
      <FormField label="Which plan?">
        <RadioGroup options={PLANS} />
      </FormField>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Which plan?' })).toBeTruthy()
  })

  it('carries the field description and error to the group itself', () => {
    render(
      <FormField label="Which plan?" error="Pick a plan to continue.">
        <RadioGroup options={PLANS} />
      </FormField>,
    )
    const group = screen.getByRole('radiogroup', { description: 'Pick a plan to continue.' })
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.dataset['invalid']).toBe('')
  })

  it('renders one row label per option, and they are real labels', async () => {
    const onChange = vi.fn()
    mount({ onChange })
    // Clicking the text, not the circle, because the whole row is the target.
    await userEvent.click(screen.getByText('Enterprise'))
    expect(onChange).toHaveBeenCalledWith('enterprise')
  })
})

describe('the ring and the dot', () => {
  it('marks the choice with a dot inside a ring, not a filled disc', () => {
    // A filled circle looks like a checkbox at a glance. The dot signals "one of
    // several".
    const root = mount({ defaultValue: 'team' })
    const circle = screen.getByRole('radio', { name: 'Team' })
    expect(getComputedStyle(circle).backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    expect(getComputedStyle(circle).borderTopColor).toBe(tokenColor('--pm-accent-bg'))

    const dot = circle.firstElementChild as HTMLElement
    expect(getComputedStyle(dot).backgroundColor).toBe(tokenColor('--pm-accent-bg'))

    // Scoped to the radios. Radix also copies `data-state` onto the indicator, so an
    // unscoped count would find two per selection.
    expect(root.querySelectorAll('[role="radio"][data-state="checked"]')).toHaveLength(1)
  })

  it('is round at every size', () => {
    mount()
    const circle = screen.getByRole('radio', { name: 'Starter' })
    expect(getComputedStyle(circle).borderRadius).toBe(getComputedStyle(circle).borderTopLeftRadius)
  })

  it('lays out the group along its orientation', () => {
    expect(getComputedStyle(mount()).flexDirection).toBe('column')
    expect(getComputedStyle(mount({ orientation: 'horizontal' })).flexDirection).toBe('row')
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

  const PLANS = [
    { value: 'starter', label: 'Starter' },
    { value: 'team', label: 'Team' },
    { value: 'enterprise', label: 'Enterprise', disabled: true },
  ]

  /** The application around a controlled RadioGroup: it holds `value` and sets it from the handler. */
  function Held({ onChange }: { onChange: (next: string) => void }) {
    const [value, setValue] = useState('starter')
    return (
      <RadioGroup
        aria-label="Billing"
        options={PLANS}
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    )
  }

  it('chooses in an uncontrolled and a controlled group, and refuses a disabled option', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      render(<RadioGroup aria-label="Plan" options={PLANS} onChange={free} />)
      render(<Held onChange={held} />)
      const [plan, billing] = bridge.snapshot().members
      expect(plan).toMatchObject({
        member: 'RadioGroup',
        name: 'Plan',
        state: {
          value: null,
          options: [
            { id: 'starter', label: 'Starter' },
            { id: 'team', label: 'Team' },
            { id: 'enterprise', label: 'Enterprise', disabled: true },
          ],
          disabled: false,
          invalid: false,
        },
        actions: [{ name: 'choose', argument: 'id' }],
      })

      // Uncontrolled: the member holds the value, and the radio shows it.
      const chosen = await asAgent(() =>
        bridge.act([{ id: plan?.id, action: 'choose', value: 'team' }]),
      )
      expect(chosen.results[0]).toEqual({
        ok: true,
        id: plan?.id,
        changed: { value: { from: null, to: 'team' } },
      })
      const group = screen.getByRole('radiogroup', { name: 'Plan' })
      expect(within(group).getByRole('radio', { name: 'Team' }).getAttribute('aria-checked')).toBe(
        'true',
      )
      expect(free).toHaveBeenLastCalledWith('team')

      // Controlled: the action calls the handler, and the application's value is what renders.
      const controlled = await asAgent(() =>
        bridge.act([{ id: billing?.id, action: 'choose', value: 'team' }]),
      )
      expect(controlled.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'starter', to: 'team' } },
      })
      expect(held).toHaveBeenLastCalledWith('team')

      const refused = await bridge.act([{ id: plan?.id, action: 'choose', value: 'enterprise' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
      expect(free).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })
})
