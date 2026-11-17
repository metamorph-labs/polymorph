import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from './SegmentedControl'

/**
 * SegmentedControl, in a real browser.
 *
 * These tests cover what makes this a single control rather than a form list. It has a
 * value even with no props. It has one tab stop, and arrows move both focus and
 * selection (RadioGroup's roving focus, which is allowed here because the control
 * always has a value and changing it is cheap). Values apply immediately, as in Switch.
 */

beforeAll(installTestTheme)

const SCOPE: SegmentedControlOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
]

const track = () => screen.getByRole('radiogroup')
const segment = (name: string) => screen.getByRole('radio', { name }) as HTMLButtonElement

function mount(overrides: Partial<SegmentedControlProps> = {}) {
  return render(<SegmentedControl options={SCOPE} label="Queue scope" {...overrides} />)
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SegmentedControlProps>(true)
  })
})

describe('always has a value', () => {
  it('selects the first option when uncontrolled with no defaultValue', () => {
    mount()
    expect(segment('Open').dataset['state']).toBe('checked')
    expect(segment('Open').getAttribute('aria-checked')).toBe('true')
  })

  it('starts from defaultValue when given one', () => {
    mount({ defaultValue: 'pending' })
    expect(segment('Pending').dataset['state']).toBe('checked')
    expect(segment('Open').dataset['state']).toBe('unchecked')
  })
})

describe('the control applies values immediately', () => {
  it('applies a click as the value, with no submit step', async () => {
    const onChange = vi.fn()
    mount({ onChange })
    await userEvent.click(segment('Closed'))
    expect(onChange).toHaveBeenLastCalledWith('closed')
    expect(segment('Closed').dataset['state']).toBe('checked')
  })

  it('follows a controlled value without owning it', async () => {
    const onChange = vi.fn()
    mount({ value: 'pending', onChange })
    expect(segment('Pending').dataset['state']).toBe('checked')

    await userEvent.click(segment('Open'))
    expect(onChange).toHaveBeenLastCalledWith('open')
    // Controlled: nothing changes until the owner re-renders.
    expect(segment('Open').dataset['state']).toBe('unchecked')
  })
})

describe('one tab stop, arrows move focus and selection', () => {
  it.skipIf(TAB_PASSES_BUTTONS)('tabs to the checked segment, not to every segment', async () => {
    render(
      <>
        <SegmentedControl options={SCOPE} defaultValue="pending" label="Queue scope" />
        <button type="button">after</button>
      </>,
    )
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(segment('Pending'))
    await userEvent.keyboard('{Tab}')
    // The whole track is one tab stop, so the next Tab leaves it.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'after' }))
  })

  it('moves selection with the arrow, not just focus', async () => {
    mount()
    segment('Open').focus()
    await userEvent.keyboard('{ArrowRight}')
    // Radix moves focus in a task after the keydown, so the test waits for it. The
    // selection is read once focus has moved.
    await vi.waitFor(() => expect(document.activeElement).toBe(segment('Pending')))
    expect(segment('Pending').dataset['state']).toBe('checked')
  })

  it('selects on the arrow even when the key is up before the focus has moved', async () => {
    mount()
    const open = segment('Open')
    open.focus()
    // A tap whose keyup arrives before Radix's deferred focus move, which is what a
    // busy main thread does to a real `{ArrowRight}`. Radix selects on focus only while
    // its arrow flag is set, and the document keyup has already cleared it. Dispatching
    // both events back to back makes the race certain rather than occasional.
    const arrow = { key: 'ArrowRight', bubbles: true }
    open.dispatchEvent(new KeyboardEvent('keydown', arrow))
    open.dispatchEvent(new KeyboardEvent('keyup', arrow))
    await vi.waitFor(() => expect(document.activeElement).toBe(segment('Pending')))
    expect(segment('Pending').dataset['state']).toBe('checked')
  })
})

describe('disabled, per option and whole', () => {
  it('marks a disabled option and makes it unreachable', () => {
    // Checked by attribute rather than by clicking, as in Radio's test. A disabled
    // control is not clickable, which is what this test checks.
    mount({
      options: [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed', disabled: true },
      ],
    })
    expect(segment('Closed').hasAttribute('data-disabled')).toBe(true)
    expect(segment('Closed').disabled).toBe(true)
    expect(segment('Closed').dataset['state']).toBe('unchecked')
  })

  it('disables the whole track from the group prop', () => {
    mount({ disabled: true })
    expect(track().hasAttribute('data-disabled')).toBe(true)
    expect(segment('Open').disabled).toBe(true)
  })
})

describe('accessibility', () => {
  it('is a radiogroup named by `label`, segments named by their option labels', () => {
    mount()
    expect(track().getAttribute('aria-label')).toBe('Queue scope')
    expect(segment('Open').textContent).toBe('Open')
  })

  it('keeps per-option icons decorative, so the label text is the whole name', () => {
    mount({
      options: [
        { value: 'light', label: 'Light', icon: 'mode-light' },
        { value: 'dark', label: 'Dark', icon: 'mode-dark' },
      ],
    })
    const withIcon = segment('Light')
    const svg = withIcon.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
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

  /** The application around a controlled control: it holds `value` and sets it from the handler. */
  function Held({ onChange }: { onChange: (next: string) => void }) {
    const [value, setValue] = useState('open')
    return (
      <SegmentedControl
        options={SCOPE}
        label="Inbox scope"
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    )
  }

  it('reads the first option with no value props, and chooses in both forms', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      render(<SegmentedControl options={SCOPE} label="Queue scope" onChange={free} />)
      render(<Held onChange={held} />)
      const [queue, inbox] = bridge.snapshot().members
      expect(queue).toMatchObject({
        member: 'SegmentedControl',
        name: 'Queue scope',
        state: { value: 'open', disabled: false },
        actions: [{ name: 'choose', argument: 'id' }],
      })

      // Uncontrolled: the member holds the value, and the segment shows it.
      const chosen = await asAgent(() =>
        bridge.act([{ id: queue?.id, action: 'choose', value: 'closed' }]),
      )
      expect(chosen.results[0]).toEqual({
        ok: true,
        id: queue?.id,
        changed: { value: { from: 'open', to: 'closed' } },
      })
      expect(free).toHaveBeenLastCalledWith('closed')
      const track = screen.getByRole('radiogroup', { name: 'Queue scope' })
      expect(within(track).getByRole('radio', { name: 'Closed' }).dataset['state']).toBe('checked')

      // Controlled: the action calls the handler, and the application's value is what renders.
      const controlled = await asAgent(() =>
        bridge.act([{ id: inbox?.id, action: 'choose', value: 'pending' }]),
      )
      expect(controlled.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: 'open', to: 'pending' } },
      })
      expect(held).toHaveBeenLastCalledWith('pending')
    } finally {
      bridge.dispose()
    }
  })
})
