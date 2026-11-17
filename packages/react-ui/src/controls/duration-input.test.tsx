import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { durationInputLaw, type DurationInputLawProps } from '@polymorph/conformance/duration-input'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { DurationInput, type DurationInputProps } from './DurationInput'
import { FormField } from './FormField'
import { Input } from './Input'
import { tokenColor } from './token-probe'

/**
 * DurationInput in a real browser: the recipe against Input's container, the names FormField
 * gives the counts, and the tints. What the field reports and draws, and when, is the law's
 * (`@polymorph/conformance/duration-input`), which this file calls for React and every
 * generated shell's test calls for its own. The arithmetic is the engine's, tested beside it.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<DurationInputProps>(true)
  })
})

describe('DurationInput — the field', () => {
  const shared = (element: Element) => {
    const style = getComputedStyle(element)
    return {
      height: style.height,
      background: style.backgroundColor,
      border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
      radius: style.borderTopLeftRadius,
      paddingInline: style.paddingLeft,
      // The control seat shadow, used by the whole field family.
      shadow: style.boxShadow,
    }
  }

  for (const size of ['sm', 'md', 'lg'] as const) {
    it(`is Input's container at ${size}`, () => {
      expect(shared(mount(<DurationInput size={size} aria-label="Lifetime" />))).toEqual(
        shared(mount(<Input size={size} aria-label="Subject" />)),
      )
    })
  }

  it('is a named group of spinbuttons, with nothing to open', () => {
    const field = mount(<DurationInput locale="en-US" aria-label="Inactivity lifetime" />)
    expect(field.getAttribute('role')).toBe('group')
    expect(field).toHaveAccessibleName('Inactivity lifetime')
    expect(field.querySelectorAll('[role="spinbutton"]')).toHaveLength(3)
    expect(field.querySelector('button')).toBeNull()
    expect(field.querySelector('svg')).toBeNull()
  })

  it('names each count by the label and its unit, and describes it with the field', () => {
    render(
      <FormField label="Inactivity lifetime" description="Between 15 minutes and 7 days.">
        <DurationInput locale="en-US" defaultValue={604_800} />
      </FormField>,
    )
    const field = screen.getByRole('group', { name: 'Inactivity lifetime' })
    const hours = screen.getByRole('spinbutton', { name: 'Inactivity lifetime hour' })
    expect(hours).toHaveAccessibleDescription('Between 15 minutes and 7 days.')
    expect(field).toHaveAccessibleDescription('Between 15 minutes and 7 days.')
  })

  it('draws the unit words in the muted role and the counts in the primary one', () => {
    const field = mount(
      <DurationInput locale="en-US" defaultValue={604_800} aria-label="Inactivity lifetime" />,
    )
    const word = field.querySelector('[aria-hidden="true"]') as HTMLElement
    const days = field.querySelector('[data-segment="days"]') as HTMLElement
    expect(getComputedStyle(word).color).toBe(tokenColor('--pm-text-muted'))
    expect(getComputedStyle(days).color).toBe(tokenColor('--pm-text-primary'))
  })

  it('shows its placeholders while empty, in the muted role', () => {
    const field = mount(<DurationInput locale="en-US" aria-label="Inactivity lifetime" />)
    for (const count of field.querySelectorAll<HTMLElement>('[data-segment]')) {
      expect(count.dataset['placeholder']).toBe('')
      expect(getComputedStyle(count).color).toBe(tokenColor('--pm-text-muted'))
    }
  })

  it('tints the focused count without selecting it', async () => {
    const field = mount(
      <DurationInput locale="en-US" defaultValue={604_800} aria-label="Inactivity lifetime" />,
    )
    const hours = field.querySelector('[data-segment="hours"]') as HTMLElement
    hours.focus()
    await vi.waitFor(() => {
      expect(getComputedStyle(hours).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    })
  })

  it('writes the units in the locale it is given', () => {
    const field = mount(
      <DurationInput locale="de-DE" defaultValue={5_400} aria-label="Inaktivitätsdauer" />,
    )
    expect(field.textContent).toBe('0Tg.1Std.30Min.')
  })

  it('renders on a server with the same counts', () => {
    const html = renderToString(
      <DurationInput locale="en-US" defaultValue={604_800} aria-label="Inactivity lifetime" />,
    )
    expect(html).toContain('aria-valuetext="7 days"')
    expect(html).toContain('data-member="duration-input"')
  })
})

/**
 * What the field reports and draws, which the law states once for every web shell. The field
 * is mounted in a component that holds its props, as the application around it does.
 */
durationInputLaw({
  shell: 'React',
  mount({ props, onChange }) {
    let change: (next: Partial<DurationInputLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <DurationInput
          locale="en-US"
          aria-label="Inactivity lifetime"
          onChange={onChange}
          {...held}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

/**
 * An agent sets the seconds through the bridge, as the spec's `agent` fence declares
 * (`design/components/duration-input.md`, Agent). The member commits them, so they reach the
 * field whether or not the caller controls it, and `onChange` reports them.
 */
describe('an agent', () => {
  it('sets the seconds of an uncontrolled and a controlled field, and clears them', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<number | null>(900)
        return (
          <DurationInput
            aria-label="Held"
            value={value}
            onChange={(next) => {
              held(next)
              setValue(next)
            }}
          />
        )
      }
      render(
        <>
          <DurationInput aria-label="Free" onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one?.state).toEqual({ value: null, disabled: false, invalid: false, readonly: false })
      const set = await bridge.act([{ id: one?.id, action: 'set', value: 5_400 }])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: null, to: 5_400 } },
      })
      expect(free).toHaveBeenLastCalledWith(5_400)
      const changed = await bridge.act([{ id: two?.id, action: 'set', value: 86_400 }])
      expect(changed.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 900, to: 86_400 } },
      })
      expect(held).toHaveBeenLastCalledWith(86_400)
      const cleared = await bridge.act([{ id: one?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: null } } })
      expect(free).toHaveBeenLastCalledWith(null)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses seconds the counts cannot draw, seconds outside the bounds, and a read-only field', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <>
          <DurationInput aria-label="Lifetime" min={900} max={604_800} onChange={onChange} />
          <DurationInput aria-label="Fixed" readOnly defaultValue={900} onChange={onChange} />
        </>,
      )
      const [bounded, fixed] = bridge.snapshot().members
      for (const [id, seconds, reason] of [
        [bounded?.id, 930, 'not a whole number'],
        [bounded?.id, 600, 'outside'],
        [fixed?.id, 1_800, 'read-only'],
      ] as const) {
        const { results } = await bridge.act([{ id, action: 'set', value: seconds }])
        expect(results[0], String(seconds)).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(reason) },
        })
      }
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
