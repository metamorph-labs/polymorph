import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { CheckboxGroup, type CheckboxGroupOption, type CheckboxGroupProps } from './CheckboxGroup'
import { FormField } from './FormField'

/**
 * CheckboxGroup, in a real browser.
 *
 * The browser tests cover what makes this member differ from RadioGroup. Every box is its own tab
 * stop and the arrow keys deliberately do nothing. The value is reported in options order whatever
 * the click order, and the empty array is a lawful answer. They also cover the group wiring, which
 * is the reason the member exists.
 */

beforeAll(installTestTheme)

const OPTIONS: CheckboxGroupOption[] = [
  { value: 'replies', label: 'Replies' },
  { value: 'status', label: 'Status changes' },
  { value: 'assignments', label: 'Assignments' },
]

const group = () => screen.getByRole('group')
const boxes = () => screen.getAllByRole('checkbox') as HTMLButtonElement[]
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLButtonElement

function mount(overrides: Partial<CheckboxGroupProps> = {}) {
  return render(
    <CheckboxGroup options={OPTIONS} aria-label="Notify the reporter about" {...overrides} />,
  )
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CheckboxGroupProps>(true)
  })
})

describe('the answer', () => {
  it('reports checked values in options order, not click order', async () => {
    const onChange = vi.fn()
    mount({ onChange })

    await userEvent.click(box('Status changes'))
    expect(onChange).toHaveBeenLastCalledWith(['status'])

    await userEvent.click(box('Replies'))
    // Clicked second but reported first, because the value is a filter over the options.
    expect(onChange).toHaveBeenLastCalledWith(['replies', 'status'])
  })

  it('treats the empty array as an answer, not an error state', async () => {
    const onChange = vi.fn()
    mount({ onChange, defaultValue: ['replies'] })
    await userEvent.click(box('Replies'))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(box('Replies').getAttribute('data-state')).toBe('unchecked')
  })

  it('follows a controlled value without owning it', async () => {
    const onChange = vi.fn()
    mount({ value: ['status'], onChange })
    expect(box('Status changes').dataset['state']).toBe('checked')

    await userEvent.click(box('Replies'))
    expect(onChange).toHaveBeenLastCalledWith(['replies', 'status'])
    // Controlled, so nothing changes until the owner re-renders.
    expect(box('Replies').dataset['state']).toBe('unchecked')
  })
})

describe('Tab reaches every box and arrows do nothing', () => {
  it.skipIf(TAB_PASSES_BUTTONS)('gives every box its own tab stop', async () => {
    mount()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(box('Replies'))
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(box('Status changes'))
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(box('Assignments'))
  })

  it('leaves the arrow keys inert, so they neither move focus nor change the value', async () => {
    const onChange = vi.fn()
    mount({ onChange })
    box('Replies').focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(box('Replies'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('disabled, per option and whole', () => {
  it('disables every box with the group', () => {
    mount({ disabled: true })
    expect(group().hasAttribute('data-disabled')).toBe(true)
    for (const element of boxes()) expect(element.disabled).toBe(true)
  })

  it('disables a single option through its own flag', () => {
    mount({
      options: [
        { value: 'replies', label: 'Replies' },
        { value: 'status', label: 'Status changes', disabled: true },
      ],
    })
    expect(box('Replies').disabled).toBe(false)
    expect(box('Status changes').disabled).toBe(true)
  })
})

describe('per-option descriptions', () => {
  it('wires each description to its own box, not to the group', () => {
    mount({
      options: [
        { value: 'replies', label: 'Replies', description: 'Every public reply on the ticket.' },
        { value: 'status', label: 'Status changes' },
      ],
    })
    const described = box('Replies')
    const id = described.getAttribute('aria-describedby') as string
    expect(document.getElementById(id)?.textContent).toBe('Every public reply on the ticket.')
    expect(box('Status changes').hasAttribute('aria-describedby')).toBe(false)
    // The description is not part of the accessible name, because it is outside the row's label
    // on purpose.
    expect(described.textContent ?? '').not.toContain('Every public reply')
  })
})

describe('the group wiring', () => {
  it('is named by FormField’s label through aria-labelledby', () => {
    render(
      <FormField label="Notify the reporter about" description="Per ticket." required id="notify">
        <CheckboxGroup options={OPTIONS} />
      </FormField>,
    )
    const root = group()
    const labelId = root.getAttribute('aria-labelledby') as string
    expect(document.getElementById(labelId)?.textContent).toContain('Notify the reporter about')
    expect(root.getAttribute('aria-describedby')).toBe('notify-description')
    // Required is mirrored as a data attribute, not rendered as `aria-required`. ARIA allows that
    // property on radiogroup but not on group, so the marker in FormField's label row shows the
    // requirement.
    expect(root.hasAttribute('data-required')).toBe(true)
    expect(root.hasAttribute('aria-required')).toBe(false)
  })

  it('sets aria-invalid once on the group root and on no box', () => {
    render(
      <FormField label="Notify the reporter about" error="Pick at least one.">
        <CheckboxGroup options={OPTIONS} />
      </FormField>,
    )
    const root = group()
    expect(root.getAttribute('aria-invalid')).toBe('true')
    expect(root.hasAttribute('data-invalid')).toBe(true)
    expect(root.getAttribute('aria-describedby')).toMatch(/-error$/)
    for (const element of boxes()) {
      expect(element.hasAttribute('aria-invalid')).toBe(false)
    }
  })

  it('serializes natively: name on every box, value per option', () => {
    render(
      <form>
        <CheckboxGroup
          options={OPTIONS}
          name="notify"
          defaultValue={['replies']}
          aria-label="Notify the reporter about"
        />
      </form>,
    )
    for (const element of boxes()) expect(element.value).toBeTruthy()
    expect(boxes().map((element) => element.value)).toEqual(['replies', 'status', 'assignments'])
    // Radix bridges the button to the form with a real input per box.
    const bridged = [...document.querySelectorAll('input[name="notify"]')]
    expect(bridged.length).toBeGreaterThan(0)
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

  /** Assignments is checked and disabled: the plan includes it, and no one can turn it off. */
  const LOCKED: CheckboxGroupOption[] = [
    { value: 'replies', label: 'Replies' },
    { value: 'status', label: 'Status changes' },
    { value: 'assignments', label: 'Assignments', disabled: true },
  ]

  /** The application around a controlled group: it holds `value` and sets it from the handler. */
  function Held({ onChange }: { onChange: (next: string[]) => void }) {
    const [value, setValue] = useState<string[]>(['replies'])
    return (
      <CheckboxGroup
        aria-label="Email me about"
        options={LOCKED.slice(0, 2)}
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    )
  }

  it('sets the whole selection in options order, and keeps a disabled option as it was', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      render(
        <CheckboxGroup
          aria-label="Notify the reporter about"
          options={LOCKED}
          defaultValue={['assignments']}
          onChange={free}
        />,
      )
      render(<Held onChange={held} />)
      const [notify, email] = bridge.snapshot().members
      expect(notify).toMatchObject({
        member: 'CheckboxGroup',
        name: 'Notify the reporter about',
        state: { value: ['assignments'], disabled: false, invalid: false },
        actions: [{ name: 'choose', argument: 'ids' }],
      })

      // Uncontrolled: the order of the ids does not matter, and the disabled box stays checked.
      const chosen = await asAgent(() =>
        bridge.act([{ id: notify?.id, action: 'choose', value: ['status', 'replies'] }]),
      )
      expect(chosen.results[0]).toMatchObject({ ok: true })
      expect(free).toHaveBeenLastCalledWith(['replies', 'status', 'assignments'])
      expect(bridge.snapshot().members[0]?.state['value']).toEqual([
        'replies',
        'status',
        'assignments',
      ])
      // An empty list unchecks every enabled box, and the disabled one keeps its state.
      await asAgent(() => bridge.act([{ id: notify?.id, action: 'choose', value: [] }]))
      expect(free).toHaveBeenLastCalledWith(['assignments'])

      // Controlled: the action calls the handler, and the application's value is what renders.
      const controlled = await asAgent(() =>
        bridge.act([{ id: email?.id, action: 'choose', value: ['status'] }]),
      )
      expect(controlled.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: ['replies'], to: ['status'] } },
      })
      expect(held).toHaveBeenLastCalledWith(['status'])
      expect(screen.getByRole('checkbox', { name: 'Status changes', checked: true })).toBeTruthy()

      const refused = await bridge.act([
        { id: notify?.id, action: 'choose', value: ['assignments'] },
      ])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
    } finally {
      bridge.dispose()
    }
  })
})
