import { Time } from '@internationalized/date'
import { render } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Input } from './Input'
import { TimeInput, type TimeInputProps } from './TimeInput'
import { tokenColor } from './token-probe'

/**
 * TimeInput in a real browser. These tests cover the substrate's behaviour (segment
 * order from the locale, arrows that edit without opening anything, since there is
 * nothing to open), and the recipe comparison against Input that `time-input.md` cites
 * instead of restating.
 */

const NINE = new Time(9, 0)

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const segments = (field: HTMLElement) =>
  [...field.querySelectorAll('[data-segment]')] as HTMLElement[]

const segmentTypes = (field: HTMLElement) =>
  segments(field).map((segment) => segment.dataset['segment'])

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TimeInputProps>(true)
  })
})

describe('TimeInput — the field', () => {
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
      expect(shared(mount(<TimeInput size={size} aria-label="Opens at" />))).toEqual(
        shared(mount(<Input size={size} aria-label="Subject" />)),
      )
    })
  }

  it('is a named group of spinbuttons, with nothing to open', () => {
    const field = mount(<TimeInput locale="en-US" aria-label="Opens at" />)
    expect(field.getAttribute('role')).toBe('group')
    expect(field.querySelectorAll('[role="spinbutton"]').length).toBeGreaterThanOrEqual(2)
    // No trigger, no popup, no glyph. The segments are the whole control, and a button
    // that opens nothing would mislead (the spec's reason for having no icon).
    expect(field.querySelector('button')).toBeNull()
    expect(field.querySelector('svg')).toBeNull()
  })

  it('shows its own patterns while empty, in the muted role', () => {
    const field = mount(<TimeInput locale="en-US" aria-label="Opens at" />)
    for (const segment of segments(field)) {
      expect(segment.dataset['placeholder']).toBe('')
      expect(getComputedStyle(segment).color).toBe(tokenColor('--pm-text-muted'))
    }
  })

  it('renders the dayPeriod as a segment among digits at a 12-hour locale', () => {
    const field = mount(<TimeInput locale="en-US" defaultValue={NINE} aria-label="Opens at" />)
    expect(segmentTypes(field)).toEqual(['hour', 'minute', 'dayPeriod'])
    expect(field.textContent).toContain('AM')
  })

  it('drops the dayPeriod under hourCycle 24', () => {
    const field = mount(
      <TimeInput locale="en-US" hourCycle={24} defaultValue={NINE} aria-label="Opens at" />,
    )
    expect(segmentTypes(field)).toEqual(['hour', 'minute'])
  })

  it('uses 24-hour time when the locale does', () => {
    const field = mount(<TimeInput locale="de-DE" defaultValue={NINE} aria-label="Öffnet um" />)
    expect(segmentTypes(field)).toEqual(['hour', 'minute'])
  })

  it('drops the minute segment at hour granularity', () => {
    const field = mount(
      <TimeInput locale="en-US" granularity="hour" defaultValue={NINE} aria-label="Quiet from" />,
    )
    expect(segmentTypes(field)).toEqual(['hour', 'dayPeriod'])
  })

  it('tints the focused segment without selecting it', async () => {
    const field = mount(<TimeInput locale="en-US" defaultValue={NINE} aria-label="Opens at" />)
    const hour = field.querySelector('[data-segment="hour"]') as HTMLElement
    hour.focus()
    await vi.waitFor(() => {
      expect(getComputedStyle(hour).backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
    })
  })
})

describe('TimeInput — editing', () => {
  it('steps with arrows and reports a Time', async () => {
    const onChange = vi.fn()
    const field = mount(
      <TimeInput locale="en-US" defaultValue={NINE} onChange={onChange} aria-label="Opens at" />,
    )
    const hour = field.querySelector('[data-segment="hour"]') as HTMLElement
    hour.focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalled()
    const value = onChange.mock.calls[0]?.[0] as Time
    expect(value.hour).toBe(10)
    expect(value.minute).toBe(0)
    expect(document.activeElement).toBe(hour)
  })

  it('keeps finer fields of a supplied value unchanged', async () => {
    // The field edits down to its granularity. Seconds the app put in its Time are never
    // silently set to zero (the spec's value row).
    const onChange = vi.fn()
    const field = mount(
      <TimeInput
        locale="en-US"
        defaultValue={new Time(9, 0, 42)}
        onChange={onChange}
        aria-label="Opens at"
      />,
    )
    ;(field.querySelector('[data-segment="minute"]') as HTMLElement).focus()
    await userEvent.keyboard('{ArrowUp}')

    const value = onChange.mock.calls[0]?.[0] as Time
    expect(value.minute).toBe(1)
    expect(value.second).toBe(42)
  })

  it('keeps its text under readOnly and ignores the arrows', async () => {
    const onChange = vi.fn()
    const field = mount(
      <TimeInput
        locale="en-US"
        readOnly
        defaultValue={NINE}
        onChange={onChange}
        aria-label="Opens at"
      />,
    )
    const hour = field.querySelector('[data-segment="hour"]') as HTMLElement
    hour.focus()
    expect(document.activeElement).toBe(hour)
    await userEvent.keyboard('{ArrowUp}')

    expect(onChange).not.toHaveBeenCalled()
    expect(field.textContent).toContain('9')
  })

  it('serializes the ISO-8601 time under its name', () => {
    const { container } = render(
      <form>
        <TimeInput name="opens" defaultValue={new Time(9, 30)} aria-label="Opens at" />
      </form>,
    )
    expect(new FormData(container.firstElementChild as HTMLFormElement).get('opens')).toBe(
      '09:30:00',
    )
  })
})

/**
 * An agent sets the time through the bridge in `Time`'s own form, as the spec's `agent` fence
 * declares (`design/components/time-input.md`, Agent), and `onChange` reports a `Time`.
 */
describe('an agent', () => {
  it('sets and clears the time, and refuses a time finer than the field', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <>
          <TimeInput aria-label="Opens at" defaultValue={NINE} onChange={onChange} />
          <TimeInput aria-label="Quiet from" granularity="hour" onChange={onChange} />
          <TimeInput aria-label="Fixed" readOnly defaultValue={NINE} onChange={onChange} />
        </>,
      )
      const [opens, quiet, fixed] = bridge.snapshot().members
      expect(opens?.state).toEqual({
        value: '09:00:00',
        disabled: false,
        invalid: false,
        readonly: false,
      })
      const set = await bridge.act([{ id: opens?.id, action: 'set', value: '17:30:00' }])
      expect(set.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '09:00:00', to: '17:30:00' } },
      })
      expect(onChange).toHaveBeenLastCalledWith(new Time(17, 30))
      const cleared = await bridge.act([{ id: opens?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: '' } } })
      expect(onChange).toHaveBeenLastCalledWith(null)

      const calls = onChange.mock.calls.length
      for (const [id, text, reason] of [
        [quiet?.id, '22:30:00', 'whole hours'],
        [opens?.id, '9:30', 'HH:MM:SS'],
        [fixed?.id, '10:00:00', 'read-only'],
      ] as const) {
        const { results } = await bridge.act([{ id, action: 'set', value: text }])
        expect(results[0], text).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(reason) },
        })
      }
      expect(onChange).toHaveBeenCalledTimes(calls)
    } finally {
      bridge.dispose()
    }
  })
})
