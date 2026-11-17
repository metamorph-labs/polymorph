import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Switch, type SwitchProps } from './Switch'
import { tokenColor, tokenLength } from './token-probe'

/**
 * Switch. These tests cover two things: the state uses this vocabulary's values
 * (`on`/`off`, not Radix's `checked`/`unchecked`), and the thumb's position, not its
 * colour, shows the state.
 */

beforeAll(installTestTheme)

/** RTL's container: attached to the body so the cascade applies, and cleaned up by RTL. */
function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const control = () => screen.getByRole('switch')
const thumb = () => control().firstElementChild as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SwitchProps>(true)
  })
})

describe('semantics', () => {
  it('is a real switch with a real label', () => {
    mount(<Switch label="Desktop notifications" />)
    expect(screen.getByRole('switch', { name: 'Desktop notifications' })).toBeTruthy()
    expect(control().getAttribute('aria-checked')).toBe('false')
  })

  it('takes its name from aria-label when the context supplies the label', () => {
    mount(<Switch aria-label="Desktop notifications" />)
    expect(screen.getByRole('switch', { name: 'Desktop notifications' })).toBeTruthy()
  })
})

describe('the state uses this vocabulary’s values', () => {
  it('sets on/off on the track, overriding Radix’s own checked/unchecked', () => {
    mount(<Switch label="x" />)
    expect(control().dataset['state']).toBe('off')

    render(<Switch defaultChecked label="y" />)
    const all = screen.getAllByRole('switch')
    expect((all[all.length - 1] as HTMLElement).dataset['state']).toBe('on')
  })

  it('copies it onto the row, so the root reports the state', () => {
    expect(mount(<Switch label="x" />).dataset['state']).toBe('off')
    expect(mount(<Switch defaultChecked label="x" />).dataset['state']).toBe('on')
  })

  it('updates it in both places after a toggle', async () => {
    const row = mount(<Switch label="Desktop notifications" />)
    await userEvent.click(control())
    expect(control().dataset['state']).toBe('on')
    expect(row.dataset['state']).toBe('on')
  })
})

describe('toggling', () => {
  it('toggles from the label row', async () => {
    const onCheckedChange = vi.fn()
    mount(<Switch label="Desktop notifications" onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByText('Desktop notifications'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('toggles once per click on the track', async () => {
    const onCheckedChange = vi.fn()
    mount(<Switch label="Desktop notifications" onCheckedChange={onCheckedChange} />)
    await userEvent.click(control())
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
  })

  it('toggles from the keyboard', async () => {
    mount(<Switch label="Desktop notifications" />)
    control().focus()
    await userEvent.keyboard(' ')
    expect(control().getAttribute('aria-checked')).toBe('true')
  })

  it('does not toggle when disabled', () => {
    const onCheckedChange = vi.fn()
    const row = mount(<Switch disabled label="x" onCheckedChange={onCheckedChange} />)
    row.click()
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(control().dataset['disabled']).toBe('')
  })
})

describe('position is the primary signal', () => {
  it('moves the thumb to symmetric end positions', () => {
    mount(<Switch label="x" />)
    const off = thumb().getBoundingClientRect()
    const trackOff = control().getBoundingClientRect()

    render(<Switch defaultChecked label="y" />)
    const all = screen.getAllByRole('switch')
    const onTrack = all[all.length - 1] as HTMLElement
    const on = (onTrack.firstElementChild as HTMLElement).getBoundingClientRect()
    const trackOn = onTrack.getBoundingClientRect()

    expect(on.left).toBeGreaterThan(off.left)
    // Symmetric ends: the gap left of the off thumb equals the gap right of the on
    // thumb. The border-box calculation exists for this.
    expect(trackOn.right - on.right).toBeCloseTo(off.left - trackOff.left, 1)
  })

  it('uses all of the track’s free space, so the two ends are clearly different', () => {
    mount(<Switch label="x" />)
    const track = control()
    const off = thumb().getBoundingClientRect()
    const style = getComputedStyle(track)
    const inset = Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft)
    const free = track.getBoundingClientRect().width - 2 * inset - off.width

    render(<Switch defaultChecked label="y" />)
    const all = screen.getAllByRole('switch')
    const on = (
      (all[all.length - 1] as HTMLElement).firstElementChild as HTMLElement
    ).getBoundingClientRect()

    expect(on.left - off.left).toBeCloseTo(free, 1)
  })
})

describe('recipe', () => {
  it('fills the track from the accent role when on', () => {
    mount(<Switch defaultChecked label="x" />)
    expect(getComputedStyle(control()).backgroundColor).toBe(tokenColor('--pm-accent-bg'))
    expect(getComputedStyle(thumb()).backgroundColor).toBe(tokenColor('--pm-accent-contrast'))
  })

  it('keeps the off track subtle, with a raised thumb', () => {
    mount(<Switch label="x" />)
    expect(getComputedStyle(control()).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
    expect(getComputedStyle(thumb()).backgroundColor).toBe(tokenColor('--pm-bg-surface'))
    expect(getComputedStyle(thumb()).boxShadow).not.toBe('none')
  })

  it('keeps the pill shape, whatever the geometry axis', () => {
    mount(<Switch label="x" />)
    const radius = Number.parseFloat(getComputedStyle(control()).borderTopLeftRadius)
    expect(radius).toBeGreaterThanOrEqual(control().getBoundingClientRect().height / 2)
  })

  it('dims the label with the control', () => {
    mount(<Switch disabled label="Desktop notifications" />)
    const label = screen.getByText('Desktop notifications')
    expect(getComputedStyle(label).color).toBe(tokenColor('--pm-text-disabled'))
  })

  it('draws the ring on the track, not on the row', () => {
    const row = mount(<Switch label="x" />)
    control().focus({ focusVisible: true } as FocusOptions)
    expect(getComputedStyle(control()).outlineStyle).toBe('solid')
    expect(getComputedStyle(row).outlineStyle).toBe('none')
  })
})

describe('required', () => {
  it('mirrors the injected aria-required, and the row shows the marker', () => {
    // A row-labelled field has no field-level label row, so FormField has nowhere to
    // put the ` *`, and the control renders it.
    const row = mount(<Switch aria-required label="Accept the terms" />)
    expect(control().getAttribute('aria-required')).toBe('true')
    expect(row.dataset['required']).toBe('')

    const marker = getComputedStyle(screen.getByText('Accept the terms'), '::after')
    expect(marker.content).toContain('*')
    expect(marker.color).toBe(tokenColor('--pm-danger-text'))
  })

  it('shows no marker when the field is not required', () => {
    mount(<Switch label="Accept the terms" />)
    expect(getComputedStyle(screen.getByText('Accept the terms'), '::after').content).toBe('none')
  })
})

describe('the minimum target size', () => {
  it('makes the row the hit target when there is a label', () => {
    const row = mount(<Switch label="Desktop notifications" />)
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      Number.parseFloat(tokenLength('--pm-control-height-sm')),
    )
  })

  it('grows a bare track’s hit area without affecting layout', () => {
    const track = mount(<Switch aria-label="Desktop notifications" />)
    const laidOut = track.getBoundingClientRect()
    const inset = Number.parseFloat(getComputedStyle(track, '::before').insetBlockStart || '0')

    expect(laidOut.height).toBeLessThan(24)
    expect(laidOut.height - 2 * inset).toBeGreaterThanOrEqual(24)
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

  /** The application around a controlled Switch: it holds `checked` and sets it from the handler. */
  function Held({ onCheckedChange }: { onCheckedChange: (next: boolean) => void }) {
    const [checked, setChecked] = useState(false)
    return (
      <Switch
        label="Email digest"
        checked={checked}
        onCheckedChange={(next) => {
          setChecked(next)
          onCheckedChange(next)
        }}
      />
    )
  }

  it('reads, turns on and turns off an uncontrolled and a controlled Switch', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      render(<Switch label="Desktop notifications" onCheckedChange={free} />)
      render(<Held onCheckedChange={held} />)
      const track = (name: string) => screen.getByRole('switch', { name })

      const [desktop, digest] = bridge.snapshot().members
      expect(desktop).toMatchObject({
        member: 'Switch',
        name: 'Desktop notifications',
        state: { checked: false, disabled: false },
        actions: [{ name: 'check' }, { name: 'uncheck' }],
      })

      // Uncontrolled: the member holds the value, and the track and the row show it.
      const on = await asAgent(() => bridge.act([{ id: desktop?.id, action: 'check' }]))
      expect(on.results).toEqual([
        { ok: true, id: desktop?.id, changed: { checked: { from: false, to: true } } },
      ])
      expect(track('Desktop notifications').getAttribute('aria-checked')).toBe('true')
      expect(track('Desktop notifications').dataset['state']).toBe('on')
      expect(free).toHaveBeenLastCalledWith(true)
      await asAgent(() => bridge.act([{ id: desktop?.id, action: 'uncheck' }]))
      expect(track('Desktop notifications').getAttribute('aria-checked')).toBe('false')
      expect(free).toHaveBeenLastCalledWith(false)

      // Controlled: the action calls the handler, and the application's value is what renders.
      const controlled = await asAgent(() => bridge.act([{ id: digest?.id, action: 'check' }]))
      expect(controlled.results[0]).toEqual({
        ok: true,
        id: digest?.id,
        changed: { checked: { from: false, to: true } },
      })
      expect(track('Email digest').getAttribute('aria-checked')).toBe('true')
      expect(held).toHaveBeenLastCalledWith(true)

      // A person's press after an agent's change starts from the value on screen.
      await userEvent.click(track('Desktop notifications'))
      expect(free).toHaveBeenLastCalledWith(true)
      expect(bridge.snapshot().members[0]?.state).toEqual({ checked: true, disabled: false })
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a disabled Switch and lists no action on it', async () => {
    const bridge = createAgentBridge()
    try {
      const onCheckedChange = vi.fn()
      render(<Switch disabled label="SMS alerts" onCheckedChange={onCheckedChange} />)
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
})
