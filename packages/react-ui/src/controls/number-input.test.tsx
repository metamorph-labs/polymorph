import { render } from '@testing-library/react'
import { useState } from 'react'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Input } from './Input'
import { NumberInput, type NumberInputProps } from './NumberInput'
import { tokenLength } from './token-probe'

/**
 * NumberInput in a real browser. These tests cover the commit boundary (unparsed text is
 * never reported), the steppers' substrate behaviour (limits, exclusion from the Tab
 * order, ignoring the wheel), and the recipe comparison against Input that
 * `number-input.md` cites instead of restating.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const input = (field: HTMLElement) =>
  field.querySelector('input:not([type="hidden"])') as HTMLInputElement

const steppers = (field: HTMLElement) =>
  [...field.querySelectorAll('button')] as HTMLButtonElement[]

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<NumberInputProps>(true)
  })
})

describe('NumberInput — the field', () => {
  const shared = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      paddingInline: style.paddingLeft,

      // The control seat shadow, used by the whole field family. Compared here so it
      // cannot drift.
      shadow: style.boxShadow,
    }
  }

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`is Input's container at ${size}`, () => {
      expect(shared(mount(<NumberInput size={size} aria-label="Agents" />))).toEqual(
        shared(mount(<Input size={size} aria-label="Subject" />)),
      )
    })
  }

  it('is a text field with a number-field role description, not a spinbutton', () => {
    // Following the substrate: a focusable spinbutton misbehaves under VoiceOver, so
    // the field uses a role description instead.
    const field = mount(<NumberInput defaultValue={5} aria-label="Agents" />)
    const inner = input(field)
    expect(inner.getAttribute('role')).toBeNull()
    expect(inner.getAttribute('aria-roledescription')).toBeTruthy()
    expect(inner.getAttribute('inputmode')).toBeTruthy()
    expect(inner.getAttribute('autocorrect')).toBe('off')
    expect(inner.getAttribute('spellcheck')).toBe('false')
  })

  it('formats currency for display and posts the plain number', () => {
    const { container } = render(
      <form>
        <NumberInput
          name="price"
          defaultValue={29}
          format={{ style: 'currency', currency: 'USD' }}
          aria-label="Price per seat"
        />
      </form>,
    )
    const form = container.firstElementChild as HTMLFormElement
    expect((form.querySelector('input:not([type="hidden"])') as HTMLInputElement).value).toBe(
      '$29.00',
    )
    // "$29.00" never reaches a server that expected 29.
    expect(new FormData(form).get('price')).toBe('29')
  })

  it('uses Intl percent semantics, where the value is the ratio', () => {
    const field = mount(
      <NumberInput defaultValue={0.9} format={{ style: 'percent' }} aria-label="CSAT target" />,
    )
    expect(input(field).value).toBe('90%')
  })

  it('renders no steppers under readOnly', () => {
    const field = mount(<NumberInput readOnly defaultValue={5} aria-label="Agents" />)
    expect(steppers(field)).toHaveLength(0)
    expect(input(field).readOnly).toBe(true)
  })

  it('keeps its frame and disables the steppers when the field is disabled', () => {
    const field = mount(<NumberInput disabled defaultValue={5} aria-label="Agents" />)
    const pair = steppers(field)
    expect(pair).toHaveLength(2)
    expect(pair.every((button) => button.disabled)).toBe(true)
  })
})

describe('NumberInput — the commit boundary', () => {
  it('reports committed numbers on blur, never unparsed text', async () => {
    const onChange = vi.fn()
    const field = mount(<NumberInput onChange={onChange} aria-label="Agents" />)
    const inner = input(field)

    await userEvent.click(inner)
    await userEvent.keyboard('1234.5')
    // Nothing is reported while typing.
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.keyboard('{Tab}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(1234.5))
  })

  it('clamps a typed value to the limits at commit', async () => {
    const onChange = vi.fn()
    const field = mount(<NumberInput max={10} onChange={onChange} aria-label="Agents" />)
    await userEvent.click(input(field))
    await userEvent.keyboard('99{Tab}')

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(10))
    expect(input(field).value).toBe('10')
  })

  it('restores the last committed value when the text cannot parse', async () => {
    const onChange = vi.fn()
    const field = mount(<NumberInput defaultValue={5} onChange={onChange} aria-label="Agents" />)
    const inner = input(field)

    await userEvent.tripleClick(inner)
    await userEvent.keyboard('not a number{Tab}')

    await vi.waitFor(() => expect(inner.value).toBe('5'))
    // NaN is never reported.
    for (const call of onChange.mock.calls) expect(Number.isNaN(call[0])).toBe(false)
  })

  it('fires onBlur after the commit settles, so touched-validation reads the committed number', async () => {
    const order: string[] = []
    const field = mount(
      <NumberInput
        onChange={(next) => order.push(`change:${next}`)}
        onBlur={() => order.push('blur')}
        aria-label="Agents"
      />,
    )
    await userEvent.click(input(field))
    await userEvent.keyboard('7{Tab}')

    await vi.waitFor(() => expect(order).toContain('blur'))
    expect(order.indexOf('change:7')).toBeLessThan(order.indexOf('blur'))
  })
})

describe('NumberInput — stepping', () => {
  it('steps from the keyboard and commits as it goes', async () => {
    const onChange = vi.fn()
    const field = mount(
      <NumberInput defaultValue={5} step={1} onChange={onChange} aria-label="Agents" />,
    )
    input(field).focus()
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(6))
  })

  it('steps percent fields by 0.01 unless step says otherwise', async () => {
    const onChange = vi.fn()
    const field = mount(
      <NumberInput
        defaultValue={0.9}
        format={{ style: 'percent' }}
        onChange={onChange}
        aria-label="CSAT target"
      />,
    )
    input(field).focus()
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(0.91))
  })

  it('moves to the limits on Home and End', async () => {
    const onChange = vi.fn()
    const field = mount(
      <NumberInput defaultValue={5} min={1} max={10} onChange={onChange} aria-label="Agents" />,
    )
    input(field).focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(10))
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(1))
  })

  it('names its buttons, wires them to the input, and keeps them out of the Tab order', () => {
    const field = mount(<NumberInput defaultValue={5} aria-label="Agents" />)
    const [down, up] = steppers(field)
    expect(down?.getAttribute('aria-label')).toContain('Decrease')
    expect(up?.getAttribute('aria-label')).toContain('Increase')
    expect(down?.getAttribute('aria-controls')).toBe(input(field).id)
    // Arrow keys on the input already step, so two extra tab stops per field would add
    // keyboard work with no new function.
    expect(down?.tabIndex).toBe(-1)
    expect(up?.tabIndex).toBe(-1)
  })

  it('orders the buttons down then up, and disables the one at its limit', async () => {
    const onChange = vi.fn()
    const field = mount(
      <NumberInput defaultValue={1} min={1} onChange={onChange} aria-label="Agents" />,
    )
    const [down, up] = steppers(field) as [HTMLButtonElement, HTMLButtonElement]
    // The button that cannot move disables itself; the other keeps working.
    expect(down.disabled).toBe(true)
    expect(up.disabled).toBe(false)

    await userEvent.click(up)
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(2))
    expect(down.disabled).toBe(false)
  })

  it('ignores the wheel, because scrolling past the field is not an edit', async () => {
    const onChange = vi.fn()
    const field = mount(<NumberInput defaultValue={5} onChange={onChange} aria-label="Agents" />)
    const inner = input(field)
    inner.focus()

    inner.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onChange).not.toHaveBeenCalled()
    expect(inner.value).toBe('5')
  })
})

describe('the focus-zoom floor, below 30rem', () => {
  const WIDE = 1280

  afterEach(async () => {
    await page.viewport(WIDE, 800)
  })

  it('sets the input to the text-entry floor’s size and line height, and nothing else', async () => {
    await page.viewport(420, 800)
    const field = mount(<NumberInput size="sm" defaultValue={5} aria-label="Agents" />)
    const inner = input(field)

    await vi.waitFor(() => {
      const style = getComputedStyle(inner)
      expect(style.fontSize).toBe(tokenLength('--pm-text-entry-size'))
    })
    // The floor applies only to the input. The container's metrics do not change.
    expect(getComputedStyle(field).height).toBe(tokenLength('--pm-control-height-sm'))
  })
})

/**
 * An agent sets and clears a NumberInput as a typed commit does, as its spec's `agent` fence
 * declares (`design/components/number-input.md`, Agent): the number is held within `min` and
 * `max`, and `onChange` reports it whether or not the caller controls the value.
 */
describe('an agent', () => {
  it('sets and clears an uncontrolled NumberInput, held within its limits', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      const field = mount(
        <NumberInput
          defaultValue={5}
          min={1}
          max={10}
          onChange={onChange}
          format={{ style: 'currency', currency: 'USD' }}
          aria-label="Seats"
        />,
      )
      const [member] = bridge.snapshot().members
      expect(member).toMatchObject({ member: 'NumberInput', name: 'Seats', state: { value: 5 } })

      const { results } = await bridge.act([
        { id: member?.id, action: 'set', value: 7 },
        { id: member?.id, action: 'set', value: 40 },
        { id: member?.id, action: 'clear' },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { value: { from: 5, to: 7 } } },
        { ok: true, changed: { value: { from: 7, to: 10 } } },
        { ok: true, changed: { value: { from: 10, to: null } } },
      ])
      expect(onChange.mock.calls).toEqual([[7], [10], [null]])
      expect(input(field).value).toBe('')
    } finally {
      bridge.dispose()
    }
  })

  it('sets a controlled NumberInput through the caller', async () => {
    const bridge = createAgentBridge()
    try {
      function Held() {
        const [value, setValue] = useState<number | null>(2)
        return <NumberInput value={value} onChange={setValue} aria-label="Held" />
      }
      const kept = vi.fn()
      render(
        <>
          <Held />
          <NumberInput value={3} onChange={kept} aria-label="Kept" />
        </>,
      )
      const [held, fixed] = bridge.snapshot().members
      const moved = await bridge.act([{ id: held?.id, action: 'set', value: 12.5 }])
      expect(moved.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 2, to: 12.5 } },
      })
      // A caller that keeps its value shows it, as after a person's commit.
      const stayed = await bridge.act([{ id: fixed?.id, action: 'set', value: 9 }])
      expect(stayed.results[0]).toEqual({ ok: true, id: fixed?.id, changed: {} })
      expect(kept).toHaveBeenCalledWith(9)
    } finally {
      bridge.dispose()
    }
  })

  it('is refused by a read-only NumberInput, which keeps its value', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      mount(<NumberInput readOnly defaultValue={5} onChange={onChange} aria-label="Fixed" />)
      const [member] = bridge.snapshot().members
      for (const step of [{ action: 'set', value: 6 }, { action: 'clear' }]) {
        const { results } = await bridge.act([{ id: member?.id, ...step }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining('read-only') },
        })
      }
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
