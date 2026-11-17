import { render } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { monthInputLaw, type MonthInputLawProps } from '@polymorph/conformance/month-input'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { Input } from './Input'
import { MonthInput, type MonthInputProps } from './MonthInput'
import { TimeInput } from './TimeInput'
import { tokenColor } from './token-probe'

/**
 * MonthInput in a real browser. What it reports and how its segments take keys is the law every
 * shell runs (`@polymorph/conformance/month-input`). The tests after it are the claims a browser
 * settles for the recipe, which every shell shares: the field is Input's container and
 * TimeInput's segments, and FormField names it.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<MonthInputProps>(true)
  })
})

monthInputLaw({
  shell: 'React',
  mount({ props, defaultValue, min, max, locale, readOnly, name, onChange }) {
    let change: (next: Partial<MonthInputLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return (
        <MonthInput
          aria-label="Expires"
          defaultValue={defaultValue}
          min={min}
          max={max}
          locale={locale}
          readOnly={readOnly}
          name={name}
          onChange={onChange}
          {...held}
        />
      )
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const segments = (field: HTMLElement) =>
  [...field.querySelectorAll('[data-segment]')] as HTMLElement[]

describe('MonthInput — the field', () => {
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
      expect(shared(mount(<MonthInput size={size} aria-label="Expires" />))).toEqual(
        shared(mount(<Input size={size} aria-label="Subject" />)),
      )
    })
  }

  it('draws its segments as TimeInput draws its own', () => {
    const month = segments(mount(<MonthInput defaultValue="2029-08" aria-label="Expires" />))[0]
    const hour = segments(mount(<TimeInput aria-label="Opens at" />))[0]
    const drawn = (element: HTMLElement | undefined) => {
      const style = getComputedStyle(element as HTMLElement)
      return {
        padding: style.paddingInlineStart,
        radius: style.borderTopLeftRadius,
        font: style.fontSize,
        numeric: style.fontVariantNumeric,
      }
    }
    expect(drawn(month)).toEqual(drawn(hour))
  })

  it('is a named group of spinbuttons, with nothing to open', () => {
    const field = mount(<MonthInput locale="en-US" aria-label="Expires" />)
    expect(field.getAttribute('role')).toBe('group')
    expect(field.getAttribute('aria-label')).toBe('Expires')
    expect(field.querySelectorAll('[role="spinbutton"]')).toHaveLength(2)
    // No trigger, no popup, no glyph: the segments are the whole control.
    expect(field.querySelector('button')).toBeNull()
    expect(field.querySelector('svg')).toBeNull()
  })

  it('shows its own patterns while empty, in the muted role', () => {
    const field = mount(<MonthInput locale="en-US" aria-label="Expires" />)
    expect(segments(field).map((segment) => segment.textContent)).toEqual(['mm', 'yyyy'])
    for (const segment of segments(field)) {
      expect(segment.dataset['placeholder']).toBe('')
      expect(getComputedStyle(segment).color).toBe(tokenColor('--pm-text-muted'))
    }
  })

  it('tints the focused segment without selecting it', async () => {
    const field = mount(<MonthInput defaultValue="2029-08" aria-label="Expires" />)
    const month = field.querySelector('[data-segment="month"]') as HTMLElement
    month.focus()
    await vi.waitFor(() => {
      expect(getComputedStyle(month).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    })
  })

  it('draws the danger border for a month outside its bounds', () => {
    const field = mount(<MonthInput min="2026-03" defaultValue="2026-02" aria-label="Expires" />)
    expect(field.dataset['invalid']).toBe('')
    expect(getComputedStyle(field).borderTopColor).toBe(tokenColor('--pm-danger-border'))
  })

  it('says each unfilled segment is empty in the words the host passes', () => {
    const field = mount(
      <MonthInput messages={{ empty: 'Leer' }} locale="de-DE" aria-label="Ablauf" />,
    )
    for (const segment of segments(field)) {
      expect(segment.getAttribute('aria-valuetext')).toBe('Leer')
    }
    expect(segments(field)[0]?.getAttribute('aria-label')).toBe('Monat')
  })
})

describe('MonthInput — in a FormField', () => {
  it('is named by the label and described by the help text, on the group and each segment', () => {
    const { container } = render(
      <FormField label="Expires" description="As printed on the card.">
        <MonthInput min="2020-01" />
      </FormField>,
    )
    const field = container.querySelector('[data-member="month-input"]') as HTMLElement
    const label = container.querySelector('label') as HTMLElement
    expect(field.getAttribute('aria-labelledby')).toBe(label.id)
    const description = field.getAttribute('aria-describedby')
    expect(description).not.toBeNull()
    expect(document.getElementById(description as string)?.textContent).toBe(
      'As printed on the card.',
    )
    for (const segment of segments(field)) {
      expect(segment.getAttribute('aria-labelledby')).toBe(`${label.id} ${segment.id}`)
      expect(segment.getAttribute('aria-describedby')).toBe(description)
    }
  })

  it('takes the field’s error as its invalid state', () => {
    const { container } = render(
      <FormField label="Expires" error="Enter the month the card expires.">
        <MonthInput />
      </FormField>,
    )
    const field = container.querySelector('[data-member="month-input"]') as HTMLElement
    expect(field.dataset['invalid']).toBe('')
  })

  it('submits the month with the form, beside the card number', () => {
    const { container } = render(
      <form>
        <FormField label="Card number">
          <Input name="number" autoComplete="cc-number" />
        </FormField>
        <FormField label="Expires">
          <MonthInput name="expiry" defaultValue="2029-08" />
        </FormField>
      </form>,
    )
    const data = new FormData(container.firstElementChild as HTMLFormElement)
    expect(data.get('expiry')).toBe('2029-08')
  })
})

/**
 * An agent sets the month through the bridge as `YYYY-MM`, as the spec's `agent` fence declares
 * (`design/components/month-input.md`, Agent). The member holds its draft, so the month reaches
 * the field whether or not the caller controls it, and `onChange` reports it.
 */
describe('an agent', () => {
  it('sets the month of an uncontrolled field and clears a controlled one', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [value, setValue] = useState<string | null>('2029-08')
        return (
          <MonthInput
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
          <MonthInput aria-label="Free" onChange={free} />
          <Held />
        </>,
      )
      const [one, two] = bridge.snapshot().members
      expect(one?.state).toEqual({ value: '', disabled: false, invalid: false, readonly: false })
      const set = await bridge.act([{ id: one?.id, action: 'set', value: '2030-01' }])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '', to: '2030-01' } },
      })
      expect(free).toHaveBeenLastCalledWith('2030-01')
      const cleared = await bridge.act([{ id: two?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: '' } } })
      expect(held).toHaveBeenLastCalledWith(null)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses text that is not a month, a month outside the bounds, and a read-only field', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <>
          <MonthInput aria-label="Expires" min="2026-03" max="2027-02" onChange={onChange} />
          <MonthInput aria-label="Fixed" readOnly defaultValue="2029-08" onChange={onChange} />
        </>,
      )
      const [bounded, fixed] = bridge.snapshot().members
      for (const [id, text, reason] of [
        [bounded?.id, '2026/05', 'YYYY-MM'],
        [bounded?.id, '2027-03', 'outside the months'],
        [fixed?.id, '2029-09', 'read-only'],
      ] as const) {
        const { results } = await bridge.act([{ id, action: 'set', value: text }])
        expect(results[0], text).toMatchObject({
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
