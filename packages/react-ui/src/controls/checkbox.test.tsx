import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Checkbox, type CheckboxProps, type CheckedState } from './Checkbox'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Checkbox. The main checks are about the *row*. Clicking the label toggles the control, the row
 * is the hit target when there is one, and the box keeps a lawful hit area when there is not,
 * because a Table selection cell must not be a 16px target.
 */

beforeAll(installTestTheme)

/** RTL's own container. It is attached to the body for the cascade, and RTL cleans it up. */
function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const control = () => screen.getByRole('checkbox')

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CheckboxProps>(true)
  })
})

describe('semantics', () => {
  it('is a real checkbox with a real label', () => {
    mount(<Checkbox label="Email me about replies" />)
    expect(screen.getByRole('checkbox', { name: 'Email me about replies' })).toBeTruthy()
    expect(control().getAttribute('aria-checked')).toBe('false')
  })

  it('takes its name from aria-label when the context supplies the label', () => {
    mount(<Checkbox aria-label="Select row" />)
    expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeTruthy()
  })

  it('mirrors invalid to ARIA and to the box', () => {
    mount(<Checkbox invalid label="Accept the terms" />)
    expect(control().getAttribute('aria-invalid')).toBe('true')
    expect(control().dataset['invalid']).toBe('')
  })
})

describe('toggling', () => {
  it('toggles when the label text is clicked, not just the box', async () => {
    const onCheckedChange = vi.fn()
    mount(<Checkbox label="Email me about replies" onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByText('Email me about replies'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(control().getAttribute('aria-checked')).toBe('true')
  })

  it('toggles once per click on the box, with no second toggle from the row', async () => {
    const onCheckedChange = vi.fn()
    mount(<Checkbox label="Email me about replies" onCheckedChange={onCheckedChange} />)
    await userEvent.click(control())
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(control().getAttribute('aria-checked')).toBe('true')
  })

  it('toggles on Space, the standard checkbox key', async () => {
    mount(<Checkbox label="Email me about replies" />)
    control().focus()
    await userEvent.keyboard(' ')
    expect(control().getAttribute('aria-checked')).toBe('true')
  })

  it('does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn()
    const row = mount(<Checkbox disabled label="Email me" onCheckedChange={onCheckedChange} />)
    row.click()
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control().dataset['disabled']).toBe('')
  })
})

describe('the three states', () => {
  it('shows the tick when checked and the dash when indeterminate', () => {
    mount(<Checkbox defaultChecked label="Checked" />)
    expect(control().querySelector('svg')?.dataset['icon']).toBe('confirm')

    render(<Checkbox checked="indeterminate" label="Some" />)
    const boxes = screen.getAllByRole('checkbox')
    const partial = boxes[boxes.length - 1] as HTMLElement
    expect(partial.dataset['state']).toBe('indeterminate')
    expect(partial.querySelector('svg')?.dataset['icon']).toBe('indeterminate')
    expect(partial.getAttribute('aria-checked')).toBe('mixed')
  })

  it('shows nothing at all when unchecked', () => {
    mount(<Checkbox label="Unchecked" />)
    expect(control().querySelector('svg')).toBeNull()
  })

  it('mirrors the state onto the row root', () => {
    expect(mount(<Checkbox label="x" />).dataset['state']).toBe('unchecked')
    expect(mount(<Checkbox defaultChecked label="x" />).dataset['state']).toBe('checked')
    expect(mount(<Checkbox checked="indeterminate" label="x" />).dataset['state']).toBe(
      'indeterminate',
    )
  })
})

describe('recipe', () => {
  it('fills from the accent role when checked, and from the surface when not', () => {
    mount(<Checkbox label="Unchecked" />)
    expect(getComputedStyle(control()).backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    expect(getComputedStyle(control()).borderTopColor).toBe(tokenColor('--pm-border-field'))

    render(<Checkbox defaultChecked label="Checked" />)
    const boxes = screen.getAllByRole('checkbox')
    const checked = boxes[boxes.length - 1] as HTMLElement
    expect(getComputedStyle(checked).backgroundColor).toBe(tokenColor('--pm-accent-bg'))
  })

  it('borders in danger when invalid, whatever the check state', () => {
    mount(<Checkbox invalid defaultChecked label="Accept" />)
    expect(getComputedStyle(control()).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('dims the label with the control', () => {
    mount(<Checkbox disabled label="Email me" />)
    const label = screen.getByText('Email me')
    expect(getComputedStyle(label).color).toBe(tokenColor('--pm-text-disabled'))
  })

  it('draws the ring on the box, not on the row', () => {
    const row = mount(<Checkbox label="Email me" />)
    control().focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(control()).outlineStyle).toBe('solid')
    expect(getComputedStyle(row).outlineStyle).toBe('none')
  })
})

describe('required', () => {
  it('mirrors the injected aria-required, and the row shows the marker', () => {
    // A row-labelled field has no field-level label row, so FormField has nowhere to put the ` *`.
    // The control renders it instead.
    const row = mount(<Checkbox aria-required label="Accept the terms" />)
    expect(control().getAttribute('aria-required')).toBe('true')
    expect(row.dataset['required']).toBe('')

    const marker = getComputedStyle(screen.getByText('Accept the terms'), '::after')
    expect(marker.content).toContain('*')
    expect(marker.color).toBe(tokenColor('--pm-danger-text'))
  })

  it('shows no marker when the field is not required', () => {
    mount(<Checkbox label="Accept the terms" />)
    expect(getComputedStyle(screen.getByText('Accept the terms'), '::after').content).toBe('none')
  })
})

describe('the target floor', () => {
  it('makes the row the hit target when there is a label', () => {
    const row = mount(<Checkbox label="Email me about replies" />)
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      Number.parseFloat(tokenLength('--pm-control-height-sm')),
    )
  })

  it('keeps a lawful hit area on a bare box without affecting layout', () => {
    // A Table selection cell has no label row to enlarge. The pseudo-element enlarges the hit
    // area instead, so a dense table keeps its row height.
    const box = mount(<Checkbox aria-label="Select row" />)
    const laidOut = box.getBoundingClientRect()
    const hit = getComputedStyle(box, '::before')
    const grown = laidOut.width - 2 * Number.parseFloat(hit.insetInlineStart || '0')

    expect(laidOut.width).toBeLessThan(24)
    expect(grown).toBeGreaterThanOrEqual(24)
  })
})

describe('a form reset', () => {
  it('puts the box and the row back to their first value', async () => {
    const { container } = render(
      <form>
        <Checkbox name="replies" label="Email me about replies" />
      </form>,
    )
    const row = container.querySelector('label') as HTMLElement
    await userEvent.click(control())
    expect(row.dataset['state']).toBe('checked')
    ;(container.querySelector('form') as HTMLFormElement).reset()
    await vi.waitFor(() => expect(row.dataset['state']).toBe('unchecked'))
    expect(control().getAttribute('aria-checked')).toBe('false')
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

  /** The application around a controlled Checkbox: it holds `checked` and sets it from the handler. */
  function Held({ onCheckedChange }: { onCheckedChange: (next: CheckedState) => void }) {
    const [checked, setChecked] = useState<CheckedState>(false)
    return (
      <>
        <Checkbox
          label="Urgent"
          checked={checked}
          onCheckedChange={(next) => {
            setChecked(next)
            onCheckedChange(next)
          }}
        />
        <button type="button" onClick={() => setChecked(true)}>
          Mark urgent
        </button>
      </>
    )
  }

  it('reads, checks and unchecks an uncontrolled and a controlled Checkbox', async () => {
    const bridge = createAgentBridge()
    try {
      const acting: boolean[] = []
      const free = vi.fn(() => acting.push(bridge.acting))
      const held = vi.fn(() => acting.push(bridge.acting))
      render(<Checkbox label="Email me about replies" onCheckedChange={free} />)
      render(<Held onCheckedChange={held} />)
      const box = (name: string) => screen.getByRole('checkbox', { name })

      const [email, urgent] = bridge.snapshot().members
      expect(bridge.snapshot().members).toEqual([
        {
          id: email?.id,
          member: 'Checkbox',
          name: 'Email me about replies',
          state: { checked: false, disabled: false },
          actions: [{ name: 'check' }, { name: 'uncheck' }],
        },
        {
          id: urgent?.id,
          member: 'Checkbox',
          name: 'Urgent',
          state: { checked: false, disabled: false },
          actions: [{ name: 'check' }, { name: 'uncheck' }],
        },
      ])

      // Uncontrolled: the member holds the value.
      const checked = await asAgent(() =>
        bridge.act([{ target: { name: 'Email me about replies' }, action: 'check' }]),
      )
      expect(checked.results).toEqual([
        { ok: true, id: email?.id, changed: { checked: { from: false, to: true } } },
      ])
      expect(box('Email me about replies').getAttribute('aria-checked')).toBe('true')
      expect(free).toHaveBeenLastCalledWith(true)
      const unchecked = await asAgent(() => bridge.act([{ id: email?.id, action: 'uncheck' }]))
      expect(unchecked.results[0]).toEqual({
        ok: true,
        id: email?.id,
        changed: { checked: { from: true, to: false } },
      })
      expect(box('Email me about replies').getAttribute('aria-checked')).toBe('false')
      expect(free).toHaveBeenLastCalledWith(false)

      // Controlled: the action calls the handler, and the application's value is what renders.
      const controlled = await asAgent(() => bridge.act([{ id: urgent?.id, action: 'check' }]))
      expect(controlled.results[0]).toEqual({
        ok: true,
        id: urgent?.id,
        changed: { checked: { from: false, to: true } },
      })
      expect(box('Urgent').getAttribute('aria-checked')).toBe('true')
      expect(held).toHaveBeenLastCalledWith(true)
      await asAgent(() => bridge.act([{ id: urgent?.id, action: 'uncheck' }]))
      expect(box('Urgent').getAttribute('aria-checked')).toBe('false')

      // The application sets the value: the handle reads it, not the value at mount.
      await userEvent.click(screen.getByRole('button', { name: 'Mark urgent' }))
      expect(bridge.snapshot().members[1]?.state).toEqual({ checked: true, disabled: false })
      const after = await asAgent(() => bridge.act([{ id: urgent?.id, action: 'uncheck' }]))
      expect(after.results[0]).toEqual({
        ok: true,
        id: urgent?.id,
        changed: { checked: { from: true, to: false } },
      })

      // Every handler call came from an agent's step.
      expect(acting).toEqual([true, true, true, true, true])
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a disabled Checkbox and lists no action on it', async () => {
    const bridge = createAgentBridge()
    try {
      const onCheckedChange = vi.fn()
      render(<Checkbox disabled label="Email me" onCheckedChange={onCheckedChange} />)
      const [member] = bridge.snapshot().members
      expect(member?.state).toEqual({ checked: false, disabled: true })
      expect(member?.actions).toEqual([])
      const { results } = await bridge.act([{ id: member?.id, action: 'check' }])
      expect(results[0]).toEqual({
        ok: false,
        id: member?.id,
        error: { code: 'disabled', message: expect.any(String) },
      })
      expect(onCheckedChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })

  it('reads indeterminate as mixed', () => {
    const bridge = createAgentBridge()
    try {
      render(<Checkbox checked="indeterminate" label="Select all" />)
      expect(bridge.snapshot().members[0]?.state['checked']).toBe('mixed')
    } finally {
      bridge.dispose()
    }
  })
})
